import type { OrganizerEvent } from '../../api/events';
import type { EventDraft } from '../create-event/types';

const pad = (n: number) => String(n).padStart(2, '0');
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTimeInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toDateTimeInput = (d: Date) => `${toDateInput(d)}T${toTimeInput(d)}`;

/**
 * Converts a saved event into form state (local time, native input formats).
 * Existing images are URLs, not Files, so `images` starts empty; the server
 * keeps the current images unless new ones are uploaded.
 */
export function eventToDraft(event: OrganizerEvent): EventDraft {
  return {
    title: event.title,
    description: event.description,
    category: event.category,
    images: [],
    venueName: event.venue.name,
    venueAddress: event.venue.address,
    city: event.venue.city,
    date: toDateInput(event.startsAt),
    startTime: toTimeInput(event.startsAt),
    visibility: event.visibility,
    registrationOpensAt: toDateTimeInput(event.registrationOpensAt),
    registrationClosesAt: toDateTimeInput(event.registrationClosesAt),
    capacity: String(event.capacity),
  };
}
