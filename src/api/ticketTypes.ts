/*
 * Ticket type API client. Backend: app/api/v1/ticket_types.py, app/schemas/ticket_types.py.
 * Counters are computed by the server; the UI never derives inventory itself.
 *
 *   GET    /events/:eventId/ticket-types   -> TicketTypeRead[]  (organizer view includes counters)
 *   POST   /events/:eventId/ticket-types   -> TicketTypeRead
 *   PATCH  /ticket-types/:id               -> TicketTypeRead
 *   POST   /ticket-types/:id/hide|unhide   -> TicketTypeRead
 *   DELETE /ticket-types/:id
 *
 * Prices are sent in minor units (tiyn); the app works in whole tenge.
 */
import { json, request } from './http';

export type TicketKind = 'free' | 'paid';

/** Server-computed inventory counters (SRS 4.3). */
export interface TicketCounts {
  available: number;
  reserved: number;
  sold: number;
  refunded: number;
  checkedIn: number;
}

export interface TicketType {
  id: string;
  eventId: string;
  name: string;
  description: string;
  kind: TicketKind;
  /** KZT, whole tenge; 0 for free tickets. */
  price: number;
  quantity: number;
  salesStartAt: Date;
  salesEndAt: Date;
  maxPerOrder: number;
  hidden: boolean;
  counts: TicketCounts;
}

export interface TicketTypeInput {
  name: string;
  description: string;
  kind: TicketKind;
  price: number;
  quantity: number;
  salesStartAt: Date;
  salesEndAt: Date;
  maxPerOrder: number;
}

export const TICKET_TYPE_ERRORS = {
  quantityBelowSold: 'quantity_below_sold',
  hasSales: 'ticket_type_has_orders',
  priceLocked: 'price_locked',
} as const;

export interface TicketTypesApi {
  listTicketTypes(eventId: string): Promise<TicketType[]>;
  createTicketType(eventId: string, input: TicketTypeInput): Promise<TicketType>;
  updateTicketType(eventId: string, id: string, input: TicketTypeInput): Promise<TicketType>;
  /** Hidden types stay in reports and existing tickets stay valid; attendees just can't buy them. */
  setTicketTypeHidden(eventId: string, id: string, hidden: boolean): Promise<TicketType>;
  /** Only allowed while nothing is sold or reserved; otherwise hide it. */
  deleteTicketType(eventId: string, id: string): Promise<void>;
}

/** Backend `TicketTypeRead`, after camelCasing. Counters are null in the public view. */
export interface TicketTypeDto {
  id: string;
  eventId: string;
  name: string;
  description: string | null;
  kind: TicketKind;
  priceMinor: number;
  currency: string;
  quantityTotal: number;
  quantityAvailable: number;
  maxPerOrder: number;
  salesStartAt: string | null;
  salesEndAt: string | null;
  isHidden: boolean;
  onSale: boolean;
  sellable: boolean;
  quantitySold: number | null;
  quantityReserved: number | null;
  quantityRefunded: number | null;
  quantityCheckedIn: number | null;
}

const MINOR_PER_TENGE = 100;
/** Open-ended sales windows (no dates set on the server). */
export const NO_START = new Date(0);
export const NO_END = new Date(8.64e15);

export const ticketTypeFromDto = (dto: TicketTypeDto): TicketType => ({
  id: dto.id,
  eventId: dto.eventId,
  name: dto.name,
  description: dto.description ?? '',
  kind: dto.kind,
  price: dto.priceMinor / MINOR_PER_TENGE,
  quantity: dto.quantityTotal,
  salesStartAt: dto.salesStartAt ? new Date(dto.salesStartAt) : NO_START,
  salesEndAt: dto.salesEndAt ? new Date(dto.salesEndAt) : NO_END,
  maxPerOrder: dto.maxPerOrder,
  hidden: dto.isHidden,
  counts: {
    available: dto.quantityAvailable,
    reserved: dto.quantityReserved ?? 0,
    sold: dto.quantitySold ?? 0,
    refunded: dto.quantityRefunded ?? 0,
    checkedIn: dto.quantityCheckedIn ?? 0,
  },
});

/** Shared by create and update. `kind` can't change after creation, so it is only sent on create. */
const toBody = (input: TicketTypeInput) => ({
  name: input.name,
  description: input.description,
  priceMinor: Math.round(input.price * MINOR_PER_TENGE),
  quantityTotal: input.quantity,
  maxPerOrder: input.maxPerOrder,
  salesStartAt: input.salesStartAt.toISOString(),
  salesEndAt: input.salesEndAt.toISOString(),
});

const list = (eventId: string) => `/events/${encodeURIComponent(eventId)}/ticket-types`;
const one = (id: string) => `/ticket-types/${encodeURIComponent(id)}`;

export const httpTicketTypesApi: TicketTypesApi = {
  async listTicketTypes(eventId) {
    return (await request<TicketTypeDto[]>(list(eventId))).map(ticketTypeFromDto);
  },
  async createTicketType(eventId, input) {
    const body = { ...toBody(input), kind: input.kind };
    return ticketTypeFromDto(await request<TicketTypeDto>(list(eventId), json('POST', body)));
  },
  async updateTicketType(_eventId, id, input) {
    return ticketTypeFromDto(await request<TicketTypeDto>(one(id), json('PATCH', toBody(input))));
  },
  async setTicketTypeHidden(_eventId, id, hidden) {
    return ticketTypeFromDto(await request<TicketTypeDto>(`${one(id)}/${hidden ? 'hide' : 'unhide'}`, { method: 'POST' }));
  },
  async deleteTicketType(_eventId, id) {
    await request(one(id), { method: 'DELETE' });
  },
};
