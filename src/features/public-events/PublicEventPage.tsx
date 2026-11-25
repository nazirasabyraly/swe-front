import '../create-event/create-event.css';
import './public-events.css';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import { usePublicEventsApi } from '../../api/ApiContext';
import { useDescribeError } from '../../api/errors';
import { ApiError } from '../../api/http';
import type { PublicEvent } from '../../api/publicEvents';
import { EmptyState, ErrorState, LoadingState } from '../../components/DataStates';
import { paths } from '../../routes';
import { GetHelpLink } from '../support/parts';
import { AddToCalendar } from '../../components/AddToCalendar';
import { EventDetails } from './EventDetails';
import { ReportEventButton } from './ReportEventButton';
import { TicketSelector } from './TicketSelector';

type State =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error'; message: string }
  | { status: 'ready'; event: PublicEvent };

/** The public event page (prototype screen 2). `?campaign=<token>` applies a campaign's promo code. */
export function PublicEventPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const api = usePublicEventsApi();
  const describeError = useDescribeError();
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    api.getPublicEvent(id).then(
      (event) => !cancelled && setState({ status: 'ready', event }),
      (err: unknown) => {
        if (cancelled) return;
        setState(err instanceof ApiError && err.status === 404 ? { status: 'not-found' } : { status: 'error', message: describeError(err) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api, id, describeError]);
  useEffect(load, [load]);

  useEffect(() => {
    if (state.status !== 'ready') return;
    const previous = document.title;
    document.title = `${state.event.title} · BiletFlow`;
    return () => {
      document.title = previous;
    };
  }, [state]);

  return (
    <div>
      <Link to={paths.home} className="back-link">
        {t('discover.back')}
      </Link>
      {state.status === 'loading' && <LoadingState label={t('eventSetup.loading')} />}
      {state.status === 'error' && <ErrorState title={t('eventSetup.loadError')} message={state.message} onRetry={load} />}
      {state.status === 'not-found' && (
        <EmptyState
          title={t('eventPage.notFoundTitle')}
          description={t('eventPage.notFoundBody')}
          action={
            <Link to={paths.home} className="btn btn--primary">
              {t('discover.browse')}
            </Link>
          }
        />
      )}
      {state.status === 'ready' && (
        <article className="event-page" aria-labelledby="public-event-title">
          <div className="event-page__banner placeholder-stripes">
            {state.event.imageUrls[0] && (
              <img src={state.event.imageUrls[0]} alt={t('eventPage.coverAlt', { title: state.event.title })} />
            )}
          </div>
          <div className="event-page__layout">
            <div>
              <EventDetails event={state.event} titleId="public-event-title" />
              <h2 className="event-page__tickets-title">{t('calendar.title')}</h2>
              <AddToCalendar
                event={{ ...state.event, url: `${window.location.origin}${paths.publicEvent(state.event.id)}` }}
              />
              <p className="public-event__help">
                <GetHelpLink event={state.event.id} about={state.event.title} className="btn btn--small" />{' '}
                <ReportEventButton eventId={state.event.id} />
              </p>
            </div>
            <TicketSelector event={state.event} campaignToken={params.get('campaign')} />
          </div>
        </article>
      )}
    </div>
  );
}
