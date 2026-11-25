/** Kazakhstan has used a single zone (UTC+5) since March 2024; Asia/Almaty covers it. */
export const DEFAULT_TIME_ZONE = 'Asia/Almaty';

/** Zones offered in the event form: Kazakhstan first, then nearby venues organizers may use. */
export const EVENT_TIME_ZONES = [
  'Asia/Almaty',
  'Asia/Tashkent',
  'Asia/Bishkek',
  'Europe/Moscow',
  'Europe/Istanbul',
  'Asia/Dubai',
] as const;

export type EventTimeZone = (typeof EVENT_TIME_ZONES)[number];
