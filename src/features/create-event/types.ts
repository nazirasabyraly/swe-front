import type en from '../../i18n/locales/en.json';
import { DEFAULT_TIME_ZONE } from './timeZones';

export const EVENT_CATEGORIES = ['Music', 'Tech', 'Arts', 'Education', 'Sport'] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const EVENT_VISIBILITIES = ['public', 'unlisted', 'private'] as const;
export type EventVisibility = (typeof EVENT_VISIBILITIES)[number];

/** Only physical, venue-based events are supported for now (SRS §4.2). */
export type EventFormat = 'physical';

/**
 * Raw form state. Date/time values keep the exact strings produced by native
 * inputs (`YYYY-MM-DD`, `HH:mm`, `YYYY-MM-DDTHH:mm`) as wall-clock time in
 * `timeZone`, never in the browser's zone.
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
  endDate: string;
  endTime: string;
  /** IANA zone, e.g. "Asia/Almaty". */
  timeZone: string;
  visibility: EventVisibility;
  registrationOpensAt: string;
  registrationClosesAt: string;
  capacity: string;
  refundPolicy: string;
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
  endsAt: Date;
  /** IANA zone used to display every time of this event. */
  timeZone: string;
  visibility: EventVisibility;
  registrationOpensAt: Date;
  registrationClosesAt: Date;
  capacity: number;
  /** Free text shown to attendees; empty when the organizer hasn't set one. */
  refundPolicy: string;
}

/** Translation key under `validation.*`; interpolate with `validationValues()`. */
export type ValidationKey = `validation.${keyof (typeof en)['validation']}`;

export type EventDraftErrors = Partial<Record<keyof EventDraft, ValidationKey>>;

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
  endDate: '',
  endTime: '',
  timeZone: DEFAULT_TIME_ZONE,
  visibility: 'public',
  registrationOpensAt: '',
  registrationClosesAt: '',
  capacity: '',
  refundPolicy: '',
};
