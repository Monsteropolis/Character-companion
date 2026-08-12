import { useMemo } from 'react';
import { useCollections } from '../../rules/RulesProvider';
import { resolveChoice, emptyChoiceContext, grantsFor, abilityBonusesFor } from '../../engine/choices';
import type { ChoiceContext } from '../../engine/choices';
import { deriveCharacter, emptyResolvedRules, type ResolvedRules, type DerivedStats } from '../../engine/derive';
import { commitDraft, type CommitResult } from './commitDraft';
import { useDraft, type DraftState } from './draft';
import type { AbilityId, Choice } from '../../rules/schemas/primitives';
import type { ContentRef, InventoryItem, ProficiencyGrant } from '../../domain/types';

/**
 * Assembles a draft into a previewable character.
 *
 * The review step and the final commit run through exactly the same code, so what a player is
 * shown before confirming is precisely what gets saved. Computing the preview separately would
 * be the easiest possible way to introduce a discrepancy at the one irreversible moment.
 */
export interface DraftPreview {
  ready: boolean;
  loading: boolean;
  error: string | null;
  stats: DerivedStats | null;
  result: CommitResult | null;
  racialBonuses: Partial<Record<AbilityId, number>>;
  proficiencyNames: string[];
  itemNames: string[];
  spellcastingAbility: AbilityId | null;
}

export function useDraftPreview(): DraftPreview {
  const draft = useDraft();
  const { data, isLoading, isError, error } = useCollections([
    'races',
    'subraces',
    'classes',
    'subclasses',
    'backgrounds',
    'skills',
    'levels',
    'features',
    'equipment',
    'equipment-categories',
    'languages',
    'traits',
  ]);

  return useMemo(() => {
    const base: DraftPreview = {
      ready: false,
      loading: isLoading,
      error: isError ? (error instanceof Error ? error.message : 'Could not load rules data.') : null,
      stats: null,
      result: null,
      racialBonuses: {},
      proficiencyNames: [],
      itemNames: [],
      spellcastingAbility: null,
    };

    if (isLoading || isError || !data) return base;

    const ctx: ChoiceContext = emptyChoiceContext();
    for (const cat of data['equipment-categories']) {
      ctx.equipmentCategories.set(cat.index, cat.equipment);
    }
    ctx.collections.set('languages', data.languages);

    const race = data.races.find((r) => r.index === draft.raceRef?.index);
    const subrace = data.subraces.find((s) => s.index === draft.subraceRef?.index);
    const cls = data.classes.find((c) => c.index === draft.classRef?.index);
    const background = data.backgrounds.find((b) => b.index === draft.backgroundRef?.index);

    // --- Racial ability bonuses -------------------------------------------
    const racialBonuses: Partial<Record<AbilityId, number>> = {};
    const addBonus = (ability: string, bonus: number) => {
      const id = ability as AbilityId;
      racialBonuses[id] = (racialBonuses[id] ?? 0) + bonus;
    };

    for (const b of race?.ability_bonuses ?? []) addBonus(b.ability_score.index, b.bonus);
    for (const b of subrace?.ability_bonuses ?? []) addBonus(b.ability_score.index, b.bonus);

    if (race?.ability_bonus_options) {
      const key = `race:${race.index}:ability-bonus`;
      const resolved = resolveChoice(race.ability_bonus_options as Choice, key, ctx);
      for (const b of abilityBonusesFor(resolved, draft.selections[key] ?? [])) {
        addBonus(b.ability, b.bonus);
      }
    }

    // --- Proficiencies -----------------------------------------------------
    const proficiencies: ProficiencyGrant[] = [];
    const addProf = (ref: ContentRef, from: ProficiencyGrant['from']) => {
      if (proficiencies.some((p) => p.ref.index === ref.index)) return;
      proficiencies.push({ ref, from, expertise: false });
    };

    for (const p of race?.starting_proficiencies ?? []) {
      addProf({ source: 'srd', index: p.index, name: p.name }, 'race');
    }
    for (const p of subrace?.starting_proficiencies ?? []) {
      addProf({ source: 'srd', index: p.index, name: p.name }, 'subrace');
    }
    for (const p of cls?.proficiencies ?? []) {
      addProf({ source: 'srd', index: p.index, name: p.name }, 'class');
    }
    for (const p of background?.starting_proficiencies ?? []) {
      addProf({ source: 'srd', index: p.index, name: p.name }, 'background');
    }

    (cls?.proficiency_choices ?? []).forEach((choice, i) => {
      const key = `class:${cls!.index}:prof:${i}`;
      const resolved = resolveChoice(choice as Choice, key, ctx);
      for (const grant of grantsFor(resolved, draft.selections[key] ?? [])) {
        addProf(grant.ref, 'class');
      }
    });

    // --- Starting equipment ------------------------------------------------
    const equipmentByIndex = new Map(data.equipment.map((e) => [e.index, e]));
    const items: { ref: ContentRef | null; name: string; quantity: number; item?: Partial<InventoryItem> }[] = [];

    const addItem = (ref: ContentRef, quantity: number) => {
      const doc = equipmentByIndex.get(ref.index);
      items.push({
        ref,
        name: ref.name,
        quantity,
        item: doc ? inventoryFieldsFor(doc) : {},
      });
    };

    for (const entry of cls?.starting_equipment ?? []) {
      addItem(
        { source: 'srd', index: entry.equipment.index, name: entry.equipment.name },
        entry.quantity,
      );
    }
    for (const entry of background?.starting_equipment ?? []) {
      addItem(
        { source: 'srd', index: entry.equipment.index, name: entry.equipment.name },
        entry.quantity,
      );
    }

    const collectEquipmentChoices = (choices: Choice[] | undefined, prefix: string) => {
      (choices ?? []).forEach((choice, i) => {
        const key = `${prefix}:${i}`;
        const resolved = resolveChoice(choice, key, ctx);
        for (const grant of grantsFor(resolved, draft.selections[key] ?? [])) {
          addItem(grant.ref, grant.quantity);
        }
      });
    };

    if (cls) {
      collectEquipmentChoices(cls.starting_equipment_options as Choice[], `class:${cls.index}:equipment`);
    }
    if (background) {
      collectEquipmentChoices(
        background.starting_equipment_options as Choice[],
        `background:${background.index}:equipment`,
      );
    }

    for (const name of draft.manualEquipment) {
      items.push({ ref: null, name, quantity: 1 });
    }

    // --- Features ----------------------------------------------------------
    const featureIndices: string[] = [];
    const featureNames: Record<string, string> = {};

    for (const feature of data.features) {
      if (feature.class.index !== cls?.index) continue;
      if (feature.level > draft.level) continue;
      if (feature.subclass && feature.subclass.index !== draft.subclassRef?.index) continue;
      featureIndices.push(feature.index);
      featureNames[feature.index] = feature.name;
    }
    for (const traitRef of [...(race?.traits ?? []), ...(subrace?.racial_traits ?? [])]) {
      featureIndices.push(traitRef.index);
      featureNames[traitRef.index] = traitRef.name;
    }

    // --- Resolved rules ----------------------------------------------------
    const rules: ResolvedRules = {
      ...emptyResolvedRules(),
      skills: data.skills.map((s) => ({
        index: s.index,
        name: s.name,
        ability: s.ability_score.index as AbilityId,
      })),
      raceSpeed: race?.speed ?? 30,
      hitDieByClass: Object.fromEntries(data.classes.map((c) => [c.index, c.hit_die])),
      savingThrowsByClass: Object.fromEntries(
        data.classes.map((c) => [c.index, c.saving_throws.map((s) => s.index as AbilityId)]),
      ),
      spellcastingAbilityByClass: Object.fromEntries(
        data.classes
          .filter((c) => c.spellcasting)
          .map((c) => [c.index, c.spellcasting!.spellcasting_ability.index as AbilityId]),
      ),
      featureIndices,
      featureNames,
    };

    const spellcastingAbility =
      (cls?.spellcasting?.spellcasting_ability.index as AbilityId | undefined) ?? null;

    const result = commitDraft({
      draft: draft as DraftState,
      rules,
      racialBonuses,
      proficiencies,
      items,
      startingCurrency: background?.starting_gold
        ? { [currencyKey(background.starting_gold.unit)]: background.starting_gold.quantity }
        : {},
      spellcastingAbility,
    });

    const stats = deriveCharacter(result.character, rules, result.items);

    return {
      ready: Boolean(cls && race),
      loading: false,
      error: null,
      stats,
      result,
      racialBonuses,
      proficiencyNames: proficiencies.map((p) => p.ref.name),
      itemNames: items.map((i) => (i.quantity > 1 ? `${i.quantity}x ${i.name}` : i.name)),
      spellcastingAbility,
    };
  }, [data, isLoading, isError, error, draft]);
}

