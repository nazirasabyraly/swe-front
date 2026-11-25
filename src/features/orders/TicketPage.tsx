import './orders.css';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useOrdersApi } from '../../api/ApiContext';
import { DateTimeRangeText, DateTimeText } from '../../components/DateTimeText';
import { ErrorState, LoadingState } from '../../components/DataStates';
import { paths } from '../../routes';
import { TicketStatusBadge } from './parts';
import { AddToCalendar } from '../../components/AddToCalendar';
import { GetHelpLink } from '../support/parts';
import { useLoad } from './useLoad';

/**
 * `/tickets/:id`: the admission ticket (SRS 4.7). The same layout prints on A4: the print stylesheet
 * hides everything but the ticket, keeps the QR large and pure black on white for grayscale printers,
 * and shows no payment details. Digital and printed copies share one ticket ID.
 */
export function TicketPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const api = useOrdersApi();
  const { state, reload } = useLoad(() => api.getMyTicket(id), [api, id]);

  if (state.status === 'loading') return <LoadingState label={t('tickets.loadingOne')} />;
  if (state.status === 'error') return <ErrorState title={t('tickets.loadErrorOne')} message={state.message} onRetry={reload} />;

  const ticket = state.data;
  const { event } = ticket;
  const unusable = ticket.status === 'refunded' || ticket.status === 'cancelled';

  return (
    <div className="ticket-page">
      <Link to={paths.myTickets} className="back-link no-print">
        {t('tickets.back')}
      </Link>

      {unusable && (
        <div className="notice notice--danger ticket-page__notice no-print" role="alert">
          <strong>{ticket.status === 'refunded' ? t('tickets.unusable.refundedTitle') : t('tickets.unusable.cancelledTitle')}</strong>
          {t('tickets.unusable.body')}
        </div>
      )}
      {ticket.status === 'checked_in' && ticket.checkedInAt && (
        <p className="notice ticket-page__notice no-print" role="status">
          {t('tickets.checkedInAt')} <DateTimeText value={ticket.checkedInAt} timeZone={event.timeZone} />
        </p>
      )}

      <article className={`ticket${unusable ? ' ticket--void' : ''}`} aria-labelledby="ticket-event">
        <header className="ticket__header">
          <span className="ticket__brand">BiletFlow</span>
          <TicketStatusBadge status={ticket.status} />
        </header>

        <div className="ticket__body">
          <div className="ticket__details">
            <h1 id="ticket-event" className="ticket__event">
              {event.title}
            </h1>
            <dl className="ticket__facts">
              <div className="ticket__fact--wide">
                <dt>{t('eventPage.dateTime')}</dt>
                <dd>
                  <DateTimeRangeText start={event.startsAt} end={event.endsAt} timeZone={event.timeZone} showZone />
                </dd>
              </div>
              <div className="ticket__fact--wide">
                <dt>{t('eventPage.venue')}</dt>
                <dd>
                  {event.venue.name}, {event.venue.city}
                  {event.venue.address && <span className="ticket__address">{event.venue.address}</span>}
                </dd>
              </div>
              <div>
                <dt>{t('tickets.type')}</dt>
                <dd>{ticket.ticketTypeName}</dd>
              </div>
              <div>
                <dt>{t('tickets.attendee')}</dt>
                <dd>{ticket.attendeeName}</dd>
              </div>
              {ticket.seat && (
                <div className="ticket__fact--wide">
                  <dt>{t('tickets.seat')}</dt>
                  <dd>{t('tickets.seatValue', ticket.seat)}</dd>
                </div>
              )}
              <div>
                <dt>{t('tickets.ticketId')}</dt>
                <dd className="ticket__id">{ticket.id}</dd>
              </div>
              <div>
                <dt>{t('checkout.success.orderNumber')}</dt>
                <dd className="ticket__id">{ticket.orderNumber}</dd>
              </div>
            </dl>
          </div>

          <div className="ticket__qr">
            {ticket.qrImageUrl && !unusable ? (
              <>
                <img src={ticket.qrImageUrl} alt={t('tickets.qrAlt', { id: ticket.id })} width={220} height={220} />
                <p className="ticket__qr-note">{t('tickets.qrNote')}</p>
              </>
            ) : (
              <p className="ticket__qr-void">{t('tickets.noQr')}</p>
            )}
          </div>
        </div>
      </article>

      <div className="ticket-page__calendar no-print">
        <AddToCalendar event={{ ...event, url: `${window.location.origin}${paths.publicEvent(event.id)}` }} cancelled={unusable} />
      </div>
      <div className="form-actions ticket-page__actions no-print">
        <Link to={paths.order(ticket.orderId)} className="btn">
          {t('tickets.viewOrder')}
        </Link>
        <GetHelpLink event={event.id} order={ticket.orderId} ticket={ticket.id} about={`${ticket.id} · ${event.title}`} />
        {!unusable && (
          <>
            <button type="button" className="btn" onClick={() => window.print()}>
              {t('tickets.print')}
            </button>
            <a className="btn btn--primary" href={ticket.pdfUrl} download={`biletflow-ticket-${ticket.id}.pdf`}>
              {t('tickets.downloadPdf')}
            </a>
          </>
        )}
      </div>
    </div>
  );
}
