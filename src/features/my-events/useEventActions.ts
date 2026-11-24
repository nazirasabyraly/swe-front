import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useEventsApi } from '../../api/EventsApiContext';
import type { OrganizerEvent } from '../../api/events';

export const editEventPath = (id: string) => `/events/${encodeURIComponent(id)}/edit`;

/**
 * Publish / unpublish / edit handlers for the organizer's event list.
 * Tracks in-flight requests and the last error per event.
 */
export function useEventActions(onEventUpdated: (event: OrganizerEvent) => void) {
  const api = useEventsApi();
  const navigate = useNavigate();
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function run(id: string, action: (id: string) => Promise<OrganizerEvent>, failure: string) {
    if (pendingIds.has(id)) return;
    setPendingIds((s) => new Set(s).add(id));
    setErrors(({ [id]: _cleared, ...rest }) => rest);
    try {
      onEventUpdated(await action(id));
    } catch (err) {
      setErrors((e) => ({ ...e, [id]: err instanceof Error ? `${failure} ${err.message}` : failure }));
    } finally {
      setPendingIds((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  }

  return {
    publish: (id: string) => run(id, (i) => api.publishEvent(i), 'Couldn’t publish the event.'),
    unpublish: (id: string) => run(id, (i) => api.unpublishEvent(i), 'Couldn’t unpublish the event.'),
    edit: (id: string) => navigate(editEventPath(id)),
    isPending: (id: string) => pendingIds.has(id),
    errorFor: (id: string): string | undefined => errors[id],
  };
}
