/*
 * Locale-aware formatting. Pass an Intl locale (see INTL_LOCALES) and, for
 * event times, the event's IANA time zone. Without a time zone, the viewer's
 * browser zone is used.
 */

function dateTimeFormat(locale: string, timeZone?: string) {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  });
}

export function formatDateTime(date: Date, locale: string, timeZone?: string): string {
  return dateTimeFormat(locale, timeZone).format(date);
}

/** "Mon, 12 Oct 2026, 19:00–23:00"; repeats the date only when the range spans days. */
export function formatDateTimeRange(start: Date, end: Date, locale: string, timeZone?: string): string {
  return dateTimeFormat(locale, timeZone).formatRange(start, end);
}

/** Short date for compact rows: "01 Sept" (prototype "Sales 01 Sep → 12 Oct"). */
export function formatShortDate(date: Date, locale: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', timeZone }).format(date);
}

/** Short zone label such as "GMT+5", for showing next to event times. */
export function formatTimeZoneName(date: Date, locale: string, timeZone: string): string {
  const part = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'short' })
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName');
  return part?.value ?? timeZone;
}

export function formatNumber(n: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n);
}

/** KZT amount as displayed everywhere: "6 500 ₸" (ru/kk), "₸6,500" (en). Tiyn shown only when present. */
export function formatKZT(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'KZT',
    currencyDisplay: 'narrowSymbol',
    // Whole tenge: "6 500 ₸"; with tiyn always two digits: "99,50 ₸".
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
