/*
 * Ticket type API client. Contract: docs/backend-contract.md, "Ticket types".
 * Counters are computed by the server; the UI never derives inventory itself.
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
  hasSales: 'ticket_type_has_sales',
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

export interface TicketTypeDto extends Omit<TicketType, 'salesStartAt' | 'salesEndAt'> {
  salesStartAt: string;
  salesEndAt: string;
}

export const ticketTypeFromDto = (dto: TicketTypeDto): TicketType => ({
  ...dto,
  salesStartAt: new Date(dto.salesStartAt),
  salesEndAt: new Date(dto.salesEndAt),
});

const toBody = (input: TicketTypeInput) => ({
  ...input,
  salesStartAt: input.salesStartAt.toISOString(),
  salesEndAt: input.salesEndAt.toISOString(),
});

const base = (eventId: string) => `/api/events/${encodeURIComponent(eventId)}/ticket-types`;
const one = (eventId: string, id: string) => `${base(eventId)}/${encodeURIComponent(id)}`;

export const httpTicketTypesApi: TicketTypesApi = {
  async listTicketTypes(eventId) {
    return (await request<TicketTypeDto[]>(base(eventId))).map(ticketTypeFromDto);
  },
  async createTicketType(eventId, input) {
    return ticketTypeFromDto(await request<TicketTypeDto>(base(eventId), json('POST', toBody(input))));
  },
  async updateTicketType(eventId, id, input) {
    return ticketTypeFromDto(await request<TicketTypeDto>(one(eventId, id), json('PATCH', toBody(input))));
  },
  async setTicketTypeHidden(eventId, id, hidden) {
    return ticketTypeFromDto(await request<TicketTypeDto>(one(eventId, id), json('PATCH', { hidden })));
  },
  async deleteTicketType(eventId, id) {
    await request(one(eventId, id), { method: 'DELETE' });
  },
};
