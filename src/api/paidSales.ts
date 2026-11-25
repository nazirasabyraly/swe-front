/*
 * Paid-sales activation API client (SRS 4.5). Backend: GET /events/:id/activation,
 * POST /events/:id/activate-paid-sales, POST /organizers/me/verify, POST /organizers/me/payout-accounts.
 * Every check is a SIMULATION: no identity provider, bank or card network is involved.
 *
 * How the app's checklist maps onto the backend's:
 * - identity = organizer profile complete + verified (the IIN is not sent; the backend has no field for it).
 * - payout   = a connected sandbox payout account (only the IBAN's last 4 characters are sent).
 * - fee      = confirmed in the app; the backend records the fee payment when sales are activated.
 * - terms    = accepted in the app; the backend doesn't track terms.
 * The fee and terms confirmations are kept in this browser.
 */
import { ApiError, fromMinor, json, request } from './http';
import { connectPayoutAccount, getProfileDto, saveProfile } from './organizer';

/**
 * - `not_started` / `in_progress`: paid tickets can't be bought yet.
 * - `active`: paid tickets can be bought.
 * - `suspended`: a platform admin stopped paid sales; the organizer can't undo it.
 */
export type PaidSalesState = 'not_started' | 'in_progress' | 'active' | 'suspended';

export interface PaidSalesStatus {
  eventId: string;
  state: PaidSalesState;
  /** True while payments are simulated. The UI labels everything SIMULATION while it's true. */
  simulated: boolean;
  /** One-time fee in KZT, set by the server. */
  activationFee: number;
  termsVersion: string;
  checklist: {
    identity: { done: boolean; verifiedName?: string };
    payout: { done: boolean; accountLast4?: string };
    fee: { done: boolean; paidAt?: Date; reference?: string };
    terms: { done: boolean; acceptedAt?: Date };
  };
  activatedAt?: Date;
  suspension?: { reason: string; suspendedAt: Date };
}

export type ActivationItem = keyof PaidSalesStatus['checklist'];

export const PAID_SALES_ERRORS = {
  checklistIncomplete: 'activation_checklist_incomplete',
  suspended: 'paid_sales_suspended',
  invalidIin: 'invalid_iin',
  invalidIban: 'invalid_iban',
} as const;

export interface PaidSalesApi {
  getPaidSales(eventId: string): Promise<PaidSalesStatus>;
  /** Simulated sandbox identity check. */
  verifyIdentity(eventId: string, input: { fullName: string; iin: string }): Promise<PaidSalesStatus>;
  /** Simulated payout account; the server keeps the IBAN and returns only its last 4 characters. */
  connectPayout(eventId: string, input: { accountHolder: string; iban: string }): Promise<PaidSalesStatus>;
  /** Records the simulated activation fee payment. No money moves. */
  payActivationFee(eventId: string): Promise<PaidSalesStatus>;
  acceptTerms(eventId: string, termsVersion: string): Promise<PaidSalesStatus>;
  /** Server re-checks the checklist; `409 checklist_incomplete` otherwise. */
  activate(eventId: string): Promise<PaidSalesStatus>;
}

/** Backend `ActivationStatusRead`, after camelCasing. */
interface ActivationDto {
  eventId: string;
  paidSalesActive: boolean;
  feeMinor: number;
  profileComplete: boolean;
  verified: boolean;
  payoutAccountConnected: boolean;
  activationPayment: {
    status: 'initiated' | 'succeeded' | 'failed';
    providerRef: string | null;
    failureReason: string | null;
    completedAt: string | null;
  } | null;
}

const TERMS_VERSION = '2026-01';

