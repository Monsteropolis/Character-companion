import { useState } from 'react';
import { useSheet } from './CharacterShell';
import { AdjustmentEditor } from './AdjustmentDialog';
import { StatOverrideEditor } from './StatOverrideEditor';
import { Panel, Button } from '../../ui/primitives';
import { ABILITY_IDS, ABILITY_NAMES } from '../../engine/core';
import { formatModifier } from '../../engine/contributions';
import { explainAbilityScore } from '../../engine/abilityScores';
import type { AbilityId } from '../../rules/schemas/primitives';

/**
 * Overview: identity, ability scores, saving throws and skills.
 *
 * Every number is expandable to its breakdown. That single affordance answers the question
 * players actually ask at a table -- "why is that number what it is?" -- and it is only
 * possible because the engine returns contributions rather than bare totals.
 */
export function OverviewTab() {
  const { character, stats, update } = useSheet();
  const [panel, setPanel] = useState<'none' | 'adjustments' | 'overrides'>('none');

  if (!character || !stats) return null;

  return (
    <div className="space-y-4">
      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="display-face font-semibold">Ability scores</h2>
          <div className="flex gap-1">
            <Button
              variant={panel === 'adjustments' ? 'primary' : 'ghost'}
              onClick={() => setPanel(panel === 'adjustments' ? 'none' : 'adjustments')}
            >
              Adjust scores
              {stats.activeTemporaryAdjustments > 0
                ? ` (${stats.activeTemporaryAdjustments} active)`
                : ''}
            </Button>
            <Button
              variant={panel === 'overrides' ? 'primary' : 'ghost'}
              onClick={() => setPanel(panel === 'overrides' ? 'none' : 'overrides')}
            >
              Override stats
              {stats.overriddenStats.length > 0 ? ` (${stats.overriddenStats.length})` : ''}
            </Button>
          </div>
        </div>

        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {ABILITY_IDS.map((id) => (
            <AbilityCard key={id} id={id} />
          ))}
        </ul>

        {panel === 'adjustments' ? (
          <Panel className="mt-3 p-4">
            <h3 className="display-face mb-1 font-semibold">Ability score changes</h3>
            <p className="mb-3 text-sm text-[var(--text-muted)]">
              Temporary changes are separated from permanent ones so an expiring spell can be
              cleared without disturbing a magic item.
            </p>
            <AdjustmentEditor
              adjustments={character.abilityAdjustments}
              onChange={(abilityAdjustments) => void update({ abilityAdjustments })}
            />
          </Panel>
        ) : null}

        {panel === 'overrides' ? (
          <Panel className="mt-3 p-4">
            <StatOverrideEditor />
          </Panel>
        ) : null}
      </section>

      <section>
        <h2 className="display-face mb-2 font-semibold">Saving throws</h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ABILITY_IDS.map((id) => {
            const save = stats.savingThrows[id];
            return (
              <li key={id}>
                <details className="rounded-lg border border-[var(--border)] p-2">
                  <summary className="flex cursor-pointer items-center justify-between text-sm">
                    <span>
                      {/* Proficiency is shown by a filled marker as well as by weight. */}
                      <span aria-hidden="true">{save.proficient ? '● ' : '○ '}</span>
                      <span className="sr-only">{save.proficient ? 'Proficient. ' : ''}</span>
                      {ABILITY_NAMES[id]}
                    </span>
                    <span className="display-face">
                      {formatModifier(save.total)}
                      {save.advantage === 'disadvantage' ? ' ▾' : ''}
                    </span>
                  </summary>
                  <Breakdown value={save} />
                </details>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="display-face mb-2 font-semibold">Skills</h2>
        <ul className="grid gap-1 sm:grid-cols-2">
          {stats.skills.map((skill) => (
            <li key={skill.index}>
              <details className="rounded-lg border border-[var(--border)] p-2">
                <summary className="flex cursor-pointer items-center justify-between text-sm">
                  <span>
                    <span aria-hidden="true">
                      {skill.expertise ? '◆ ' : skill.proficient ? '● ' : '○ '}
                    </span>
                    <span className="sr-only">
                      {skill.expertise ? 'Expertise. ' : skill.proficient ? 'Proficient. ' : ''}
                    </span>
                    {skill.name}
                    <span className="ml-1 text-xs text-[var(--text-muted)]">
                      {skill.ability.toUpperCase()}
                    </span>
                  </span>
                  <span className="display-face">{formatModifier(skill.total)}</span>
                </summary>
                <Breakdown value={skill} />
              </details>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="display-face mb-2 font-semibold">Passive senses</h2>
        <ul className="grid grid-cols-3 gap-2">
          <Passive label="Perception" value={stats.passivePerception} />
          <Passive label="Investigation" value={stats.passiveInvestigation} />
          <Passive label="Insight" value={stats.passiveInsight} />
        </ul>
      </section>

      {stats.unmodelledEffects.length > 0 ? (
        <section>
          <h2 className="display-face mb-2 font-semibold">Track these yourself</h2>
          <p className="mb-2 text-sm text-[var(--text-muted)]">
            These features have no automatic effect on the numbers above.
          </p>
          <ul className="space-y-1">
            {stats.unmodelledEffects.map((effect, i) => (
              <li key={i} className="rounded-lg border border-[var(--border)] p-2 text-sm">
                {effect}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function AbilityCard({ id }: { id: AbilityId }) {
  const { character, stats } = useSheet();
  if (!character || !stats) return null;

  const parts = explainAbilityScore(character.abilityScores, id, character.abilityAdjustments);
  const adjusted = character.abilityAdjustments.some((a) => a.ability === id);

  return (
    <li>
      <details className="rounded-lg border border-[var(--border)] p-2 text-center">
        <summary className="cursor-pointer list-none">
          <span className="block text-xs text-[var(--text-muted)]">
            {ABILITY_NAMES[id].slice(0, 3).toUpperCase()}
            {/* A pencil marks a score that is not purely its base value. */}
            {adjusted ? <span title="Adjusted"> ✎</span> : null}
          </span>
          <span className="display-face block text-2xl">{stats.abilityScores[id]}</span>
          <span className="block text-sm">{formatModifier(stats.abilityModifiers[id])}</span>
        </summary>
        <ul className="mt-2 space-y-1 border-t border-[var(--border)] pt-2 text-left text-xs text-[var(--text-muted)]">
          {parts.map((part, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span>{part.label}</span>
              <span>{part.kind === 'base' || part.kind === 'override' ? part.value : formatModifier(part.value)}</span>
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

function Breakdown({ value }: { value: { contributions: { source: string; value: number }[]; notes: string[] } }) {
  return (
    <ul className="mt-2 space-y-1 border-t border-[var(--border)] pt-2 text-xs text-[var(--text-muted)]">
      {value.contributions.map((c, i) => (
        <li key={i} className="flex justify-between gap-2">
          <span>{c.source}</span>
          <span>{formatModifier(c.value)}</span>
        </li>
      ))}
      {value.notes.map((note, i) => (
        <li key={`n-${i}`} className="italic">
          {note}
        </li>
      ))}
    </ul>
  );
}

function Passive({ label, value }: { label: string; value: number }) {
  return (
    <li className="rounded-lg border border-[var(--border)] p-2 text-center">
      <span className="block text-xs text-[var(--text-muted)]">{label}</span>
      <span className="display-face block text-xl">{value}</span>
    </li>
  );
}
