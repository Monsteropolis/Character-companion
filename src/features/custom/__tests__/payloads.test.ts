import { describe, it, expect } from 'vitest';
import { buildPayload, buildEffects, emptyForm, customIndex, SKILL_OPTIONS } from '../payloads';
import {
  backgroundSchema,
  raceSchema,
  subraceSchema,
  subclassSchema,
  featSchema,
  spellSchema,
  equipmentSchema,
  classSchema,
  featureSchema,
  traitSchema,
} from '../../../rules/schemas/collections';
import type { CustomContentKind } from '../../../domain/types';

/**
 * Homebrew must validate against the SAME schemas as SRD content.
 *
 * This is the load-bearing guarantee of the custom-content system: if a homebrew background
 * fails validation it is quarantined and silently disappears from the wizard, which is the
 * exact failure the layer exists to prevent. So every builder is checked against the real
 * schema, including the sparse case where an author filled in almost nothing.
 */

const SCHEMAS: Partial<Record<CustomContentKind, { safeParse: (v: unknown) => { success: boolean; error?: unknown } }>> = {
  background: backgroundSchema,
  race: raceSchema,
  subrace: subraceSchema,
  subclass: subclassSchema,
  class: classSchema,
  feat: featSchema,
  spell: spellSchema,
  item: equipmentSchema,
  feature: featureSchema,
  trait: traitSchema,
};

describe('every homebrew kind produces a schema-valid document', () => {
  it.each(Object.keys(SCHEMAS) as CustomContentKind[])(
    'a fully-specified %s validates',
    (kind) => {
      const form = {
        ...emptyForm(),
        name: 'Test Entry',
        description: 'Line one\nLine two',
        featureName: 'Test Feature',
        featureDesc: 'It does a thing.',
        skillProficiencies: ['athletics', 'insight'],
        toolProficiencies: ['Smith’s tools'],
        languageCount: 2,
        equipment: ['A shovel'],
        startingGold: 15,
        abilityBonuses: [{ ability: 'str' as const, bonus: 2 }],
        parentClass: 'fighter',
        parentRace: 'dwarf',
        higherLevel: 'More damage.',
        prerequisite: 'Strength 13',
      };

      const result = SCHEMAS[kind]!.safeParse(buildPayload(kind, form));
      expect(result.success, JSON.stringify(result.error, null, 1)).toBe(true);
    },
  );

  it.each(Object.keys(SCHEMAS) as CustomContentKind[])(
    'a barely-filled-in %s still validates',
    (kind) => {
      // The realistic case: someone types a name mid-session and nothing else.
      const form = { ...emptyForm(), name: 'Quick Entry' };
      const result = SCHEMAS[kind]!.safeParse(buildPayload(kind, form));
      expect(result.success, JSON.stringify(result.error, null, 1)).toBe(true);
    },
  );
});

describe('custom backgrounds', () => {
  const form = {
    ...emptyForm(),
    name: 'Soldier',
    description: 'You served in an army.',
    featureName: 'Military Rank',
    featureDesc: 'Soldiers loyal to your former organisation still recognise your authority.',
    skillProficiencies: ['athletics', 'intimidation'],
    toolProficiencies: ['Playing cards'],
    languageCount: 1,
    startingGold: 10,
  };

  const payload = buildPayload('background', form) as Record<string, any>;

  it('grants the chosen skills using SRD proficiency indices', () => {
    // The engine matches skills on `skill-<index>`, so the prefix has to be exact.
    const indices = payload.starting_proficiencies.map((p: any) => p.index);
    expect(indices).toContain('skill-athletics');
    expect(indices).toContain('skill-intimidation');
  });

  it('carries tool proficiencies alongside skills', () => {
    const names = payload.starting_proficiencies.map((p: any) => p.name);
    expect(names).toContain('Playing cards');
  });

  it('records the background feature', () => {
    expect(payload.feature.name).toBe('Military Rank');
    expect(payload.feature.desc[0]).toMatch(/still recognise your authority/);
  });

  it('offers a language choice when one was specified', () => {
    expect(payload.language_options.choose).toBe(1);
    expect(payload.language_options.from.option_set_type).toBe('resource_list');
  });

  it('omits the language choice entirely when none was specified', () => {
    const none = buildPayload('background', { ...form, languageCount: 0 }) as Record<string, any>;
    // An empty choice would render as a picker with nothing to pick.
    expect(none.language_options).toBeUndefined();
  });

  it('records starting gold as a cost object, matching the SRD shape', () => {
    expect(payload.starting_gold).toEqual({ quantity: 10, unit: 'gp' });
  });

  it('falls back to the description when no feature text was given', () => {
    const p = buildPayload('background', {
      ...form,
      featureDesc: '',
    }) as Record<string, any>;
    expect(p.feature.desc).toEqual(['You served in an army.']);
  });
});

