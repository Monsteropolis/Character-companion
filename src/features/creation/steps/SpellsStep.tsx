import { useMemo, useState } from 'react';
import { useDraft } from '../draft';
import { useCollections } from '../../../rules/RulesProvider';
import { StepHeading, TextInput } from './parts';
import { Spinner, ErrorNotice, EmptyState, Panel } from '../../../ui/primitives';
import type { ContentRef } from '../../../domain/types';

/**
 * Spell selection.
 *
 * Counts (how many cantrips, how many spells) come from the level table rather than being
 * hardcoded, so they stay correct for every class and starting level.
 */
export function SpellsStep() {
  const { classRef, level, cantrips, spells, setCantrips, setSpells } = useDraft();
  const { data, isLoading, isError, error, refetch } = useCollections([
    'spells',
    'classes',
    'levels',
  ]);
  const [query, setQuery] = useState('');

  const available = useMemo(() => {
    if (!data || !classRef) return [];
    return data.spells.filter((s) => s.classes.some((c) => c.index === classRef.index));
  }, [data, classRef]);

  if (isLoading) return <Spinner label="Loading spells" />;
  if (isError || !data) {
    return (
      <ErrorNotice
        message={error instanceof Error ? error.message : 'Could not load spells.'}
        onRetry={() => void refetch()}
      />
    );
  }

  const cls = data.classes.find((c) => c.index === classRef?.index);

  if (!cls) {
    return <EmptyState title="Choose a class first" description="Spells depend on your class." />;
  }

  if (!cls.spellcasting) {
    return (
      <EmptyState
        title={`${cls.name}s do not cast spells`}
        description="Nothing to choose here. Continue to the review step."
      />
    );
  }

  if (level < cls.spellcasting.level) {
    return (
      <EmptyState
        title="No spellcasting yet"
        description={`${cls.name}s gain spellcasting at level ${cls.spellcasting.level}.`}
      />
    );
  }

  // The published level row is the source of truth for how many spells are known.
  const levelRow = data.levels.find(
    (l) => l.class.index === cls.index && l.level === level && !l.subclass,
  );
  const cantripLimit = levelRow?.spellcasting?.cantrips_known ?? 0;
  const spellLimit = levelRow?.spellcasting?.spells_known ?? spellbookSize(cls.index, level);

  const filtered = available.filter((s) =>
    query ? s.name.toLowerCase().includes(query.toLowerCase()) : true,
  );

  const toggle = (
    list: ContentRef[],
    setter: (refs: ContentRef[]) => void,
    ref: ContentRef,
    limit: number,
  ) => {
    const exists = list.some((r) => r.index === ref.index);
    if (exists) setter(list.filter((r) => r.index !== ref.index));
    else if (list.length < limit) setter([...list, ref]);
  };

  return (
    <div>
      <StepHeading
        title="Spells"
        description={`${cls.name} casts using ${cls.spellcasting.spellcasting_ability.name}.`}
      />

      <Panel className="mb-4 flex flex-wrap gap-4 p-3 text-sm">
        <span>
          Cantrips: <strong>{cantrips.length}</strong> / {cantripLimit}
        </span>
        <span>
          Spells: <strong>{spells.length}</strong> / {spellLimit}
        </span>
      </Panel>

      <TextInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search spells"
        aria-label="Search spells"
        className="mb-4"
      />

      <SpellList
        title="Cantrips"
        spells={filtered.filter((s) => s.level === 0)}
        selected={cantrips}
        limit={cantripLimit}
        onToggle={(ref) => toggle(cantrips, setCantrips, ref, cantripLimit)}
      />

      <SpellList
        title="Level 1 spells"
        spells={filtered.filter((s) => s.level === 1)}
        selected={spells}
        limit={spellLimit}
        onToggle={(ref) => toggle(spells, setSpells, ref, spellLimit)}
      />
    </div>
  );
}

/** Wizards learn six first-level spells at level 1, then two per level; not in the level table. */
function spellbookSize(classIndex: string, level: number): number {
  if (classIndex !== 'wizard') return 0;
  return 6 + (level - 1) * 2;
}

function SpellList({
  title,
  spells,
  selected,
  limit,
  onToggle,
}: {
  title: string;
  spells: { index: string; name: string; level: number; school: { name: string }; concentration: boolean; ritual: boolean }[];
  selected: ContentRef[];
  limit: number;
  onToggle: (ref: ContentRef) => void;
}) {
  if (limit === 0) return null;

  return (
    <section className="mb-6">
      <h3 className="display-face mb-2 font-semibold">{title}</h3>
      {spells.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No matching spells.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {spells.map((spell) => {
            const isSelected = selected.some((r) => r.index === spell.index);
            const atLimit = !isSelected && selected.length >= limit;
            return (
              <li key={spell.index}>
                <label
                  className={`flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border p-2 text-sm ${
                    isSelected
                      ? 'border-[var(--accent)] bg-[var(--accent-subtle)]'
                      : 'border-[var(--border-strong)]'
                  } ${atLimit ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={atLimit}
                    onChange={() =>
                      onToggle({ source: 'srd', index: spell.index, name: spell.name })
                    }
                    className="mt-1 h-4 w-4 shrink-0"
                  />
                  <span>
                    <span className="block font-medium">{spell.name}</span>
                    <span className="block text-xs text-[var(--text-muted)]">
                      {spell.school.name}
                      {spell.concentration ? ' · Concentration' : ''}
                      {spell.ritual ? ' · Ritual' : ''}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
