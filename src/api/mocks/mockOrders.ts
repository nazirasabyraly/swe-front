import type { EventsApi } from '../events';
import type { EventSnapshot, Order, OrdersApi, Ticket } from '../orders';
import { DEFAULT_TIME_ZONE } from '../../features/create-event/timeZones';
import { toZonedInputs, zonedDateTime } from '../../lib/timezone';
import { mockQrSvg } from './mockCampaigns';
import { mockSessionUserId } from './mockAuth';
import { mockDelay, mockError } from './util';

/**
 * In-browser stand-in for /api/me/orders and /api/me/tickets. Orders belong to the mock session's
 * user. The QR is the same "MOCK QR · NOT SCANNABLE" placeholder as campaigns, and the PDF is a
 * text-only stand-in: the real server renders both.
 */

export interface MockOrdersApi extends OrdersApi {
  /** Mock-only: checkout stores the orders it creates here. */
  addOrder(userId: string, order: Order): void;
  /** Mock-only: every order with its buyer, for organizer/admin mocks. */
  allOrders(): Promise<{ userId: string; order: Order }[]>;
  /** Mock-only: refunds or cancels a whole order, the way the server would after a refund succeeds. */
  voidOrder(orderId: string): Promise<Order | null>;
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const random = (n: number) => Array.from({ length: n }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
export const mockTicketId = () => `TK-${random(4)}-${random(4)}`;

/** A minimal one-page PDF with the ticket's text. Mock only: no QR, ASCII only. */
export function mockTicketPdf(ticket: Omit<Ticket, 'pdfUrl'>): string {
  const ascii = (s: string) => s.replace(/[—–]/g, '-').replace(/[^\x20-\x7e]/g, '?').replace(/([()\\])/g, '\\$1');
  const lines = [
    'BiletFlow ticket (MOCK PDF - the real one includes the QR code)',
    '',
    ticket.event.title,
    `${ticket.event.startsAt.toISOString()} (${ticket.event.timeZone})`,
    `${ticket.event.venue.name}, ${ticket.event.venue.city}`,
    '',
    `Ticket type: ${ticket.ticketTypeName}`,
    `Attendee: ${ticket.attendeeName}`,
    `Ticket ID: ${ticket.id}`,
    `Order: ${ticket.orderNumber}`,
  ];
  const text = lines.map((line, i) => `BT /F1 ${i === 0 ? 14 : 12} Tf 56 ${780 - i * 20} Td (${ascii(line)}) Tj ET`).join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => {
    const offset = pdf.length;
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return `data:application/pdf;base64,${btoa(pdf)}`;
}

/** Fills in the QR and PDF the server would generate. */
export function withMockAssets(ticket: Omit<Ticket, 'qrImageUrl' | 'pdfUrl'>): Ticket {
  const usable = ticket.status === 'valid' || ticket.status === 'checked_in';
  return { ...ticket, qrImageUrl: usable ? mockQrSvg(ticket.id) : null, pdfUrl: mockTicketPdf({ ...ticket, qrImageUrl: null }) };
}

const day = 24 * 60 * 60 * 1000;
const at = (days: number, time: string) => {
  const { date } = toZonedInputs(new Date(Date.now() + days * day), DEFAULT_TIME_ZONE);
  return zonedDateTime(date, time, DEFAULT_TIME_ZONE)!;
};

type OrderSeed = Omit<Order, 'tickets' | 'ticketCount' | 'event'> & {
  event: EventSnapshot;
  tickets: Omit<Ticket, 'qrImageUrl' | 'pdfUrl' | 'orderId' | 'orderNumber' | 'event'>[];
};

function build(seed: OrderSeed): Order {
  const tickets = seed.tickets.map((t) =>
    withMockAssets({ ...t, orderId: seed.id, orderNumber: seed.number, event: seed.event }),
  );
  return { ...seed, tickets, ticketCount: tickets.length };
}

/** Demo history for attendee@demo.kz: one ticket of each status. */
async function seedFor(events: EventsApi): Promise<Order[]> {
  const nights = await events.getEvent('evt-almaty-nights').catch(() => null);
  const nightsSnapshot: EventSnapshot = nights
    ? { id: nights.id, title: nights.title, startsAt: nights.startsAt, endsAt: nights.endsAt, timeZone: nights.timeZone, venue: nights.venue }
    : { id: 'evt-almaty-nights', title: 'Almaty Nights — Vol. 4', startsAt: at(18, '19:00'), endsAt: at(18, '23:00'), timeZone: DEFAULT_TIME_ZONE, venue: { name: 'Almaty Arena', address: 'Momyshuly Ave 1', city: 'Almaty' } };
  const film: EventSnapshot = {
    id: 'evt-steppe-film-spring', title: 'Steppe Film Festival — Spring Screening', startsAt: at(-40, '20:00'), endsAt: at(-40, '22:30'),
    timeZone: DEFAULT_TIME_ZONE, venue: { name: 'Kinopark 11', address: 'Abay Ave 44', city: 'Almaty' },
  };
  const jazz: EventSnapshot = {
    id: 'evt-jazz-panfilov', title: 'Jazz on Panfilov', startsAt: at(11, '17:00'), endsAt: at(11, '20:00'),
    timeZone: DEFAULT_TIME_ZONE, venue: { name: 'Panfilov Park Stage', address: 'Panfilov St', city: 'Almaty' },
  };
  return [
    build({
      id: 'ord-demo-nights', number: 'BF-NGT4A2', status: 'paid', event: nightsSnapshot, total: 20700, paymentsSimulated: true,
      createdAt: new Date(Date.now() - 3 * day), subtotal: 25000, discount: 5000, promoCode: 'STUDENT20', fee: 700, paymentMethod: 'Simulated card',
      lines: [
        { ticketTypeId: 'ga', name: 'General admission', quantity: 1, unitPrice: 6500, lineTotal: 6500 },
        { ticketTypeId: 'vip', name: 'VIP balcony', quantity: 1, unitPrice: 18500, lineTotal: 18500 },
      ],
      tickets: [
        { id: 'TK-7Q2M-K9XD', ticketTypeName: 'General admission', attendeeName: 'Demo Attendee', seat: null, status: 'valid' },
        { id: 'TK-3HWP-8RNA', ticketTypeName: 'VIP balcony', attendeeName: 'Aigerim Sadykova', seat: { section: 'Balcony B', row: '2', seat: '14' }, status: 'valid' },
      ],
    }),
    build({
      id: 'ord-demo-jazz', number: 'BF-JZZ7P3', status: 'refunded', event: jazz, total: 2070, paymentsSimulated: true,
      createdAt: new Date(Date.now() - 10 * day), subtotal: 2000, discount: 0, promoCode: null, fee: 70, paymentMethod: 'Simulated card',
      lines: [{ ticketTypeId: 'bench', name: 'Reserved bench', quantity: 1, unitPrice: 2000, lineTotal: 2000 }],
      tickets: [{ id: 'TK-5JZ2-RFND', ticketTypeName: 'Reserved bench', attendeeName: 'Demo Attendee', seat: null, status: 'refunded' }],
    }),
    build({
      id: 'ord-demo-film', number: 'BF-FLM2Q8', status: 'paid', event: film, total: 3623, paymentsSimulated: true,
      createdAt: new Date(Date.now() - 50 * day), subtotal: 3500, discount: 0, promoCode: null, fee: 123, paymentMethod: 'Simulated card',
      lines: [{ ticketTypeId: 'std', name: 'Standard seat', quantity: 1, unitPrice: 3500, lineTotal: 3500 }],
      tickets: [
        { id: 'TK-9FLM-CHKD', ticketTypeName: 'Standard seat', attendeeName: 'Demo Attendee', seat: { section: 'Hall 3', row: 'F', seat: '7' }, status: 'checked_in', checkedInAt: at(-40, '19:41') },
      ],
    }),
  ];
}

export function createMockOrdersApi(events: EventsApi, { seed = true } = {}): MockOrdersApi {
  const byUser = new Map<string, Order[]>();
  // One shared promise, so concurrent first calls (e.g. React StrictMode) all wait for the same seed.
  let seeding: Promise<void> | null = seed
    ? null
    : Promise.resolve();

  const ensureSeeded = () =>
    (seeding ??= seedFor(events).then((orders) => {
      byUser.set('usr-attendee', [...orders, ...(byUser.get('usr-attendee') ?? [])]);
    }));

  async function mine(): Promise<Order[]> {
    await ensureSeeded();
    const userId = mockSessionUserId();
    if (!userId) throw mockError(401, 'unauthenticated', 'Sign in to see your orders.');
    return byUser.get(userId) ?? [];
  }

  const summary = ({ lines: _l, subtotal: _s, discount: _d, promoCode: _p, fee: _f, paymentMethod: _m, tickets: _t, ...item }: Order) => item;

  return {
    async listMyOrders() {
      await mockDelay();
      return structuredClone((await mine()).map(summary)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async getMyOrder(id) {
      await mockDelay();
      const order = (await mine()).find((o) => o.id === id);
      if (!order) throw mockError(404, 'order_not_found', 'Order not found.');
      return structuredClone(order);
    },
    async listMyTickets() {
      await mockDelay();
      return structuredClone((await mine()).flatMap((o) => o.tickets));
    },
    async getMyTicket(id) {
      await mockDelay();
      const ticket = (await mine()).flatMap((o) => o.tickets).find((t) => t.id === id);
      if (!ticket) throw mockError(404, 'ticket_not_found', 'Ticket not found.');
      return structuredClone(ticket);
    },
    async allOrders() {
      await ensureSeeded();
      return [...byUser.entries()].flatMap(([userId, list]) => list.map((order) => ({ userId, order })));
    },
    async voidOrder(orderId) {
      await ensureSeeded();
      const order = [...byUser.values()].flat().find((o) => o.id === orderId);
      if (!order) return null;
      const free = order.total === 0;
      order.status = free ? 'cancelled' : 'refunded';
      order.tickets = order.tickets.map((t) => withMockAssets({ ...t, status: free ? 'cancelled' : 'refunded' }));
      return structuredClone(order);
    },
    addOrder(userId, order) {
      byUser.set(userId, [order, ...(byUser.get(userId) ?? [])]);
    },
  };
}
