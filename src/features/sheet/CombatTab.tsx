import { useState } from 'react';
import { useSheet } from './CharacterShell';
import { useCollection } from '../../rules/RulesProvider';
import { Panel, Button } from '../../ui/primitives';
import { formatModifier } from '../../engine/contributions';
import { averageHitDieValue } from '../../engine/core';
import { restorePools } from '../../engine/classResources';
import { restoreSlots } from '../../engine/spellcasting';
import { ResourcesPanel } from './ResourcesPanel';
import type { ContentRef } from '../../domain/types';

/**
 * Combat tab: the things that change during a fight.
 *
 * Death saves, hit dice, conditions, exhaustion and rests. Damage and healing live in the Play
 * Bar instead, because they are needed from every tab.
 */
export function CombatTab() {
  const { character, stats, pools, update } = useSheet();
  const conditionsQuery = useCollection('conditions');
  const [restMessage, setRestMessage] = useState<string | null>(null);

  if (!character || !stats) return null;

  const { resources } = character;

  async function setDeathSaves(successes: number, failures: number) {
    if (!character) return;
    await update({
      resources: {
        ...character.resources,
        deathSaves: {
          successes: Math.max(0, Math.min(3, successes)),
          failures: Math.max(0, Math.min(3, failures)),
        },
      },
    });
  }

  async function spendHitDie(classIndex: string) {
    if (!character) return;
    const entry = character.classes.find((c) => c.classRef.index === classIndex);
    if (!entry || entry.hitDiceSpent >= entry.level) return;
    await update({
      classes: character.classes.map((c) =>
        c.classRef.index === classIndex ? { ...c, hitDiceSpent: c.hitDiceSpent + 1 } : c,
      ),
    });
  }

  /**
   * A short rest spends nothing on its own -- hit dice are spent explicitly above -- but it does
   * restore short-rest resources. Nothing is healed automatically, because how many dice to
   * spend is the player's decision, not the app's.
   */
  async function shortRest() {
    if (!character) return;
    await update({
      resources: {
        ...character.resources,
        usages: restorePools(character.resources.usages, pools, 'short'),
        // Only Pact Magic returns on a short rest; ordinary slots do not.
        spellSlots: restoreSlots(character.resources.spellSlots, 'short'),
      },
    });
    setRestMessage(
      'Short rest taken. Short-rest features and Pact Magic slots restored. Spend hit dice above to heal.',
    );
  }

  /**
   * A long rest restores hit points, half the total hit dice, all spell slots and every
   * resource, and reduces exhaustion by one.
   */
  async function longRest() {
    if (!character || !stats) return;
    await update({
      resources: {
        ...character.resources,
        currentHp: stats.maxHp.total,
        tempHp: 0,
        deathSaves: { successes: 0, failures: 0 },
        exhaustion: Math.max(0, character.resources.exhaustion - 1),
        usages: restorePools(character.resources.usages, pools, 'long'),
        spellSlots: restoreSlots(character.resources.spellSlots, 'long'),
        concentratingOn: null,
      },
      classes: character.classes.map((c) => ({
        ...c,
        // Half your total hit dice, minimum one, are recovered on a long rest.
        hitDiceSpent: Math.max(0, c.hitDiceSpent - Math.max(1, Math.floor(c.level / 2))),
      })),
    });
    setRestMessage('Long rest taken. Hit points, slots and features restored.');
  }

  async function toggleCondition(ref: ContentRef) {
    if (!character) return;
    const has = character.resources.conditions.some((c) => c.index === ref.index);
    await update({
      resources: {
        ...character.resources,
        conditions: has
          ? character.resources.conditions.filter((c) => c.index !== ref.index)
          : [...character.resources.conditions, ref],
      },
    });
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-2 sm:grid-cols-3">
        <StatPanel label="Armour class" value={String(stats.armorClass.total)} detail={stats.armorClass} />
        <StatPanel label="Initiative" value={formatModifier(stats.initiative.total)} detail={stats.initiative} />
        <StatPanel label="Speed" value={`${stats.speed.total} ft`} detail={stats.speed} />
      </section>

      <Panel className="p-4">
        <h2 className="display-face mb-2 font-semibold">Rests</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={shortRest}>
            Short rest
          </Button>
          <Button variant="secondary" onClick={longRest}>
            Long rest
          </Button>
        </div>
        {restMessage ? (
          <p role="status" className="mt-2 text-sm text-[var(--text-muted)]">
            {restMessage}
          </p>
        ) : null}
      </Panel>

      <ResourcesPanel />

      <Panel className="p-4">
        <h2 className="display-face mb-2 font-semibold">Hit dice</h2>
        <ul className="space-y-2">
          {stats.hitDice.map((hd) => {
            const remaining = hd.total - hd.spent;
            return (
              <li key={hd.classIndex} className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">
                    d{hd.die} · {remaining} of {hd.total} remaining
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Each restores about {averageHitDieValue(hd.die)} + your CON modifier.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  disabled={remaining <= 0}
                  onClick={() => void spendHitDie(hd.classIndex)}
                >
                  Spend one
                </Button>
              </li>
            );
          })}
          {stats.hitDice.length === 0 ? (
            <li className="text-sm text-[var(--text-muted)]">No class levels yet.</li>
          ) : null}
        </ul>
      </Panel>

      {resources.currentHp === 0 ? (
        <Panel className="border-[var(--danger)] p-4">
          <h2 className="display-face mb-1 font-semibold text-[var(--danger)]">Death saves</h2>
          <p className="mb-3 text-sm text-[var(--text-muted)]">
            Three successes stabilise you. Three failures are fatal.
          </p>
          <DeathSaveRow
            label="Successes"
            count={resources.deathSaves.successes}
            onChange={(n) => void setDeathSaves(n, resources.deathSaves.failures)}
          />
          <DeathSaveRow
            label="Failures"
            count={resources.deathSaves.failures}
            onChange={(n) => void setDeathSaves(resources.deathSaves.successes, n)}
          />
          {resources.deathSaves.successes >= 3 ? (
            <p className="mt-2 text-sm text-[var(--success)]">Stable.</p>
          ) : null}
          {resources.deathSaves.failures >= 3 ? (
            <p className="mt-2 text-sm text-[var(--danger)]">Dead.</p>
          ) : null}
        </Panel>
      ) : null}

      <Panel className="p-4">
        <h2 className="display-face mb-2 font-semibold">Exhaustion</h2>
        <div className="flex flex-wrap items-center gap-2">
          {[0, 1, 2, 3, 4, 5, 6].map((level) => (
            <button
              key={level}
              type="button"
              aria-pressed={resources.exhaustion === level}
              onClick={() => void update({ resources: { ...resources, exhaustion: level } })}
              className={`min-h-11 w-11 rounded-lg border text-sm transition-colors ${
                resources.exhaustion === level
                  ? 'border-[var(--warning)] bg-[var(--accent-subtle)] font-semibold'
                  : 'border-[var(--border-strong)]'
              }`}
            >
              {level}
            </button>
          ))}
        </div>
        {stats.exhaustionEffects.length > 0 ? (
          <ul className="mt-3 space-y-1 text-sm text-[var(--text-muted)]">
            {stats.exhaustionEffects.map((effect, i) => (
              <li key={i}>• {effect}</li>
            ))}
          </ul>
        ) : null}
      </Panel>

      <Panel className="p-4">
        <h2 className="display-face mb-2 font-semibold">Conditions</h2>
        {conditionsQuery.isLoading ? (
          <p className="text-sm text-[var(--text-muted)]">Loading…</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {(conditionsQuery.data ?? []).map((condition) => {
              const active = resources.conditions.some((c) => c.index === condition.index);
              return (
                <li key={condition.index}>
                  <button
                    type="button"
                    aria-pressed={active}
                    title={condition.desc.join(' ')}
                    onClick={() =>
                      void toggleCondition({
                        source: 'srd',
                        index: condition.index,
                        name: condition.name,
                      })
                    }
                    className={`min-h-11 rounded-lg border px-3 text-sm transition-colors ${
                      active
                        ? 'border-[var(--accent)] bg-[var(--accent-subtle)] font-medium'
                        : 'border-[var(--border-strong)]'
                    }`}
                  >
                    {active ? '● ' : ''}
                    {condition.name}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {stats.attacks.length > 0 ? (
        <section>
          <h2 className="display-face mb-2 font-semibold">Attacks</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {stats.attacks.map((attack) => (
              <li key={attack.itemId}>
                <Panel className="p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{attack.name}</span>
                    <span className="display-face text-lg">
                      {formatModifier(attack.attack.total)}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--text-muted)]">
                    {attack.damageDice}
                    {attack.damageBonus !== 0 ? formatModifier(attack.damageBonus) : ''}{' '}
                    {attack.damageType.toLowerCase()}
                    {attack.properties.length > 0 ? ` · ${attack.properties.join(', ')}` : ''}
                  </p>
                </Panel>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">
          No weapons equipped. Equip one in the Inventory tab to see attack rolls here.
        </p>
      )}
    </div>
  );
}

function StatPanel({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: { contributions: { source: string; value: number }[]; notes: string[] };
}) {
  return (
    <details className="panel p-3">
      <summary className="flex cursor-pointer items-center justify-between">
        <span className="text-sm text-[var(--text-muted)]">{label}</span>
        <span className="display-face text-2xl">{value}</span>
      </summary>
      <ul className="mt-2 space-y-1 border-t border-[var(--border)] pt-2 text-xs text-[var(--text-muted)]">
        {detail.contributions.map((c, i) => (
          <li key={i} className="flex justify-between gap-2">
            <span>{c.source}</span>
            <span>{formatModifier(c.value)}</span>
          </li>
        ))}
        {detail.notes.map((note, i) => (
          <li key={`n-${i}`} className="italic">
            {note}
          </li>
        ))}
      </ul>
    </details>
  );
}

function DeathSaveRow({
  label,
  count,
  onChange,
}: {
  label: string;
  count: number;
  onChange: (count: number) => void;
}) {
  return (
    <div className="mb-2 flex items-center gap-3">
      <span className="w-24 text-sm">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${label} ${n}`}
            aria-pressed={count >= n}
            // Clicking a filled marker clears back to it, so a mis-tap is one tap to undo.
            onClick={() => onChange(count >= n ? n - 1 : n)}
            className={`h-11 w-11 rounded-full border text-sm ${
              count >= n
                ? 'border-[var(--text)] bg-[var(--text)] text-[var(--surface-base)]'
                : 'border-[var(--border-strong)]'
            }`}
          >
            {count >= n ? '●' : '○'}
          </button>
        ))}
      </div>
    </div>
  );
}
