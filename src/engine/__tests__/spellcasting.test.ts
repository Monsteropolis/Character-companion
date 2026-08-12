import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import {
  combinedCasterLevel,
  slotsFor,
  preparedLimit,
  preparationModeFor,
  deriveSpellcasting,
  castableSlots,
  restoreSlots,
  scaledDice,
  pactSlotKey,
  PACT_SLOT_OFFSET,
  type LevelSlotRow,
} from '../spellcasting';
import { deriveClassResources, syncPools, restorePools, UNLIMITED, type ClassLevelRow } from '../classResources';
import { createCharacter } from '../../domain/factories';
import type { AbilityId } from '../../rules/schemas/primitives';
import type { Character } from '../../domain/types';

/**
 * Spellcasting and class resources, driven by the real SRD level table.
 *
 * Using the shipped data rather than fixtures is what makes these tests meaningful: the slot
 * progressions, ki points and rage counts asserted here are the published ones, so a dataset
 * refresh that changes them fails loudly.
 */

const dir = fileURLToPath(new URL('../../rules/data/2014/', import.meta.url));
const LEVELS = JSON.parse(readFileSync(dir + '5e-SRD-Levels.json', 'utf8')) as any[];

// Class progression rows only -- rows carrying a subclass are subclass progression.
const CLASS_ROWS = LEVELS.filter((r) => !r.subclass);

const slotRows: LevelSlotRow[] = CLASS_ROWS.map((r) => {
  const slots: Record<number, number> = {};
  const sc = r.spellcasting ?? {};
  for (let level = 1; level <= 9; level++) {
    const value = sc[`spell_slots_level_${level}`];
    if (typeof value === 'number' && value > 0) slots[level] = value;
  }
  return {
    classIndex: r.class.index,
    level: r.level,
    slots,
    cantripsKnown: sc.cantrips_known ?? 0,
    spellsKnown: sc.spells_known ?? null,
  };
});

const resourceRows: ClassLevelRow[] = CLASS_ROWS.map((r) => ({
  classIndex: r.class.index,
  level: r.level,
  classSpecific: r.class_specific,
}));

const MODS: Record<AbilityId, number> = { str: 0, dex: 2, con: 2, int: 4, wis: 3, cha: 3 };

function withClasses(classes: { index: string; name: string; level: number }[]): Character {
  return createCharacter({
    classes: classes.map((c) => ({
      classRef: { source: 'srd', index: c.index, name: c.name },
      subclassRef: null,
      level: c.level,
      hitDiceSpent: 0,
      hitPointRolls: [],
    })),
  });
}

describe('single-class spell slots follow the published table', () => {
  it.each([
    ['wizard', 1, { 1: 2 }],
    ['wizard', 5, { 1: 4, 2: 3, 3: 2 }],
    ['wizard', 20, { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 2, 8: 1, 9: 1 }],
    ['cleric', 3, { 1: 4, 2: 2 }],
  ] as const)('%s level %i', (cls, level, expected) => {
    const { standard } = slotsFor(withClasses([{ index: cls, name: cls, level }]), slotRows);
    expect(standard).toEqual(expected);
  });

  it('gives half-casters their own table, not a halved full-caster one', () => {
    // A Paladin 2 has 2 first-level slots; caster level 1 on the full table would give 2 as
    // well, but Paladin 5 has 4+2 where full-caster level 2 would give 3.
    const { standard } = slotsFor(withClasses([{ index: 'paladin', name: 'Paladin', level: 5 }]), slotRows);
    expect(standard).toEqual({ 1: 4, 2: 2 });
  });

  it('gives a level-1 paladin no slots at all', () => {
    const { standard } = slotsFor(withClasses([{ index: 'paladin', name: 'Paladin', level: 1 }]), slotRows);
    expect(standard).toEqual({});
  });

  it('gives non-casters no slots', () => {
    const { standard, pact } = slotsFor(withClasses([{ index: 'fighter', name: 'Fighter', level: 5 }]), slotRows);
    expect(standard).toEqual({});
    expect(pact).toEqual({});
  });
});

