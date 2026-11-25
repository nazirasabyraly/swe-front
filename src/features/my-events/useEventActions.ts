import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useDescribeError } from '../../api/errors';
import { useEventsApi } from '../../api/ApiContext';
import { paths } from '../../routes';
import type { OrganizerEvent } from '../../api/events';

export const editEventPath = paths.organizerEditEvent;

/**
 * Publish / unpublish / edit handlers for the organizer's event list.
 * Tracks in-flight requests and the last error per event.
 */
export function useEventActions(onEventUpdated: (event: OrganizerEvent) => void) {
  const api = useEventsApi();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const describeError = useDescribeError();
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function run(id: string, action: (id: string) => Promise<OrganizerEvent>, failure: string) {
    if (pendingIds.has(id)) return;
    setPendingIds((s) => new Set(s).add(id));
    setErrors(({ [id]: _cleared, ...rest }) => rest);
    try {
      onEventUpdated(await action(id));
    } catch (err) {
      setErrors((e) => ({ ...e, [id]: `${failure} ${describeError(err)}` }));
    } finally {
      setPendingIds((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  }

  return {
    publish: (id: string) => run(id, (i) => api.publishEvent(i), t('myEvents.publishFailed')),
    unpublish: (id: string) => run(id, (i) => api.unpublishEvent(i), t('myEvents.unpublishFailed')),
    edit: (id: string) => navigate(editEventPath(id)),
    tickets: (id: string) => navigate(paths.organizerEventTickets(id)),
    campaigns: (id: string) => navigate(paths.organizerEventCampaigns(id)),
    isPending: (id: string) => pendingIds.has(id),
    errorFor: (id: string): string | undefined => errors[id],
  };
}
