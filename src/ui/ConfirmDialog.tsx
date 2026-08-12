import { useEffect, useRef } from 'react';
import { Button } from './primitives';

/**
 * Confirmation for destructive actions.
 *
 * Uses a native `<dialog>` so focus trapping, Escape handling and inertness of the rest of the
 * page come from the platform rather than from hand-rolled key handlers that tend to be subtly
 * wrong for keyboard and screen-reader users.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
      // Focus lands on Cancel, not Confirm: a stray Enter must not delete a character.
      cancelRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // Fires for Escape and for the backdrop, both of which must mean "cancel".
    const onClose = () => onCancel();
    dialog.addEventListener('cancel', onClose);
    dialog.addEventListener('close', onClose);
    return () => {
      dialog.removeEventListener('cancel', onClose);
      dialog.removeEventListener('close', onClose);
    };
  }, [onCancel]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      aria-describedby="confirm-description"
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-[var(--border)] bg-[var(--surface-overlay)] p-0 text-[var(--text)] backdrop:bg-black/50"
    >
      <div className="p-6">
        <h2 id="confirm-title" className="display-face mb-2 text-lg font-semibold">
          {title}
        </h2>
        <p id="confirm-description" className="mb-6 text-sm text-[var(--text-muted)]">
          {description}
        </p>
        <div className="flex justify-end gap-2">
          <Button ref={cancelRef} variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={() => void onConfirm()}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
