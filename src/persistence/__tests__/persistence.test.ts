import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { CharacterCompanionDb, setDb, db } from '../db';
import { characters, inventory, journal, notes } from '../repositories';
import { createInventoryItem, createJournalEntry, createNote, SCHEMA_VERSION } from '../../domain/factories';
import { exportBundle, importBundle, BUNDLE_FORMAT } from '../transfer';

/**
 * Persistence tests concentrate on the operations that can silently corrupt a character:
 * duplication (shared ids would make two characters edit each other), soft delete (a hard
 * delete cannot propagate to other devices), and import (must never overwrite existing data).
 */

let counter = 0;

beforeEach(async () => {
  // A fresh database per test, so ordering can never leak state between them.
  const fresh = new CharacterCompanionDb(`test-db-${counter++}`);
  setDb(fresh);
  await fresh.open();
});

async function seedCharacter(name = 'Thorin') {
  const character = await characters.create({
    identity: {
      name,
      pronouns: 'he/him',
      alignment: 'lawful-good',
      description: '',
      personalityTraits: [],
      ideals: [],
      bonds: [],
      flaws: [],
      backstory: 'Born under a mountain.',
    },
  });
  await inventory.save(createInventoryItem(character.id, { name: 'Warhammer', category: 'weapon' }));
  await journal.save(
    createJournalEntry(character.id, 'private', { title: 'Secret doubts', body: 'I am afraid.' }),
  );
  await journal.save(
    createJournalEntry(character.id, 'public', { title: 'Session 1', body: 'We met in a tavern.' }),
  );
  await notes.save(createNote(character.id, 'npc', 'public', { name: 'Gandalf' }));
  return character;
}

describe('character repository', () => {
  it('creates and reads back a character', async () => {
    const created = await seedCharacter();
    const found = await characters.get(created.id);
    expect(found?.identity.name).toBe('Thorin');
    // Asserted against the constant, not a literal, so a schema bump does not fail this test.
    expect(found?.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('refreshes updatedAt on every write', async () => {
    const created = await characters.create();
    const first = created.updatedAt;
    await new Promise((r) => setTimeout(r, 2));
    const saved = await characters.save({ ...created, xp: 100 });
    expect(saved.updatedAt).toBeGreaterThan(first);
  });

  it('lists most-recently-updated first', async () => {
    await seedCharacter('First');
    await new Promise((r) => setTimeout(r, 2));
    await seedCharacter('Second');
    const list = await characters.list();
    expect(list[0]?.identity.name).toBe('Second');
  });
});

describe('soft delete', () => {
  it('tombstones rather than dropping, and hides from listings', async () => {
    const character = await seedCharacter();
    await characters.remove(character.id);

    expect(await characters.get(character.id)).toBeNull();
    expect(await characters.list()).toHaveLength(0);

    // The row survives with a tombstone, so the deletion can propagate once sync exists.
    const raw = await db().characters.get(character.id);
    expect(raw).toBeDefined();
    expect(raw?.deletedAt).toBeTypeOf('number');
  });

  it('cascades to a character\'s children', async () => {
    const character = await seedCharacter();
    await characters.remove(character.id);

    expect(await inventory.list(character.id)).toHaveLength(0);
    expect(await journal.list(character.id)).toHaveLength(0);
    expect(await notes.list(character.id)).toHaveLength(0);
  });
});

describe('duplication', () => {
  it('copies children under new ids so edits do not bleed across copies', async () => {
    const original = await seedCharacter();
    const copy = await characters.duplicate(original.id);
    expect(copy).not.toBeNull();
    if (!copy) return;

    expect(copy.id).not.toBe(original.id);
    expect(copy.identity.name).toBe('Thorin (copy)');

    const originalItems = await inventory.list(original.id);
    const copiedItems = await inventory.list(copy.id);

    expect(copiedItems).toHaveLength(originalItems.length);
    // The critical assertion: no id is shared between the two characters' items.
    const sharedIds = copiedItems.filter((c) => originalItems.some((o) => o.id === c.id));
    expect(sharedIds).toEqual([]);
  });

  it('leaves the original untouched', async () => {
    const original = await seedCharacter();
    await characters.duplicate(original.id);
    const reloaded = await characters.get(original.id);
    expect(reloaded?.identity.name).toBe('Thorin');
  });

  it('starts the copy unarchived', async () => {
    const original = await seedCharacter();
    await characters.setArchived(original.id, true);
    const copy = await characters.duplicate(original.id);
    expect(copy?.archived).toBe(false);
  });
});

describe('archiving', () => {
  it('keeps archived characters readable', async () => {
    const character = await seedCharacter();
    await characters.setArchived(character.id, true);
    const found = await characters.get(character.id);
    expect(found?.archived).toBe(true);
    // Archiving is not deletion -- the character stays in the library, just filtered by the UI.
    expect(await characters.list()).toHaveLength(1);
  });
});

describe('export and import', () => {
  it('round-trips a character with all of its children', async () => {
    const original = await seedCharacter();
    const bundle = await exportBundle(original.id);

    expect(bundle.format).toBe(BUNDLE_FORMAT);
    expect(bundle.characters).toHaveLength(1);
    expect(bundle.inventoryItems).toHaveLength(1);
    expect(bundle.journalEntries).toHaveLength(2);
    expect(bundle.notes).toHaveLength(1);

    const result = await importBundle(bundle);
    expect(result.charactersImported).toBe(1);
    expect(result.entriesImported).toBe(2);

    // Import is additive: the original and the imported copy both exist.
    expect(await characters.list()).toHaveLength(2);
  });

  it('preserves journal visibility across a round trip', async () => {
    const original = await seedCharacter();
    await importBundle(await exportBundle(original.id));

    const all = await characters.list();
    const imported = all.find((c) => c.id !== original.id);
    expect(imported).toBeDefined();
    if (!imported) return;

    const entries = await journal.list(imported.id);
    expect(entries.filter((e) => e.visibility === 'private')).toHaveLength(1);
    expect(entries.filter((e) => e.visibility === 'public')).toHaveLength(1);
  });

  it('never overwrites the source when re-importing its own bundle', async () => {
    const original = await seedCharacter();
    const bundle = await exportBundle(original.id);
    await importBundle(bundle);

    const reloaded = await characters.get(original.id);
    expect(reloaded).not.toBeNull();
    expect(reloaded?.identity.backstory).toBe('Born under a mountain.');
  });

  it('rejects data that is not a bundle', async () => {
    await expect(importBundle({ hello: 'world' })).rejects.toThrow(/not a valid character bundle/i);
  });

  it('refuses bundles from a newer app version', async () => {
    const bundle = await exportBundle();
    await expect(importBundle({ ...bundle, bundleVersion: 99 })).rejects.toThrow(/newer version/i);
  });

  it('exports the whole library when no id is given', async () => {
    await seedCharacter('One');
    await seedCharacter('Two');
    const bundle = await exportBundle();
    expect(bundle.characters).toHaveLength(2);
  });

  it('excludes deleted records from an export', async () => {
    const keep = await seedCharacter('Keeper');
    const drop = await seedCharacter('Doomed');
    await characters.remove(drop.id);

    const bundle = await exportBundle();
    expect(bundle.characters).toHaveLength(1);
    expect((bundle.characters[0] as { id: string }).id).toBe(keep.id);
  });
});
