import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { FormField } from '../../components/FormField';
import {
  EVENT_CATEGORIES,
  EVENT_VISIBILITIES,
  type EventDraft,
  type EventDraftErrors,
  type EventVisibility,
} from './types';
import { LIMITS, validateEventDraft } from './validation';
import { useObjectUrls } from './useObjectUrls';

export const VISIBILITY_OPTIONS: Record<EventVisibility, { label: string; description: string }> = {
  public: { label: 'Public', description: 'Listed on Discover and in search results.' },
  unlisted: { label: 'Unlisted', description: 'Hidden from Discover. Anyone with the link can view it.' },
  private: { label: 'Private', description: 'Only people you invite can view and register.' },
};

/** Order in which fields are checked when moving focus to the first error. */
const FIELD_ORDER: (keyof EventDraft)[] = [
  'title',
  'description',
  'category',
  'images',
  'venueName',
  'venueAddress',
  'city',
  'date',
  'startTime',
  'visibility',
  'registrationOpensAt',
  'registrationClosesAt',
  'capacity',
];

type TextFieldName = Exclude<keyof EventDraft, 'images' | 'category' | 'visibility'>;

const fieldId = (name: keyof EventDraft) => `event-${name}`;

interface CreateEventFormProps {
  initialDraft: EventDraft;
  onContinue: (draft: EventDraft) => void;
  /** Injectable clock, used for "must be in the future" checks. */
  now?: () => Date;
}

