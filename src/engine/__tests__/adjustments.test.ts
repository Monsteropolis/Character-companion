import { describe, it, expect } from 'vitest';
import { totalAbilityScore, explainAbilityScore } from '../abilityScores';
import { deriveCharacter, emptyResolvedRules, type ResolvedRules } from '../derive';
import { createCharacter } from '../../domain/factories';
import { migrateCharacter, emptyStatOverrides } from '../../persistence/migrations';
import type { AbilityAdjustment, AbilityScoreBlock, Character } from '../../domain/types';

/**
 * Ability adjustments and manual overrides.
 *
 * Scores move constantly in play, and the two ways they move behave differently: a bonus stacks,
 * while an effect that sets a score to a fixed value explicitly does nothing if the score is
 * already higher. Conflating them produces a Barbarian with Strength 27.
 */

const block = (v: Partial<Record<string, number>> = {}): AbilityScoreBlock => ({
  base: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, ...v },
  method: 'manual',
  racial: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
  asi: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
  misc: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
  override: {},
});

const adjust = (over: Partial<AbilityAdjustment> = {}): AbilityAdjustment => ({
  id: 'a1',
  ability: 'str',
  kind: 'bonus',
  value: 2,
  duration: 'temporary',
  label: 'Test effect',
  note: '',
  createdAt: Date.now(),
  ...over,
});

const rules = (o: Partial<ResolvedRules> = {}): ResolvedRules => ({
  ...emptyResolvedRules(),
  hitDieByClass: { fighter: 10 },
  savingThrowsByClass: { fighter: ['str', 'con'] },
  skills: [
    { index: 'athletics', name: 'Athletics', ability: 'str' },
    { index: 'perception', name: 'Perception', ability: 'wis' },
  ],
  ...o,
});

describe('bonus adjustments', () => {
  it('stack with each other and with the base layers', () => {
    const score = totalAbilityScore(block({ str: 14 }), 'str', [
      adjust({ id: 'a', value: 2, label: 'Rage' }),
      adjust({ id: 'b', value: 1, label: 'Blessing' }),
    ]);
    expect(score).toBe(17);
  });

  it('can be negative, for curses and drains', () => {
    expect(totalAbilityScore(block({ str: 14 }), 'str', [adjust({ value: -4, label: 'Shadow drain' })])).toBe(10);
  });

  it('only affects its own ability', () => {
    const b = block({ str: 14, dex: 12 });
    expect(totalAbilityScore(b, 'dex', [adjust({ ability: 'str', value: 4 })])).toBe(12);
  });
});

describe('set adjustments', () => {
  it('raise a lower score to the set value', () => {
    // Belt of Hill Giant Strength: "your Strength score changes to 21".
    const score = totalAbilityScore(block({ str: 12 }), 'str', [
      adjust({ kind: 'set', value: 21, duration: 'permanent', label: 'Belt of Hill Giant Strength' }),
    ]);
    expect(score).toBe(21);
  });

  it('do nothing when the score is already higher', () => {
    const score = totalAbilityScore(block({ str: 22 }), 'str', [
      adjust({ kind: 'set', value: 21, label: 'Belt of Hill Giant Strength' }),
    ]);
    expect(score).toBe(22);
  });

  it('do not stack with one another -- the highest applies', () => {
    const score = totalAbilityScore(block({ str: 10 }), 'str', [
      adjust({ id: 'a', kind: 'set', value: 21, label: 'Hill Giant' }),
      adjust({ id: 'b', kind: 'set', value: 23, label: 'Stone Giant' }),
    ]);
    expect(score).toBe(23);
  });

  it('compete with accumulated bonuses rather than adding to them', () => {
    const score = totalAbilityScore(block({ str: 20 }), 'str', [
      adjust({ id: 'a', kind: 'bonus', value: 4, label: 'Enlarge' }),
      adjust({ id: 'b', kind: 'set', value: 21, label: 'Belt' }),
    ]);
    // 24 from bonuses beats the belt's 21; they must not sum to 45.
    expect(score).toBe(24);
  });
});

describe('raw override', () => {
  it('wins over every layer and every adjustment', () => {
    const b = { ...block({ str: 10 }), override: { str: 18 } };
    expect(totalAbilityScore(b, 'str', [adjust({ value: 6 })])).toBe(18);
  });
});

describe('clamping', () => {
  it('keeps adjusted scores inside the legal range', () => {
    expect(totalAbilityScore(block({ str: 20 }), 'str', [adjust({ value: 50 })])).toBe(30);
    expect(totalAbilityScore(block({ str: 8 }), 'str', [adjust({ value: -50 })])).toBe(1);
  });
});

describe('explainAbilityScore', () => {
  it('lists each contributing layer by name', () => {
    const b = block({ str: 15 });
    b.racial.str = 2;
    b.asi.str = 1;
    const parts = explainAbilityScore(b, 'str', [adjust({ label: "Bear's Endurance", value: 2 })]);

    expect(parts.map((p) => p.label)).toEqual([
      'Base score',
      'Racial bonus',
      'Ability Score Improvements',
      "Bear's Endurance",
    ]);
  });

  it('collapses to the override when one is set', () => {
    const b = { ...block(), override: { str: 19 } };
    const parts = explainAbilityScore(b, 'str', []);
    expect(parts).toHaveLength(1);
    expect(parts[0]?.kind).toBe('override');
  });

  it('names a set adjustment as setting rather than adding', () => {
    const parts = explainAbilityScore(block(), 'str', [
      adjust({ kind: 'set', value: 21, label: 'Belt' }),
    ]);
    expect(parts.some((p) => p.label.includes('sets to 21'))).toBe(true);
  });
});

