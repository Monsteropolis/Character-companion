import type { AbilityId } from '../rules/schemas/primitives';
import type {
  Character,
  ChoiceRecord,
  ClassEntry,
  ContentRef,
  LevelUpRecord,
} from '../domain/types';
import { proficiencyBonus, averageHitDieValue, clampLevel, MAX_LEVEL } from './core';
import { totalAbilityScores } from './abilityScores';
import { abilityModifier } from './core';

/**
 * Level progression.
 *
 * The brief's rule for this subsystem is that nothing irreversible happens silently, so the
 * design is a two-phase transaction: `levelUpPlan` inspects the rules and reports every decision
 * the level presents, mutating nothing; `applyLevelUp` commits a set of answers and writes a
 * `LevelUpRecord` so the whole step can be undone.
 *
 * Two dataset traps live here and are handled explicitly:
 *  - `ability_score_bonuses` is CUMULATIVE, so an ASI occurs only where the value increases;
 *  - `Levels` mixes subclass rows into class progression, so rows carrying a `subclass` field
 *    must be excluded before anything is counted.
 */

export interface LevelRow {
  classIndex: string;
  level: number;
  /** Absent on subclass rows -- their presence is how those rows are identified. */
  abilityScoreBonuses: number | undefined;
  features: { index: string; name: string }[];
  spellcasting: Record<string, number> | undefined;
  classSpecific: Record<string, unknown> | undefined;
}

export interface FeatureRow {
  index: string;
  name: string;
  desc: string[];
  classIndex: string;
  subclassIndex: string | null;
  level: number;
}

export interface LevelUpContext {
  levelRows: LevelRow[];
  features: FeatureRow[];
  hitDieByClass: Record<string, number>;
  /** Multiclass entry prerequisites, e.g. `{ paladin: [{ ability: 'str', minimum: 13 }] }`. */
  multiclassPrerequisites: Record<string, { ability: AbilityId; minimum: number }[]>;
  subclassLevelByClass: Record<string, number>;
}

export interface LevelUpPlan {
  classIndex: string;
  className: string;
  /** 0 when taking the first level in a new class. */
  fromLevel: number;
  toLevel: number;
  totalLevelAfter: number;
  isNewClass: boolean;

  hitDie: number;
  conModifier: number;
  averageHp: number;
  /** The full die is granted automatically at the very first character level. */
  hpIsAutomatic: boolean;

  grantsAsi: boolean;
  subclassRequired: boolean;
  newFeatures: FeatureRow[];

  proficiencyBonusBefore: number;
  proficiencyBonusAfter: number;

  cantripsKnownBefore: number;
  cantripsKnownAfter: number;
  spellsKnownBefore: number;
  spellsKnownAfter: number;
  slotsBefore: Record<number, number>;
  slotsAfter: Record<number, number>;

  /** Prerequisites the character does not meet. Surfaced as a warning, never a hard block. */
  multiclassWarnings: string[];
  blockers: string[];
}

const emptyRow: Partial<LevelRow> = {};

function rowFor(ctx: LevelUpContext, classIndex: string, level: number): LevelRow | undefined {
  if (level < 1) return undefined;
  return ctx.levelRows.find((r) => r.classIndex === classIndex && r.level === level);
}

function slotsFromRow(row: LevelRow | undefined): Record<number, number> {
  const slots: Record<number, number> = {};
  const sc = row?.spellcasting;
  if (!sc) return slots;
  for (let level = 1; level <= 9; level++) {
    const value = sc[`spell_slots_level_${level}`];
    if (typeof value === 'number' && value > 0) slots[level] = value;
  }
  return slots;
}

/**
 * Whether a level grants an Ability Score Improvement.
 *
 * `ability_score_bonuses` counts ASIs gained SO FAR, so the test is whether the running total
 * increased. Reading the field directly would grant a Fighter an ASI on 17 of 20 levels.
 */
export function grantsAsiAt(ctx: LevelUpContext, classIndex: string, level: number): boolean {
  const current = rowFor(ctx, classIndex, level)?.abilityScoreBonuses ?? 0;
  const previous = rowFor(ctx, classIndex, level - 1)?.abilityScoreBonuses ?? 0;
  return current > previous;
}

