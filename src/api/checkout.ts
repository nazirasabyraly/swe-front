/*
 * Checkout API client (SRS 4.4, 4.6). Backend: POST /orders, POST /orders/:id/pay,
 * POST /orders/:id/register-free, POST /orders/:id/cancel.
 *
 * The backend has no separate reservation: an order is created with every attendee and
 * holds the tickets until `reserved_until`. Attendee names are entered after the app
 * "reserves", so the reservation is kept in this browser tab (priced by the server's ticket
 * prices) and the order is created on confirm. Each attendee gets the buyer's email.
 * A declined payment keeps the order, and retrying pays the same order again.
 */
import { fromDto as eventFromDto, type EventDto } from './events';
import { ApiError, fromMinor, json, orderNumber, request } from './http';
import type { OrderDto } from './orders';
import { httpPublicEventsApi, type Quote, type QuoteItem } from './publicEvents';

export type ReservationStatus = 'held' | 'expired' | 'cancelled' | 'completed';

export interface Reservation {
  id: string;
  status: ReservationStatus;
  /** Inventory is released at this moment unless the order is completed. */
  expiresAt: Date;
  event: {
    id: string;
    title: string;
    startsAt: Date;
    endsAt: Date;
    timeZone: string;
    venue: { name: string; city: string };
    refundPolicy: string;
  };
  quote: Quote;
  /** True while payments are simulated; the UI labels every payment step SIMULATION. */
  paymentsSimulated: boolean;
  /** Set once `status` is `completed`. */
  orderId?: string;
  /** Assigned seating: the held seats, in ticket order. */
  seats?: { seatId: string; ticketTypeId: string; section: string; row: string; seat: string }[];
}

export interface Attendee {
  /** One entry per ticket, in the order of `quote.lines` expanded by quantity. */
  ticketTypeId: string;
  name: string;
}

export interface OrderSummary {
  id: string;
  /** Human-friendly order number, e.g. "BF-7K2Q9D". */
  number: string;
  eventId: string;
  /** `confirmed` for free orders, `paid` for paid ones. */
  status: 'paid' | 'confirmed';
  total: number;
  ticketCount: number;
  paymentsSimulated: boolean;
  createdAt: Date;
}

export const CHECKOUT_ERRORS = {
  expired: 'reservation_expired',
  notHeld: 'reservation_not_held',
  declined: 'payment_declined',
  insufficientInventory: 'sold_out',
} as const;

/** Simulation only: lets a demo show the failure path. Ignored by a real payment provider. */
export type SimulatedOutcome = 'success' | 'declined';

export interface CheckoutApi {
  /** Holds the tickets and prices them. Fails with promo, inventory or limit errors. */
  createReservation(eventId: string, items: QuoteItem[], promoCode: string | null): Promise<Reservation>;
  getReservation(id: string): Promise<Reservation>;
  /** Releases the held tickets straight away. */
  cancelReservation(id: string): Promise<Reservation>;
  /**
   * Pays (or, for a zero total, registers) and issues tickets. A declined payment leaves the
   * reservation held until it expires and creates no tickets.
   */
  confirmReservation(id: string, attendees: Attendee[], simulatedOutcome?: SimulatedOutcome): Promise<OrderSummary>;
}

/** Matches the backend's `reservation_ttl_minutes`. */
const HOLD_MINUTES = 10;
const STORAGE_PREFIX = 'biletflow.reservation.';

interface StoredReservation extends Omit<Reservation, 'expiresAt' | 'event'> {
  expiresAt: string;
  event: Omit<Reservation['event'], 'startsAt' | 'endsAt'> & { startsAt: string; endsAt: string };
  items: QuoteItem[];
  promoCode: string | null;
}

function save(r: StoredReservation) {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + r.id, JSON.stringify(r));
  } catch {
    // Storage blocked: the reservation only lives until the page is reloaded.
  }
  memory.set(r.id, r);
}

const memory = new Map<string, StoredReservation>();

function load(id: string): StoredReservation {
  let stored = memory.get(id);
  if (!stored) {
    try {
      const raw = sessionStorage.getItem(STORAGE_PREFIX + id);
      if (raw) stored = JSON.parse(raw) as StoredReservation;
    } catch {
      // ignore
    }
  }
  if (!stored) throw new ApiError(404, { code: 'reservation_not_found', serverMessage: 'Reservation not found' });
  return stored;
}

