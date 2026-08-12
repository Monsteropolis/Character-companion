import { describe, it, expect } from 'vitest';
import {
  totalInCopper,
  totalInGold,
  spend,
  addCurrency,
  consolidate,
  currencyWeight,
  attunedCount,
  isOverAttuned,
  conflictingArmor,
  itemWeight,
  formatCurrency,
  isEquippable,
  ATTUNEMENT_LIMIT,
} from '../inventory';
import { createInventoryItem, emptyCurrency } from '../../domain/factories';
import type { Currency } from '../../domain/types';

const purse = (v: Partial<Currency> = {}): Currency => ({ ...emptyCurrency(), ...v });

describe('currency value', () => {
  it('converts every denomination to copper', () => {
    expect(totalInCopper(purse({ cp: 1 }))).toBe(1);
    expect(totalInCopper(purse({ sp: 1 }))).toBe(10);
    expect(totalInCopper(purse({ ep: 1 }))).toBe(50);
    expect(totalInCopper(purse({ gp: 1 }))).toBe(100);
    expect(totalInCopper(purse({ pp: 1 }))).toBe(1000);
  });

  it('sums a mixed purse', () => {
    expect(totalInCopper(purse({ pp: 2, gp: 5, sp: 3, cp: 7 }))).toBe(2000 + 500 + 30 + 7);
  });

  it('reports total in gold, the unit players quote', () => {
    expect(totalInGold(purse({ gp: 10, sp: 5 }))).toBe(10.5);
  });

  it('weighs coins at a fiftieth of a pound each', () => {
    expect(currencyWeight(purse({ gp: 50 }))).toBeCloseTo(1);
  });
});

describe('spending', () => {
  it('pays with the exact denomination when possible', () => {
    const after = spend(purse({ gp: 10 }), 3, 'gp');
    expect(after).toEqual(purse({ gp: 7 }));
  });

  it('refuses rather than going negative', () => {
    // A silently negative purse is worse than a refused purchase.
    expect(spend(purse({ gp: 2 }), 5, 'gp')).toBeNull();
  });

  it('makes change from larger coins', () => {
    const after = spend(purse({ gp: 1 }), 5, 'sp');
    expect(after).not.toBeNull();
    // 1 gp spent, 5 sp of change returned.
    expect(totalInCopper(after!)).toBe(50);
  });

  it('returns change in the largest sensible coins, not a pile of copper', () => {
    // Regression: paying 5 sp from a gold piece used to return 50 cp. Value-correct, but it
    // buries the purse in loose change after a few transactions.
    const after = spend(purse({ gp: 10 }), 5, 'sp');
    expect(after).toEqual(purse({ gp: 9, sp: 5 }));
  });

  it('never returns change in electrum', () => {
    const after = spend(purse({ pp: 1 }), 1, 'cp');
    expect(after?.ep).toBe(0);
  });

  it('preserves total value when making change', () => {
    const before = purse({ pp: 1, gp: 3 });
    const after = spend(before, 7, 'sp');
    expect(after).not.toBeNull();
    expect(totalInCopper(after!)).toBe(totalInCopper(before) - 70);
  });

  it('spends across mixed denominations', () => {
    const before = purse({ gp: 2, sp: 5, cp: 8 });
    const after = spend(before, 258, 'cp');
    expect(after).not.toBeNull();
    expect(totalInCopper(after!)).toBe(totalInCopper(before) - 258);
  });

  it('handles spending the entire purse exactly', () => {
    const after = spend(purse({ gp: 1 }), 100, 'cp');
    expect(after).not.toBeNull();
    expect(totalInCopper(after!)).toBe(0);
  });

  it('treats a zero cost as a no-op', () => {
    expect(spend(purse({ gp: 5 }), 0, 'gp')).toEqual(purse({ gp: 5 }));
  });
});

describe('adding currency', () => {
  it('adds each denomination', () => {
    expect(addCurrency(purse({ gp: 1 }), { gp: 4, sp: 2 })).toEqual(purse({ gp: 5, sp: 2 }));
  });

  it('never lets a denomination go negative', () => {
    expect(addCurrency(purse({ gp: 1 }), { gp: -10 })).toEqual(purse({ gp: 0 }));
  });
});

