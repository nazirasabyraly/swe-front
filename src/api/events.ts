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
 */
import type {
  CreateEventInput,
  EventCategory,
  EventFormat,
  EventVisibility,
} from '../features/create-event/types';
import { request } from './http';

export type EventStatus = 'draft' | 'published';

export interface OrganizerEvent {
  id: string;
  title: string;
  description: string;
  category: EventCategory;
  imageUrls: string[];
  format: EventFormat;
  venue: { name: string; address: string; city: string };
  startsAt: Date;
  visibility: EventVisibility;
  registrationOpensAt: Date;
  registrationClosesAt: Date;
  capacity: number;
  status: EventStatus;
}

/** Wire format: same as OrganizerEvent but with ISO 8601 date strings. */
export interface EventDto
  extends Omit<OrganizerEvent, 'startsAt' | 'registrationOpensAt' | 'registrationClosesAt'> {
  startsAt: string;
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
}

export function fromDto(dto: EventDto): OrganizerEvent {
  return {
    ...dto,
    startsAt: new Date(dto.startsAt),
    registrationOpensAt: new Date(dto.registrationOpensAt),
    registrationClosesAt: new Date(dto.registrationClosesAt),
  };
}

function toFormData({ images, ...input }: CreateEventInput): FormData {
  const form = new FormData();
  const data = {
    ...input,
    startsAt: input.startsAt.toISOString(),
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
};
