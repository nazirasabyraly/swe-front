import { CHECKOUT_ERRORS, ticketSlots, type CheckoutApi, type OrderSummary, type Reservation } from '../checkout';
import type { PublicEventsApi } from '../publicEvents';
import type { Order } from '../orders';
import { mockSessionUserId } from './mockAuth';
import type { MockCampaignsApi } from './mockCampaigns';
import type { MockNotificationsApi } from './mockNotifications';
import type { MockSeatingApi } from './mockSeating';
import { seatLabel } from '../seating';
import { mockTicketId, withMockAssets, type MockOrdersApi } from './mockOrders';
import type { MockTicketTypesApi } from './mockTicketTypes';
import { mockDelay, mockError, mockId } from './util';

/**
 * In-browser stand-in for the checkout endpoints. Holds move tickets to "reserved", payment moves
 * them to "sold", and expiry or cancellation releases them. Payments are always simulated.
 */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const orderNumber = () => `BF-${Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')}`;

interface Deps {
  publicEvents: PublicEventsApi;
  ticketTypes: MockTicketTypesApi;
  campaigns: MockCampaignsApi;
  orders: MockOrdersApi;
  notifications?: MockNotificationsApi;
  seating?: MockSeatingApi;
}

interface Options {
  /** How long tickets are held. */
  holdMs?: number;
  now?: () => Date;
}

