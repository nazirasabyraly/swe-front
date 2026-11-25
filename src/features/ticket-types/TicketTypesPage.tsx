import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { ErrorState, LoadingState } from '../../components/DataStates';
import { paths } from '../../routes';
import { EventAdminNav } from '../event-admin/EventAdminNav';
import '../event-admin/event-admin.css';
import { useOrganizerEvent } from '../event-setup/useOrganizerEvent';
import { SeatingCard } from './SeatingCard';
import { TicketTypesManager } from './TicketTypesManager';

/** Manage ticket types and watch counters for any event, published or not. */
export function TicketTypesPage({ now }: { now?: () => Date }) {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const { state, reload } = useOrganizerEvent(id);

  return (
    <div>
      <Link to={paths.organizerEvents} className="back-link">
        {t('editEvent.back')}
      </Link>
      {state.status === 'loading' && <LoadingState label={t('eventSetup.loading')} />}
      {state.status === 'error' && (
        <ErrorState title={t('eventSetup.loadError')} message={state.message} onRetry={reload} />
      )}
      {state.status === 'ready' && (
        <>
          <h1 className="section-title ticket-page__title">
            {t('ticketTypes.pageTitle', { title: state.event.title })}
          </h1>
          <EventAdminNav eventId={state.event.id} />
          <TicketTypesManager
            event={state.event}
            now={now}
            activationHref={paths.organizerEventPaidSales(state.event.id)}
          />
          <SeatingCard eventId={state.event.id} />
        </>
      )}
    </div>
  );
}
