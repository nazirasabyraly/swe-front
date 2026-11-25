import { isValidTimeZone, zonedDateTime, zonedDateTimeLocal } from '../../lib/timezone';
import type { CreateEventInput, EventDraft, EventDraftErrors } from './types';

export const LIMITS = {
  titleMax: 120,
  descriptionMin: 20,
  descriptionMax: 5000,
  maxImages: 5,
  maxImageBytes: 5 * 1024 * 1024,
  capacityMax: 100_000,
  refundPolicyMax: 2000,
} as const;

/** Interpolation values for the `validation.*` messages. */
export function validationValues(formatNumber: (n: number) => string) {
  return {
    titleMax: LIMITS.titleMax,
    descriptionMin: LIMITS.descriptionMin,
    descriptionMax: LIMITS.descriptionMax,
    maxImages: LIMITS.maxImages,
    capacityMax: formatNumber(LIMITS.capacityMax),
    refundPolicyMax: formatNumber(LIMITS.refundPolicyMax),
  };
}

/** Draft times as instants, read in the event's time zone. Null when empty/invalid. */
export function draftInstants(draft: EventDraft) {
  const zone = draft.timeZone;
  return {
    startsAt: zonedDateTime(draft.date, draft.startTime, zone),
    endsAt: zonedDateTime(draft.endDate, draft.endTime, zone),
    opensAt: zonedDateTimeLocal(draft.registrationOpensAt, zone),
    closesAt: zonedDateTimeLocal(draft.registrationClosesAt, zone),
  };
}

export function validateEventDraft(draft: EventDraft, now: Date): EventDraftErrors {
  const errors: EventDraftErrors = {};
  const title = draft.title.trim();
  const description = draft.description.trim();

  if (!title) errors.title = 'validation.titleRequired';
  else if (title.length > LIMITS.titleMax)
    errors.title = 'validation.titleTooLong';

  if (!description) errors.description = 'validation.descriptionRequired';
  else if (description.length < LIMITS.descriptionMin)
    errors.description = 'validation.descriptionTooShort';
  else if (description.length > LIMITS.descriptionMax)
    errors.description = 'validation.descriptionTooLong';

  if (!draft.category) errors.category = 'validation.categoryRequired';

  if (draft.images.length > LIMITS.maxImages)
    errors.images = 'validation.tooManyImages';
  else if (draft.images.some((f) => !f.type.startsWith('image/')))
    errors.images = 'validation.notAnImage';
  else if (draft.images.some((f) => f.size > LIMITS.maxImageBytes))
    errors.images = 'validation.imageTooLarge';

  if (!draft.venueName.trim()) errors.venueName = 'validation.venueRequired';
  if (!draft.city.trim()) errors.city = 'validation.cityRequired';

  const { startsAt, endsAt, opensAt, closesAt } = draftInstants(draft);
  if (!isValidTimeZone(draft.timeZone)) errors.timeZone = 'validation.timeZoneInvalid';

  if (!draft.date) errors.date = 'validation.dateRequired';
  if (!draft.startTime) errors.startTime = 'validation.startTimeRequired';
  if (draft.date && draft.startTime) {
    if (!startsAt) errors.date = 'validation.invalidDateTime';
    else if (startsAt <= now) errors.date = 'validation.startInPast';
  }

  if (!draft.endDate) errors.endDate = 'validation.endDateRequired';
  if (!draft.endTime) errors.endTime = 'validation.endTimeRequired';
  if (draft.endDate && draft.endTime) {
    if (!endsAt) errors.endDate = 'validation.invalidDateTime';
    else if (startsAt && endsAt <= startsAt) errors.endTime = 'validation.endBeforeStart';
  }
  if (!draft.registrationOpensAt) errors.registrationOpensAt = 'validation.opensRequired';
  else if (!opensAt) errors.registrationOpensAt = 'validation.invalidDateTime';

  if (!draft.registrationClosesAt) errors.registrationClosesAt = 'validation.closesRequired';
  else if (!closesAt) errors.registrationClosesAt = 'validation.invalidDateTime';
  else if (closesAt <= now) errors.registrationClosesAt = 'validation.closesInPast';
  else if (opensAt && closesAt <= opensAt)
    errors.registrationClosesAt = 'validation.closesBeforeOpens';
  else if (startsAt && closesAt > startsAt)
    errors.registrationClosesAt = 'validation.closesAfterStart';

  const capacity = draft.capacity.trim();
  if (!capacity) errors.capacity = 'validation.capacityRequired';
  else if (!/^\d+$/.test(capacity) || Number(capacity) < 1)
    errors.capacity = 'validation.capacityInvalid';
  else if (Number(capacity) > LIMITS.capacityMax)
    errors.capacity = 'validation.capacityTooLarge';

  if (draft.refundPolicy.trim().length > LIMITS.refundPolicyMax)
    errors.refundPolicy = 'validation.refundPolicyTooLong';

  return errors;
}

/** Converts a draft that passed `validateEventDraft` into submission data. */
export function toCreateEventInput(draft: EventDraft): CreateEventInput {
  const { startsAt, endsAt, opensAt, closesAt } = draftInstants(draft);
  if (!draft.category || !startsAt || !endsAt || !opensAt || !closesAt) {
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
    endsAt,
    timeZone: draft.timeZone,
    visibility: draft.visibility,
    registrationOpensAt: opensAt,
    registrationClosesAt: closesAt,
    capacity: Number(draft.capacity),
    refundPolicy: draft.refundPolicy.trim(),
  };
}
