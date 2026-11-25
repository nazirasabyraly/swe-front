import { useFormat } from '../i18n/useFormat';

interface DateTimeTextProps {
  value: Date;
  /** The event's IANA time zone, e.g. "Asia/Almaty". Omit to use the viewer's zone. */
  timeZone?: string;
  /** Append the zone label, e.g. "(GMT+5)". Requires `timeZone`. */
  showZone?: boolean;
  className?: string;
}

/** Date and time in the current locale, rendered as a machine-readable <time>. */
export function DateTimeText({ value, timeZone, showZone = false, className }: DateTimeTextProps) {
  const format = useFormat();
  const text = format.dateTime(value, timeZone);
  const zone = showZone && timeZone ? ` (${format.timeZoneName(value, timeZone)})` : '';
  return (
    <time dateTime={value.toISOString()} className={className}>
      {text}
      {zone}
    </time>
  );
}

interface DateTimeRangeTextProps {
  start: Date;
  end: Date;
  timeZone: string;
  showZone?: boolean;
  className?: string;
}

/** Event start–end in the event's zone, e.g. "Mon, 12 Oct 2026, 19:00–23:00 (GMT+5)". */
export function DateTimeRangeText({ start, end, timeZone, showZone = false, className }: DateTimeRangeTextProps) {
  const format = useFormat();
  const zone = showZone ? ` (${format.timeZoneName(start, timeZone)})` : '';
  return (
    <time dateTime={start.toISOString()} className={className}>
      {format.dateTimeRange(start, end, timeZone)}
      {zone}
    </time>
  );
}
