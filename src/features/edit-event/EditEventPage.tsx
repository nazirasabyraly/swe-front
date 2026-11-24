import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useEventsApi } from '../../api/EventsApiContext';
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
        setLoad({ status: 'error', message: err instanceof Error ? err.message : 'Could not load the event.' }),
    );
    return () => {
      cancelled = true;
    };
  }, [api, id]);

  async function handleSave(draft: EventDraft) {
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await api.updateEvent(id, toCreateEventInput(draft));
      const state: EventListLocationState = { flash: `Changes to “${saved.title}” saved` };
      navigate('/events', { state });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
      setSaving(false);
    }
  }

  return (
    <div>
      <Link to="/events" className="back-link">
        ← My events
      </Link>
      <h1 className="section-title">Edit event</h1>

      {load.status === 'loading' && <p className="label-muted" role="status">Loading event…</p>}

      {load.status === 'error' && (
        <div className="notice notice--danger" role="alert">
          <strong>Couldn’t load the event</strong>
          {load.message}
        </div>
      )}

      {load.status === 'ready' && (
        <>
          <p className="section-subtitle">
            {load.event.status === 'published'
              ? 'This event is published. Saved changes are visible to attendees straight away.'
              : 'This event is a draft. Attendees can’t see it until you publish it.'}
          </p>
          {saveError && (
            <div className="notice notice--danger form-summary" role="alert">
              <strong>Couldn’t save changes</strong>
              {saveError}
            </div>
          )}
          <CreateEventForm
            initialDraft={eventToDraft(load.event)}
            onContinue={handleSave}
            now={now}
            submitLabel={saving ? 'Saving…' : 'Save changes'}
            submitting={saving}
            imagesHint={
              load.event.imageUrls.length > 0
                ? `This event has ${load.event.imageUrls.length} image(s). Upload new images to replace them, or leave empty to keep them.`
                : undefined
            }
          />
        </>
      )}
    </div>
  );
}
