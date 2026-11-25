import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { useDescribeError } from '../../api/errors';
import { ErrorState, LoadingState } from '../../components/DataStates';
import { paths } from '../../routes';
import { useEventsApi } from '../../api/ApiContext';
import type { OrganizerEvent } from '../../api/events';
import { CreateEventForm } from '../create-event/CreateEventForm';
import type { EventDraft } from '../create-event/types';
import { toCreateEventInput } from '../create-event/validation';
import type { EventListLocationState } from '../my-events/EventListView';
import { eventToDraft } from './eventToDraft';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; event: OrganizerEvent };

interface EditEventPageProps {
  now?: () => Date;
}

export function EditEventPage({ now }: EditEventPageProps) {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const describeError = useDescribeError();
  const api = useEventsApi();
  const navigate = useNavigate();
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoad({ status: 'loading' });
    api.getEvent(id).then(
      (event) => !cancelled && setLoad({ status: 'ready', event }),
      (err: unknown) =>
        !cancelled &&
        setLoad({ status: 'error', message: describeError(err) }),
    );
    return () => {
      cancelled = true;
    };
  }, [api, id, describeError]);

  async function handleSave(draft: EventDraft) {
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await api.updateEvent(id, toCreateEventInput(draft));
      const state: EventListLocationState = { flash: t('editEvent.savedFlash', { title: saved.title }) };
      navigate(paths.organizerEvents, { state });
    } catch (err) {
      setSaveError(describeError(err));
      setSaving(false);
    }
  }

  return (
    <div>
      <Link to={paths.organizerEvents} className="back-link">
        {t('editEvent.back')}
      </Link>
      <h1 className="section-title">{t('editEvent.title')}</h1>

      {load.status === 'loading' && <LoadingState label={t('editEvent.loading')} />}

      {load.status === 'error' && <ErrorState title={t('editEvent.loadError')} message={load.message} />}

      {load.status === 'ready' && load.event.status === 'cancelled' && (
        <p className="notice" role="status">
          {t('editEvent.cancelledNote')}
        </p>
      )}

      {load.status === 'ready' && load.event.status !== 'cancelled' && (
        <>
          <p className="section-subtitle">
            {load.event.status === 'published'
              ? t('editEvent.publishedNote')
              : t('editEvent.draftNote')}
          </p>
          {saveError && (
            <div className="notice notice--danger form-summary" role="alert">
              <strong>{t('editEvent.saveError')}</strong>
              {saveError}
            </div>
          )}
          <CreateEventForm
            initialDraft={eventToDraft(load.event)}
            onContinue={handleSave}
            now={now}
            submitLabel={saving ? t('editEvent.saving') : t('editEvent.save')}
            submitting={saving}
            imagesHint={
              load.event.imageUrls.length > 0
                ? t('editEvent.imagesExisting', { count: load.event.imageUrls.length })
                : undefined
            }
          />
        </>
      )}
    </div>
  );
}
