import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useDescribeError } from '../api/errors';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** "danger" styles the confirm button as destructive and focuses Cancel first. */
  tone?: 'default' | 'danger';
  /** May return a promise; the dialog stays open and shows errors until it settles. */
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

/** Modal confirmation built on the native <dialog> (focus trap and Esc come for free). */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const describeError = useDescribeError();
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setError(null);
      dialog.showModal();
      (tone === 'danger' ? cancelRef : confirmRef).current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, tone]);

  async function handleConfirm() {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      aria-describedby={children ? bodyId : undefined}
      onCancel={(e) => {
        // Esc: close through React state, and not while a request is running.
        e.preventDefault();
        if (!pending) onClose();
      }}
    >
      <h2 id={titleId} className="dialog__title">
        {title}
      </h2>
      {children && (
        <div id={bodyId} className="dialog__body">
          {children}
        </div>
      )}
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog__actions">
        <button ref={cancelRef} type="button" className="btn" onClick={onClose} disabled={pending}>
          {cancelLabel ?? t('common.cancel')}
        </button>
        <button
          ref={confirmRef}
          type="button"
          className={tone === 'danger' ? 'btn btn--danger' : 'btn btn--primary'}
          onClick={handleConfirm}
          disabled={pending}
        >
          {pending ? t('common.working') : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
