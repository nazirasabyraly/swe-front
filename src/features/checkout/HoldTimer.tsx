import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** "m:ss" for a number of milliseconds, never negative. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const WARN_AT_MS = 2 * 60 * 1000;

/**
 * Countdown for the reservation hold (SRS 4.6). The visible clock isn't a live region (it would
 * announce every second); screen readers get one message when two minutes are left.
 */
export function HoldTimer({ expiresAt, onExpire }: { expiresAt: Date; onExpire: () => void }) {
  const { t } = useTranslation();
  const [remaining, setRemaining] = useState(() => expiresAt.getTime() - Date.now());
  const expired = useRef(false);

  useEffect(() => {
    const tick = () => {
      const left = expiresAt.getTime() - Date.now();
      setRemaining(left);
      if (left <= 0 && !expired.current) {
        expired.current = true;
        onExpire();
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, onExpire]);

  const warning = remaining <= WARN_AT_MS;
  return (
    <div className={`hold-timer${warning ? ' hold-timer--warning' : ''}`}>
      <span className="hold-timer__label">{t('checkout.timerLabel')}</span>
      <span className="hold-timer__clock" role="timer" aria-label={t('checkout.timerAria', { time: formatRemaining(remaining) })}>
        {formatRemaining(remaining)}
      </span>
      <span className="sr-only" aria-live="polite">
        {warning && remaining > 0 ? t('checkout.timerWarning') : ''}
      </span>
    </div>
  );
}