interface LocalSteps {
  feeConfirmedAt?: string;
  termsAcceptedAt?: string;
}
const stepsKey = (eventId: string) => `biletflow.paidSales.${eventId}`;
function readSteps(eventId: string): LocalSteps {
  try {
    return JSON.parse(localStorage.getItem(stepsKey(eventId)) ?? '{}') as LocalSteps;
  } catch {
    return {};
  }
}
function writeSteps(eventId: string, change: LocalSteps) {
  try {
    localStorage.setItem(stepsKey(eventId), JSON.stringify({ ...readSteps(eventId), ...change }));
  } catch {
    // Storage blocked: the step has to be confirmed again after a reload.
  }
}

const base = (eventId: string) => `/events/${encodeURIComponent(eventId)}`;

async function getPaidSales(eventId: string): Promise<PaidSalesStatus> {
  const [a, profile, accounts] = await Promise.all([
    request<ActivationDto>(`${base(eventId)}/activation`),
    getProfileDto(),
    request<{ providerRef: string; status: string }[]>('/organizers/me/payout-accounts').catch(() => []),
  ]);
  const local = readSteps(eventId);
  const payment = a.activationPayment?.status === 'succeeded' ? a.activationPayment : null;
  const account = accounts.find((x) => x.status === 'connected');
  const feePaidAt = payment?.completedAt ?? local.feeConfirmedAt;
  const checklist: PaidSalesStatus['checklist'] = {
    identity: { done: a.profileComplete && a.verified, verifiedName: a.verified ? profile?.displayName : undefined },
    payout: { done: a.payoutAccountConnected, accountLast4: account?.providerRef.slice(-4) },
    fee: { done: a.paidSalesActive || !!feePaidAt, paidAt: feePaidAt ? new Date(feePaidAt) : undefined, reference: payment?.providerRef ?? undefined },
    terms: {
      done: a.paidSalesActive || !!local.termsAcceptedAt,
      acceptedAt: local.termsAcceptedAt ? new Date(local.termsAcceptedAt) : undefined,
    },
  };
  const anyDone = Object.values(checklist).some((step) => step.done);
  return {
    eventId: a.eventId,
    state: a.paidSalesActive ? 'active' : anyDone ? 'in_progress' : 'not_started',
    simulated: true,
    activationFee: fromMinor(a.feeMinor),
    termsVersion: TERMS_VERSION,
    checklist,
    activatedAt: a.paidSalesActive && payment?.completedAt ? new Date(payment.completedAt) : undefined,
  };
}

export const httpPaidSalesApi: PaidSalesApi = {
  getPaidSales,
  async verifyIdentity(eventId, { fullName }) {
    const profile = await getProfileDto();
    if (!profile || (!profile.contactEmail && !profile.contactPhone)) {
      const me = await request<{ email: string }>('/me');
      await saveProfile({
        displayName: profile?.displayName || fullName,
        contactEmail: me.email,
        contactPhone: profile?.contactPhone ?? undefined,
      });
    }
    await request('/organizers/me/verify', { method: 'POST' });
    return getPaidSales(eventId);
  },
  async connectPayout(eventId, { iban }) {
    await connectPayoutAccount(iban);
    return getPaidSales(eventId);
  },
  async payActivationFee(eventId) {
    writeSteps(eventId, { feeConfirmedAt: new Date().toISOString() });
    return getPaidSales(eventId);
  },
  async acceptTerms(eventId) {
    writeSteps(eventId, { termsAcceptedAt: new Date().toISOString() });
    return getPaidSales(eventId);
  },
  async activate(eventId) {
    const local = readSteps(eventId);
    if (!local.feeConfirmedAt || !local.termsAcceptedAt) {
      throw new ApiError(422, { code: PAID_SALES_ERRORS.checklistIncomplete, serverMessage: 'Complete every step first' });
    }
    // Records the (simulated) activation fee payment and turns paid sales on.
    const a = await request<ActivationDto>(`${base(eventId)}/activate-paid-sales`, json('POST', { simulate: 'success' }));
    if (!a.paidSalesActive) {
      throw new ApiError(402, {
        code: 'payment_declined',
        serverMessage: a.activationPayment?.failureReason ?? 'The activation fee payment failed',
      });
    }
    return getPaidSales(eventId);
  },
};
