import type { AbilityId } from '../../rules/schemas/primitives';
import type { CustomContentKind, RuleEffect } from '../../domain/types';

/**
 * Homebrew payload builders.
 *
 * Custom content flows through the same lookup path as SRD content, which means it must be
 * shaped like SRD content -- every field the schema requires, present and well-formed. A
 * background missing `personality_traits` would fail validation and vanish from the wizard,
 * which is exactly the silent failure this whole layer exists to avoid.
 *
 * So these builders always emit a complete, valid document, filling unspecified fields with
 * empty-but-legal values rather than omitting them.
 */

export interface HomebrewForm {
  name: string;
  description: string;

  // Background
  featureName: string;
  featureDesc: string;
  skillProficiencies: string[];
  toolProficiencies: string[];
  languageCount: number;
  equipment: string[];
  startingGold: number;

  // Race / subrace
  speed: number;
  abilityBonuses: { ability: AbilityId; bonus: number }[];
  parentRace: string;
  size: string;

  // Class / subclass
  parentClass: string;
  hitDie: number;

  // Spell
  spellLevel: number;
  school: string;
  castingTime: string;
  range: string;
  components: string[];
  duration: string;
  concentration: boolean;
  ritual: boolean;
  higherLevel: string;

  // Item
  itemCategory: string;
  weight: number;

  // Feat / feature / trait
  prerequisite: string;
}

export function emptyForm(): HomebrewForm {
  return {
    name: '',
    description: '',
    featureName: '',
    featureDesc: '',
    skillProficiencies: [],
    toolProficiencies: [],
    languageCount: 0,
    equipment: [],
    startingGold: 0,
    speed: 30,
    abilityBonuses: [],
    parentRace: '',
    size: 'Medium',
    parentClass: '',
    hitDie: 8,
    spellLevel: 0,
    school: 'Evocation',
    castingTime: '1 action',
    range: '30 feet',
    components: ['V', 'S'],
    duration: 'Instantaneous',
    concentration: false,
    ritual: false,
    higherLevel: '',
    itemCategory: 'adventuring-gear',
    weight: 0,
  prerequisite: '',
  };
}

export function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
}

export function customIndex(name: string): string {
  return `custom:${slugify(name) || 'unnamed'}`;
}

const ref = (index: string, name: string) => ({ index, name });

/** An options_array choice over plain strings, the shape backgrounds use for personality. */
function stringChoice(choose: number, values: string[], desc: string) {
  return {
    desc,
    choose,
    type: 'string',
    from: {
      option_set_type: 'options_array',
      options: values.map((v) => ({ option_type: 'string', string: v })),
    },
  };
}

function referenceChoice(choose: number, url: string, desc: string) {
  return {
    desc,
    choose,
    type: 'languages',
    from: { option_set_type: 'resource_list', resource_list_url: url },
  };
}

/**
 * Builds a schema-valid rules document for a homebrew entry.
 *
 * Every required field is populated. Where the author gave nothing, a legal empty value is used
 * so the document still validates and still renders -- an incomplete homebrew background is far
 * more useful than one the app silently refuses to load.
 */
