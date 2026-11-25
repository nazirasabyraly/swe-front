import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { ErrorState, LoadingState } from '../../components/DataStates';
import { paths } from '../../routes';
import { EventAdminNav } from '../event-admin/EventAdminNav';
import '../event-admin/event-admin.css';
import { useOrganizerEvent } from '../event-setup/useOrganizerEvent';
import { PaidSalesPanel } from './PaidSalesPanel';

/** Paid-sales activation outside the wizard, e.g. for paid tickets added after publishing. */
export function PaidSalesPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const { state, reload } = useOrganizerEvent(id);

  return (
    <div>
      <Link to={paths.organizerEventTickets(id)} className="back-link">
        {t('paidSales.backToTickets')}
      </Link>
      {state.status === 'loading' && <LoadingState label={t('eventSetup.loading')} />}
      {state.status === 'error' && (
        <ErrorState title={t('eventSetup.loadError')} message={state.message} onRetry={reload} />
      )}
      {state.status === 'ready' && (
        <>
          <h1 className="section-title ticket-page__title">{t('paidSales.pageTitle', { title: state.event.title })}</h1>
          <EventAdminNav eventId={state.event.id} />
          <PaidSalesPanel event={state.event} />
        </>
      )}
    </div>
  );
}
