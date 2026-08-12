import { useDraft } from '../draft';
import { useCollections } from '../../../rules/RulesProvider';
import { StepHeading, OptionCard, Field, Select } from './parts';
import { Spinner, ErrorNotice } from '../../../ui/primitives';
import { suggestMood } from '../../../ui/theme/moods';

export function ClassStep() {
  const { classRef, subclassRef, level, setClass, setSubclass, setLevel, setMood, mood } = useDraft();
  const { data, isLoading, isError, error, refetch } = useCollections(['classes', 'subclasses']);

  if (isLoading) return <Spinner label="Loading classes" />;
  if (isError || !data) {
    return (
      <ErrorNotice
        message={error instanceof Error ? error.message : 'Could not load classes.'}
        onRetry={() => void refetch()}
      />
    );
  }

  const selected = data.classes.find((c) => c.index === classRef?.index);
  const subclasses = data.subclasses.filter((s) => s.class.index === classRef?.index);

  // Subclass arrives at level 1 for some classes and level 3 for most; below that it is not a
  // choice the player has yet, so offering it would invent a decision the rules do not give.
  const subclassLevel = classRef?.index === 'cleric' || classRef?.index === 'sorcerer' || classRef?.index === 'warlock' ? 1 : 3;
  const subclassAvailable = level >= subclassLevel;

  return (
    <div>
      <StepHeading
        title="Class"
        description="Sets your hit die, saving throws, proficiencies and starting features."
      />

      <ul className="mb-6 grid gap-2 sm:grid-cols-2">
        {data.classes.map((c) => (
          <li key={c.index}>
            <OptionCard
              title={c.name}
              subtitle={`d${c.hit_die} hit die`}
              selected={classRef?.index === c.index}
              onClick={() => {
                setClass({ source: 'srd', index: c.index, name: c.name });
                // Only suggest a mood if the player has not chosen one themselves.
                if (mood === 'default') setMood(suggestMood(c.index));
              }}
            >
              Saves: {c.saving_throws.map((s) => s.name).join(', ')}
            </OptionCard>
          </li>
        ))}
      </ul>

      {selected ? (
        <>
          <Field label="Starting level" htmlFor="starting-level" hint="Most campaigns begin at level 1.">
            <Select
              id="starting-level"
              value={level}
              onChange={(e) => setLevel(Number(e.target.value))}
            >
              {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  Level {n}
                </option>
              ))}
            </Select>
          </Field>

          {subclassAvailable ? (
            subclasses.length > 0 ? (
              <>
                <h3 className="display-face mb-2 font-semibold">
                  {subclasses[0]?.subclass_flavor ?? 'Subclass'}
                </h3>
                <ul className="mb-6 grid gap-2 sm:grid-cols-2">
                  {subclasses.map((s) => (
                    <li key={s.index}>
                      <OptionCard
                        title={s.name}
                        selected={subclassRef?.index === s.index}
                        onClick={() => setSubclass({ source: 'srd', index: s.index, name: s.name })}
                      >
                        {s.desc[0]}
                      </OptionCard>
                    </li>
                  ))}
                </ul>
                <p className="mb-6 text-sm text-[var(--text-muted)]">
                  The SRD includes only one subclass per class. Add others as homebrew content.
                </p>
              </>
            ) : null
          ) : (
            <p className="mb-6 rounded-lg border border-[var(--border)] p-3 text-sm text-[var(--text-muted)]">
              {selected.name}s choose a subclass at level {subclassLevel}.
            </p>
          )}

          <section>
            <h3 className="display-face mb-2 font-semibold">What you get</h3>
            <ul className="space-y-1 text-sm text-[var(--text-muted)]">
              <li>Hit die: d{selected.hit_die}</li>
              <li>Saving throws: {selected.saving_throws.map((s) => s.name).join(', ')}</li>
              <li>
                Proficiencies: {selected.proficiencies.map((p) => p.name).join(', ') || 'None'}
              </li>
              {selected.spellcasting ? (
                <li>
                  Spellcasting from level {selected.spellcasting.level}, using{' '}
                  {selected.spellcasting.spellcasting_ability.name}
                </li>
              ) : null}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}
