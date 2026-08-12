import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import {
  resolveChoice,
  validateSelection,
  grantsFor,
  abilityBonusesFor,
  emptyChoiceContext,
  collectionFromUrl,
  type ChoiceContext,
} from '../choices';
import type { Choice } from '../../rules/schemas/primitives';

/**
 * Choice resolution is tested against the real dataset rather than fabricated fixtures, because
 * the shapes that break naive parsers -- nested bundles, category references, resource lists --
 * only appear in the actual SRD structures.
 */

const dir = fileURLToPath(new URL('../../rules/data/2014/', import.meta.url));
const load = (file: string): any[] => JSON.parse(readFileSync(dir + file, 'utf8'));

const classes = load('5e-SRD-Classes.json');
const races = load('5e-SRD-Races.json');
const backgrounds = load('5e-SRD-Backgrounds.json');
const equipmentCategories = load('5e-SRD-Equipment-Categories.json');
const languages = load('5e-SRD-Languages.json');

function fullContext(): ChoiceContext {
  const ctx = emptyChoiceContext();
  for (const cat of equipmentCategories) {
    ctx.equipmentCategories.set(cat.index, cat.equipment);
  }
  ctx.collections.set('languages', languages);
  return ctx;
}

describe('class skill choices', () => {
  it('enumerates the Fighter skill list', () => {
    const fighter = classes.find((c) => c.index === 'fighter');
    const choice = resolveChoice(fighter.proficiency_choices[0] as Choice, 'fighter:skills', emptyChoiceContext());

    expect(choice.choose).toBe(2);
    expect(choice.options).toHaveLength(8);
    expect(choice.options.map((o) => o.label)).toContain('Skill: Athletics');
    expect(choice.requiresManualEntry).toBe(false);
  });

  it('produces stable option ids across repeated resolution', () => {
    const fighter = classes.find((c) => c.index === 'fighter');
    const a = resolveChoice(fighter.proficiency_choices[0] as Choice, 'fighter:skills', emptyChoiceContext());
    const b = resolveChoice(fighter.proficiency_choices[0] as Choice, 'fighter:skills', emptyChoiceContext());
    // Unstable ids would orphan a player's picks when they navigate back to a step.
    expect(a.options.map((o) => o.id)).toEqual(b.options.map((o) => o.id));
  });
});

describe('starting equipment bundles', () => {
  it('keeps a multi-item bundle as one selectable option', () => {
    const fighter = classes.find((c) => c.index === 'fighter');
    const choice = resolveChoice(
      fighter.starting_equipment_options[0] as Choice,
      'fighter:equipment:0',
      fullContext(),
    );

    const bundle = choice.options.find((o) => o.kind === 'bundle');
    expect(bundle).toBeDefined();
    // "(b) leather armor, longbow, and 20 arrows" is three grants behind one choice.
    expect(bundle!.grants.length).toBeGreaterThanOrEqual(3);
    expect(bundle!.label).toMatch(/Leather Armor/i);
  });

  it('preserves quantities on counted references', () => {
    const fighter = classes.find((c) => c.index === 'fighter');
    const choice = resolveChoice(
      fighter.starting_equipment_options[0] as Choice,
      'fighter:equipment:0',
      fullContext(),
    );
    const bundle = choice.options.find((o) => o.kind === 'bundle');
    const arrows = bundle!.grants.find((g) => /arrow/i.test(g.ref.name));
    expect(arrows?.quantity).toBe(20);
  });

  it('expands an equipment_category into its members', () => {
    const cleric = classes.find((c) => c.index === 'cleric');
    const categoryChoice = (cleric.starting_equipment_options as Choice[]).find(
      (o) => o.from.option_set_type === 'equipment_category',
    );
    expect(categoryChoice).toBeDefined();

    const resolved = resolveChoice(categoryChoice!, 'cleric:holy-symbol', fullContext());
    expect(resolved.options.length).toBeGreaterThan(0);
    expect(resolved.requiresManualEntry).toBe(false);
  });

  it('asks for manual entry when a category cannot be expanded', () => {
    const cleric = classes.find((c) => c.index === 'cleric');
    const categoryChoice = (cleric.starting_equipment_options as Choice[]).find(
      (o) => o.from.option_set_type === 'equipment_category',
    );
    // With no category data loaded, the UI must offer free entry rather than an empty picker.
    const resolved = resolveChoice(categoryChoice!, 'k', emptyChoiceContext());
    expect(resolved.requiresManualEntry).toBe(true);
    expect(resolved.options).toHaveLength(0);
  });
});

describe('racial ability bonus choices', () => {
  it('resolves the Half-Elf choice into ability bonuses', () => {
    const halfElf = races.find((r) => r.index === 'half-elf');
    const choice = resolveChoice(halfElf.ability_bonus_options as Choice, 'half-elf:asi', emptyChoiceContext());

    expect(choice.choose).toBe(2);
    expect(choice.options.every((o) => o.kind === 'ability-bonus')).toBe(true);

    const selected = choice.options.slice(0, 2).map((o) => o.id);
    const bonuses = abilityBonusesFor(choice, selected);
    expect(bonuses).toHaveLength(2);
    expect(bonuses[0]?.bonus).toBe(1);
  });
});