describe('Pact Magic is kept separate', () => {
  it('reports warlock slots as pact, not standard', () => {
    const { standard, pact } = slotsFor(withClasses([{ index: 'warlock', name: 'Warlock', level: 5 }]), slotRows);
    expect(standard).toEqual({});
    // A level-5 Warlock has two 3rd-level pact slots and nothing else.
    expect(pact).toEqual({ 3: 2 });
  });

  it('does not merge pact and standard slots for a multiclass caster', () => {
    const character = withClasses([
      { index: 'warlock', name: 'Warlock', level: 3 },
      { index: 'wizard', name: 'Wizard', level: 3 },
    ]);
    const { standard, pact } = slotsFor(character, slotRows);
    // Caster level 3 (warlock levels excluded) gives 4/2 on the full-caster table...
    expect(standard).toEqual({ 1: 4, 2: 2 });
    // ...and the two pact slots stay an entirely separate pool.
    expect(pact).toEqual({ 2: 2 });
  });

  it('excludes warlock levels from the combined caster level', () => {
    const character = withClasses([
      { index: 'warlock', name: 'Warlock', level: 5 },
      { index: 'wizard', name: 'Wizard', level: 3 },
    ]);
    expect(combinedCasterLevel(character)).toBe(3);
  });

  it('stores pact slots under an offset key so they cannot collide', () => {
    expect(pactSlotKey(2)).toBe(2 + PACT_SLOT_OFFSET);
    expect(pactSlotKey(2)).not.toBe(2);
  });
});

describe('multiclass caster level', () => {
  it('rounds each half-caster down before summing', () => {
    // Paladin 3 (1) + Ranger 3 (1) = 2, not 3.
    const character = withClasses([
      { index: 'paladin', name: 'Paladin', level: 3 },
      { index: 'ranger', name: 'Ranger', level: 3 },
    ]);
    expect(combinedCasterLevel(character)).toBe(2);
  });

  it('adds full casters at their full level', () => {
    const character = withClasses([
      { index: 'wizard', name: 'Wizard', level: 4 },
      { index: 'cleric', name: 'Cleric', level: 3 },
    ]);
    expect(combinedCasterLevel(character)).toBe(7);
  });

  it('ignores non-casting classes', () => {
    const character = withClasses([
      { index: 'fighter', name: 'Fighter', level: 6 },
      { index: 'wizard', name: 'Wizard', level: 2 },
    ]);
    expect(combinedCasterLevel(character)).toBe(2);
  });

  it('uses the full-caster table at the combined level', () => {
    const character = withClasses([
      { index: 'wizard', name: 'Wizard', level: 3 },
      { index: 'cleric', name: 'Cleric', level: 2 },
    ]);
    // Caster level 5: 4/3/2, matching a level-5 full caster.
    expect(slotsFor(character, slotRows).standard).toEqual({ 1: 4, 2: 3, 3: 2 });
  });
});

describe('preparation', () => {
  it('gives prepared casters ability modifier plus level', () => {
    expect(preparedLimit('cleric', 5, 3)).toBe(8);
    expect(preparedLimit('wizard', 5, 4)).toBe(9);
  });

  it('halves the level for paladins', () => {
    expect(preparedLimit('paladin', 5, 3)).toBe(5);
  });

  it('returns null for classes that know a fixed list', () => {
    // Offering a Sorcerer a preparation limit would be inventing a rule.
    expect(preparedLimit('sorcerer', 5, 3)).toBeNull();
    expect(preparedLimit('bard', 5, 3)).toBeNull();
    expect(preparedLimit('warlock', 5, 3)).toBeNull();
  });

  it('never drops below one', () => {
    expect(preparedLimit('cleric', 1, -2)).toBe(1);
  });

  it('assigns the right preparation mode per class', () => {
    expect(preparationModeFor('wizard')).toBe('spellbook');
    expect(preparationModeFor('cleric')).toBe('prepared');
    expect(preparationModeFor('sorcerer')).toBe('known');
  });
});

describe('deriveSpellcasting', () => {
  const abilityByClass: Record<string, AbilityId> = {
    wizard: 'int', cleric: 'wis', warlock: 'cha', sorcerer: 'cha', paladin: 'cha',
  };
  const names = { wizard: 'Wizard', cleric: 'Cleric', warlock: 'Warlock' };

  it('computes save DC and attack bonus', () => {
    const character = withClasses([{ index: 'wizard', name: 'Wizard', level: 5 }]);
    const snap = deriveSpellcasting(character, slotRows, MODS, abilityByClass, names);
    // 8 + prof 3 + INT 4 = 15; attack +7.
    expect(snap.casters[0]?.saveDc).toBe(15);
    expect(snap.casters[0]?.attackBonus).toBe(7);
  });

  it('reports no spellcasting for a fighter', () => {
    const character = withClasses([{ index: 'fighter', name: 'Fighter', level: 5 }]);
    const snap = deriveSpellcasting(character, slotRows, MODS, abilityByClass, names);
    expect(snap.hasSpellcasting).toBe(false);
    expect(snap.slots).toEqual([]);
  });

  it('respects a spell save DC override', () => {
    const base = withClasses([{ index: 'wizard', name: 'Wizard', level: 5 }]);
    const character = { ...base, statOverrides: { ...base.statOverrides, spellSaveDc: 19 } };
    const snap = deriveSpellcasting(character, slotRows, MODS, abilityByClass, names);
    expect(snap.casters[0]?.saveDc).toBe(19);
  });

  it('carries used slots through from the character', () => {
    const base = withClasses([{ index: 'wizard', name: 'Wizard', level: 5 }]);
    const character: Character = {
      ...base,
      resources: { ...base.resources, spellSlots: { 1: { used: 2, total: 4 } } },
    };
    const snap = deriveSpellcasting(character, slotRows, MODS, abilityByClass, names);
    expect(snap.slots.find((s) => s.level === 1)?.used).toBe(2);
  });
});

