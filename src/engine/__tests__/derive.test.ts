import { describe, it, expect } from 'vitest';
import { deriveCharacter, type ResolvedRules } from '../derive';
import { createCharacter, createInventoryItem } from '../../domain/factories';
import type { AbilityId } from '../../rules/schemas/primitives';
import type { Character, InventoryItem } from '../../domain/types';

/**
 * Engine tests.
 *
 * Errors here are silent and compound -- a wrong proficiency bonus quietly corrupts every skill,
 * save and attack on the sheet -- so this suite favours golden characters with hand-verified
 * numbers over unit tests of internals.
 */

const SKILLS: ResolvedRules['skills'] = [
  { index: 'athletics', name: 'Athletics', ability: 'str' },
  { index: 'acrobatics', name: 'Acrobatics', ability: 'dex' },
  { index: 'stealth', name: 'Stealth', ability: 'dex' },
  { index: 'perception', name: 'Perception', ability: 'wis' },
  { index: 'investigation', name: 'Investigation', ability: 'int' },
  { index: 'insight', name: 'Insight', ability: 'wis' },
  { index: 'arcana', name: 'Arcana', ability: 'int' },
];

function rules(overrides: Partial<ResolvedRules> = {}): ResolvedRules {
  return {
    skills: SKILLS,
    raceSpeed: 30,
    hitDieByClass: { fighter: 10, wizard: 6, barbarian: 12, monk: 8, rogue: 8 },
    savingThrowsByClass: {
      fighter: ['str', 'con'],
      wizard: ['int', 'wis'],
      barbarian: ['str', 'con'],
      monk: ['str', 'dex'],
      rogue: ['dex', 'int'],
    },
    spellcastingAbilityByClass: { wizard: 'int' },
    featureIndices: [],
    featureNames: {},
    ...overrides,
  };
}

function character(overrides: Partial<Character> = {}): Character {
  return createCharacter(overrides);
}

function scores(v: Partial<Record<AbilityId, number>>) {
  return {
    base: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, ...v },
    method: 'manual' as const,
    racial: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    asi: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    misc: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    override: {},
  };
}

function armor(name: string, meta: InventoryItem['armor'], charId = 'c'): InventoryItem {
  return createInventoryItem(charId, { name, category: 'armor', equipped: true, armor: meta });
}

describe('golden character: level 1 Fighter', () => {
  // STR 16, DEX 14, CON 15, chain mail. Hand-verified against the 2014 rules.
  const fighter = character({
    classes: [
      {
        classRef: { source: 'srd', index: 'fighter', name: 'Fighter' },
        subclassRef: null,
        level: 1,
        hitDiceSpent: 0,
        hitPointRolls: [],
      },
    ],
    abilityScores: scores({ str: 16, dex: 14, con: 15, int: 8, wis: 12, cha: 10 }),
    proficiencies: [
      { ref: { source: 'srd', index: 'skill-athletics', name: 'Athletics' }, from: 'class', expertise: false },
      { ref: { source: 'srd', index: 'skill-perception', name: 'Perception' }, from: 'class', expertise: false },
    ],
  });

  const chainMail = armor('Chain Mail', {
    base: 16,
    dexBonus: false,
    maxDex: null,
    strMinimum: 13,
    stealthDisadvantage: true,
    isShield: false,
  });

  const stats = deriveCharacter(fighter, rules(), [chainMail]);

  it('computes ability modifiers', () => {
    expect(stats.abilityModifiers).toEqual({ str: 3, dex: 2, con: 2, int: -1, wis: 1, cha: 0 });
  });

  it('has a +2 proficiency bonus at level 1', () => {
    expect(stats.proficiencyBonus).toBe(2);
  });

  it('gives 12 hit points: the full d10 at level 1, plus CON +2', () => {
    expect(stats.maxHp.total).toBe(12);
  });

  it('has AC 16 in chain mail, ignoring DEX', () => {
    expect(stats.armorClass.total).toBe(16);
    // Heavy armour must not contribute a DEX term at all.
    expect(stats.armorClass.contributions.some((c) => c.source.includes('DEX'))).toBe(false);
  });

  it('is proficient in STR and CON saves only', () => {
    expect(stats.savingThrows.str.total).toBe(5);
    expect(stats.savingThrows.con.total).toBe(4);
    expect(stats.savingThrows.dex.total).toBe(2);
    expect(stats.savingThrows.dex.proficient).toBe(false);
  });

  it('adds proficiency to trained skills only', () => {
    const athletics = stats.skills.find((s) => s.index === 'athletics');
    const acrobatics = stats.skills.find((s) => s.index === 'acrobatics');
    expect(athletics?.total).toBe(5);
    expect(acrobatics?.total).toBe(2);
  });

  it('computes passive perception as 10 + skill modifier', () => {
    expect(stats.passivePerception).toBe(13);
  });

  it('has carrying capacity of STR x 15', () => {
    expect(stats.carryingCapacity).toBe(240);
  });
});

