import type { AbilityId } from '../rules/schemas/primitives';
import type { Character, InventoryItem, RuleEffect } from '../domain/types';
import {
  ABILITY_IDS,
  abilityModifier,
  proficiencyBonus,
  passiveScore,
  spellSaveDc,
  spellAttackBonus,
  carryingCapacity,
  encumbranceThresholds,
  averageHitDieValue,
  exhaustionEffects,
} from './core';
import { totalAbilityScores } from './abilityScores';
import {
  derive,
  contribution,
  combineAdvantage,
  type Contribution,
  type DerivedValue,
  type AdvantageState,
} from './contributions';
import { effectsForFeature } from './effects/registry';

/**
 * The rules facts a character depends on, pre-resolved.
 *
 * Deliberately not raw SRD documents: the engine should not know the dataset's field names, so
 * that changing rules source or adding homebrew cannot ripple into calculation code.
 */
export interface ResolvedRules {
  skills: { index: string; name: string; ability: AbilityId }[];
  raceSpeed: number;
  hitDieByClass: Record<string, number>;
  savingThrowsByClass: Record<string, AbilityId[]>;
  spellcastingAbilityByClass: Record<string, AbilityId>;
  /** Feature indices the character currently has, from race, class, subclass and background. */
  featureIndices: string[];
  featureNames: Record<string, string>;
}

export function emptyResolvedRules(): ResolvedRules {
  return {
    skills: [],
    raceSpeed: 30,
    hitDieByClass: {},
    savingThrowsByClass: {},
    spellcastingAbilityByClass: {},
    featureIndices: [],
    featureNames: {},
  };
}

export interface SkillValue extends DerivedValue {
  index: string;
  name: string;
  ability: AbilityId;
  proficient: boolean;
  expertise: boolean;
}

export interface AttackValue {
  itemId: string;
  name: string;
  attack: DerivedValue;
  damageDice: string;
  damageBonus: number;
  damageType: string;
  range: string;
  properties: string[];
}

export interface DerivedStats {
  abilityScores: Record<AbilityId, number>;
  abilityModifiers: Record<AbilityId, number>;
  proficiencyBonus: number;
  totalLevel: number;
  savingThrows: Record<AbilityId, DerivedValue & { proficient: boolean }>;
  skills: SkillValue[];
  armorClass: DerivedValue;
  initiative: DerivedValue;
  speed: DerivedValue;
  maxHp: DerivedValue;
  hitDice: { die: number; total: number; spent: number; classIndex: string }[];
  passivePerception: number;
  passiveInvestigation: number;
  passiveInsight: number;
  spellSaveDc: Record<string, number>;
  spellAttackBonus: Record<string, number>;
  carryingCapacity: number;
  currentWeight: number;
  encumbrance: 'none' | 'encumbered' | 'heavily-encumbered' | 'overloaded';
  attacks: AttackValue[];
  /** Effects the engine could not express numerically, surfaced rather than dropped. */
  unmodelledEffects: string[];
  /** Active exhaustion effects, cumulative by level. */
  exhaustionEffects: string[];
}

/**
 * Compute every derived statistic for a character.
 *
 * Pure and synchronous. This is the only place these numbers are produced -- no component
 * recomputes a modifier inline, which is what keeps the sheet, the creation preview and the
 * level-up flow from disagreeing with one another.
 *
 * Calculation order matters and is not arbitrary; see RULES_ENGINE.md §4.
 */
