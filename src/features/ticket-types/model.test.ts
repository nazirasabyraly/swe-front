import type { TicketType } from '../../api/ticketTypes';
import { ticketTypeStatus, toTicketTypeInput, validateTicketTypeDraft, type TicketTypeDraft } from './model';

const ctx = { timeZone: 'Asia/Almaty', eventEndsAt: new Date('2026-10-12T18:00:00Z'), minQuantity: 0 };
const valid: TicketTypeDraft = {
  name: 'General admission',
  description: '',
  kind: 'paid',
  price: '6500',
  quantity: '800',
  salesStartAt: '2026-09-25T10:00',
  salesEndAt: '2026-10-12T17:00',
  maxPerOrder: '10',
};

describe('ticket type validation', () => {
  it('accepts a valid paid type and converts sale times from the event zone', () => {
    expect(validateTicketTypeDraft(valid, ctx)).toEqual({});
    expect(toTicketTypeInput(valid, 'Asia/Almaty')).toMatchObject({
      price: 6500,
      quantity: 800,
      salesStartAt: new Date('2026-09-25T05:00:00Z'),
      salesEndAt: new Date('2026-10-12T12:00:00Z'),
    });
  });

  it('ignores the price for free types and sends 0', () => {
    const free = { ...valid, kind: 'free' as const, price: '' };
    expect(validateTicketTypeDraft(free, ctx)).toEqual({});
    expect(toTicketTypeInput(free, 'Asia/Almaty').price).toBe(0);
  });

  it.each<[Partial<TicketTypeDraft>, keyof TicketTypeDraft, string]>([
    [{ name: ' ' }, 'name', 'ticketValidation.nameRequired'],
    [{ price: '' }, 'price', 'ticketValidation.priceRequired'],
    [{ price: '99.5' }, 'price', 'ticketValidation.priceInvalid'],
    [{ price: '0' }, 'price', 'ticketValidation.priceInvalid'],
    [{ quantity: '0' }, 'quantity', 'ticketValidation.quantityInvalid'],
    [{ salesEndAt: '2026-09-20T10:00' }, 'salesEndAt', 'ticketValidation.salesEndBeforeStart'],
    [{ salesEndAt: '2026-10-13T10:00' }, 'salesEndAt', 'ticketValidation.salesEndAfterEvent'],
    [{ maxPerOrder: '51' }, 'maxPerOrder', 'ticketValidation.maxPerOrderInvalid'],
    [{ quantity: '5', maxPerOrder: '6' }, 'maxPerOrder', 'ticketValidation.maxPerOrderAboveQuantity'],
  ])('rejects %o', (change, field, key) => {
    expect(validateTicketTypeDraft({ ...valid, ...change }, ctx)[field]).toBe(key);
  });

  it('does not allow quantity below what is already sold or reserved', () => {
    expect(validateTicketTypeDraft({ ...valid, quantity: '100' }, { ...ctx, minQuantity: 162 }).quantity).toBe(
      'ticketValidation.quantityBelowSold',
    );
  });
});

describe('ticket type status', () => {
  const type: TicketType = {
    id: 't',
    eventId: 'e',
    ...toTicketTypeInput(valid, 'Asia/Almaty'),
    hidden: false,
    counts: { available: 10, reserved: 0, sold: 790, refunded: 0, checkedIn: 0 },
  };
  const during = new Date('2026-10-01T00:00:00Z');

  it.each<[Partial<TicketType>, Date, string]>([
    [{}, during, 'onSale'],
    [{}, new Date('2026-09-01T00:00:00Z'), 'scheduled'],
    [{}, new Date('2026-10-12T13:00:00Z'), 'ended'],
    [{ counts: { ...type.counts, available: 0 } }, during, 'soldOut'],
    [{ hidden: true, counts: { ...type.counts, available: 0 } }, during, 'hidden'],
  ])('%o at %s → %s', (change, now, expected) => {
    expect(ticketTypeStatus({ ...type, ...change }, now, 'active')).toBe(expected);
  });

  it.each<[TicketType['kind'], Parameters<typeof ticketTypeStatus>[2], string]>([
    ['paid', 'not_started', 'awaitingActivation'],
    ['paid', 'in_progress', 'awaitingActivation'],
    ['paid', 'unknown', 'awaitingActivation'],
    ['paid', 'suspended', 'salesSuspended'],
    ['paid', 'active', 'onSale'],
    ['free', 'not_started', 'onSale'],
    ['free', 'suspended', 'onSale'],
  ])('%s ticket with paid sales %s → %s', (kind, paidSales, expected) => {
    expect(ticketTypeStatus({ ...type, kind }, during, paidSales)).toBe(expected);
  });
});
