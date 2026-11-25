import { TICKET_TYPE_ERRORS, type TicketType, type TicketTypeInput, type TicketTypesApi } from '../ticketTypes';
import type { EventsApi } from '../events';
import { mockDelay, mockError, mockId } from './util';

/** In-browser stand-in for the ticket type endpoints. Counters only change through these calls. */

type SeedType = Omit<TicketType, 'id' | 'eventId' | 'salesStartAt' | 'salesEndAt' | 'counts'> & {
  sold?: number;
  reserved?: number;
  checkedIn?: number;
};

/** Prototype screen 2 ticket types for the seeded "Almaty Nights" event. */
const SEED: Record<string, SeedType[]> = {
  'evt-almaty-nights': [
    { name: 'General admission', description: 'Standing floor, entry from 18:00', kind: 'paid', price: 6500, quantity: 800, maxPerOrder: 10, hidden: false, sold: 586 },
    { name: 'Fan pit', description: 'Front section, limited release', kind: 'paid', price: 12000, quantity: 120, maxPerOrder: 4, hidden: false, sold: 120 },
    { name: 'VIP balcony', description: 'Seated tier with dedicated bar', kind: 'paid', price: 18500, quantity: 200, maxPerOrder: 6, hidden: false, sold: 158, reserved: 4 },
  ],
  'evt-winter-gala': [
    { name: 'Parterre', description: 'Assigned seat in the parterre', kind: 'paid', price: 9000, quantity: 96, maxPerOrder: 6, hidden: false, sold: 20 },
    { name: 'Balcony', description: 'Assigned seat on the balcony', kind: 'paid', price: 6000, quantity: 48, maxPerOrder: 6, hidden: false, sold: 10 },
  ],
  'evt-spring-jam': [
    { name: 'Free entry', description: '', kind: 'free', price: 0, quantity: 150, maxPerOrder: 2, hidden: false, sold: 120, checkedIn: 96 },
  ],
};

interface Stored extends Omit<TicketType, 'counts'> {
  sold: number;
  reserved: number;
  refunded: number;
  checkedIn: number;
}

const withCounts = ({ sold, reserved, refunded, checkedIn, ...t }: Stored): TicketType =>
  structuredClone({
    ...t,
    counts: { available: Math.max(0, t.quantity - sold - reserved), reserved, sold, refunded, checkedIn },
  });

export interface MockTicketTypesApi extends TicketTypesApi {
  /** Mock-only: what the server does to counters when tickets are held, released or sold. */
  adjustCounts(eventId: string, id: string, delta: { reserved?: number; sold?: number; refunded?: number }): Promise<void>;
}

export function createMockTicketTypesApi(events: EventsApi, seed = SEED): MockTicketTypesApi {
  const store = new Map<string, Stored[]>();
  const seeded = new Set<string>();

  async function typesOf(eventId: string): Promise<Stored[]> {
    const event = await events.getEvent(eventId); // 404s like the real API for unknown events
    if (!seeded.has(eventId)) {
      seeded.add(eventId);
      const initial = (seed[eventId] ?? []).map(({ sold = 0, reserved = 0, checkedIn = 0, ...t }) => ({
        ...t,
        id: mockId('tt'),
        eventId,
        salesStartAt: event.registrationOpensAt,
        salesEndAt: event.registrationClosesAt,
        sold,
        reserved,
        refunded: 0,
        checkedIn,
      }));
      store.set(eventId, initial);
    }
    return store.get(eventId)!;
  }

  async function find(eventId: string, id: string) {
    const found = (await typesOf(eventId)).find((t) => t.id === id);
    if (!found) throw mockError(404, 'ticket_type_not_found', 'Ticket type not found.');
    return found;
  }

  const normalise = (input: TicketTypeInput) => ({ ...input, price: input.kind === 'free' ? 0 : input.price });

  return {
    async listTicketTypes(eventId) {
      await mockDelay();
      return (await typesOf(eventId)).map(withCounts);
    },
    async createTicketType(eventId, input) {
      await mockDelay();
      const created: Stored = {
        ...normalise(input),
        id: mockId('tt'),
        eventId,
        hidden: false,
        sold: 0,
        reserved: 0,
        refunded: 0,
        checkedIn: 0,
      };
      (await typesOf(eventId)).push(created);
      return withCounts(created);
    },
    async updateTicketType(eventId, id, input) {
      await mockDelay();
      const found = await find(eventId, id);
      const min = found.sold + found.reserved;
      if (input.quantity < min) {
        throw mockError(409, TICKET_TYPE_ERRORS.quantityBelowSold, `Quantity can’t be lower than ${min}.`);
      }
      Object.assign(found, normalise(input));
      return withCounts(found);
    },
    async setTicketTypeHidden(eventId, id, hidden) {
      await mockDelay();
      const found = await find(eventId, id);
      found.hidden = hidden;
      return withCounts(found);
    },
    async adjustCounts(eventId, id, { reserved = 0, sold = 0, refunded = 0 }) {
      const found = await find(eventId, id);
      found.reserved += reserved;
      found.sold += sold;
      found.refunded += refunded;
    },
    async deleteTicketType(eventId, id) {
      await mockDelay();
      const found = await find(eventId, id);
      if (found.sold + found.reserved > 0) {
        throw mockError(409, TICKET_TYPE_ERRORS.hasSales, 'This ticket type has sales. Hide it instead.');
      }
      const list = await typesOf(eventId);
      list.splice(list.indexOf(found), 1);
    },
  };
}
