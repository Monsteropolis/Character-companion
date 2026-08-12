import { z } from 'zod';
import { db } from './db';
import { characters, inventory, journal, notes, assetRepo, customContent } from './repositories';
import { newId, SCHEMA_VERSION } from '../domain/factories';
import type { Character, Persisted } from '../domain/types';

/**
 * Character export and import.
 *
 * This is the user's backup story and their escape hatch, and it ships before any migration
 * can run against their data. Blobs are inlined as data URLs so a bundle is a single portable
 * file -- a character can be emailed to a DM or restored on another machine with no service
 * involved.
 */

export const BUNDLE_FORMAT = 'character-companion.bundle';
export const BUNDLE_VERSION = 1;

const assetPayloadSchema = z.object({
  id: z.string(),
  characterId: z.string().nullable(),
  kind: z.string(),
  mimeType: z.string(),
  dataUrl: z.string(),
  width: z.number().nullable(),
  height: z.number().nullable(),
});

const bundleSchema = z.object({
  format: z.literal(BUNDLE_FORMAT),
  bundleVersion: z.number(),
  schemaVersion: z.number(),
  exportedAt: z.number(),
  characters: z.array(z.record(z.string(), z.unknown())),
  inventoryItems: z.array(z.record(z.string(), z.unknown())),
  journalEntries: z.array(z.record(z.string(), z.unknown())),
  notes: z.array(z.record(z.string(), z.unknown())),
  customContent: z.array(z.record(z.string(), z.unknown())),
  assets: z.array(assetPayloadSchema),
});

export type CharacterBundle = z.infer<typeof bundleSchema>;

async function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader === 'undefined') {
    const buffer = Buffer.from(await blob.arrayBuffer());
    return `data:${blob.type};base64,${buffer.toString('base64')}`;
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string, mimeType: string): Blob {
  const comma = dataUrl.indexOf(',');
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const binary =
    typeof atob === 'function' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

/**
 * Export one character, or the whole library when no id is given.
 *
 * Custom content is always included: a character that depends on a homebrew subclass is not
 * portable without it, and shipping the bundle without it would produce a silently broken
 * character on import.
 */
export async function exportBundle(characterId?: string): Promise<CharacterBundle> {
  const chars = characterId
    ? ([await characters.get(characterId)].filter(Boolean) as Character[])
    : await characters.list();

  const ids = chars.map((c) => c.id);

  const [items, entries, noteRows, assets, custom] = await Promise.all([
    Promise.all(ids.map((id) => inventory.list(id))).then((r) => r.flat()),
    Promise.all(ids.map((id) => journal.list(id))).then((r) => r.flat()),
    Promise.all(ids.map((id) => notes.list(id))).then((r) => r.flat()),
    Promise.all(ids.map((id) => assetRepo.listForCharacter(id))).then((r) => r.flat()),
    customContent.list(),
  ]);

  const assetPayloads = await Promise.all(
    assets.map(async (a) => ({
      id: a.id,
      characterId: a.characterId,
      kind: a.kind,
      mimeType: a.mimeType,
      dataUrl: await blobToDataUrl(a.blob),
      width: a.width,
      height: a.height,
    })),
  );

  return {
    format: BUNDLE_FORMAT,
    bundleVersion: BUNDLE_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    characters: chars as unknown as Record<string, unknown>[],
    inventoryItems: items as unknown as Record<string, unknown>[],
    journalEntries: entries as unknown as Record<string, unknown>[],
    notes: noteRows as unknown as Record<string, unknown>[],
    customContent: custom as unknown as Record<string, unknown>[],
    assets: assetPayloads,
  };
}

export interface ImportResult {
  charactersImported: number;
  itemsImported: number;
  entriesImported: number;
  notesImported: number;
  customContentImported: number;
  assetsImported: number;
}

/**
 * Import a bundle.
 *
 * Every record is re-keyed and every cross-reference remapped, so importing a bundle that
 * originated on this machine produces a genuine copy rather than overwriting the original.
 * Importing is therefore always additive and can never destroy existing data.
 */
export async function importBundle(raw: unknown): Promise<ImportResult> {
  const parsed = bundleSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Not a valid character bundle: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
    );
  }
  const bundle = parsed.data;

  if (bundle.bundleVersion > BUNDLE_VERSION) {
    throw new Error(
      `This bundle was created by a newer version of the app (format ${bundle.bundleVersion}).`,
    );
  }

  const idMap = new Map<string, string>();
  const remap = (oldId: string): string => {
    const existing = idMap.get(oldId);
    if (existing) return existing;
    const next = newId();
    idMap.set(oldId, next);
    return next;
  };

  const now = Date.now();
  const rekey = <T extends Persisted>(record: T, characterKey?: string): T => ({
    ...record,
    id: remap(record.id),
    updatedAt: now,
    deletedAt: null,
    ...(characterKey ? { characterId: remap(characterKey) } : {}),
  });

  const importedCharacters = bundle.characters.map((c) => {
    const character = rekey(c as unknown as Character);
    return {
      ...character,
      portraitId: character.portraitId ? remap(character.portraitId) : null,
    };
  });

  const importedItems = bundle.inventoryItems.map((i) => {
    const row = i as unknown as Persisted & { characterId: string };
    return rekey(row, row.characterId);
  });
  const importedEntries = bundle.journalEntries.map((e) => {
    const row = e as unknown as Persisted & { characterId: string };
    return rekey(row, row.characterId);
  });
  const importedNotes = bundle.notes.map((n) => {
    const row = n as unknown as Persisted & { characterId: string };
    return rekey(row, row.characterId);
  });
  const importedCustom = bundle.customContent.map((c) => rekey(c as unknown as Persisted));

  const importedAssets = bundle.assets.map((a) => ({
    id: remap(a.id),
    characterId: a.characterId ? remap(a.characterId) : null,
    kind: a.kind as 'portrait' | 'sprite' | 'journal-image' | 'item-icon',
    mimeType: a.mimeType,
    blob: dataUrlToBlob(a.dataUrl, a.mimeType),
    width: a.width,
    height: a.height,
    updatedAt: now,
    deletedAt: null,
    ownerId: null,
    schemaVersion: SCHEMA_VERSION,
  }));

  await db().transaction(
    'rw',
    [
      db().characters,
      db().inventoryItems,
      db().journalEntries,
      db().notes,
      db().customContent,
      db().assets,
    ],
    async () => {
      await db().characters.bulkPut(importedCharacters as never[]);
      await db().inventoryItems.bulkPut(importedItems as never[]);
      await db().journalEntries.bulkPut(importedEntries as never[]);
      await db().notes.bulkPut(importedNotes as never[]);
      await db().customContent.bulkPut(importedCustom as never[]);
      await db().assets.bulkPut(importedAssets as never[]);
    },
  );

  return {
    charactersImported: importedCharacters.length,
    itemsImported: importedItems.length,
    entriesImported: importedEntries.length,
    notesImported: importedNotes.length,
    customContentImported: importedCustom.length,
    assetsImported: importedAssets.length,
  };
}

export function bundleFilename(bundle: CharacterBundle): string {
  const stamp = new Date(bundle.exportedAt).toISOString().slice(0, 10);
  if (bundle.characters.length === 1) {
    const identity = (bundle.characters[0] as { identity?: { name?: string } }).identity;
    const name = (identity?.name || 'character').replace(/[^\w-]+/g, '-').toLowerCase();
    return `${name}-${stamp}.json`;
  }
  return `character-companion-library-${stamp}.json`;
}
