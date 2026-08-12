import { useEffect, useMemo, useState } from 'react';
import { useSheet } from '../sheet/CharacterShell';
import { useLevelUpContext } from './useLevelUpContext';
import { useCollections } from '../../rules/RulesProvider';
import { Panel, Button, Spinner, EmptyState, SourceBadge } from '../../ui/primitives';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { Field, Select } from '../creation/steps/parts';
import { ABILITY_IDS, ABILITY_NAMES } from '../../engine/core';
import { rollDie } from '../../engine/dice';
import { formatModifier } from '../../engine/contributions';
import {
  levelUpPlan,
  applyLevelUp,
  revertLevelUp,
  validateChoices,
  defaultChoices,
  type LevelUpChoices,
  type LevelUpPlan,
} from '../../engine/levelUp';
import { levelUps as levelUpRepo, characters as characterRepo } from '../../persistence/repositories';
import { newId, totalLevel } from '../../domain/factories';
import type { AbilityId } from '../../rules/schemas/primitives';
import type { ContentRef, LevelUpRecord } from '../../domain/types';

/**
 * The level-up flow.
 *
 * Every consequence is shown before anything is written, and the commit is recorded so it can be
 * undone. That is the brief's "do not silently make irreversible choices" expressed as a
 * mechanism: a mis-tapped level costs one click to take back, not a rebuilt character.
 */
