import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AbilityId } from '../../rules/schemas/primitives';
import type {
  AbilityScoreMethod,
  ChoiceRecord,
  ContentRef,
  Identity,
} from '../../domain/types';
import { defaultScoresFor } from '../../engine/abilityScores';

/**
 * Creation wizard draft.
 *
 * Selections are stored as `ChoiceRecord`s tagged with the step that offered them. That is what
 * makes back-navigation non-destructive: changing race retracts only the choices whose source is
 * 'race', leaving the player's typed backstory and their class skill picks untouched. Without
 * this, going back is either lossy or needs bespoke undo logic per step.
 *
 * The draft is persisted, so closing the tab mid-creation does not lose work.
 */

export const STEPS = [
  'identity',
  'race',
  'class',
  'background',
  'abilities',
  'proficiencies',
  'equipment',
  'spells',
  'review',
] as const;

export type StepId = (typeof STEPS)[number];

export interface EquipmentPick {
  ref: ContentRef;
  quantity: number;
}

export interface DraftState {
  step: StepId;
  identity: Identity;
  mood: string;

  raceRef: ContentRef | null;
  subraceRef: ContentRef | null;

  classRef: ContentRef | null;
  subclassRef: ContentRef | null;
  level: number;

  backgroundRef: ContentRef | null;

  abilityMethod: AbilityScoreMethod;
  baseScores: Record<AbilityId, number>;
  rolledPool: number[];

  /** Keyed by choice key, holding selected option ids. */
  selections: Record<string, string[]>;
  choices: ChoiceRecord[];

  equipment: EquipmentPick[];
  /** Free-text equipment for choices the SRD could not enumerate. */
  manualEquipment: string[];

  cantrips: ContentRef[];
  spells: ContentRef[];

  portraitAssetId: string | null;
}

interface DraftActions {
  reset: () => void;
  goto: (step: StepId) => void;
  next: () => void;
  back: () => void;

  setIdentity: (patch: Partial<Identity>) => void;
  setMood: (mood: string) => void;
  setPortrait: (assetId: string | null) => void;

  setRace: (race: ContentRef | null) => void;
  setSubrace: (subrace: ContentRef | null) => void;
  setClass: (cls: ContentRef | null) => void;
  setSubclass: (subclass: ContentRef | null) => void;
  setLevel: (level: number) => void;
  setBackground: (background: ContentRef | null) => void;

  setAbilityMethod: (method: AbilityScoreMethod) => void;
  setScore: (ability: AbilityId, value: number) => void;
  setScores: (scores: Record<AbilityId, number>) => void;
  setRolledPool: (pool: number[]) => void;

  select: (choiceKey: string, optionIds: string[]) => void;
  clearSelectionsBySource: (source: ChoiceRecord['source']) => void;

  setEquipment: (picks: EquipmentPick[]) => void;
  addManualEquipment: (text: string) => void;
  removeManualEquipment: (index: number) => void;

  setCantrips: (refs: ContentRef[]) => void;
  setSpells: (refs: ContentRef[]) => void;
}

export type DraftStore = DraftState & DraftActions;

function emptyIdentity(): Identity {
  return {
    name: '',
    pronouns: '',
    alignment: null,
    description: '',
    personalityTraits: [],
    ideals: [],
    bonds: [],
    flaws: [],
    backstory: '',
  };
}

export function initialDraft(): DraftState {
  return {
    step: 'identity',
    identity: emptyIdentity(),
    mood: 'default',
    raceRef: null,
    subraceRef: null,
    classRef: null,
    subclassRef: null,
    level: 1,
    backgroundRef: null,
    abilityMethod: 'standard-array',
    baseScores: defaultScoresFor('standard-array'),
    rolledPool: [],
    selections: {},
    choices: [],
    equipment: [],
    manualEquipment: [],
    cantrips: [],
    spells: [],
    portraitAssetId: null,
  };
}

/**
 * Selection keys are namespaced by their source (`race:`, `class:`, ...), which is what lets a
 * whole step's selections be retracted without knowing what they were.
 */
function dropSelectionsWithPrefix(
  selections: Record<string, string[]>,
  prefix: string,
): Record<string, string[]> {
  return Object.fromEntries(Object.entries(selections).filter(([key]) => !key.startsWith(prefix)));
}

