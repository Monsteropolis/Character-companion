import type { ReactNode } from 'react';
import { Panel, SourceBadge } from '../../../ui/primitives';
import type { ResolvedChoice } from '../../../engine/choices';
import { validateSelection } from '../../../engine/choices';

/** Shared building blocks for wizard steps, so every step looks and behaves the same. */

export function StepHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4">
      <h2 className="display-face text-lg font-semibold">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm text-[var(--text-muted)]">{description}</p>
      ) : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="mb-4">
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {hint ? <p className="mb-1 text-xs text-[var(--text-muted)]">{hint}</p> : null}
      {children}
    </div>
  );
}

const inputClass =
  'w-full min-h-11 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text)]';

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputClass} min-h-24 ${props.className ?? ''}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

/**
 * A card in a picker list (race, class, background).
 *
 * Selection is conveyed by a border, a ring and an explicit aria-pressed state rather than by
 * colour alone, so it survives both colour-blindness and a dim room.
 */
export function OptionCard({
  title,
  subtitle,
  selected,
  onClick,
  source = 'srd',
  children,
}: {
  title: string;
  subtitle?: string;
  selected: boolean;
  onClick: () => void;
  source?: 'srd' | 'custom';
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`w-full rounded-xl border p-4 text-left transition-colors ${
        selected
          ? 'border-[var(--accent)] bg-[var(--accent-subtle)] ring-2 ring-[var(--accent)]'
          : 'border-[var(--border-strong)] hover:bg-[var(--accent-subtle)]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="display-face block font-semibold">{title}</span>
          {subtitle ? (
            <span className="mt-0.5 block text-xs text-[var(--text-muted)]">{subtitle}</span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SourceBadge source={source} />
          {selected ? <span aria-hidden="true">✓</span> : null}
        </div>
      </div>
      {children ? <div className="mt-2 text-sm text-[var(--text-muted)]">{children}</div> : null}
    </button>
  );
}

/**
 * Renders one SRD choice as a multi-select list.
 *
 * When the choice could not be enumerated -- an equipment category with no data, an unsupported
 * option type -- it falls back to free text rather than showing an empty picker, so the player
 * is never blocked by a gap in the rules data.
 */
export function ChoicePicker({
  choice,
  selected,
  onChange,
  manualValue,
  onManualChange,
}: {
  choice: ResolvedChoice;
  selected: string[];
  onChange: (ids: string[]) => void;
  manualValue?: string;
  onManualChange?: (value: string) => void;
}) {
  const error = validateSelection(choice, selected);
  const atLimit = selected.length >= choice.choose;

  if (choice.requiresManualEntry) {
    return (
      <Panel className="mb-4 p-4">
        <p className="mb-2 text-sm font-medium">{choice.desc ?? `Choose ${choice.choose}`}</p>
        <p className="mb-2 text-xs text-[var(--text-muted)]">
          The rules data does not list these options, so enter your choice manually.
        </p>
        <TextInput
          value={manualValue ?? ''}
          onChange={(e) => onManualChange?.(e.target.value)}
          placeholder="Type your choice"
        />
      </Panel>
    );
  }

  return (
    <Panel className="mb-4 p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{choice.desc ?? `Choose ${choice.choose}`}</p>
        <span className="text-xs text-[var(--text-muted)]">
          {selected.length}/{choice.choose}
        </span>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {choice.options.map((option) => {
          const isSelected = selected.includes(option.id);
          const disabled = !isSelected && atLimit;
          return (
            <li key={option.id}>
              <label
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm transition-colors ${
                  isSelected
                    ? 'border-[var(--accent)] bg-[var(--accent-subtle)]'
                    : 'border-[var(--border-strong)]'
                } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={disabled}
                  onChange={() =>
                    onChange(
                      isSelected
                        ? selected.filter((id) => id !== option.id)
                        : [...selected, option.id],
                    )
                  }
                  className="h-4 w-4 shrink-0"
                />
                <span>{option.label.replace(/^Skill: /, '')}</span>
              </label>
            </li>
          );
        })}
      </ul>

      {error ? (
        <p role="status" className="mt-2 text-xs text-[var(--text-muted)]">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}