describe('resource_list choices', () => {
  it('expands a resource list into a whole collection', () => {
    const acolyte = backgrounds[0];
    const choice = resolveChoice(acolyte.language_options as Choice, 'acolyte:languages', fullContext());
    expect(choice.options.length).toBe(languages.length);
  });

  it('falls back to manual entry when the collection is unavailable', () => {
    const acolyte = backgrounds[0];
    const choice = resolveChoice(acolyte.language_options as Choice, 'k', emptyChoiceContext());
    expect(choice.requiresManualEntry).toBe(true);
  });

  it('maps an API url to its collection', () => {
    expect(collectionFromUrl('/api/2014/languages')).toBe('languages');
  });
});

describe('personality choices are strings, not references', () => {
  it('resolves ideals and traits as text', () => {
    const acolyte = backgrounds[0];
    const traits = resolveChoice(acolyte.personality_traits as Choice, 'acolyte:traits', emptyChoiceContext());
    const ideals = resolveChoice(acolyte.ideals as Choice, 'acolyte:ideals', emptyChoiceContext());

    expect(traits.options.every((o) => o.kind === 'string')).toBe(true);
    expect(ideals.options.every((o) => o.kind === 'string')).toBe(true);
    expect(ideals.options[0]?.label.length).toBeGreaterThan(0);
  });
});

describe('validateSelection', () => {
  const fighter = classes.find((c) => c.index === 'fighter');
  const choice = resolveChoice(fighter.proficiency_choices[0] as Choice, 'k', emptyChoiceContext());

  it('accepts exactly the required number', () => {
    const ids = choice.options.slice(0, 2).map((o) => o.id);
    expect(validateSelection(choice, ids)).toBeNull();
  });

  it('reports how many more are needed', () => {
    expect(validateSelection(choice, [choice.options[0]!.id])).toMatch(/1 more/);
  });

  it('rejects too many', () => {
    const ids = choice.options.slice(0, 3).map((o) => o.id);
    expect(validateSelection(choice, ids)).toMatch(/only 2/);
  });

  it('rejects duplicates', () => {
    const id = choice.options[0]!.id;
    expect(validateSelection(choice, [id, id])).toMatch(/twice/);
  });

  it('rejects an option that no longer exists', () => {
    // Happens when a homebrew source is deleted after a selection was stored.
    expect(validateSelection(choice, ['stale-id', choice.options[0]!.id])).toMatch(/no longer exists/);
  });
});

describe('grantsFor', () => {
  it('flattens grants across several selections', () => {
    const fighter = classes.find((c) => c.index === 'fighter');
    const choice = resolveChoice(fighter.proficiency_choices[0] as Choice, 'k', emptyChoiceContext());
    const ids = choice.options.slice(0, 2).map((o) => o.id);
    expect(grantsFor(choice, ids)).toHaveLength(2);
  });

  it('returns nothing for an unknown id rather than throwing', () => {
    const fighter = classes.find((c) => c.index === 'fighter');
    const choice = resolveChoice(fighter.proficiency_choices[0] as Choice, 'k', emptyChoiceContext());
    expect(grantsFor(choice, ['nope'])).toEqual([]);
  });
});

describe('every choice in the dataset resolves without throwing', () => {
  // The strongest guarantee available: no SRD choice shape can crash the wizard.
  it('handles all class, race and background choices', () => {
    const ctx = fullContext();
    let resolved = 0;

    const tryResolve = (choice: unknown, key: string) => {
      if (!choice) return;
      const result = resolveChoice(choice as Choice, key, ctx);
      expect(result.choose).toBeGreaterThan(0);
      // Unsupported options must be labelled, never silently empty.
      for (const option of result.options) {
        expect(option.label.length).toBeGreaterThan(0);
      }
      resolved++;
    };

    for (const cls of classes) {
      (cls.proficiency_choices ?? []).forEach((c: unknown, i: number) => tryResolve(c, `${cls.index}:prof:${i}`));
      (cls.starting_equipment_options ?? []).forEach((c: unknown, i: number) => tryResolve(c, `${cls.index}:eq:${i}`));
    }
    for (const race of races) {
      tryResolve(race.ability_bonus_options, `${race.index}:asi`);
      tryResolve(race.language_options, `${race.index}:lang`);
      tryResolve(race.starting_proficiency_options, `${race.index}:prof`);
    }
    for (const bg of backgrounds) {
      tryResolve(bg.language_options, `${bg.index}:lang`);
      tryResolve(bg.personality_traits, `${bg.index}:traits`);
      tryResolve(bg.ideals, `${bg.index}:ideals`);
      tryResolve(bg.bonds, `${bg.index}:bonds`);
      tryResolve(bg.flaws, `${bg.index}:flaws`);
      (bg.starting_equipment_options ?? []).forEach((c: unknown, i: number) => tryResolve(c, `${bg.index}:eq:${i}`));
    }

    expect(resolved).toBeGreaterThan(40);
  });
});
