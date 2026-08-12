import { useState } from 'react';
import { useSheet } from './CharacterShell';
import { usePortraitUrls } from '../portraits/usePortraitUrl';
import { characterDisplayName, primaryClass } from '../../domain/factories';
import { formatModifier } from '../../engine/contributions';
import { Button } from '../../ui/primitives';

/**
 * The persistent play bar.
 *
 * Everything here is one tap from anywhere in the app: portrait, hit points, AC, conditions.
 * Damage and healing in particular happen many times per session, so they get a dedicated
 * always-visible control rather than living inside the Combat tab.
 */
export function PlayBar() {
  const { character, stats, update } = useSheet();
  const portraits = usePortraitUrls(character ? [character] : []);
  const [amount, setAmount] = useState('');

  if (!character || !stats) return null;

  const maxHp = stats.maxHp.total;
  const { currentHp, tempHp } = character.resources;
  const parsed = Math.max(0, Math.floor(Number(amount) || 0));

  async function applyDamage() {
    if (!character || parsed === 0) return;
    // Temporary hit points absorb damage first and are spent before real hit points.
    const absorbed = Math.min(tempHp, parsed);
    const remaining = parsed - absorbed;
    await update({
      resources: {
        ...character.resources,
        tempHp: tempHp - absorbed,
        currentHp: Math.max(0, currentHp - remaining),
      },
    });
    setAmount('');
  }

  async function applyHealing() {
    if (!character || parsed === 0) return;
    // Healing never exceeds the maximum, and never revives negative hit points from below zero.
    await update({
      resources: { ...character.resources, currentHp: Math.min(maxHp, currentHp + parsed) },
    });
    setAmount('');
  }

  async function applyTempHp() {
    if (!character || parsed === 0) return;
    // Temporary hit points do not stack: the larger pool replaces the smaller.
    await update({
      resources: { ...character.resources, tempHp: Math.max(tempHp, parsed) },
    });
    setAmount('');
  }

  const hpPercent = maxHp > 0 ? Math.min(100, (currentHp / maxHp) * 100) : 0;
  const bloodied = maxHp > 0 && currentHp <= maxHp / 2;
  const down = currentHp === 0;
  const cls = primaryClass(character);

  return (
    <section
      aria-label="Character status"
      className="panel sticky top-16 z-10 mb-4 p-3 lg:static"
    >
      <div className="flex items-center gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[var(--accent-subtle)]">
          {portraits[character.id] ? (
            <img src={portraits[character.id]} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center" aria-hidden="true">
              <span className="display-face text-2xl font-semibold text-[var(--accent)]">
                {characterDisplayName(character).slice(0, 1).toUpperCase()}
              </span>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="display-face truncate text-lg font-semibold">
            {characterDisplayName(character)}
          </h1>
          <p className="truncate text-xs text-[var(--text-muted)]">
            {[
              character.race.subraceRef?.name ?? character.race.raceRef?.name,
              cls ? `${cls.classRef.name} ${stats.totalLevel}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2 text-center">
          <StatChip label="AC" value={String(stats.armorClass.total)} overridden={stats.overriddenStats.includes('armorClass')} />
          <StatChip label="Init" value={formatModifier(stats.initiative.total)} overridden={stats.overriddenStats.includes('initiative')} />
          <StatChip label="Speed" value={`${stats.speed.total}`} overridden={stats.overriddenStats.includes('speed')} />
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="text-xs text-[var(--text-muted)]">Hit points</span>
          <span className="display-face text-lg">
            {/* State is carried by text, not only by the bar's colour. */}
            {currentHp}
            <span className="text-sm text-[var(--text-muted)]"> / {maxHp}</span>
            {tempHp > 0 ? <span className="text-sm text-[var(--info)]"> +{tempHp}</span> : null}
          </span>
        </div>

        <div
          className="h-2 overflow-hidden rounded-full bg-[var(--accent-subtle)]"
          role="meter"
          aria-valuenow={currentHp}
          aria-valuemin={0}
          aria-valuemax={maxHp}
          aria-label="Hit points"
        >
          <div
            className="h-full rounded-full transition-[width]"
            style={{
              width: `${hpPercent}%`,
              background: down ? 'var(--danger)' : bloodied ? 'var(--warning)' : 'var(--success)',
            }}
          />
        </div>

        {down ? (
          <p className="mt-1 text-xs font-medium text-[var(--danger)]">
            Unconscious — roll death saves in the Combat tab.
          </p>
        ) : null}

        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            aria-label="Amount of damage or healing"
            className="min-h-11 w-20 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-base)] px-3 text-sm"
          />
          <Button variant="secondary" onClick={applyDamage} disabled={parsed === 0}>
            Damage
          </Button>
          <Button variant="secondary" onClick={applyHealing} disabled={parsed === 0}>
            Heal
          </Button>
          <Button variant="ghost" onClick={applyTempHp} disabled={parsed === 0}>
            Temp
          </Button>
        </div>
      </div>

      {character.resources.conditions.length > 0 || character.resources.exhaustion > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1">
          {character.resources.exhaustion > 0 ? (
            <li className="rounded-full border border-[var(--warning)] px-2 py-0.5 text-xs">
              Exhaustion {character.resources.exhaustion}
            </li>
          ) : null}
          {character.resources.conditions.map((c) => (
            <li
              key={c.index}
              className="rounded-full border border-[var(--border-strong)] px-2 py-0.5 text-xs"
            >
              {c.name}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function StatChip({
  label,
  value,
  overridden,
}: {
  label: string;
  value: string;
  overridden?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] px-2 py-1">
      <span className="block text-[0.625rem] tracking-wide text-[var(--text-muted)] uppercase">
        {label}
        {/* An overridden stat is marked so nobody wonders why it stopped updating. */}
        {overridden ? <span title="Manually overridden"> ✎</span> : null}
      </span>
      <span className="display-face block text-base">{value}</span>
    </div>
  );
}
