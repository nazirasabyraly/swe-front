import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField } from '../../components/FormField';
import { useFormat } from '../../i18n/useFormat';
import {
  EVENT_CATEGORIES,
  EVENT_VISIBILITIES,
  type EventDraft,
  type EventDraftErrors,
} from './types';
import { EVENT_TIME_ZONES } from './timeZones';
import { LIMITS, validateEventDraft, validationValues } from './validation';
import { useObjectUrls } from './useObjectUrls';

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
  'endDate',
  'endTime',
  'timeZone',
  'visibility',
  'registrationOpensAt',
  'registrationClosesAt',
  'capacity',
  'refundPolicy',
];

type TextFieldName = Exclude<keyof EventDraft, 'images' | 'category' | 'visibility'>;

const fieldId = (name: keyof EventDraft) => `event-${name}`;

interface CreateEventFormProps {
  initialDraft: EventDraft;
  onContinue: (draft: EventDraft) => void;
  /** Injectable clock, used for "must be in the future" checks. */
  now?: () => Date;
  submitLabel?: string;
  /** Overrides the hint under the image picker (e.g. when editing an event that has images). */
  imagesHint?: string;
  /** Disables the submit button, e.g. while saving. */
  submitting?: boolean;
}

export function CreateEventForm({
  initialDraft,
  onContinue,
  now = () => new Date(),
  submitLabel,
  imagesHint,
  submitting = false,
}: CreateEventFormProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const errorText = (key: EventDraftErrors[keyof EventDraft]) =>
    key ? t(key, validationValues(format.number)) : undefined;
  const [draft, setDraft] = useState<EventDraft>(initialDraft);
  const [errors, setErrors] = useState<EventDraftErrors>({});
  const [attempted, setAttempted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const imageUrls = useObjectUrls(draft.images);

  function update<K extends keyof EventDraft>(name: K, value: EventDraft[K]) {
    const next = { ...draft, [name]: value };
    // Most events end on the day they start: keep the end date following the
    // start date until the organizer picks a different one.
    if (name === 'date' && (!draft.endDate || draft.endDate === draft.date)) next.endDate = value as string;
    setDraft(next);
    // Once the user has tried to continue, keep errors in sync as they fix them.
    if (attempted) setErrors(validateEventDraft(next, now()));
  }

  const onText =
    (name: TextFieldName) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
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
    <form ref={formRef} onSubmit={handleSubmit} noValidate aria-label={t('eventForm.ariaLabel')}>
      {attempted && errorCount > 0 && (
        <div className="notice notice--danger form-summary" role="alert">
          <strong>{t('eventForm.errorSummary', { count: errorCount })}</strong>
          {t('eventForm.errorSummaryBody')}
        </div>
      )}

      <section className="card">
        <h2 className="card__title">{t('eventForm.detailsHeading')}</h2>
        <div className="form-grid">
          <FormField
            id={fieldId('title')}
            label={t('eventForm.title')}
            error={errorText(errors.title)}
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
                placeholder={t('eventForm.titlePlaceholder')}
                autoComplete="off"
              />
            )}
          </FormField>

          <FormField
            id={fieldId('description')}
            label={t('eventForm.description')}
            hint={t('eventForm.descriptionHint')}
            error={errorText(errors.description)}
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
            <legend className="field__label">{t('eventForm.category')}</legend>
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
                  {t(`category.${category}`)}
                </label>
              ))}
            </div>
            {errors.category && (
              <span id="event-category-error" className="field__error">
                {errorText(errors.category)}
              </span>
            )}
          </fieldset>

          <FormField
            id={fieldId('images')}
            label={t('eventForm.images')}
            hint={imagesHint ?? t('eventForm.imagesHint', { max: LIMITS.maxImages })}
            error={errorText(errors.images)}
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
                        aria-label={t('eventForm.removeImage', { name: file.name })}
                      >
                        {t('eventForm.remove')}
                      </button>
                    </figcaption>
                  </figure>
                ))}
                {draft.images.length < LIMITS.maxImages && (
                  <label className="image-picker__add placeholder-stripes">
                    <span className="btn">{t('eventForm.addImages')}</span>
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
        <h2 className="card__title">{t('eventForm.venueHeading')}</h2>
        <p className="label-muted card__intro">{t('eventForm.venueIntro')}</p>
        <div className="form-grid">
          <FormField id={fieldId('venueName')} label={t('eventForm.venueName')} error={errorText(errors.venueName)}>
            {(control) => (
              <input
                {...control}
                className="input"
                name="venueName"
                value={draft.venueName}
                onChange={onText('venueName')}
                placeholder={t('eventForm.venuePlaceholder')}
              />
            )}
          </FormField>

          <FormField id={fieldId('city')} label={t('eventForm.city')} error={errorText(errors.city)}>
            {(control) => (
              <input
                {...control}
                className="input"
                name="city"
                value={draft.city}
                onChange={onText('city')}
                placeholder={t('eventForm.cityPlaceholder')}
                autoComplete="address-level2"
              />
            )}
          </FormField>

          <FormField
            id={fieldId('venueAddress')}
            label={t('eventForm.address')}
            hint={t('common.optional')}
            error={errorText(errors.venueAddress)}
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

          <FormField id={fieldId('date')} label={t('eventForm.date')} error={errorText(errors.date)}>
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

          <FormField id={fieldId('startTime')} label={t('eventForm.startTime')} error={errorText(errors.startTime)}>
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

          <FormField id={fieldId('endDate')} label={t('eventForm.endDate')} error={errorText(errors.endDate)}>
            {(control) => (
              <input
                {...control}
                type="date"
                className="input"
                name="endDate"
                value={draft.endDate}
                min={draft.date || undefined}
                onChange={onText('endDate')}
              />
            )}
          </FormField>

          <FormField id={fieldId('endTime')} label={t('eventForm.endTime')} error={errorText(errors.endTime)}>
            {(control) => (
              <input
                {...control}
                type="time"
                className="input"
                name="endTime"
                value={draft.endTime}
                onChange={onText('endTime')}
              />
            )}
          </FormField>

          <FormField
            id={fieldId('timeZone')}
            label={t('eventForm.timeZone')}
            hint={t('eventForm.timeZoneHint')}
            error={errorText(errors.timeZone)}
            className="form-grid--full"
          >
            {(control) => (
              <select
                {...control}
                className="input"
                name="timeZone"
                value={draft.timeZone}
                onChange={onText('timeZone')}
              >
                {/* Keep an unlisted zone (e.g. from an older event) selectable. */}
                {!(EVENT_TIME_ZONES as readonly string[]).includes(draft.timeZone) && (
                  <option value={draft.timeZone}>{draft.timeZone}</option>
                )}
                {EVENT_TIME_ZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {`${t(`timeZone.${zone}`)} (${format.timeZoneName(new Date(), zone)})`}
                  </option>
                ))}
              </select>
            )}
          </FormField>
        </div>
      </section>

      <section className="card">
        <h2 className="card__title">{t('eventForm.registrationHeading')}</h2>
        <div className="form-grid">
          <fieldset className="field form-grid--full fieldset-reset">
            <legend className="field__label">{t('eventForm.visibility')}</legend>
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
                    <span className="option-card__label">{t(`visibility.${visibility}.label`)}</span>
                    <span className="option-card__description">
                      {t(`visibility.${visibility}.description`)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <FormField
            id={fieldId('registrationOpensAt')}
            label={t('eventForm.registrationOpens')}
            error={errorText(errors.registrationOpensAt)}
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
            label={t('eventForm.registrationCloses')}
            hint={t('eventForm.registrationClosesHint')}
            error={errorText(errors.registrationClosesAt)}
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
            label={t('eventForm.capacity')}
            hint={t('eventForm.capacityHint')}
            error={errorText(errors.capacity)}
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

          <FormField
            id={fieldId('refundPolicy')}
            label={t('eventForm.refundPolicy')}
            hint={t('eventForm.refundPolicyHint')}
            error={errorText(errors.refundPolicy)}
            className="form-grid--full"
          >
            {(control) => (
              <textarea
                {...control}
                className="input input--short"
                name="refundPolicy"
                value={draft.refundPolicy}
                maxLength={LIMITS.refundPolicyMax + 200}
                onChange={onText('refundPolicy')}
              />
            )}
          </FormField>
        </div>
      </section>

      <div className="form-actions">
        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitLabel ?? t('eventForm.continue')}
        </button>
      </div>
    </form>
  );
}
