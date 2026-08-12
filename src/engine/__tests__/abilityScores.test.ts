import { describe, it, expect } from 'vitest';
import {
  STANDARD_ARRAY,
  POINT_BUY_BUDGET,
  pointBuyCost,
  pointBuyTotal,
  pointBuyRemaining,
  validateAbilityScores,
  rollAbilityScore,
  rollAbilityScoreSet,
  totalAbilityScore,
  defaultScoresFor,
} from '../abilityScores';
import type { AbilityScoreBlock } from '../../domain/types';

const set = (v: Partial<Record<string, number>> = {}) => ({
  str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8, ...v,
}) as Record<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha', number>;

describe('point buy', () => {
  it('uses the published cost curve, which is not linear above 13', () => {
    expect(pointBuyCost(8)).toBe(0);
    expect(pointBuyCost(13)).toBe(5);
    // 14 and 15 cost 2 points each, not 1 -- the common place a naive implementation is wrong.
    expect(pointBuyCost(14)).toBe(7);
    expect(pointBuyCost(15)).toBe(9);
  });

  it('cannot buy scores outside 8-15', () => {
    expect(pointBuyCost(7)).toBeNull();
    expect(pointBuyCost(16)).toBeNull();
  });

  it('starts with the full budget unspent', () => {
    expect(pointBuyRemaining(set())).toBe(POINT_BUY_BUDGET);
  });

  it('accepts a legal 27-point spread', () => {
    const legal = set({ str: 15, dex: 14, con: 15, int: 8, wis: 10, cha: 8 });
    expect(pointBuyTotal(legal)).toBe(27);
    expect(validateAbilityScores('point-buy', legal)).toEqual([]);
  });

  it('rejects an over-budget spread and says by how much', () => {
    const over = set({ str: 15, dex: 15, con: 15, int: 15, wis: 15, cha: 15 });
    const issues = validateAbilityScores('point-buy', over);
    expect(issues.some((i) => /over budget/.test(i.message))).toBe(true);
  });

  it('rejects scores outside the buyable range, naming the ability', () => {
    const issues = validateAbilityScores('point-buy', set({ str: 18 }));
    expect(issues.some((i) => i.ability === 'str')).toBe(true);
  });
});

describe('standard array', () => {
  it('accepts each value used exactly once, in any assignment', () => {
    expect(validateAbilityScores('standard-array', set({
      str: 8, dex: 10, con: 12, int: 13, wis: 14, cha: 15,
    }))).toEqual([]);
  });

  it('rejects a repeated value', () => {
    const issues = validateAbilityScores('standard-array', set({
      str: 15, dex: 15, con: 13, int: 12, wis: 10, cha: 8,
    }));
    expect(issues).toHaveLength(1);
  });

  it('has six values', () => {
    expect(STANDARD_ARRAY).toHaveLength(6);
  });
});

describe('manual and rolled', () => {
  it('allows anything within the hard 1-30 bounds', () => {
    expect(validateAbilityScores('manual', set({ str: 20, dex: 3 }))).toEqual([]);
  });

  it('rejects values outside those bounds', () => {
    expect(validateAbilityScores('manual', set({ str: 31 }))).toHaveLength(1);
    expect(validateAbilityScores('rolled', set({ str: 0 }))).toHaveLength(1);
  });
});

describe('rolling', () => {
  it('drops the lowest of four dice', () => {
    // Forced rolls of 1,1,1,6 -> keep 1,1,6 -> 8.
    const rolls = [1, 1, 1, 6];
    let i = 0;
    const random = () => (rolls[i++]! - 1) / 6 + 0.001;
    expect(rollAbilityScore(random)).toBe(8);
  });

  it('always lands within 3..18', () => {
    for (let n = 0; n < 200; n++) {
      const score = rollAbilityScore();
      expect(score).toBeGreaterThanOrEqual(3);
      expect(score).toBeLessThanOrEqual(18);
    }
  });

  it('produces six scores', () => {
    expect(rollAbilityScoreSet()).toHaveLength(6);
  });
});

describe('score layering', () => {
  const block: AbilityScoreBlock = {
    base: set({ str: 15 }),
    method: 'manual',
    racial: set({ str: 2, dex: 0, con: 0, int: 0, wis: 0, cha: 0 }),
    asi: set({ str: 1, dex: 0, con: 0, int: 0, wis: 0, cha: 0 }),
    misc: set({ str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 }),
    override: {},
  };

  it('sums base, racial, asi and misc', () => {
    // The layering is what makes "why is my Strength 18?" answerable.
    expect(totalAbilityScore({ ...block, racial: { ...block.racial, str: 2 } }, 'str')).toBe(18);
  });

  it('lets an override replace the whole stack', () => {
    expect(totalAbilityScore({ ...block, override: { str: 19 } }, 'str')).toBe(19);
  });

  it('clamps to the legal maximum', () => {
    expect(totalAbilityScore({ ...block, misc: { ...block.misc, str: 40 } }, 'str')).toBe(30);
  });
});

describe('defaults per method', () => {
  it('lands on a legal starting point for each method', () => {
    expect(validateAbilityScores('standard-array', defaultScoresFor('standard-array'))).toEqual([]);
    expect(validateAbilityScores('point-buy', defaultScoresFor('point-buy'))).toEqual([]);
    expect(validateAbilityScores('manual', defaultScoresFor('manual'))).toEqual([]);
  });
});