export function deriveCharacter(
  character: Character,
  rules: ResolvedRules,
  items: InventoryItem[],
): DerivedStats {
  const scores = totalAbilityScores(character.abilityScores);
  const mods = {
    str: abilityModifier(scores.str),
    dex: abilityModifier(scores.dex),
    con: abilityModifier(scores.con),
    int: abilityModifier(scores.int),
    wis: abilityModifier(scores.wis),
    cha: abilityModifier(scores.cha),
  } satisfies Record<AbilityId, number>;

  const totalLevel = character.classes.reduce((sum, c) => sum + c.level, 0) || 1;
  const profBonus = proficiencyBonus(totalLevel);

  const equipped = items.filter((i) => i.equipped && i.deletedAt === null);
  const effects = collectEffects(character, rules, equipped);
  const unmodelled: string[] = [];
  for (const e of effects) if (e.t === 'prose-only') unmodelled.push(e.summary);

  const exhaustion = character.resources.exhaustion;
  const activeExhaustionEffects = exhaustionEffects(exhaustion);

  // --- Saving throws -------------------------------------------------------
  const proficientSaves = new Set<AbilityId>();
  for (const cls of character.classes) {
    for (const ability of rules.savingThrowsByClass[cls.classRef.index] ?? []) {
      proficientSaves.add(ability);
    }
  }

  const savingThrows = {} as DerivedStats['savingThrows'];
  for (const id of ABILITY_IDS) {
    const parts: Contribution[] = [contribution(`${id.toUpperCase()} modifier`, mods[id], 'ability')];
    const proficient = proficientSaves.has(id);
    if (proficient) parts.push(contribution('Proficiency', profBonus, 'proficiency'));

    const advantages: AdvantageState[] = [];
    // Exhaustion 3+ imposes disadvantage on saving throws.
    if (exhaustion >= 3) advantages.push('disadvantage');

    savingThrows[id] = {
      ...derive(parts, {
        advantage: combineAdvantage(advantages),
        notes: exhaustion >= 3 ? ['Disadvantage from exhaustion'] : [],
      }),
      proficient,
    };
  }

  // --- Skills --------------------------------------------------------------
  const profIndex = new Map(character.proficiencies.map((p) => [p.ref.index, p]));
  const skills: SkillValue[] = rules.skills.map((skill) => {
    const grant = profIndex.get(`skill-${skill.index}`) ?? profIndex.get(skill.index);
    const proficient = grant !== undefined;
    const expertise = grant?.expertise ?? false;

    const parts: Contribution[] = [
      contribution(`${skill.ability.toUpperCase()} modifier`, mods[skill.ability], 'ability'),
    ];
    if (proficient) {
      parts.push(
        contribution(expertise ? 'Expertise' : 'Proficiency', profBonus * (expertise ? 2 : 1), 'proficiency'),
      );
    }

    return {
      index: skill.index,
      name: skill.name,
      ability: skill.ability,
      proficient,
      expertise,
      ...derive(parts, {
        // Exhaustion 1+ imposes disadvantage on all ability checks.
        advantage: exhaustion >= 1 ? 'disadvantage' : null,
        notes: exhaustion >= 1 ? ['Disadvantage from exhaustion'] : [],
      }),
    };
  });

  // --- Armour class --------------------------------------------------------
  const armorClass = computeArmorClass(mods, effects, equipped);

  // --- Initiative ----------------------------------------------------------
  const initiativeParts: Contribution[] = [contribution('DEX modifier', mods.dex, 'ability')];
  for (const e of effects) {
    if (e.t === 'initiative-bonus') initiativeParts.push(contribution('Feature', e.value, 'feature'));
  }
  const initiative = derive(initiativeParts);

  // --- Speed ---------------------------------------------------------------
  const speedParts: Contribution[] = [contribution('Base speed', rules.raceSpeed, 'base')];
  for (const e of effects) {
    if (e.t === 'speed' && e.mode === 'walk') {
      speedParts.push(
        e.op === 'set'
          ? contribution('Feature', e.value, 'override')
          : contribution('Feature', e.value, 'feature'),
      );
    }
  }
  const speedNotes: string[] = [];
  // Heavy armour you lack the Strength for costs 10 feet of speed.
  for (const item of equipped) {
    const armor = item.armor;
    if (armor && armor.strMinimum > 0 && scores.str < armor.strMinimum) {
      speedParts.push(contribution(`${item.name} (STR ${armor.strMinimum} required)`, -10, 'item'));
      speedNotes.push(`Speed reduced by ${item.name}: requires Strength ${armor.strMinimum}.`);
    }
  }
  if (exhaustion >= 2) {
    speedParts.push(contribution('Exhaustion', -Math.floor(rules.raceSpeed / 2), 'condition'));
    speedNotes.push('Speed halved by exhaustion');
  }
  if (exhaustion >= 5) {
    speedParts.push(contribution('Exhaustion', 0, 'override'));
    speedNotes.push('Speed reduced to 0 by exhaustion');
  }
  const speed = derive(speedParts, { notes: speedNotes });

  // --- Hit points ----------------------------------------------------------
  const maxHp = computeMaxHp(character, rules, mods.con, effects, totalLevel);

  const hitDice = character.classes.map((c) => ({
    die: rules.hitDieByClass[c.classRef.index] ?? 8,
    total: c.level,
    spent: c.hitDiceSpent,
    classIndex: c.classRef.index,
  }));

  // --- Passives ------------------------------------------------------------
  const skillByIndex = new Map(skills.map((s) => [s.index, s]));
  const passiveFor = (index: string, fallback: AbilityId): number => {
    const skill = skillByIndex.get(index);
    const modifier = skill ? skill.total : mods[fallback];
    return passiveScore(modifier, {
      disadvantage: skill?.advantage === 'disadvantage',
      advantage: skill?.advantage === 'advantage',
    });
  };

  // --- Spellcasting --------------------------------------------------------
  const saveDc: Record<string, number> = {};
  const attackBonus: Record<string, number> = {};
  for (const entry of character.spellcasting?.entries ?? []) {
    const ability = entry.ability ?? rules.spellcastingAbilityByClass[entry.classRef.index];
    if (!ability) continue;
    saveDc[entry.classRef.index] = spellSaveDc(profBonus, mods[ability]);
    attackBonus[entry.classRef.index] = spellAttackBonus(profBonus, mods[ability]);
  }

  // --- Carrying ------------------------------------------------------------
  const carryMultiplier = effects.reduce(
    (mult, e) => (e.t === 'carry-multiplier' ? mult * e.value : mult),
    1,
  );
  const capacity = carryingCapacity(scores.str, carryMultiplier);
  const currentWeight = items
    .filter((i) => i.deletedAt === null && !i.weightless)
    // Missing weight is treated as 0: 22 of 237 SRD equipment records carry no weight field,
    // and NaN would poison the total.
    .reduce((sum, i) => sum + (Number.isFinite(i.weight) ? i.weight : 0) * i.quantity, 0);

  const thresholds = encumbranceThresholds(scores.str, carryMultiplier);
  const encumbrance: DerivedStats['encumbrance'] =
    currentWeight > thresholds.maximum
      ? 'overloaded'
      : currentWeight > thresholds.heavilyEncumbered
        ? 'heavily-encumbered'
        : currentWeight > thresholds.encumbered
          ? 'encumbered'
          : 'none';

  // --- Attacks -------------------------------------------------------------
  const attacks = computeAttacks(equipped, mods, profBonus, effects, character);

  return {
    abilityScores: scores,
    abilityModifiers: mods,
    proficiencyBonus: profBonus,
    totalLevel,
    savingThrows,
    skills,
    armorClass,
    initiative,
    speed,
    maxHp,
    hitDice,
    passivePerception: passiveFor('perception', 'wis'),
    passiveInvestigation: passiveFor('investigation', 'int'),
    passiveInsight: passiveFor('insight', 'wis'),
    spellSaveDc: saveDc,
    spellAttackBonus: attackBonus,
    carryingCapacity: capacity,
    currentWeight,
    encumbrance,
    attacks,
    unmodelledEffects: [...new Set(unmodelled)],
    exhaustionEffects: activeExhaustionEffects,
  };
}

