import type { AbilityId } from '../rules/schemas/primitives';
import type { AbilityScoreBlock, AbilityScoreMethod } from '../domain/types';
import { ABILITY_IDS, clampScore } from './core';

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

/** 4d6-drop-lowest, the standard rolling method. Randomness lives here, never in the engine. */
export function rollAbilityScore(random: () => number = Math.random): number {
  const dice = Array.from({ length: 4 }, () => Math.floor(random() * 6) + 1);
  dice.sort((a, b) => a - b);
  return dice[1]! + dice[2]! + dice[3]!;
}

export function rollAbilityScoreSet(random: () => number = Math.random): number[] {
  return Array.from({ length: 6 }, () => rollAbilityScore(random));
}

/**
 * Total score for one ability, applying every layer.
 *
 * An explicit override wins outright -- items like a Belt of Giant Strength set a score rather
 * than adding to it, and a DM may simply declare a value.
 */
export function totalAbilityScore(block: AbilityScoreBlock, id: AbilityId): number {
  const override = block.override[id];
  if (override !== undefined) return clampScore(override);
  return clampScore(block.base[id] + block.racial[id] + block.asi[id] + block.misc[id]);
}

export function totalAbilityScores(block: AbilityScoreBlock): Record<AbilityId, number> {
  return {
    str: totalAbilityScore(block, 'str'),
    dex: totalAbilityScore(block, 'dex'),
    con: totalAbilityScore(block, 'con'),
    int: totalAbilityScore(block, 'int'),
    wis: totalAbilityScore(block, 'wis'),
    cha: totalAbilityScore(block, 'cha'),
  };
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
