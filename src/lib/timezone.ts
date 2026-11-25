/*
 * Event times are entered and shown as wall-clock time in the event's IANA
 * time zone (e.g. 19:00 in Asia/Almaty), independent of the viewer's browser.
 * These helpers convert between that wall-clock form and absolute instants.
 */

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsIn(date: Date, timeZone: string) {
  let formatter = partsFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsFormatters.set(timeZone, formatter);
  }
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(formatter.formatToParts(date).find((p) => p.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** Offset of `timeZone` from UTC at `date`, in milliseconds (Almaty: +5 h). */
function offsetMs(date: Date, timeZone: string): number {
  const p = partsIn(date, timeZone);
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wallAsUtc - Math.floor(date.getTime() / 1000) * 1000;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * `"2026-10-12"` + `"19:00"` in `"Asia/Almaty"` → the instant 2026-10-12T14:00Z.
 * Returns null for malformed or impossible input (e.g. 2026-02-31).
 */
export function zonedDateTime(date: string, time: string, timeZone: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t || !isValidTimeZone(timeZone)) return null;
  const [y, mo, da, h, mi] = [+d[1], +d[2], +d[3], +t[1], +t[2]];
  const guess = Date.UTC(y, mo - 1, da, h, mi);
  const check = new Date(guess);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== da || h > 23 || mi > 59) return null;

  // Two passes handle zones whose offset changes (DST) near the requested time.
  let result = guess - offsetMs(new Date(guess), timeZone);
  const second = offsetMs(new Date(result), timeZone);
  if (guess - second !== result) result = guess - second;
  return new Date(result);
}

/** `"2026-10-12T19:00"` (datetime-local value) in `timeZone` → instant. */
export function zonedDateTimeLocal(value: string, timeZone: string): Date | null {
  const [date = '', time = ''] = value.split('T');
  return zonedDateTime(date, time.slice(0, 5), timeZone);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Instant → native input values as wall-clock time in `timeZone`. */
export function toZonedInputs(date: Date, timeZone: string) {
  const p = partsIn(date, timeZone);
  const day = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  const time = `${pad(p.hour)}:${pad(p.minute)}`;
  return { date: day, time, dateTimeLocal: `${day}T${time}` };
}
