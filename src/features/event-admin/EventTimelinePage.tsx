import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOrganizerApi } from '../../api/ApiContext';
import type { OrganizerEvent } from '../../api/events';
import type { TimelineType } from '../../api/organizer';
import { DateTimeText } from '../../components/DateTimeText';
import { EmptyState, ErrorState, LoadingState } from '../../components/DataStates';
import { useLoad } from '../orders/useLoad';
import { EventAdminLayout } from './EventAdminLayout';

const TYPES: TimelineType[] = ['event', 'ticket_type', 'order', 'refund', 'campaign', 'support', 'check_in', 'staff', 'paid_sales'];

/** `/organizer/events/:id/timeline`: read-only activity history (SRS 4.16). */
export function EventTimelinePage() {
  return <EventAdminLayout>{(event) => <Timeline event={event} />}</EventAdminLayout>;
}

function Timeline({ event }: { event: OrganizerEvent }) {
  const { t } = useTranslation();
  const api = useOrganizerApi();
  const [type, setType] = useState<TimelineType | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { state, reload } = useLoad(
    () =>
      api.getTimeline(event.id, {
        type: type || undefined,
        from: from ? new Date(`${from}T00:00:00Z`) : undefined,
        to: to ? new Date(`${to}T23:59:59Z`) : undefined,
      }),
    [api, event.id, type, from, to],
  );

  return (
    <section aria-labelledby="timeline-heading">
      <h2 id="timeline-heading" className="ticket-group__title">{t('timeline.title')}</h2>
      <p className="label-muted">{t('timeline.subtitle')}</p>
      <div className="analytics-filters">
        <div className="field">
          <label className="field__label" htmlFor="tl-type">{t('timeline.type')}</label>
          <select id="tl-type" className="input" value={type} onChange={(e) => setType(e.target.value as TimelineType | '')}>
            <option value="">{t('timeline.allTypes')}</option>
            {TYPES.map((ty) => (
              <option key={ty} value={ty}>{t(`timeline.types.${ty}`)}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="tl-from">{t('analytics.from')}</label>
          <input id="tl-from" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="tl-to">{t('analytics.to')}</label>
          <input id="tl-to" type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {state.status === 'loading' && <LoadingState label={t('timeline.loading')} />}
      {state.status === 'error' && <ErrorState title={t('timeline.loadError')} message={state.message} onRetry={reload} />}
      {state.status === 'ready' && state.data.length === 0 && <EmptyState headingLevel={3} title={t('timeline.empty')} />}
      {state.status === 'ready' && state.data.length > 0 && (
        <ol className="timeline card">
          {state.data.map((e) => (
            <li key={e.id} className="timeline__entry">
              <p>
                <strong>{e.entity}</strong> · {t(`timeline.types.${e.type}`)}
              </p>
              <p>{e.description}</p>
              <p className="timeline__meta">
                <DateTimeText value={e.at} timeZone={event.timeZone} /> · {e.actor.name}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