describe('golden character: level 5 Wizard', () => {
  const wizard = character({
    classes: [
      {
        classRef: { source: 'srd', index: 'wizard', name: 'Wizard' },
        subclassRef: null,
        level: 5,
        hitDiceSpent: 0,
        hitPointRolls: [6, 4, 3, 5, 4],
      },
    ],
    abilityScores: scores({ str: 8, dex: 14, con: 14, int: 18, wis: 12, cha: 10 }),
    spellcasting: {
      entries: [
        {
          classRef: { source: 'srd', index: 'wizard', name: 'Wizard' },
          ability: 'int',
          preparation: 'spellbook',
          known: [],
          ritualCasting: true,
        },
      ],
    },
  });

  const stats = deriveCharacter(wizard, rules(), []);

  it('has a +3 proficiency bonus at level 5', () => {
    expect(stats.proficiencyBonus).toBe(3);
  });

  it('computes spell save DC and attack bonus', () => {
    // 8 + 3 proficiency + 4 INT = 15; attack +7.
    expect(stats.spellSaveDc['wizard']).toBe(15);
    expect(stats.spellAttackBonus['wizard']).toBe(7);
  });

  it('sums recorded hit point rolls rather than guessing', () => {
    // Level 1 is the full d6, then the four recorded rolls, plus CON 2 x 5.
    expect(stats.maxHp.total).toBe(6 + 4 + 3 + 5 + 4 + 10);
  });

  it('has AC 12 unarmoured', () => {
    expect(stats.armorClass.total).toBe(12);
  });
});

