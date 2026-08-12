import { useDraft } from '../draft';
import { StepHeading, Field, Select } from './parts';
import { Button, Panel } from '../../../ui/primitives';
import { ABILITY_IDS, ABILITY_NAMES, abilityModifier } from '../../../engine/core';
import { formatModifier } from '../../../engine/contributions';
import {
  STANDARD_ARRAY,
  POINT_BUY_BUDGET,
  POINT_BUY_MAX,
  POINT_BUY_MIN,
  pointBuyRemaining,
  pointBuyCost,
  validateAbilityScores,
  rollAbilityScoreSet,
} from '../../../engine/abilityScores';
import type { AbilityScoreMethod } from '../../../domain/types';
import type { AbilityId } from '../../../rules/schemas/primitives';

const METHODS: { value: AbilityScoreMethod; label: string; hint: string }[] = [
  { value: 'standard-array', label: 'Standard array', hint: 'Assign 15, 14, 13, 12, 10, 8.' },
  { value: 'point-buy', label: 'Point buy', hint: '27 points, scores from 8 to 15.' },
  { value: 'rolled', label: 'Roll', hint: '4d6, drop the lowest, six times.' },
  { value: 'manual', label: 'Manual', hint: 'Type whatever your DM allowed.' },
];

export function AbilitiesStep() {
  const {
    abilityMethod,
    baseScores,
    setAbilityMethod,
    setScore,
    setScores,
    rolledPool,
    setRolledPool,
  } = useDraft();

  const issues = validateAbilityScores(abilityMethod, baseScores);
  const remaining = pointBuyRemaining(baseScores);

  return (
    <div>
      <StepHeading
        title="Ability scores"
        description="Racial bonuses are applied on top of these, and shown in the review step."
      />

      <Field label="Method" htmlFor="ability-method">
        <Select
          id="ability-method"
          value={abilityMethod}
          onChange={(e) => setAbilityMethod(e.target.value as AbilityScoreMethod)}
        >
          {METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {METHODS.find((m) => m.value === abilityMethod)?.hint}
        </p>
      </Field>

      {abilityMethod === 'point-buy' ? (
        <Panel className="mb-4 flex items-center justify-between p-3">
          <span className="text-sm font-medium">Points remaining</span>
          <span
            className={`display-face text-lg ${remaining < 0 ? 'text-[var(--danger)]' : ''}`}
          >
            {remaining} / {POINT_BUY_BUDGET}
          </span>
        </Panel>
      ) : null}

      {abilityMethod === 'rolled' ? (
        <Panel className="mb-4 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Rolled pool</span>
            <Button variant="secondary" onClick={() => setRolledPool(rollAbilityScoreSet())}>
              {rolledPool.length ? 'Roll again' : 'Roll 4d6 x6'}
            </Button>
          </div>
          {rolledPool.length > 0 ? (
            <>
              <ul className="flex flex-wrap gap-2">
                {rolledPool.map((v, i) => (
                  <li
                    key={i}
                    className="display-face rounded-lg border border-[var(--border-strong)] px-3 py-1 text-lg"
                  >
                    {v}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                Assign these below. Rolling again replaces the pool but not your assignments.
              </p>
            </>
          ) : null}
        </Panel>
      ) : null}

      {abilityMethod === 'standard-array' ? (
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          Each of {STANDARD_ARRAY.join(', ')} must be used exactly once.
        </p>
      ) : null}

      <ul className="space-y-2">
        {ABILITY_IDS.map((id) => (
          <AbilityRow
            key={id}
            id={id}
            value={baseScores[id]}
            method={abilityMethod}
            issue={issues.find((i) => i.ability === id)?.message}
            onChange={(v) => setScore(id, v)}
          />
        ))}
      </ul>

      {issues.some((i) => i.ability === null) ? (
        <p role="alert" className="mt-3 text-sm text-[var(--danger)]">
          {issues.find((i) => i.ability === null)?.message}
        </p>
      ) : null}

      <div className="mt-4 flex gap-2">
        <Button
          variant="ghost"
          onClick={() => setScores({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 })}
        >
          Reset to 10s
        </Button>
      </div>
    </div>
  );
}

function AbilityRow({
  id,
  value,
  method,
  issue,
  onChange,
}: {
  id: AbilityId;
  value: number;
  method: AbilityScoreMethod;
  issue?: string;
  onChange: (value: number) => void;
}) {
  const modifier = abilityModifier(value);
  const cost = method === 'point-buy' ? pointBuyCost(value) : null;

  // Point buy and the standard array are pickers, not free entry: offering a number field for a
  // constrained choice invites the player to enter something illegal and then be told off.
  const options =
    method === 'point-buy'
      ? Array.from({ length: POINT_BUY_MAX - POINT_BUY_MIN + 1 }, (_, i) => POINT_BUY_MIN + i)
      : method === 'standard-array'
        ? [...STANDARD_ARRAY]
        : null;

  return (
    <li className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-3">
      <div className="flex-1">
        <span className="text-sm font-medium">{ABILITY_NAMES[id]}</span>
        {issue ? <p className="text-xs text-[var(--danger)]">{issue}</p> : null}
        {cost !== null ? (
          <p className="text-xs text-[var(--text-muted)]">{cost} points</p>
        ) : null}
      </div>

      {options ? (
        <Select
          aria-label={ABILITY_NAMES[id]}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-24"
        >
          {options.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Select>
      ) : (
        <input
          type="number"
          aria-label={ABILITY_NAMES[id]}
          value={value}
          min={1}
          max={30}
          onChange={(e) => onChange(Number(e.target.value))}
          className="min-h-11 w-24 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-base)] px-3 text-sm"
        />
      )}

      <span className="display-face w-12 text-right text-lg" aria-label="modifier">
        {formatModifier(modifier)}
      </span>
    </li>
  );
}