describe('castableSlots', () => {
  const snapshot = {
    casters: [],
    slots: [
      { level: 1, total: 4, used: 4 },
      { level: 2, total: 3, used: 1 },
      { level: 3, total: 2, used: 0 },
    ],
    pactSlots: [{ level: 3, total: 2, used: 0 }],
    hasSpellcasting: true,
  };

  it('offers every slot at or above the spell level', () => {
    const options = castableSlots(snapshot, 2);
    expect(options.map((o) => o.level)).toEqual([2, 3, 3]);
  });

  it('excludes exhausted slot levels', () => {
    // Level 1 is fully spent, so it is not offered even for a level-1 spell.
    const options = castableSlots(snapshot, 1);
    expect(options.some((o) => o.level === 1)).toBe(false);
  });

  it('marks pact slots so the UI can label them', () => {
    const options = castableSlots(snapshot, 3);
    expect(options.filter((o) => o.pact)).toHaveLength(1);
  });

  it('offers nothing for a cantrip', () => {
    expect(castableSlots(snapshot, 0)).toEqual([]);
  });
});

describe('slot restoration', () => {
  const slots = {
    1: { used: 3, total: 4 },
    [PACT_SLOT_OFFSET + 2]: { used: 2, total: 2 },
  };

  it('restores only pact slots on a short rest', () => {
    const after = restoreSlots(slots, 'short');
    expect(after[1]?.used).toBe(3);
    expect(after[PACT_SLOT_OFFSET + 2]?.used).toBe(0);
  });

  it('restores everything on a long rest', () => {
    const after = restoreSlots(slots, 'long');
    expect(after[1]?.used).toBe(0);
    expect(after[PACT_SLOT_OFFSET + 2]?.used).toBe(0);
  });
});

describe('upcasting tables', () => {
  it('reads the exact slot level when published', () => {
    expect(scaledDice({ '3': '8d6', '4': '9d6' }, 4)).toBe('9d6');
  });

  it('falls back to the highest lower entry for a sparse table', () => {
    expect(scaledDice({ '5': '3d8', '11': '4d8' }, 7)).toBe('3d8');
  });

  it('returns null below the lowest entry, rather than guessing', () => {
    expect(scaledDice({ '5': '3d8' }, 3)).toBeNull();
  });

  it('handles a missing table', () => {
    expect(scaledDice(undefined, 3)).toBeNull();
  });
});

