export const EVENT_CATEGORIES = ['Music', 'Tech', 'Arts', 'Education', 'Sport'] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const EVENT_VISIBILITIES = ['public', 'unlisted', 'private'] as const;
export type EventVisibility = (typeof EVENT_VISIBILITIES)[number];

/** Only physical, venue-based events are supported for now (SRS §4.2). */
export type EventFormat = 'physical';

/**
 * Raw form state. Date/time values keep the exact strings produced by
 * native inputs (`YYYY-MM-DD`, `HH:mm`, `YYYY-MM-DDTHH:mm`) in local time.
 */
export interface EventDraft {
  title: string;
  description: string;
  category: EventCategory | '';
  images: File[];
  venueName: string;
  venueAddress: string;
  city: string;
  date: string;
  startTime: string;
  visibility: EventVisibility;
  registrationOpensAt: string;
  registrationClosesAt: string;
  capacity: string;
}

/** Validated, normalised event data handed to `onSubmit`. */
export interface CreateEventInput {
  title: string;
  description: string;
  category: EventCategory;
  images: File[];
  format: EventFormat;
  venue: {
    name: string;
    address: string;
    city: string;
  };
  startsAt: Date;
  visibility: EventVisibility;
  registrationOpensAt: Date;
  registrationClosesAt: Date;
  capacity: number;
}

export type EventDraftErrors = Partial<Record<keyof EventDraft, string>>;

export const emptyEventDraft: EventDraft = {
  title: '',
  description: '',
  category: '',
  images: [],
  venueName: '',
  venueAddress: '',
  city: '',
  date: '',
  startTime: '',
  visibility: 'public',
  registrationOpensAt: '',
  registrationClosesAt: '',
  capacity: '',
};
