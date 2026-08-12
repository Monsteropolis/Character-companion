import type { AbilityId } from '../rules/schemas/primitives';
import { ABILITY_IDS } from '../engine/core';
import type {
  Character,
  Currency,
  InventoryItem,
  JournalEntry,
  Note,
  Persisted,
  Visibility,
  NoteKind,
} from './types';

import { CURRENT_SCHEMA_VERSION, emptyStatOverrides } from '../persistence/migrations';

/** Current schema version. Defined alongside the migrations that produce it. */
export const SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;

export function newId(): string {
  // crypto.randomUUID is available in every target browser and in Node 19+.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Deterministic-enough fallback for exotic environments; still collision-safe in practice.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function persistedBase(): Persisted {
  return {
    id: newId(),
    updatedAt: Date.now(),
    deletedAt: null,
    ownerId: null,
    schemaVersion: SCHEMA_VERSION,
  };
}

export function zeroAbilities(): Record<AbilityId, number> {
  return { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
}

export function defaultAbilityScores(): Record<AbilityId, number> {
  return { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
}

export function emptyCurrency(): Currency {
  return { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
}

export function createCharacter(overrides: Partial<Character> = {}): Character {
  return {
    ...persistedBase(),
    identity: {
      name: '',
      pronouns: '',
      alignment: null,
      description: '',
      personalityTraits: [],
      ideals: [],
      bonds: [],
      flaws: [],
      backstory: '',
    },
    classes: [],
    race: { raceRef: null, subraceRef: null },
    background: { ref: null, feature: null },
    abilityScores: {
      base: defaultAbilityScores(),
      method: 'standard-array',
      racial: zeroAbilities(),
      asi: zeroAbilities(),
      misc: zeroAbilities(),
      override: {},
    },
    abilityAdjustments: [],
    statOverrides: emptyStatOverrides(),
    proficiencies: [],
    resources: {
      currentHp: 0,
      tempHp: 0,
      maxHpOverride: null,
      deathSaves: { successes: 0, failures: 0 },
      exhaustion: 0,
      conditions: [],
      usages: {},
      spellSlots: {},
      concentratingOn: null,
    },
    spellcasting: null,
    currency: emptyCurrency(),
    portraitId: null,
    mood: 'default',
    choices: [],
    customFeatures: [],
    xp: 0,
    archived: false,
    notes: '',
    ...overrides,
  };
}

export function createInventoryItem(
  characterId: string,
  overrides: Partial<InventoryItem> = {},
): InventoryItem {
  return {
    ...persistedBase(),
    characterId,
    ref: null,
    name: 'New item',
    category: 'misc',
    quantity: 1,
    weight: 0,
    value: emptyCurrency(),
    description: '',
    iconAssetId: null,
    equipped: false,
    attuned: false,
    magical: false,
    charges: null,
    notes: '',
    effects: [],
    weightless: false,
    armor: null,
    weapon: null,
    ...overrides,
  };
}

/**
 * Journal entries require an explicit visibility.
 *
 * There is no default: the caller must state whether an entry is shareable, because the failure
 * mode of guessing is exposing a player's private notes.
 */
export function createJournalEntry(
  characterId: string,
  visibility: Visibility,
  overrides: Partial<JournalEntry> = {},
): JournalEntry {
  return {
    ...persistedBase(),
    characterId,
    visibility,
    title: '',
    body: '',
    realDate: Date.now(),
    inGameDate: null,
    sessionNumber: null,
    tags: [],
    imageAssetIds: [],
    links: [],
    ...overrides,
  };
}

export function createNote(
  characterId: string,
  kind: NoteKind,
  visibility: Visibility,
  overrides: Partial<Note> = {},
): Note {
  return {
    ...persistedBase(),
    characterId,
    kind,
    name: '',
    body: '',
    visibility,
    links: [],
    meta: {},
    ...overrides,
  };
}

/** Total character level across all classes -- the value proficiency bonus derives from. */
export function totalLevel(character: Character): number {
  return character.classes.reduce((sum, c) => sum + c.level, 0) || 1;
}

export function primaryClass(character: Character): Character['classes'][number] | null {
  // The class with the most levels reads as "the" class on cards and headers.
  return [...character.classes].sort((a, b) => b.level - a.level)[0] ?? null;
}

export function characterDisplayName(character: Character): string {
  return character.identity.name.trim() || 'Unnamed character';
}

/** ABILITY_IDS re-exported so domain consumers need not reach into the engine for the order. */
export { ABILITY_IDS };
