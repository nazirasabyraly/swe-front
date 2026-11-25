import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/** Loading, empty and error states for data views. */

export function LoadingState({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <p className="label-muted data-state" role="status">
      {label ?? t('common.loading')}
    </p>
  );
}

interface EmptyStateProps {
  title: string;
  description?: string;
  /** Usually a link or button that resolves the empty state. */
  action?: ReactNode;
  headingLevel?: 2 | 3;
}

export function EmptyState({ title, description, action, headingLevel = 2 }: EmptyStateProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <section className="card empty-state">
      <Heading className="card__title">{title}</Heading>
      {description && <p className="label-muted">{description}</p>}
      {action}
    </section>
  );
}

interface ErrorStateProps {
  title: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ title, message, onRetry }: ErrorStateProps) {
  const { t } = useTranslation();
  return (
    <div className="notice notice--danger data-state" role="alert">
      <strong>{title}</strong>
      {message && <p className="notice__body">{message}</p>}
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          {t('common.tryAgain')}
        </button>
      )}
    </div>
  );
}
