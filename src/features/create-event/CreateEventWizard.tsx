import { useState } from 'react';
import { WizardSteps, type WizardStep } from '../../components/WizardSteps';
import { CreateEventForm, VISIBILITY_OPTIONS } from './CreateEventForm';
import { EventPreview } from './EventPreview';
import { emptyEventDraft, type CreateEventInput, type EventDraft } from './types';
import { toCreateEventInput } from './validation';

// Steps 2–3 (tickets, paid sales activation) are not built yet.
const STEPS: WizardStep[] = [
  { label: 'Event details' },
  { label: 'Ticket types', disabled: true },
  { label: 'Paid sales activation', disabled: true },
  { label: 'Review & publish' },
];
const DETAILS_STEP = 0;
const REVIEW_STEP = 3;

type Stage = 'details' | 'review' | 'done';

export interface CreateEventWizardProps {
  /** Persists the event. The API isn't wired up yet; the caller decides what this does. */
  onSubmit: (event: CreateEventInput) => Promise<void> | void;
  organizerName?: string;
  now?: () => Date;
}

export function CreateEventWizard({ onSubmit, organizerName, now }: CreateEventWizardProps) {
  const [stage, setStage] = useState<Stage>('details');
  const [draft, setDraft] = useState<EventDraft>(emptyEventDraft);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function handleContinue(nextDraft: EventDraft) {
    setDraft(nextDraft);
    setSubmitError(null);
    setStage('review');
    window.scrollTo?.({ top: 0 });
  }

  async function handleConfirm() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(toCreateEventInput(draft));
      setStage('done');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function startOver() {
    setDraft(emptyEventDraft);
    setStage('details');
  }

  return (
    <div>
      <h1 className="section-title">Create event</h1>
      <p className="section-subtitle">
        Add your event details, then check how attendees will see the event page.
      </p>
      <WizardSteps steps={STEPS} activeIndex={stage === 'details' ? DETAILS_STEP : REVIEW_STEP} />

      {stage === 'details' && (
        <CreateEventForm initialDraft={draft} onContinue={handleContinue} now={now} />
      )}

      {stage === 'review' && (
        <ReviewStep
          event={toCreateEventInput(draft)}
          organizerName={organizerName}
          submitting={submitting}
          error={submitError}
          onBack={() => setStage('details')}
          onConfirm={handleConfirm}
        />
      )}

      {stage === 'done' && (
        <div className="notice" role="status">
          <strong>Event created</strong>
          <p className="notice__body">
            “{draft.title}” has been saved. Add ticket types before you publish it.
          </p>
          <button type="button" className="btn" onClick={startOver}>
            Create another event
          </button>
        </div>
      )}
    </div>
  );
}

interface ReviewStepProps {
  event: CreateEventInput;
  organizerName?: string;
  submitting: boolean;
  error: string | null;
  onBack: () => void;
  onConfirm: () => void;
}

function ReviewStep({ event, organizerName, submitting, error, onBack, onConfirm }: ReviewStepProps) {
  const visibility = VISIBILITY_OPTIONS[event.visibility];
  return (
    <section aria-labelledby="review-heading">
      <h2 id="review-heading" className="sr-only">
        Review event
      </h2>
      <div className="notice review__notice">
        <strong>Preview: this is how attendees will see your event</strong>
        Visibility: {visibility.label}. {visibility.description}
      </div>

      <div className="review__frame">
        <EventPreview event={event} organizerName={organizerName} />
      </div>

      {error && (
        <div className="notice notice--danger review__error" role="alert">
          <strong>Couldn’t create the event</strong>
          {error}
        </div>
      )}

      <div className="form-actions">
        <button type="button" className="btn" onClick={onBack} disabled={submitting}>
          Back to edit
        </button>
        <button type="button" className="btn btn--primary" onClick={onConfirm} disabled={submitting}>
          {submitting ? 'Creating…' : 'Confirm and create event'}
        </button>
      </div>
    </section>
  );
}
