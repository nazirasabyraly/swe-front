import { Link, useLocation } from 'react-router';
import { EventCard } from './EventCard';
import { useEventActions } from './useEventActions';
import { useMyEvents } from './useMyEvents';

export interface EventListLocationState {
  /** One-off confirmation shown after creating or editing an event. */
  flash?: string;
}

export function EventListView() {
  const { state, reload, replaceEvent } = useMyEvents();
  const actions = useEventActions(replaceEvent);
  const flash = (useLocation().state as EventListLocationState | null)?.flash;

  return (
    <div>
      <div className="list-header">
        <div>
          <h1 className="section-title">My events</h1>
          <p className="section-subtitle">Publish, unpublish and edit the events you organise.</p>
        </div>
        <Link to="/events/new" className="btn btn--primary">
          Create event
        </Link>
      </div>

      {flash && (
        <div className="notice list-flash" role="status">
          <strong>{flash}</strong>
        </div>
      )}

      {state.status === 'loading' && <p className="label-muted" role="status">Loading your events…</p>}

      {state.status === 'error' && (
        <div className="notice notice--danger" role="alert">
          <strong>Couldn’t load your events</strong>
          <p className="notice__body">{state.message}</p>
          <button type="button" className="btn" onClick={reload}>
            Try again
          </button>
        </div>
      )}

      {state.status === 'ready' && state.events.length === 0 && (
        <section className="card empty-state" aria-labelledby="empty-heading">
          <h2 id="empty-heading" className="card__title">
            No events yet
          </h2>
          <p className="label-muted">
            Create your first event. It stays a draft until you publish it.
          </p>
          <Link to="/events/new" className="btn btn--primary">
            Create your first event
          </Link>
        </section>
      )}

      {state.status === 'ready' && state.events.length > 0 && (
        <div className="event-grid">
          {state.events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              pending={actions.isPending(event.id)}
              error={actions.errorFor(event.id)}
              onPublish={actions.publish}
              onUnpublish={actions.unpublish}
              onEdit={actions.edit}
            />
          ))}
        </div>
      )}
    </div>
  );
}
