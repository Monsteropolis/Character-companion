import type { AbilityId } from '../rules/schemas/primitives';
import type { Character, PreparationMode } from '../domain/types';
import { proficiencyBonus, spellSaveDc, spellAttackBonus } from './core';

/**
 * Spellcasting.
 *
 * Three things here are easy to get wrong and quietly wrong when you do:
 *  - Warlock Pact Magic is a separate pool that recovers on a SHORT rest and never merges with
 *    other slots, even though the dataset stores it in the same shape;
 *  - multiclass slots come from a combined caster level, not from adding each class's table;
 *  - how many spells you can prepare differs per class, and always-prepared domain and oath
 *    spells must not count against the limit.
 */

export interface SpellSlotRow {
  level: number;
  total: number;
  used: number;
}

export interface CasterInfo {
  classIndex: string;
  className: string;
  ability: AbilityId;
  preparation: PreparationMode;
  saveDc: number;
  attackBonus: number;
  cantripsKnown: number;
  /** Preparation limit, or null for classes that simply know a fixed list. */
  preparedLimit: number | null;
  isPactMagic: boolean;
}

export interface SpellcastingSnapshot {
  casters: CasterInfo[];
  /** Standard slots, combined across every non-warlock caster class. */
  slots: SpellSlotRow[];
  /** Pact Magic slots, kept separate because they recover on a short rest. */
  pactSlots: SpellSlotRow[];
  hasSpellcasting: boolean;
}

/** Full casters progress at their full level; half casters at half; Warlock is excluded. */
export const CASTER_FRACTION: Record<string, number> = {
  bard: 1,
  cleric: 1,
  druid: 1,
  sorcerer: 1,
  wizard: 1,
  paladin: 0.5,
  ranger: 0.5,
};

export const PACT_MAGIC_CLASSES = new Set(['warlock']);

/**
 * Combined caster level for multiclassing.
 *
 * Half-caster levels are rounded DOWN individually before summing, and Warlock levels are
 * excluded entirely. A Paladin 3 / Ranger 3 is caster level 2, not 3.
 */
export function combinedCasterLevel(character: Character): number {
  let level = 0;
  for (const entry of character.classes) {
    const fraction = CASTER_FRACTION[entry.classRef.index];
    if (fraction === undefined) continue;
    level += Math.floor(entry.level * fraction);
  }
  return level;
}

export interface LevelSlotRow {
  classIndex: string;
  level: number;
  slots: Record<number, number>;
  cantripsKnown: number;
  spellsKnown: number | null;
}

/**
 * Slot totals for a character.
 *
 * A single-class caster uses its own published table, which matters for half-casters whose
 * table is not simply the full-caster table halved. Multiclass characters use the combined
 * caster level against the full-caster table, which the Wizard rows already are.
 */
export function slotsFor(
  character: Character,
  rows: LevelSlotRow[],
): { standard: Record<number, number>; pact: Record<number, number> } {
  const casters = character.classes.filter(
    (c) => CASTER_FRACTION[c.classRef.index] !== undefined,
  );
  const pactCasters = character.classes.filter((c) => PACT_MAGIC_CLASSES.has(c.classRef.index));

  const standard: Record<number, number> = {};
  const pact: Record<number, number> = {};

  if (casters.length === 1) {
    const only = casters[0]!;
    const row = rows.find((r) => r.classIndex === only.classRef.index && r.level === only.level);
    Object.assign(standard, row?.slots ?? {});
  } else if (casters.length > 1) {
    const casterLevel = combinedCasterLevel(character);
    // Wizard rows ARE the full-caster table, so the multiclass table needs no hardcoding.
    const row = rows.find((r) => r.classIndex === 'wizard' && r.level === casterLevel);
    Object.assign(standard, row?.slots ?? {});
  }

  for (const warlock of pactCasters) {
    const row = rows.find((r) => r.classIndex === 'warlock' && r.level === warlock.level);
    for (const [level, count] of Object.entries(row?.slots ?? {})) {
      if (count > 0) pact[Number(level)] = (pact[Number(level)] ?? 0) + count;
    }
  }

  return { standard, pact };
}

/**
 * How many spells a class may prepare.
 *
 * Returns null for classes that know a fixed list and prepare nothing — presenting a
 * preparation limit to a Sorcerer would be inventing a rule.
 */
export function preparedLimit(
  classIndex: string,
  classLevel: number,
  abilityMod: number,
): number | null {
  switch (classIndex) {
    case 'cleric':
    case 'druid':
    case 'wizard':
      return Math.max(1, abilityMod + classLevel);
    case 'paladin':
      // Half level, rounded down, minimum one.
      return Math.max(1, abilityMod + Math.floor(classLevel / 2));
    default:
      return null;
  }
}

export function preparationModeFor(classIndex: string): PreparationMode {
  if (classIndex === 'wizard') return 'spellbook';
  if (['cleric', 'druid', 'paladin'].includes(classIndex)) return 'prepared';
  return 'known';
}

