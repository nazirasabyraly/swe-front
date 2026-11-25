import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { OrganizerEvent } from '../../api/events';
import { ErrorState, LoadingState } from '../../components/DataStates';
import { paths } from '../../routes';
import { PaidSalesPanel } from '../paid-sales/PaidSalesPanel';
import { useTicketTypes } from '../ticket-types/useTicketTypes';
import { SetupLayout } from './SetupLayout';

/** Wizard step 3: paid-sales activation for this event only (SRS 4.5). */
export function SetupActivationPage() {
  return <SetupLayout step="activation">{(event) => <ActivationStep event={event} />}</SetupLayout>;
}

function ActivationStep({ event }: { event: OrganizerEvent }) {
  const { t } = useTranslation();
  const { state, reload } = useTicketTypes(event.id);

  if (state.status === 'loading') return <LoadingState label={t('ticketTypes.loading')} />;
  if (state.status === 'error') {
    return <ErrorState title={t('ticketTypes.loadError')} message={state.message} onRetry={reload} />;
  }

  const hasPaid = state.types.some((type) => type.kind === 'paid');

  return (
    <>
      {hasPaid ? (
        <PaidSalesPanel event={event} />
      ) : (
        <section className="card" aria-labelledby="activation-heading">
          <h2 id="activation-heading" className="card__title">
            {t('paidSales.title')}
          </h2>
          <p className="label-muted">{t('paidSales.notNeeded')}</p>
        </section>
      )}
      <div className="form-actions setup-actions">
        <Link to={paths.organizerEventSetup(event.id, 'tickets')} className="btn">
          {t('eventSetup.backToTickets')}
        </Link>
        <Link to={paths.organizerEventSetup(event.id, 'review')} className="btn btn--primary">
          {t('eventSetup.continueToReview')}
        </Link>
      </div>
      {hasPaid && <p className="label-muted setup-hint">{t('paidSales.publishBeforeActivation')}</p>}
    </>
  );
}