describe('armour class', () => {
  const base = character({ abilityScores: scores({ dex: 18, con: 16, wis: 16 }) });

  it('caps DEX on medium armour', () => {
    const breastplate = armor('Breastplate', {
      base: 14, dexBonus: true, maxDex: 2, strMinimum: 0, stealthDisadvantage: false, isShield: false,
    });
    const stats = deriveCharacter(base, rules(), [breastplate]);
    // DEX +4 capped to +2, so 16 not 18.
    expect(stats.armorClass.total).toBe(16);
    expect(stats.armorClass.contributions.some((c) => c.source.includes('capped'))).toBe(true);
  });

  it('does not cap DEX on light armour', () => {
    const leather = armor('Leather Armor', {
      base: 11, dexBonus: true, maxDex: null, strMinimum: 0, stealthDisadvantage: false, isShield: false,
    });
    expect(deriveCharacter(base, rules(), [leather]).armorClass.total).toBe(15);
  });

  it('adds a shield on top of worn armour', () => {
    const leather = armor('Leather Armor', {
      base: 11, dexBonus: true, maxDex: null, strMinimum: 0, stealthDisadvantage: false, isShield: false,
    });
    const shield = armor('Shield', {
      base: 2, dexBonus: false, maxDex: null, strMinimum: 0, stealthDisadvantage: false, isShield: true,
    });
    expect(deriveCharacter(base, rules(), [leather, shield]).armorClass.total).toBe(17);
  });

  it('uses Barbarian Unarmored Defense when it beats the alternatives', () => {
    const barbarian = character({
      classes: [{
        classRef: { source: 'srd', index: 'barbarian', name: 'Barbarian' },
        subclassRef: null, level: 1, hitDiceSpent: 0, hitPointRolls: [],
      }],
      abilityScores: scores({ dex: 18, con: 16 }),
    });
    const stats = deriveCharacter(
      barbarian,
      rules({ featureIndices: ['barbarian-unarmored-defense'] }),
      [],
    );
    // 10 + DEX 4 + CON 3 = 17, beating the plain 14.
    expect(stats.armorClass.total).toBe(17);
  });

  it('prefers worn armour when the feature formula is worse', () => {
    const barbarian = character({
      classes: [{
        classRef: { source: 'srd', index: 'barbarian', name: 'Barbarian' },
        subclassRef: null, level: 1, hitDiceSpent: 0, hitPointRolls: [],
      }],
      abilityScores: scores({ dex: 10, con: 10 }),
    });
    const plate = armor('Plate Armor', {
      base: 18, dexBonus: false, maxDex: null, strMinimum: 15, stealthDisadvantage: true, isShield: false,
    });
    const stats = deriveCharacter(
      barbarian,
      rules({ featureIndices: ['barbarian-unarmored-defense'] }),
      [plate],
    );
    // Formulas compete rather than stack, and armour wins here.
    expect(stats.armorClass.total).toBe(18);
  });

  it('denies the Monk formula when a shield is used, unlike the Barbarian', () => {
    const monk = character({ abilityScores: scores({ dex: 16, wis: 16 }) });
    const shield = armor('Shield', {
      base: 2, dexBonus: false, maxDex: null, strMinimum: 0, stealthDisadvantage: false, isShield: true,
    });

    const withShield = deriveCharacter(monk, rules({ featureIndices: ['monk-unarmored-defense'] }), [shield]);
    // Falls back to 10 + DEX 3 + shield 2 = 15, not the 16 the formula would give.
    expect(withShield.armorClass.total).toBe(15);

    const withoutShield = deriveCharacter(monk, rules({ featureIndices: ['monk-unarmored-defense'] }), []);
    expect(withoutShield.armorClass.total).toBe(16);
  });

  it('explains its total through contributions', () => {
    const breastplate = armor('Breastplate', {
      base: 14, dexBonus: true, maxDex: 2, strMinimum: 0, stealthDisadvantage: false, isShield: false,
    });
    const stats = deriveCharacter(base, rules(), [breastplate]);
    const sources = stats.armorClass.contributions.map((c) => c.source);
    expect(sources).toContain('Breastplate');
    expect(stats.armorClass.contributions.reduce((n, c) => n + c.value, 0)).toBe(
      stats.armorClass.total,
    );
  });

  it('ignores unequipped armour', () => {
    const plate = { ...armor('Plate Armor', {
      base: 18, dexBonus: false, maxDex: null, strMinimum: 15, stealthDisadvantage: true, isShield: false,
    }), equipped: false };
    expect(deriveCharacter(base, rules(), [plate]).armorClass.total).toBe(14);
  });
});

describe('speed', () => {
  it('is reduced by heavy armour worn below its Strength requirement', () => {
    const weakling = character({ abilityScores: scores({ str: 10 }) });
    const plate = armor('Plate Armor', {
      base: 18, dexBonus: false, maxDex: null, strMinimum: 15, stealthDisadvantage: true, isShield: false,
    });
    const stats = deriveCharacter(weakling, rules(), [plate]);
    expect(stats.speed.total).toBe(20);
    expect(stats.speed.notes.join(' ')).toMatch(/requires Strength 15/);
  });

  it('is unaffected when the Strength requirement is met', () => {
    const strong = character({ abilityScores: scores({ str: 15 }) });
    const plate = armor('Plate Armor', {
      base: 18, dexBonus: false, maxDex: null, strMinimum: 15, stealthDisadvantage: true, isShield: false,
    });
    expect(deriveCharacter(strong, rules(), [plate]).speed.total).toBe(30);
  });
});

