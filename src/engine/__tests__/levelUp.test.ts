import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import {
  levelUpPlan,
  applyLevelUp,
  revertLevelUp,
  validateChoices,
  defaultChoices,
  grantsAsiAt,
  asiLevelsFor,
  type LevelUpContext,
  type LevelUpChoices,
} from '../levelUp';
import { createCharacter } from '../../domain/factories';
import { deriveCharacter, emptyResolvedRules } from '../derive';
import type { AbilityId } from '../../rules/schemas/primitives';
import type { Character, ContentRef } from '../../domain/types';

/**
 * Level progression, driven by the real SRD tables.
 *
 * The ASI levels, hit dice and slot progressions asserted here are the published ones, so a
 * dataset refresh that changes them fails loudly rather than silently mislevelling characters.
 */

const dir = fileURLToPath(new URL('../../rules/data/2014/', import.meta.url));
const LEVELS = JSON.parse(readFileSync(dir + '5e-SRD-Levels.json', 'utf8')) as any[];
const FEATURES = JSON.parse(readFileSync(dir + '5e-SRD-Features.json', 'utf8')) as any[];
const CLASSES = JSON.parse(readFileSync(dir + '5e-SRD-Classes.json', 'utf8')) as any[];

// Class progression rows only: rows carrying a subclass still report the parent class.
const CLASS_ROWS = LEVELS.filter((r) => !r.subclass);

const ctx: LevelUpContext = {
  levelRows: CLASS_ROWS.map((r) => ({
    classIndex: r.class.index,
    level: r.level,
    abilityScoreBonuses: r.ability_score_bonuses,
    features: r.features ?? [],
    spellcasting: r.spellcasting,
    classSpecific: r.class_specific,
  })),
  features: FEATURES.map((f) => ({
    index: f.index,
    name: f.name,
    desc: f.desc,
    classIndex: f.class.index,
    subclassIndex: f.subclass?.index ?? null,
    level: f.level,
  })),
  hitDieByClass: Object.fromEntries(CLASSES.map((c) => [c.index, c.hit_die])),
  multiclassPrerequisites: {
    paladin: [
      { ability: 'str', minimum: 13 },
      { ability: 'cha', minimum: 13 },
    ],
    wizard: [{ ability: 'int', minimum: 13 }],
  },
  subclassLevelByClass: {
    cleric: 1, sorcerer: 1, warlock: 1, druid: 2, wizard: 2,
    barbarian: 3, bard: 3, fighter: 3, monk: 3, paladin: 3, ranger: 3, rogue: 3,
  },
};

const ref = (index: string, name: string): ContentRef => ({ source: 'srd', index, name });

function character(over: Partial<Character> = {}): Character {
  return createCharacter({
    abilityScores: {
      base: { str: 15, dex: 14, con: 14, int: 12, wis: 10, cha: 8 },
      method: 'manual',
      racial: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
      asi: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
      misc: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
      override: {},
    },
    ...over,
  });
}

function atLevel(classIndex: string, name: string, level: number, over: Partial<Character> = {}) {
  return character({
    classes: [
      {
        classRef: ref(classIndex, name),
        subclassRef: null,
        level,
        hitDiceSpent: 0,
        hitPointRolls: Array.from({ length: level }, () => 5),
      },
    ],
    ...over,
  });
}

describe('ASI detection', () => {
  it('finds the published ASI levels for every class', () => {
    // Most classes: 4, 8, 12, 16, 19. Fighter and Rogue get extras.
    expect(asiLevelsFor(ctx, 'wizard')).toEqual([4, 8, 12, 16, 19]);
    expect(asiLevelsFor(ctx, 'fighter')).toEqual([4, 6, 8, 12, 14, 16, 19]);
    expect(asiLevelsFor(ctx, 'rogue')).toEqual([4, 8, 10, 12, 16, 19]);
  });

  it('does not grant an ASI at every level', () => {
    // The cumulative field would say yes on 17 of 20 Fighter levels if read directly.
    expect(grantsAsiAt(ctx, 'fighter', 5)).toBe(false);
    expect(grantsAsiAt(ctx, 'fighter', 6)).toBe(true);
    expect(grantsAsiAt(ctx, 'fighter', 7)).toBe(false);
  });

  it('never grants one at level 1', () => {
    for (const cls of CLASSES) expect(grantsAsiAt(ctx, cls.index, 1)).toBe(false);
  });
});

