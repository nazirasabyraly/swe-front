import type { OrganizerEvent } from '../../api/events';
import { VISIBILITY_OPTIONS } from '../create-event/CreateEventForm';
import { formatEventDateTime, formatNumber } from '../create-event/format';

interface EventCardProps {
  event: OrganizerEvent;
  pending: boolean;
  error?: string;
  onPublish: (id: string) => void;
  onUnpublish: (id: string) => void;
  onEdit: (id: string) => void;
}

/** One event in "My events", styled after the Discover cards (prototype screen 1). */
export function EventCard({ event, pending, error, onPublish, onUnpublish, onEdit }: EventCardProps) {
  const published = event.status === 'published';
  const titleId = `event-card-${event.id}-title`;

  return (
    <article className="event-card" aria-labelledby={titleId}>
      <div className="event-card__media placeholder-stripes">
        {event.imageUrls[0] && <img src={event.imageUrls[0]} alt="" />}
        <span className={published ? 'event-card__status' : 'event-card__status event-card__status--draft'}>
          {published ? 'Published' : 'Draft'}
        </span>
      </div>

      <div className="event-card__body">
        <p className="eyebrow">{event.category}</p>
        <h2 id={titleId} className="event-card__title">
          {event.title}
        </h2>
        <p className="event-card__meta">
          {formatEventDateTime(event.startsAt)}
          <br />
          {event.venue.name}, {event.venue.city}
        </p>
        <p className="label-muted">
          {VISIBILITY_OPTIONS[event.visibility].label} · Capacity {formatNumber(event.capacity)}
        </p>

        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}

        <div className="event-card__actions">
          <button
            type="button"
            className="btn"
            onClick={() => onEdit(event.id)}
            disabled={pending}
            aria-label={`Edit ${event.title}`}
          >
            Edit
          </button>
          {published ? (
            <button
              type="button"
              className="btn"
              onClick={() => onUnpublish(event.id)}
              disabled={pending}
              aria-label={`Unpublish ${event.title}`}
            >
              {pending ? 'Unpublishing…' : 'Unpublish'}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => onPublish(event.id)}
              disabled={pending}
              aria-label={`Publish ${event.title}`}
            >
              {pending ? 'Publishing…' : 'Publish'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