/** Gathers effects from features, items and custom abilities into one list. */
function collectEffects(
  character: Character,
  rules: ResolvedRules,
  equipped: InventoryItem[],
): RuleEffect[] {
  const effects: RuleEffect[] = [];

  for (const index of rules.featureIndices) {
    effects.push(...effectsForFeature(index, rules.featureNames[index]));
  }
  for (const feature of character.customFeatures) effects.push(...feature.effects);
  for (const item of equipped) effects.push(...item.effects);

  return effects;
}

/**
 * Armour class.
 *
 * The competing formulas are computed and the best is taken, rather than stacking. A Barbarian
 * wearing armour uses the armour; the same code path keeps working when a homebrew formula is
 * added, because nothing here is special-cased by class.
 */
function computeArmorClass(
  mods: Record<AbilityId, number>,
  effects: RuleEffect[],
  equipped: InventoryItem[],
): DerivedValue {
  const armor = equipped.find((i) => i.category === 'armor' && !isShield(i));
  const shield = equipped.find((i) => isShield(i));

  const flatBonuses = effects.filter((e) => e.t === 'ac-bonus') as Extract<RuleEffect, { t: 'ac-bonus' }>[];
  const shieldBonus = shield ? 2 : 0;

  interface Candidate {
    parts: Contribution[];
    total: number;
  }

  const candidates: Candidate[] = [];

  // Unarmoured baseline, always available.
  if (!armor) {
    const parts = [
      contribution('Base', 10, 'base'),
      contribution('DEX modifier', mods.dex, 'ability'),
    ];
    if (shield) parts.push(contribution(shield.name, shieldBonus, 'item'));
    candidates.push({ parts, total: sum(parts) });
  }

  // Worn armour, using the published formula rather than hardcoded categories.
  if (armor) {
    const formula = armorFormula(armor);
    const dexApplied = formula.dexBonus
      ? formula.maxDex === null
        ? mods.dex
        : Math.min(mods.dex, formula.maxDex)
      : 0;

    const parts = [contribution(armor.name, formula.base, 'item')];
    if (formula.dexBonus) {
      parts.push(
        contribution(
          formula.maxDex !== null && mods.dex > formula.maxDex
            ? `DEX modifier (capped at +${formula.maxDex})`
            : 'DEX modifier',
          dexApplied,
          'ability',
        ),
      );
    }
    if (shield) parts.push(contribution(shield.name, shieldBonus, 'item'));
    candidates.push({ parts, total: sum(parts) });
  }

  // Feature formulas, which require no armour and may forbid shields.
  for (const effect of effects) {
    if (effect.t !== 'ac-formula') continue;
    if (effect.requiresNoArmor && armor) continue;
    if (!effect.allowShield && shield) continue;

    const parts = [contribution(effect.label, effect.base, 'feature')];
    for (const ability of effect.adds) {
      parts.push(contribution(`${ability.toUpperCase()} modifier`, mods[ability], 'ability'));
    }
    if (shield && effect.allowShield) parts.push(contribution(shield.name, shieldBonus, 'item'));
    candidates.push({ parts, total: sum(parts) });
  }

  const best = candidates.sort((a, b) => b.total - a.total)[0] ?? {
    parts: [contribution('Base', 10, 'base'), contribution('DEX modifier', mods.dex, 'ability')],
    total: 10 + mods.dex,
  };

  const parts = [...best.parts];
  for (const bonus of flatBonuses) parts.push(contribution('Feature', bonus.value, 'feature'));

  return derive(parts);
}