describe('planning a level', () => {
  it('reports the next level and total', () => {
    const plan = levelUpPlan(atLevel('fighter', 'Fighter', 3), ref('fighter', 'Fighter'), ctx);
    expect(plan.fromLevel).toBe(3);
    expect(plan.toLevel).toBe(4);
    expect(plan.totalLevelAfter).toBe(4);
    expect(plan.isNewClass).toBe(false);
  });

  it('mutates nothing', () => {
    const before = atLevel('fighter', 'Fighter', 3);
    const snapshot = JSON.stringify(before);
    levelUpPlan(before, ref('fighter', 'Fighter'), ctx);
    // The whole point of a plan: reviewing a level cannot change the character.
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('reports an ASI at the right level and not otherwise', () => {
    expect(levelUpPlan(atLevel('fighter', 'Fighter', 3), ref('fighter', 'Fighter'), ctx).grantsAsi).toBe(true);
    expect(levelUpPlan(atLevel('fighter', 'Fighter', 4), ref('fighter', 'Fighter'), ctx).grantsAsi).toBe(false);
  });

  it('requires a subclass at the class-appropriate level', () => {
    const toThree = levelUpPlan(atLevel('fighter', 'Fighter', 2), ref('fighter', 'Fighter'), ctx);
    expect(toThree.subclassRequired).toBe(true);

    const toTwo = levelUpPlan(atLevel('fighter', 'Fighter', 1), ref('fighter', 'Fighter'), ctx);
    expect(toTwo.subclassRequired).toBe(false);
  });

  it('requires a cleric subclass at level 1', () => {
    const plan = levelUpPlan(character(), ref('cleric', 'Cleric'), ctx);
    expect(plan.subclassRequired).toBe(true);
  });

  it('does not ask again once a subclass is chosen', () => {
    const withSubclass = character({
      classes: [
        {
          classRef: ref('fighter', 'Fighter'),
          subclassRef: ref('champion', 'Champion'),
          level: 3,
          hitDiceSpent: 0,
          hitPointRolls: [6, 6, 6],
        },
      ],
    });
    expect(levelUpPlan(withSubclass, ref('fighter', 'Fighter'), ctx).subclassRequired).toBe(false);
  });

  it('lists the real features gained', () => {
    const plan = levelUpPlan(atLevel('fighter', 'Fighter', 1), ref('fighter', 'Fighter'), ctx);
    expect(plan.newFeatures.map((f) => f.name)).toContain('Action Surge (1 use)');
  });

  it('reports the proficiency bonus changing', () => {
    const plan = levelUpPlan(atLevel('fighter', 'Fighter', 4), ref('fighter', 'Fighter'), ctx);
    expect(plan.proficiencyBonusBefore).toBe(2);
    expect(plan.proficiencyBonusAfter).toBe(3);
  });

  it('reports new spell slots for a caster', () => {
    const plan = levelUpPlan(atLevel('wizard', 'Wizard', 2), ref('wizard', 'Wizard'), ctx);
    expect(plan.slotsBefore).toEqual({ 1: 3 });
    expect(plan.slotsAfter).toEqual({ 1: 4, 2: 2 });
    expect(plan.cantripsKnownAfter).toBe(3);
  });

  it('grants the full hit die automatically only at the first character level', () => {
    expect(levelUpPlan(character(), ref('fighter', 'Fighter'), ctx).hpIsAutomatic).toBe(true);
    expect(levelUpPlan(atLevel('fighter', 'Fighter', 1), ref('fighter', 'Fighter'), ctx).hpIsAutomatic).toBe(false);
  });

  it('blocks past level 20', () => {
    const plan = levelUpPlan(atLevel('fighter', 'Fighter', 20), ref('fighter', 'Fighter'), ctx);
    expect(plan.blockers).toHaveLength(1);
  });
});

describe('multiclassing', () => {
  it('treats a new class as level 1 in that class', () => {
    const plan = levelUpPlan(atLevel('fighter', 'Fighter', 3), ref('wizard', 'Wizard'), ctx);
    expect(plan.isNewClass).toBe(true);
    expect(plan.fromLevel).toBe(0);
    expect(plan.toLevel).toBe(1);
    // Total character level still advances, so proficiency comes from the combined level.
    expect(plan.totalLevelAfter).toBe(4);
    expect(plan.proficiencyBonusAfter).toBe(2);
  });

  it('warns about unmet prerequisites without blocking', () => {
    // INT 12 is below the 13 a Wizard multiclass normally requires.
    const plan = levelUpPlan(atLevel('fighter', 'Fighter', 3), ref('wizard', 'Wizard'), ctx);
    expect(plan.multiclassWarnings).toHaveLength(1);
    expect(plan.multiclassWarnings[0]).toMatch(/INT 13/);
    // A warning, never a block -- the DM may have ruled otherwise.
    expect(plan.blockers).toHaveLength(0);
  });

  it('does not warn when prerequisites are met', () => {
    const smart = atLevel('fighter', 'Fighter', 3, {
      abilityScores: {
        base: { str: 15, dex: 14, con: 14, int: 16, wis: 10, cha: 8 },
        method: 'manual',
        racial: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
        asi: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
        misc: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
        override: {},
      },
    });
    expect(levelUpPlan(smart, ref('wizard', 'Wizard'), ctx).multiclassWarnings).toHaveLength(0);
  });

  it('does not warn on the very first class', () => {
    expect(levelUpPlan(character(), ref('wizard', 'Wizard'), ctx).multiclassWarnings).toHaveLength(0);
  });
});

describe('validation', () => {
  // A level-3 Fighter that already has its subclass, so only the ASI is outstanding. A
  // character past the subclass level WITHOUT one is an invalid state, and the plan correctly
  // keeps asking until it is resolved.
  const subclassed = character({
    classes: [
      {
        classRef: ref('fighter', 'Fighter'),
        subclassRef: ref('champion', 'Champion'),
        level: 3,
        hitDiceSpent: 0,
        hitPointRolls: [6, 6, 6],
      },
    ],
  });
  const plan = levelUpPlan(subclassed, ref('fighter', 'Fighter'), ctx);

  it('requires a subclass when the level demands one', () => {
    const choices = { ...defaultChoices(plan), asi: { kind: 'ability' as const, increases: [{ ability: 'str' as AbilityId, amount: 2 }] } };
    const toThree = levelUpPlan(atLevel('fighter', 'Fighter', 2), ref('fighter', 'Fighter'), ctx);
    expect(validateChoices(toThree, defaultChoices(toThree))).toContain('Choose a subclass to continue.');
    void choices;
  });

  it('requires an ASI decision when one is offered', () => {
    expect(validateChoices(plan, defaultChoices(plan))).toContain(
      'Choose an Ability Score Improvement or a feat.',
    );
  });

  it('requires exactly two points of ability increase', () => {
    const three: LevelUpChoices = {
      ...defaultChoices(plan),
      asi: { kind: 'ability', increases: [{ ability: 'str', amount: 3 }] },
    };
    expect(validateChoices(plan, three)).toContain(
      'An Ability Score Improvement distributes exactly 2 points.',
    );

    const two: LevelUpChoices = {
      ...defaultChoices(plan),
      asi: { kind: 'ability', increases: [{ ability: 'str', amount: 1 }, { ability: 'con', amount: 1 }] },
    };
    expect(validateChoices(plan, two)).toEqual([]);
  });

  it('accepts a feat instead of an increase', () => {
    const feat: LevelUpChoices = {
      ...defaultChoices(plan),
      asi: { kind: 'feat', featRef: ref('grappler', 'Grappler') },
    };
    expect(validateChoices(plan, feat)).toEqual([]);
  });

  it('rejects a roll higher than the hit die', () => {
    const impossible: LevelUpChoices = {
      ...defaultChoices(plan),
      hpMethod: 'roll',
      hpValue: 99,
      asi: { kind: 'feat', featRef: ref('grappler', 'Grappler') },
    };
    expect(validateChoices(plan, impossible)).toContain('A d10 cannot roll higher than 10.');
  });

  it('allows a manual value above the die, since a DM may grant it', () => {
    const manual: LevelUpChoices = {
      ...defaultChoices(plan),
      hpMethod: 'manual',
      hpValue: 99,
      asi: { kind: 'feat', featRef: ref('grappler', 'Grappler') },
    };
    expect(validateChoices(plan, manual)).toEqual([]);
  });
});

describe('applying a level', () => {
  const base = atLevel('fighter', 'Fighter', 3);
  const plan = levelUpPlan(base, ref('fighter', 'Fighter'), ctx);
  const choices: LevelUpChoices = {
    hpMethod: 'roll',
    hpValue: 7,
    asi: { kind: 'ability', increases: [{ ability: 'str', amount: 2 }] },
    subclassRef: null,
    newSpells: [],
  };

  it('raises the class level and records the roll', () => {
    const { character: next } = applyLevelUp(base, plan, choices, 'rec-1');
    expect(next.classes[0]?.level).toBe(4);
    expect(next.classes[0]?.hitPointRolls).toEqual([5, 5, 5, 7]);
  });

  it('applies the ASI into its own layer, leaving base scores untouched', () => {
    const { character: next } = applyLevelUp(base, plan, choices, 'rec-1');
    expect(next.abilityScores.asi.str).toBe(2);
    // Base stays as the player entered it, which is what makes undo clean.
    expect(next.abilityScores.base.str).toBe(15);
  });

  it('raises current hit points by the amount gained', () => {
    const withHp = { ...base, resources: { ...base.resources, currentHp: 20 } };
    const { character: next, record } = applyLevelUp(withHp, plan, choices, 'rec-1');
    // 7 rolled + CON +2.
    expect(record.hpGained).toBe(9);
    expect(next.resources.currentHp).toBe(29);
  });

  it('writes a record capturing exactly what changed', () => {
    const { record } = applyLevelUp(base, plan, choices, 'rec-1');
    expect(record.classIndex).toBe('fighter');
    expect(record.level).toBe(4);
    expect(record.hpRoll).toBe(7);
    expect(record.abilityIncreases).toEqual([{ ability: 'str', amount: 2 }]);
    expect(record.createdClass).toBe(false);
  });

  it('creates a class entry when multiclassing', () => {
    const wizardPlan = levelUpPlan(base, ref('wizard', 'Wizard'), ctx);
    const { character: next, record } = applyLevelUp(
      base,
      wizardPlan,
      { ...defaultChoices(wizardPlan), hpValue: 4 },
      'rec-2',
    );
    expect(next.classes).toHaveLength(2);
    expect(next.classes[1]?.classRef.index).toBe('wizard');
    expect(record.createdClass).toBe(true);
  });

  it('records a subclass choice', () => {
    const toThree = levelUpPlan(atLevel('fighter', 'Fighter', 2), ref('fighter', 'Fighter'), ctx);
    const { character: next } = applyLevelUp(
      atLevel('fighter', 'Fighter', 2),
      toThree,
      { ...defaultChoices(toThree), subclassRef: ref('champion', 'Champion') },
      'rec-3',
    );
    expect(next.classes[0]?.subclassRef?.index).toBe('champion');
    expect(next.choices.some((c) => c.source === 'subclass')).toBe(true);
  });

  it('adds chosen spells to the caster entry', () => {
    const wizard = atLevel('wizard', 'Wizard', 2);
    const wizardPlan = levelUpPlan(wizard, ref('wizard', 'Wizard'), ctx);
    const { character: next } = applyLevelUp(
      wizard,
      wizardPlan,
      { ...defaultChoices(wizardPlan), newSpells: [ref('fireball', 'Fireball')] },
      'rec-4',
    );
    expect(next.spellcasting?.entries[0]?.known.map((s) => s.ref.index)).toContain('fireball');
  });
});

describe('undo', () => {
  const base = atLevel('fighter', 'Fighter', 3, {
    resources: { ...createCharacter().resources, currentHp: 24 },
  });
  const plan = levelUpPlan(base, ref('fighter', 'Fighter'), ctx);
  const choices: LevelUpChoices = {
    hpMethod: 'roll',
    hpValue: 7,
    asi: { kind: 'ability', increases: [{ ability: 'str', amount: 1 }, { ability: 'con', amount: 1 }] },
    subclassRef: null,
    newSpells: [],
  };

  it('restores the character exactly', () => {
    const { character: levelled, record } = applyLevelUp(base, plan, choices, 'rec-5');
    const reverted = revertLevelUp(levelled, record);

    expect(reverted.classes[0]?.level).toBe(3);
    expect(reverted.classes[0]?.hitPointRolls).toEqual([5, 5, 5]);
    expect(reverted.abilityScores.asi.str).toBe(0);
    expect(reverted.abilityScores.asi.con).toBe(0);
    expect(reverted.resources.currentHp).toBe(24);
  });

  it('does not revive a downed character on the way back', () => {
    const downed = atLevel('fighter', 'Fighter', 3, {
      resources: { ...createCharacter().resources, currentHp: 0 },
    });
    const downedPlan = levelUpPlan(downed, ref('fighter', 'Fighter'), ctx);
    const { character: levelled, record } = applyLevelUp(downed, downedPlan, choices, 'rec-downed');

    expect(revertLevelUp(levelled, record).resources.currentHp).toBe(0);
  });

  it('removes a class created by the level being undone', () => {
    const wizardPlan = levelUpPlan(base, ref('wizard', 'Wizard'), ctx);
    const { character: levelled, record } = applyLevelUp(
      base,
      wizardPlan,
      { ...defaultChoices(wizardPlan), hpValue: 4 },
      'rec-6',
    );
    expect(levelled.classes).toHaveLength(2);

    const reverted = revertLevelUp(levelled, record);
    expect(reverted.classes).toHaveLength(1);
    expect(reverted.classes[0]?.classRef.index).toBe('fighter');
  });

  it('retracts a subclass chosen at that level', () => {
    const source = atLevel('fighter', 'Fighter', 2);
    const toThree = levelUpPlan(source, ref('fighter', 'Fighter'), ctx);
    const { character: levelled, record } = applyLevelUp(
      source,
      toThree,
      { ...defaultChoices(toThree), subclassRef: ref('champion', 'Champion') },
      'rec-7',
    );

    const reverted = revertLevelUp(levelled, record);
    expect(reverted.classes[0]?.subclassRef).toBeNull();
    expect(reverted.choices.some((c) => c.source === 'subclass')).toBe(false);
  });

  it('removes spells learned at that level', () => {
    const wizard = atLevel('wizard', 'Wizard', 2);
    const wizardPlan = levelUpPlan(wizard, ref('wizard', 'Wizard'), ctx);
    const { character: levelled, record } = applyLevelUp(
      wizard,
      wizardPlan,
      { ...defaultChoices(wizardPlan), newSpells: [ref('fireball', 'Fireball')] },
      'rec-8',
    );

    const reverted = revertLevelUp(levelled, record);
    const known = reverted.spellcasting?.entries[0]?.known ?? [];
    expect(known.map((s) => s.ref.index)).not.toContain('fireball');
  });

  it('round-trips without drift over several levels', () => {
    let current = base;
    const records = [];

    for (let i = 0; i < 3; i++) {
      const p = levelUpPlan(current, ref('fighter', 'Fighter'), ctx);
      const c: LevelUpChoices = {
        ...defaultChoices(p),
        hpValue: 6,
        asi: p.grantsAsi ? { kind: 'feat', featRef: ref('grappler', 'Grappler') } : { kind: 'none' },
      };
      const result = applyLevelUp(current, p, c, `multi-${i}`);
      current = result.character;
      records.push(result.record);
    }

    expect(current.classes[0]?.level).toBe(6);

    for (const record of [...records].reverse()) current = revertLevelUp(current, record);

    expect(current.classes[0]?.level).toBe(3);
    expect(current.classes[0]?.hitPointRolls).toEqual([5, 5, 5]);
    expect(current.resources.currentHp).toBe(24);
  });
});

describe('derived statistics follow a level up', () => {
  it('raises max HP and proficiency bonus', () => {
    const rules = {
      ...emptyResolvedRules(),
      hitDieByClass: { fighter: 10 },
      savingThrowsByClass: { fighter: ['str', 'con'] as AbilityId[] },
    };

    const base = atLevel('fighter', 'Fighter', 4);
    const before = deriveCharacter(base, rules, []);

    const plan = levelUpPlan(base, ref('fighter', 'Fighter'), ctx);
    const { character: after } = applyLevelUp(
      base,
      plan,
      { ...defaultChoices(plan), hpValue: 6 },
      'rec-9',
    );
    const stats = deriveCharacter(after, rules, []);

    expect(stats.proficiencyBonus).toBe(before.proficiencyBonus + 1);
    expect(stats.maxHp.total).toBeGreaterThan(before.maxHp.total);
  });
});