describe('adjustments flow through derived statistics', () => {
  function fighter(over: Partial<Character> = {}): Character {
    return createCharacter({
      classes: [
        {
          classRef: { source: 'srd', index: 'fighter', name: 'Fighter' },
          subclassRef: null,
          level: 1,
          hitDiceSpent: 0,
          hitPointRolls: [],
        },
      ],
      abilityScores: block({ str: 14, dex: 12, con: 12, wis: 10 }),
      ...over,
    });
  }

  it('changes skills, saves and carrying capacity together', () => {
    const before = deriveCharacter(fighter(), rules(), []);
    const after = deriveCharacter(
      fighter({ abilityAdjustments: [adjust({ ability: 'str', value: 4, label: 'Enlarge' })] }),
      rules(),
      [],
    );

    expect(after.abilityScores.str).toBe(18);
    expect(after.abilityModifiers.str).toBe(4);
    expect(after.savingThrows.str.total).toBe(before.savingThrows.str.total + 2);
    expect(after.carryingCapacity).toBeGreaterThan(before.carryingCapacity);
  });

  it('changes AC when DEX is adjusted', () => {
    const after = deriveCharacter(
      fighter({ abilityAdjustments: [adjust({ ability: 'dex', value: 4, label: 'Cat\'s Grace' })] }),
      rules(),
      [],
    );
    // 10 + DEX (12 + 4 = 16 -> +3)
    expect(after.armorClass.total).toBe(13);
  });

  it('reports how many temporary adjustments are active', () => {
    const stats = deriveCharacter(
      fighter({
        abilityAdjustments: [
          adjust({ id: 'a', duration: 'temporary' }),
          adjust({ id: 'b', duration: 'permanent' }),
        ],
      }),
      rules(),
      [],
    );
    expect(stats.activeTemporaryAdjustments).toBe(1);
  });
});

describe('derived-stat overrides', () => {
  const base = createCharacter({
    classes: [
      {
        classRef: { source: 'srd', index: 'fighter', name: 'Fighter' },
        subclassRef: null,
        level: 1,
        hitDiceSpent: 0,
        hitPointRolls: [],
      },
    ],
    abilityScores: block({ dex: 14, con: 12 }),
  });

  it('replaces the computed AC while keeping the breakdown visible', () => {
    const stats = deriveCharacter(
      { ...base, statOverrides: { ...emptyStatOverrides(), armorClass: 21 } },
      rules(),
      [],
    );

    expect(stats.armorClass.total).toBe(21);
    // The rules-derived contributions survive so the player can see what was overridden.
    expect(stats.armorClass.contributions.length).toBeGreaterThan(1);
    expect(stats.armorClass.notes.join(' ')).toMatch(/overridden/i);
  });

  it('overrides initiative, speed and proficiency bonus independently', () => {
    const stats = deriveCharacter(
      {
        ...base,
        statOverrides: {
          ...emptyStatOverrides(),
          initiative: 9,
          speed: 60,
          proficiencyBonus: 5,
        },
      },
      rules(),
      [],
    );

    expect(stats.initiative.total).toBe(9);
    expect(stats.speed.total).toBe(60);
    expect(stats.proficiencyBonus).toBe(5);
  });

  it('propagates an overridden proficiency bonus into skills and saves', () => {
    const withProf = createCharacter({
      ...base,
      proficiencies: [
        { ref: { source: 'srd', index: 'skill-athletics', name: 'Athletics' }, from: 'class', expertise: false },
      ],
      statOverrides: { ...emptyStatOverrides(), proficiencyBonus: 6 },
    });
    const stats = deriveCharacter(withProf, rules(), []);
    const athletics = stats.skills.find((s) => s.index === 'athletics');
    // STR 10 (+0) with an overridden +6 proficiency.
    expect(athletics?.total).toBe(6);
  });

  it('lists which stats are overridden so the UI can mark them', () => {
    const stats = deriveCharacter(
      { ...base, statOverrides: { ...emptyStatOverrides(), armorClass: 21, speed: 60 } },
      rules(),
      [],
    );
    expect(stats.overriddenStats.sort()).toEqual(['armorClass', 'speed']);
  });

  it('computes normally when nothing is overridden', () => {
    const stats = deriveCharacter(base, rules(), []);
    expect(stats.overriddenStats).toEqual([]);
    expect(stats.armorClass.total).toBe(12);
  });
});

describe('schema migration v1 -> v2', () => {
  it('adds the new fields to a character saved before they existed', () => {
    // A real v1 character: no abilityAdjustments, no statOverrides.
    const legacy = {
      ...createCharacter({ identity: { ...createCharacter().identity, name: 'Old Save' } }),
      schemaVersion: 1,
    } as unknown as Record<string, unknown>;
    delete legacy.abilityAdjustments;
    delete legacy.statOverrides;

    const migrated = migrateCharacter(legacy as unknown as Character);

    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.abilityAdjustments).toEqual([]);
    expect(migrated.statOverrides).toEqual(emptyStatOverrides());
    // Nothing the user entered may be lost in the upgrade.
    expect(migrated.identity.name).toBe('Old Save');
  });

  it('leaves an already-current record untouched', () => {
    const current = createCharacter();
    expect(migrateCharacter(current)).toBe(current);
  });

  it('derives correctly from a migrated legacy character', () => {
    const legacy = { ...createCharacter({ abilityScores: block({ dex: 14 }) }), schemaVersion: 1 } as unknown as Record<string, unknown>;
    delete legacy.abilityAdjustments;
    delete legacy.statOverrides;

    const stats = deriveCharacter(migrateCharacter(legacy as unknown as Character), rules(), []);
    expect(stats.armorClass.total).toBe(12);
  });
});