describe('exhaustion', () => {
  const base = character({ abilityScores: scores({ dex: 14 }) });

  it('imposes disadvantage on checks from level 1', () => {
    const tired = { ...base, resources: { ...base.resources, exhaustion: 1 } };
    const stats = deriveCharacter(tired, rules(), []);
    expect(stats.skills[0]?.advantage).toBe('disadvantage');
  });

  it('halves speed at level 2 and zeroes it at level 5', () => {
    const two = deriveCharacter({ ...base, resources: { ...base.resources, exhaustion: 2 } }, rules(), []);
    expect(two.speed.total).toBe(15);

    const five = deriveCharacter({ ...base, resources: { ...base.resources, exhaustion: 5 } }, rules(), []);
    expect(five.speed.total).toBe(0);
  });

  it('imposes disadvantage on saves at level 3', () => {
    const stats = deriveCharacter({ ...base, resources: { ...base.resources, exhaustion: 3 } }, rules(), []);
    expect(stats.savingThrows.str.advantage).toBe('disadvantage');
  });

  it('reports its cumulative effects', () => {
    const stats = deriveCharacter({ ...base, resources: { ...base.resources, exhaustion: 3 } }, rules(), []);
    expect(stats.exhaustionEffects).toHaveLength(3);
  });
});

describe('overrides', () => {
  it('lets a manual HP maximum win over the computed value', () => {
    const c = character({
      classes: [{
        classRef: { source: 'srd', index: 'fighter', name: 'Fighter' },
        subclassRef: null, level: 1, hitDiceSpent: 0, hitPointRolls: [],
      }],
      abilityScores: scores({ con: 14 }),
    });
    const overridden = { ...c, resources: { ...c.resources, maxHpOverride: 40 } };
    expect(deriveCharacter(overridden, rules(), []).maxHp.total).toBe(40);
  });

  it('lets an ability score override win over its layers', () => {
    const c = character({
      abilityScores: { ...scores({ str: 8 }), override: { str: 19 } },
    });
    const stats = deriveCharacter(c, rules(), []);
    expect(stats.abilityScores.str).toBe(19);
    expect(stats.abilityModifiers.str).toBe(4);
  });
});

describe('expertise', () => {
  it('doubles the proficiency bonus', () => {
    const rogue = character({
      classes: [{
        classRef: { source: 'srd', index: 'rogue', name: 'Rogue' },
        subclassRef: null, level: 1, hitDiceSpent: 0, hitPointRolls: [],
      }],
      abilityScores: scores({ dex: 16 }),
      proficiencies: [
        { ref: { source: 'srd', index: 'skill-stealth', name: 'Stealth' }, from: 'class', expertise: true },
      ],
    });
    const stealth = deriveCharacter(rogue, rules(), []).skills.find((s) => s.index === 'stealth');
    // DEX 3 + double proficiency 4 = 7.
    expect(stealth?.total).toBe(7);
    expect(stealth?.expertise).toBe(true);
  });
});

