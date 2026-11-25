import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useEventsApi } from '../../api/ApiContext';
import { useDescribeError } from '../../api/errors';
import type { OrganizerEvent } from '../../api/events';
import { paths } from '../../routes';
import { CreateEventForm } from '../create-event';
import type { EventDraft } from '../create-event/types';
import { toCreateEventInput } from '../create-event/validation';
import { eventToDraft } from '../edit-event/eventToDraft';
import { SetupLayout } from './SetupLayout';

/** Wizard step 1 for a saved draft: updates it instead of creating another event. */
export function SetupDetailsPage({ now }: { now?: () => Date }) {
  return <SetupLayout step="details">{(event) => <DetailsStep event={event} now={now} />}</SetupLayout>;
}

function DetailsStep({ event, now }: { event: OrganizerEvent; now?: () => Date }) {
  const { t } = useTranslation();
  const api = useEventsApi();
  const navigate = useNavigate();
  const describeError = useDescribeError();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(draft: EventDraft) {
    setSaving(true);
    setError(null);
    try {
      await api.updateEvent(event.id, toCreateEventInput(draft));
      navigate(paths.organizerEventSetup(event.id, 'tickets'));
    } catch (err) {
      setError(describeError(err));
      setSaving(false);
    }
  }

  return (
    <>
      {error && (
        <div className="notice notice--danger form-summary" role="alert">
          <strong>{t('eventSetup.saveError')}</strong>
          {error}
        </div>
      )}
      <CreateEventForm
        initialDraft={eventToDraft(event)}
        onContinue={handleSave}
        now={now}
        submitLabel={saving ? t('eventSetup.saving') : t('eventSetup.saveAndContinue')}
        submitting={saving}
        imagesHint={
          event.imageUrls.length > 0 ? t('editEvent.imagesExisting', { count: event.imageUrls.length }) : undefined
        }
      />
    </>
  );
}