export function deriveSpellcasting(
  character: Character,
  rows: LevelSlotRow[],
  mods: Record<AbilityId, number>,
  abilityByClass: Record<string, AbilityId>,
  classNames: Record<string, string>,
): SpellcastingSnapshot {
  const totalLevel = character.classes.reduce((sum, c) => sum + c.level, 0) || 1;
  const profBonus = character.statOverrides?.proficiencyBonus ?? proficiencyBonus(totalLevel);

  const casters: CasterInfo[] = [];

  for (const entry of character.classes) {
    const ability = abilityByClass[entry.classRef.index];
    const isPact = PACT_MAGIC_CLASSES.has(entry.classRef.index);
    const isCaster = CASTER_FRACTION[entry.classRef.index] !== undefined || isPact;
    if (!ability || !isCaster) continue;

    const row = rows.find(
      (r) => r.classIndex === entry.classRef.index && r.level === entry.level,
    );
    const mod = mods[ability];
    const preparation = preparationModeFor(entry.classRef.index);

    casters.push({
      classIndex: entry.classRef.index,
      className: classNames[entry.classRef.index] ?? entry.classRef.name,
      ability,
      preparation,
      saveDc: character.statOverrides?.spellSaveDc ?? spellSaveDc(profBonus, mod),
      attackBonus: character.statOverrides?.spellAttackBonus ?? spellAttackBonus(profBonus, mod),
      cantripsKnown: row?.cantripsKnown ?? 0,
      preparedLimit: preparedLimit(entry.classRef.index, entry.level, mod),
      isPactMagic: isPact,
    });
  }

  const { standard, pact } = slotsFor(character, rows);
  const used = character.resources.spellSlots;

  const toRows = (totals: Record<number, number>, keyOffset = 0): SpellSlotRow[] =>
    Object.entries(totals)
      .filter(([, total]) => total > 0)
      .map(([level, total]) => ({
        level: Number(level),
        total,
        used: used[Number(level) + keyOffset]?.used ?? 0,
      }))
      .sort((a, b) => a.level - b.level);

  return {
    casters,
    slots: toRows(standard),
    // Pact slots are stored offset so they cannot collide with standard slots of the same level.
    pactSlots: toRows(pact, PACT_SLOT_OFFSET),
    hasSpellcasting: casters.length > 0,
  };
}

/**
 * Pact Magic slots are recorded under a high offset key.
 *
 * A Warlock 3 / Wizard 3 has both a level-2 pact slot and level-2 standard slots, and they are
 * spent and recovered independently. Sharing a key would silently merge them.
 */
export const PACT_SLOT_OFFSET = 100;

export function pactSlotKey(level: number): number {
  return level + PACT_SLOT_OFFSET;
}

/** Counts spells prepared against the limit, excluding always-prepared and cantrips. */
export function countPrepared(character: Character, classIndex: string): number {
  const entry = character.spellcasting?.entries.find((e) => e.classRef.index === classIndex);
  if (!entry) return 0;
  return entry.known.filter((s) => s.prepared && !s.alwaysPrepared).length;
}

/**
 * Slot levels available for casting a spell of a given level.
 *
 * Upcasting means any slot of equal or higher level works, and pact slots are offered
 * alongside standard ones since a Warlock casts from them the same way.
 */
export function castableSlots(
  snapshot: SpellcastingSnapshot,
  spellLevel: number,
): { level: number; remaining: number; pact: boolean }[] {
  if (spellLevel === 0) return [];

  const options: { level: number; remaining: number; pact: boolean }[] = [];

  for (const slot of snapshot.slots) {
    if (slot.level >= spellLevel && slot.total - slot.used > 0) {
      options.push({ level: slot.level, remaining: slot.total - slot.used, pact: false });
    }
  }
  for (const slot of snapshot.pactSlots) {
    if (slot.level >= spellLevel && slot.total - slot.used > 0) {
      options.push({ level: slot.level, remaining: slot.total - slot.used, pact: true });
    }
  }

  return options.sort((a, b) => a.level - b.level);
}

/** Restores spell slots on a rest. Only Pact Magic comes back on a short rest. */
export function restoreSlots(
  slots: Character['resources']['spellSlots'],
  rest: 'short' | 'long',
): Character['resources']['spellSlots'] {
  const next = { ...slots };
  for (const key of Object.keys(next)) {
    const level = Number(key);
    const isPact = level >= PACT_SLOT_OFFSET;
    if (rest === 'long' || isPact) {
      const slot = next[level];
      if (slot) next[level] = { ...slot, used: 0 };
    }
  }
  return next;
}

/**
 * The damage or healing an upcast spell produces.
 *
 * The SRD publishes these as maps keyed by slot level, so upcasting needs no formula -- but the
 * map is sparse, and the highest defined entry at or below the slot level is the correct one.
 */
export function scaledDice(
  table: Record<string, string> | undefined,
  slotLevel: number,
): string | null {
  if (!table) return null;
  const exact = table[String(slotLevel)];
  if (exact) return exact;

  const levels = Object.keys(table)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n <= slotLevel)
    .sort((a, b) => b - a);

  return levels.length > 0 ? (table[String(levels[0])] ?? null) : null;
}
