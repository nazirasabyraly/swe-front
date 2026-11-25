import { buildIcs, googleCalendarUrl, outlookCalendarUrl, type CalendarEvent } from './calendar';

const event: CalendarEvent = {
  id: 'evt-1',
  title: 'Almaty Nights; Vol. 4',
  startsAt: new Date('2026-10-12T14:00:00Z'),
  endsAt: new Date('2026-10-12T18:00:00Z'),
  timeZone: 'Asia/Almaty',
  venue: { name: 'Almaty Arena', address: 'Momyshuly Ave 1', city: 'Almaty' },
  description: 'Three acts,\nlate DJ set.',
  url: 'https://biletflow.kz/events/evt-1',
};
const now = new Date('2026-10-01T00:00:00Z');
const unfold = (ics: string) => ics.replace(/\r\n /g, '');

describe('calendar export', () => {
  it('builds an iCalendar file in the event’s zone with a stable UID', () => {
    const ics = unfold(buildIcs(event, { now }));
    expect(ics).toContain('UID:event-evt-1@biletflow.kz');
    expect(ics).toContain('TZID:Asia/Almaty');
    expect(ics).toContain('TZOFFSETTO:+0500');
    expect(ics).toContain('DTSTART;TZID=Asia/Almaty:20261012T190000');
    expect(ics).toContain('DTEND;TZID=Asia/Almaty:20261012T230000');
    expect(ics).toContain(String.raw`SUMMARY:Almaty Nights\; Vol. 4`);
    expect(ics).toContain(String.raw`LOCATION:Almaty Arena\, Momyshuly Ave 1\, Almaty`);
    expect(ics).toContain(String.raw`DESCRIPTION:Three acts\,\nlate DJ set.\n\nhttps://biletflow.kz/events/evt-1`);
    expect(ics).toContain('URL:https://biletflow.kz/events/evt-1');
    expect(ics).toContain('METHOD:PUBLISH');
    expect(ics.split('\r\n').every((line) => new TextEncoder().encode(line).length <= 75 || !line)).toBe(true);
  });

  it('folds long lines at 75 octets, including Cyrillic', () => {
    const ics = buildIcs({ ...event, title: 'Алматы түндері — '.repeat(6) }, { now });
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(unfold(ics)).toContain(`SUMMARY:${'Алматы түндері — '.repeat(6)}`);
  });

  it('produces a cancellation with the same UID and a newer sequence', () => {
    const first = buildIcs(event, { now });
    const cancel = buildIcs(event, { cancelled: true, now: new Date('2026-10-05T00:00:00Z') });
    expect(cancel).toContain('METHOD:CANCEL');
    expect(cancel).toContain('STATUS:CANCELLED');
    expect(cancel).toContain('UID:event-evt-1@biletflow.kz');
    const seq = (s: string) => Number(/SEQUENCE:(\d+)/.exec(s)![1]);
    expect(seq(cancel)).toBeGreaterThan(seq(first));
  });

  it('builds Google and Outlook links without needing calendar access', () => {
    const google = new URL(googleCalendarUrl(event));
    expect(google.searchParams.get('dates')).toBe('20261012T140000Z/20261012T180000Z');
    expect(google.searchParams.get('ctz')).toBe('Asia/Almaty');
    const outlook = new URL(outlookCalendarUrl(event));
    expect(outlook.searchParams.get('startdt')).toBe('2026-10-12T14:00:00.000Z');
    expect(outlook.searchParams.get('location')).toBe('Almaty Arena, Momyshuly Ave 1, Almaty');
  });
});