function toReservation(r: StoredReservation): Reservation {
  const { items: _items, promoCode: _promoCode, ...rest } = r;
  const expiresAt = new Date(r.expiresAt);
  const status = r.status === 'held' && expiresAt < new Date() ? 'expired' : r.status;
  return {
    ...rest,
    status,
    expiresAt,
    event: { ...r.event, startsAt: new Date(r.event.startsAt), endsAt: new Date(r.event.endsAt) },
  };
}

interface PaymentDto {
  status: 'initiated' | 'succeeded' | 'failed';
  failureReason: string | null;
}

const orderPath = (id: string) => `/orders/${encodeURIComponent(id)}`;

export const httpCheckoutApi: CheckoutApi = {
  async createReservation(eventId, items, promoCode) {
    const [quote, eventDto] = await Promise.all([
      httpPublicEventsApi.quote(eventId, items, promoCode),
      request<EventDto>(`/events/${encodeURIComponent(eventId)}`),
    ]);
    const event = eventFromDto(eventDto);
    const stored: StoredReservation = {
      id: crypto.randomUUID(),
      status: 'held',
      expiresAt: new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString(),
      event: {
        id: event.id,
        title: event.title,
        startsAt: event.startsAt.toISOString(),
        endsAt: event.endsAt.toISOString(),
        timeZone: event.timeZone,
        venue: { name: event.venue.name, city: event.venue.city },
        refundPolicy: event.refundPolicy,
      },
      quote,
      paymentsSimulated: true,
      items,
      promoCode,
    };
    save(stored);
    return toReservation(stored);
  },
  async getReservation(id) {
    return toReservation(load(id));
  },
  async cancelReservation(id) {
    const stored = load(id);
    if (stored.orderId && stored.status === 'held') {
      await request(`${orderPath(stored.orderId)}/cancel`, { method: 'POST' });
    }
    if (stored.status === 'held') stored.status = 'cancelled';
    save(stored);
    return toReservation(stored);
  },
  async confirmReservation(id, attendees, simulatedOutcome) {
    const stored = load(id);
    if (toReservation(stored).status !== 'held') {
      throw new ApiError(409, { code: CHECKOUT_ERRORS.expired, serverMessage: 'The reservation has expired' });
    }

    let order: OrderDto;
    if (stored.orderId) {
      order = await request<OrderDto>(orderPath(stored.orderId));
    } else {
      const me = await request<{ email: string }>('/me');
      // Backend wants attendees in item order, one per ticket — the same order the app uses.
      order = await request<OrderDto>(
        '/orders',
        json('POST', {
          eventId: stored.event.id,
          items: stored.items.map(({ ticketTypeId, quantity }) => ({ ticketTypeId, quantity })),
          attendees: attendees.map((a) => ({ fullName: a.name, email: me.email })),
          promoCode: stored.promoCode ?? undefined,
        }),
      );
      stored.orderId = order.id;
      if (order.reservedUntil) stored.expiresAt = order.reservedUntil;
      save(stored);
    }

    if (order.status === 'pending') {
      if (order.totalMinor === 0) {
        order = await request<OrderDto>(`${orderPath(order.id)}/register-free`, { method: 'POST' });
      } else {
        const simulate = simulatedOutcome === 'declined' ? 'fail' : 'success';
        const payment = await request<PaymentDto>(`${orderPath(order.id)}/pay`, json('POST', { simulate }));
        if (payment.status !== 'succeeded') {
          throw new ApiError(402, {
            code: CHECKOUT_ERRORS.declined,
            serverMessage: payment.failureReason ?? 'The payment was declined',
          });
        }
        order = await request<OrderDto>(orderPath(order.id));
      }
    }

    stored.status = 'completed';
    save(stored);
    return {
      id: order.id,
      number: orderNumber(order.id),
      eventId: order.eventId,
      status: order.totalMinor === 0 ? 'confirmed' : 'paid',
      total: fromMinor(order.totalMinor),
      ticketCount: order.items.length,
      paymentsSimulated: true,
      createdAt: new Date(order.createdAt),
    };
  },
};

/** Expands quote lines into one slot per ticket, for per-ticket attendee names. */
export function ticketSlots(quote: Quote): { ticketTypeId: string; name: string; index: number }[] {
  return quote.lines.flatMap((line) =>
    Array.from({ length: line.quantity }, (_, index) => ({ ticketTypeId: line.ticketTypeId, name: line.name, index })),
  );
}
