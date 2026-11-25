/*
 * Checkout API client (SRS 4.4, 4.6). Contract: docs/backend-contract.md, "Checkout".
 * A reservation holds inventory for a short time; tickets exist only after the server
 * confirms payment (or, for free orders, registration). All amounts come from the server.
 */
import { json, request } from './http';
import type { Quote, QuoteItem } from './publicEvents';

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
  insufficientInventory: 'insufficient_inventory',
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

export interface ReservationDto extends Omit<Reservation, 'expiresAt' | 'event'> {
  expiresAt: string;
  event: Omit<Reservation['event'], 'startsAt' | 'endsAt'> & { startsAt: string; endsAt: string };
}
export type OrderSummaryDto = Omit<OrderSummary, 'createdAt'> & { createdAt: string };

export const reservationFromDto = (dto: ReservationDto): Reservation => ({
  ...dto,
  expiresAt: new Date(dto.expiresAt),
  event: { ...dto.event, startsAt: new Date(dto.event.startsAt), endsAt: new Date(dto.event.endsAt) },
});

const one = (id: string) => `/api/checkout/reservations/${encodeURIComponent(id)}`;

export const httpCheckoutApi: CheckoutApi = {
  async createReservation(eventId, items, promoCode) {
    return reservationFromDto(
      await request<ReservationDto>('/api/checkout/reservations', json('POST', { eventId, items, promoCode })),
    );
  },
  async getReservation(id) {
    return reservationFromDto(await request<ReservationDto>(one(id)));
  },
  async cancelReservation(id) {
    return reservationFromDto(await request<ReservationDto>(one(id), { method: 'DELETE' }));
  },
  async confirmReservation(id, attendees, simulatedOutcome) {
    const dto = await request<OrderSummaryDto>(`${one(id)}/confirm`, json('POST', { attendees, simulatedOutcome }));
    return { ...dto, createdAt: new Date(dto.createdAt) };
  },
};

/** Expands quote lines into one slot per ticket, for per-ticket attendee names. */
export function ticketSlots(quote: Quote): { ticketTypeId: string; name: string; index: number }[] {
  return quote.lines.flatMap((line) =>
    Array.from({ length: line.quantity }, (_, index) => ({ ticketTypeId: line.ticketTypeId, name: line.name, index })),
  );
}
