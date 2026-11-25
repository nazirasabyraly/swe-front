import type {
  ActivationRecord,
  AdminApi,
  AdminEvent,
  AdminOrder,
  AdminPayment,
  AdminUser,
  EventReport,
  PromoActivity,
} from '../admin';
import type { EventsApi, OrganizerEvent } from '../events';
import { mockAccountInfo, mockAllAccounts, mockSessionUserId } from './mockAuth';
import type { MockCampaignsApi } from './mockCampaigns';
import type { MockOrdersApi } from './mockOrders';
import type { MockOrganizerApi } from './mockOrganizer';
import type { MockPaidSalesApi } from './mockPaidSales';
import type { MockModeration } from './mockPublicEvents';
import { mockDelay, mockError, mockId } from './util';

/** In-browser stand-in for the admin endpoints. Every payment record here is simulated. */

interface Deps {
  events: EventsApi;
  paidSales: MockPaidSalesApi;
  campaigns: MockCampaignsApi;
  orders: MockOrdersApi;
  organizer: MockOrganizerApi;
  moderation: MockModeration;
}

const day = 24 * 60 * 60 * 1000;

export function createMockAdminApi(deps: Deps): AdminApi {
  const { moderation } = deps;
  const reports: EventReport[] = [
    {
      id: 'rep-1', event: { id: 'evt-almaty-nights', title: 'Almaty Nights — Vol. 4' }, reason: 'misleading',
      details: 'The poster says the headliner is confirmed, but their page says otherwise.',
      reporter: { name: 'Demo Attendee', email: 'attendee@demo.kz' }, status: 'open', createdAt: new Date(Date.now() - 2 * day),
    },
  ];
  /** Seeded failures and disputes; real ones come from the payment provider's webhooks. */
  const extraPayments: AdminPayment[] = [
    { id: 'pay-f1', reference: 'SIM-FAIL-0007', kind: 'charge', status: 'failed', amount: 13455, orderNumber: null, eventTitle: 'Almaty Nights — Vol. 4', createdAt: new Date(Date.now() - 1 * day), simulated: true },
    { id: 'pay-d1', reference: 'SIM-DSP-0002', kind: 'charge', status: 'disputed', amount: 3623, orderNumber: 'BF-FLM2Q8', eventTitle: 'Steppe Film Festival — Spring Screening', createdAt: new Date(Date.now() - 45 * day), simulated: true },
  ];

  function requireAdmin() {
    const id = mockSessionUserId();
    if (!id || !mockAccountInfo(id)?.roles.includes('platform_admin')) throw mockError(403, 'forbidden', 'Platform admins only.');
  }

  const users = (): AdminUser[] =>
    mockAllAccounts().map((a) => ({ id: a.id, name: a.name, email: a.email, roles: a.roles, status: moderation.suspendedUsers.has(a.id) ? 'suspended' : 'active' }));

  async function adminEvent(e: OrganizerEvent): Promise<AdminEvent> {
    const paid = await deps.paidSales.getPaidSales(e.id);
    return {
      id: e.id, title: e.title, organizerName: 'Nomad Sound Collective', status: e.status, startsAt: e.startsAt,
      paidSales: paid.state, suspended: moderation.suspendedEvents.has(e.id),
      openReports: reports.filter((r) => r.event.id === e.id && r.status === 'open').length,
    };
  }

  const allEvents = async () => Promise.all((await deps.events.listMyEvents()).map(adminEvent));

  async function allOrders(): Promise<AdminOrder[]> {
    return (await deps.orders.allOrders()).map(({ userId, order }) => ({
      id: order.id, number: order.number, eventTitle: order.event.title, buyerEmail: mockAccountInfo(userId)?.email ?? '—',
      total: order.total, status: order.status, createdAt: order.createdAt, paymentsSimulated: order.paymentsSimulated,
    }));
  }

  async function allPayments(): Promise<AdminPayment[]> {
    const fromOrders = (await deps.orders.allOrders()).flatMap(({ order }): AdminPayment[] => {
      if (order.total === 0) return [];
      const charge: AdminPayment = {
        id: `pay-${order.id}`, reference: `SIM-${order.number}`, kind: 'charge', status: 'succeeded', amount: order.total,
        orderNumber: order.number, eventTitle: order.event.title, createdAt: order.createdAt, simulated: true,
      };
      return order.status === 'refunded'
        ? [charge, { ...charge, id: `ref-${order.id}`, reference: `SIM-REF-${order.number}`, kind: 'refund' }]
        : [charge];
    });
    const fees = (await deps.events.listMyEvents()).map(async (e): Promise<AdminPayment | null> => {
      const p = await deps.paidSales.getPaidSales(e.id);
      return p.checklist.fee.done && p.checklist.fee.paidAt
        ? { id: `fee-${e.id}`, reference: p.checklist.fee.reference ?? 'SIM-FEE', kind: 'activation_fee', status: 'succeeded', amount: p.activationFee, orderNumber: null, eventTitle: e.title, createdAt: p.checklist.fee.paidAt, simulated: true }
        : null;
    });
    const feeList = (await Promise.all(fees)).filter((f): f is AdminPayment => f !== null);
    return [...fromOrders, ...feeList, ...extraPayments].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async function findEvent(id: string) {
    const e = await deps.events.getEvent(id).catch(() => null);
    if (!e) throw mockError(404, 'event_not_found', 'Event not found.');
    return e;
  }

  const adminName = () => mockAccountInfo(mockSessionUserId() ?? '')?.name ?? 'Platform admin';

  return {
    async search(query) {
      await mockDelay();
      requireAdmin();
      const needle = query.trim().toLowerCase();
      const has = (...values: (string | null)[]) => !needle || values.some((v) => v?.toLowerCase().includes(needle));
      return structuredClone({
        users: users().filter((u) => has(u.name, u.email, u.id)),
        events: (await allEvents()).filter((e) => has(e.title, e.id, e.organizerName)),
        orders: (await allOrders()).filter((o) => has(o.number, o.buyerEmail, o.eventTitle)),
        payments: (await allPayments()).filter((p) => has(p.reference, p.orderNumber, p.eventTitle)),
      });
    },
    async listEvents() {
      await mockDelay();
      requireAdmin();
      return structuredClone(await allEvents());
    },
    async setUserSuspended(userId, suspended) {
      await mockDelay();
      requireAdmin();
      if (suspended) moderation.suspendedUsers.add(userId);
      else moderation.suspendedUsers.delete(userId);
      const found = users().find((u) => u.id === userId);
      if (!found) throw mockError(404, 'user_not_found', 'User not found.');
      return found;
    },
    async setEventSuspended(eventId, suspended, reason) {
      await mockDelay();
      requireAdmin();
      const e = await findEvent(eventId);
      if (suspended) moderation.suspendedEvents.add(eventId);
      else moderation.suspendedEvents.delete(eventId);
      deps.organizer.record(eventId, {
        type: 'event', entity: 'Event', actorName: adminName(),
        description: suspended ? `All sales suspended by a platform admin: ${reason}` : 'Sales reinstated by a platform admin',
      });
      return structuredClone(await adminEvent(e));
    },
    async setPaidSalesSuspended(eventId, suspended, reason) {
      await mockDelay();
      requireAdmin();
      const e = await findEvent(eventId);
      if (suspended) deps.paidSales.suspend(eventId, reason);
      else deps.paidSales.reinstate(eventId);
      deps.organizer.record(eventId, {
        type: 'paid_sales', entity: 'Paid sales', actorName: adminName(),
        description: suspended ? `Paid sales suspended by a platform admin: ${reason}` : 'Paid sales reinstated by a platform admin',
      });
      return structuredClone(await adminEvent(e));
    },
    async listReports() {
      await mockDelay();
      requireAdmin();
      return structuredClone([...reports].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
    },
    async resolveReport(id, outcome) {
      await mockDelay();
      requireAdmin();
      const found = reports.find((r) => r.id === id);
      if (!found) throw mockError(404, 'report_not_found', 'Report not found.');
      found.status = outcome;
      return structuredClone(found);
    },
    async listActivations() {
      await mockDelay();
      requireAdmin();
      const list = await Promise.all(
        (await deps.events.listMyEvents()).map(async (e): Promise<ActivationRecord> => {
          const p = await deps.paidSales.getPaidSales(e.id);
          return {
            eventId: e.id, eventTitle: e.title, organizerName: 'Nomad Sound Collective', state: p.state, feeAmount: p.activationFee,
            feeReference: p.checklist.fee.reference ?? null, activatedAt: p.activatedAt ?? null,
            suspensionReason: p.suspension?.reason ?? null, simulated: p.simulated,
          };
        }),
      );
      return structuredClone(list);
    },
    async listPayments({ status, kind }) {
      await mockDelay();
      requireAdmin();
      return structuredClone((await allPayments()).filter((p) => (!status || p.status === status) && (!kind || p.kind === kind)));
    },
    async listPromoActivity() {
      await mockDelay();
      requireAdmin();
      const rows: PromoActivity[] = [];
      for (const e of await deps.events.listMyEvents()) {
        for (const c of await deps.campaigns.listCampaigns(e.id)) {
          rows.push({ eventTitle: e.title, code: c.code, status: c.status, redemptions: c.stats.redemptions, discountTotal: c.stats.discountTotal });
        }
      }
      return rows;
    },
    async getSettings() {
      await mockDelay();
      requireAdmin();
      return { ...moderation.settings };
    },
    async updateSettings(settings) {
      await mockDelay();
      requireAdmin();
      if (!Number.isInteger(settings.activationFee) || settings.activationFee < 0) throw mockError(422, 'invalid_settings', 'The activation fee must be a whole number of tenge.');
      moderation.settings = { ...settings };
      return { ...moderation.settings };
    },
    async reportEvent(eventId, { reason, details }) {
      await mockDelay();
      const userId = mockSessionUserId();
      if (!userId) throw mockError(401, 'unauthenticated', 'Sign in to report an event.');
      const reporter = mockAccountInfo(userId);
      const title = (await deps.events.getEvent(eventId).catch(() => null))?.title ?? eventId;
      reports.push({
        id: mockId('rep'), event: { id: eventId, title }, reason, details: details.trim(),
        reporter: { name: reporter?.name ?? 'User', email: reporter?.email ?? '—' }, status: 'open', createdAt: new Date(),
      });
    },
  };
}
