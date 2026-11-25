import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useEventsApi } from '../../api/ApiContext';
import { useDescribeError } from '../../api/errors';
import { paths } from '../../routes';
import { CreateEventForm } from '../create-event';
import { emptyEventDraft, type EventDraft } from '../create-event/types';
import { toCreateEventInput } from '../create-event/validation';
import { SetupSteps } from './SetupSteps';

/** Wizard step 1 for a new event: saving creates the draft, then ticket types come next. */
export function NewEventPage({ now }: { now?: () => Date }) {
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
      const created = await api.createEvent(toCreateEventInput(draft));
      navigate(paths.organizerEventSetup(created.id, 'tickets'));
    } catch (err) {
      setError(describeError(err));
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="section-title">{t('createEvent.title')}</h1>
      <p className="section-subtitle">{t('createEvent.subtitle')}</p>
      <SetupSteps active="details" />
      {error && (
        <div className="notice notice--danger form-summary" role="alert">
          <strong>{t('eventSetup.saveError')}</strong>
          {error}
        </div>
      )}
      <CreateEventForm
        initialDraft={emptyEventDraft}
        onContinue={handleSave}
        now={now}
        submitLabel={saving ? t('eventSetup.saving') : t('eventSetup.saveAndContinue')}
        submitting={saving}
      />
    </div>
  );
}
