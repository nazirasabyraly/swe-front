/*
 * The signed-in user's orders and tickets (SRS 4.7). Backend: GET /me/orders, GET /orders/:id,
 * GET /me/tickets, GET /tickets/:id (+ /qr.png, /pdf). Card details never appear here.
 *
 * The QR image and PDF need the bearer token, so a single ticket loads them into object URLs.
 * Pending orders (checkout still in progress) are left out of the list.
 */
import { splitAddress, type EventDto } from './events';
import { fromMinor, objectUrl, orderNumber, request, type Page } from './http';

export type OrderStatus = 'paid' | 'confirmed' | 'partially_refunded' | 'refunded' | 'cancelled';
export type TicketStatus = 'valid' | 'checked_in' | 'cancelled' | 'refunded';

export interface EventSnapshot {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
  venue: { name: string; address: string; city: string };
}

export interface Ticket {
  /** The one ticket identifier, shared by the digital and printed copies (SRS 4.7). */
  id: string;
  orderId: string;
  orderNumber: string;
  event: EventSnapshot;
  ticketTypeName: string;
  attendeeName: string;
  /** Assigned seating (SRS 4.3.1); null for general admission. */
  seat: { section: string; row: string; seat: string } | null;
  status: TicketStatus;
  checkedInAt?: Date;
  /** Server-generated QR (SVG) with a signed token. Omitted for cancelled and refunded tickets. */
  qrImageUrl: string | null;
  /** Print-optimized PDF, served as a download. */
  pdfUrl: string;
}

export interface OrderListItem {
  id: string;
  number: string;
  status: OrderStatus;
  event: EventSnapshot;
  total: number;
  ticketCount: number;
  paymentsSimulated: boolean;
  createdAt: Date;
}

export interface Order extends OrderListItem {
  lines: { ticketTypeId: string; name: string; quantity: number; unitPrice: number; lineTotal: number }[];
  subtotal: number;
  discount: number;
  promoCode: string | null;
  fee: number;
  /** Only the method label, e.g. "Simulated card"; never card numbers. */
  paymentMethod: string | null;
  tickets: Ticket[];
}

export interface OrdersApi {
  listMyOrders(): Promise<OrderListItem[]>;
  getMyOrder(id: string): Promise<Order>;
  listMyTickets(): Promise<Ticket[]>;
  getMyTicket(id: string): Promise<Ticket>;
}

// ---- Wire format (backend schemas, after camelCasing) ----

export type BackendOrderStatus = 'pending' | 'paid' | 'cancelled' | 'refunded' | 'expired';

export interface OrderItemDto {
  id: string;
  ticketTypeId: string;
  ticketTypeName: string;
  unitPriceMinor: number;
  section: string | null;
  rowLabel: string | null;
  seatNumber: string | null;
  attendeeName: string | null;
  attendeeEmail: string | null;
  ticketId: string | null;
}

export interface OrderDto {
  id: string;
  eventId: string;
  eventTitle: string;
  buyerUserId: string;
  status: BackendOrderStatus;
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  feesMinor: number;
  totalMinor: number;
  promoCode: string | null;
  reservedUntil: string | null;
  paidAt: string | null;
  createdAt: string;
  items: OrderItemDto[];
}

export interface TicketDto {
  id: string;
  ticketCode: string;
  qrPayload: string;
  status: TicketStatus;
  issuedAt: string;
  checkedInAt: string | null;
  ticketTypeName: string;
  attendeeName: string;
  attendeeEmail: string;
  section: string | null;
  rowLabel: string | null;
  seatNumber: string | null;
  orderId: string;
  event: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
    locationName: string | null;
    locationAddress: string | null;
  };
  pdfUrl: string;
}

/** Backend status -> app status. A paid order with a zero total is a free registration. */
export function orderStatus(dto: Pick<OrderDto, 'status' | 'totalMinor'>): OrderStatus {
  if (dto.status === 'paid') return dto.totalMinor === 0 ? 'confirmed' : 'paid';
  if (dto.status === 'refunded') return 'refunded';
  return 'cancelled';
}

export const seatOf = (x: { section: string | null; rowLabel: string | null; seatNumber: string | null }) =>
  x.section ? { section: x.section, row: x.rowLabel ?? '', seat: x.seatNumber ?? '' } : null;

