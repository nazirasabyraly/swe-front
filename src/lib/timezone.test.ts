import { isValidTimeZone, toZonedInputs, zonedDateTime, zonedDateTimeLocal } from './timezone';

describe('time zone helpers', () => {
  it('runs tests outside Kazakhstan time, so browser-local assumptions fail loudly', () => {
    expect(new Date('2026-10-12T00:00:00Z').getTimezoneOffset()).not.toBe(-300);
  });

  it('reads wall-clock time in the event zone, whatever the browser zone is', () => {
    expect(zonedDateTime('2026-10-12', '19:00', 'Asia/Almaty')?.toISOString()).toBe('2026-10-12T14:00:00.000Z');
    expect(zonedDateTime('2026-10-12', '19:00', 'Europe/Moscow')?.toISOString()).toBe('2026-10-12T16:00:00.000Z');
    expect(zonedDateTimeLocal('2026-09-25T10:00', 'Asia/Almaty')?.toISOString()).toBe('2026-09-25T05:00:00.000Z');
  });

  it('handles zones with daylight saving on both sides of the change', () => {
    // London switches to GMT on 25 Oct 2026.
    expect(zonedDateTime('2026-10-24', '12:00', 'Europe/London')?.toISOString()).toBe('2026-10-24T11:00:00.000Z');
    expect(zonedDateTime('2026-10-26', '12:00', 'Europe/London')?.toISOString()).toBe('2026-10-26T12:00:00.000Z');
  });

  it('rejects malformed and impossible dates and unknown zones', () => {
    expect(zonedDateTime('2026-02-31', '10:00', 'Asia/Almaty')).toBeNull();
    expect(zonedDateTime('2026-10-12', '25:00', 'Asia/Almaty')).toBeNull();
    expect(zonedDateTime('12.10.2026', '10:00', 'Asia/Almaty')).toBeNull();
    expect(zonedDateTime('2026-10-12', '10:00', 'Mars/Olympus')).toBeNull();
    expect(isValidTimeZone('Asia/Almaty')).toBe(true);
  });

  it('round-trips instants back to input values in the event zone', () => {
    expect(toZonedInputs(new Date('2026-10-12T14:00:00Z'), 'Asia/Almaty')).toEqual({
      date: '2026-10-12',
      time: '19:00',
      dateTimeLocal: '2026-10-12T19:00',
    });
    // Late evening UTC is already the next day in Almaty.
    expect(toZonedInputs(new Date('2026-10-12T20:30:00Z'), 'Asia/Almaty').date).toBe('2026-10-13');
  });
});