describe('class resources for non-casters', () => {
  it('gives a barbarian rage uses that scale with level', () => {
    const character = withClasses([{ index: 'barbarian', name: 'Barbarian', level: 5 }]);
    const { pools, stats } = deriveClassResources(character, resourceRows, MODS);
    const rage = pools.find((p) => p.key === 'barbarian:rage');
    expect(rage?.max).toBe(3);
    expect(rage?.resetOn).toBe('long');
    expect(stats.find((s) => s.name === 'Rage damage')?.value).toBe('+2');
  });

  it('treats the level-20 barbarian sentinel as unlimited', () => {
    const character = withClasses([{ index: 'barbarian', name: 'Barbarian', level: 20 }]);
    const rage = deriveClassResources(character, resourceRows, MODS).pools.find(
      (p) => p.key === 'barbarian:rage',
    );
    // The dataset uses 9999 rather than a flag.
    expect(rage?.unlimited).toBe(true);
    expect(rage?.max).not.toBe(UNLIMITED);
  });

  it('gives a fighter Second Wind, Action Surge and Extra Attack', () => {
    const character = withClasses([{ index: 'fighter', name: 'Fighter', level: 5 }]);
    const { pools, stats } = deriveClassResources(character, resourceRows, MODS);
    expect(pools.map((p) => p.name)).toEqual(
      expect.arrayContaining(['Second Wind', 'Action Surge']),
    );
    expect(pools.find((p) => p.name === 'Action Surge')?.resetOn).toBe('short');
    expect(stats.find((s) => s.name === 'Extra Attack')?.value).toBe('2 attacks');
  });

  it('gives a monk ki that recovers on a short rest', () => {
    const character = withClasses([{ index: 'monk', name: 'Monk', level: 5 }]);
    const { pools, stats } = deriveClassResources(character, resourceRows, MODS);
    const ki = pools.find((p) => p.name === 'Ki points');
    expect(ki?.max).toBe(5);
    expect(ki?.resetOn).toBe('short');
    expect(stats.find((s) => s.name === 'Martial Arts die')?.value).toBe('1d6');
  });

  it('gives a rogue sneak attack as a statistic, not a pool', () => {
    const character = withClasses([{ index: 'rogue', name: 'Rogue', level: 5 }]);
    const { pools, stats } = deriveClassResources(character, resourceRows, MODS);
    // Sneak Attack is once per turn, not a resource that depletes.
    expect(pools).toHaveLength(0);
    expect(stats.find((s) => s.name === 'Sneak Attack')?.value).toBe('3d6');
  });

  it('computes a paladin Lay on Hands pool the dataset does not carry', () => {
    const character = withClasses([{ index: 'paladin', name: 'Paladin', level: 5 }]);
    const pools = deriveClassResources(character, resourceRows, MODS).pools;
    expect(pools.find((p) => p.name === 'Lay on Hands')?.max).toBe(25);
  });

  it('scales bardic inspiration with Charisma and moves to short rest at level 5', () => {
    const low = withClasses([{ index: 'bard', name: 'Bard', level: 3 }]);
    const high = withClasses([{ index: 'bard', name: 'Bard', level: 5 }]);

    const lowPool = deriveClassResources(low, resourceRows, MODS).pools[0];
    const highPool = deriveClassResources(high, resourceRows, MODS).pools[0];

    expect(lowPool?.max).toBe(MODS.cha);
    expect(lowPool?.resetOn).toBe('long');
    // Font of Inspiration at 5th level.
    expect(highPool?.resetOn).toBe('short');
  });

  it('gives a warlock mystic arcanum at high level', () => {
    const character = withClasses([{ index: 'warlock', name: 'Warlock', level: 11 }]);
    const pools = deriveClassResources(character, resourceRows, MODS).pools;
    expect(pools.some((p) => p.name.includes('Mystic Arcanum'))).toBe(true);
  });

  it('gives a level-1 cleric no channel divinity yet', () => {
    const character = withClasses([{ index: 'cleric', name: 'Cleric', level: 1 }]);
    const pools = deriveClassResources(character, resourceRows, MODS).pools;
    expect(pools.find((p) => p.name === 'Channel Divinity')).toBeUndefined();
  });

  it('combines pools across a multiclass character', () => {
    const character = withClasses([
      { index: 'fighter', name: 'Fighter', level: 3 },
      { index: 'monk', name: 'Monk', level: 3 },
    ]);
    const pools = deriveClassResources(character, resourceRows, MODS).pools;
    expect(pools.some((p) => p.name === 'Second Wind')).toBe(true);
    expect(pools.some((p) => p.name === 'Ki points')).toBe(true);
  });
});

describe('pool bookkeeping', () => {
  const character = withClasses([{ index: 'monk', name: 'Monk', level: 5 }]);
  const pools = deriveClassResources(character, resourceRows, MODS).pools;

  it('creates usage records for new pools', () => {
    const usages = syncPools({}, pools);
    expect(usages['monk:ki']).toEqual({ used: 0, max: 5, resetOn: 'short' });
  });

  it('raises the maximum on level-up without refunding spent uses', () => {
    const before = { 'monk:ki': { used: 3, max: 4, resetOn: 'short' as const } };
    const after = syncPools(before, pools);
    expect(after['monk:ki']).toEqual({ used: 3, max: 5, resetOn: 'short' });
  });

  it('clamps spent uses if a maximum ever drops', () => {
    const before = { 'monk:ki': { used: 9, max: 9, resetOn: 'short' as const } };
    expect(syncPools(before, pools)['monk:ki']?.used).toBe(5);
  });

  it('restores short-rest pools on a short rest and leaves long-rest ones', () => {
    const usages = {
      'monk:ki': { used: 4, max: 5, resetOn: 'short' as const },
      'fighter:indomitable': { used: 1, max: 1, resetOn: 'long' as const },
    };
    const after = restorePools(usages, [
      { key: 'monk:ki', name: 'Ki', classIndex: 'monk', max: 5, unlimited: false, resetOn: 'short', description: '' },
      { key: 'fighter:indomitable', name: 'Indomitable', classIndex: 'fighter', max: 1, unlimited: false, resetOn: 'long', description: '' },
    ], 'short');

    expect(after['monk:ki']?.used).toBe(0);
    expect(after['fighter:indomitable']?.used).toBe(1);
  });

  it('restores everything on a long rest', () => {
    const usages = { 'fighter:indomitable': { used: 1, max: 1, resetOn: 'long' as const } };
    const after = restorePools(usages, [
      { key: 'fighter:indomitable', name: 'Indomitable', classIndex: 'fighter', max: 1, unlimited: false, resetOn: 'long', description: '' },
    ], 'long');
    expect(after['fighter:indomitable']?.used).toBe(0);
  });
});
