import type { CreateEventInput, EventDraft, EventDraftErrors } from './types';

export const LIMITS = {
  titleMax: 120,
  descriptionMin: 20,
  descriptionMax: 5000,
  maxImages: 5,
  maxImageBytes: 5 * 1024 * 1024,
  capacityMax: 100_000,
} as const;

/** Parses native input values as local time. Returns null for empty/invalid input. */
export function parseLocalDateTime(date: string, time = '00:00'): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const result = new Date(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
  return Number.isNaN(result.getTime()) ? null : result;
}

function parseDateTimeLocal(value: string): Date | null {
  const [date, time] = value.split('T');
  return parseLocalDateTime(date ?? '', time?.slice(0, 5));
}

export function getEventStart(draft: EventDraft): Date | null {
  return parseLocalDateTime(draft.date, draft.startTime);
}

export function validateEventDraft(draft: EventDraft, now: Date): EventDraftErrors {
  const errors: EventDraftErrors = {};
  const title = draft.title.trim();
  const description = draft.description.trim();

  if (!title) errors.title = 'Enter an event title.';
  else if (title.length > LIMITS.titleMax)
    errors.title = `Title must be ${LIMITS.titleMax} characters or fewer.`;

  if (!description) errors.description = 'Enter a description.';
  else if (description.length < LIMITS.descriptionMin)
    errors.description = `Description must be at least ${LIMITS.descriptionMin} characters.`;
  else if (description.length > LIMITS.descriptionMax)
    errors.description = `Description must be ${LIMITS.descriptionMax} characters or fewer.`;

  if (!draft.category) errors.category = 'Choose a category.';

  if (draft.images.length > LIMITS.maxImages)
    errors.images = `Upload up to ${LIMITS.maxImages} images.`;
  else if (draft.images.some((f) => !f.type.startsWith('image/')))
    errors.images = 'Only image files can be uploaded.';
  else if (draft.images.some((f) => f.size > LIMITS.maxImageBytes))
    errors.images = 'Each image must be 5 MB or smaller.';

  if (!draft.venueName.trim()) errors.venueName = 'Enter the venue name.';
  if (!draft.city.trim()) errors.city = 'Enter the city.';

  const startsAt = getEventStart(draft);
  if (!draft.date) errors.date = 'Choose the event date.';
  if (!draft.startTime) errors.startTime = 'Choose the start time.';
  if (draft.date && draft.startTime) {
    if (!startsAt) errors.date = 'Enter a valid date and time.';
    else if (startsAt <= now) errors.date = 'The event must start in the future.';
  }

  const opensAt = parseDateTimeLocal(draft.registrationOpensAt);
  const closesAt = parseDateTimeLocal(draft.registrationClosesAt);
  if (!draft.registrationOpensAt) errors.registrationOpensAt = 'Choose when registration opens.';
  else if (!opensAt) errors.registrationOpensAt = 'Enter a valid date and time.';

  if (!draft.registrationClosesAt) errors.registrationClosesAt = 'Choose when registration closes.';
  else if (!closesAt) errors.registrationClosesAt = 'Enter a valid date and time.';
  else if (closesAt <= now) errors.registrationClosesAt = 'Registration must close in the future.';
  else if (opensAt && closesAt <= opensAt)
    errors.registrationClosesAt = 'Registration must close after it opens.';
  else if (startsAt && closesAt > startsAt)
    errors.registrationClosesAt = 'Registration must close before the event starts.';

  const capacity = draft.capacity.trim();
  if (!capacity) errors.capacity = 'Enter the event capacity.';
  else if (!/^\d+$/.test(capacity) || Number(capacity) < 1)
    errors.capacity = 'Capacity must be a whole number of at least 1.';
  else if (Number(capacity) > LIMITS.capacityMax)
    errors.capacity = `Capacity cannot exceed ${LIMITS.capacityMax.toLocaleString('en-US')}.`;

  return errors;
}

/** Converts a draft that passed `validateEventDraft` into submission data. */
export function toCreateEventInput(draft: EventDraft): CreateEventInput {
  const startsAt = getEventStart(draft);
  const opensAt = parseDateTimeLocal(draft.registrationOpensAt);
  const closesAt = parseDateTimeLocal(draft.registrationClosesAt);
  if (!draft.category || !startsAt || !opensAt || !closesAt) {
    throw new Error('toCreateEventInput called with an invalid draft');
  }
  return {
    title: draft.title.trim(),
    description: draft.description.trim(),
    category: draft.category,
    images: draft.images,
    format: 'physical',
    venue: {
      name: draft.venueName.trim(),
      address: draft.venueAddress.trim(),
      city: draft.city.trim(),
    },
    startsAt,
    visibility: draft.visibility,
    registrationOpensAt: opensAt,
    registrationClosesAt: closesAt,
    capacity: Number(draft.capacity),
  };
}
