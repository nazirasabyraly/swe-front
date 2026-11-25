/*
 * Platform administration (SRS 4.5, 4.12) and event reports. Contract: docs/backend-contract.md, "Administration".
 * Only `platform_admin` may call the /api/admin endpoints; `reportEvent` is for any signed-in user.
 */
import type { Role } from './auth';
import { json, request } from './http';
import type { PaidSalesState } from './paidSales';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  status: 'active' | 'suspended';
}

export interface AdminEvent {
  id: string;
  title: string;
  organizerName: string;
  status: 'draft' | 'published' | 'cancelled';
  startsAt: Date;
  paidSales: PaidSalesState;
  /** All sales stopped by an admin (SRS 4.12 "suspend events"). */
  suspended: boolean;
  openReports: number;
}

export interface AdminOrder {
  id: string;
  number: string;
  eventTitle: string;
  buyerEmail: string;
  total: number;
  status: string;
  createdAt: Date;
  paymentsSimulated: boolean;
}

export type PaymentKind = 'charge' | 'refund' | 'activation_fee';
export type PaymentStatus = 'succeeded' | 'failed' | 'disputed';

export interface AdminPayment {
  id: string;
  reference: string;
  kind: PaymentKind;
  status: PaymentStatus;
  amount: number;
  orderNumber: string | null;
  eventTitle: string;
  createdAt: Date;
  /** Simulated records must never be shown as real transactions (SRS 4.6). */
  simulated: boolean;
}

export interface EventReport {
  id: string;
  event: { id: string; title: string };
  reason: ReportReason;
  details: string;
  reporter: { name: string; email: string };
  status: 'open' | 'dismissed' | 'actioned';
  createdAt: Date;
}

export type ReportReason = 'fraud' | 'misleading' | 'inappropriate' | 'other';
export const REPORT_REASONS: ReportReason[] = ['fraud', 'misleading', 'inappropriate', 'other'];

export interface ActivationRecord {
  eventId: string;
  eventTitle: string;
  organizerName: string;
  state: PaidSalesState;
  feeAmount: number;
  feeReference: string | null;
  activatedAt: Date | null;
  suspensionReason: string | null;
  simulated: boolean;
}

export interface PromoActivity {
  eventTitle: string;
  code: string;
  status: string;
  redemptions: number;
  discountTotal: number;
}

export interface PlatformSettings {
  /** KZT, charged once per event (SRS 4.5). */
  activationFee: number;
  /** Percent of the discounted subtotal. */
  processingFeePercent: number;
  /** Checkout hold length. */
  holdMinutes: number;
  supportEmail: string;
}

export interface SearchResults {
  users: AdminUser[];
  events: AdminEvent[];
  orders: AdminOrder[];
  payments: AdminPayment[];
}

export interface AdminApi {
  search(query: string): Promise<SearchResults>;
  listEvents(): Promise<AdminEvent[]>;
  setUserSuspended(userId: string, suspended: boolean, reason: string): Promise<AdminUser>;
  setEventSuspended(eventId: string, suspended: boolean, reason: string): Promise<AdminEvent>;
  /** SRS 4.5: stops paid sales only; free registration continues. */
  setPaidSalesSuspended(eventId: string, suspended: boolean, reason: string): Promise<AdminEvent>;
  listReports(): Promise<EventReport[]>;
  resolveReport(id: string, outcome: 'dismissed' | 'actioned'): Promise<EventReport>;
  listActivations(): Promise<ActivationRecord[]>;
  listPayments(filter: { status?: PaymentStatus; kind?: PaymentKind }): Promise<AdminPayment[]>;
  listPromoActivity(): Promise<PromoActivity[]>;
  getSettings(): Promise<PlatformSettings>;
  updateSettings(settings: PlatformSettings): Promise<PlatformSettings>;
  /** Any signed-in user. */
  reportEvent(eventId: string, input: { reason: ReportReason; details: string }): Promise<void>;
}

// ---- HTTP: dates arrive as ISO strings; revive the known date fields ----

const DATE_KEYS = new Set(['startsAt', 'createdAt', 'activatedAt']);
function revive<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value), (key, v) => (DATE_KEYS.has(key) && typeof v === 'string' ? new Date(v) : v)) as T;
}
const get = async <T,>(path: string) => revive<T>(await request<unknown>(path));
const send = async <T,>(path: string, method: string, body: unknown) => revive<T>(await request<unknown>(path, json(method, body)));
const q = (params: Record<string, string | undefined>) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
  return s ? `?${s}` : '';
};

export const httpAdminApi: AdminApi = {
  search: (query) => get(`/api/admin/search${q({ q: query })}`),
  listEvents: () => get('/api/admin/events'),
  setUserSuspended: (id, suspended, reason) => send(`/api/admin/users/${encodeURIComponent(id)}/suspension`, 'PUT', { suspended, reason }),
  setEventSuspended: (id, suspended, reason) => send(`/api/admin/events/${encodeURIComponent(id)}/suspension`, 'PUT', { suspended, reason }),
  setPaidSalesSuspended: (id, suspended, reason) =>
    send(`/api/admin/events/${encodeURIComponent(id)}/paid-sales/suspension`, 'PUT', { suspended, reason }),
  listReports: () => get('/api/admin/reports'),
  resolveReport: (id, outcome) => send(`/api/admin/reports/${encodeURIComponent(id)}`, 'PATCH', { status: outcome }),
  listActivations: () => get('/api/admin/activations'),
  listPayments: ({ status, kind }) => get(`/api/admin/payments${q({ status, kind })}`),
  listPromoActivity: () => get('/api/admin/promo-activity'),
  getSettings: () => get('/api/admin/settings'),
  updateSettings: (settings) => send('/api/admin/settings', 'PUT', settings),
  async reportEvent(eventId, input) {
    await request(`/api/public/events/${encodeURIComponent(eventId)}/reports`, json('POST', input));
  },
};