export function buildPayload(kind: CustomContentKind, form: HomebrewForm): Record<string, unknown> {
  const index = customIndex(form.name);
  const base = { index, name: form.name };
  const desc = form.description ? form.description.split('\n').filter(Boolean) : [];

  switch (kind) {
    case 'background':
      return {
        ...base,
        starting_proficiencies: [
          ...form.skillProficiencies.map((s) => ref(`skill-${s}`, `Skill: ${titleCase(s)}`)),
          ...form.toolProficiencies.filter(Boolean).map((t) => ref(`custom:${slugify(t)}`, t)),
        ],
        starting_equipment: [],
        starting_equipment_options: [],
        ...(form.startingGold > 0
          ? { starting_gold: { quantity: form.startingGold, unit: 'gp' } }
          : {}),
        ...(form.languageCount > 0
          ? {
              language_options: referenceChoice(
                form.languageCount,
                '/api/2014/languages',
                `Choose ${form.languageCount} language${form.languageCount > 1 ? 's' : ''}`,
              ),
            }
          : {}),
        feature: {
          name: form.featureName || form.name,
          desc: form.featureDesc ? form.featureDesc.split('\n').filter(Boolean) : desc,
        },
        // Required by the schema. Authors rarely supply six of each, so an empty choice is
        // emitted rather than a malformed one.
        personality_traits: stringChoice(1, [], 'Personality trait'),
        ideals: stringChoice(1, [], 'Ideal'),
        bonds: stringChoice(1, [], 'Bond'),
        flaws: stringChoice(1, [], 'Flaw'),
        // Equipment the author listed is carried as prose so it is not lost.
        custom_equipment: form.equipment.filter(Boolean),
      };

    case 'race':
      return {
        ...base,
        speed: form.speed,
        ability_bonuses: form.abilityBonuses.map((b) => ({
          ability_score: ref(b.ability, b.ability.toUpperCase()),
          bonus: b.bonus,
        })),
        alignment: '',
        age: '',
        size: form.size,
        size_description: '',
        starting_proficiencies: form.skillProficiencies.map((s) =>
          ref(`skill-${s}`, `Skill: ${titleCase(s)}`),
        ),
        languages: [],
        language_desc: '',
        traits: [],
        subraces: [],
        ...(form.languageCount > 0
          ? {
              language_options: referenceChoice(
                form.languageCount,
                '/api/2014/languages',
                `Choose ${form.languageCount} language${form.languageCount > 1 ? 's' : ''}`,
              ),
            }
          : {}),
      };

    case 'subrace':
      return {
        ...base,
        race: ref(form.parentRace || 'custom', titleCase(form.parentRace || 'Custom')),
        desc: form.description,
        ability_bonuses: form.abilityBonuses.map((b) => ({
          ability_score: ref(b.ability, b.ability.toUpperCase()),
          bonus: b.bonus,
        })),
        racial_traits: [],
      };

    case 'subclass':
      return {
        ...base,
        class: ref(form.parentClass || 'custom', titleCase(form.parentClass || 'Custom')),
        subclass_flavor: 'Subclass',
        desc,
      };

    case 'class':
      return {
        ...base,
        hit_die: form.hitDie,
        proficiency_choices: [],
        proficiencies: [],
        saving_throws: [],
        starting_equipment: [],
        starting_equipment_options: [],
        subclasses: [],
      };

    case 'feat':
      return {
        ...base,
        desc: desc.length > 0 ? desc : [''],
        prerequisites: [],
        ...(form.prerequisite ? { custom_prerequisite: form.prerequisite } : {}),
      };

    case 'spell':
      return {
        ...base,
        desc: desc.length > 0 ? desc : [''],
        ...(form.higherLevel ? { higher_level: [form.higherLevel] } : {}),
        range: form.range,
        components: form.components,
        ritual: form.ritual,
        duration: form.duration,
        concentration: form.concentration,
        casting_time: form.castingTime,
        level: form.spellLevel,
        school: ref(slugify(form.school), form.school),
        // Custom spells are attached to no class list; the spellbook offers them separately.
        classes: [],
        subclasses: [],
      };

    case 'item':
      return {
        ...base,
        equipment_category: ref(form.itemCategory, titleCase(form.itemCategory)),
        weight: form.weight,
        desc,
      };

    case 'feature':
    case 'trait':
    default:
      return {
        ...base,
        desc: desc.length > 0 ? desc : [''],
        ...(kind === 'feature'
          ? { class: ref(form.parentClass || 'custom', titleCase(form.parentClass || 'Custom')), level: 1, prerequisites: [] }
          : { races: [], subraces: [], proficiencies: [] }),
      };
  }
}

/**
 * Machine-readable effects derived from the form.
 *
 * Only bonuses the engine can actually apply are emitted; anything else stays prose so it is
 * displayed rather than silently doing nothing.
 */
export function buildEffects(kind: CustomContentKind, form: HomebrewForm): RuleEffect[] {
  const effects: RuleEffect[] = [];

  if (kind === 'feat' || kind === 'feature' || kind === 'trait') {
    for (const bonus of form.abilityBonuses) {
      effects.push({ t: 'ability-bonus', ability: bonus.ability, value: bonus.bonus });
    }
    if (form.description && effects.length === 0) {
      effects.push({ t: 'prose-only', summary: form.description.split('\n')[0] ?? form.description });
    }
  }

  return effects;
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Skills a homebrew background can grant, matching the SRD skill indices. */
export const SKILL_OPTIONS = [
  'acrobatics', 'animal-handling', 'arcana', 'athletics', 'deception', 'history',
  'insight', 'intimidation', 'investigation', 'medicine', 'nature', 'perception',
  'performance', 'persuasion', 'religion', 'sleight-of-hand', 'stealth', 'survival',
] as const;

export const SPELL_SCHOOLS = [
  'Abjuration', 'Conjuration', 'Divination', 'Enchantment',
  'Evocation', 'Illusion', 'Necromancy', 'Transmutation',
] as const;