function sum(parts: Contribution[]): number {
  return parts.reduce((n, p) => n + p.value, 0);
}

function isShield(item: InventoryItem): boolean {
  return item.armor?.isShield ?? item.ref?.index === 'shield';
}

/** Armour values, falling back to leather-equivalent stats for custom armour with none. */
function armorFormula(item: InventoryItem): { base: number; dexBonus: boolean; maxDex: number | null } {
  if (item.armor) {
    return { base: item.armor.base, dexBonus: item.armor.dexBonus, maxDex: item.armor.maxDex };
  }
  // Custom armour with no declared stats still has to produce a sane number.
  return { base: 11, dexBonus: true, maxDex: null };
}

function computeMaxHp(
  character: Character,
  rules: ResolvedRules,
  conMod: number,
  effects: RuleEffect[],
  totalLevel: number,
): DerivedValue {
  if (character.resources.maxHpOverride !== null) {
    return derive([contribution('Manual maximum', character.resources.maxHpOverride, 'override')]);
  }

  const parts: Contribution[] = [];

  for (const cls of character.classes) {
    const die = rules.hitDieByClass[cls.classRef.index] ?? 8;
    // First level of the first class is always the full die.
    const isFirst = character.classes.indexOf(cls) === 0;

    const rolls = cls.hitPointRolls;
    let classHp = 0;
    for (let level = 1; level <= cls.level; level++) {
      if (isFirst && level === 1) {
        classHp += die;
        continue;
      }
      const recorded = rolls[level - 1];
      classHp += recorded !== undefined && Number.isFinite(recorded)
        ? recorded
        : averageHitDieValue(die);
    }
    parts.push(contribution(`${cls.classRef.name} hit dice`, classHp, 'base'));
  }

  if (parts.length === 0) parts.push(contribution('No class chosen', 0, 'base'));

  parts.push(contribution(`CON modifier x ${totalLevel}`, conMod * totalLevel, 'ability'));

  for (const effect of effects) {
    if (effect.t === 'max-hp-per-level') {
      parts.push(contribution('Feature', effect.value * totalLevel, 'feature'));
    }
  }

  const notes: string[] = [];
  if (character.resources.exhaustion >= 4) notes.push('Hit point maximum halved by exhaustion');

  return derive(parts, { notes });
}