function currencyKey(unit: string): 'cp' | 'sp' | 'ep' | 'gp' | 'pp' {
  const normalized = unit.toLowerCase();
  return (['cp', 'sp', 'ep', 'gp', 'pp'] as const).includes(normalized as 'gp')
    ? (normalized as 'gp')
    : 'gp';
}

/**
 * Snapshots an equipment document's mechanical stats onto the inventory item.
 *
 * Copying rather than referencing is what lets the item keep working if its rules entry is
 * later edited or removed, and puts SRD and homebrew items on identical footing.
 */
function inventoryFieldsFor(doc: {
  index: string;
  equipment_category: { index: string };
  weight?: number;
  armor_category?: string;
  armor_class?: { base: number; dex_bonus: boolean; max_bonus?: number };
  str_minimum?: number;
  stealth_disadvantage?: boolean;
  damage?: { damage_dice?: string; damage_type?: { name: string } };
  two_handed_damage?: { damage_dice?: string };
  weapon_range?: string;
  weapon_category?: string;
  properties?: { name: string }[];
  range?: { normal: number; long?: number | null };
}): Partial<InventoryItem> {
  const fields: Partial<InventoryItem> = { weight: doc.weight ?? 0 };
  const category = doc.equipment_category.index;

  if (category === 'armor' && doc.armor_class) {
    fields.category = 'armor';
    fields.armor = {
      base: doc.armor_class.base,
      dexBonus: doc.armor_class.dex_bonus,
      maxDex: doc.armor_class.max_bonus ?? null,
      strMinimum: doc.str_minimum ?? 0,
      stealthDisadvantage: doc.stealth_disadvantage ?? false,
      isShield: doc.armor_category === 'Shield',
    };
  }

  if (category === 'weapon' && doc.damage) {
    fields.category = 'weapon';
    fields.weapon = {
      damageDice: doc.damage.damage_dice ?? '1d4',
      damageType: doc.damage.damage_type?.name ?? 'Bludgeoning',
      versatileDice: doc.two_handed_damage?.damage_dice ?? null,
      ranged: doc.weapon_range === 'Ranged',
      properties: (doc.properties ?? []).map((p) => p.name),
      categoryProficiency:
        doc.weapon_category === 'Martial' ? 'martial-weapons' : 'simple-weapons',
      rangeNormal: doc.range?.normal ?? null,
      rangeLong: doc.range?.long ?? null,
    };
  }

  if (category === 'tools') fields.category = 'tool';

  return fields;
}
