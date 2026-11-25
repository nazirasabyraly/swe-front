/*
 * Event API client.
 *
 * ASSUMED CONTRACT — the backend contract hasn't been finalised. Everything
 * the frontend relies on is in this file, so adapting to the real API should
 * only mean changing the paths and the DTO mapping below.
 *
 *   GET   /api/organizer/events     -> EventDto[]   (events owned by the signed-in organizer)
 *   GET   /api/events/:id           -> EventDto
 *   POST  /api/events               -> EventDto     (multipart: `data` JSON + `images` files)
 *   PATCH /api/events/:id           -> EventDto     (multipart, same shape; no `images` keeps current ones)
 *   POST  /api/events/:id/publish   -> EventDto
 *   POST  /api/events/:id/unpublish -> EventDto
 *   POST  /api/events/:id/cancel    -> EventDto     ({ reason }; server cancels/refunds tickets and notifies)
 *   POST  /api/events/:id/duplicate -> EventDto     (new draft; details + ticket types, no orders/tickets/check-ins)
 */
import type {
  CreateEventInput,
  EventCategory,
  EventFormat,
  EventVisibility,
} from '../features/create-event/types';
import { json, request } from './http';

export type EventStatus = 'draft' | 'published' | 'cancelled';

export interface OrganizerEvent {
  id: string;
  title: string;
  description: string;
  category: EventCategory;
  imageUrls: string[];
  format: EventFormat;
  venue: { name: string; address: string; city: string };
  startsAt: Date;
  endsAt: Date;
  /** IANA zone the event's times are shown in, e.g. "Asia/Almaty". */
  timeZone: string;
  visibility: EventVisibility;
  registrationOpensAt: Date;
  registrationClosesAt: Date;
  capacity: number;
  refundPolicy: string;
  status: EventStatus;
}

/** Wire format: same as OrganizerEvent but with ISO 8601 date strings. */
export interface EventDto
  extends Omit<OrganizerEvent, 'startsAt' | 'endsAt' | 'registrationOpensAt' | 'registrationClosesAt'> {
  startsAt: string;
  endsAt: string;
  registrationOpensAt: string;
  registrationClosesAt: string;
}

export interface EventsApi {
  listMyEvents(): Promise<OrganizerEvent[]>;
  getEvent(id: string): Promise<OrganizerEvent>;
  createEvent(input: CreateEventInput): Promise<OrganizerEvent>;
  updateEvent(id: string, input: CreateEventInput): Promise<OrganizerEvent>;
  publishEvent(id: string): Promise<OrganizerEvent>;
  unpublishEvent(id: string): Promise<OrganizerEvent>;
  /** Irreversible. The server invalidates tickets, refunds paid orders and notifies attendees. */
  cancelEvent(id: string, reason: string): Promise<OrganizerEvent>;
  /** Copies details and ticket-type setup into a new draft, never orders, tickets or check-ins (SRS 4.16). */
  duplicateEvent(id: string): Promise<OrganizerEvent>;
}

export function fromDto(dto: EventDto): OrganizerEvent {
  return {
    ...dto,
    startsAt: new Date(dto.startsAt),
    endsAt: new Date(dto.endsAt),
    registrationOpensAt: new Date(dto.registrationOpensAt),
    registrationClosesAt: new Date(dto.registrationClosesAt),
  };
}

function toFormData({ images, ...input }: CreateEventInput): FormData {
  const form = new FormData();
  const data = {
    ...input,
    startsAt: input.startsAt.toISOString(),
    endsAt: input.endsAt.toISOString(),
    registrationOpensAt: input.registrationOpensAt.toISOString(),
    registrationClosesAt: input.registrationClosesAt.toISOString(),
  };
  form.append('data', new Blob([JSON.stringify(data)], { type: 'application/json' }));
  images.forEach((file) => form.append('images', file));
  return form;
}

const id = encodeURIComponent;

export const httpEventsApi: EventsApi = {
  async listMyEvents() {
    const events = await request<EventDto[]>('/api/organizer/events');
    return events.map(fromDto);
  },
  async getEvent(eventId) {
    return fromDto(await request<EventDto>(`/api/events/${id(eventId)}`));
  },
  async createEvent(input) {
    return fromDto(await request<EventDto>('/api/events', { method: 'POST', body: toFormData(input) }));
  },
  async updateEvent(eventId, input) {
    return fromDto(
      await request<EventDto>(`/api/events/${id(eventId)}`, { method: 'PATCH', body: toFormData(input) }),
    );
  },
  async publishEvent(eventId) {
    return fromDto(await request<EventDto>(`/api/events/${id(eventId)}/publish`, { method: 'POST' }));
  },
  async unpublishEvent(eventId) {
    return fromDto(await request<EventDto>(`/api/events/${id(eventId)}/unpublish`, { method: 'POST' }));
  },
  async cancelEvent(eventId, reason) {
    return fromDto(await request<EventDto>(`/api/events/${id(eventId)}/cancel`, json('POST', { reason })));
  },
  async duplicateEvent(eventId) {
    return fromDto(await request<EventDto>(`/api/events/${id(eventId)}/duplicate`, { method: 'POST' }));
  },
};