/** Every level in a class that grants an ASI, for showing progression ahead of time. */
export function asiLevelsFor(ctx: LevelUpContext, classIndex: string): number[] {
  const levels: number[] = [];
  for (let level = 1; level <= MAX_LEVEL; level++) {
    if (grantsAsiAt(ctx, classIndex, level)) levels.push(level);
  }
  return levels;
}

/**
 * Inspect what a level would bring. Mutates nothing.
 *
 * Returning a plan rather than applying changes is what makes the flow reviewable: the UI can
 * show every consequence, and the player confirms before anything is written.
 */
export function levelUpPlan(
  character: Character,
  classRef: ContentRef,
  ctx: LevelUpContext,
): LevelUpPlan {
  const existing = character.classes.find((c) => c.classRef.index === classRef.index);
  const fromLevel = existing?.level ?? 0;
  const toLevel = clampLevel(fromLevel + 1);
  const isNewClass = !existing;

  const totalBefore = character.classes.reduce((sum, c) => sum + c.level, 0) || 0;
  const totalAfter = totalBefore + 1;

  const scores = totalAbilityScores(character.abilityScores, character.abilityAdjustments ?? []);
  const conModifier = abilityModifier(scores.con);
  const hitDie = ctx.hitDieByClass[classRef.index] ?? 8;

  const before = rowFor(ctx, classRef.index, fromLevel);
  const after = rowFor(ctx, classRef.index, toLevel);

  // Features gained at exactly this class level, excluding subclass features for subclasses the
  // character has not taken.
  const subclassIndex = existing?.subclassRef?.index ?? null;
  const newFeatures = ctx.features.filter(
    (f) =>
      f.classIndex === classRef.index &&
      f.level === toLevel &&
      (f.subclassIndex === null || f.subclassIndex === subclassIndex),
  );

  const subclassLevel = ctx.subclassLevelByClass[classRef.index] ?? 3;
  const subclassRequired = toLevel >= subclassLevel && !existing?.subclassRef;

  const multiclassWarnings: string[] = [];
  if (isNewClass && character.classes.length > 0) {
    for (const prerequisite of ctx.multiclassPrerequisites[classRef.index] ?? []) {
      if (scores[prerequisite.ability] < prerequisite.minimum) {
        multiclassWarnings.push(
          `Multiclassing into ${classRef.name} normally requires ${prerequisite.ability.toUpperCase()} ${prerequisite.minimum}; this character has ${scores[prerequisite.ability]}.`,
        );
      }
    }
  }

  const blockers: string[] = [];
  if (totalBefore >= MAX_LEVEL) blockers.push('This character is already level 20.');

  return {
    classIndex: classRef.index,
    className: classRef.name,
    fromLevel,
    toLevel,
    totalLevelAfter: totalAfter,
    isNewClass,

    hitDie,
    conModifier,
    averageHp: averageHitDieValue(hitDie),
    // Only the very first level of the very first class grants the full die automatically.
    hpIsAutomatic: totalBefore === 0,

    grantsAsi: grantsAsiAt(ctx, classRef.index, toLevel),
    subclassRequired,
    newFeatures,

    proficiencyBonusBefore: proficiencyBonus(Math.max(1, totalBefore)),
    proficiencyBonusAfter: proficiencyBonus(totalAfter),

    cantripsKnownBefore: (before ?? (emptyRow as LevelRow))?.spellcasting?.cantrips_known ?? 0,
    cantripsKnownAfter: after?.spellcasting?.cantrips_known ?? 0,
    spellsKnownBefore: before?.spellcasting?.spells_known ?? 0,
    spellsKnownAfter: after?.spellcasting?.spells_known ?? 0,
    slotsBefore: slotsFromRow(before),
    slotsAfter: slotsFromRow(after),

    multiclassWarnings,
    blockers,
  };
}

export type AsiChoice =
  | { kind: 'none' }
  | { kind: 'ability'; increases: { ability: AbilityId; amount: number }[] }
  | { kind: 'feat'; featRef: ContentRef };

export interface LevelUpChoices {
  hpMethod: 'roll' | 'average' | 'manual';
  /** The rolled or typed value. Ignored when the plan grants HP automatically. */
  hpValue: number;
  asi: AsiChoice;
  subclassRef: ContentRef | null;
  /** Spells added at this level, recorded so the step can be undone cleanly. */
  newSpells: ContentRef[];
}

export function defaultChoices(plan: LevelUpPlan): LevelUpChoices {
  return {
    hpMethod: 'average',
    hpValue: plan.hpIsAutomatic ? plan.hitDie : plan.averageHp,
    asi: { kind: 'none' },
    subclassRef: null,
    newSpells: [],
  };
}

