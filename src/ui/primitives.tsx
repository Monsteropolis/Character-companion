import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';

/**
 * Shared UI primitives.
 *
 * Small and unopinionated on purpose: they exist so that spacing, focus behaviour and touch
 * target sizing are consistent everywhere, not to abstract away markup. Every interactive
 * primitive meets the 44px minimum touch target -- this app is used with a thumb, at a table,
 * often in poor light.
 */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent-hover)]',
  secondary:
    'bg-[var(--surface-raised)] text-[var(--text)] border border-[var(--border-strong)] hover:bg-[var(--accent-subtle)]',
  ghost: 'bg-transparent text-[var(--text)] hover:bg-[var(--accent-subtle)]',
  danger: 'bg-[var(--danger)] text-white hover:opacity-90',
};

export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  /** React 19 passes refs as a normal prop; typed here so callers can focus a button. */
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    />
  );
}

export function Panel({
  children,
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'aside';
}) {
  return <Tag className={`panel ${className}`}>{children}</Tag>;
}

/**
 * Empty state.
 *
 * Every list view needs one designed alongside the populated view -- an empty screen with no
 * explanation reads as a bug, and this app's first-run experience is by definition empty.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      {icon ? <div className="text-4xl opacity-60">{icon}</div> : null}
      <h2 className="display-face text-xl font-semibold">{title}</h2>
      <p className="max-w-md text-sm text-[var(--text-muted)]">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-12">
      <span
        aria-hidden="true"
        className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]"
      />
      <span className="text-sm text-[var(--text-muted)]">{label}</span>
    </div>
  );
}

export function ErrorNotice({
  title = 'Something went wrong',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Panel className="mx-auto my-8 max-w-lg p-6">
      <h2 className="display-face mb-2 text-lg font-semibold text-[var(--danger)]">{title}</h2>
      <p className="mb-4 text-sm text-[var(--text-muted)]">{message}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </Panel>
  );
}

/**
 * Marks content that came from the user rather than the SRD.
 *
 * Shown everywhere custom content appears. Users must be able to tell at a glance which of
 * their content is official and which they wrote, especially when sharing with a DM.
 */
export function SourceBadge({ source }: { source: 'srd' | 'custom' }) {
  if (source === 'srd') return null;
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--border-strong)] px-2 py-0.5 text-[0.6875rem] font-medium tracking-wide text-[var(--text-muted)] uppercase">
      Homebrew
    </span>
  );
}
