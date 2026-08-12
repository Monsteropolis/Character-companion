import type { Character, RestType } from '../domain/types';
import type { AbilityId } from '../rules/schemas/primitives';
import { abilityModifier } from './core';

/**
 * Class resources and class statistics.
 *
 * Spellcasters are only half the picture: a Barbarian tracks Rage uses, a Monk spends Ki, a
 * Fighter has Second Wind and Action Surge, a Paladin a pool of healing. Without these, the app
 * is a spellbook with a character sheet attached, and half the party has nothing to track.
 *
 * Most of it is machine-readable from the SRD level table's `class_specific` block, which is
 * why this is derived rather than hand-authored. The few pools the data omits -- Lay on Hands,
 * Second Wind, Bardic Inspiration uses, Wild Shape -- are published formulas, encoded here with
 * their reasoning rather than scattered through the UI.
 *
 * Two distinct kinds come out:
 *  - POOLS, which are spent and recovered on rest, and get a tracker;
 *  - STATS, which scale with level but are not spent, and are shown for reference.
 */

/** The dataset uses 9999 for the Barbarian's level-20 unlimited rages. */
export const UNLIMITED = 9999;

export interface ResourcePool {
  key: string;
  name: string;
  classIndex: string;
  max: number;
  unlimited: boolean;
  resetOn: RestType;
  description: string;
}

export interface ClassStat {
  key: string;
  name: string;
  classIndex: string;
  value: string;
  description: string;
}

export interface ClassLevelRow {
  classIndex: string;
  level: number;
  classSpecific: Record<string, unknown> | undefined;
}

interface Ctx {
  classIndex: string;
  className: string;
  level: number;
  cs: Record<string, any>;
  mods: Record<AbilityId, number>;
}

/**
 * Derive every trackable pool and reference statistic for a character.
 *
 * Takes the already-filtered class progression rows, so this stays free of the dataset's
 * subclass-row trap (rows carrying a `subclass` field report the parent class).
 */
export function deriveClassResources(
  character: Character,
  rows: ClassLevelRow[],
  mods: Record<AbilityId, number>,
): { pools: ResourcePool[]; stats: ClassStat[] } {
  const pools: ResourcePool[] = [];
  const stats: ClassStat[] = [];

  for (const entry of character.classes) {
    const row = rows.find(
      (r) => r.classIndex === entry.classRef.index && r.level === entry.level,
    );
    const ctx: Ctx = {
      classIndex: entry.classRef.index,
      className: entry.classRef.name,
      level: entry.level,
      cs: (row?.classSpecific ?? {}) as Record<string, any>,
      mods,
    };

    const built = BUILDERS[entry.classRef.index];
    if (built) {
      const result = built(ctx);
      pools.push(...result.pools);
      stats.push(...result.stats);
    }
  }

  return { pools: pools.filter((p) => p.max > 0 || p.unlimited), stats };
}

type Builder = (ctx: Ctx) => { pools: ResourcePool[]; stats: ClassStat[] };

const pool = (
  ctx: Ctx,
  key: string,
  name: string,
  max: number,
  resetOn: RestType,
  description: string,
): ResourcePool => ({
  key: `${ctx.classIndex}:${key}`,
  name,
  classIndex: ctx.classIndex,
  max: max === UNLIMITED ? 0 : max,
  unlimited: max === UNLIMITED,
  resetOn,
  description,
});

const stat = (ctx: Ctx, key: string, name: string, value: string, description: string): ClassStat => ({
  key: `${ctx.classIndex}:${key}`,
  name,
  classIndex: ctx.classIndex,
  value,
  description,
});

