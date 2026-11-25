import { useTranslation } from 'react-i18next';
import { googleCalendarUrl, icsDataUrl, outlookCalendarUrl, type CalendarEvent } from '../lib/calendar';

/**
 * One-click calendar options (prototype screen 2: Google Calendar · Apple Calendar · Outlook ·
 * Download .ics). Apple Calendar opens .ics files, so it uses the same file. `cancelled` offers a
 * cancellation file instead, which removes the earlier entry.
 */
export function AddToCalendar({ event, cancelled = false }: { event: CalendarEvent; cancelled?: boolean }) {
  const { t } = useTranslation();
  const filename = `biletflow-${event.id}${cancelled ? '-cancelled' : ''}.ics`;
  const ics = icsDataUrl(event, { cancelled });

  if (cancelled) {
    return (
      <div className="add-to-calendar" role="group" aria-label={t('calendar.cancelledLabel')}>
        <a className="btn btn--small" href={ics} download={filename}>
          {t('calendar.removeFile')}
        </a>
      </div>
    );
  }

  return (
    <div className="add-to-calendar" role="group" aria-label={t('calendar.label')}>
      <a className="btn btn--small" href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer">
        {t('calendar.google')}
        <span className="sr-only"> {t('calendar.newTab')}</span>
      </a>
      <a className="btn btn--small" href={ics} download={filename}>
        {t('calendar.apple')}
      </a>
      <a className="btn btn--small" href={outlookCalendarUrl(event)} target="_blank" rel="noopener noreferrer">
        {t('calendar.outlook')}
        <span className="sr-only"> {t('calendar.newTab')}</span>
      </a>
      <a className="btn btn--small" href={ics} download={filename}>
        {t('calendar.ics')}
      </a>
    </div>
  );
}