/** Problems that must be resolved before the level can be committed. */
export function validateChoices(plan: LevelUpPlan, choices: LevelUpChoices): string[] {
  const issues: string[] = [];

  if (plan.subclassRequired && !choices.subclassRef) {
    issues.push('Choose a subclass to continue.');
  }

  if (!plan.hpIsAutomatic) {
    if (!Number.isFinite(choices.hpValue) || choices.hpValue < 1) {
      issues.push('Hit points gained must be at least 1.');
    }
    if (choices.hpMethod !== 'manual' && choices.hpValue > plan.hitDie) {
      issues.push(`A d${plan.hitDie} cannot roll higher than ${plan.hitDie}.`);
    }
  }

  if (plan.grantsAsi && choices.asi.kind === 'ability') {
    const total = choices.asi.increases.reduce((sum, i) => sum + i.amount, 0);
    if (total !== 2) issues.push('An Ability Score Improvement distributes exactly 2 points.');
    if (choices.asi.increases.some((i) => i.amount < 0)) {
      issues.push('Ability Score Improvements cannot be negative.');
    }
  }

  if (plan.grantsAsi && choices.asi.kind === 'none') {
    issues.push('Choose an Ability Score Improvement or a feat.');
  }

  return issues;
}

export interface LevelUpResult {
  character: Character;
  record: LevelUpRecord;
}

/**
 * Commit a level.
 *
 * Returns a new character plus a `LevelUpRecord` capturing exactly what changed, which is what
 * makes the step undoable. Nothing here reads the rules again -- every decision was made in the
 * plan, so committing is pure bookkeeping.
 */
export function applyLevelUp(
  character: Character,
  plan: LevelUpPlan,
  choices: LevelUpChoices,
  recordId: string,
): LevelUpResult {
  const hpGained = plan.hpIsAutomatic
    ? plan.hitDie + plan.conModifier
    : Math.max(1, Math.floor(choices.hpValue)) + plan.conModifier;

  const classes: ClassEntry[] = plan.isNewClass
    ? [
        ...character.classes,
        {
          classRef: { source: 'srd', index: plan.classIndex, name: plan.className },
          subclassRef: choices.subclassRef,
          level: 1,
          hitDiceSpent: 0,
          hitPointRolls: [plan.hpIsAutomatic ? plan.hitDie : Math.floor(choices.hpValue)],
        },
      ]
    : character.classes.map((entry) =>
        entry.classRef.index === plan.classIndex
          ? {
              ...entry,
              level: plan.toLevel,
              subclassRef: choices.subclassRef ?? entry.subclassRef,
              hitPointRolls: [...entry.hitPointRolls, Math.floor(choices.hpValue)],
            }
          : entry,
      );

  // ASI accumulates in its own layer, so it can be removed on undo without disturbing base
  // scores, racial bonuses or anything the player typed.
  const asi = { ...character.abilityScores.asi };
  if (choices.asi.kind === 'ability') {
    for (const increase of choices.asi.increases) {
      asi[increase.ability] = (asi[increase.ability] ?? 0) + increase.amount;
    }
  }

  const levelChoices: ChoiceRecord[] = [];
  if (choices.subclassRef) {
    levelChoices.push({
      id: `${recordId}-subclass`,
      source: 'subclass',
      sourceRef: choices.subclassRef,
      atLevel: plan.toLevel,
      choiceKey: `${plan.classIndex}:subclass`,
      selected: [choices.subclassRef],
    });
  }
  if (choices.asi.kind === 'feat') {
    levelChoices.push({
      id: `${recordId}-feat`,
      source: 'feat',
      sourceRef: choices.asi.featRef,
      atLevel: plan.toLevel,
      choiceKey: `${plan.classIndex}:feat:${plan.toLevel}`,
      selected: [choices.asi.featRef],
    });
  }
  if (choices.newSpells.length > 0) {
    levelChoices.push({
      id: `${recordId}-spells`,
      source: 'level-up',
      sourceRef: { source: 'srd', index: plan.classIndex, name: plan.className },
      atLevel: plan.toLevel,
      choiceKey: `${plan.classIndex}:spells:${plan.toLevel}`,
      selected: choices.newSpells,
    });
  }

  const spellcasting = choices.newSpells.length > 0 ? addSpells(character, plan, choices) : character.spellcasting;

  const next: Character = {
    ...character,
    classes,
    abilityScores: { ...character.abilityScores, asi },
    choices: [...character.choices, ...levelChoices],
    spellcasting,
    // Levelling raises the maximum, and the character gains those hit points immediately.
    resources: {
      ...character.resources,
      currentHp: character.resources.currentHp + Math.max(0, hpGained),
    },
  };

  const record: LevelUpRecord = {
    id: recordId,
    characterId: character.id,
    updatedAt: Date.now(),
    deletedAt: null,
    ownerId: character.ownerId,
    schemaVersion: character.schemaVersion,
    classIndex: plan.classIndex,
    level: plan.toLevel,
    hpGained,
    hpMethod: plan.hpIsAutomatic ? 'average' : choices.hpMethod,
    hpRoll: plan.hpIsAutomatic ? plan.hitDie : Math.floor(choices.hpValue),
    abilityIncreases: choices.asi.kind === 'ability' ? choices.asi.increases : [],
    createdClass: plan.isNewClass,
    choices: levelChoices,
  };

  return { character: next, record };
}

