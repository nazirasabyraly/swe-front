import { useTranslation } from 'react-i18next';
import type { PublicEvent } from '../../api/publicEvents';
import { DateTimeRangeText } from '../../components/DateTimeText';

/**
 * Main column of the public event page (prototype screen 2). Same markup and classes as the
 * organizer's EventPreview, so the preview and the real page look identical.
 */
export function EventDetails({ event, titleId }: { event: PublicEvent; titleId?: string }) {
  const { t } = useTranslation();
  const [, ...galleryUrls] = event.imageUrls;
  const venueLine = [event.venue.name, event.venue.city].join(', ');
  const paragraphs = event.description.split(/\n\s*\n/).filter((p) => p.trim());

  return (
    <div className="event-page__main">
      <p className="eyebrow">{t(`category.${event.category}`)}</p>
      <h1 id={titleId} className="event-page__title">{event.title}</h1>

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
            {event.venue.address && <span className="event-page__address">{event.venue.address}</span>}
          </dd>
        </div>
        <div>
          <dt className="label-muted">{t('eventPage.organizer')}</dt>
          <dd>{event.organizerName}</dd>
        </div>
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
  );
}
