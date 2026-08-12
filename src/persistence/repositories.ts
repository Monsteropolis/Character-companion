import { db } from './db';
import { SCHEMA_VERSION, createCharacter, newId } from '../domain/factories';
import { migrateCharacter } from './migrations';
import type {
  Character,
  InventoryItem,
  JournalEntry,
  Note,
  Persisted,
  CustomContent,
  PortraitAsset,
  StoredAsset,
  LevelUpRecord,
} from '../domain/types';

/**
 * Repositories.
 *
 * All persistence goes through here so that two invariants hold everywhere without each caller
 * remembering them: `updatedAt` is refreshed on every write, and deletes are soft (tombstoned)
 * so they can propagate to other devices once sync exists.
 */

function touch<T extends Persisted>(record: T): T {
  return { ...record, updatedAt: Date.now(), schemaVersion: SCHEMA_VERSION };
}

function isLive<T extends Persisted>(record: T): boolean {
  return record.deletedAt === null;
}

export const characters = {
  async list(): Promise<Character[]> {
    const all = await db().characters.toArray();
    // Migrated on read, so a character saved by an older build is upgraded the moment it loads
    // and no consumer ever sees an outdated shape.
    return all.filter(isLive).map(migrateCharacter).sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async get(id: string): Promise<Character | null> {
    const found = await db().characters.get(id);
    return found && isLive(found) ? migrateCharacter(found) : null;
  },

  async save(character: Character): Promise<Character> {
    const next = touch(character);
    await db().characters.put(next);
    return next;
  },

  async create(partial: Partial<Character> = {}): Promise<Character> {
    return this.save(createCharacter(partial));
  },

  /**
   * Duplicate a character and everything belonging to it.
   *
   * Child records are re-keyed rather than copied verbatim -- sharing ids between two characters
   * would make edits to one silently mutate the other.
   */
  async duplicate(id: string): Promise<Character | null> {
    const source = await this.get(id);
    if (!source) return null;

    const copy: Character = {
      ...structuredClone(source),
      id: newId(),
      updatedAt: Date.now(),
      deletedAt: null,
      identity: { ...source.identity, name: `${source.identity.name || 'Unnamed'} (copy)` },
      archived: false,
    };

    const [items, entries, noteRows, assets] = await Promise.all([
      inventory.list(id),
      journal.list(id),
      notes.list(id),
      assetRepo.listForCharacter(id),
    ]);

    // Assets are re-keyed first so the character's portrait pointer can be remapped.
    const assetIdMap = new Map<string, string>();
    const copiedAssets = assets.map((a) => {
      const nextId = newId();
      assetIdMap.set(a.id, nextId);
      return { ...a, id: nextId, characterId: copy.id, updatedAt: Date.now() };
    });

    copy.portraitId = copy.portraitId ? assetIdMap.get(copy.portraitId) ?? null : null;

    await db().transaction(
      'rw',
      [db().characters, db().inventoryItems, db().journalEntries, db().notes, db().assets],
      async () => {
        await db().characters.put(copy);
        await db().inventoryItems.bulkPut(
          items.map((i) => ({ ...i, id: newId(), characterId: copy.id, updatedAt: Date.now() })),
        );
        await db().journalEntries.bulkPut(
          entries.map((e) => ({ ...e, id: newId(), characterId: copy.id, updatedAt: Date.now() })),
        );
        await db().notes.bulkPut(
          noteRows.map((n) => ({ ...n, id: newId(), characterId: copy.id, updatedAt: Date.now() })),
        );
        await db().assets.bulkPut(copiedAssets);
      },
    );

    return copy;
  },

  async setArchived(id: string, archived: boolean): Promise<void> {
    const found = await this.get(id);
    if (!found) return;
    await this.save({ ...found, archived });
  },

  /** Soft delete: the character and its children are tombstoned, not dropped. */
  async remove(id: string): Promise<void> {
    const now = Date.now();
    await db().transaction(
      'rw',
      [db().characters, db().inventoryItems, db().journalEntries, db().notes, db().assets],
      async () => {
        const character = await db().characters.get(id);
        if (character) await db().characters.put({ ...character, deletedAt: now, updatedAt: now });

        // Tombstoned one table at a time: iterating a heterogeneous array of Dexie tables
        // collapses their generics into an uncallable union.
        // `characterId` is nullable on assets, which can exist unattached to any character.
        const tombstone = async <T extends Persisted & { characterId: string | null }>(
          table: { where: (k: string) => { equals: (v: string) => { toArray: () => Promise<T[]> } }; bulkPut: (rows: T[]) => Promise<unknown> },
        ): Promise<void> => {
          const rows = await table.where('characterId').equals(id).toArray();
          await table.bulkPut(rows.map((r) => ({ ...r, deletedAt: now, updatedAt: now })));
        };

        await tombstone<InventoryItem>(db().inventoryItems as never);
        await tombstone<JournalEntry>(db().journalEntries as never);
        await tombstone<Note>(db().notes as never);
        await tombstone<StoredAsset>(db().assets as never);
      },
    );
  },
};

function childRepo<T extends Persisted & { characterId: string }>(
  table: () => { where: (k: string) => { equals: (v: string) => { toArray: () => Promise<T[]> } }; put: (v: T) => Promise<unknown>; get: (id: string) => Promise<T | undefined> },
) {
  return {
    async list(characterId: string): Promise<T[]> {
      const rows = await table().where('characterId').equals(characterId).toArray();
      return rows.filter(isLive);
    },
    async get(id: string): Promise<T | null> {
      const found = await table().get(id);
      return found && isLive(found) ? found : null;
    },
    async save(record: T): Promise<T> {
      const next = touch(record);
      await table().put(next);
      return next;
    },
    async remove(id: string): Promise<void> {
      const found = await table().get(id);
      if (!found) return;
      await table().put({ ...found, deletedAt: Date.now(), updatedAt: Date.now() });
    },
  };
}

export const inventory = childRepo<InventoryItem>(() => db().inventoryItems as never);
export const journal = childRepo<JournalEntry>(() => db().journalEntries as never);
export const notes = childRepo<Note>(() => db().notes as never);
export const levelUps = childRepo<LevelUpRecord>(() => db().levelUpRecords as never);

export const assetRepo = {
  async listForCharacter(characterId: string): Promise<StoredAsset[]> {
    const rows = await db().assets.where('characterId').equals(characterId).toArray();
    return rows.filter(isLive);
  },
  async get(id: string): Promise<StoredAsset | null> {
    const found = await db().assets.get(id);
    return found && isLive(found) ? found : null;
  },
  async save(asset: StoredAsset): Promise<StoredAsset> {
    const next = touch(asset);
    await db().assets.put(next);
    return next;
  },
  async remove(id: string): Promise<void> {
    const found = await db().assets.get(id);
    if (!found) return;
    await db().assets.put({ ...found, deletedAt: Date.now(), updatedAt: Date.now() });
  },
};

export const portraits = {
  async listForCharacter(characterId: string): Promise<PortraitAsset[]> {
    const rows = await db().portraits.where('characterId').equals(characterId).toArray();
    return rows.filter(isLive);
  },
  async get(id: string): Promise<PortraitAsset | null> {
    const found = await db().portraits.get(id);
    return found && isLive(found) ? found : null;
  },
  async save(portrait: PortraitAsset): Promise<PortraitAsset> {
    const next = touch(portrait);
    await db().portraits.put(next);
    return next;
  },
  /** Removes the portrait and the image blobs only it referenced. */
  async remove(id: string): Promise<void> {
    const found = await db().portraits.get(id);
    if (!found) return;
    const now = Date.now();
    await db().portraits.put({ ...found, deletedAt: now, updatedAt: now });

    const blobIds = [found.blobId, ...found.states.map((s) => s.blobId)].filter(
      (b): b is string => Boolean(b),
    );
    for (const blobId of blobIds) await assetRepo.remove(blobId);
  },
};

export const customContent = {
  async list(): Promise<CustomContent[]> {
    const rows = await db().customContent.toArray();
    return rows.filter(isLive);
  },
  async byKind(kind: CustomContent['kind']): Promise<CustomContent[]> {
    const rows = await db().customContent.where('kind').equals(kind).toArray();
    return rows.filter(isLive);
  },
  async get(id: string): Promise<CustomContent | null> {
    const found = await db().customContent.get(id);
    return found && isLive(found) ? found : null;
  },
  async save(record: CustomContent): Promise<CustomContent> {
    const next = touch(record);
    await db().customContent.put(next);
    return next;
  },
  async remove(id: string): Promise<void> {
    const found = await db().customContent.get(id);
    if (!found) return;
    await db().customContent.put({ ...found, deletedAt: Date.now(), updatedAt: Date.now() });
  },
};

export const meta = {
  async get<T>(key: string): Promise<T | null> {
    const row = await db().appMeta.get(key);
    return row ? (row.value as T) : null;
  },
  async set(key: string, value: unknown): Promise<void> {
    await db().appMeta.put({ key, value });
  },
};