function addSpells(
  character: Character,
  plan: LevelUpPlan,
  choices: LevelUpChoices,
): Character['spellcasting'] {
  const entries = character.spellcasting?.entries ?? [];
  const target = entries.findIndex((e) => e.classRef.index === plan.classIndex);

  const additions = choices.newSpells.map((ref) => ({
    ref,
    prepared: true,
    alwaysPrepared: false,
    source: 'class' as const,
  }));

  if (target === -1) {
    return {
      entries: [
        ...entries,
        {
          classRef: { source: 'srd', index: plan.classIndex, name: plan.className },
          ability: 'int',
          preparation: 'known',
          known: additions,
          ritualCasting: false,
        },
      ],
    };
  }

  return {
    entries: entries.map((entry, i) =>
      i === target ? { ...entry, known: [...entry.known, ...additions] } : entry,
    ),
  };
}

/**
 * Undo a level.
 *
 * Reverses exactly what the record says was applied: the class level, the hit point roll, the
 * ASI layer, the recorded choices and the spells learned. This is the mechanism behind "do not
 * silently make irreversible choices" -- a mis-tapped level is one action to take back.
 */
export function revertLevelUp(character: Character, record: LevelUpRecord): Character {
  const entry = character.classes.find((c) => c.classRef.index === record.classIndex);

  const classes = entry
    ? record.createdClass
      ? // This level created the class, so undoing it removes the class entirely.
        character.classes.filter((c) => c.classRef.index !== record.classIndex)
      : character.classes.map((c) =>
          c.classRef.index === record.classIndex
            ? {
                ...c,
                level: Math.max(1, c.level - 1),
                hitPointRolls: c.hitPointRolls.slice(0, -1),
                // A subclass chosen at this level is retracted with it.
                subclassRef: record.choices.some((ch) => ch.source === 'subclass')
                  ? null
                  : c.subclassRef,
              }
            : c,
        )
    : character.classes;

  // Ability increases are read from the record rather than inferred, so undo cannot guess wrong.
  const asi = { ...character.abilityScores.asi };
  for (const increase of record.abilityIncreases) {
    asi[increase.ability] = Math.max(0, (asi[increase.ability] ?? 0) - increase.amount);
  }

  const removedSpellIndices = new Set(
    record.choices
      .filter((c) => c.choiceKey.includes(':spells:'))
      .flatMap((c) => c.selected.map((s) => s.index)),
  );

  const spellcasting = character.spellcasting
    ? {
        entries: character.spellcasting.entries.map((e) => ({
          ...e,
          known: e.known.filter((s) => !removedSpellIndices.has(s.ref.index)),
        })),
      }
    : null;

  const recordChoiceIds = new Set(record.choices.map((c) => c.id));

  return {
    ...character,
    classes,
    abilityScores: { ...character.abilityScores, asi },
    choices: character.choices.filter((c) => !recordChoiceIds.has(c.id)),
    spellcasting,
    resources: {
      ...character.resources,
      // Floors at 0, not 1: 0 is a real state here (downed, rolling death saves), and an undo
      // that quietly revived a dying character would not be the round trip it promises.
      currentHp: Math.max(0, character.resources.currentHp - Math.max(0, record.hpGained)),
    },
  };
}
