import type { Visibility } from '../domain/types';

/**
 * Public/private control.
 *
 * The single most consequential control in the journal, so it is a pair of explicit labelled
 * buttons rather than a switch: a toggle asks the user to infer which state means "shared", and
 * getting that wrong exposes private notes to a DM. Both options are always visible, both are
 * labelled in words, and the selected one is marked by text and shape as well as colour.
 */
export function VisibilityToggle({
  value,
  onChange,
  idPrefix = 'visibility',
}: {
  value: Visibility;
  onChange: (next: Visibility) => void;
  idPrefix?: string;
}) {
  return (
    <fieldset className="mb-4">
      <legend className="mb-1 block text-sm font-medium">Who can see this?</legend>
      <div className="flex flex-wrap gap-2">
        <Option
          id={`${idPrefix}-private`}
          selected={value === 'private'}
          onSelect={() => onChange('private')}
          icon="🔒"
          label="Private"
          hint="Only you. Never included in a shared view."
        />
        <Option
          id={`${idPrefix}-public`}
          selected={value === 'public'}
          onSelect={() => onChange('public')}
          icon="👁"
          label="Shareable"
          hint="Marked as safe to show your party or DM."
        />
      </div>
    </fieldset>
  );
}

function Option({
  id,
  selected,
  onSelect,
  icon,
  label,
  hint,
}: {
  id: string;
  selected: boolean;
  onSelect: () => void;
  icon: string;
  label: string;
  hint: string;
}) {
  return (
    <button
      id={id}
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex-1 rounded-lg border p-3 text-left transition-colors ${
        selected
          ? 'border-[var(--accent)] bg-[var(--accent-subtle)] ring-2 ring-[var(--accent)]'
          : 'border-[var(--border-strong)] hover:bg-[var(--accent-subtle)]'
      }`}
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        <span aria-hidden="true">{icon}</span>
        {label}
        {selected ? <span aria-hidden="true">✓</span> : null}
      </span>
      <span className="mt-1 block text-xs text-[var(--text-muted)]">{hint}</span>
    </button>
  );
}

/** Compact badge for lists. Always shown -- visibility is never left to be inferred. */
export function VisibilityBadge({ visibility }: { visibility: Visibility }) {
  const isPrivate = visibility === 'private';
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[0.625rem] font-medium tracking-wide uppercase ${
        isPrivate
          ? 'border-[var(--border-strong)] text-[var(--text-muted)]'
          : 'border-[var(--info)] text-[var(--info)]'
      }`}
    >
      <span aria-hidden="true">{isPrivate ? '🔒' : '👁'}</span>
      {isPrivate ? 'Private' : 'Shareable'}
    </span>
  );
}
