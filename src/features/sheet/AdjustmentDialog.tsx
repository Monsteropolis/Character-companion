import { useState } from 'react';
import { Button, Panel } from '../../ui/primitives';
import { Field, TextInput, Select } from '../creation/steps/parts';
import { ABILITY_IDS, ABILITY_NAMES } from '../../engine/core';
import { newId } from '../../domain/factories';
import type { AbilityId } from '../../rules/schemas/primitives';
import type { AbilityAdjustment } from '../../domain/types';

/**
 * Editor for ability score changes.
 *
 * Scores move constantly at the table -- a belt sets one permanently, a spell raises one for an
 * hour, a shadow drains one until it is restored. Recording each as a labelled, removable entry
 * means "the spell ended" is one tap, rather than the player having to remember what the number
 * used to be and edit it back by hand.
 */
export function AdjustmentEditor({
  adjustments,
  onChange,
}: {
  adjustments: AbilityAdjustment[];
  onChange: (next: AbilityAdjustment[]) => void;
}) {
  const [draft, setDraft] = useState<AbilityAdjustment | null>(null);

  const temporary = adjustments.filter((a) => a.duration === 'temporary');
  const permanent = adjustments.filter((a) => a.duration === 'permanent');

  function startNew(duration: AbilityAdjustment['duration']) {
    setDraft({
      id: newId(),
      ability: 'str',
      kind: 'bonus',
      value: duration === 'temporary' ? 2 : 1,
      duration,
      label: '',
      note: '',
      createdAt: Date.now(),
    });
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => startNew('temporary')}>
          Add temporary change
        </Button>
        <Button variant="secondary" onClick={() => startNew('permanent')}>
          Add permanent change
        </Button>
        {temporary.length > 0 ? (
          <Button
            variant="ghost"
            onClick={() => onChange(adjustments.filter((a) => a.duration !== 'temporary'))}
          >
            Clear all temporary
          </Button>
        ) : null}
      </div>

      {draft ? (
        <Panel className="mb-4 p-4">
          <p className="mb-3 text-sm font-medium">
            New {draft.duration} change
          </p>

          <Field label="What is causing it?" htmlFor="adj-label">
            <TextInput
              id="adj-label"
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              placeholder={
                draft.duration === 'temporary'
                  ? "e.g. Bear's Endurance"
                  : 'e.g. Belt of Hill Giant Strength'
              }
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Ability" htmlFor="adj-ability">
              <Select
                id="adj-ability"
                value={draft.ability}
                onChange={(e) => setDraft({ ...draft, ability: e.target.value as AbilityId })}
              >
                {ABILITY_IDS.map((id) => (
                  <option key={id} value={id}>
                    {ABILITY_NAMES[id]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Effect" htmlFor="adj-kind">
              <Select
                id="adj-kind"
                value={draft.kind}
                onChange={(e) =>
                  setDraft({ ...draft, kind: e.target.value as AbilityAdjustment['kind'] })
                }
              >
                <option value="bonus">Add to the score</option>
                <option value="set">Set the score to</option>
              </Select>
            </Field>

            <Field label={draft.kind === 'set' ? 'New score' : 'Amount'} htmlFor="adj-value">
              <input
                id="adj-value"
                type="number"
                value={draft.value}
                onChange={(e) => setDraft({ ...draft, value: Number(e.target.value) || 0 })}
                className="min-h-11 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-base)] px-3 text-sm"
              />
            </Field>
          </div>

          {draft.kind === 'set' ? (
            <p className="mb-3 text-xs text-[var(--text-muted)]">
              A set score has no effect if the ability is already higher, and set effects never
              stack with each other.
            </p>
          ) : (
            <p className="mb-3 text-xs text-[var(--text-muted)]">
              Use a negative amount for drains and curses.
            </p>
          )}

          <Field label="Note" htmlFor="adj-note" hint="Optional — duration, who cast it, anything.">
            <TextInput
              id="adj-note"
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              placeholder="e.g. 1 hour, concentration"
            />
          </Field>

          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!draft.label.trim()}
              onClick={() => {
                onChange([...adjustments, draft]);
                setDraft(null);
              }}
            >
              Apply
            </Button>
          </div>
        </Panel>
      ) : null}

      {temporary.length > 0 ? (
        <AdjustmentList
          title="Temporary"
          hint="In effect now. Clear these when the effect ends."
          adjustments={temporary}
          onRemove={(id) => onChange(adjustments.filter((a) => a.id !== id))}
        />
      ) : null}

      {permanent.length > 0 ? (
        <AdjustmentList
          title="Permanent"
          hint="Lasting changes such as magic items or a tome."
          adjustments={permanent}
          onRemove={(id) => onChange(adjustments.filter((a) => a.id !== id))}
        />
      ) : null}

      {adjustments.length === 0 && !draft ? (
        <p className="text-sm text-[var(--text-muted)]">
          No changes applied. Ability scores are showing their base values.
        </p>
      ) : null}
    </div>
  );
}

function AdjustmentList({
  title,
  hint,
  adjustments,
  onRemove,
}: {
  title: string;
  hint: string;
  adjustments: AbilityAdjustment[];
  onRemove: (id: string) => void;
}) {
  return (
    <section className="mb-4">
      <h4 className="text-sm font-medium">{title}</h4>
      <p className="mb-2 text-xs text-[var(--text-muted)]">{hint}</p>
      <ul className="space-y-2">
        {adjustments.map((a) => (
          <li
            key={a.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] p-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{a.label}</p>
              <p className="text-xs text-[var(--text-muted)]">
                {ABILITY_NAMES[a.ability]}{' '}
                {a.kind === 'set'
                  ? `set to ${a.value}`
                  : `${a.value >= 0 ? '+' : ''}${a.value}`}
                {a.note ? ` · ${a.note}` : ''}
              </p>
            </div>
            <button
              type="button"
              aria-label={`Remove ${a.label}`}
              onClick={() => onRemove(a.id)}
              className="min-h-11 shrink-0 rounded-md px-2 text-xs text-[var(--text-muted)] hover:text-[var(--danger)]"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
