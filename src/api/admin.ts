/*
 * Platform administration (SRS 4.5, 4.12) and event reports. Backend: /admin/*.
 * Only `platform_admin` may call the /admin endpoints; `reportEvent` is for any signed-in user.
 *
 * Not on the backend yet (they fail with a "not supported" error): event reports,
 * suspending paid sales only, and promo activity. Search covers users and events; the backend
 * can't search orders or payments. Only activation fees and ticket payments exist (no refund
 * records). Settings hold only the activation fee.
 */
import type { Role } from './auth';
import { fromMinor, json, notSupported, orderNumber, request, toMinor, type Page } from './http';
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

// ---- HTTP (backend schemas, after camelCasing) ----

interface AdminUserDto {
  id: string;
  email: string;
  fullName: string;
  status: 'active' | 'suspended';
  roles: Role[];
}
interface AdminEventDto {
  id: string;
  title: string;
  organizerName: string;
  status: AdminEvent['status'];
  startsAt: string;
  paidSalesActive: boolean;
  suspendedAt: string | null;
}
interface PaymentDto {
  id: string;
  orderId: string | null;
  eventId: string | null;
  purpose: 'ticket_purchase' | 'activation_fee';
  amountMinor: number;
  status: 'initiated' | 'succeeded' | 'failed';
  providerRef: string | null;
  isSimulated: boolean;
  createdAt: string;
  completedAt: string | null;
}

const userFromDto = (u: AdminUserDto): AdminUser => ({ id: u.id, name: u.fullName, email: u.email, roles: u.roles, status: u.status });
const eventFromDto = (e: AdminEventDto): AdminEvent => ({
  id: e.id,
  title: e.title,
  organizerName: e.organizerName,
  status: e.status,
  startsAt: new Date(e.startsAt),
  paidSales: e.paidSalesActive ? 'active' : 'not_started',
  suspended: e.suspendedAt !== null,
  openReports: 0,
});

const q = (params: Record<string, string | undefined>) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
  return s ? `?${s}` : '';
};

const listEventDtos = async (query?: string) =>
  (await request<Page<AdminEventDto>>(`/admin/events${q({ q: query, limit: '100' })}`)).items;

const listPaymentDtos = async (purpose?: PaymentDto['purpose']) =>
  (await request<Page<PaymentDto>>(`/admin/payments${q({ purpose, limit: '100' })}`)).items;

const KIND: Record<PaymentDto['purpose'], PaymentKind> = { ticket_purchase: 'charge', activation_fee: 'activation_fee' };

async function eventsById() {
  return new Map((await listEventDtos()).map((e) => [e.id, e]));
}

const userAction = (id: string, suspended: boolean, reason: string) =>
  request<AdminUserDto>(
    `/admin/users/${encodeURIComponent(id)}/${suspended ? 'suspend' : 'unsuspend'}`,
    suspended ? json('POST', { reason }) : { method: 'POST' },
  );
const eventAction = (id: string, suspended: boolean, reason: string) =>
  request<AdminEventDto>(
    `/admin/events/${encodeURIComponent(id)}/${suspended ? 'suspend' : 'unsuspend'}`,
    suspended ? json('POST', { reason }) : { method: 'POST' },
  );

export const httpAdminApi: AdminApi = {
  async search(query) {
    const [users, events] = await Promise.all([
      request<Page<AdminUserDto>>(`/admin/users${q({ q: query, limit: '50' })}`),
      listEventDtos(query),
    ]);
    return { users: users.items.map(userFromDto), events: events.map(eventFromDto), orders: [], payments: [] };
  },
  async listEvents() {
    return (await listEventDtos()).map(eventFromDto);
  },
  async setUserSuspended(id, suspended, reason) {
    return userFromDto(await userAction(id, suspended, reason));
  },
  async setEventSuspended(id, suspended, reason) {
    return eventFromDto(await eventAction(id, suspended, reason));
  },
  setPaidSalesSuspended: async () => notSupported('Suspending paid sales only'),
  listReports: async () => notSupported('Event reports'),
  resolveReport: async () => notSupported('Event reports'),
  async listActivations() {
    const [payments, events] = await Promise.all([
      request<Page<PaymentDto>>('/admin/activation-records?limit=100'),
      eventsById(),
    ]);
    return payments.items.map((p) => {
      const event = p.eventId ? events.get(p.eventId) : undefined;
      return {
        eventId: p.eventId ?? '',
        eventTitle: event?.title ?? '',
        organizerName: event?.organizerName ?? '',
        state: event?.paidSalesActive ? 'active' : 'in_progress',
        feeAmount: fromMinor(p.amountMinor),
        feeReference: p.providerRef,
        activatedAt: p.status === 'succeeded' && p.completedAt ? new Date(p.completedAt) : null,
        suspensionReason: null,
        simulated: p.isSimulated,
      };
    });
  },
  async listPayments({ status, kind }) {
    if (kind === 'refund') return [];
    const purpose = kind === 'charge' ? 'ticket_purchase' : kind;
    const [payments, events] = await Promise.all([listPaymentDtos(purpose), eventsById()]);
    return payments
      .filter((p) => !status || p.status === status)
      .map((p) => ({
        id: p.id,
        reference: p.providerRef ?? p.id,
        kind: KIND[p.purpose],
        // `initiated` (never completed) is shown as failed.
        status: p.status === 'succeeded' ? 'succeeded' : 'failed',
        amount: fromMinor(p.amountMinor),
        orderNumber: p.orderId ? orderNumber(p.orderId) : null,
        eventTitle: (p.eventId && events.get(p.eventId)?.title) || '',
        createdAt: new Date(p.createdAt),
        simulated: p.isSimulated,
      }));
  },
  listPromoActivity: async () => notSupported('Promo activity'),
  async getSettings() {
    const s = await request<{ activationFeeMinor: number }>('/admin/settings');
    return { activationFee: fromMinor(s.activationFeeMinor), processingFeePercent: 0, holdMinutes: 10, supportEmail: '' };
  },
  async updateSettings(settings) {
    const s = await request<{ activationFeeMinor: number }>(
      '/admin/settings',
      json('PATCH', { activationFeeMinor: toMinor(settings.activationFee) }),
    );
    return { ...settings, activationFee: fromMinor(s.activationFeeMinor) };
  },
  reportEvent: async () => notSupported('Reporting events'),
};
