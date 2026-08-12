import { useMemo } from 'react';
import { useDraft } from '../draft';
import { useCollections } from '../../../rules/RulesProvider';
import { StepHeading, OptionCard, ChoicePicker } from './parts';
import { Spinner, ErrorNotice } from '../../../ui/primitives';
import { resolveChoice, emptyChoiceContext } from '../../../engine/choices';
import type { ChoiceContext } from '../../../engine/choices';
import type { Choice } from '../../../rules/schemas/primitives';

export function RaceStep() {
  const { raceRef, subraceRef, setRace, setSubrace, selections, select } = useDraft();
  const { data, isLoading, isError, error, refetch } = useCollections([
    'races',
    'subraces',
    'languages',
    'traits',
  ]);

  const ctx: ChoiceContext = useMemo(() => {
    const c = emptyChoiceContext();
    if (data?.languages) c.collections.set('languages', data.languages);
    return c;
  }, [data]);

  if (isLoading) return <Spinner label="Loading races" />;
  if (isError || !data) {
    return (
      <ErrorNotice
        message={error instanceof Error ? error.message : 'Could not load races.'}
        onRetry={() => void refetch()}
      />
    );
  }

  const race = data.races.find((r) => r.index === raceRef?.index);
  const subraces = data.subraces.filter((s) => s.race.index === raceRef?.index);
  const traits = data.traits.filter((t) => t.races.some((r) => r.index === raceRef?.index));

  return (
    <div>
      <StepHeading
        title="Race"
        description="Sets ability bonuses, speed, languages and racial traits."
      />

      <ul className="mb-6 grid gap-2 sm:grid-cols-2">
        {data.races.map((r) => (
          <li key={r.index}>
            <OptionCard
              title={r.name}
              subtitle={`Speed ${r.speed} ft`}
              selected={raceRef?.index === r.index}
              onClick={() => setRace({ source: 'srd', index: r.index, name: r.name })}
            >
              {r.ability_bonuses.map((b) => `${b.ability_score.name} +${b.bonus}`).join(', ') ||
                'Choose your bonuses'}
            </OptionCard>
          </li>
        ))}
      </ul>

      {race ? (
        <>
          {subraces.length > 0 ? (
            <>
              <h3 className="display-face mb-2 font-semibold">Subrace</h3>
              <ul className="mb-6 grid gap-2 sm:grid-cols-2">
                {subraces.map((s) => (
                  <li key={s.index}>
                    <OptionCard
                      title={s.name}
                      selected={subraceRef?.index === s.index}
                      onClick={() => setSubrace({ source: 'srd', index: s.index, name: s.name })}
                    >
                      {s.ability_bonuses
                        .map((b) => `${b.ability_score.name} +${b.bonus}`)
                        .join(', ')}
                    </OptionCard>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mb-6 rounded-lg border border-[var(--border)] p-3 text-sm text-[var(--text-muted)]">
              {/* Honest about the licence limit rather than implying the race has no subraces. */}
              The SRD includes no subraces for {race.name}. You can add one as homebrew content.
            </p>
          )}

          {race.ability_bonus_options ? (
            <ChoicePicker
              choice={resolveChoice(
                race.ability_bonus_options as Choice,
                `race:${race.index}:ability-bonus`,
                ctx,
              )}
              selected={selections[`race:${race.index}:ability-bonus`] ?? []}
              onChange={(ids) => select(`race:${race.index}:ability-bonus`, ids)}
            />
          ) : null}

          {race.language_options ? (
            <ChoicePicker
              choice={resolveChoice(
                race.language_options as Choice,
                `race:${race.index}:languages`,
                ctx,
              )}
              selected={selections[`race:${race.index}:languages`] ?? []}
              onChange={(ids) => select(`race:${race.index}:languages`, ids)}
            />
          ) : null}

          {traits.length > 0 ? (
            <section className="mt-6">
              <h3 className="display-face mb-2 font-semibold">Racial traits</h3>
              <ul className="space-y-2">
                {traits.map((t) => (
                  <li key={t.index} className="rounded-lg border border-[var(--border)] p-3">
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">{t.desc.join(' ')}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
