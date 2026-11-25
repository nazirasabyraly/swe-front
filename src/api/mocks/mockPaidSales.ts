import type { EventsApi } from '../events';
import { PAID_SALES_ERRORS, type PaidSalesApi, type PaidSalesStatus } from '../paidSales';
import { mockDelay, mockError } from './util';

/** In-browser stand-in for the paid-sales activation endpoints. Nothing is verified or charged. */

const FEE = 9900; // prototype screen 3: "One-time 9 900 ₸ per event"
const TERMS_VERSION = '2026-09';

export interface MockPaidSalesApi extends PaidSalesApi {
  /** Mock-only: what a platform admin's "suspend paid sales" does (admin portal comes in Phase 2). */
  suspend(eventId: string, reason: string): void;
  /** Mock-only: lifts an admin suspension, back to active if the checklist was complete. */
  reinstate(eventId: string): void;
}

const fresh = (eventId: string): PaidSalesStatus => ({
  eventId,
  state: 'not_started',
  simulated: true,
  activationFee: FEE,
  termsVersion: TERMS_VERSION,
  checklist: { identity: { done: false }, payout: { done: false }, fee: { done: false }, terms: { done: false } },
});

/** The seeded "Almaty Nights" event already sells paid tickets (prototype screen 3). */
function activeSeed(eventId: string): PaidSalesStatus {
  const at = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  return {
    ...fresh(eventId),
    state: 'active',
    activatedAt: at,
    checklist: {
      identity: { done: true, verifiedName: 'Demo Organizer' },
      payout: { done: true, accountLast4: '4417' },
      fee: { done: true, paidAt: at, reference: 'SIM-9900-0001' },
      terms: { done: true, acceptedAt: at },
    },
  };
}

const IIN = /^\d{12}$/;
const KZ_IBAN = /^KZ\d{2}[A-Z0-9]{16}$/;

export function createMockPaidSalesApi(
  events: EventsApi,
  activeEventIds: string[] = ['evt-almaty-nights', 'evt-winter-gala'],
  /** Current platform activation fee (admin settings); fixed at 9 900 ₸ when omitted. */
  activationFee: () => number = () => FEE,
): MockPaidSalesApi {
  const store = new Map<string, PaidSalesStatus>();

  async function statusOf(eventId: string): Promise<PaidSalesStatus> {
    await events.getEvent(eventId); // 404s like the real API for unknown events
    if (!store.has(eventId)) {
      const initial = activeEventIds.includes(eventId) ? activeSeed(eventId) : fresh(eventId);
      if (initial.state !== 'active') initial.activationFee = activationFee();
      store.set(eventId, initial);
    }
    return store.get(eventId)!;
  }

  /** Applies a checklist change unless paid sales are suspended or already active. */
  async function update(eventId: string, change: (s: PaidSalesStatus) => void): Promise<PaidSalesStatus> {
    await mockDelay();
    const status = await statusOf(eventId);
    if (status.state === 'suspended') {
      throw mockError(409, PAID_SALES_ERRORS.suspended, 'Paid sales for this event are suspended.');
    }
    if (status.state !== 'active') {
      change(status);
      status.state = 'in_progress';
    }
    return structuredClone(status);
  }

  return {
    async getPaidSales(eventId) {
      await mockDelay();
      return structuredClone(await statusOf(eventId));
    },
    verifyIdentity(eventId, { fullName, iin }) {
      if (!IIN.test(iin)) return Promise.reject(mockError(422, PAID_SALES_ERRORS.invalidIin, 'An IIN has 12 digits.'));
      return update(eventId, (s) => {
        s.checklist.identity = { done: true, verifiedName: fullName.trim() };
      });
    },
    connectPayout(eventId, { iban }) {
      const normalised = iban.replace(/\s/g, '').toUpperCase();
      if (!KZ_IBAN.test(normalised)) {
        return Promise.reject(mockError(422, PAID_SALES_ERRORS.invalidIban, 'Enter a Kazakhstan IBAN (KZ + 18 characters).'));
      }
      return update(eventId, (s) => {
        s.checklist.payout = { done: true, accountLast4: normalised.slice(-4) };
      });
    },
    payActivationFee(eventId) {
      return update(eventId, (s) => {
        s.checklist.fee = { done: true, paidAt: new Date(), reference: `SIM-${FEE}-${eventId.slice(-4).toUpperCase()}` };
      });
    },
    acceptTerms(eventId) {
      return update(eventId, (s) => {
        s.checklist.terms = { done: true, acceptedAt: new Date() };
      });
    },
    async activate(eventId) {
      await mockDelay();
      const status = await statusOf(eventId);
      if (status.state === 'suspended') {
        throw mockError(409, PAID_SALES_ERRORS.suspended, 'Paid sales for this event are suspended.');
      }
      if (!Object.values(status.checklist).every((item) => item.done)) {
        throw mockError(409, PAID_SALES_ERRORS.checklistIncomplete, 'Complete every checklist item first.');
      }
      status.state = 'active';
      status.activatedAt ??= new Date();
      return structuredClone(status);
    },
    reinstate(eventId) {
      const status = store.get(eventId);
      if (!status || status.state !== 'suspended') return;
      const complete = Object.values(status.checklist).every((item) => item.done);
      store.set(eventId, { ...status, state: complete ? 'active' : 'in_progress', suspension: undefined });
    },
    suspend(eventId, reason) {
      const status = store.get(eventId) ?? (activeEventIds.includes(eventId) ? activeSeed(eventId) : fresh(eventId));
      store.set(eventId, { ...status, state: 'suspended', suspension: { reason, suspendedAt: new Date() } });
    },
  };
}