export const useDraft = create<DraftStore>()(
  persist(
    (set, get) => ({
      ...initialDraft(),

      reset: () => set(initialDraft()),
      goto: (step) => set({ step }),

      next: () => {
        const index = STEPS.indexOf(get().step);
        const nextStep = STEPS[Math.min(index + 1, STEPS.length - 1)];
        if (nextStep) set({ step: nextStep });
      },

      back: () => {
        const index = STEPS.indexOf(get().step);
        const prevStep = STEPS[Math.max(index - 1, 0)];
        if (prevStep) set({ step: prevStep });
      },

      setIdentity: (patch) => set({ identity: { ...get().identity, ...patch } }),
      setMood: (mood) => set({ mood }),
      setPortrait: (portraitAssetId) => set({ portraitAssetId }),

      setRace: (raceRef) => {
        if (raceRef?.index === get().raceRef?.index) return;
        // Changing race retracts race-derived choices only; identity and class picks survive.
        set({
          raceRef,
          subraceRef: null,
          selections: dropSelectionsWithPrefix(get().selections, 'race:'),
          choices: get().choices.filter((c) => c.source !== 'race' && c.source !== 'subrace'),
        });
      },

      setSubrace: (subraceRef) => {
        if (subraceRef?.index === get().subraceRef?.index) return;
        set({
          subraceRef,
          selections: dropSelectionsWithPrefix(get().selections, 'subrace:'),
          choices: get().choices.filter((c) => c.source !== 'subrace'),
        });
      },

      setClass: (classRef) => {
        if (classRef?.index === get().classRef?.index) return;
        set({
          classRef,
          subclassRef: null,
          selections: dropSelectionsWithPrefix(get().selections, 'class:'),
          choices: get().choices.filter((c) => c.source !== 'class' && c.source !== 'subclass'),
          // Equipment and spells are class-derived, so they go too.
          equipment: [],
          cantrips: [],
          spells: [],
        });
      },

      setSubclass: (subclassRef) => set({ subclassRef }),
      setLevel: (level) => set({ level: Math.min(20, Math.max(1, Math.floor(level))) }),

      setBackground: (backgroundRef) => {
        if (backgroundRef?.index === get().backgroundRef?.index) return;
        set({
          backgroundRef,
          selections: dropSelectionsWithPrefix(get().selections, 'background:'),
          choices: get().choices.filter((c) => c.source !== 'background'),
        });
      },

      setAbilityMethod: (abilityMethod) => {
        // Switching method lands on a legal spread rather than carrying illegal values over.
        set({ abilityMethod, baseScores: defaultScoresFor(abilityMethod) });
      },

      setScore: (ability, value) =>
        set({ baseScores: { ...get().baseScores, [ability]: value } }),
      setScores: (baseScores) => set({ baseScores }),
      setRolledPool: (rolledPool) => set({ rolledPool }),

      select: (choiceKey, optionIds) =>
        set({ selections: { ...get().selections, [choiceKey]: optionIds } }),

      clearSelectionsBySource: (source) =>
        set({
          selections: dropSelectionsWithPrefix(get().selections, `${source}:`),
          choices: get().choices.filter((c) => c.source !== source),
        }),

      setEquipment: (equipment) => set({ equipment }),
      addManualEquipment: (text) =>
        set({ manualEquipment: [...get().manualEquipment, text] }),
      removeManualEquipment: (index) =>
        set({ manualEquipment: get().manualEquipment.filter((_, i) => i !== index) }),

      setCantrips: (cantrips) => set({ cantrips }),
      setSpells: (spells) => set({ spells }),
    }),
    {
      name: 'cc:creation-draft',
      // Closing the tab mid-creation must not lose work, so the whole draft is persisted.
      version: 1,
    },
  ),
);

/** Whether a step has everything it needs. Drives both navigation and the review summary. */
export function stepComplete(state: DraftState, step: StepId): boolean {
  switch (step) {
    case 'identity':
      return state.identity.name.trim().length > 0;
    case 'race':
      return state.raceRef !== null;
    case 'class':
      return state.classRef !== null;
    case 'background':
      return state.backgroundRef !== null;
    case 'abilities':
      return true;
    case 'proficiencies':
      return true;
    case 'equipment':
      return true;
    case 'spells':
      return true;
    case 'review':
      return false;
    default:
      return false;
  }
}

export function firstIncompleteStep(state: DraftState): StepId | null {
  for (const step of STEPS) {
    if (step === 'review') continue;
    if (!stepComplete(state, step)) return step;
  }
  return null;
}