export function LevelUpTab() {
  const { character, reload } = useSheet();
  const { context, loading } = useLevelUpContext();
  const rules = useCollections(['classes', 'subclasses', 'feats']);

  const [selectedClass, setSelectedClass] = useState<string>('');
  const [choices, setChoices] = useState<LevelUpChoices | null>(null);
  const [history, setHistory] = useState<LevelUpRecord[]>([]);
  const [pendingUndo, setPendingUndo] = useState<LevelUpRecord | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!character) return;
    void levelUpRepo.list(character.id).then((records) =>
      setHistory([...records].sort((a, b) => b.updatedAt - a.updatedAt)),
    );
  }, [character]);

  // Default to advancing the class the character already has most levels in.
  useEffect(() => {
    if (selectedClass || !character || character.classes.length === 0) return;
    const primary = [...character.classes].sort((a, b) => b.level - a.level)[0];
    if (primary) setSelectedClass(primary.classRef.index);
  }, [character, selectedClass]);

  const classRef: ContentRef | null = useMemo(() => {
    if (!selectedClass || !rules.data) return null;
    const doc = rules.data.classes.find((c) => c.index === selectedClass);
    return doc ? { source: 'srd', index: doc.index, name: doc.name } : null;
  }, [selectedClass, rules.data]);

  const plan: LevelUpPlan | null = useMemo(() => {
    if (!character || !context || !classRef) return null;
    return levelUpPlan(character, classRef, context);
  }, [character, context, classRef]);

  useEffect(() => {
    if (plan) setChoices(defaultChoices(plan));
  }, [plan?.classIndex, plan?.toLevel]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || rules.isLoading) return <Spinner label="Loading progression" />;
  if (!character || !context || !rules.data) return null;

  const issues = plan && choices ? validateChoices(plan, choices) : [];
  const subclasses = rules.data.subclasses.filter((s) => s.class.index === selectedClass);

  async function commit() {
    if (!character || !plan || !choices) return;
    const { character: next, record } = applyLevelUp(character, plan, choices, newId());
    await characterRepo.save(next);
    await levelUpRepo.save(record);
    await reload();
    setHistory((current) => [record, ...current]);
    setMessage(`${plan.className} is now level ${plan.toLevel}.`);
    // The choices are deliberately not cleared here. Reloading has already advanced the plan to
    // the next level, and the reset effect has already seeded fresh choices for it -- clearing
    // them now would land last and leave the panel blank until the class picker is touched.
  }

  async function undo(record: LevelUpRecord) {
    if (!character) return;
    const reverted = revertLevelUp(character, record);
    await characterRepo.save(reverted);
    await levelUpRepo.remove(record.id);
    await reload();
    setHistory((current) => current.filter((r) => r.id !== record.id));
    setMessage(`Undid ${record.classIndex} level ${record.level}.`);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="display-face font-semibold">Level up</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Currently level {totalLevel(character)}. Nothing is saved until you confirm, and every
          level can be undone.
        </p>
      </div>

      {message ? (
        <p role="status" className="rounded-lg border border-[var(--border-strong)] p-3 text-sm text-[var(--text-muted)]">
          {message}
        </p>
      ) : null}

      <Field label="Advance which class?" htmlFor="levelup-class" hint="Choose a new class to multiclass.">
        <Select
          id="levelup-class"
          value={selectedClass}
          onChange={(e) => setSelectedClass(e.target.value)}
        >
          <option value="">Choose a class</option>
          {rules.data.classes.map((c) => {
            const owned = character.classes.find((e) => e.classRef.index === c.index);
            return (
              <option key={c.index} value={c.index}>
                {c.name}
                {owned ? ` (${owned.level} → ${owned.level + 1})` : ' — new class'}
              </option>
            );
          })}
        </Select>
      </Field>

      {plan && choices ? (
        <>
          {plan.blockers.length > 0 ? (
            <p role="alert" className="rounded-lg border border-[var(--danger)] p-3 text-sm text-[var(--danger)]">
              {plan.blockers.join(' ')}
            </p>
          ) : null}

          {plan.multiclassWarnings.length > 0 ? (
            <Panel className="border-[var(--warning)] p-3">
              {/* A warning, never a block: the DM may have ruled otherwise. */}
              {plan.multiclassWarnings.map((w, i) => (
                <p key={i} className="text-sm">
                  {w}
                </p>
              ))}
            </Panel>
          ) : null}

          <Panel className="p-4">
            <h3 className="display-face mb-3 font-semibold">
              {plan.className} {plan.fromLevel} → {plan.toLevel}
              {plan.isNewClass ? ' (new class)' : ''}
            </h3>

            <HitPoints plan={plan} choices={choices} onChange={setChoices} />

            {plan.subclassRequired ? (
              <Field
                label={subclasses[0]?.subclass_flavor ?? 'Subclass'}
                htmlFor="levelup-subclass"
                hint="Required at this level."
              >
                <Select
                  id="levelup-subclass"
                  value={choices.subclassRef?.index ?? ''}
                  onChange={(e) => {
                    const doc = subclasses.find((s) => s.index === e.target.value);
                    setChoices({
                      ...choices,
                      subclassRef: doc
                        ? { source: 'srd', index: doc.index, name: doc.name }
                        : null,
                    });
                  }}
                >
                  <option value="">Choose one</option>
                  {subclasses.map((s) => (
                    <option key={s.index} value={s.index}>
                      {s.name}
                    </option>
                  ))}
                </Select>
                {subclasses.length <= 1 ? (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    The SRD includes only one subclass per class. Add others as homebrew content.
                  </p>
                ) : null}
              </Field>
            ) : null}

            {plan.grantsAsi ? (
              <AsiChooser
                choices={choices}
                onChange={setChoices}
                feats={rules.data.feats.map((f) => ({ index: f.index, name: f.name }))}
              />
            ) : null}

            <section className="mb-4">
              <h4 className="mb-2 text-sm font-medium">What you gain</h4>
              <ul className="space-y-1 text-sm text-[var(--text-muted)]">
                <li>
                  Hit points: +{effectiveHp(plan, choices)} (
                  {plan.hpIsAutomatic ? `d${plan.hitDie} maximum` : `d${plan.hitDie}`}
                  {plan.conModifier !== 0 ? ` ${formatModifier(plan.conModifier)} CON` : ''})
                </li>
                {plan.proficiencyBonusAfter !== plan.proficiencyBonusBefore ? (
                  <li>
                    Proficiency bonus: {formatModifier(plan.proficiencyBonusBefore)} →{' '}
                    <strong>{formatModifier(plan.proficiencyBonusAfter)}</strong>
                  </li>
                ) : null}
                {plan.newFeatures.map((f) => (
                  <li key={f.index}>Feature: {f.name}</li>
                ))}
                {slotDiff(plan).map((line) => (
                  <li key={line}>{line}</li>
                ))}
                {plan.cantripsKnownAfter > plan.cantripsKnownBefore ? (
                  <li>
                    Cantrips known: {plan.cantripsKnownBefore} → {plan.cantripsKnownAfter}
                  </li>
                ) : null}
                {plan.spellsKnownAfter > plan.spellsKnownBefore ? (
                  <li>
                    Spells known: {plan.spellsKnownBefore} → {plan.spellsKnownAfter} — choose the
                    new one in the Spells tab
                  </li>
                ) : null}
              </ul>
            </section>

            {plan.newFeatures.length > 0 ? (
              <details className="mb-4">
                <summary className="cursor-pointer text-sm font-medium">Feature details</summary>
                <ul className="mt-2 space-y-2">
                  {plan.newFeatures.map((f) => (
                    <li key={f.index} className="rounded-lg border border-[var(--border)] p-2">
                      <p className="text-sm font-medium">{f.name}</p>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">{f.desc.join(' ')}</p>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            {issues.length > 0 ? (
              <ul role="status" className="mb-3 space-y-1">
                {issues.map((issue) => (
                  <li key={issue} className="text-sm text-[var(--text-muted)]">
                    {issue}
                  </li>
                ))}
              </ul>
            ) : null}

            <Button
              variant="primary"
              onClick={commit}
              disabled={issues.length > 0 || plan.blockers.length > 0}
            >
              Confirm level {plan.toLevel}
            </Button>
          </Panel>
        </>
      ) : null}

      <section>
        <h3 className="display-face mb-2 font-semibold">Level history</h3>
        {history.length === 0 ? (
          <EmptyState
            title="No levels recorded yet"
            description="Levels taken here are listed so they can be reviewed or undone."
          />
        ) : (
          <ul className="space-y-2">
            {history.map((record) => (
              <li key={record.id}>
                <Panel className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <div>
                    <p className="text-sm font-medium capitalize">
                      {record.classIndex} level {record.level}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      +{record.hpGained} HP ({record.hpMethod})
                      {record.abilityIncreases.length > 0
                        ? ` · ${record.abilityIncreases
                            .map((i) => `${i.ability.toUpperCase()} +${i.amount}`)
                            .join(', ')}`
                        : ''}
                      {record.createdClass ? ' · new class' : ''}
                    </p>
                  </div>
                  <Button variant="ghost" onClick={() => setPendingUndo(record)}>
                    Undo
                  </Button>
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={pendingUndo !== null}
        title="Undo this level?"
        description={
          pendingUndo
            ? `This reverses ${pendingUndo.classIndex} level ${pendingUndo.level}: the hit points, any ability increase, and anything chosen at that level.`
            : ''
        }
        confirmLabel="Undo level"
        destructive
        onConfirm={async () => {
          if (pendingUndo) await undo(pendingUndo);
          setPendingUndo(null);
        }}
        onCancel={() => setPendingUndo(null)}
      />
    </div>
  );
}

function effectiveHp(plan: LevelUpPlan, choices: LevelUpChoices): number {
  const base = plan.hpIsAutomatic ? plan.hitDie : Math.max(1, Math.floor(choices.hpValue));
  return base + plan.conModifier;
}

function slotDiff(plan: LevelUpPlan): string[] {
  const lines: string[] = [];
  for (let level = 1; level <= 9; level++) {
    const before = plan.slotsBefore[level] ?? 0;
    const after = plan.slotsAfter[level] ?? 0;
    if (after > before) {
      lines.push(
        before === 0
          ? `New level ${level} spell slots: ${after}`
          : `Level ${level} spell slots: ${before} → ${after}`,
      );
    }
  }
  return lines;
}

function HitPoints({
  plan,
  choices,
  onChange,
}: {
  plan: LevelUpPlan;
  choices: LevelUpChoices;
  onChange: (choices: LevelUpChoices) => void;
}) {
  if (plan.hpIsAutomatic) {
    return (
      <p className="mb-4 text-sm text-[var(--text-muted)]">
        The first level always grants the full hit die: {plan.hitDie}
        {plan.conModifier !== 0 ? ` ${formatModifier(plan.conModifier)} CON` : ''}.
      </p>
    );
  }

  return (
    <Field label="Hit points gained" htmlFor="levelup-hp">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          id="levelup-hp-method"
          aria-label="Hit point method"
          value={choices.hpMethod}
          className="w-auto"
          onChange={(e) => {
            const hpMethod = e.target.value as LevelUpChoices['hpMethod'];
            onChange({
              ...choices,
              hpMethod,
              hpValue: hpMethod === 'average' ? plan.averageHp : choices.hpValue,
            });
          }}
        >
          <option value="average">Take the average ({plan.averageHp})</option>
          <option value="roll">Roll d{plan.hitDie}</option>
          <option value="manual">Enter manually</option>
        </Select>

        {choices.hpMethod === 'roll' ? (
          <Button
            variant="secondary"
            onClick={() => onChange({ ...choices, hpValue: rollDie(plan.hitDie) })}
          >
            Roll
          </Button>
        ) : null}

        <input
          id="levelup-hp"
          type="number"
          min={1}
          value={choices.hpValue}
          readOnly={choices.hpMethod === 'average'}
          onChange={(e) => onChange({ ...choices, hpValue: Number(e.target.value) || 0 })}
          className="min-h-11 w-24 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-base)] px-3 text-sm"
        />

        <span className="text-sm text-[var(--text-muted)]">
          {formatModifier(plan.conModifier)} CON = <strong>{effectiveHp(plan, choices)}</strong>
        </span>
      </div>
    </Field>
  );
}

function AsiChooser({
  choices,
  onChange,
  feats,
}: {
  choices: LevelUpChoices;
  onChange: (choices: LevelUpChoices) => void;
  feats: { index: string; name: string }[];
}) {
  const increases = choices.asi.kind === 'ability' ? choices.asi.increases : [];
  const spent = increases.reduce((sum, i) => sum + i.amount, 0);

  function setAmount(ability: AbilityId, amount: number) {
    const others = increases.filter((i) => i.ability !== ability);
    onChange({
      ...choices,
      asi: {
        kind: 'ability',
        increases: amount > 0 ? [...others, { ability, amount }] : others,
      },
    });
  }

  return (
    <fieldset className="mb-4 rounded-lg border border-[var(--border)] p-3">
      <legend className="px-1 text-sm font-medium">Ability Score Improvement</legend>

      <div className="mb-3 flex flex-wrap gap-2">
        <Button
          variant={choices.asi.kind === 'ability' ? 'primary' : 'secondary'}
          onClick={() => onChange({ ...choices, asi: { kind: 'ability', increases: [] } })}
        >
          Raise ability scores
        </Button>
        <Button
          variant={choices.asi.kind === 'feat' ? 'primary' : 'secondary'}
          onClick={() =>
            onChange({
              ...choices,
              asi: {
                kind: 'feat',
                featRef: feats[0]
                  ? { source: 'srd', index: feats[0].index, name: feats[0].name }
                  : { source: 'custom', index: 'custom:feat', name: 'Feat' },
              },
            })
          }
        >
          Take a feat instead
        </Button>
      </div>

      {choices.asi.kind === 'ability' ? (
        <div>
          <p className="mb-2 text-sm text-[var(--text-muted)]">
            Distribute 2 points. {2 - spent} remaining.
          </p>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ABILITY_IDS.map((id) => {
              const amount = increases.find((i) => i.ability === id)?.amount ?? 0;
              return (
                <li key={id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] p-2">
                  <span className="text-sm">{ABILITY_NAMES[id]}</span>
                  <Select
                    aria-label={`${ABILITY_NAMES[id]} increase`}
                    value={amount}
                    className="w-auto"
                    onChange={(e) => setAmount(id, Number(e.target.value))}
                  >
                    <option value={0}>+0</option>
                    <option value={1}>+1</option>
                    <option value={2}>+2</option>
                  </Select>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {choices.asi.kind === 'feat' ? (
        <Field label="Feat" htmlFor="levelup-feat">
          <Select
            id="levelup-feat"
            value={choices.asi.kind === 'feat' ? choices.asi.featRef.index : ''}
            onChange={(e) => {
              const feat = feats.find((f) => f.index === e.target.value);
              if (feat) {
                onChange({
                  ...choices,
                  asi: {
                    kind: 'feat',
                    featRef: {
                      source: feat.index.startsWith('custom:') ? 'custom' : 'srd',
                      index: feat.index,
                      name: feat.name,
                    },
                  },
                });
              }
            }}
          >
            {feats.map((f) => (
              <option key={f.index} value={f.index}>
                {f.name}
              </option>
            ))}
          </Select>
          <p className="mt-1 flex items-center gap-2 text-xs text-[var(--text-muted)]">
            The SRD includes only Grappler. Add the feat you are taking as homebrew content.
            <SourceBadge source="custom" />
          </p>
        </Field>
      ) : null}
    </fieldset>
  );
}
