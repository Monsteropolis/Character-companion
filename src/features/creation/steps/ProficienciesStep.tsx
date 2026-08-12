import { useDraft } from '../draft';
import { useCollections } from '../../../rules/RulesProvider';
import { StepHeading, ChoicePicker } from './parts';
import { Spinner, ErrorNotice, EmptyState } from '../../../ui/primitives';
import { resolveChoice, emptyChoiceContext } from '../../../engine/choices';
import type { Choice } from '../../../rules/schemas/primitives';

export function ProficienciesStep() {
  const { classRef, backgroundRef, selections, select } = useDraft();
  const { data, isLoading, isError, error, refetch } = useCollections(['classes', 'backgrounds']);

  if (isLoading) return <Spinner label="Loading proficiencies" />;
  if (isError || !data) {
    return (
      <ErrorNotice
        message={error instanceof Error ? error.message : 'Could not load proficiencies.'}
        onRetry={() => void refetch()}
      />
    );
  }

  const cls = data.classes.find((c) => c.index === classRef?.index);
  const background = data.backgrounds.find((b) => b.index === backgroundRef?.index);

  if (!cls) {
    return (
      <EmptyState
        title="Choose a class first"
        description="Skill choices come from your class, so pick one before this step."
      />
    );
  }

  const ctx = emptyChoiceContext();

  return (
    <div>
      <StepHeading
        title="Skills & proficiencies"
        description="Choices from your class. Background and racial proficiencies are granted automatically."
      />

      {cls.proficiency_choices.map((choice, i) => {
        const key = `class:${cls.index}:prof:${i}`;
        return (
          <ChoicePicker
            key={key}
            choice={resolveChoice(choice as Choice, key, ctx)}
            selected={selections[key] ?? []}
            onChange={(ids) => select(key, ids)}
          />
        );
      })}

      <section className="mt-6 space-y-4">
        <div>
          <h3 className="display-face mb-2 font-semibold">Granted by {cls.name}</h3>
          <p className="text-sm text-[var(--text-muted)]">
            {cls.proficiencies.map((p) => p.name).join(', ') || 'None'}
          </p>
        </div>

        {background ? (
          <div>
            <h3 className="display-face mb-2 font-semibold">Granted by {background.name}</h3>
            <p className="text-sm text-[var(--text-muted)]">
              {background.starting_proficiencies.map((p) => p.name).join(', ') || 'None'}
            </p>
          </div>
        ) : null}

        <div>
          <h3 className="display-face mb-2 font-semibold">Saving throws</h3>
          <p className="text-sm text-[var(--text-muted)]">
            {cls.saving_throws.map((s) => s.name).join(', ')}
          </p>
        </div>
      </section>
    </div>
  );
}
