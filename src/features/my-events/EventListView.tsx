import { useTranslation } from 'react-i18next';
import { Link, useLocation, useSearchParams } from 'react-router';
import { EmptyState, ErrorState, LoadingState } from '../../components/DataStates';
import { paths } from '../../routes';
import { EventCard } from './EventCard';
import { eventPhase } from './phase';
import { useEventActions } from './useEventActions';
import { useMyEvents } from './useMyEvents';

export interface EventListLocationState {
  /** One-off confirmation shown after creating or editing an event. */
  flash?: string;
}

const TABS = ['all', 'upcoming', 'active', 'completed', 'cancelled'] as const;
type Tab = (typeof TABS)[number];

export function EventListView({ now = () => new Date() }: { now?: () => Date }) {
  const { t } = useTranslation();
  const { state, reload, replaceEvent } = useMyEvents();
  const actions = useEventActions(replaceEvent);
  const flash = (useLocation().state as EventListLocationState | null)?.flash;
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const phase: Tab = (TABS as readonly string[]).includes(raw ?? '') ? (raw as Tab) : 'all';
  const setTab = (tab: Tab) => setParams(tab === 'all' ? {} : { tab }, { replace: true });
  const at = now();
  const visible = state.status === 'ready' ? state.events.filter((e) => phase === 'all' || eventPhase(e, at) === phase) : [];

  return (
    <div>
      <div className="list-header">
        <div>
          <h1 className="section-title">{t('myEvents.title')}</h1>
          <p className="section-subtitle">{t('myEvents.subtitle')}</p>
        </div>
        <Link to={paths.organizerNewEvent} className="btn btn--primary">
          {t('myEvents.create')}
        </Link>
      </div>

      {flash && (
        <div className="notice list-flash" role="status">
          <strong>{flash}</strong>
        </div>
      )}

      {state.status === 'loading' && <LoadingState label={t('myEvents.loading')} />}

      {state.status === 'error' && (
        <ErrorState title={t('myEvents.loadError')} message={state.message} onRetry={reload} />
      )}

      {state.status === 'ready' && state.events.length === 0 && (
        <EmptyState
          title={t('myEvents.emptyTitle')}
          description={t('myEvents.emptyBody')}
          action={
            <Link to={paths.organizerNewEvent} className="btn btn--primary">
              {t('myEvents.emptyCta')}
            </Link>
          }
        />
      )}

      {state.status === 'ready' && state.events.length > 0 && (
        <fieldset className="fieldset-reset list-tabs">
          <legend className="sr-only">{t('myEvents.phase.label')}</legend>
          <div className="chip-group">
            {TABS.map((tab) => (
              <label key={tab} className="chip">
                <input type="radio" name="event-phase" checked={phase === tab} onChange={() => setTab(tab)} />
                {t(`myEvents.phase.${tab}`)} ({tab === 'all' ? state.events.length : state.events.filter((e) => eventPhase(e, at) === tab).length})
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {state.status === 'ready' && state.events.length > 0 && visible.length === 0 && (
        <p className="label-muted">{t('myEvents.phase.empty')}</p>
      )}

      {state.status === 'ready' && visible.length > 0 && (
        <div className="event-grid">
          {visible.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              pending={actions.isPending(event.id)}
              error={actions.errorFor(event.id)}
              onPublish={actions.publish}
              onUnpublish={actions.unpublish}
              onEdit={actions.edit}
              onTickets={actions.tickets}
              onCampaigns={actions.campaigns}
            />
          ))}
        </div>
      )}
    </div>
  );
}
