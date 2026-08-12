import type { AbilityId } from '../rules/schemas/primitives';
import type { AbilityAdjustment, AbilityScoreBlock, AbilityScoreMethod } from '../domain/types';
import { ABILITY_IDS, clampScore } from './core';
import { rollDice } from './dice';

/**
 * Ability score generation.
 *
 * The four 2014 methods have genuinely different constraints, so each is validated on its own
 * terms rather than being flattened into "any number 1-20". Getting point buy wrong is easy and
 * produces a character that is quietly illegal at a table.
 */

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

/** Point-buy costs from the 2014 rules. Scores outside 8-15 cannot be bought at all. */
export const POINT_BUY_COSTS: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};

export const POINT_BUY_BUDGET = 27;
export const POINT_BUY_MIN = 8;
export const POINT_BUY_MAX = 15;

export function pointBuyCost(score: number): number | null {
  return POINT_BUY_COSTS[score] ?? null;
}

export function pointBuyTotal(scores: Record<AbilityId, number>): number {
  return ABILITY_IDS.reduce((sum, id) => sum + (pointBuyCost(scores[id]) ?? 0), 0);
}

export function pointBuyRemaining(scores: Record<AbilityId, number>): number {
  return POINT_BUY_BUDGET - pointBuyTotal(scores);
}

export interface ValidationIssue {
  ability: AbilityId | null;
  message: string;
}

/**
 * Validate a set of base scores for the chosen method.
 *
 * Returns every problem rather than the first, so the wizard can annotate each offending field
 * at once instead of making the user fix them one at a time.
 */
export function validateAbilityScores(
  method: AbilityScoreMethod,
  scores: Record<AbilityId, number>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (method === 'point-buy') {
    for (const id of ABILITY_IDS) {
      const score = scores[id];
      if (score < POINT_BUY_MIN || score > POINT_BUY_MAX) {
        issues.push({
          ability: id,
          message: `Point buy allows ${POINT_BUY_MIN}-${POINT_BUY_MAX} before racial bonuses.`,
        });
      }
    }
    const spent = pointBuyTotal(scores);
    if (spent > POINT_BUY_BUDGET) {
      issues.push({ ability: null, message: `${spent - POINT_BUY_BUDGET} points over budget.` });
    }
    return issues;
  }

  if (method === 'standard-array') {
    const assigned = ABILITY_IDS.map((id) => scores[id]).sort((a, b) => b - a);
    const expected = [...STANDARD_ARRAY].sort((a, b) => b - a);
    const matches = assigned.every((v, i) => v === expected[i]);
    if (!matches) {
      issues.push({
        ability: null,
        message: `The standard array must use each of ${STANDARD_ARRAY.join(', ')} exactly once.`,
      });
    }
    return issues;
  }

  // Manual and rolled: only the hard rules bounds apply, since a DM may allow anything.
  for (const id of ABILITY_IDS) {
    const score = scores[id];
    if (!Number.isFinite(score) || score < 1 || score > 30) {
      issues.push({ ability: id, message: 'Scores must be between 1 and 30.' });
    }
  }
  return issues;
}

/** 4d6-drop-lowest, the standard rolling method. Randomness comes from `dice.ts`, nowhere else. */
export function rollAbilityScore(random: () => number = Math.random): number {
  const dice = rollDice(4, 6, random);
  dice.sort((a, b) => a - b);
  return dice[1]! + dice[2]! + dice[3]!;
}

export function rollAbilityScoreSet(random: () => number = Math.random): number[] {
  return Array.from({ length: 6 }, () => rollAbilityScore(random));
}

/**
 * Total score for one ability, applying every layer.
 *
 * Order is deliberate and follows the rules:
 *  1. a raw manual override wins outright -- it is the DM hammer and nothing overrules it;
 *  2. otherwise bonuses accumulate: base, racial, ASI, misc, and any 'bonus' adjustments;
 *  3. 'set' adjustments then compete with that sum and the highest wins, because effects that
 *     change a score to a fixed value ("your Strength becomes 21") explicitly do nothing when
 *     the score is already equal or higher, and never stack with one another.
 */
export function totalAbilityScore(
  block: AbilityScoreBlock,
  id: AbilityId,
  adjustments: AbilityAdjustment[] = [],
): number {
  const override = block.override[id];
  if (override !== undefined) return clampScore(override);

  const forAbility = adjustments.filter((a) => a.ability === id);
  const bonuses = forAbility
    .filter((a) => a.kind === 'bonus')
    .reduce((sum, a) => sum + a.value, 0);

  const accumulated = block.base[id] + block.racial[id] + block.asi[id] + block.misc[id] + bonuses;

  const sets = forAbility.filter((a) => a.kind === 'set').map((a) => a.value);
  if (sets.length === 0) return clampScore(accumulated);

  return clampScore(Math.max(accumulated, ...sets));
}

export function totalAbilityScores(
  block: AbilityScoreBlock,
  adjustments: AbilityAdjustment[] = [],
): Record<AbilityId, number> {
  return {
    str: totalAbilityScore(block, 'str', adjustments),
    dex: totalAbilityScore(block, 'dex', adjustments),
    con: totalAbilityScore(block, 'con', adjustments),
    int: totalAbilityScore(block, 'int', adjustments),
    wis: totalAbilityScore(block, 'wis', adjustments),
    cha: totalAbilityScore(block, 'cha', adjustments),
  };
}

/** Explains how an ability reached its value, for the sheet's breakdown popover. */
export function explainAbilityScore(
  block: AbilityScoreBlock,
  id: AbilityId,
  adjustments: AbilityAdjustment[] = [],
): { label: string; value: number; kind: 'base' | 'racial' | 'asi' | 'misc' | 'adjustment' | 'override' }[] {
  const override = block.override[id];
  if (override !== undefined) {
    return [{ label: 'Manual override', value: override, kind: 'override' }];
  }

  const parts: ReturnType<typeof explainAbilityScore> = [
    { label: 'Base score', value: block.base[id], kind: 'base' },
  ];
  if (block.racial[id]) parts.push({ label: 'Racial bonus', value: block.racial[id], kind: 'racial' });
  if (block.asi[id]) parts.push({ label: 'Ability Score Improvements', value: block.asi[id], kind: 'asi' });
  if (block.misc[id]) parts.push({ label: 'Other permanent', value: block.misc[id], kind: 'misc' });

  for (const adjustment of adjustments.filter((a) => a.ability === id)) {
    parts.push({
      label: adjustment.kind === 'set'
        ? `${adjustment.label} (sets to ${adjustment.value})`
        : adjustment.label,
      value: adjustment.value,
      kind: 'adjustment',
    });
  }

  return parts;
}

/** Starting scores for a method, so switching methods lands somewhere legal. */
export function defaultScoresFor(method: AbilityScoreMethod): Record<AbilityId, number> {
  if (method === 'standard-array') {
    return { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };
  }
  if (method === 'point-buy') {
    return { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 };
  }
  return { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
}
