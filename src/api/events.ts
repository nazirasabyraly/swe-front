/*
 * Organizer event API client. Backend: app/api/v1/events.py, app/schemas/events.py.
 *
 *   GET   /organizers/me/events      -> Page<EventSummary>  (then each event is loaded in full)
 *   GET   /events/:id                -> EventRead
 *   POST  /events                    -> EventRead  (JSON; creates a draft)
 *   PATCH /events/:id                -> EventRead
 *   POST  /events/:id/publish        -> EventRead
 *   POST  /events/:id/unpublish      -> EventRead
 *   POST  /events/:id/cancel         -> EventRead  ({ reason })
 *   POST  /events/:id/duplicate      -> EventRead
 *
 * The backend model differs from the form in a few places; the mapping lives here:
 * - No city field: city is stored as the last ", "-separated part of `location_address`.
 * - No image upload: only `cover_image_key` exists. It's shown when it is already a URL;
 *   picked images are not sent.
 * - No refund policy field: it isn't stored and reads back empty.
 * - Categories are stored lowercase ("music"); the app uses "Music".
 * - Registration dates are optional on the server; missing ones fall back to
 *   creation time (opens) and start time (closes).
 */
import {
  EVENT_CATEGORIES,
  type CreateEventInput,
  type EventCategory,
  type EventFormat,
  type EventVisibility,
} from '../features/create-event/types';
import { json, request, type Page } from './http';

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

/** Backend `EventRead`, after camelCasing. */
export interface EventDto {
  id: string;
  organizer: { id: string; displayName: string };
  title: string;
  description: string | null;
  category: string | null;
  coverImageKey: string | null;
  locationName: string | null;
  locationAddress: string | null;
  venueId: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  visibility: EventVisibility;
  capacity: number;
  seatingMode: 'general_admission' | 'assigned';
  status: EventStatus;
  lifecycle: 'draft' | 'upcoming' | 'active' | 'completed' | 'cancelled';
  paidSalesActive: boolean;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  publishedAt: string | null;
  cancelledAt: string | null;
  isSuspended: boolean;
  calendarLinks: { ics: string; google: string; outlook: string };
  createdAt: string;
  updatedAt: string;
}

interface EventSummaryDto {
  id: string;
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

export const toCategory = (value: string | null): EventCategory =>
  EVENT_CATEGORIES.find((c) => c.toLowerCase() === value?.toLowerCase()) ?? EVENT_CATEGORIES[0];

/** "Abay Ave 10, Almaty" -> { address: "Abay Ave 10", city: "Almaty" }. */
export function splitAddress(value: string | null): { address: string; city: string } {
  const full = value?.trim() ?? '';
  const cut = full.lastIndexOf(', ');
  return cut === -1 ? { address: '', city: full } : { address: full.slice(0, cut), city: full.slice(cut + 2) };
}

const joinAddress = (address: string, city: string) =>
  [address.trim(), city.trim()].filter(Boolean).join(', ');

export const isUrl = (value: string | null): value is string => !!value && /^(https?:|blob:|data:)/.test(value);

export function fromDto(dto: EventDto): OrganizerEvent {
  return {
    id: dto.id,
    title: dto.title,
    description: dto.description ?? '',
    category: toCategory(dto.category),
    imageUrls: isUrl(dto.coverImageKey) ? [dto.coverImageKey] : [],
    format: 'physical',
    venue: { name: dto.locationName ?? '', ...splitAddress(dto.locationAddress) },
    startsAt: new Date(dto.startsAt),
    endsAt: new Date(dto.endsAt),
    timeZone: dto.timezone,
    visibility: dto.visibility,
    registrationOpensAt: new Date(dto.registrationOpensAt ?? dto.createdAt),
    registrationClosesAt: new Date(dto.registrationClosesAt ?? dto.startsAt),
    capacity: dto.capacity,
    refundPolicy: '',
    status: dto.status,
  };
}

/** Request body for create and update. Keys are snake_cased by `json()`. */
const toBody = (input: CreateEventInput) => ({
  title: input.title,
  description: input.description,
  category: input.category.toLowerCase(),
  locationName: input.venue.name,
  locationAddress: joinAddress(input.venue.address, input.venue.city),
  startsAt: input.startsAt.toISOString(),
  endsAt: input.endsAt.toISOString(),
  timezone: input.timeZone,
  visibility: input.visibility,
  capacity: input.capacity,
  registrationOpensAt: input.registrationOpensAt.toISOString(),
  registrationClosesAt: input.registrationClosesAt.toISOString(),
});

const id = encodeURIComponent;
const one = (eventId: string) => `/events/${id(eventId)}`;

async function getEvent(eventId: string) {
  return fromDto(await request<EventDto>(one(eventId)));
}

export const httpEventsApi: EventsApi = {
  async listMyEvents() {
    // The summary lacks capacity and the address, which the event cards show.
    const page = await request<Page<EventSummaryDto>>('/organizers/me/events?limit=100');
    return Promise.all(page.items.map((summary) => getEvent(summary.id)));
  },
  getEvent,
  async createEvent(input) {
    return fromDto(await request<EventDto>('/events', json('POST', toBody(input))));
  },
  async updateEvent(eventId, input) {
    return fromDto(await request<EventDto>(one(eventId), json('PATCH', toBody(input))));
  },
  async publishEvent(eventId) {
    return fromDto(await request<EventDto>(`${one(eventId)}/publish`, { method: 'POST' }));
  },
  async unpublishEvent(eventId) {
    return fromDto(await request<EventDto>(`${one(eventId)}/unpublish`, { method: 'POST' }));
  },
  async cancelEvent(eventId, reason) {
    return fromDto(await request<EventDto>(`${one(eventId)}/cancel`, json('POST', { reason })));
  },
  async duplicateEvent(eventId) {
    return fromDto(await request<EventDto>(`${one(eventId)}/duplicate`, { method: 'POST' }));
  },
};
