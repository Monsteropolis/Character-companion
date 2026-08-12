import type { z } from 'zod';
import * as s from './schemas/collections';

/**
 * The registry of SRD collections.
 *
 * One entry per dataset file, pairing the collection key used throughout the app with its
 * validation schema and its source filename. Everything downstream -- the RulesSource
 * abstraction, the loaders, the integrity test -- is driven from this single table, so adding
 * a collection is a one-line change and no collection can be silently left unvalidated.
 */
export const collectionRegistry = {
  'ability-scores': { file: '5e-SRD-Ability-Scores.json', schema: s.abilityScoreSchema },
  alignments: { file: '5e-SRD-Alignments.json', schema: s.alignmentSchema },
  backgrounds: { file: '5e-SRD-Backgrounds.json', schema: s.backgroundSchema },
  classes: { file: '5e-SRD-Classes.json', schema: s.classSchema },
  conditions: { file: '5e-SRD-Conditions.json', schema: s.conditionSchema },
  'damage-types': { file: '5e-SRD-Damage-Types.json', schema: s.damageTypeSchema },
  'equipment-categories': {
    file: '5e-SRD-Equipment-Categories.json',
    schema: s.equipmentCategorySchema,
  },
  equipment: { file: '5e-SRD-Equipment.json', schema: s.equipmentSchema },
  feats: { file: '5e-SRD-Feats.json', schema: s.featSchema },
  features: { file: '5e-SRD-Features.json', schema: s.featureSchema },
  languages: { file: '5e-SRD-Languages.json', schema: s.languageSchema },
  levels: { file: '5e-SRD-Levels.json', schema: s.levelSchema },
  'magic-items': { file: '5e-SRD-Magic-Items.json', schema: s.magicItemSchema },
  'magic-schools': { file: '5e-SRD-Magic-Schools.json', schema: s.magicSchoolSchema },
  monsters: { file: '5e-SRD-Monsters.json', schema: s.monsterSchema },
  proficiencies: { file: '5e-SRD-Proficiencies.json', schema: s.proficiencySchema },
  races: { file: '5e-SRD-Races.json', schema: s.raceSchema },
  'rule-sections': { file: '5e-SRD-Rule-Sections.json', schema: s.ruleSectionSchema },
  rules: { file: '5e-SRD-Rules.json', schema: s.ruleSchema },
  skills: { file: '5e-SRD-Skills.json', schema: s.skillSchema },
  spells: { file: '5e-SRD-Spells.json', schema: s.spellSchema },
  subclasses: { file: '5e-SRD-Subclasses.json', schema: s.subclassSchema },
  subraces: { file: '5e-SRD-Subraces.json', schema: s.subraceSchema },
  traits: { file: '5e-SRD-Traits.json', schema: s.traitSchema },
  'weapon-properties': { file: '5e-SRD-Weapon-Properties.json', schema: s.weaponPropertySchema },
} as const;

export type CollectionKey = keyof typeof collectionRegistry;

export type CollectionDoc<K extends CollectionKey> = z.infer<
  (typeof collectionRegistry)[K]['schema']
>;

export const collectionKeys = Object.keys(collectionRegistry) as CollectionKey[];

/**
 * Collections whose content is fully covered by the SRD, versus those the SRD only samples.
 *
 * This is surfaced in the UI so a player is told up front that they are seeing 1 of ~13
 * backgrounds rather than silently concluding the app is broken. See API_INTEGRATION.md §2.
 */
export const srdCoverage: Partial<Record<CollectionKey, { complete: boolean; note?: string }>> = {
  races: { complete: true },
  classes: { complete: true },
  skills: { complete: true },
  conditions: { complete: true },
  backgrounds: { complete: false, note: 'SRD includes only Acolyte. Add your own as custom content.' },
  feats: { complete: false, note: 'SRD includes only Grappler. Add your own as custom content.' },
  subclasses: {
    complete: false,
    note: 'SRD includes one subclass per class. Add your own as custom content.',
  },
  subraces: {
    complete: false,
    note: 'SRD includes 4 subraces. Add your own as custom content.',
  },
  spells: { complete: false, note: 'SRD includes 319 of the spells in the 2014 rules.' },
};
