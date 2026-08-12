import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDraft } from '../draft';
import { useDraftPreview } from '../useDraftPreview';
import { StepHeading } from './parts';
import { Button, Panel, Spinner, ErrorNotice, EmptyState } from '../../../ui/primitives';
import { ABILITY_IDS, ABILITY_NAMES } from '../../../engine/core';
import { formatModifier } from '../../../engine/contributions';
import { characters as characterRepo, inventory as inventoryRepo } from '../../../persistence/repositories';
import { useCharacterStore } from '../../characters/store';
import type { DerivedValue } from '../../../engine/contributions';

/**
 * Final review.
 *
 * Shows every calculated statistic before anything is written, and each one can be expanded to
 * see how it was reached. This is the last point at which a mistake is cheap to fix, so the
 * screen favours completeness over brevity.
 */
export function ReviewStep() {
  const navigate = useNavigate();
  const draft = useDraft();
  const preview = useDraftPreview();
  const load = useCharacterStore((s) => s.load);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (preview.loading) return <Spinner label="Calculating" />;
  if (preview.error) return <ErrorNotice message={preview.error} />;

  if (!preview.ready || !preview.stats || !preview.result) {
    return (
      <EmptyState
        title="Not quite ready"
        description="Choose at least a race and a class, then come back to review."
        action={
          <Button variant="secondary" onClick={() => draft.goto('race')}>
            Go to Race
          </Button>
        }
      />
    );
  }

  const { stats } = preview;

  async function handleCreate() {
    if (!preview.result) return;
    setSaving(true);
    setSaveError(null);
    try {
      await characterRepo.save(preview.result.character);
      for (const item of preview.result.items) {
        await inventoryRepo.save(item);
      }
      await load();
      draft.reset();
      navigate(`/c/${preview.result.character.id}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the character.');
      setSaving(false);
    }
  }

  return (
    <div className="pb-8">
      <StepHeading
        title="Review"
        description="Check the numbers before saving. Tap any value to see how it was calculated."
      />

      <Panel className="mb-4 p-4">
        <h3 className="display-face text-lg font-semibold">
          {draft.identity.name || 'Unnamed character'}
        </h3>
        <p className="text-sm text-[var(--text-muted)]">
          {[
            draft.subraceRef?.name ?? draft.raceRef?.name,
            draft.classRef ? `${draft.classRef.name} ${draft.level}` : null,
            draft.subclassRef?.name,
            draft.backgroundRef?.name,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </Panel>

      <section className="mb-4">
        <h3 className="display-face mb-2 font-semibold">Ability scores</h3>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {ABILITY_IDS.map((id) => {
            const racial = preview.racialBonuses[id];
            return (
              <li
                key={id}
                className="rounded-lg border border-[var(--border)] p-2 text-center"
              >
                <span className="block text-xs text-[var(--text-muted)]">
                  {ABILITY_NAMES[id].slice(0, 3).toUpperCase()}
                </span>
                <span className="display-face block text-xl">{stats.abilityScores[id]}</span>
                <span className="block text-sm">{formatModifier(stats.abilityModifiers[id])}</span>
                {racial ? (
                  <span className="block text-xs text-[var(--text-muted)]">
                    incl. {formatModifier(racial)} racial
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mb-4 grid gap-2 sm:grid-cols-2">
        <StatCard label="Armour class" value={stats.armorClass} />
        <StatCard label="Hit points" value={stats.maxHp} />
        <StatCard label="Initiative" value={stats.initiative} signed />
        <StatCard label="Speed" value={stats.speed} suffix=" ft" />
        <SimpleCard label="Proficiency bonus" value={formatModifier(stats.proficiencyBonus)} />
        <SimpleCard label="Passive Perception" value={String(stats.passivePerception)} />
        <SimpleCard
          label="Hit dice"
          value={stats.hitDice.map((h) => `${h.total}d${h.die}`).join(', ') || '—'}
        />
        <SimpleCard
          label="Carrying capacity"
          value={`${stats.carryingCapacity} lb`}
        />
        {preview.spellcastingAbility && Object.keys(stats.spellSaveDc).length > 0 ? (
          <>
            <SimpleCard
              label="Spell save DC"
              value={String(Object.values(stats.spellSaveDc)[0])}
            />
            <SimpleCard
              label="Spell attack"
              value={formatModifier(Object.values(stats.spellAttackBonus)[0] ?? 0)}
            />
          </>
        ) : null}
      </section>

      <section className="mb-4">
        <h3 className="display-face mb-2 font-semibold">Saving throws</h3>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ABILITY_IDS.map((id) => (
            <li
              key={id}
              className="flex items-center justify-between rounded-lg border border-[var(--border)] p-2 text-sm"
            >
              <span>
                {stats.savingThrows[id].proficient ? '● ' : '○ '}
                {ABILITY_NAMES[id]}
              </span>
              <span className="display-face">{formatModifier(stats.savingThrows[id].total)}</span>
            </li>
          ))}
        </ul>
      </section>

      <details className="mb-4">
        <summary className="cursor-pointer py-2 text-sm font-medium">
          Skills ({stats.skills.filter((s) => s.proficient).length} proficient)
        </summary>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {stats.skills.map((skill) => (
            <li
              key={skill.index}
              className="flex items-center justify-between rounded-md px-2 py-1 text-sm"
            >
              <span>
                {skill.proficient ? '● ' : '○ '}
                {skill.name}
                <span className="ml-1 text-xs text-[var(--text-muted)]">
                  {skill.ability.toUpperCase()}
                </span>
              </span>
              <span className="display-face">{formatModifier(skill.total)}</span>
            </li>
          ))}
        </ul>
      </details>

      <details className="mb-4">
        <summary className="cursor-pointer py-2 text-sm font-medium">
          Equipment ({preview.itemNames.length})
        </summary>
        <ul className="mt-2 space-y-1 text-sm text-[var(--text-muted)]">
          {preview.itemNames.map((name, i) => (
            <li key={`${name}-${i}`}>{name}</li>
          ))}
        </ul>
      </details>

      {stats.unmodelledEffects.length > 0 ? (
        <details className="mb-4">
          <summary className="cursor-pointer py-2 text-sm font-medium">
            Features to track yourself ({stats.unmodelledEffects.length})
          </summary>
          {/* Stated plainly rather than hidden: these are real effects the app will not compute. */}
          <p className="mt-1 mb-2 text-xs text-[var(--text-muted)]">
            These have no automatic effect on your numbers, so apply them at the table.
          </p>
          <ul className="space-y-1 text-sm text-[var(--text-muted)]">
            {stats.unmodelledEffects.map((effect, i) => (
              <li key={i}>{effect}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {saveError ? (
        <p role="alert" className="mb-3 text-sm text-[var(--danger)]">
          {saveError}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button variant="ghost" onClick={draft.back} disabled={saving}>
          Back
        </Button>
        <Button variant="primary" onClick={handleCreate} disabled={saving} className="flex-1">
          {saving ? 'Saving...' : 'Create character'}
        </Button>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  signed = false,
  suffix = '',
}: {
  label: string;
  value: DerivedValue;
  signed?: boolean;
  suffix?: string;
}) {
  return (
    <details className="rounded-lg border border-[var(--border)] p-3">
      <summary className="flex cursor-pointer items-center justify-between">
        <span className="text-sm text-[var(--text-muted)]">{label}</span>
        <span className="display-face text-xl">
          {signed ? formatModifier(value.total) : value.total}
          {suffix}
        </span>
      </summary>
      <ul className="mt-2 space-y-1 border-t border-[var(--border)] pt-2 text-xs text-[var(--text-muted)]">
        {value.contributions.map((c, i) => (
          <li key={i} className="flex justify-between gap-2">
            <span>{c.source}</span>
            <span>{c.kind === 'override' ? `= ${c.value}` : formatModifier(c.value)}</span>
          </li>
        ))}
        {value.notes.map((note, i) => (
          <li key={`note-${i}`} className="italic">
            {note}
          </li>
        ))}
      </ul>
    </details>
  );
}

function SimpleCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[var(--border)] p-3">
      <span className="text-sm text-[var(--text-muted)]">{label}</span>
      <span className="display-face text-xl">{value}</span>
    </div>
  );
}
