import { useMemo } from 'react';
import { useDraft } from '../draft';
import { useCollections } from '../../../rules/RulesProvider';
import { StepHeading, OptionCard, ChoicePicker, Field, TextArea } from './parts';
import { Spinner, ErrorNotice, Panel } from '../../../ui/primitives';
import { resolveChoice, emptyChoiceContext, type ChoiceContext } from '../../../engine/choices';
import type { Choice } from '../../../rules/schemas/primitives';

export function BackgroundStep() {
  const { backgroundRef, setBackground, selections, select, identity, setIdentity } = useDraft();
  const { data, isLoading, isError, error, refetch } = useCollections(['backgrounds', 'languages']);

  const ctx: ChoiceContext = useMemo(() => {
    const c = emptyChoiceContext();
    if (data?.languages) c.collections.set('languages', data.languages);
    return c;
  }, [data]);

  if (isLoading) return <Spinner label="Loading backgrounds" />;
  if (isError || !data) {
    return (
      <ErrorNotice
        message={error instanceof Error ? error.message : 'Could not load backgrounds.'}
        onRetry={() => void refetch()}
      />
    );
  }

  const selected = data.backgrounds.find((b) => b.index === backgroundRef?.index);

  return (
    <div>
      <StepHeading
        title="Background"
        description="Where they came from before adventuring. Grants skills, tools, languages and equipment."
      />

      {/*
        This is the sharpest edge of the SRD licence limit: exactly one background exists.
        Saying so plainly is better than letting the player hunt for a list that is not there.
      */}
      <Panel className="mb-4 p-4">
        <p className="text-sm">
          The SRD includes only <strong>Acolyte</strong>. Every other Player&apos;s Handbook
          background is proprietary, so add the one you are playing as homebrew content — it will
          work exactly like an official one.
        </p>
      </Panel>

      <ul className="mb-6 grid gap-2 sm:grid-cols-2">
        {data.backgrounds.map((b) => (
          <li key={b.index}>
            <OptionCard
              title={b.name}
              subtitle={b.feature.name}
              selected={backgroundRef?.index === b.index}
              onClick={() => setBackground({ source: 'srd', index: b.index, name: b.name })}
            >
              {b.starting_proficiencies.map((p) => p.name.replace(/^Skill: /, '')).join(', ')}
            </OptionCard>
          </li>
        ))}
      </ul>

      {selected ? (
        <>
          <section className="mb-6">
            <h3 className="display-face mb-2 font-semibold">{selected.feature.name}</h3>
            <p className="text-sm text-[var(--text-muted)]">{selected.feature.desc.join(' ')}</p>
          </section>

          {selected.language_options ? (
            <ChoicePicker
              choice={resolveChoice(
                selected.language_options as Choice,
                `background:${selected.index}:languages`,
                ctx,
              )}
              selected={selections[`background:${selected.index}:languages`] ?? []}
              onChange={(ids) => select(`background:${selected.index}:languages`, ids)}
            />
          ) : null}

          <section>
            <h3 className="display-face mb-3 font-semibold">Personality</h3>
            <p className="mb-3 text-sm text-[var(--text-muted)]">
              Suggestions from your background. Use them, edit them, or write your own.
            </p>

            <SuggestionField
              label="Personality trait"
              suggestions={optionStrings(selected.personality_traits as Choice)}
              value={identity.personalityTraits[0] ?? ''}
              onChange={(v) => setIdentity({ personalityTraits: v ? [v] : [] })}
            />
            <SuggestionField
              label="Ideal"
              suggestions={optionStrings(selected.ideals as Choice)}
              value={identity.ideals[0] ?? ''}
              onChange={(v) => setIdentity({ ideals: v ? [v] : [] })}
            />
            <SuggestionField
              label="Bond"
              suggestions={optionStrings(selected.bonds as Choice)}
              value={identity.bonds[0] ?? ''}
              onChange={(v) => setIdentity({ bonds: v ? [v] : [] })}
            />
            <SuggestionField
              label="Flaw"
              suggestions={optionStrings(selected.flaws as Choice)}
              value={identity.flaws[0] ?? ''}
              onChange={(v) => setIdentity({ flaws: v ? [v] : [] })}
            />
          </section>
        </>
      ) : null}
    </div>
  );
}

function optionStrings(choice: Choice): string[] {
  const resolved = resolveChoice(choice, 'suggestions', emptyChoiceContext());
  return resolved.options.filter((o) => o.kind === 'string').map((o) => o.label);
}

function SuggestionField({
  label,
  suggestions,
  value,
  onChange,
}: {
  label: string;
  suggestions: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `suggestion-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <Field label={label} htmlFor={id}>
      <TextArea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={2} />
      {suggestions.length > 0 ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-[var(--text-muted)]">
            {suggestions.length} suggestions
          </summary>
          <ul className="mt-2 space-y-1">
            {suggestions.map((s, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onChange(s)}
                  className="w-full rounded-md border border-[var(--border)] p-2 text-left text-xs hover:bg-[var(--accent-subtle)]"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Field>
  );
}
