/*
 * Paid-sales activation API client (SRS 4.5). Contract: docs/backend-contract.md,
 * "Paid sales activation". Activation is per event. Every check is a SIMULATION
 * in the academic MVP: no identity provider, bank or card network is involved,
 * and the fee is recorded, not charged.
 */
import { json, request } from './http';

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
  checklistIncomplete: 'checklist_incomplete',
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

export interface PaidSalesStatusDto {
  eventId: string;
  state: PaidSalesState;
  simulated: boolean;
  activationFee: number;
  termsVersion: string;
  checklist: {
    identity: { done: boolean; verifiedName?: string };
    payout: { done: boolean; accountLast4?: string };
    fee: { done: boolean; paidAt?: string; reference?: string };
    terms: { done: boolean; acceptedAt?: string };
  };
  activatedAt?: string;
  suspension?: { reason: string; suspendedAt: string };
}

const date = (value?: string) => (value ? new Date(value) : undefined);

export function paidSalesFromDto(dto: PaidSalesStatusDto): PaidSalesStatus {
  const { fee, terms } = dto.checklist;
  return {
    ...dto,
    checklist: {
      ...dto.checklist,
      fee: { ...fee, paidAt: date(fee.paidAt) },
      terms: { ...terms, acceptedAt: date(terms.acceptedAt) },
    },
    activatedAt: date(dto.activatedAt),
    suspension: dto.suspension && { ...dto.suspension, suspendedAt: new Date(dto.suspension.suspendedAt) },
  };
}

const base = (eventId: string) => `/api/events/${encodeURIComponent(eventId)}/paid-sales`;
const post = async (path: string, body: unknown = {}) =>
  paidSalesFromDto(await request<PaidSalesStatusDto>(path, json('POST', body)));

export const httpPaidSalesApi: PaidSalesApi = {
  async getPaidSales(eventId) {
    return paidSalesFromDto(await request<PaidSalesStatusDto>(base(eventId)));
  },
  verifyIdentity: (eventId, input) => post(`${base(eventId)}/identity`, input),
  connectPayout: (eventId, input) => post(`${base(eventId)}/payout`, input),
  payActivationFee: (eventId) => post(`${base(eventId)}/fee`),
  acceptTerms: (eventId, termsVersion) => post(`${base(eventId)}/terms`, { termsVersion }),
  activate: (eventId) => post(`${base(eventId)}/activate`),
};