describe('encumbrance', () => {
  const strong = character({ abilityScores: scores({ str: 10 }) });

  it('tolerates items with no weight rather than producing NaN', () => {
    const weightless = createInventoryItem('c', { name: 'Mystery', weight: Number.NaN, quantity: 1 });
    const stats = deriveCharacter(strong, rules(), [weightless]);
    expect(Number.isNaN(stats.currentWeight)).toBe(false);
    expect(stats.currentWeight).toBe(0);
  });

  it('multiplies weight by quantity', () => {
    const rations = createInventoryItem('c', { name: 'Rations', weight: 2, quantity: 5 });
    expect(deriveCharacter(strong, rules(), [rations]).currentWeight).toBe(10);
  });

  it('crosses thresholds at STR x5 and x10', () => {
    const heavy = createInventoryItem('c', { name: 'Anvil', weight: 60, quantity: 1 });
    expect(deriveCharacter(strong, rules(), [heavy]).encumbrance).toBe('encumbered');

    const heavier = createInventoryItem('c', { name: 'Anvils', weight: 120, quantity: 1 });
    expect(deriveCharacter(strong, rules(), [heavier]).encumbrance).toBe('heavily-encumbered');

    const absurd = createInventoryItem('c', { name: 'Statue', weight: 200, quantity: 1 });
    expect(deriveCharacter(strong, rules(), [absurd]).encumbrance).toBe('overloaded');
  });

  it('ignores weightless containers', () => {
    const bag = createInventoryItem('c', { name: 'Bag of Holding', weight: 500, weightless: true });
    expect(deriveCharacter(strong, rules(), [bag]).currentWeight).toBe(0);
  });
});

describe('unmodelled effects', () => {
  it('surfaces features it cannot express numerically instead of dropping them', () => {
    const barbarian = character({
      classes: [{
        classRef: { source: 'srd', index: 'barbarian', name: 'Barbarian' },
        subclassRef: null, level: 1, hitDiceSpent: 0, hitPointRolls: [],
      }],
    });
    const stats = deriveCharacter(barbarian, rules({ featureIndices: ['barbarian-rage'] }), []);
    expect(stats.unmodelledEffects.join(' ')).toMatch(/resistance to bludgeoning/i);
  });

  it('reports an unknown feature rather than silently ignoring it', () => {
    const stats = deriveCharacter(
      character(),
      rules({ featureIndices: ['some-homebrew-feature'], featureNames: { 'some-homebrew-feature': 'Mystery Power' } }),
      [],
    );
    expect(stats.unmodelledEffects).toContain('Mystery Power');
  });
});

describe('multiclassing', () => {
  it('derives proficiency bonus from total level, not per class', () => {
    const multi = character({
      classes: [
        { classRef: { source: 'srd', index: 'fighter', name: 'Fighter' }, subclassRef: null, level: 3, hitDiceSpent: 0, hitPointRolls: [6, 7] },
        { classRef: { source: 'srd', index: 'wizard', name: 'Wizard' }, subclassRef: null, level: 3, hitDiceSpent: 0, hitPointRolls: [4, 3, 5] },
      ],
      abilityScores: scores({ con: 12 }),
    });
    const stats = deriveCharacter(multi, rules(), []);
    expect(stats.totalLevel).toBe(6);
    // Character level 6 gives +3, not the +2 either class alone would.
    expect(stats.proficiencyBonus).toBe(3);
  });

  it('combines saving throw proficiencies from every class', () => {
    const multi = character({
      classes: [
        { classRef: { source: 'srd', index: 'fighter', name: 'Fighter' }, subclassRef: null, level: 1, hitDiceSpent: 0, hitPointRolls: [] },
        { classRef: { source: 'srd', index: 'wizard', name: 'Wizard' }, subclassRef: null, level: 1, hitDiceSpent: 0, hitPointRolls: [4] },
      ],
    });
    const stats = deriveCharacter(multi, rules(), []);
    expect(stats.savingThrows.str.proficient).toBe(true);
    expect(stats.savingThrows.int.proficient).toBe(true);
  });
});

describe('empty character', () => {
  it('produces sane values before any class is chosen', () => {
    const stats = deriveCharacter(character(), rules(), []);
    expect(stats.totalLevel).toBe(1);
    expect(stats.proficiencyBonus).toBe(2);
    expect(stats.armorClass.total).toBe(10);
    expect(stats.maxHp.total).toBe(0);
    expect(stats.skills).toHaveLength(SKILLS.length);
  });
});
