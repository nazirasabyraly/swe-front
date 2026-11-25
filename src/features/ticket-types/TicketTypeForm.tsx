import { useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { TicketTypeInput } from '../../api/ticketTypes';
import { FormField } from '../../components/FormField';
import { useFormat } from '../../i18n/useFormat';
import {
  TICKET_LIMITS,
  toTicketTypeInput,
  validateTicketTypeDraft,
  type TicketTypeContext,
  type TicketTypeDraft,
  type TicketTypeErrors,
} from './model';

const FIELD_ORDER: (keyof TicketTypeDraft)[] = [
  'name',
  'description',
  'kind',
  'price',
  'quantity',
  'salesStartAt',
  'salesEndAt',
  'maxPerOrder',
];

interface TicketTypeFormProps {
  title: string;
  initialDraft: TicketTypeDraft;
  context: TicketTypeContext;
  /** Saves the type. The parent handles API errors and passes them back as `serverError`. */
  onSave: (input: TicketTypeInput) => Promise<void>;
  onCancel: () => void;
  serverError?: string | null;
}

export function TicketTypeForm({ title, initialDraft, context, onSave, onCancel, serverError }: TicketTypeFormProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const uid = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState(initialDraft);
  const [errors, setErrors] = useState<TicketTypeErrors>({});
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);

  const id = (field: keyof TicketTypeDraft) => `${uid}-${field}`;
  const values = {
    nameMax: TICKET_LIMITS.nameMax,
    descriptionMax: TICKET_LIMITS.descriptionMax,
    priceMax: format.kzt(TICKET_LIMITS.priceMax),
    quantityMax: format.number(TICKET_LIMITS.quantityMax),
    maxPerOrderMax: TICKET_LIMITS.maxPerOrderMax,
    min: format.number(context.minQuantity),
  };
  const error = (field: keyof TicketTypeDraft) => (errors[field] ? t(errors[field], values) : undefined);

  function update<K extends keyof TicketTypeDraft>(field: K, value: TicketTypeDraft[K]) {
    const next = { ...draft, [field]: value };
    setDraft(next);
    if (attempted) setErrors(validateTicketTypeDraft(next, context));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next = validateTicketTypeDraft(draft, context);
    setErrors(next);
    setAttempted(true);
    const first = FIELD_ORDER.find((f) => next[f]);
    if (first) {
      formRef.current?.querySelector<HTMLElement>(`[id="${id(first)}"]`)?.focus();
      return;
    }
    setSaving(true);
    try {
      await onSave(toTicketTypeInput(draft, context.timeZone));
    } finally {
      setSaving(false);
    }
  }

  const zone = format.timeZoneName(new Date(), context.timeZone);

  return (
    <form ref={formRef} className="panel ticket-form" onSubmit={handleSubmit} noValidate aria-label={title}>
      <h3 className="ticket-form__title">{title}</h3>
      {serverError && (
        <div className="notice notice--danger form-summary" role="alert">
          <strong>{t('ticketTypes.form.saveError')}</strong>
          {serverError}
        </div>
      )}
      <div className="form-grid">
        <FormField id={id('name')} label={t('ticketTypes.form.name')} error={error('name')}>
          {(control) => (
            <input
              {...control}
              className="input"
              value={draft.name}
              placeholder={t('ticketTypes.form.namePlaceholder')}
              onChange={(e) => update('name', e.target.value)}
            />
          )}
        </FormField>

        <fieldset className="field fieldset-reset">
          <legend className="field__label">{t('ticketTypes.form.kind')}</legend>
          <div className="chip-group">
            {(['free', 'paid'] as const).map((kind, i) => (
              <label key={kind} className="chip">
                <input
                  type="radio"
                  name={`${uid}-kind`}
                  id={i === 0 ? id('kind') : undefined}
                  checked={draft.kind === kind}
                  onChange={() => update('kind', kind)}
                />
                {t(`ticketTypes.kind.${kind}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <FormField
          id={id('description')}
          label={t('ticketTypes.form.description')}
          hint={t('ticketTypes.form.descriptionHint')}
          error={error('description')}
          className="form-grid--full"
        >
          {(control) => (
            <input
              {...control}
              className="input"
              value={draft.description}
              onChange={(e) => update('description', e.target.value)}
            />
          )}
        </FormField>

        {draft.kind === 'paid' && (
          <FormField
            id={id('price')}
            label={t('ticketTypes.form.price')}
            hint={t('ticketTypes.form.priceHint')}
            error={error('price')}
          >
            {(control) => (
              <input
                {...control}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                className="input"
                value={draft.price}
                onChange={(e) => update('price', e.target.value)}
              />
            )}
          </FormField>
        )}

        <FormField
          id={id('quantity')}
          label={t('ticketTypes.form.quantity')}
          hint={
            context.minQuantity > 0
              ? t('ticketTypes.form.quantityMinSold', { min: values.min })
              : t('ticketTypes.form.quantityHint')
          }
          error={error('quantity')}
        >
          {(control) => (
            <input
              {...control}
              type="number"
              inputMode="numeric"
              min={Math.max(1, context.minQuantity)}
              step={1}
              className="input"
              value={draft.quantity}
              onChange={(e) => update('quantity', e.target.value)}
            />
          )}
        </FormField>

        <FormField
          id={id('salesStartAt')}
          label={t('ticketTypes.form.salesStart')}
          hint={t('ticketTypes.form.salesHint', { zone })}
          error={error('salesStartAt')}
        >
          {(control) => (
            <input
              {...control}
              type="datetime-local"
              className="input"
              value={draft.salesStartAt}
              onChange={(e) => update('salesStartAt', e.target.value)}
            />
          )}
        </FormField>

        <FormField id={id('salesEndAt')} label={t('ticketTypes.form.salesEnd')} error={error('salesEndAt')}>
          {(control) => (
            <input
              {...control}
              type="datetime-local"
              className="input"
              value={draft.salesEndAt}
              onChange={(e) => update('salesEndAt', e.target.value)}
            />
          )}
        </FormField>

        <FormField
          id={id('maxPerOrder')}
          label={t('ticketTypes.form.maxPerOrder')}
          hint={t('ticketTypes.form.maxPerOrderHint')}
          error={error('maxPerOrder')}
        >
          {(control) => (
            <input
              {...control}
              type="number"
              inputMode="numeric"
              min={1}
              max={TICKET_LIMITS.maxPerOrderMax}
              step={1}
              className="input"
              value={draft.maxPerOrder}
              onChange={(e) => update('maxPerOrder', e.target.value)}
            />
          )}
        </FormField>
      </div>

      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={saving}>
          {t('common.cancel')}
        </button>
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? t('ticketTypes.form.saving') : t('ticketTypes.form.save')}
        </button>
      </div>
    </form>
  );
}
