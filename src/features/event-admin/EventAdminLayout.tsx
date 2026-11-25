import './event-admin.css';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import type { OrganizerEvent } from '../../api/events';
import { DateTimeRangeText } from '../../components/DateTimeText';
import { ErrorState, LoadingState } from '../../components/DataStates';
import { StatusBadge, type StatusTone } from '../../components/StatusBadge';
import { paths } from '../../routes';
import { useOrganizerEvent } from '../event-setup/useOrganizerEvent';
import { eventPhase, type EventPhase } from '../my-events/phase';
import { EventAdminNav } from './EventAdminNav';

const PHASE_TONES: Record<EventPhase, StatusTone> = { upcoming: 'info', active: 'success', completed: 'neutral', cancelled: 'danger' };

interface Props {
  children: (event: OrganizerEvent, reload: () => void) => ReactNode;
  now?: () => Date;
}

/** Header, status and sub-navigation shared by an event's management pages. */
export function EventAdminLayout({ children, now = () => new Date() }: Props) {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const { state, reload } = useOrganizerEvent(id);

  return (
    <div className="event-admin">
      <Link to={paths.organizerEvents} className="back-link">
        {t('editEvent.back')}
      </Link>
      {state.status === 'loading' && <LoadingState label={t('eventSetup.loading')} />}
      {state.status === 'error' && <ErrorState title={t('eventSetup.loadError')} message={state.message} onRetry={reload} />}
      {state.status === 'ready' && (
        <>
          <div className="event-admin__head">
            <div>
              <h1 className="section-title">{state.event.title}</h1>
              <p className="label-muted">
                <DateTimeRangeText start={state.event.startsAt} end={state.event.endsAt} timeZone={state.event.timeZone} showZone /> ·{' '}
                {state.event.venue.name}, {state.event.venue.city}
              </p>
            </div>
            <div className="event-admin__badges">
              <StatusBadge tone={PHASE_TONES[eventPhase(state.event, now())]}>
                {t(`myEvents.phase.${eventPhase(state.event, now())}`)}
              </StatusBadge>
              {state.event.status === 'draft' && <StatusBadge tone="neutral">{t('myEvents.draft')}</StatusBadge>}
            </div>
          </div>
          <EventAdminNav eventId={state.event.id} />
          {state.event.status === 'cancelled' && (
            <p className="notice event-admin__readonly" role="note">
              {t('eventAdmin.cancelledNote')}
            </p>
          )}
          {children(state.event, reload)}
        </>
      )}
    </div>
  );
}