export function CreateEventForm({ initialDraft, onContinue, now = () => new Date() }: CreateEventFormProps) {
  const [draft, setDraft] = useState<EventDraft>(initialDraft);
  const [errors, setErrors] = useState<EventDraftErrors>({});
  const [attempted, setAttempted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const imageUrls = useObjectUrls(draft.images);

  function update<K extends keyof EventDraft>(name: K, value: EventDraft[K]) {
    const next = { ...draft, [name]: value };
    setDraft(next);
    // Once the user has tried to continue, keep errors in sync as they fix them.
    if (attempted) setErrors(validateEventDraft(next, now()));
  }

  const onText =
    (name: TextFieldName) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      update(name, e.target.value);

  function onImagesSelected(e: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length) update('images', [...draft.images, ...selected]);
    // Reset so selecting the same file again still fires a change event.
    e.target.value = '';
  }

  function removeImage(index: number) {
    update(
      'images',
      draft.images.filter((_, i) => i !== index),
    );
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const nextErrors = validateEventDraft(draft, now());
    setErrors(nextErrors);
    setAttempted(true);

    const firstInvalid = FIELD_ORDER.find((name) => nextErrors[name]);
    if (firstInvalid) {
      formRef.current
        ?.querySelector<HTMLElement>(`#${fieldId(firstInvalid)}, [name="${firstInvalid}"]`)
        ?.focus();
      return;
    }
    onContinue(draft);
  }

  const errorCount = Object.keys(errors).length;

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate aria-label="Event details">
      {attempted && errorCount > 0 && (
        <div className="notice notice--danger form-summary" role="alert">
          <strong>
            {errorCount === 1 ? 'Fix 1 field' : `Fix ${errorCount} fields`} before previewing
          </strong>
          Check the highlighted fields below.
        </div>
      )}

      <section className="card">
        <h2 className="card__title">Event details</h2>
        <div className="form-grid">
          <FormField
            id={fieldId('title')}
            label="Event title"
            error={errors.title}
            className="form-grid--full"
          >
            {(control) => (
              <input
                {...control}
                className="input"
                name="title"
                value={draft.title}
                onChange={onText('title')}
                maxLength={LIMITS.titleMax + 20}
                placeholder="Almaty Nights — Vol. 4"
                autoComplete="off"
              />
            )}
          </FormField>

          <FormField
            id={fieldId('description')}
            label="Description"
            hint="Tell attendees what to expect. Blank lines start a new paragraph."
            error={errors.description}
            className="form-grid--full"
          >
            {(control) => (
              <textarea
                {...control}
                className="input"
                name="description"
                value={draft.description}
                onChange={onText('description')}
              />
            )}
          </FormField>

          <fieldset
            className="field form-grid--full fieldset-reset"
            aria-describedby={errors.category ? 'event-category-error' : undefined}
          >
            <legend className="field__label">Category</legend>
            <div className="chip-group">
              {EVENT_CATEGORIES.map((category, i) => (
                <label key={category} className="chip">
                  <input
                    type="radio"
                    name="category"
                    id={i === 0 ? fieldId('category') : undefined}
                    value={category}
                    checked={draft.category === category}
                    onChange={() => update('category', category)}
                    aria-invalid={Boolean(errors.category)}
                  />
                  {category}
                </label>
              ))}
            </div>
            {errors.category && (
              <span id="event-category-error" className="field__error">
                {errors.category}
              </span>
            )}
          </fieldset>

          <FormField
            id={fieldId('images')}
            label="Images"
            hint={`Optional. Up to ${LIMITS.maxImages} images, 5 MB each. The first image is the cover.`}
            error={errors.images}
            className="form-grid--full"
          >
            {(control) => (
              <div className="image-picker">
                {draft.images.map((file, i) => (
                  <figure key={`${file.name}-${i}`} className="image-picker__item">
                    <img src={imageUrls[i]} alt="" />
                    <figcaption>
                      <span className="image-picker__name">{file.name}</span>
                      <button
                        type="button"
                        className="image-picker__remove"
                        onClick={() => removeImage(i)}
                        aria-label={`Remove ${file.name}`}
                      >
                        Remove
                      </button>
                    </figcaption>
                  </figure>
                ))}
                {draft.images.length < LIMITS.maxImages && (
                  <label className="image-picker__add placeholder-stripes">
                    <span className="btn">Add images</span>
                    <input
                      {...control}
                      type="file"
                      name="images"
                      accept="image/*"
                      multiple
                      className="sr-only"
                      onChange={onImagesSelected}
                    />
                  </label>
                )}
              </div>
            )}
          </FormField>
        </div>
      </section>

      <section className="card">
        <h2 className="card__title">Venue, date and time</h2>
        <p className="label-muted card__intro">In-person event at a physical venue.</p>
        <div className="form-grid">
          <FormField id={fieldId('venueName')} label="Venue name" error={errors.venueName}>
            {(control) => (
              <input
                {...control}
                className="input"
                name="venueName"
                value={draft.venueName}
                onChange={onText('venueName')}
                placeholder="Almaty Arena"
              />
            )}
          </FormField>

          <FormField id={fieldId('city')} label="City" error={errors.city}>
            {(control) => (
              <input
                {...control}
                className="input"
                name="city"
                value={draft.city}
                onChange={onText('city')}
                placeholder="Almaty"
                autoComplete="address-level2"
              />
            )}
          </FormField>

          <FormField
            id={fieldId('venueAddress')}
            label="Street address"
            hint="Optional"
            error={errors.venueAddress}
            className="form-grid--full"
          >
            {(control) => (
              <input
                {...control}
                className="input"
                name="venueAddress"
                value={draft.venueAddress}
                onChange={onText('venueAddress')}
                autoComplete="street-address"
              />
            )}
          </FormField>

          <FormField id={fieldId('date')} label="Date" error={errors.date}>
            {(control) => (
              <input
                {...control}
                type="date"
                className="input"
                name="date"
                value={draft.date}
                onChange={onText('date')}
              />
            )}
          </FormField>

          <FormField id={fieldId('startTime')} label="Start time" error={errors.startTime}>
            {(control) => (
              <input
                {...control}
                type="time"
                className="input"
                name="startTime"
                value={draft.startTime}
                onChange={onText('startTime')}
              />
            )}
          </FormField>
        </div>
      </section>

      <section className="card">
        <h2 className="card__title">Registration and visibility</h2>
        <div className="form-grid">
          <fieldset className="field form-grid--full fieldset-reset">
            <legend className="field__label">Visibility</legend>
            <div className="option-cards">
              {EVENT_VISIBILITIES.map((visibility) => (
                <label key={visibility} className="option-card">
                  <input
                    type="radio"
                    name="visibility"
                    value={visibility}
                    checked={draft.visibility === visibility}
                    onChange={() => update('visibility', visibility)}
                  />
                  <span>
                    <span className="option-card__label">{VISIBILITY_OPTIONS[visibility].label}</span>
                    <span className="option-card__description">
                      {VISIBILITY_OPTIONS[visibility].description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <FormField
            id={fieldId('registrationOpensAt')}
            label="Registration opens"
            error={errors.registrationOpensAt}
          >
            {(control) => (
              <input
                {...control}
                type="datetime-local"
                className="input"
                name="registrationOpensAt"
                value={draft.registrationOpensAt}
                onChange={onText('registrationOpensAt')}
              />
            )}
          </FormField>

          <FormField
            id={fieldId('registrationClosesAt')}
            label="Registration closes"
            hint="Must be before the event starts."
            error={errors.registrationClosesAt}
          >
            {(control) => (
              <input
                {...control}
                type="datetime-local"
                className="input"
                name="registrationClosesAt"
                value={draft.registrationClosesAt}
                onChange={onText('registrationClosesAt')}
              />
            )}
          </FormField>

          <FormField
            id={fieldId('capacity')}
            label="Capacity"
            hint="Maximum number of attendees."
            error={errors.capacity}
          >
            {(control) => (
              <input
                {...control}
                type="number"
                inputMode="numeric"
                min={1}
                max={LIMITS.capacityMax}
                step={1}
                className="input"
                name="capacity"
                value={draft.capacity}
                onChange={onText('capacity')}
              />
            )}
          </FormField>
        </div>
      </section>

      <div className="form-actions">
        <button type="submit" className="btn btn--primary">
          Continue to preview
        </button>
      </div>
    </form>
  );
}
