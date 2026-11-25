import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { useEventsApi } from '../../api/ApiContext';
import { useDescribeError } from '../../api/errors';
import type { OrganizerEvent } from '../../api/events';
import { useAuth } from '../../auth/AuthContext';
import { ErrorState, LoadingState } from '../../components/DataStates';
import { paths } from '../../routes';
import { EventPreview } from '../create-event';
import type { EventListLocationState } from '../my-events/EventListView';
import { usePaidSales } from '../paid-sales/usePaidSales';
import { useTicketTypes } from '../ticket-types/useTicketTypes';
import { SetupLayout } from './SetupLayout';

/** Wizard step 4: the attendee view of the saved draft, then publish. */
export function SetupReviewPage() {
  return <SetupLayout step="review">{(event) => <ReviewStep event={event} />}</SetupLayout>;
}

function ReviewStep({ event }: { event: OrganizerEvent }) {
  const { t } = useTranslation();
  const api = useEventsApi();
  const navigate = useNavigate();
  const describeError = useDescribeError();
  const { user } = useAuth();
  const { state, reload } = useTicketTypes(event.id);
  const { state: paidSalesState } = usePaidSales(event.id);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function publish() {
    setPublishing(true);
    setError(null);
    try {
      const published = await api.publishEvent(event.id);
      const state: EventListLocationState = { flash: t('eventSetup.publishedFlash', { title: published.title }) };
      navigate(paths.organizerEvents, { state });
    } catch (err) {
      setError(describeError(err));
      setPublishing(false);
    }
  }

  if (state.status === 'loading' || paidSalesState.status === 'loading') return <LoadingState label={t('ticketTypes.loading')} />;
  if (state.status === 'error') {
    return <ErrorState title={t('ticketTypes.loadError')} message={state.message} onRetry={reload} />;
  }

  const alreadyPublished = event.status === 'published';
  const hasVisibleTypes = state.types.some((type) => !type.hidden);
  const hasPaid = state.types.some((type) => type.kind === 'paid');
  // Unknown (failed to load) counts as not active, so paid tickets never look buyable by mistake.
  const paidSalesActive = paidSalesState.status === 'ready' && paidSalesState.paidSales.state === 'active';

  return (
    <section aria-labelledby="review-heading">
      <h2 id="review-heading" className="sr-only">
        {t('wizard.steps.review')}
      </h2>
      <div className="notice review__notice">
        <strong>{t('createEvent.previewNotice')}</strong>
        {t('createEvent.visibilityNotice', {
          label: t(`visibility.${event.visibility}.label`),
          description: t(`visibility.${event.visibility}.description`),
        })}
      </div>

      <div className="review__frame">
        <EventPreview
          event={event}
          ticketTypes={state.types}
          paidSalesActive={paidSalesActive}
          organizerName={user?.name}
        />
      </div>

      {hasPaid && !paidSalesActive && (
        <p className="notice review__error" role="note">
          {t('eventSetup.paidNotActive')}{' '}
          <Link to={paths.organizerEventSetup(event.id, 'activation')}>{t('ticketTypes.completeActivation')}</Link>
        </p>
      )}

      {error && (
        <div className="notice notice--danger review__error" role="alert">
          <strong>{t('eventSetup.publishError')}</strong>
          {error}
        </div>
      )}
      {alreadyPublished && (
        <p className="notice review__error" role="status">
          {t('eventSetup.alreadyPublished')}
        </p>
      )}
      {!hasVisibleTypes && !alreadyPublished && (
        <p className="label-muted setup-hint">{t('eventSetup.needTicketType')}</p>
      )}

      <div className="form-actions setup-actions">
        <Link to={paths.organizerEventSetup(event.id, hasPaid ? 'activation' : 'tickets')} className="btn">
          {hasPaid ? t('eventSetup.backToActivation') : t('eventSetup.backToTickets')}
        </Link>
        {alreadyPublished ? (
          <Link to={paths.organizerEvents} className="btn btn--primary">
            {t('eventSetup.backToMyEvents')}
          </Link>
        ) : (
          <>
            <Link to={paths.organizerEvents} className="btn">
              {t('eventSetup.saveDraftExit')}
            </Link>
            <button
              type="button"
              className="btn btn--primary"
              onClick={publish}
              disabled={publishing || !hasVisibleTypes}
            >
              {publishing ? t('eventSetup.publishing') : t('eventSetup.publish')}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
