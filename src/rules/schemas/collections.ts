import { z } from 'zod';
import {
  apiReferenceSchema,
  choiceSchema,
  costSchema,
  damageSchema,
  dcSchema,
} from './primitives';

/**
 * Schemas for each SRD collection.
 *
 * Optionality here is not guesswork: it was measured against every record in the vendored
 * dataset. Fields absent from even one record are modelled optional, so the engine is forced
 * to handle the gap at the type level rather than discovering it at runtime. Notable examples:
 * 22 of 237 equipment records carry no `weight`, and the 50 subclass rows inside `Levels`
 * carry no `prof_bonus` or `ability_score_bonuses`.
 */

const base = { index: z.string(), name: z.string(), url: z.string().optional() };
const descArray = z.array(z.string());

export const abilityScoreSchema = z.object({
  ...base,
  full_name: z.string(),
  desc: descArray,
  skills: z.array(apiReferenceSchema),
});

export const alignmentSchema = z.object({ ...base, abbreviation: z.string(), desc: z.string() });

export const skillSchema = z.object({
  ...base,
  desc: descArray,
  ability_score: apiReferenceSchema,
});

export const conditionSchema = z.object({ ...base, desc: descArray });
export const damageTypeSchema = z.object({ ...base, desc: descArray });
export const magicSchoolSchema = z.object({ ...base, desc: z.string() });
export const weaponPropertySchema = z.object({ ...base, desc: descArray });

export const languageSchema = z.object({
  ...base,
  type: z.string(),
  typical_speakers: z.array(z.string()),
  script: z.string().optional(),
  desc: z.string().optional(),
});

export const proficiencySchema = z.object({
  ...base,
  type: z.string(),
  classes: z.array(apiReferenceSchema),
  races: z.array(apiReferenceSchema),
  reference: apiReferenceSchema,
});

export const equipmentCategorySchema = z.object({
  ...base,
  equipment: z.array(apiReferenceSchema),
});

/** Armor Class formula as published: base + capped DEX. Drives AC without hardcoding. */
export const armorClassSchema = z.object({
  base: z.number(),
  dex_bonus: z.boolean(),
  max_bonus: z.number().optional(),
});

export const equipmentSchema = z.object({
  ...base,
  equipment_category: apiReferenceSchema,
  cost: costSchema.optional(),
  weight: z.number().optional(),
  desc: descArray.optional(),
  // Weapon
  weapon_category: z.string().optional(),
  weapon_range: z.string().optional(),
  category_range: z.string().optional(),
  damage: damageSchema.optional(),
  two_handed_damage: damageSchema.optional(),
  range: z.object({ normal: z.number(), long: z.number().nullable().optional() }).optional(),
  throw_range: z.object({ normal: z.number(), long: z.number().optional() }).optional(),
  properties: z.array(apiReferenceSchema).optional(),
  special: descArray.optional(),
  // Armor
  armor_category: z.string().optional(),
  armor_class: armorClassSchema.optional(),
  str_minimum: z.number().optional(),
  stealth_disadvantage: z.boolean().optional(),
  // Gear / tools / vehicles / containers
  gear_category: apiReferenceSchema.optional(),
  tool_category: z.string().optional(),
  vehicle_category: z.string().optional(),
  speed: z.object({ quantity: z.number(), unit: z.string() }).optional(),
  capacity: z.string().optional(),
  quantity: z.number().optional(),
  contents: z.array(z.object({ item: apiReferenceSchema, quantity: z.number() })).optional(),
  image: z.string().optional(),
});

export const magicItemSchema = z.object({
  ...base,
  equipment_category: apiReferenceSchema,
  rarity: z.object({ name: z.string() }),
  desc: descArray,
  variants: z.array(apiReferenceSchema),
  variant: z.boolean(),
  image: z.string().optional(),
});

export const raceSchema = z.object({
  ...base,
  speed: z.number(),
  ability_bonuses: z.array(z.object({ ability_score: apiReferenceSchema, bonus: z.number() })),
  ability_bonus_options: choiceSchema.optional(),
  alignment: z.string(),
  age: z.string(),
  size: z.string(),
  size_description: z.string(),
  starting_proficiencies: z.array(apiReferenceSchema).optional(),
  starting_proficiency_options: choiceSchema.optional(),
  languages: z.array(apiReferenceSchema),
  language_options: choiceSchema.optional(),
  language_desc: z.string(),
  traits: z.array(apiReferenceSchema),
  subraces: z.array(apiReferenceSchema),
});

export const subraceSchema = z.object({
  ...base,
  race: apiReferenceSchema,
  desc: z.string(),
  ability_bonuses: z.array(z.object({ ability_score: apiReferenceSchema, bonus: z.number() })),
  starting_proficiencies: z.array(apiReferenceSchema).optional(),
  languages: z.array(apiReferenceSchema).optional(),
  language_options: choiceSchema.optional(),
  racial_traits: z.array(apiReferenceSchema),
});

export const traitSchema = z.object({
  ...base,
  races: z.array(apiReferenceSchema),
  subraces: z.array(apiReferenceSchema),
  desc: descArray,
  proficiencies: z.array(apiReferenceSchema),
  proficiency_choices: choiceSchema.optional(),
  language_options: choiceSchema.optional(),
  trait_specific: z.unknown().optional(),
  parent: apiReferenceSchema.optional(),
});