describe('consolidating', () => {
  it('rolls coin upward without changing value', () => {
    const before = purse({ cp: 137, sp: 24 });
    const after = consolidate(before);
    expect(totalInCopper(after)).toBe(totalInCopper(before));
    expect(after.cp).toBeLessThan(10);
  });

  it('leaves electrum untouched', () => {
    // Converting into electrum surprises players; many tables ignore it entirely.
    const after = consolidate(purse({ ep: 3, cp: 100 }));
    expect(after.ep).toBe(3);
  });

  it('is idempotent', () => {
    const once = consolidate(purse({ cp: 250 }));
    expect(consolidate(once)).toEqual(once);
  });
});

describe('attunement', () => {
  const attuned = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      createInventoryItem('c', { name: `Item ${i}`, attuned: true, magical: true }),
    );

  it('counts attuned items', () => {
    expect(attunedCount(attuned(2))).toBe(2);
  });

  it('flags going over the limit of three', () => {
    expect(isOverAttuned(attuned(ATTUNEMENT_LIMIT))).toBe(false);
    expect(isOverAttuned(attuned(ATTUNEMENT_LIMIT + 1))).toBe(true);
  });

  it('ignores deleted items', () => {
    const items = [...attuned(3), { ...createInventoryItem('c', { attuned: true }), deletedAt: 1 }];
    expect(attunedCount(items)).toBe(3);
  });
});

describe('armour conflicts', () => {
  const bodyArmor = (name: string, equipped: boolean) =>
    createInventoryItem('c', {
      name,
      category: 'armor',
      equipped,
      armor: { base: 14, dexBonus: true, maxDex: 2, strMinimum: 0, stealthDisadvantage: false, isShield: false },
    });

  const shield = createInventoryItem('c', {
    name: 'Shield',
    category: 'armor',
    equipped: true,
    armor: { base: 2, dexBonus: false, maxDex: null, strMinimum: 0, stealthDisadvantage: false, isShield: true },
  });

  it('detects a second suit of body armour', () => {
    const worn = bodyArmor('Chain Mail', true);
    const candidate = bodyArmor('Leather Armor', false);
    expect(conflictingArmor([worn, candidate], candidate)?.name).toBe('Chain Mail');
  });

  it('does not treat a shield as conflicting with armour', () => {
    // Armour plus a shield is the normal case, not a clash.
    const candidate = bodyArmor('Chain Mail', false);
    expect(conflictingArmor([shield, candidate], candidate)).toBeNull();
  });

  it('does not flag weapons', () => {
    const sword = createInventoryItem('c', { name: 'Longsword', category: 'weapon', equipped: true });
    expect(conflictingArmor([sword], sword)).toBeNull();
  });
});

describe('item weight', () => {
  it('multiplies by quantity', () => {
    expect(itemWeight(createInventoryItem('c', { weight: 3, quantity: 4 }))).toBe(12);
  });

  it('treats a weightless container as zero', () => {
    expect(itemWeight(createInventoryItem('c', { weight: 500, weightless: true }))).toBe(0);
  });

  it('tolerates a missing weight rather than producing NaN', () => {
    // 22 of 237 SRD equipment records carry no weight field.
    expect(itemWeight(createInventoryItem('c', { weight: Number.NaN, quantity: 2 }))).toBe(0);
  });

  it('never returns a negative weight for a negative quantity', () => {
    expect(itemWeight(createInventoryItem('c', { weight: 5, quantity: -3 }))).toBe(0);
  });
});

describe('equippability', () => {
  it('applies only to weapons and armour', () => {
    expect(isEquippable('weapon')).toBe(true);
    expect(isEquippable('armor')).toBe(true);
    expect(isEquippable('treasure')).toBe(false);
    expect(isEquippable('consumable')).toBe(false);
  });
});

describe('formatting', () => {
  it('lists only the denominations present', () => {
    expect(formatCurrency(purse({ gp: 5, cp: 2 }))).toBe('5 gp, 2 cp');
  });

  it('shows an empty purse as 0 gp', () => {
    expect(formatCurrency(emptyCurrency())).toBe('0 gp');
  });
});
