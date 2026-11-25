/*
 * Calendar export (SRS 4.11): an iCalendar (.ics) file and one-click links for Google Calendar and
 * Outlook. Nothing asks for write access to the attendee's calendar account.
 *
 * - UID is stable per event (`event-<id>@biletflow.kz`), so re-importing an updated file replaces
 *   the earlier entry; SEQUENCE increases with time so the newer file wins.
 * - Times are written in the event's own zone (TZID) with a matching VTIMEZONE. Kazakhstan zones have
 *   no daylight saving, so one STANDARD rule at the event's offset is exact for them.
 * - A cancellation file (METHOD:CANCEL, STATUS:CANCELLED) removes the entry in most calendar apps.
 */

export interface CalendarEvent {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
  venue: { name: string; address: string; city: string };
  description?: string;
  url: string;
}

/** Wall-clock parts of an instant in an IANA zone. */
function zoned(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute'), s: get('second') };
}

const local = (date: Date, tz: string) => {
  const p = zoned(date, tz);
  return `${p.y}${p.m}${p.d}T${p.h}${p.min}${p.s}`;
};

const utc = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** UTC offset of `timeZone` at `date`, as "+0500". */
function offset(date: Date, timeZone: string): string {
  const p = zoned(date, timeZone);
  const asUtc = Date.UTC(+p.y, +p.m - 1, +p.d, +p.h, +p.min, +p.s);
  const minutes = Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}${String(abs % 60).padStart(2, '0')}`;
}

/** RFC 5545 text escaping and 75-octet line folding. */
const escapeText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) {
      out.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join('\r\n ');
}

const location = (e: CalendarEvent) => [e.venue.name, e.venue.address, e.venue.city].filter(Boolean).join(', ');
const details = (e: CalendarEvent) => [e.description, e.url].filter(Boolean).join('\n\n');

export function buildIcs(event: CalendarEvent, { cancelled = false, now = new Date() }: { cancelled?: boolean; now?: Date } = {}): string {
  const tz = event.timeZone;
  const off = offset(event.startsAt, tz);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BiletFlow//Events//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${cancelled ? 'CANCEL' : 'PUBLISH'}`,
    'BEGIN:VTIMEZONE',
    `TZID:${tz}`,
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    `TZOFFSETFROM:${off}`,
    `TZOFFSETTO:${off}`,
    'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:event-${event.id}@biletflow.kz`,
    `SEQUENCE:${Math.floor(now.getTime() / 1000)}`,
    `DTSTAMP:${utc(now)}`,
    `DTSTART;TZID=${tz}:${local(event.startsAt, tz)}`,
    `DTEND;TZID=${tz}:${local(event.endsAt, tz)}`,
    `SUMMARY:${escapeText(event.title)}`,
    `LOCATION:${escapeText(location(event))}`,
    `DESCRIPTION:${escapeText(details(event))}`,
    `URL:${event.url}`,
    `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

export function googleCalendarUrl(e: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${utc(e.startsAt)}/${utc(e.endsAt)}`,
    ctz: e.timeZone,
    details: details(e),
    location: location(e),
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

export function outlookCalendarUrl(e: CalendarEvent): string {
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: e.title,
    startdt: e.startsAt.toISOString(),
    enddt: e.endsAt.toISOString(),
    body: details(e),
    location: location(e),
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params}`;
}

export function icsDataUrl(event: CalendarEvent, options?: { cancelled?: boolean }): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(buildIcs(event, options))}`;
}
