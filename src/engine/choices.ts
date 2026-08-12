import type { Choice, Option, ApiReference } from '../rules/schemas/primitives';
import type { CollectionKey } from '../rules/collections';
import type { ContentRef } from '../domain/types';

/**
 * Choice resolution.
 *
 * The SRD expresses player choices as a nested structure with 11 `option_type` discriminants
 * and 3 container shapes. A resolver that handles only flat reference arrays silently drops
 * real choices -- the Fighter's "leather armor, longbow and 20 arrows" bundle is a single
 * option built from three nested ones, and a Cleric's holy symbol is a whole equipment
 * category rather than a list.
 *
 * Anything this module cannot interpret becomes an `unsupported` option carrying its raw
 * description, so the wizard can fall back to manual entry. Nothing is ever dropped silently.
 */

export interface ResolvedGrant {
  ref: ContentRef;
  quantity: number;
}

export type ResolvedOptionKind =
  | 'reference'
  | 'bundle'
  | 'string'
  | 'ability-bonus'
  | 'nested-choice'
  | 'unsupported';

export interface ResolvedOption {
  /** Stable within its choice; used as a React key and stored in selections. */
  id: string;
  label: string;
  kind: ResolvedOptionKind;
  grants: ResolvedGrant[];
  abilityBonus?: { ability: string; bonus: number };
  nested?: ResolvedChoice;
  /** Present when `kind` is 'unsupported', explaining what the user must enter by hand. */
  reason?: string;
}

export interface ResolvedChoice {
  key: string;
  choose: number;
  type: string;
  desc: string | null;
  options: ResolvedOption[];
  /** True when options could not be enumerated and the UI must offer free entry. */
  requiresManualEntry: boolean;
}

export interface ChoiceContext {
  /** Members of an equipment category, keyed by category index. */
  equipmentCategories: Map<string, ApiReference[]>;
  /** Whole collections, keyed by collection name, for `resource_list` expansion. */
  collections: Map<CollectionKey, ApiReference[]>;
}

export function emptyChoiceContext(): ChoiceContext {
  return { equipmentCategories: new Map(), collections: new Map() };
}

const toRef = (ref: ApiReference): ContentRef => ({
  source: 'srd',
  index: ref.index,
  name: ref.name,
});

/** `/api/2014/languages` -> `languages`. Resource lists point at whole collections. */
export function collectionFromUrl(url: string): CollectionKey | null {
  const segment = url.split('/').filter(Boolean).pop();
  return (segment as CollectionKey) ?? null;
}

/**
 * Resolve one SRD choice into something the wizard can render.
 *
 * `key` must be stable across re-renders and re-visits to a step, because selections are stored
 * against it -- an unstable key would silently orphan a player's picks when they navigate back.
 */
export function resolveChoice(choice: Choice, key: string, ctx: ChoiceContext): ResolvedChoice {
  const base = {
    key,
    choose: choice.choose,
    type: choice.type,
    desc: choice.desc ?? null,
  };

  const from = choice.from;

  if (from.option_set_type === 'options_array') {
    return {
      ...base,
      options: from.options.map((o, i) => resolveOption(o, `${key}:${i}`, ctx)),
      requiresManualEntry: false,
    };
  }

  if (from.option_set_type === 'equipment_category') {
    const members = ctx.equipmentCategories.get(from.equipment_category.index) ?? [];
    if (members.length === 0) {
      return {
        ...base,
        options: [],
        // Better to admit the gap than to render an empty picker that looks broken.
        requiresManualEntry: true,
      };
    }
    return {
      ...base,
      options: members.map((m, i) => ({
        id: `${key}:${i}`,
        label: m.name,
        kind: 'reference' as const,
        grants: [{ ref: toRef(m), quantity: 1 }],
      })),
      requiresManualEntry: false,
    };
  }

  // resource_list: a pointer at an entire collection (e.g. every language).
  const collection = collectionFromUrl(from.resource_list_url);
  const entries = collection ? (ctx.collections.get(collection) ?? []) : [];
  return {
    ...base,
    options: entries.map((e, i) => ({
      id: `${key}:${i}`,
      label: e.name,
      kind: 'reference' as const,
      grants: [{ ref: toRef(e), quantity: 1 }],
    })),
    requiresManualEntry: entries.length === 0,
  };
}

function resolveOption(option: Option, id: string, ctx: ChoiceContext): ResolvedOption {
  switch (option.option_type) {
    case 'reference':
      return {
        id,
        label: option.item.name,
        kind: 'reference',
        grants: [{ ref: toRef(option.item), quantity: 1 }],
      };

    case 'counted_reference':
      return {
        id,
        // "20 Arrows" reads better than "Arrows" when a bundle includes ammunition.
        label: option.count > 1 ? `${option.count} ${option.of.name}` : option.of.name,
        kind: 'reference',
        grants: [{ ref: toRef(option.of), quantity: option.count }],
      };

    case 'multiple': {
      // A bundle is one selectable option that grants several things at once.
      const parts = option.items.map((item, i) => resolveOption(item, `${id}:${i}`, ctx));
      return {
        id,
        label: parts.map((p) => p.label).join(', '),
        kind: 'bundle',
        grants: parts.flatMap((p) => p.grants),
      };
    }

    case 'choice': {
      // A choice nested inside an option: picking it opens a further decision.
      const nested = resolveChoice(option.choice, `${id}:nested`, ctx);
      return {
        id,
        label: option.choice.desc ?? `Choose ${option.choice.choose}`,
        kind: 'nested-choice',
        grants: [],
        nested,
      };
    }

    case 'string':
      return { id, label: option.string, kind: 'string', grants: [] };

    case 'ability_bonus':
      return {
        id,
        label: `${option.ability_score.name} +${option.bonus}`,
        kind: 'ability-bonus',
        grants: [],
        abilityBonus: { ability: option.ability_score.index, bonus: option.bonus },
      };

    case 'ideal':
      return { id, label: option.desc, kind: 'string', grants: [] };

    default:
      // score_prerequisite, action, breath, damage -- never offered as a player choice.
      return {
        id,
        label: 'Unsupported option',
        kind: 'unsupported',
        grants: [],
        reason: `Option type "${(option as { option_type: string }).option_type}" cannot be selected here.`,
      };
  }
}

/** Validates a selection against its choice. Returns null when valid. */
export function validateSelection(
  choice: ResolvedChoice,
  selectedIds: string[],
): string | null {
  const unique = new Set(selectedIds);

  if (unique.size !== selectedIds.length) return 'The same option was selected twice.';

  for (const id of unique) {
    if (!choice.options.some((o) => o.id === id)) return 'An option that no longer exists was selected.';
  }

  if (unique.size < choice.choose) {
    const remaining = choice.choose - unique.size;
    return `Choose ${remaining} more.`;
  }

  if (unique.size > choice.choose) return `Choose only ${choice.choose}.`;

  return null;
}

/** Everything a completed selection grants, flattened for application to a character. */
export function grantsFor(choice: ResolvedChoice, selectedIds: string[]): ResolvedGrant[] {
  return selectedIds.flatMap(
    (id) => choice.options.find((o) => o.id === id)?.grants ?? [],
  );
}

export function abilityBonusesFor(
  choice: ResolvedChoice,
  selectedIds: string[],
): { ability: string; bonus: number }[] {
  return selectedIds
    .map((id) => choice.options.find((o) => o.id === id)?.abilityBonus)
    .filter((b): b is { ability: string; bonus: number } => b !== undefined);
}
