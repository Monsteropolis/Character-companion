import type { Persisted, StatOverrides } from '../domain/types';

/**
 * Record migrations.
 *
 * Applied on read, per record, in order. Each migration is a pure `(old) => new` function, so a
 * character saved by any earlier version of the app is upgraded the moment it is loaded and the
 * rest of the codebase only ever sees the current shape.
 *
 * Migrations are the likeliest place to destroy irreplaceable data, so they are deliberately
 * boring: additive, total (no throwing), and covered by tests that load real old-shaped records.
 */

export const CURRENT_SCHEMA_VERSION = 2;

type Migration = (record: Record<string, unknown>) => Record<string, unknown>;

export function emptyStatOverrides(): StatOverrides {
  return {
    armorClass: null,
    initiative: null,
    speed: null,
    proficiencyBonus: null,
    passivePerception: null,
    spellSaveDc: null,
    spellAttackBonus: null,
  };
}

/**
 * Keyed by the version being migrated FROM. `1` upgrades a v1 record to v2.
 */
const CHARACTER_MIGRATIONS: Record<number, Migration> = {
  // v1 -> v2: labelled ability adjustments and derived-stat overrides.
  1: (record) => ({
    ...record,
    abilityAdjustments: Array.isArray(record.abilityAdjustments) ? record.abilityAdjustments : [],
    statOverrides: isStatOverrides(record.statOverrides)
      ? { ...emptyStatOverrides(), ...record.statOverrides }
      : emptyStatOverrides(),
  }),
};

function isStatOverrides(value: unknown): value is Partial<StatOverrides> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Bring a record up to the current schema version.
 *
 * Unknown future versions are returned untouched rather than mangled: a record written by a
 * newer build of the app is better left alone than downgraded by guesswork.
 */
export function migrateCharacter<T extends Persisted>(record: T): T {
  let current = record as unknown as Record<string, unknown>;
  let version = typeof record.schemaVersion === 'number' ? record.schemaVersion : 1;

  if (version >= CURRENT_SCHEMA_VERSION) return record;

  while (version < CURRENT_SCHEMA_VERSION) {
    const migration = CHARACTER_MIGRATIONS[version];
    if (!migration) break;
    current = migration(current);
    version += 1;
  }

  return { ...current, schemaVersion: version } as unknown as T;
}

/** True when a record would be changed by migration, used to decide on a pre-migration backup. */
export function needsMigration(record: Persisted): boolean {
  const version = typeof record.schemaVersion === 'number' ? record.schemaVersion : 1;
  return version < CURRENT_SCHEMA_VERSION && CHARACTER_MIGRATIONS[version] !== undefined;
}
