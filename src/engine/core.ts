import type { AbilityId } from '../rules/schemas/primitives';

/**
 * Foundational 5e calculations.
 *
 * Every derived statistic in the app resolves through these functions. No component computes a
 * modifier inline -- that is the rule that keeps the numbers consistent across the sheet, the
 * creation wizard's preview, and the level-up flow.
 */

export const ABILITY_IDS: readonly AbilityId[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

export const ABILITY_NAMES: Record<AbilityId, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

/** Hard bounds from the 2014 rules. Scores outside this range are a data error, not a choice. */
export const MIN_ABILITY_SCORE = 1;
export const MAX_ABILITY_SCORE = 30;
export const MIN_LEVEL = 1;
export const MAX_LEVEL = 20;

/**
 * Ability modifier: floor((score - 10) / 2).
 *
 * `Math.floor` is required rather than truncation -- for a score of 9 the correct modifier is
 * -1, and `Math.trunc(-0.5)` would give 0.
 */
export function abilityModifier(score: number): number {
  return Math.floor((clampScore(score) - 10) / 2);
}

export function clampScore(score: number): number {
  if (!Number.isFinite(score)) return MIN_ABILITY_SCORE;
  return Math.min(MAX_ABILITY_SCORE, Math.max(MIN_ABILITY_SCORE, Math.floor(score)));
}

/**
 * Proficiency bonus from TOTAL character level, never a single class's level.
 *
 * A Fighter 3 / Wizard 3 has a +2 bonus (character level 6), not +2 twice over. Deriving this
 * from a per-class level is one of the most common multiclassing bugs.
 */
export function proficiencyBonus(totalCharacterLevel: number): number {
  const level = clampLevel(totalCharacterLevel);
  return 1 + Math.ceil(level / 4);
}

export function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return MIN_LEVEL;
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.floor(level)));
}

/** Passive scores are 10 + the relevant check modifier (plus advantage/disadvantage swings). */
export function passiveScore(checkModifier: number, opts: { advantage?: boolean; disadvantage?: boolean } = {}): number {
  let value = 10 + checkModifier;
  if (opts.advantage && !opts.disadvantage) value += 5;
  if (opts.disadvantage && !opts.advantage) value -= 5;
  return value;
}

/** Spell save DC: 8 + proficiency + spellcasting ability modifier. */
export function spellSaveDc(proficiency: number, abilityMod: number): number {
  return 8 + proficiency + abilityMod;
}

/** Spell attack bonus: proficiency + spellcasting ability modifier. */
export function spellAttackBonus(proficiency: number, abilityMod: number): number {
  return proficiency + abilityMod;
}

/**
 * Carrying capacity is STR x 15. Push/drag/lift is double that, and the encumbrance variant
 * thresholds sit at STR x 5 and STR x 10.
 */
export function carryingCapacity(strengthScore: number, sizeMultiplier = 1): number {
  return clampScore(strengthScore) * 15 * sizeMultiplier;
}

export function encumbranceThresholds(strengthScore: number, sizeMultiplier = 1): {
  encumbered: number;
  heavilyEncumbered: number;
  maximum: number;
  pushDragLift: number;
} {
  const str = clampScore(strengthScore) * sizeMultiplier;
  return {
    encumbered: str * 5,
    heavilyEncumbered: str * 10,
    maximum: str * 15,
    pushDragLift: str * 30,
  };
}

/** Average HP per hit die, as used by the "take the average" level-up option: die/2 + 1. */
export function averageHitDieValue(hitDie: number): number {
  return Math.floor(hitDie / 2) + 1;
}

/** Parse "2d6", "1d10", "8d6" into components. Returns null for anything unrecognised. */
export function parseDiceExpression(expr: string): { count: number; die: number } | null {
  const match = /^(\d+)d(\d+)$/i.exec(expr.trim());
  if (!match) return null;
  const count = Number(match[1]);
  const die = Number(match[2]);
  if (!Number.isFinite(count) || !Number.isFinite(die)) return null;
  return { count, die };
}

/**
 * Exhaustion effects (2014 rules), which are cumulative: each level also carries every effect
 * below it. Level 6 is death.
 */
export function exhaustionEffects(level: number): string[] {
  const all = [
    'Disadvantage on ability checks',
    'Speed halved',
    'Disadvantage on attack rolls and saving throws',
    'Hit point maximum halved',
    'Speed reduced to 0',
    'Death',
  ];
  return all.slice(0, Math.min(Math.max(level, 0), 6));
}
