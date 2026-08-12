import { describe, it, expect } from 'vitest';
import {
  abilityModifier,
  proficiencyBonus,
  passiveScore,
  spellSaveDc,
  spellAttackBonus,
  carryingCapacity,
  encumbranceThresholds,
  averageHitDieValue,
  parseDiceExpression,
  exhaustionEffects,
  clampScore,
} from '../core';
import { derive, contribution, combineAdvantage, formatModifier } from '../contributions';

describe('abilityModifier', () => {
  // The full published table -- these are the numbers every other calculation inherits.
  it.each([
    [1, -5], [2, -4], [3, -4], [8, -1], [9, -1], [10, 0], [11, 0],
    [12, 1], [15, 2], [16, 3], [20, 5], [24, 7], [30, 10],
  ])('score %i -> %i', (score, expected) => {
    expect(abilityModifier(score)).toBe(expected);
  });

  it('floors rather than truncates for odd low scores', () => {
    // Math.trunc(-0.5) would wrongly give 0 here.
    expect(abilityModifier(9)).toBe(-1);
    expect(abilityModifier(7)).toBe(-2);
  });

  it('clamps out-of-range and non-finite input', () => {
    expect(abilityModifier(0)).toBe(-5);
    expect(abilityModifier(99)).toBe(10);
    expect(abilityModifier(Number.NaN)).toBe(-5);
  });

  it('is monotonic across the legal range', () => {
    for (let s = 2; s <= 30; s++) {
      expect(abilityModifier(s)).toBeGreaterThanOrEqual(abilityModifier(s - 1));
    }
  });
});

describe('proficiencyBonus', () => {
  it.each([
    [1, 2], [2, 2], [3, 2], [4, 2],
    [5, 3], [8, 3], [9, 4], [12, 4],
    [13, 5], [16, 5], [17, 6], [20, 6],
  ])('level %i -> +%i', (level, expected) => {
    expect(proficiencyBonus(level)).toBe(expected);
  });

  it('clamps beyond the legal level range', () => {
    expect(proficiencyBonus(0)).toBe(2);
    expect(proficiencyBonus(25)).toBe(6);
  });
});

describe('passiveScore', () => {
  it('is 10 + modifier', () => {
    expect(passiveScore(3)).toBe(13);
    expect(passiveScore(-1)).toBe(9);
  });

  it('applies the +/-5 swing, and cancels when both apply', () => {
    expect(passiveScore(3, { advantage: true })).toBe(18);
    expect(passiveScore(3, { disadvantage: true })).toBe(8);
    expect(passiveScore(3, { advantage: true, disadvantage: true })).toBe(13);
  });
});

describe('spellcasting', () => {
  it('computes save DC and attack bonus', () => {
    // Level 5 wizard, INT 18: DC 8 + 3 + 4 = 15, attack +7.
    expect(spellSaveDc(proficiencyBonus(5), abilityModifier(18))).toBe(15);
    expect(spellAttackBonus(proficiencyBonus(5), abilityModifier(18))).toBe(7);
  });
});

describe('carrying capacity and encumbrance', () => {
  it('is STR x 15', () => {
    expect(carryingCapacity(15)).toBe(225);
  });

  it('doubles for large creatures', () => {
    expect(carryingCapacity(15, 2)).toBe(450);
  });

  it('places variant thresholds at x5 and x10', () => {
    expect(encumbranceThresholds(15)).toEqual({
      encumbered: 75,
      heavilyEncumbered: 150,
      maximum: 225,
      pushDragLift: 450,
    });
  });
});

describe('hit dice', () => {
  it.each([[6, 4], [8, 5], [10, 6], [12, 7]])('d%i averages to %i', (die, expected) => {
    expect(averageHitDieValue(die)).toBe(expected);
  });
});

describe('parseDiceExpression', () => {
  it('parses the dataset dice format', () => {
    expect(parseDiceExpression('8d6')).toEqual({ count: 8, die: 6 });
    expect(parseDiceExpression(' 1d10 ')).toEqual({ count: 1, die: 10 });
  });

  it('returns null rather than throwing on unrecognised input', () => {
    // Some SRD damage strings carry modifiers or prose; the caller must handle that.
    expect(parseDiceExpression('1d6+2')).toBeNull();
    expect(parseDiceExpression('')).toBeNull();
  });
});

describe('exhaustion', () => {
  it('accumulates effects and ends at death', () => {
    expect(exhaustionEffects(0)).toEqual([]);
    expect(exhaustionEffects(2)).toHaveLength(2);
    expect(exhaustionEffects(5)).toContain('Speed reduced to 0');
    expect(exhaustionEffects(6)).toContain('Death');
    expect(exhaustionEffects(9)).toHaveLength(6);
  });
});

describe('clampScore', () => {
  it('keeps scores within 1..30 and integral', () => {
    expect(clampScore(15.7)).toBe(15);
    expect(clampScore(-3)).toBe(1);
    expect(clampScore(40)).toBe(30);
  });
});

describe('contribution model', () => {
  it('sums contributions and preserves the reasons', () => {
    const ac = derive([
      contribution('Breastplate', 14, 'item'),
      contribution('DEX modifier', 2, 'ability'),
      contribution('Ring of Protection', 1, 'item'),
    ]);

    expect(ac.total).toBe(17);
    expect(ac.contributions).toHaveLength(3);
    expect(ac.contributions.map((c) => c.source)).toContain('Ring of Protection');
  });

  it('lets an override replace the computed total while retaining the breakdown', () => {
    const ac = derive([
      contribution('Breastplate', 14, 'item'),
      contribution('DEX modifier', 2, 'ability'),
      contribution('DM ruling', 19, 'override'),
    ]);

    expect(ac.total).toBe(19);
    // The computed inputs survive, so the UI can still explain what was overridden.
    expect(ac.contributions).toHaveLength(3);
  });

  it('always has contributions summing to total when unoverridden', () => {
    const value = derive([
      contribution('a', 3, 'base'),
      contribution('b', -1, 'condition'),
      contribution('c', 5, 'feature'),
    ]);
    const sum = value.contributions.reduce((n, c) => n + c.value, 0);
    expect(sum).toBe(value.total);
  });

  it('carries notes for effects it cannot model numerically', () => {
    const value = derive([contribution('base', 10, 'base')], {
      notes: ['Rage: resistance to bludgeoning, piercing and slashing damage'],
    });
    expect(value.notes).toHaveLength(1);
  });
});

describe('combineAdvantage', () => {
  it('does not stack, and cancels opposing sources', () => {
    expect(combineAdvantage(['advantage', 'advantage'])).toBe('advantage');
    expect(combineAdvantage(['advantage', 'disadvantage'])).toBeNull();
    expect(combineAdvantage([])).toBeNull();
    expect(combineAdvantage(['disadvantage'])).toBe('disadvantage');
  });
});

describe('formatModifier', () => {
  it('always signs the value', () => {
    expect(formatModifier(3)).toBe('+3');
    expect(formatModifier(0)).toBe('+0');
    expect(formatModifier(-2)).toBe('-2');
  });
});
