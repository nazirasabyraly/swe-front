import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { useNotificationsApi } from '../api/ApiContext';
import type { AppNotification } from '../api/notifications';
import { DateTimeText } from './DateTimeText';

const POLL_MS = 60_000; // no WebSockets in the MVP (SRS 4.13); refresh on navigation and once a minute

/** Header bell with unread count and a disclosure panel of recent notifications (SRS 4.10). */
export function NotificationsMenu() {
  const { t } = useTranslation();
  const api = useNotificationsApi();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const panelId = useId();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    api.listNotifications().then(setItems, () => {});
  }, [api]);

  useEffect(refresh, [refresh, pathname]);
  useEffect(() => {
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // Close on Escape or a click outside.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onClick = (e: MouseEvent) => !rootRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const unread = items.filter((n) => !n.read).length;

  async function openItem(n: AppNotification) {
    if (!n.read) {
      await api.markRead(n.id).catch(() => {});
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  async function markAll() {
    await api.markAllRead().catch(() => {});
    setItems((list) => list.map((x) => ({ ...x, read: true })));
  }

  return (
    <div className="notifications" ref={rootRef}>
      <button
        type="button"
        className="btn btn--small notifications__button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">🔔</span>
        <span className="sr-only">{t('notifications.label', { count: unread })}</span>
        {unread > 0 && (
          <span className="notifications__count" aria-hidden="true">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div id={panelId} className="notifications__panel" role="region" aria-label={t('notifications.title')}>
          <div className="notifications__head">
            <h2 className="notifications__title">{t('notifications.title')}</h2>
            {unread > 0 && (
              <button type="button" className="btn btn--small" onClick={markAll}>
                {t('notifications.markAll')}
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="label-muted">{t('notifications.empty')}</p>
          ) : (
            <ul className="notifications__list">
              {items.map((n) => (
                <li key={n.id}>
                  <button type="button" className={`notifications__item${n.read ? '' : ' notifications__item--unread'}`} onClick={() => openItem(n)}>
                    <span className="notifications__item-title">
                      {!n.read && <span className="sr-only">{t('notifications.unread')} </span>}
                      {n.title}
                    </span>
                    <span className="notifications__item-body">{n.body}</span>
                    <DateTimeText value={n.createdAt} className="notifications__item-time" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
