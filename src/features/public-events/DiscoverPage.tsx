import '../my-events/my-events.css';
import './public-events.css';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { usePublicEventsApi } from '../../api/ApiContext';
import { useDescribeError } from '../../api/errors';
import type { PublicEventSummary } from '../../api/publicEvents';
import { EmptyState, ErrorState, LoadingState } from '../../components/DataStates';
import { Money } from '../../components/Money';
import { useFormat } from '../../i18n/useFormat';
import { paths } from '../../routes';
import { EVENT_CATEGORIES, type EventCategory } from '../create-event/types';

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; events: PublicEventSummary[] };

const isCategory = (value: string | null): value is EventCategory =>
  !!value && (EVENT_CATEGORIES as readonly string[]).includes(value);

/** Public event discovery (prototype screen 1): search, category filter, event grid. Filters live in the URL. */
export function DiscoverPage() {
  const { t } = useTranslation();
  const api = usePublicEventsApi();
  const describeError = useDescribeError();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const rawCategory = params.get('category');
  const category = isCategory(rawCategory) ? rawCategory : undefined;
  const [search, setSearch] = useState(q);
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    api.listPublicEvents({ q, category }).then(
      (events) => !cancelled && setState({ status: 'ready', events }),
      (err: unknown) => !cancelled && setState({ status: 'error', message: describeError(err) }),
    );
    return () => {
      cancelled = true;
    };
  }, [api, q, category, describeError]);
  useEffect(load, [load]);
  useEffect(() => setSearch(q), [q]);

  function update(next: { q?: string; category?: EventCategory | null }) {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value) merged.set(key, value);
      else merged.delete(key);
    }
    setParams(merged);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    update({ q: search.trim() });
  }

  return (
    <div>
      <h1 className="section-title">{t('discover.title')}</h1>
      <p className="section-subtitle">{t('discover.subtitle')}</p>

      <form role="search" className="discover__search" onSubmit={submit}>
        <label className="sr-only" htmlFor="discover-q">
          {t('discover.searchLabel')}
        </label>
        <input
          id="discover-q"
          type="search"
          className="input"
          value={search}
          placeholder={t('discover.searchPlaceholder')}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" className="btn btn--primary">
          {t('discover.search')}
        </button>
      </form>

      <fieldset className="fieldset-reset discover__filters">
        <legend className="sr-only">{t('discover.categoryLabel')}</legend>
        <div className="chip-group">
          {[undefined, ...EVENT_CATEGORIES].map((value) => (
            <label key={value ?? 'all'} className="chip">
              <input
                type="radio"
                name="discover-category"
                checked={category === value}
                onChange={() => update({ category: value ?? null })}
              />
              {value ? t(`category.${value}`) : t('discover.allEvents')}
            </label>
          ))}
        </div>
      </fieldset>

      {state.status === 'loading' && <LoadingState label={t('discover.loading')} />}
      {state.status === 'error' && <ErrorState title={t('discover.loadError')} message={state.message} onRetry={load} />}
      {state.status === 'ready' && state.events.length === 0 && (
        <EmptyState
          title={q || category ? t('discover.noMatchTitle') : t('discover.emptyTitle')}
          description={q || category ? t('discover.noMatchBody') : undefined}
        />
      )}
      {state.status === 'ready' && state.events.length > 0 && (
        <>
          <p className="label-muted" role="status">
            {t('discover.count', { count: state.events.length })}
          </p>
          <ul className="event-grid discover__grid">
            {state.events.map((event) => (
              <li key={event.id}>
                <EventSummaryCard event={event} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function EventSummaryCard({ event }: { event: PublicEventSummary }) {
  const { t } = useTranslation();
  const format = useFormat();
  const titleId = `discover-${event.id}`;
  const soldOut = event.total > 0 && event.available === 0;
  // Display only: share of tickets still available, from the server's counts.
  const remaining = event.total > 0 ? Math.round((event.available / event.total) * 100) : 0;

  return (
    <article className="event-card discover-card" aria-labelledby={titleId}>
      <div className="event-card__media placeholder-stripes">
        {event.coverUrl && <img src={event.coverUrl} alt="" />}
        <span className="event-card__status discover-card__price">
          {event.priceFrom === null ? (
            t('discover.noTickets')
          ) : event.allFree ? (
            t('common.free')
          ) : event.priceFrom === 0 ? (
            t('discover.freeAndPaid')
          ) : (
            <>
              {t('discover.from')} <Money amount={event.priceFrom} />
            </>
          )}
        </span>
      </div>
      <div className="event-card__body">
        <p className="eyebrow">{t(`category.${event.category}`)}</p>
        <h2 id={titleId} className="event-card__title">
          <Link to={paths.publicEvent(event.id)} className="discover-card__link">
            {event.title}
          </Link>
        </h2>
        <p className="event-card__meta">
          {format.dateTime(event.startsAt, event.timeZone)}
          <br />
          {event.venue.name}, {event.venue.city}
        </p>
        {event.total > 0 && (
          <div className="discover-card__stock">
            <span className="label-muted">
              {soldOut
                ? t('eventPage.soldOut')
                : t('eventPage.left', { count: event.available, formatted: format.number(event.available) })}
            </span>
            <span className="stock-bar" aria-hidden="true">
              <span className="stock-bar__fill" style={{ width: `${remaining}%` }} />
            </span>
          </div>
        )}
      </div>
    </article>
  );
}
