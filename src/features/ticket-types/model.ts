import type { OrganizerEvent } from '../../api/events';
import type { PaidSalesState } from '../../api/paidSales';
import type { TicketKind, TicketType, TicketTypeInput } from '../../api/ticketTypes';
import type en from '../../i18n/locales/en.json';
import { toZonedInputs, zonedDateTimeLocal } from '../../lib/timezone';

export const TICKET_LIMITS = {
  nameMax: 80,
  descriptionMax: 300,
  priceMax: 10_000_000,
  quantityMax: 100_000,
  maxPerOrderMax: 50,
  defaultMaxPerOrder: 10,
} as const;

/** Form state; sale times are datetime-local strings in the event's time zone. */
export interface TicketTypeDraft {
  name: string;
  description: string;
  kind: TicketKind;
  price: string;
  quantity: string;
  salesStartAt: string;
  salesEndAt: string;
  maxPerOrder: string;
}

export type TicketValidationKey = `ticketValidation.${keyof (typeof en)['ticketValidation']}`;
export type TicketTypeErrors = Partial<Record<keyof TicketTypeDraft, TicketValidationKey>>;

export interface TicketTypeContext {
  timeZone: string;
  eventEndsAt: Date;
  /** Sold + reserved; quantity can't go below it. 0 for new types. */
  minQuantity: number;
}

export function newTicketTypeDraft(event: OrganizerEvent): TicketTypeDraft {
  return {
    name: '',
    description: '',
    kind: 'free',
    price: '',
    quantity: '',
    salesStartAt: toZonedInputs(event.registrationOpensAt, event.timeZone).dateTimeLocal,
    salesEndAt: toZonedInputs(event.registrationClosesAt, event.timeZone).dateTimeLocal,
    maxPerOrder: String(TICKET_LIMITS.defaultMaxPerOrder),
  };
}

export function draftFromTicketType(type: TicketType, timeZone: string): TicketTypeDraft {
  return {
    name: type.name,
    description: type.description,
    kind: type.kind,
    price: type.kind === 'paid' ? String(type.price) : '',
    quantity: String(type.quantity),
    salesStartAt: toZonedInputs(type.salesStartAt, timeZone).dateTimeLocal,
    salesEndAt: toZonedInputs(type.salesEndAt, timeZone).dateTimeLocal,
    maxPerOrder: String(type.maxPerOrder),
  };
}

const WHOLE = /^\d+$/;

export function validateTicketTypeDraft(draft: TicketTypeDraft, ctx: TicketTypeContext): TicketTypeErrors {
  const errors: TicketTypeErrors = {};
  const name = draft.name.trim();
  if (!name) errors.name = 'ticketValidation.nameRequired';
  else if (name.length > TICKET_LIMITS.nameMax) errors.name = 'ticketValidation.nameTooLong';

  if (draft.description.trim().length > TICKET_LIMITS.descriptionMax)
    errors.description = 'ticketValidation.descriptionTooLong';

  if (draft.kind === 'paid') {
    const price = draft.price.trim();
    if (!price) errors.price = 'ticketValidation.priceRequired';
    else if (!WHOLE.test(price) || Number(price) < 1) errors.price = 'ticketValidation.priceInvalid';
    else if (Number(price) > TICKET_LIMITS.priceMax) errors.price = 'ticketValidation.priceTooHigh';
  }

  const quantity = draft.quantity.trim();
  if (!quantity) errors.quantity = 'ticketValidation.quantityRequired';
  else if (!WHOLE.test(quantity) || Number(quantity) < 1) errors.quantity = 'ticketValidation.quantityInvalid';
  else if (Number(quantity) > TICKET_LIMITS.quantityMax) errors.quantity = 'ticketValidation.quantityTooLarge';
  else if (Number(quantity) < ctx.minQuantity) errors.quantity = 'ticketValidation.quantityBelowSold';

  const start = zonedDateTimeLocal(draft.salesStartAt, ctx.timeZone);
  const end = zonedDateTimeLocal(draft.salesEndAt, ctx.timeZone);
  if (!draft.salesStartAt) errors.salesStartAt = 'ticketValidation.salesStartRequired';
  else if (!start) errors.salesStartAt = 'ticketValidation.invalidDateTime';
  if (!draft.salesEndAt) errors.salesEndAt = 'ticketValidation.salesEndRequired';
  else if (!end) errors.salesEndAt = 'ticketValidation.invalidDateTime';
  else if (start && end <= start) errors.salesEndAt = 'ticketValidation.salesEndBeforeStart';
  else if (end > ctx.eventEndsAt) errors.salesEndAt = 'ticketValidation.salesEndAfterEvent';

  const max = draft.maxPerOrder.trim();
  if (!WHOLE.test(max) || Number(max) < 1 || Number(max) > TICKET_LIMITS.maxPerOrderMax)
    errors.maxPerOrder = 'ticketValidation.maxPerOrderInvalid';
  else if (WHOLE.test(quantity) && Number(max) > Number(quantity))
    errors.maxPerOrder = 'ticketValidation.maxPerOrderAboveQuantity';

  return errors;
}

/** Converts a draft that passed validation. */
export function toTicketTypeInput(draft: TicketTypeDraft, timeZone: string): TicketTypeInput {
  const salesStartAt = zonedDateTimeLocal(draft.salesStartAt, timeZone);
  const salesEndAt = zonedDateTimeLocal(draft.salesEndAt, timeZone);
  if (!salesStartAt || !salesEndAt) throw new Error('toTicketTypeInput called with an invalid draft');
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    kind: draft.kind,
    price: draft.kind === 'paid' ? Number(draft.price) : 0,
    quantity: Number(draft.quantity),
    salesStartAt,
    salesEndAt,
    maxPerOrder: Number(draft.maxPerOrder),
  };
}

export type TicketTypeStatus =
  | 'hidden'
  | 'salesSuspended'
  | 'awaitingActivation'
  | 'soldOut'
  | 'scheduled'
  | 'ended'
  | 'onSale';

/**
 * Display status. Sold-out comes from the server's counters, never from client arithmetic.
 * Paid types can't be bought until the event's paid sales are active (SRS 4.5), so
 * pass `'unknown'` when the activation status couldn't be loaded: they never show "On sale".
 */
export function ticketTypeStatus(
  type: TicketType,
  now: Date,
  paidSales: PaidSalesState | 'unknown',
): TicketTypeStatus {
  if (type.hidden) return 'hidden';
  if (type.kind === 'paid' && paidSales === 'suspended') return 'salesSuspended';
  if (type.kind === 'paid' && paidSales !== 'active') return 'awaitingActivation';
  if (type.counts.available === 0) return 'soldOut';
  if (now < type.salesStartAt) return 'scheduled';
  if (now > type.salesEndAt) return 'ended';
  return 'onSale';
}
