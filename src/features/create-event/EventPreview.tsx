import { formatEventDateTime, formatNumber } from './format';
import type { CreateEventInput } from './types';
import { useObjectUrls } from './useObjectUrls';

interface EventPreviewProps {
  event: CreateEventInput;
  organizerName?: string;
}

/** The attendee-facing event page (prototype screen 2), rendered from unsaved data. */
export function EventPreview({ event, organizerName }: EventPreviewProps) {
  const imageUrls = useObjectUrls(event.images);
  const [coverUrl, ...galleryUrls] = imageUrls;
  const venueLine = [event.venue.name, event.venue.city].join(', ');
  const paragraphs = event.description.split(/\n\s*\n/).filter((p) => p.trim());

  return (
    <article className="event-page" aria-label="Event preview">
      <div className="event-page__banner placeholder-stripes">
        {coverUrl && <img src={coverUrl} alt={`Cover image for ${event.title}`} />}
      </div>

      <div className="event-page__layout">
        <div className="event-page__main">
          <p className="eyebrow">{event.category}</p>
          <h1 className="event-page__title">{event.title}</h1>

          <dl className="event-page__facts">
            <div>
              <dt className="label-muted">Date and time</dt>
              <dd>{formatEventDateTime(event.startsAt)}</dd>
            </div>
            <div>
              <dt className="label-muted">Venue</dt>
              <dd>
                {venueLine}
                {event.venue.address && (
                  <span className="event-page__address">{event.venue.address}</span>
                )}
              </dd>
            </div>
            {organizerName && (
              <div>
                <dt className="label-muted">Organizer</dt>
                <dd>{organizerName}</dd>
              </div>
            )}
          </dl>

          <h2 className="event-page__section-title">About this event</h2>
          {paragraphs.map((paragraph, i) => (
            <p key={i} className="event-page__paragraph">
              {paragraph}
            </p>
          ))}

          {galleryUrls.length > 0 && (
            <div className="event-page__gallery">
              {galleryUrls.map((url, i) => (
                <img key={url} src={url} alt={`${event.title} photo ${i + 2}`} />
              ))}
            </div>
          )}
        </div>

        <aside className="card event-page__sidebar" aria-label="Registration">
          <h2 className="card__title">Registration</h2>
          <dl className="event-page__registration">
            <div>
              <dt className="label-muted">Opens</dt>
              <dd>{formatEventDateTime(event.registrationOpensAt)}</dd>
            </div>
            <div>
              <dt className="label-muted">Closes</dt>
              <dd>{formatEventDateTime(event.registrationClosesAt)}</dd>
            </div>
            <div>
              <dt className="label-muted">Capacity</dt>
              <dd>{`${formatNumber(event.capacity)} spots`}</dd>
            </div>
          </dl>
          <button type="button" className="btn btn--primary event-page__cta" disabled>
            Register
          </button>
          <p className="label-muted event-page__cta-note">
            Ticket types will appear here once they are added.
          </p>
        </aside>
      </div>
    </article>
  );
}
