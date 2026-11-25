import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { EventSnapshot, OrderStatus, Ticket, TicketStatus } from '../../api/orders';
import { DateTimeRangeText } from '../../components/DateTimeText';
import { StatusBadge, type StatusTone } from '../../components/StatusBadge';
import { paths } from '../../routes';

const TICKET_TONES: Record<TicketStatus, StatusTone> = {
  valid: 'success',
  checked_in: 'info',
  cancelled: 'danger',
  refunded: 'neutral',
};

const ORDER_TONES: Record<OrderStatus, StatusTone> = {
  paid: 'success',
  confirmed: 'success',
  partially_refunded: 'warning',
  refunded: 'neutral',
  cancelled: 'danger',
};

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const { t } = useTranslation();
  return <StatusBadge tone={TICKET_TONES[status]}>{t(`tickets.status.${status}`)}</StatusBadge>;
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useTranslation();
  return <StatusBadge tone={ORDER_TONES[status]}>{t(`orders.status.${status}`)}</StatusBadge>;
}

/** Event title, date range in the event's zone, and venue. */
export function EventSummaryLine({ event, as: Heading = 'p' }: { event: EventSnapshot; as?: 'p' | 'h2' | 'h3' }) {
  return (
    <div className="order-event">
      <Heading className="order-event__title">{event.title}</Heading>
      <p className="label-muted order-event__meta">
        <DateTimeRangeText start={event.startsAt} end={event.endsAt} timeZone={event.timeZone} showZone />
        <br />
        {event.venue.name}, {event.venue.city}
      </p>
    </div>
  );
}

/** A ticket in a list: type, attendee, status and a link to the full ticket with its QR. */
export function TicketListItem({ ticket, showEvent = false }: { ticket: Ticket; showEvent?: boolean }) {
  const { t } = useTranslation();
  const titleId = `ticket-item-${ticket.id}`;
  return (
    <li className="panel ticket-item" aria-labelledby={titleId}>
      {showEvent && <EventSummaryLine event={ticket.event} as="h3" />}
      <div className="ticket-item__row">
        <div>
          <p id={titleId} className="ticket-item__name">
            {ticket.ticketTypeName} · {ticket.attendeeName}
          </p>
          <p className="label-muted ticket-item__id">{ticket.id}</p>
        </div>
        <TicketStatusBadge status={ticket.status} />
      </div>
      <Link
        to={paths.ticket(ticket.id)}
        className="btn btn--small"
        aria-label={t('tickets.viewLabel', { type: ticket.ticketTypeName, name: ticket.attendeeName })}
      >
        {t('tickets.view')}
      </Link>
    </li>
  );
}
