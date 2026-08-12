import { useEffect } from 'react';
import { useSheet } from './CharacterShell';
import { Panel, Button } from '../../ui/primitives';
import { syncPools } from '../../engine/classResources';
import type { ResourcePool } from '../../engine/classResources';

/**
 * Class resources.
 *
 * This is the half of the sheet that is not spellcasting: Rage, Ki, Second Wind, Action Surge,
 * Lay on Hands, Channel Divinity, Bardic Inspiration, Sorcery Points. Without it a Barbarian or
 * a Fighter has nothing to track between rests, and the app is a spellbook with a character
 * sheet bolted on.
 *
 * Pools are spent with a tap and recover on the right kind of rest, driven by the same data the
 * spell slots come from.
 */
export function ResourcesPanel() {
  const { character, pools, classStats, update } = useSheet();

  // Keep usage records in step with the character's level. A level-up raises a maximum, and
  // syncing here means the tracker is correct the moment the sheet is opened.
  useEffect(() => {
    if (!character || pools.length === 0) return;
    const next = syncPools(character.resources.usages, pools);
    const changed = JSON.stringify(next) !== JSON.stringify(character.resources.usages);
    if (changed) void update({ resources: { ...character.resources, usages: next } });
  }, [character, pools, update]);

  if (!character) return null;
  if (pools.length === 0 && classStats.length === 0) return null;

  async function spend(poolKey: string, delta: number) {
    if (!character) return;
    const pool = pools.find((p) => p.key === poolKey);
    if (!pool) return;

    // Fall back to the pool's own definition when no usage record exists yet. The sync effect
    // above creates them, but it is a round trip -- and a tap that lands first must not be
    // silently swallowed.
    const usage = character.resources.usages[poolKey] ?? {
      used: 0,
      max: pool.unlimited ? 0 : pool.max,
      resetOn: pool.resetOn,
    };

    const used = Math.max(0, Math.min(usage.max, usage.used + delta));
    await update({
      resources: {
        ...character.resources,
        usages: { ...character.resources.usages, [poolKey]: { ...usage, used } },
      },
    });
  }

  return (
    <div className="space-y-4">
      {pools.length > 0 ? (
        <section>
          <h2 className="display-face mb-2 font-semibold">Class resources</h2>
          <ul className="space-y-2">
            {pools.map((p) => (
              <li key={p.key}>
                <PoolRow
                  pool={p}
                  used={character.resources.usages[p.key]?.used ?? 0}
                  onSpend={() => void spend(p.key, 1)}
                  onRestore={() => void spend(p.key, -1)}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {classStats.length > 0 ? (
        <section>
          <h2 className="display-face mb-2 font-semibold">Class features by level</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {classStats.map((s) => (
              <li key={s.key} className="rounded-lg border border-[var(--border)] p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{s.name}</span>
                  <span className="display-face text-lg">{s.value}</span>
                </div>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{s.description}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function PoolRow({
  pool,
  used,
  onSpend,
  onRestore,
}: {
  pool: ResourcePool;
  used: number;
  onSpend: () => void;
  onRestore: () => void;
}) {
  const remaining = pool.unlimited ? Infinity : Math.max(0, pool.max - used);
  const exhausted = !pool.unlimited && remaining === 0;

  return (
    <Panel className="p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{pool.name}</p>
          <p className="text-xs text-[var(--text-muted)]">
            {pool.resetOn === 'short' ? 'Returns on a short rest' : 'Returns on a long rest'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="display-face text-lg">
            {pool.unlimited ? '∞' : `${remaining} / ${pool.max}`}
          </span>
          <Button variant="secondary" onClick={onSpend} disabled={exhausted || pool.unlimited}>
            Use
          </Button>
          <Button variant="ghost" onClick={onRestore} disabled={used === 0}>
            Undo
          </Button>
        </div>
      </div>

      {/* Small pools get pips: at a glance, three rages read faster than "3 / 3". */}
      {!pool.unlimited && pool.max <= 10 ? (
        <ul className="mt-2 flex flex-wrap gap-1" aria-hidden="true">
          {Array.from({ length: pool.max }, (_, i) => (
            <li
              key={i}
              className={`h-3 w-3 rounded-full border ${
                i < remaining
                  ? 'border-[var(--accent)] bg-[var(--accent)]'
                  : 'border-[var(--border-strong)]'
              }`}
            />
          ))}
        </ul>
      ) : null}

      <p className="mt-2 text-sm text-[var(--text-muted)]">{pool.description}</p>
    </Panel>
  );
}
