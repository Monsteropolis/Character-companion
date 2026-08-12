import { useMemo, useState } from 'react';
import { useSheet } from '../sheet/CharacterShell';
import { useCollection } from '../../rules/RulesProvider';
import { Panel, Button, EmptyState, Spinner, SourceBadge } from '../../ui/primitives';
import { TextInput, Select } from '../creation/steps/parts';
import { formatModifier } from '../../engine/contributions';
import {
  castableSlots,
  pactSlotKey,
  countPrepared,
  scaledDice,
} from '../../engine/spellcasting';
import type { ContentRef, SpellSelection } from '../../domain/types';

/**
 * The spellbook.
 *
 * Casting is the central action, so a spell card leads with what you need mid-turn: the slot to
 * spend, the save DC or attack bonus, and the damage at that slot level. Description and
 * components are there but secondary -- you read those once, and cast dozens of times.
 */
export function SpellsTab() {
  const { character, spellcasting, update } = useSheet();
  const spellsQuery = useCollection('spells');

  const [query, setQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<'all' | number>('all');
  const [schoolFilter, setSchoolFilter] = useState('all');
  const [preparedOnly, setPreparedOnly] = useState(false);
  const [browsing, setBrowsing] = useState(false);

  const knownRefs = useMemo(() => {
    const map = new Map<string, SpellSelection>();
    for (const entry of character?.spellcasting?.entries ?? []) {
      for (const selection of entry.known) map.set(selection.ref.index, selection);
    }
    return map;
  }, [character]);

  const allSpells = spellsQuery.data ?? [];

  const knownSpells = useMemo(
    () => allSpells.filter((s) => knownRefs.has(s.index)),
    [allSpells, knownRefs],
  );

  const visible = useMemo(() => {
    const source = browsing ? allSpells : knownSpells;
    const needle = query.trim().toLowerCase();
    return source
      .filter((s) => (needle ? s.name.toLowerCase().includes(needle) : true))
      .filter((s) => (levelFilter === 'all' ? true : s.level === levelFilter))
      .filter((s) => (schoolFilter === 'all' ? true : s.school.index === schoolFilter))
      .filter((s) => (preparedOnly ? knownRefs.get(s.index)?.prepared : true))
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  }, [browsing, allSpells, knownSpells, query, levelFilter, schoolFilter, preparedOnly, knownRefs]);

  const schools = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of allSpells) map.set(s.school.index, s.school.name);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [allSpells]);

  if (!character || !spellcasting) return null;
  if (spellsQuery.isLoading) return <Spinner label="Loading spells" />;

  if (!spellcasting.hasSpellcasting) {
    return (
      <EmptyState
        title="No spellcasting"
        description="This character does not cast spells. Class resources are on the Combat tab."
      />
    );
  }

  async function useSlot(level: number, pact: boolean, delta: number) {
    if (!character) return;
    const key = pact ? pactSlotKey(level) : level;
    const row = pact
      ? spellcasting!.pactSlots.find((s) => s.level === level)
      : spellcasting!.slots.find((s) => s.level === level);
    if (!row) return;

    const used = Math.max(0, Math.min(row.total, row.used + delta));
    await update({
      resources: {
        ...character.resources,
        spellSlots: { ...character.resources.spellSlots, [key]: { used, total: row.total } },
      },
    });
  }

  async function toggleKnown(spell: { index: string; name: string }) {
    if (!character) return;
    const entries = character.spellcasting?.entries ?? [];
    if (entries.length === 0) return;

    const known = knownRefs.has(spell.index);
    const ref: ContentRef = { source: 'srd', index: spell.index, name: spell.name };

    await update({
      spellcasting: {
        entries: entries.map((entry, i) =>
          i === 0
            ? {
                ...entry,
                known: known
                  ? entry.known.filter((s) => s.ref.index !== spell.index)
                  : [...entry.known, { ref, prepared: false, alwaysPrepared: false, source: 'class' }],
              }
            : entry,
        ),
      },
    });
  }

  async function togglePrepared(spellIndex: string) {
    if (!character) return;
    await update({
      spellcasting: {
        entries: (character.spellcasting?.entries ?? []).map((entry) => ({
          ...entry,
          known: entry.known.map((s) =>
            s.ref.index === spellIndex && !s.alwaysPrepared
              ? { ...s, prepared: !s.prepared }
              : s,
          ),
        })),
      },
    });
  }

  async function setConcentration(spellIndex: string | null) {
    if (!character) return;
    await update({ resources: { ...character.resources, concentratingOn: spellIndex } });
  }

  const concentratingName = character.resources.concentratingOn
    ? (allSpells.find((s) => s.index === character.resources.concentratingOn)?.name ?? null)
    : null;

  return (
    <div className="space-y-4">
      <section className="grid gap-2 sm:grid-cols-2">
        {spellcasting.casters.map((caster) => (
          <Panel key={caster.classIndex} className="p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium">{caster.className}</span>
              <span className="text-xs text-[var(--text-muted)] uppercase">
                {caster.ability}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-sm">
              <span>
                Save DC <strong className="display-face">{caster.saveDc}</strong>
              </span>
              <span>
                Attack{' '}
                <strong className="display-face">{formatModifier(caster.attackBonus)}</strong>
              </span>
              {caster.preparedLimit !== null ? (
                <span>
                  Prepared{' '}
                  <strong className="display-face">
                    {countPrepared(character, caster.classIndex)}/{caster.preparedLimit}
                  </strong>
                </span>
              ) : null}
            </div>
            {caster.isPactMagic ? (
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Pact Magic — slots return on a short rest.
              </p>
            ) : null}
          </Panel>
        ))}
      </section>

      {concentratingName ? (
        <Panel className="flex items-center justify-between gap-2 border-[var(--info)] p-3">
          <span className="text-sm">
            Concentrating on <strong>{concentratingName}</strong>
          </span>
          <Button variant="ghost" onClick={() => void setConcentration(null)}>
            Drop
          </Button>
        </Panel>
      ) : null}

      {spellcasting.slots.length > 0 || spellcasting.pactSlots.length > 0 ? (
        <section>
          <h2 className="display-face mb-2 font-semibold">Spell slots</h2>
          <ul className="space-y-2">
            {spellcasting.slots.map((slot) => (
              <li key={`s${slot.level}`}>
                <SlotRow
                  label={`Level ${slot.level}`}
                  total={slot.total}
                  used={slot.used}
                  onUse={() => void useSlot(slot.level, false, 1)}
                  onRestore={() => void useSlot(slot.level, false, -1)}
                />
              </li>
            ))}
            {spellcasting.pactSlots.map((slot) => (
              <li key={`p${slot.level}`}>
                <SlotRow
                  label={`Pact Magic (level ${slot.level})`}
                  total={slot.total}
                  used={slot.used}
                  onUse={() => void useSlot(slot.level, true, 1)}
                  onRestore={() => void useSlot(slot.level, true, -1)}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={browsing ? 'Search all spells' : 'Search your spells'}
          aria-label="Search spells"
          className="flex-1"
        />
        <Select
          value={String(levelFilter)}
          onChange={(e) => setLevelFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          aria-label="Filter by level"
          className="w-auto"
        >
          <option value="all">All levels</option>
          <option value="0">Cantrips</option>
          {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              Level {n}
            </option>
          ))}
        </Select>
        <Select
          value={schoolFilter}
          onChange={(e) => setSchoolFilter(e.target.value)}
          aria-label="Filter by school"
          className="w-auto"
        >
          <option value="all">All schools</option>
          {schools.map(([index, name]) => (
            <option key={index} value={index}>
              {name}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant={browsing ? 'primary' : 'secondary'} onClick={() => setBrowsing(!browsing)}>
          {browsing ? 'Done adding' : 'Add spells'}
        </Button>
        {!browsing ? (
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={preparedOnly}
              onChange={(e) => setPreparedOnly(e.target.checked)}
              className="h-4 w-4"
            />
            Prepared only
          </label>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={browsing ? 'No matching spells' : 'No spells yet'}
          description={
            browsing
              ? 'Try a different search or filter.'
              : 'Use “Add spells” to build your list. Homebrew spells appear here too.'
          }
        />
      ) : (
        <ul className="space-y-2">
          {visible.map((spell) => (
            <li key={spell.index}>
              <SpellCard
                spell={spell}
                selection={knownRefs.get(spell.index) ?? null}
                browsing={browsing}
                slots={castableSlots(spellcasting, spell.level)}
                concentrating={character.resources.concentratingOn === spell.index}
                onToggleKnown={() => void toggleKnown(spell)}
                onTogglePrepared={() => void togglePrepared(spell.index)}
                onCast={(level, pact) => {
                  void useSlot(level, pact, 1);
                  if (spell.concentration) void setConcentration(spell.index);
                }}
                onConcentrate={() => void setConcentration(spell.index)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SlotRow({
  label,
  total,
  used,
  onUse,
  onRestore,
}: {
  label: string;
  total: number;
  used: number;
  onUse: () => void;
  onRestore: () => void;
}) {
  const remaining = total - used;
  return (
    <Panel className="flex flex-wrap items-center justify-between gap-2 p-3">
      <div>
        <span className="text-sm font-medium">{label}</span>
        <ul className="mt-1 flex gap-1" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
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
      </div>
      <div className="flex items-center gap-2">
        <span className="display-face text-lg" aria-label={`${label}: ${remaining} of ${total} remaining`}>
          {remaining} / {total}
        </span>
        <Button variant="secondary" onClick={onUse} disabled={remaining === 0}>
          Use
        </Button>
        <Button variant="ghost" onClick={onRestore} disabled={used === 0}>
          Undo
        </Button>
      </div>
    </Panel>
  );
}

function SpellCard({
  spell,
  selection,
  browsing,
  slots,
  concentrating,
  onToggleKnown,
  onTogglePrepared,
  onCast,
  onConcentrate,
}: {
  spell: Record<string, any>;
  selection: SpellSelection | null;
  browsing: boolean;
  slots: { level: number; remaining: number; pact: boolean }[];
  concentrating: boolean;
  onToggleKnown: () => void;
  onTogglePrepared: () => void;
  onCast: (level: number, pact: boolean) => void;
  onConcentrate: () => void;
}) {
  const isCantrip = spell.level === 0;

  return (
    <details className="panel p-3">
      <summary className="flex cursor-pointer items-center justify-between gap-2">
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{spell.name}</span>
            {selection?.prepared || selection?.alwaysPrepared ? (
              <span className="rounded-full bg-[var(--accent-subtle)] px-2 py-0.5 text-[0.625rem] font-medium tracking-wide uppercase">
                {selection.alwaysPrepared ? 'Always' : 'Prepared'}
              </span>
            ) : null}
            {spell.concentration ? (
              <span className="rounded-full border border-[var(--border-strong)] px-2 py-0.5 text-[0.625rem] tracking-wide uppercase">
                Conc.
              </span>
            ) : null}
            {spell.ritual ? (
              <span className="rounded-full border border-[var(--border-strong)] px-2 py-0.5 text-[0.625rem] tracking-wide uppercase">
                Ritual
              </span>
            ) : null}
            <SourceBadge source={String(spell.index).startsWith('custom:') ? 'custom' : 'srd'} />
          </span>
          <span className="block text-xs text-[var(--text-muted)]">
            {isCantrip ? 'Cantrip' : `Level ${spell.level}`} · {spell.school.name} ·{' '}
            {spell.casting_time} · {spell.range}
          </span>
        </span>
      </summary>

      <div className="mt-3 space-y-3 border-t border-[var(--border)] pt-3">
        <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <Detail label="Components" value={(spell.components ?? []).join(', ')} />
          <Detail label="Duration" value={spell.duration} />
          <Detail label="Casting time" value={spell.casting_time} />
          <Detail label="Range" value={spell.range} />
        </dl>

        {spell.material ? (
          <p className="text-xs text-[var(--text-muted)]">Material: {spell.material}</p>
        ) : null}

        <div className="space-y-2 text-sm text-[var(--text-muted)]">
          {(spell.desc ?? []).map((paragraph: string, i: number) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>

        {spell.higher_level?.length ? (
          <div className="rounded-lg border border-[var(--border)] p-2">
            <p className="text-xs font-medium">At higher levels</p>
            {spell.higher_level.map((text: string, i: number) => (
              <p key={i} className="text-sm text-[var(--text-muted)]">
                {text}
              </p>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {browsing ? (
            <Button variant={selection ? 'primary' : 'secondary'} onClick={onToggleKnown}>
              {selection ? 'Remove from list' : 'Add to list'}
            </Button>
          ) : null}

          {selection && !isCantrip && !selection.alwaysPrepared ? (
            <Button variant={selection.prepared ? 'primary' : 'secondary'} onClick={onTogglePrepared}>
              {selection.prepared ? 'Unprepare' : 'Prepare'}
            </Button>
          ) : null}

          {selection && !isCantrip
            ? slots.map((slot) => (
                <Button
                  key={`${slot.pact ? 'p' : 's'}${slot.level}`}
                  variant="secondary"
                  onClick={() => onCast(slot.level, slot.pact)}
                >
                  {/* Upcasting is offered explicitly, with the damage it would produce. */}
                  Cast at {slot.level}
                  {slot.pact ? ' (pact)' : ''}
                  {damageAt(spell, slot.level) ? ` · ${damageAt(spell, slot.level)}` : ''}
                </Button>
              ))
            : null}

          {selection && isCantrip ? (
            <span className="text-sm text-[var(--text-muted)]">Cantrips cost no slot.</span>
          ) : null}

          {selection && !isCantrip && slots.length === 0 ? (
            <span className="text-sm text-[var(--text-muted)]">No slots of this level remain.</span>
          ) : null}

          {spell.concentration && selection && !concentrating ? (
            <Button variant="ghost" onClick={onConcentrate}>
              Mark concentrating
            </Button>
          ) : null}
        </div>
      </div>
    </details>
  );
}

function damageAt(spell: Record<string, any>, slotLevel: number): string | null {
  const damage = scaledDice(spell.damage?.damage_at_slot_level, slotLevel);
  if (damage) return damage;
  return scaledDice(spell.heal_at_slot_level, slotLevel);
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
