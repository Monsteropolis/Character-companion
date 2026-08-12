import type { AbilityId } from '../../rules/schemas/primitives';
import type {
  Character,
  ContentRef,
  InventoryItem,
  ProficiencyGrant,
  SpellSelection,
} from '../../domain/types';
import { createCharacter, createInventoryItem, newId, zeroAbilities } from '../../domain/factories';
import { deriveCharacter, type ResolvedRules } from '../../engine/derive';
import type { DraftState } from './draft';

/**
 * Turning a draft into a character.
 *
 * Kept pure and separate from the UI so the exact object that gets persisted can be tested
 * without rendering anything. This is the one irreversible moment in creation, so it is also
 * the one most worth testing.
 */

export interface CommitInput {
  draft: DraftState;
  rules: ResolvedRules;
  /** Racial ability bonuses, already resolved from race, subrace and any choices. */
  racialBonuses: Partial<Record<AbilityId, number>>;
  /** Proficiencies granted by race, class, background and their choices. */
  proficiencies: ProficiencyGrant[];
  /** Equipment resolved from starting-equipment choices. */
  items: { ref: ContentRef | null; name: string; quantity: number; item?: Partial<InventoryItem> }[];
  startingCurrency?: Partial<Character['currency']>;
  spellcastingAbility: AbilityId | null;
}

export interface CommitResult {
  character: Character;
  items: InventoryItem[];
}

export function commitDraft(input: CommitInput): CommitResult {
  const { draft, rules, racialBonuses, proficiencies, items, spellcastingAbility } = input;

  const racial = { ...zeroAbilities(), ...racialBonuses };

  const character = createCharacter({
    identity: { ...draft.identity },
    mood: draft.mood,
    portraitId: draft.portraitAssetId,
    race: { raceRef: draft.raceRef, subraceRef: draft.subraceRef },
    background: { ref: draft.backgroundRef, feature: null },
    classes: draft.classRef
      ? [
          {
            classRef: draft.classRef,
            subclassRef: draft.subclassRef,
            level: draft.level,
            hitDiceSpent: 0,
            // Levels beyond the first take the class average unless the player rolled; the
            // level-up flow records real rolls from here on.
            hitPointRolls: [],
          },
        ]
      : [],
    abilityScores: {
      base: { ...draft.baseScores },
      method: draft.abilityMethod,
      racial,
      asi: zeroAbilities(),
      misc: zeroAbilities(),
      override: {},
    },
    proficiencies,
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, ...input.startingCurrency },
    choices: draft.choices,
    spellcasting: buildSpellcasting(draft, spellcastingAbility),
    xp: 0,
  });

  const inventory = items.map((entry) =>
    createInventoryItem(character.id, {
      ref: entry.ref,
      name: entry.name,
      quantity: entry.quantity,
      ...entry.item,
    }),
  );

  // Hit points start full. Deriving here rather than duplicating the formula keeps the sheet
  // and the wizard's review from ever disagreeing about starting HP.
  const derived = deriveCharacter(character, rules, inventory);
  character.resources.currentHp = derived.maxHp.total;

  return { character, items: inventory };
}

function buildSpellcasting(
  draft: DraftState,
  ability: AbilityId | null,
): Character['spellcasting'] {
  if (!draft.classRef || !ability) return null;
  if (draft.cantrips.length === 0 && draft.spells.length === 0) return null;

  const known: SpellSelection[] = [
    ...draft.cantrips.map((ref) => ({
      ref,
      // Cantrips are always available and never occupy a prepared slot.
      prepared: true,
      alwaysPrepared: true,
      source: 'class' as const,
    })),
    ...draft.spells.map((ref) => ({
      ref,
      prepared: true,
      alwaysPrepared: false,
      source: 'class' as const,
    })),
  ];

  return {
    entries: [
      {
        classRef: draft.classRef,
        ability,
        preparation: draft.classRef.index === 'wizard' ? 'spellbook' : 'known',
        known,
        ritualCasting: draft.classRef.index === 'wizard' || draft.classRef.index === 'cleric',
      },
    ],
  };
}

/** Records a completed choice so it can be shown, audited and retracted later. */
export function recordChoice(
  source: 'race' | 'subrace' | 'class' | 'subclass' | 'background',
  sourceRef: ContentRef,
  choiceKey: string,
  selected: ContentRef[],
  atLevel = 1,
) {
  return { id: newId(), source, sourceRef, atLevel, choiceKey, selected };
}
