import type { OrganizerEvent } from '../../api/events';
import { toZonedInputs } from '../../lib/timezone';
import type { EventDraft } from '../create-event/types';

/**
 * Converts a saved event into form state: native input formats, as
 * wall-clock time in the event's own time zone.
 * Existing images are URLs, not Files, so `images` starts empty; the server
 * keeps the current images unless new ones are uploaded.
 */
export function eventToDraft(event: OrganizerEvent): EventDraft {
  const zone = event.timeZone;
  const start = toZonedInputs(event.startsAt, zone);
  const end = toZonedInputs(event.endsAt, zone);
  return {
    title: event.title,
    description: event.description,
    category: event.category,
    images: [],
    venueName: event.venue.name,
    venueAddress: event.venue.address,
    city: event.venue.city,
    date: start.date,
    startTime: start.time,
    endDate: end.date,
    endTime: end.time,
    timeZone: zone,
    visibility: event.visibility,
    registrationOpensAt: toZonedInputs(event.registrationOpensAt, zone).dateTimeLocal,
    registrationClosesAt: toZonedInputs(event.registrationClosesAt, zone).dateTimeLocal,
    capacity: String(event.capacity),
    refundPolicy: event.refundPolicy,
  };
}
