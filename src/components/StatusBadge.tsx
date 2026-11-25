import type { ReactNode } from 'react';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/** A symbol per tone, so status never relies on colour alone (WCAG 1.4.1). */
const SYMBOLS: Record<StatusTone, string> = {
  neutral: '○',
  info: 'i',
  success: '✓',
  warning: '!',
  danger: '✕',
};

interface StatusBadgeProps {
  tone: StatusTone;
  /** Visible text label, always required. */
  children: ReactNode;
}

export function StatusBadge({ tone, children }: StatusBadgeProps) {
  return (
    <span className={`status-badge status-badge--${tone}`}>
      <span className="status-badge__symbol" aria-hidden="true">
        {SYMBOLS[tone]}
      </span>
      {children}
    </span>
  );
}
