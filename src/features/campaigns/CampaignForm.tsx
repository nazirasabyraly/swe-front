import { useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { CampaignInput } from '../../api/campaigns';
import type { TicketType } from '../../api/ticketTypes';
import { FormField } from '../../components/FormField';
import { useFormat } from '../../i18n/useFormat';
import {
  CAMPAIGN_LIMITS,
  toCampaignInput,
  validateCampaignDraft,
  type CampaignDraft,
  type CampaignErrors,
} from './model';

const FIELD_ORDER: (keyof CampaignDraft)[] = [
  'name',
  'code',
  'discountType',
  'discountValue',
  'validFrom',
  'validUntil',
  'maxRedemptions',
  'ticketTypeIds',
];

interface CampaignFormProps {
  initialDraft: CampaignDraft;
  timeZone: string;
  eventEndsAt: Date;
  ticketTypes: TicketType[];
  onSave: (input: CampaignInput) => Promise<void>;
  onCancel: () => void;
  serverError?: string | null;
}

export function CampaignForm({ initialDraft, timeZone, eventEndsAt, ticketTypes, onSave, onCancel, serverError }: CampaignFormProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const uid = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState(initialDraft);
  const [errors, setErrors] = useState<CampaignErrors>({});
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const ctx = { timeZone, eventEndsAt };

  const id = (field: keyof CampaignDraft) => `${uid}-${field}`;
  const values = {
    nameMax: CAMPAIGN_LIMITS.nameMax,
    codeMin: CAMPAIGN_LIMITS.codeMin,
    codeMax: CAMPAIGN_LIMITS.codeMax,
    fixedMax: format.kzt(CAMPAIGN_LIMITS.fixedMax),
    redemptionsMax: format.number(CAMPAIGN_LIMITS.redemptionsMax),
  };
  const error = (field: keyof CampaignDraft) => (errors[field] ? t(errors[field], values) : undefined);

  function update<K extends keyof CampaignDraft>(field: K, value: CampaignDraft[K]) {
    const next = { ...draft, [field]: value };
    setDraft(next);
    if (attempted) setErrors(validateCampaignDraft(next, ctx));
  }

  function toggleType(typeId: string, checked: boolean) {
    update('ticketTypeIds', checked ? [...draft.ticketTypeIds, typeId] : draft.ticketTypeIds.filter((i) => i !== typeId));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next = validateCampaignDraft(draft, ctx);
    setErrors(next);
    setAttempted(true);
    const first = FIELD_ORDER.find((f) => next[f]);
    if (first) {
      formRef.current?.querySelector<HTMLElement>(`[id="${id(first)}"]`)?.focus();
      return;
    }
    setSaving(true);
    try {
      await onSave(toCampaignInput(draft, timeZone));
    } finally {
      setSaving(false);
    }
  }

  const zone = format.timeZoneName(new Date(), timeZone);
  const title = t('campaigns.form.title');

  return (
    <form ref={formRef} className="panel ticket-form" onSubmit={handleSubmit} noValidate aria-label={title}>
      <h3 className="ticket-form__title">{title}</h3>
      {serverError && (
        <div className="notice notice--danger form-summary" role="alert">
          <strong>{t('campaigns.form.saveError')}</strong>
          {serverError}
        </div>
      )}
      <div className="form-grid">
        <FormField id={id('name')} label={t('campaigns.form.name')} hint={t('campaigns.form.nameHint')} error={error('name')}>
          {(control) => (
            <input {...control} className="input" value={draft.name} onChange={(e) => update('name', e.target.value)} />
          )}
        </FormField>

        <FormField
          id={id('code')}
          label={`${t('campaigns.form.code')} (${t('common.optional').toLowerCase()})`}
          hint={t('campaigns.form.codeHint', values)}
          error={error('code')}
        >
          {(control) => (
            <input
              {...control}
              className="input campaign-form__code"
              value={draft.code}
              autoCapitalize="characters"
              spellCheck={false}
              onChange={(e) => update('code', e.target.value.toUpperCase())}
            />
          )}
        </FormField>

        <fieldset className="field fieldset-reset">
          <legend className="field__label">{t('campaigns.form.discountType')}</legend>
          <div className="chip-group">
            {(['percent', 'fixed'] as const).map((type, i) => (
              <label key={type} className="chip">
                <input
                  type="radio"
                  name={`${uid}-discountType`}
                  id={i === 0 ? id('discountType') : undefined}
                  checked={draft.discountType === type}
                  onChange={() => update('discountType', type)}
                />
                {t(`campaigns.discountType.${type}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <FormField
          id={id('discountValue')}
          label={draft.discountType === 'percent' ? t('campaigns.form.percent') : t('campaigns.form.fixed')}
          hint={draft.discountType === 'fixed' ? t('campaigns.form.fixedHint') : undefined}
          error={error('discountValue')}
        >
          {(control) => (
            <input
              {...control}
              className="input"
              inputMode="numeric"
              value={draft.discountValue}
              onChange={(e) => update('discountValue', e.target.value)}
            />
          )}
        </FormField>

        <FormField id={id('validFrom')} label={t('campaigns.form.validFrom')} hint={t('ticketTypes.form.salesHint', { zone })} error={error('validFrom')}>
          {(control) => (
            <input {...control} type="datetime-local" className="input" value={draft.validFrom} onChange={(e) => update('validFrom', e.target.value)} />
          )}
        </FormField>

        <FormField id={id('validUntil')} label={t('campaigns.form.validUntil')} hint={t('ticketTypes.form.salesHint', { zone })} error={error('validUntil')}>
          {(control) => (
            <input {...control} type="datetime-local" className="input" value={draft.validUntil} onChange={(e) => update('validUntil', e.target.value)} />
          )}
        </FormField>

        <FormField
          id={id('maxRedemptions')}
          label={`${t('campaigns.form.maxRedemptions')} (${t('common.optional').toLowerCase()})`}
          hint={t('campaigns.form.maxRedemptionsHint')}
          error={error('maxRedemptions')}
        >
          {(control) => (
            <input
              {...control}
              className="input"
              inputMode="numeric"
              value={draft.maxRedemptions}
              onChange={(e) => update('maxRedemptions', e.target.value)}
            />
          )}
        </FormField>

        <fieldset
          className="field fieldset-reset form-grid--full"
          aria-describedby={errors.ticketTypeIds ? `${id('ticketTypeIds')}-error` : undefined}
        >
          <legend className="field__label">{t('campaigns.form.appliesTo')}</legend>
          <label className="checkbox-row">
            <input
              type="checkbox"
              id={id('ticketTypeIds')}
              checked={draft.allTicketTypes}
              onChange={(e) => update('allTicketTypes', e.target.checked)}
            />
            {t('campaigns.form.allTicketTypes')}
          </label>
          {!draft.allTicketTypes && (
            <div className="campaign-form__types">
              {ticketTypes.map((type) => (
                <label key={type.id} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={draft.ticketTypeIds.includes(type.id)}
                    onChange={(e) => toggleType(type.id, e.target.checked)}
                  />
                  {type.name}
                </label>
              ))}
            </div>
          )}
          {errors.ticketTypeIds && (
            <span id={`${id('ticketTypeIds')}-error`} className="field__error">
              {error('ticketTypeIds')}
            </span>
          )}
        </fieldset>
      </div>

      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? t('campaigns.form.saving') : t('campaigns.form.save')}
        </button>
      </div>
    </form>
  );
}