const snapshot = (e: TicketDto['event']): EventSnapshot => ({
  id: e.id,
  title: e.title,
  startsAt: new Date(e.startsAt),
  endsAt: new Date(e.endsAt),
  timeZone: e.timezone,
  venue: { name: e.locationName ?? '', ...splitAddress(e.locationAddress) },
});

export const ticketFromDto = (dto: TicketDto): Ticket => ({
  id: dto.id,
  orderId: dto.orderId,
  orderNumber: orderNumber(dto.orderId),
  event: snapshot(dto.event),
  ticketTypeName: dto.ticketTypeName,
  attendeeName: dto.attendeeName,
  seat: seatOf(dto),
  status: dto.status,
  checkedInAt: dto.checkedInAt ? new Date(dto.checkedInAt) : undefined,
  // Filled in by getMyTicket, which loads the protected files.
  qrImageUrl: null,
  pdfUrl: '',
});

/** The order only names its event; the snapshot comes from the event, or from the order if it's gone. */
async function eventSnapshot(order: OrderDto): Promise<EventSnapshot> {
  try {
    const e = await request<EventDto>(`/events/${encodeURIComponent(order.eventId)}`);
    return snapshot(e);
  } catch {
    const at = new Date(order.createdAt);
    return { id: order.eventId, title: order.eventTitle, startsAt: at, endsAt: at, timeZone: 'Asia/Almaty', venue: { name: '', address: '', city: '' } };
  }
}

const listItem = (dto: OrderDto, event: EventSnapshot): OrderListItem => ({
  id: dto.id,
  number: orderNumber(dto.id),
  status: orderStatus(dto),
  event,
  total: fromMinor(dto.totalMinor),
  ticketCount: dto.items.length,
  paymentsSimulated: true,
  createdAt: new Date(dto.createdAt),
});

/** Order items are one per ticket; the app shows one line per ticket type. */
export function orderLines(items: OrderItemDto[]): Order['lines'] {
  const lines = new Map<string, Order['lines'][number]>();
  for (const item of items) {
    const unitPrice = fromMinor(item.unitPriceMinor);
    const line = lines.get(item.ticketTypeId) ?? { ticketTypeId: item.ticketTypeId, name: item.ticketTypeName, quantity: 0, unitPrice, lineTotal: 0 };
    line.quantity += 1;
    line.lineTotal += unitPrice;
    lines.set(item.ticketTypeId, line);
  }
  return [...lines.values()];
}

const one = (path: string, id: string) => `${path}/${encodeURIComponent(id)}`;

async function getMyTicket(id: string): Promise<Ticket> {
  const ticket = ticketFromDto(await request<TicketDto>(one('/tickets', id)));
  const usable = ticket.status === 'valid' || ticket.status === 'checked_in';
  if (!usable) return ticket;
  const [qrImageUrl, pdfUrl] = await Promise.all([
    objectUrl(`${one('/tickets', id)}/qr.png`),
    objectUrl(`${one('/tickets', id)}/pdf`),
  ]);
  return { ...ticket, qrImageUrl, pdfUrl };
}

export const httpOrdersApi: OrdersApi = {
  async listMyOrders() {
    const page = await request<Page<OrderDto>>('/me/orders?limit=100');
    const orders = page.items.filter((o) => o.status !== 'pending');
    const events = new Map<string, Promise<EventSnapshot>>();
    for (const o of orders) if (!events.has(o.eventId)) events.set(o.eventId, eventSnapshot(o));
    return Promise.all(orders.map(async (o) => listItem(o, await events.get(o.eventId)!)));
  },
  async getMyOrder(id) {
    const dto = await request<OrderDto>(one('/orders', id));
    const ticketIds = dto.items.map((i) => i.ticketId).filter((t): t is string => !!t);
    const [event, tickets] = await Promise.all([
      eventSnapshot(dto),
      Promise.all(ticketIds.map(async (t) => ticketFromDto(await request<TicketDto>(one('/tickets', t))))),
    ]);
    return {
      ...listItem(dto, event),
      lines: orderLines(dto.items),
      subtotal: fromMinor(dto.subtotalMinor),
      discount: fromMinor(dto.discountMinor),
      promoCode: dto.promoCode,
      fee: fromMinor(dto.feesMinor),
      paymentMethod: dto.status !== 'pending' && dto.totalMinor > 0 ? 'Simulated card' : null,
      tickets,
    };
  },
  async listMyTickets() {
    return (await request<Page<TicketDto>>('/me/tickets?limit=100')).items.map(ticketFromDto);
  },
  getMyTicket,
};