export function createMockCheckoutApi(deps: Deps, { holdMs = 10 * 60 * 1000, now = () => new Date() }: Options = {}): CheckoutApi {
  const reservations = new Map<string, Reservation>();

  async function release(reservation: Reservation) {
    deps.seating?.release(reservation.id);
    for (const line of reservation.quote.lines) {
      // Organizer-owned types only; other organizers' demo events have no inventory store.
      await deps.ticketTypes.adjustCounts(reservation.event.id, line.ticketTypeId, { reserved: -line.quantity }).catch(() => {});
    }
  }

  /** Applies expiry lazily, the way the server would on read. */
  async function current(id: string): Promise<Reservation> {
    const reservation = reservations.get(id);
    if (!reservation) throw mockError(404, 'reservation_not_found', 'This checkout no longer exists.');
    if (reservation.status === 'held' && now() >= reservation.expiresAt) {
      reservation.status = 'expired';
      await release(reservation);
    }
    return reservation;
  }

  return {
    async createReservation(eventId, items, promoCode) {
      await mockDelay();
      const event = await deps.publicEvents.getPublicEvent(eventId);
      // The quote validates availability, limits and the promo code.
      const quote = await deps.publicEvents.quote(eventId, items, promoCode);
      if (quote.lines.length === 0) throw mockError(422, 'empty_order', 'Choose at least one ticket.');
      const id = mockId('res');
      const seatIds = items.flatMap((i) => i.seatIds ?? []);
      let seats: Reservation['seats'];
      if (seatIds.length) {
        if (!deps.seating) throw mockError(409, 'seat_unavailable', 'Seat selection isn’t available.');
        if (items.some((i) => i.seatIds && i.seatIds.length !== i.quantity)) throw mockError(422, 'seat_count_mismatch', 'Choose one seat per ticket.');
        await deps.seating.hold(eventId, seatIds, id); // throws if any seat was just taken
        const map = await deps.seating.getSeatMap(eventId);
        seats = items.flatMap((i) =>
          (i.seatIds ?? []).map((seatId) => ({ seatId, ticketTypeId: i.ticketTypeId, ...seatLabel(map, seatId)! })),
        );
      }
      for (const line of quote.lines) {
        await deps.ticketTypes.adjustCounts(eventId, line.ticketTypeId, { reserved: line.quantity }).catch(() => {});
      }
      const reservation: Reservation = {
        id,
        seats,
        status: 'held',
        expiresAt: new Date(now().getTime() + holdMs),
        event: {
          id: event.id,
          title: event.title,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          timeZone: event.timeZone,
          venue: { name: event.venue.name, city: event.venue.city },
          refundPolicy: event.refundPolicy,
        },
        quote,
        paymentsSimulated: true,
      };
      reservations.set(reservation.id, reservation);
      return structuredClone(reservation);
    },

    async getReservation(id) {
      await mockDelay();
      return structuredClone(await current(id));
    },

    async cancelReservation(id) {
      await mockDelay();
      const reservation = await current(id);
      if (reservation.status === 'held') {
        reservation.status = 'cancelled';
        await release(reservation);
      }
      return structuredClone(reservation);
    },

    async confirmReservation(id, attendees, simulatedOutcome = 'success') {
      await mockDelay(600);
      const reservation = await current(id);
      if (reservation.status === 'expired') {
        throw mockError(409, CHECKOUT_ERRORS.expired, 'Your reservation expired and the tickets were released.');
      }
      if (reservation.status !== 'held') {
        throw mockError(409, CHECKOUT_ERRORS.notHeld, 'This checkout is already closed.');
      }
      const slots = ticketSlots(reservation.quote);
      if (attendees.length !== slots.length || attendees.some((a) => !a.name.trim())) {
        throw mockError(422, 'attendees_invalid', 'Enter a name for every ticket.');
      }
      const { quote } = reservation;
      if (quote.total > 0 && simulatedOutcome === 'declined') {
        // No tickets, inventory stays held until expiry so the attendee can retry.
        deps.notifications?.notify(mockSessionUserId() ?? 'anonymous', {
          type: 'payment_failed',
          title: `Payment failed for ${reservation.event.title}`,
          body: 'The simulated card was declined. No money moved and no tickets were issued.',
          link: `/checkout/${reservation.id}`,
        });
        throw mockError(402, CHECKOUT_ERRORS.declined, 'The simulated card was declined. No money moved and no tickets were issued.');
      }

      for (const line of quote.lines) {
        await deps.ticketTypes
          .adjustCounts(reservation.event.id, line.ticketTypeId, { reserved: -line.quantity, sold: line.quantity })
          .catch(() => {});
      }
      const soldSeats = deps.seating?.sell(reservation.id) ?? [];
      if (quote.promoCode) {
        await deps.campaigns.recordRedemption(reservation.event.id, quote.promoCode, {
          tickets: slots.length,
          gross: quote.subtotal,
          discount: quote.discount,
        });
      }
      const order: OrderSummary = {
        id: mockId('ord'),
        number: orderNumber(),
        eventId: reservation.event.id,
        status: quote.total > 0 ? 'paid' : 'confirmed',
        total: quote.total,
        ticketCount: slots.length,
        paymentsSimulated: true,
        createdAt: now(),
      };
      // Seats go to tickets of their ticket type, in the order they were chosen.
      const remainingSeats = [...soldSeats];
      const takeSeat = (ticketTypeId: string) => {
        const index = remainingSeats.findIndex((s) => s.ticketTypeId === ticketTypeId);
        if (index < 0) return null;
        const [s] = remainingSeats.splice(index, 1);
        return { section: s.section, row: s.row, seat: s.seat };
      };
      // The full order and its tickets, as /api/me/orders will return them.
      const publicEvent = await deps.publicEvents.getPublicEvent(reservation.event.id);
      const event = {
        id: publicEvent.id,
        title: publicEvent.title,
        startsAt: publicEvent.startsAt,
        endsAt: publicEvent.endsAt,
        timeZone: publicEvent.timeZone,
        venue: publicEvent.venue,
      };
      const full: Order = {
        id: order.id,
        number: order.number,
        status: order.status,
        event,
        total: quote.total,
        ticketCount: slots.length,
        paymentsSimulated: true,
        createdAt: order.createdAt,
        lines: quote.lines,
        subtotal: quote.subtotal,
        discount: quote.discount,
        promoCode: quote.promoCode,
        fee: quote.fee,
        paymentMethod: quote.total > 0 ? 'Simulated card' : null,
        tickets: slots.map((slot, i) =>
          withMockAssets({
            id: mockTicketId(),
            orderId: order.id,
            orderNumber: order.number,
            event,
            ticketTypeName: slot.name,
            attendeeName: attendees[i].name.trim(),
            seat: takeSeat(slot.ticketTypeId),
            status: 'valid',
          }),
        ),
      };
      deps.orders.addOrder(mockSessionUserId() ?? 'anonymous', full);
      deps.notifications?.notify(mockSessionUserId() ?? 'anonymous', {
        type: 'order_confirmed',
        title: order.status === 'paid' ? `Order ${order.number} confirmed` : `Registered: ${event.title}`,
        body: `${slots.length} ticket(s) for ${event.title}. They’re in My tickets and your email.`,
        link: `/orders/${order.id}`,
      });
      reservation.status = 'completed';
      reservation.orderId = order.id;
      return structuredClone(order);
    },

  };
}
