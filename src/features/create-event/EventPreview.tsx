import { useTranslation } from 'react-i18next';
import type { TicketType } from '../../api/ticketTypes';
import { DateTimeRangeText, DateTimeText } from '../../components/DateTimeText';
import { Money } from '../../components/Money';
import { useFormat } from '../../i18n/useFormat';
import type { CreateEventInput } from './types';

/** Event data as attendees see it; a saved `OrganizerEvent` fits this shape. */
export type PreviewEvent = Omit<CreateEventInput, 'images'> & { imageUrls: string[] };

interface EventPreviewProps {
  event: PreviewEvent;
  /** Hidden types are left out, as they are for attendees. */
  ticketTypes?: TicketType[];
  /** Whether paid tickets can be bought yet (SRS 4.5). Free tickets are unaffected. */
  paidSalesActive?: boolean;
  organizerName?: string;
}

/** The attendee-facing event page (prototype screen 2), shown to the organizer before publishing. */
export function EventPreview({ event, ticketTypes = [], paidSalesActive = false, organizerName }: EventPreviewProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const [coverUrl, ...galleryUrls] = event.imageUrls;
  const visibleTypes = ticketTypes.filter((type) => !type.hidden);
  const venueLine = [event.venue.name, event.venue.city].join(', ');
  const paragraphs = event.description.split(/\n\s*\n/).filter((p) => p.trim());

  return (
    <article className="event-page" aria-label={t('eventPage.previewLabel')}>
      <div className="event-page__banner placeholder-stripes">
        {coverUrl && <img src={coverUrl} alt={t('eventPage.coverAlt', { title: event.title })} />}
      </div>

      <div className="event-page__layout">
        <div className="event-page__main">
          <p className="eyebrow">{t(`category.${event.category}`)}</p>
          <h1 className="event-page__title">{event.title}</h1>

          <dl className="event-page__facts">
            <div>
              <dt className="label-muted">{t('eventPage.dateTime')}</dt>
              <dd>
                <DateTimeRangeText start={event.startsAt} end={event.endsAt} timeZone={event.timeZone} showZone />
              </dd>
            </div>
            <div>
              <dt className="label-muted">{t('eventPage.venue')}</dt>
              <dd>
                {venueLine}
                {event.venue.address && (
                  <span className="event-page__address">{event.venue.address}</span>
                )}
              </dd>
            </div>
            {organizerName && (
              <div>
                <dt className="label-muted">{t('eventPage.organizer')}</dt>
                <dd>{organizerName}</dd>
              </div>
            )}
          </dl>

          <h2 className="event-page__section-title">{t('eventPage.about')}</h2>
          {paragraphs.map((paragraph, i) => (
            <p key={i} className="event-page__paragraph">
              {paragraph}
            </p>
          ))}

          {event.refundPolicy && (
            <section className="panel event-page__refund" aria-labelledby="refund-policy-heading">
              <h3 id="refund-policy-heading" className="event-page__refund-title">
                {t('eventPage.refundPolicy')}
              </h3>
              <p className="event-page__paragraph">{event.refundPolicy}</p>
            </section>
          )}

          {galleryUrls.length > 0 && (
            <div className="event-page__gallery">
              {galleryUrls.map((url, i) => (
                <img key={url} src={url} alt={t('eventPage.photoAlt', { title: event.title, n: i + 2 })} />
              ))}
            </div>
          )}
        </div>

        <aside className="card event-page__sidebar" aria-label={t('eventPage.registration')}>
          <h2 className="card__title">{t('eventPage.registration')}</h2>
          <dl className="event-page__registration">
            <div>
              <dt className="label-muted">{t('eventPage.opens')}</dt>
              <dd>
                <DateTimeText value={event.registrationOpensAt} timeZone={event.timeZone} />
              </dd>
            </div>
            <div>
              <dt className="label-muted">{t('eventPage.closes')}</dt>
              <dd>
                <DateTimeText value={event.registrationClosesAt} timeZone={event.timeZone} />
              </dd>
            </div>
            <div>
              <dt className="label-muted">{t('eventPage.capacity')}</dt>
              <dd>
                {t('eventPage.spots', { count: event.capacity, formatted: format.number(event.capacity) })}
              </dd>
            </div>
          </dl>

          <h3 className="event-page__tickets-title">{t('eventPage.tickets')}</h3>
          {visibleTypes.length === 0 ? (
            <p className="label-muted">{t('eventPage.noTickets')}</p>
          ) : (
            <ul className="event-page__tickets">
              {visibleTypes.map((type) => (
                <li key={type.id} className="panel event-page__ticket">
                  <div className="event-page__ticket-head">
                    <strong>{type.name}</strong>
                    <strong className="event-page__ticket-price">
                      <Money amount={type.price} freeWhenZero />
                    </strong>
                  </div>
                  {type.description && <p className="label-muted">{type.description}</p>}
                  <p className="label-muted">
                    {type.kind === 'paid' && !paidSalesActive
                      ? t('eventPage.notOnSaleYet')
                      : type.counts.available === 0
                      ? t('eventPage.soldOut')
                      : t('eventPage.left', {
                          count: type.counts.available,
                          formatted: format.number(type.counts.available),
                        })}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn btn--primary event-page__cta" disabled>
            {t('eventPage.register')}
          </button>
        </aside>
      </div>
    </article>
  );
}