function computeAttacks(
  equipped: InventoryItem[],
  mods: Record<AbilityId, number>,
  profBonus: number,
  effects: RuleEffect[],
  character: Character,
): AttackValue[] {
  const weapons = equipped.filter((i) => i.category === 'weapon');
  const proficientIndices = new Set(character.proficiencies.map((p) => p.ref.index));

  return weapons.map((weapon) => {
    const meta = weaponMeta(weapon);
    // Finesse uses the better of STR and DEX; ranged weapons use DEX.
    const ability: AbilityId = meta.finesse
      ? mods.dex >= mods.str
        ? 'dex'
        : 'str'
      : meta.ranged
        ? 'dex'
        : 'str';

    const proficient =
      weapon.ref !== null &&
      (proficientIndices.has(weapon.ref.index) || proficientIndices.has(meta.categoryProficiency));

    const parts: Contribution[] = [
      contribution(`${ability.toUpperCase()} modifier`, mods[ability], 'ability'),
    ];
    if (proficient) parts.push(contribution('Proficiency', profBonus, 'proficiency'));

    for (const effect of effects) {
      if (effect.t !== 'attack-bonus') continue;
      const applies =
        effect.appliesTo === 'all' ||
        (effect.appliesTo === 'ranged-weapon' && meta.ranged) ||
        (effect.appliesTo === 'melee-weapon' && !meta.ranged);
      if (applies) parts.push(contribution('Fighting style', effect.value, 'feature'));
    }

    return {
      itemId: weapon.id,
      name: weapon.name,
      attack: derive(parts),
      damageDice: meta.damageDice,
      damageBonus: mods[ability],
      damageType: meta.damageType,
      range: meta.range,
      properties: meta.properties,
    };
  });
}

interface ResolvedWeapon {
  damageDice: string;
  damageType: string;
  range: string;
  finesse: boolean;
  ranged: boolean;
  properties: string[];
  categoryProficiency: string;
}

/** Weapon facts from the item's own snapshot, with safe defaults for custom weapons. */
function weaponMeta(item: InventoryItem): ResolvedWeapon {
  const meta = item.weapon;
  const properties = meta?.properties ?? [];
  return {
    damageDice: meta?.damageDice ?? '1d4',
    damageType: meta?.damageType ?? 'bludgeoning',
    range: meta?.ranged ? 'ranged' : 'melee',
    finesse: properties.some((p) => /finesse/i.test(p)),
    ranged: meta?.ranged ?? false,
    properties,
    categoryProficiency: meta?.categoryProficiency ?? 'simple-weapons',
  };
}