export const classSchema = z.object({
  ...base,
  hit_die: z.number(),
  proficiency_choices: z.array(choiceSchema),
  proficiencies: z.array(apiReferenceSchema),
  saving_throws: z.array(apiReferenceSchema),
  starting_equipment: z.array(z.object({ equipment: apiReferenceSchema, quantity: z.number() })),
  starting_equipment_options: z.array(choiceSchema),
  class_levels: z.string().optional(),
  multi_classing: z
    .object({
      prerequisites: z
        .array(z.object({ ability_score: apiReferenceSchema, minimum_score: z.number() }))
        .optional(),
      prerequisite_options: choiceSchema.optional(),
      proficiencies: z.array(apiReferenceSchema).optional(),
      proficiency_choices: z.array(choiceSchema).optional(),
    })
    .optional(),
  subclasses: z.array(apiReferenceSchema),
  spellcasting: z
    .object({
      level: z.number(),
      spellcasting_ability: apiReferenceSchema,
      info: z.array(z.object({ name: z.string(), desc: descArray })),
    })
    .optional(),
  spells: z.string().optional(),
});

export const subclassSchema = z.object({
  ...base,
  class: apiReferenceSchema,
  subclass_flavor: z.string(),
  desc: descArray,
  subclass_levels: z.string().optional(),
  spells: z
    .array(z.object({ prerequisites: z.array(z.unknown()), spell: apiReferenceSchema }))
    .optional(),
});

export const spellcastingSlotsSchema = z.object({
  cantrips_known: z.number().optional(),
  spells_known: z.number().optional(),
  spell_slots_level_1: z.number().optional(),
  spell_slots_level_2: z.number().optional(),
  spell_slots_level_3: z.number().optional(),
  spell_slots_level_4: z.number().optional(),
  spell_slots_level_5: z.number().optional(),
  spell_slots_level_6: z.number().optional(),
  spell_slots_level_7: z.number().optional(),
  spell_slots_level_8: z.number().optional(),
  spell_slots_level_9: z.number().optional(),
});

/**
 * A row in the level table.
 *
 * Two traps live here, both confirmed against the data and both handled in the engine:
 *  - rows carrying a `subclass` field are subclass progression, not class progression, yet they
 *    still report the parent `class` (Fighter returns 25 rows for 20 levels);
 *  - `ability_score_bonuses` is CUMULATIVE, not per-level, so an ASI is granted at level N only
 *    when the value exceeds that of level N-1.
 */
export const levelSchema = z.object({
  index: z.string(),
  url: z.string().optional(),
  level: z.number(),
  class: apiReferenceSchema,
  subclass: apiReferenceSchema.optional(),
  features: z.array(apiReferenceSchema),
  prof_bonus: z.number().optional(),
  ability_score_bonuses: z.number().optional(),
  spellcasting: spellcastingSlotsSchema.optional(),
  class_specific: z.record(z.string(), z.unknown()).optional(),
  subclass_specific: z.record(z.string(), z.unknown()).optional(),
});

export const featureSchema = z.object({
  ...base,
  class: apiReferenceSchema,
  subclass: apiReferenceSchema.optional(),
  level: z.number(),
  desc: descArray,
  prerequisites: z.array(z.unknown()),
  reference: z.string().optional(),
  feature_specific: z.unknown().optional(),
  parent: apiReferenceSchema.optional(),
});

export const featSchema = z.object({
  ...base,
  desc: descArray,
  prerequisites: z.array(
    z.object({ ability_score: apiReferenceSchema, minimum_score: z.number() }).partial(),
  ),
});

export const backgroundSchema = z.object({
  ...base,
  starting_proficiencies: z.array(apiReferenceSchema),
  language_options: choiceSchema.optional(),
  starting_equipment: z.array(z.object({ equipment: apiReferenceSchema, quantity: z.number() })),
  starting_equipment_options: z.array(choiceSchema),
  // A cost object, not a bare number -- the naming invites the wrong assumption.
  starting_gold: costSchema.optional(),
  feature: z.object({ name: z.string(), desc: descArray }),
  personality_traits: choiceSchema,
  ideals: choiceSchema,
  bonds: choiceSchema,
  flaws: choiceSchema,
});

export const spellSchema = z.object({
  ...base,
  desc: descArray,
  higher_level: descArray.optional(),
  range: z.string(),
  components: z.array(z.string()),
  material: z.string().optional(),
  ritual: z.boolean(),
  duration: z.string(),
  concentration: z.boolean(),
  casting_time: z.string(),
  level: z.number(),
  attack_type: z.string().optional(),
  school: apiReferenceSchema,
  classes: z.array(apiReferenceSchema),
  subclasses: z.array(apiReferenceSchema),
  damage: z
    .object({
      damage_type: apiReferenceSchema.optional(),
      damage_at_slot_level: z.record(z.string(), z.string()).optional(),
      damage_at_character_level: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
  heal_at_slot_level: z.record(z.string(), z.string()).optional(),
  dc: dcSchema.optional(),
  area_of_effect: z.object({ type: z.string(), size: z.number() }).optional(),
});

export const ruleSchema = z.object({
  ...base,
  desc: z.string(),
  subsections: z.array(apiReferenceSchema),
});
export const ruleSectionSchema = z.object({ ...base, desc: z.string() });

/** Monsters are reference-only for characters (familiars, wild shape), so kept permissive. */
export const monsterSchema = z.object({ ...base }).passthrough();
