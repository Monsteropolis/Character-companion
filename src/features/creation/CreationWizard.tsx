import { useNavigate } from 'react-router-dom';
import { useDraft, STEPS, stepComplete, type StepId } from './draft';
import { Button } from '../../ui/primitives';
import { MoodScope } from '../../ui/theme/ThemeProvider';
import { IdentityStep } from './steps/IdentityStep';
import { RaceStep } from './steps/RaceStep';
import { ClassStep } from './steps/ClassStep';
import { BackgroundStep } from './steps/BackgroundStep';
import { AbilitiesStep } from './steps/AbilitiesStep';
import { ProficienciesStep } from './steps/ProficienciesStep';
import { EquipmentStep } from './steps/EquipmentStep';
import { SpellsStep } from './steps/SpellsStep';
import { ReviewStep } from './steps/ReviewStep';

const STEP_LABELS: Record<StepId, string> = {
  identity: 'Identity',
  race: 'Race',
  class: 'Class',
  background: 'Background',
  abilities: 'Abilities',
  proficiencies: 'Skills',
  equipment: 'Equipment',
  spells: 'Spells',
  review: 'Review',
};

/**
 * The creation wizard.
 *
 * Every step is reachable at any time rather than being gated behind the previous one. Players
 * routinely decide their class before their name, and forcing a linear path just makes them
 * enter placeholder data. Steps that are not yet complete are marked, not blocked.
 */
export function CreationWizard() {
  const navigate = useNavigate();
  const draft = useDraft();
  const { step, goto, next, back, reset } = draft;

  const index = STEPS.indexOf(step);
  const isLast = step === 'review';

  // Non-casters never see an empty spell step.
  const visibleSteps = STEPS.filter((s) => s !== 'spells' || isCaster(draft.classRef?.index));

  return (
    <MoodScope mood={draft.mood}>
      <div className="mx-auto max-w-3xl px-4 pb-32">
        <header className="flex items-center justify-between gap-3 py-5">
          <div>
            <h1 className="display-face text-xl font-semibold">Create a character</h1>
            <p className="text-sm text-[var(--text-muted)]">
              Step {index + 1} of {STEPS.length} · {STEP_LABELS[step]}
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              reset();
              navigate('/');
            }}
          >
            Cancel
          </Button>
        </header>

        <nav aria-label="Creation steps" className="mb-6 -mx-4 overflow-x-auto px-4">
          <ol className="flex min-w-max gap-1">
            {visibleSteps.map((s) => {
              const done = stepComplete(draft, s);
              const active = s === step;
              return (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => goto(s)}
                    aria-current={active ? 'step' : undefined}
                    className={`min-h-11 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors ${
                      active
                        ? 'bg-[var(--accent)] text-[var(--on-accent)]'
                        : 'text-[var(--text-muted)] hover:bg-[var(--accent-subtle)]'
                    }`}
                  >
                    {/* A tick is redundant with colour on purpose: state must not be colour-only. */}
                    {done && !active ? '✓ ' : ''}
                    {STEP_LABELS[s]}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="min-h-[24rem]">
          {step === 'identity' ? <IdentityStep /> : null}
          {step === 'race' ? <RaceStep /> : null}
          {step === 'class' ? <ClassStep /> : null}
          {step === 'background' ? <BackgroundStep /> : null}
          {step === 'abilities' ? <AbilitiesStep /> : null}
          {step === 'proficiencies' ? <ProficienciesStep /> : null}
          {step === 'equipment' ? <EquipmentStep /> : null}
          {step === 'spells' ? <SpellsStep /> : null}
          {step === 'review' ? <ReviewStep /> : null}
        </div>

        {!isLast ? (
          <div className="fixed inset-x-0 bottom-0 border-t border-[var(--border)] bg-[var(--surface-overlay)] p-3 pb-[calc(0.75rem+var(--safe-bottom))]">
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
              <Button variant="ghost" onClick={back} disabled={index === 0}>
                Back
              </Button>
              <Button variant="primary" onClick={next}>
                Continue
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </MoodScope>
  );
}

export function isCaster(classIndex: string | undefined): boolean {
  if (!classIndex) return true; // Unknown yet: keep the step visible rather than hiding it.
  return ['bard', 'cleric', 'druid', 'sorcerer', 'warlock', 'wizard', 'paladin', 'ranger'].includes(
    classIndex,
  );
}
