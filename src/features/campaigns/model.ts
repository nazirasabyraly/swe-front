import type { CampaignInput, DiscountType } from '../../api/campaigns';
import type { OrganizerEvent } from '../../api/events';
import type en from '../../i18n/locales/en.json';
import { toZonedInputs, zonedDateTimeLocal } from '../../lib/timezone';

export const CAMPAIGN_LIMITS = {
  nameMax: 80,
  codeMin: 4,
  codeMax: 20,
  fixedMax: 10_000_000,
  redemptionsMax: 100_000,
} as const;

/** Form state; validity times are datetime-local strings in the event's time zone. */
export interface CampaignDraft {
  name: string;
  code: string;
  discountType: DiscountType;
  discountValue: string;
  validFrom: string;
  validUntil: string;
  /** Empty means unlimited. */
  maxRedemptions: string;
  allTicketTypes: boolean;
  ticketTypeIds: string[];
}

export type CampaignValidationKey = `campaignValidation.${keyof (typeof en)['campaignValidation']}`;
export type CampaignErrors = Partial<Record<keyof CampaignDraft, CampaignValidationKey>>;

export function newCampaignDraft(event: OrganizerEvent, now: Date): CampaignDraft {
  // Start at the next full hour (or when registration opens, if that's later).
  const nextHour = new Date(Math.ceil(now.getTime() / 3_600_000) * 3_600_000);
  const from = nextHour > event.registrationOpensAt ? nextHour : event.registrationOpensAt;
  return {
    name: '',
    code: '',
    discountType: 'percent',
    discountValue: '',
    validFrom: toZonedInputs(from, event.timeZone).dateTimeLocal,
    validUntil: toZonedInputs(event.registrationClosesAt, event.timeZone).dateTimeLocal,
    maxRedemptions: '',
    allTicketTypes: true,
    ticketTypeIds: [],
  };
}

const WHOLE = /^\d+$/;
const CODE = /^[A-Z0-9-]+$/;

export const normaliseCode = (code: string) => code.trim().toUpperCase();

export function validateCampaignDraft(
  draft: CampaignDraft,
  ctx: { timeZone: string; eventEndsAt: Date },
): CampaignErrors {
  const errors: CampaignErrors = {};
  const name = draft.name.trim();
  if (!name) errors.name = 'campaignValidation.nameRequired';
  else if (name.length > CAMPAIGN_LIMITS.nameMax) errors.name = 'campaignValidation.nameTooLong';

  const code = normaliseCode(draft.code);
  if (code && (!CODE.test(code) || code.length < CAMPAIGN_LIMITS.codeMin || code.length > CAMPAIGN_LIMITS.codeMax))
    errors.code = 'campaignValidation.codeInvalid';

  const value = draft.discountValue.trim();
  if (!value) errors.discountValue = 'campaignValidation.discountRequired';
  else if (!WHOLE.test(value) || Number(value) < 1) errors.discountValue = 'campaignValidation.discountInvalid';
  else if (draft.discountType === 'percent' && Number(value) > 100)
    errors.discountValue = 'campaignValidation.percentTooHigh';
  else if (draft.discountType === 'fixed' && Number(value) > CAMPAIGN_LIMITS.fixedMax)
    errors.discountValue = 'campaignValidation.fixedTooHigh';

  const from = zonedDateTimeLocal(draft.validFrom, ctx.timeZone);
  const until = zonedDateTimeLocal(draft.validUntil, ctx.timeZone);
  if (!draft.validFrom) errors.validFrom = 'campaignValidation.validFromRequired';
  else if (!from) errors.validFrom = 'campaignValidation.invalidDateTime';
  if (!draft.validUntil) errors.validUntil = 'campaignValidation.validUntilRequired';
  else if (!until) errors.validUntil = 'campaignValidation.invalidDateTime';
  else if (from && until <= from) errors.validUntil = 'campaignValidation.untilBeforeFrom';
  else if (until > ctx.eventEndsAt) errors.validUntil = 'campaignValidation.untilAfterEvent';

  const max = draft.maxRedemptions.trim();
  if (max && (!WHOLE.test(max) || Number(max) < 1 || Number(max) > CAMPAIGN_LIMITS.redemptionsMax))
    errors.maxRedemptions = 'campaignValidation.redemptionsInvalid';

  if (!draft.allTicketTypes && draft.ticketTypeIds.length === 0)
    errors.ticketTypeIds = 'campaignValidation.ticketTypesRequired';

  return errors;
}

/** Converts a draft that passed validation. */
export function toCampaignInput(draft: CampaignDraft, timeZone: string): CampaignInput {
  const validFrom = zonedDateTimeLocal(draft.validFrom, timeZone);
  const validUntil = zonedDateTimeLocal(draft.validUntil, timeZone);
  if (!validFrom || !validUntil) throw new Error('toCampaignInput called with an invalid draft');
  const max = draft.maxRedemptions.trim();
  return {
    name: draft.name.trim(),
    code: normaliseCode(draft.code),
    discountType: draft.discountType,
    discountValue: Number(draft.discountValue),
    validFrom,
    validUntil,
    maxRedemptions: max ? Number(max) : null,
    ticketTypeIds: draft.allTicketTypes ? [] : draft.ticketTypeIds,
  };
}
