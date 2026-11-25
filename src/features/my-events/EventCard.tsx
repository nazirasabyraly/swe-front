import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { paths } from '../../routes';
import type { OrganizerEvent } from '../../api/events';
import { useFormat } from '../../i18n/useFormat';

interface EventCardProps {
  event: OrganizerEvent;
  pending: boolean;
  error?: string;
  onPublish: (id: string) => void;
  onUnpublish: (id: string) => void;
  onEdit: (id: string) => void;
  onTickets: (id: string) => void;
  onCampaigns: (id: string) => void;
}

/** One event in "My events", styled after the Discover cards (prototype screen 1). */
export function EventCard({ event, pending, error, onPublish, onUnpublish, onEdit, onTickets, onCampaigns }: EventCardProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const published = event.status === 'published';
  const cancelled = event.status === 'cancelled';
  const statusLabel = cancelled
    ? t('myEvents.cancelled')
    : published
      ? t('myEvents.published')
      : t('myEvents.draft');
  const statusClass = cancelled ? 'cancelled' : published ? 'published' : 'draft';
  const titleId = `event-card-${event.id}-title`;

  return (
    <article className="event-card" aria-labelledby={titleId}>
      <div className="event-card__media placeholder-stripes">
        {event.imageUrls[0] && <img src={event.imageUrls[0]} alt="" />}
        <span className={`event-card__status event-card__status--${statusClass}`}>{statusLabel}</span>
      </div>

      <div className="event-card__body">
        <p className="eyebrow">{t(`category.${event.category}`)}</p>
        <h2 id={titleId} className="event-card__title">
          <Link to={paths.organizerEvent(event.id)} className="event-card__link">
            {event.title}
          </Link>
        </h2>
        <p className="event-card__meta">
          {format.dateTime(event.startsAt, event.timeZone)}
          <br />
          {event.venue.name}, {event.venue.city}
        </p>
        <p className="label-muted">
          {t('myEvents.meta', {
            visibility: t(`visibility.${event.visibility}.label`),
            capacity: format.number(event.capacity),
          })}
        </p>

        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}

        {/* Cancelled events are read-only; their history view comes with the dashboard tabs. */}
        {!cancelled && (
          <div className="event-card__actions">
            <button
              type="button"
              className="btn"
              onClick={() => onEdit(event.id)}
              disabled={pending}
              aria-label={t('myEvents.editLabel', { title: event.title })}
            >
              {t('myEvents.edit')}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => onTickets(event.id)}
              disabled={pending}
              aria-label={t('myEvents.ticketsLabel', { title: event.title })}
            >
              {t('myEvents.tickets')}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => onCampaigns(event.id)}
              disabled={pending}
              aria-label={t('myEvents.campaignsLabel', { title: event.title })}
            >
              {t('myEvents.campaigns')}
            </button>
            {published ? (
              <button
                type="button"
                className="btn"
                onClick={() => onUnpublish(event.id)}
                disabled={pending}
                aria-label={t('myEvents.unpublishLabel', { title: event.title })}
              >
                {pending ? t('myEvents.unpublishing') : t('myEvents.unpublish')}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => onPublish(event.id)}
                disabled={pending}
                aria-label={t('myEvents.publishLabel', { title: event.title })}
              >
                {pending ? t('myEvents.publishing') : t('myEvents.publish')}
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