describe('custom races and subraces', () => {
  it('emits ability bonuses in the SRD shape', () => {
    const payload = buildPayload('race', {
      ...emptyForm(),
      name: 'Aarakocra',
      speed: 25,
      abilityBonuses: [
        { ability: 'dex', bonus: 2 },
        { ability: 'wis', bonus: 1 },
      ],
    }) as Record<string, any>;

    expect(payload.speed).toBe(25);
    expect(payload.ability_bonuses).toHaveLength(2);
    expect(payload.ability_bonuses[0].ability_score.index).toBe('dex');
    expect(payload.ability_bonuses[0].bonus).toBe(2);
  });

  it('links a subrace to its parent race', () => {
    const payload = buildPayload('subrace', {
      ...emptyForm(),
      name: 'Wood Elf',
      parentRace: 'elf',
      abilityBonuses: [{ ability: 'wis', bonus: 1 }],
    }) as Record<string, any>;
    expect(payload.race.index).toBe('elf');
  });
});

describe('custom subclasses', () => {
  it('links to the parent class', () => {
    const payload = buildPayload('subclass', {
      ...emptyForm(),
      name: 'Eldritch Knight',
      parentClass: 'fighter',
      description: 'A fighter who blends martial prowess with arcane magic.',
    }) as Record<string, any>;

    expect(payload.class.index).toBe('fighter');
    expect(payload.desc[0]).toMatch(/arcane magic/);
  });
});

describe('custom spells', () => {
  it('carries the mechanical fields the spellbook needs', () => {
    const payload = buildPayload('spell', {
      ...emptyForm(),
      name: 'Arcane Surge',
      spellLevel: 3,
      school: 'Evocation',
      castingTime: '1 bonus action',
      range: '60 feet',
      components: ['V', 'S', 'M'],
      duration: '1 minute',
      concentration: true,
      ritual: false,
      description: 'A surge of raw magic.',
      higherLevel: 'Damage increases by 1d6 per slot level above 3rd.',
    }) as Record<string, any>;

    expect(payload.level).toBe(3);
    expect(payload.concentration).toBe(true);
    expect(payload.school.name).toBe('Evocation');
    expect(payload.higher_level[0]).toMatch(/1d6 per slot/);
  });
});

describe('custom feats', () => {
  it('turns ability bonuses into machine-readable effects', () => {
    const form = {
      ...emptyForm(),
      name: 'Resilient',
      abilityBonuses: [{ ability: 'con' as const, bonus: 1 }],
    };
    const effects = buildEffects('feat', form);
    expect(effects).toEqual([{ t: 'ability-bonus', ability: 'con', value: 1 }]);
  });

  it('keeps unmodellable text as prose rather than dropping it', () => {
    const effects = buildEffects('feat', {
      ...emptyForm(),
      name: 'Lucky',
      description: 'You have three luck points.',
    });
    expect(effects[0]).toEqual({ t: 'prose-only', summary: 'You have three luck points.' });
  });

  it('emits no effects for kinds that do not carry them', () => {
    expect(buildEffects('background', { ...emptyForm(), name: 'X' })).toEqual([]);
  });
});

describe('indices', () => {
  it('namespaces custom content so it cannot collide with SRD indices', () => {
    expect(customIndex('Soldier')).toBe('custom:soldier');
    expect(customIndex('Eldritch Knight')).toBe('custom:eldritch-knight');
  });

  it('never produces an empty index', () => {
    expect(customIndex('!!!')).toBe('custom:unnamed');
  });
});

describe('skill options', () => {
  it('covers all 18 SRD skills', () => {
    expect(SKILL_OPTIONS).toHaveLength(18);
  });
});
