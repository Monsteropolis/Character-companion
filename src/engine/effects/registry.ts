import type { RuleEffect } from '../../domain/types';

/**
 * The effects layer.
 *
 * SRD features carry prose and nothing else -- Barbarian Unarmored Defense arrives as the
 * sentence "your Armor Class equals 10 + your Dexterity modifier + your Constitution modifier".
 * No 5e API computes that. This registry is the hand-authored bridge from feature index to
 * machine-readable effect, and it is the reason the engine can compute anything feature-driven.
 *
 * Coverage is deliberately incremental and honest: entries are added with tests as features
 * become reachable in the app. A feature absent from this registry is NOT broken -- it falls
 * back to `prose-only`, still renders its full description in Features & Traits, and is
 * reported on any statistic it might affect. The failure this design refuses is a feature that
 * silently does nothing.
 */

export const FEATURE_EFFECTS: Record<string, RuleEffect[]> = {
  // --- Alternative AC formulas. These compete with armor rather than stacking with it. ---
  'barbarian-unarmored-defense': [
    {
      t: 'ac-formula',
      base: 10,
      adds: ['dex', 'con'],
      allowShield: true,
      requiresNoArmor: true,
      label: 'Unarmored Defense',
    },
  ],
  'monk-unarmored-defense': [
    {
      t: 'ac-formula',
      base: 10,
      adds: ['dex', 'wis'],
      // Unlike the Barbarian's, the Monk's formula is lost the moment a shield is used.
      allowShield: false,
      requiresNoArmor: true,
      label: 'Unarmored Defense',
    },
  ],

  // --- Fighting styles ---
  'fighting-style-defense': [{ t: 'ac-bonus', value: 1 }],
  'fighting-style-archery': [{ t: 'attack-bonus', appliesTo: 'ranged-weapon', value: 2 }],
  'fighting-style-dueling': [
    { t: 'prose-only', summary: '+2 damage with a one-handed melee weapon and no other weapon.' },
  ],
  'fighting-style-great-weapon-fighting': [
    { t: 'prose-only', summary: 'Reroll 1s and 2s on damage with a two-handed or versatile weapon.' },
  ],
  'fighting-style-protection': [
    { t: 'prose-only', summary: 'Reaction: impose disadvantage on an attack against a nearby ally.' },
  ],
  'fighting-style-two-weapon-fighting': [
    { t: 'prose-only', summary: 'Add your ability modifier to off-hand attack damage.' },
  ],

  // --- Racial traits ---
  'dwarven-resilience': [
    { t: 'save-advantage', against: 'poison' },
    { t: 'resistance', damageType: 'poison' },
  ],
  'fey-ancestry': [
    { t: 'save-advantage', against: 'charmed' },
    { t: 'prose-only', summary: 'Magic cannot put you to sleep.' },
  ],
  'draconic-ancestry': [
    { t: 'prose-only', summary: 'Damage resistance and breath weapon depend on your dragon ancestry.' },
  ],
  'hellish-resistance': [{ t: 'resistance', damageType: 'fire' }],
  'dwarven-combat-training': [
    { t: 'prose-only', summary: 'Proficiency with battleaxe, handaxe, light hammer and warhammer.' },
  ],
  'stonecunning': [
    { t: 'prose-only', summary: 'Double proficiency on History checks about stonework.' },
  ],
  'powerful-build': [{ t: 'carry-multiplier', value: 2 }],
  'lucky': [{ t: 'prose-only', summary: 'Reroll a 1 on an attack roll, ability check or saving throw.' }],
  'brave': [{ t: 'save-advantage', against: 'frightened' }],
  'darkvision': [{ t: 'prose-only', summary: 'See in dim light within 60 feet as if it were bright light.' }],
  'gnome-cunning': [
    { t: 'save-advantage', against: 'magic' },
    { t: 'prose-only', summary: 'Advantage on INT, WIS and CHA saves against magic.' },
  ],

  // --- Class features with computable resources ---
  'barbarian-rage': [
    {
      t: 'prose-only',
      summary: 'Advantage on STR checks and saves, bonus melee damage, and resistance to bludgeoning, piercing and slashing damage.',
    },
  ],
  'rogue-sneak-attack': [
    { t: 'prose-only', summary: 'Extra damage once per turn when you have advantage or an ally is adjacent.' },
  ],
  'monk-martial-arts': [
    { t: 'prose-only', summary: 'Use DEX for unarmed strikes and monk weapons; bonus-action unarmed strike.' },
  ],
  'monk-unarmored-movement': [{ t: 'speed', mode: 'walk', value: 10, op: 'add' }],
  'sorcerer-draconic-resilience': [
    { t: 'max-hp-per-level', value: 1 },
    {
      t: 'ac-formula',
      base: 13,
      adds: ['dex'],
      allowShield: true,
      requiresNoArmor: true,
      label: 'Draconic Resilience',
    },
  ],
};

/**
 * Effects for a feature.
 *
 * Unknown features get a `prose-only` marker rather than an empty array, so downstream code can
 * distinguish "this feature has no mechanical effect" from "we have not encoded it yet" and
 * surface the difference to the user.
 */
export function effectsForFeature(index: string, fallbackSummary?: string): RuleEffect[] {
  const known = FEATURE_EFFECTS[index];
  if (known) return known;
  return [{ t: 'prose-only', summary: fallbackSummary ?? 'See the feature description.' }];
}

export function isEncoded(index: string): boolean {
  return index in FEATURE_EFFECTS;
}

/** Coverage stats, surfaced in the About screen so the gap is visible rather than implied. */
export function encodedFeatureCount(): number {
  return Object.keys(FEATURE_EFFECTS).length;
}