const BUILDERS: Record<string, Builder> = {
  barbarian: (ctx) => ({
    pools: [
      pool(ctx, 'rage', 'Rage', ctx.cs.rage_count ?? 0, 'long',
        'Advantage on Strength checks and saves, bonus melee damage, and resistance to bludgeoning, piercing and slashing damage.'),
    ],
    stats: [
      stat(ctx, 'rage-damage', 'Rage damage', `+${ctx.cs.rage_damage_bonus ?? 0}`, 'Bonus damage on Strength-based melee attacks while raging.'),
      ...(ctx.cs.brutal_critical_dice
        ? [stat(ctx, 'brutal', 'Brutal Critical', `+${ctx.cs.brutal_critical_dice} dice`, 'Extra weapon damage dice on a critical hit.')]
        : []),
    ],
  }),

  bard: (ctx) => ({
    pools: [
      // Uses equal your Charisma modifier (minimum one); the data carries only the die size.
      pool(ctx, 'bardic-inspiration', 'Bardic Inspiration',
        Math.max(1, ctx.mods.cha),
        // Font of Inspiration at 5th level moves recovery to a short rest.
        ctx.level >= 5 ? 'short' : 'long',
        `Bonus action: give an ally a d${ctx.cs.bardic_inspiration_die ?? 6} to add to one roll.`),
    ],
    stats: [
      stat(ctx, 'inspiration-die', 'Inspiration die', `d${ctx.cs.bardic_inspiration_die ?? 6}`, 'Size of the die you grant.'),
      ...(ctx.cs.song_of_rest_die
        ? [stat(ctx, 'song-of-rest', 'Song of Rest', `d${ctx.cs.song_of_rest_die}`, 'Extra healing for allies who spend hit dice on a short rest.')]
        : []),
    ],
  }),

  cleric: (ctx) => ({
    pools: [
      pool(ctx, 'channel-divinity', 'Channel Divinity', ctx.cs.channel_divinity_charges ?? 0, 'short',
        'Turn Undead, or a effect granted by your domain.'),
    ],
    stats: ctx.cs.destroy_undead_cr
      ? [stat(ctx, 'destroy-undead', 'Destroy Undead', `CR ${ctx.cs.destroy_undead_cr}`, 'Undead of this challenge rating or lower are destroyed instead of turned.')]
      : [],
  }),

  druid: (ctx) => ({
    // Two uses at 2nd level, recovering on a short rest; not in the dataset, but published.
    pools: ctx.level >= 2
      ? [pool(ctx, 'wild-shape', 'Wild Shape', 2, 'short', 'Transform into a beast you have seen.')]
      : [],
    stats: ctx.level >= 2
      ? [
          stat(ctx, 'wild-shape-cr', 'Wild Shape max CR', String(ctx.cs.wild_shape_max_cr ?? 0),
            [
              ctx.cs.wild_shape_swim ? 'Swimming speed allowed.' : 'No swimming speed.',
              ctx.cs.wild_shape_fly ? 'Flying speed allowed.' : 'No flying speed.',
            ].join(' '),
          ),
        ]
      : [],
  }),

  fighter: (ctx) => ({
    pools: [
      pool(ctx, 'second-wind', 'Second Wind', 1, 'short',
        `Bonus action: regain 1d10 + ${ctx.level} hit points.`),
      pool(ctx, 'action-surge', 'Action Surge', ctx.cs.action_surges ?? 0, 'short',
        'Take one additional action on your turn.'),
      pool(ctx, 'indomitable', 'Indomitable', ctx.cs.indomitable_uses ?? 0, 'long',
        'Reroll a failed saving throw.'),
    ],
    stats: ctx.cs.extra_attacks
      ? [stat(ctx, 'extra-attacks', 'Extra Attack', `${ctx.cs.extra_attacks + 1} attacks`, 'Attacks when you take the Attack action.')]
      : [],
  }),

  monk: (ctx) => ({
    pools: [
      pool(ctx, 'ki', 'Ki points', ctx.cs.ki_points ?? 0, 'short',
        'Fuels Flurry of Blows, Patient Defense, Step of the Wind and other ki features.'),
    ],
    stats: [
      ...(ctx.cs.martial_arts
        ? [stat(ctx, 'martial-arts', 'Martial Arts die',
            `${ctx.cs.martial_arts.dice_count}d${ctx.cs.martial_arts.dice_value}`,
            'Damage for unarmed strikes and monk weapons.')]
        : []),
      ...(ctx.cs.unarmored_movement
        ? [stat(ctx, 'unarmored-movement', 'Unarmoured Movement', `+${ctx.cs.unarmored_movement} ft`, 'Extra speed while wearing no armour and no shield.')]
        : []),
    ],
  }),

  paladin: (ctx) => ({
    pools: [
      // Five hit points per paladin level, restored on a long rest. Not in the dataset.
      pool(ctx, 'lay-on-hands', 'Lay on Hands', ctx.level * 5, 'long',
        'A pool of healing you can spend a point at a time.'),
      ...(ctx.level >= 3
        ? [pool(ctx, 'channel-divinity', 'Channel Divinity', 1, 'short', 'An effect granted by your oath.')]
        : []),
    ],
    stats: ctx.cs.aura_range
      ? [stat(ctx, 'aura', 'Aura range', `${ctx.cs.aura_range} ft`, 'Radius of your Aura of Protection.')]
      : [],
  }),

  ranger: (ctx) => ({
    pools: [],
    stats: [
      ...(ctx.cs.favored_enemies
        ? [stat(ctx, 'favored-enemies', 'Favoured enemies', String(ctx.cs.favored_enemies), 'Creature types you have studied.')]
        : []),
      ...(ctx.cs.favored_terrain
        ? [stat(ctx, 'favored-terrain', 'Favoured terrain', String(ctx.cs.favored_terrain), 'Terrain types you know intimately.')]
        : []),
    ],
  }),

  rogue: (ctx) => ({
    // Sneak Attack is once per turn rather than a pool, so it is a stat, not a tracker.
    pools: [],
    stats: ctx.cs.sneak_attack
      ? [stat(ctx, 'sneak-attack', 'Sneak Attack',
          `${ctx.cs.sneak_attack.dice_count}d${ctx.cs.sneak_attack.dice_value}`,
          'Once per turn, with advantage or an ally adjacent to the target.')]
      : [],
  }),

  sorcerer: (ctx) => ({
    pools: [
      pool(ctx, 'sorcery-points', 'Sorcery points', ctx.cs.sorcery_points ?? 0, 'long',
        'Fuels Metamagic, and can be exchanged for spell slots.'),
    ],
    stats: ctx.cs.metamagic_known
      ? [stat(ctx, 'metamagic', 'Metamagic known', String(ctx.cs.metamagic_known), 'Options you can apply to your spells.')]
      : [],
  }),

  warlock: (ctx) => {
    const arcana = [6, 7, 8, 9].filter((n) => ctx.cs[`mystic_arcanum_level_${n}`]);
    return {
      pools: arcana.map((n) =>
        pool(ctx, `mystic-arcanum-${n}`, `Mystic Arcanum (level ${n})`, 1, 'long',
          `Cast one level ${n} spell without expending a slot.`),
      ),
      stats: ctx.cs.invocations_known
        ? [stat(ctx, 'invocations', 'Invocations known', String(ctx.cs.invocations_known), 'Eldritch Invocations you have learned.')]
        : [],
    };
  },

  wizard: (ctx) => ({
    pools: [
      pool(ctx, 'arcane-recovery', 'Arcane Recovery', 1, 'long',
        `On a short rest, recover spell slots totalling ${ctx.cs.arcane_recovery_levels ?? 0} levels.`),
    ],
    stats: ctx.cs.arcane_recovery_levels
      ? [stat(ctx, 'arcane-recovery-levels', 'Arcane Recovery', `${ctx.cs.arcane_recovery_levels} slot levels`, 'Total slot levels you can recover.')]
      : [],
  }),
};

/** Restores the pools a rest of the given kind recovers. A long rest recovers everything. */
export function restorePools(
  usages: Character['resources']['usages'],
  pools: ResourcePool[],
  rest: 'short' | 'long',
): Character['resources']['usages'] {
  const next = { ...usages };
  for (const p of pools) {
    if (rest === 'long' || p.resetOn === 'short') {
      const existing = next[p.key];
      if (existing) next[p.key] = { ...existing, used: 0 };
    }
  }
  return next;
}

/** Ensures a pool has a usage record, and keeps its maximum in step with the character's level. */
export function syncPools(
  usages: Character['resources']['usages'],
  pools: ResourcePool[],
): Character['resources']['usages'] {
  const next = { ...usages };
  for (const p of pools) {
    const existing = next[p.key];
    const max = p.unlimited ? 0 : p.max;
    if (!existing) {
      next[p.key] = { used: 0, max, resetOn: p.resetOn };
    } else if (existing.max !== max || existing.resetOn !== p.resetOn) {
      // Levelling up changes the maximum; spent uses are kept rather than silently refunded.
      next[p.key] = { ...existing, max, resetOn: p.resetOn, used: Math.min(existing.used, max) };
    }
  }
  return next;
}

export { abilityModifier };
