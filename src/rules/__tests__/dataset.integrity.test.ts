import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { collectionRegistry, collectionKeys, type CollectionKey } from '../collections';

/**
 * Dataset integrity suite.
 *
 * Two jobs:
 *  1. prove every vendored SRD record satisfies its schema, so the app never meets a shape it
 *     cannot parse;
 *  2. pin the specific data traps found during the API review (API_INTEGRATION.md §4) as
 *     regressions, so a future dataset refresh that reintroduces one fails CI rather than
 *     quietly producing wrong character sheets.
 */

const dir = fileURLToPath(new URL('../data/2014/', import.meta.url));

function load(collection: CollectionKey): unknown[] {
  return JSON.parse(readFileSync(dir + collectionRegistry[collection].file, 'utf8')) as unknown[];
}

describe('vendored SRD dataset', () => {
  it.each(collectionKeys)('every record in "%s" satisfies its schema', (key) => {
    const { schema } = collectionRegistry[key];
    const records = load(key);

    expect(records.length).toBeGreaterThan(0);

    const failures = records
      .map((r, i) => ({ i, r, parsed: schema.safeParse(r) }))
      .filter((x) => !x.parsed.success)
      .map((x) => ({
        index: (x.r as { index?: string }).index ?? `#${x.i}`,
        issues: x.parsed.success
          ? []
          : x.parsed.error.issues.map((iss) => `${iss.path.join('.')}: ${iss.message}`),
      }));

    expect(failures).toEqual([]);
  });
});

describe('SRD coverage (licensing limits, not defects)', () => {
  // These assertions document the legal ceiling on content. If they ever change, the app's
  // custom-content messaging needs to change with them.
  it.each([
    ['backgrounds', 1],
    ['feats', 1],
    ['subraces', 4],
    ['subclasses', 12],
    ['classes', 12],
    ['races', 9],
  ] as const)('%s contains %i records', (key, count) => {
    expect(load(key).length).toBe(count);
  });
});

describe('trap: ability_score_bonuses is cumulative, not per-level', () => {
  it('does not imply an ASI at every level', () => {
    const rows = load('levels') as { class: { index: string }; subclass?: unknown; level: number; ability_score_bonuses?: number }[];
    const fighter = rows
      .filter((r) => r.class.index === 'fighter' && !('subclass' in r))
      .sort((a, b) => a.level - b.level);

    // Reading the field directly would grant a Fighter an ASI on 17 of 20 levels.
    const naive = fighter.filter((r) => (r.ability_score_bonuses ?? 0) > 0).length;
    expect(naive).toBeGreaterThan(10);

    // Correct reading: an ASI occurs only where the cumulative count increases.
    const asiLevels = fighter
      .filter((r, i) => (r.ability_score_bonuses ?? 0) > (fighter[i - 1]?.ability_score_bonuses ?? 0))
      .map((r) => r.level);

    expect(asiLevels).toEqual([4, 6, 8, 12, 14, 16, 19]);
  });
});

describe('trap: Levels mixes subclass rows into class progression', () => {
  it('reports subclass rows under the parent class index', () => {
    const rows = load('levels') as { class: { index: string }; subclass?: { name: string }; level: number }[];
    const allFighterRows = rows.filter((r) => r.class.index === 'fighter');
    const classRows = allFighterRows.filter((r) => !r.subclass);
    const subclassRows = allFighterRows.filter((r) => r.subclass);

    expect(allFighterRows.length).toBe(25); // naive count -- would break level lookup
    expect(classRows.length).toBe(20); // correct class progression
    expect(subclassRows.every((r) => r.subclass?.name === 'Champion')).toBe(true);
  });

  it('gives every class exactly 20 progression rows', () => {
    const rows = load('levels') as { class: { index: string }; subclass?: unknown }[];
    const byClass = new Map<string, number>();
    for (const r of rows) {
      if (r.subclass) continue;
      byClass.set(r.class.index, (byClass.get(r.class.index) ?? 0) + 1);
    }
    expect([...byClass.values()].every((n) => n === 20)).toBe(true);
    expect(byClass.size).toBe(12);
  });
});

describe('trap: class features carry no machine-readable effect', () => {
  it('describes Unarmored Defense only as prose', () => {
    const features = load('features') as Record<string, unknown>[];
    const ud = features.filter((f) => String(f.name).includes('Unarmored Defense'));

    expect(ud.length).toBeGreaterThan(0);
    for (const f of ud) {
      expect(Array.isArray(f.desc)).toBe(true);
      // No structured effect field exists anywhere on the record -- hence the effects layer.
      expect(Object.keys(f)).not.toContain('effects');
      expect(Object.keys(f)).not.toContain('modifiers');
    }
  });
});

describe('data the engine can rely on', () => {
  it('caps DEX on medium armor and omits it on heavy', () => {
    const equipment = load('equipment') as Record<string, any>[];
    const medium = equipment.filter((e) => e.armor_category === 'Medium');
    const heavy = equipment.filter((e) => e.armor_category === 'Heavy');

    expect(medium.length).toBeGreaterThan(0);
    expect(medium.every((a) => a.armor_class.dex_bonus === true && a.armor_class.max_bonus === 2)).toBe(true);
    expect(heavy.every((a) => a.armor_class.dex_bonus === false)).toBe(true);
  });

  it('models Half-Elf ability bonus options as a choice', () => {
    const races = load('races') as Record<string, any>[];
    const halfElf = races.find((r) => r.index === 'half-elf');
    expect(halfElf?.ability_bonus_options?.choose).toBe(2);
  });

  it('provides upcasting tables for damaging spells', () => {
    const spells = load('spells') as Record<string, any>[];
    const fireball = spells.find((s) => s.index === 'fireball');
    expect(fireball?.damage?.damage_at_slot_level?.['3']).toBe('8d6');
  });

  it('provides two-handed damage for versatile weapons', () => {
    const equipment = load('equipment') as Record<string, any>[];
    const longsword = equipment.find((e) => e.index === 'longsword');
    expect(longsword?.two_handed_damage?.damage_dice).toBe('1d10');
  });
});

describe('known gaps the engine must tolerate', () => {
  it('has equipment records with no weight', () => {
    const equipment = load('equipment') as Record<string, unknown>[];
    const weightless = equipment.filter((e) => e.weight === undefined);
    // Encumbrance must treat these as 0 rather than NaN.
    expect(weightless.length).toBeGreaterThan(0);
  });
});
