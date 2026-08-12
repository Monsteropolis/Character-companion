import Dexie, { type EntityTable } from 'dexie';
import type {
  Character,
  CustomContent,
  InventoryItem,
  JournalEntry,
  LevelUpRecord,
  Note,
  PortraitAsset,
  StoredAsset,
} from '../domain/types';

/**
 * IndexedDB schema.
 *
 * IndexedDB rather than localStorage for two reasons: portraits and sprite sheets are binary and
 * would blow past the ~5 MB localStorage ceiling, and localStorage's only access pattern is
 * "serialize the whole blob", which is exactly the anti-pattern the data model avoids.
 *
 * Indices are chosen for the queries the UI actually makes -- per-character listings filtered by
 * category, visibility or kind -- so no view has to load a whole table and filter in memory.
 */

export interface AppMeta {
  key: string;
  value: unknown;
}

export class CharacterCompanionDb extends Dexie {
  characters!: EntityTable<Character, 'id'>;
  inventoryItems!: EntityTable<InventoryItem, 'id'>;
  journalEntries!: EntityTable<JournalEntry, 'id'>;
  notes!: EntityTable<Note, 'id'>;
  customContent!: EntityTable<CustomContent, 'id'>;
  assets!: EntityTable<StoredAsset, 'id'>;
  levelUpRecords!: EntityTable<LevelUpRecord, 'id'>;
  portraits!: EntityTable<PortraitAsset, 'id'>;
  appMeta!: EntityTable<AppMeta, 'key'>;

  constructor(name = 'character-companion') {
    super(name);

    this.version(1).stores({
      characters: 'id, archived, updatedAt, deletedAt',
      inventoryItems: 'id, characterId, [characterId+category], [characterId+equipped]',
      journalEntries:
        'id, characterId, [characterId+visibility], sessionNumber, realDate, *tags',
      notes: 'id, characterId, [characterId+kind], [characterId+visibility]',
      customContent: 'id, kind, name',
      assets: 'id, characterId, kind',
      levelUpRecords: 'id, characterId, level',
      appMeta: 'key',
    });

    // v2 adds portrait configuration: the animation states and sprite-sheet geometry that sit
    // on top of a stored image blob. Kept in its own table rather than on the character so a
    // character can hold several portraits (alternate forms) without reshaping the record.
    this.version(2).stores({
      portraits: 'id, characterId',
    });
  }
}

let instance: CharacterCompanionDb | null = null;

export function db(): CharacterCompanionDb {
  if (!instance) instance = new CharacterCompanionDb();
  return instance;
}

/** Test seam: point the app at an isolated database. */
export function setDb(next: CharacterCompanionDb | null): void {
  instance = next;
}

/**
 * Ask the browser to keep this data across storage pressure.
 *
 * Character data is irreplaceable and IndexedDB is evictable by default. If the request is
 * denied the UI warns the user and points them at export, rather than silently risking loss.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
