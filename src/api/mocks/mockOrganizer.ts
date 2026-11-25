import type { EventsApi } from '../events';
import type {
  EventAnalytics,
  OrganizerApi,
  OrganizerOrder,
  OrganizerProfile,
  StaffMember,
  TimelineEntry,
  TimelineType,
} from '../organizer';
import { STAFF_ERRORS } from '../organizer';
import type { Order } from '../orders';
import { mockAccountByEmail, mockAccountInfo, mockSessionUserId } from './mockAuth';
import type { MockCampaignsApi } from './mockCampaigns';
import type { MockNotificationsApi } from './mockNotifications';
import type { MockOrdersApi } from './mockOrders';
import type { MockTicketTypesApi } from './mockTicketTypes';
import { mockDelay, mockError, mockId } from './util';

/**
 * In-browser stand-in for the organizer back office. Every event in the organizer mock store
 * belongs to Demo Organizer. Analytics mix the seeded counters (which have no orders behind
 * them) with real mock orders, so the numbers are illustrative, not reconciled.
 */

interface Deps {
  events: EventsApi;
  ticketTypes: MockTicketTypesApi;
  campaigns: MockCampaignsApi;
  orders: MockOrdersApi;
  notifications: MockNotificationsApi;
}

const FEE_RATE = 0.035;
const day = 24 * 60 * 60 * 1000;

export interface MockOrganizerApi extends OrganizerApi {
  /** Mock-only: records an activity-timeline entry (the server writes these itself). */
  record(eventId: string, entry: Omit<TimelineEntry, 'id' | 'at' | 'actor'> & { at?: Date; actorName?: string }): void;
  /** Mock-only: what the server does after an event is cancelled. */
  afterEventCancelled(eventId: string, reason: string): Promise<void>;
}

export function createMockOrganizerApi(deps: Deps): MockOrganizerApi {
  const staff = new Map<string, StaffMember[]>([
    ['evt-almaty-nights', [{ id: 'usr-staff-1', name: 'Aruzhan Bekova', email: 'aruzhan@demo.kz', role: 'event_admin', addedAt: new Date(Date.now() - 4 * day) }]],
  ]);
  const audit = new Map<string, TimelineEntry[]>();
  let profile: OrganizerProfile = {
    organizationName: 'Nomad Sound Collective',
    contactEmail: 'organizer@demo.kz',
    contactPhone: '+7 701 000 00 00',
    website: 'https://nomadsound.example.kz',
    about: 'Independent promoter of contemporary Kazakh music.',
    payout: { status: 'verified', accountHolder: 'Nomad Sound Collective LLP', ibanLast4: '4417', simulated: true },
  };

  const actorName = () => mockAccountInfo(mockSessionUserId() ?? '')?.name ?? 'BiletFlow';

  function record(eventId: string, e: Omit<TimelineEntry, 'id' | 'at' | 'actor'> & { at?: Date; actorName?: string }) {
    const { at = new Date(), actorName: name = actorName(), ...rest } = e;
    audit.set(eventId, [...(audit.get(eventId) ?? []), { ...rest, id: mockId('aud'), at, actor: { name } }]);
  }

  // Seeded history for the demo events.
  const ago = (days: number) => new Date(Date.now() - days * day);
  record('evt-almaty-nights', { type: 'event', entity: 'Event', description: 'Event created as a draft', at: ago(21), actorName: 'Demo Organizer' });
  record('evt-almaty-nights', { type: 'paid_sales', entity: 'Paid sales', description: 'Paid sales activated (simulated)', at: ago(6), actorName: 'Demo Organizer' });
  record('evt-almaty-nights', { type: 'event', entity: 'Event', description: 'Event published', at: ago(6), actorName: 'Demo Organizer' });
  record('evt-almaty-nights', { type: 'ticket_type', entity: 'Ticket type “VIP balcony”', description: 'Price changed from ₸16,000 to ₸18,500', at: ago(5), actorName: 'Demo Organizer' });
  record('evt-almaty-nights', { type: 'campaign', entity: 'Promo code STUDENT20', description: 'Promo code created (20% off)', at: ago(5), actorName: 'Demo Organizer' });
  record('evt-almaty-nights', { type: 'staff', entity: 'Aruzhan Bekova', description: 'Assigned as check-in staff', at: ago(4), actorName: 'Demo Organizer' });
  record('evt-almaty-nights', { type: 'support', entity: 'Case SC-1001', description: 'Status changed to In progress', at: ago(1), actorName: 'Demo Organizer' });
  record('evt-spring-jam', { type: 'event', entity: 'Event', description: 'Event published', at: ago(58), actorName: 'Demo Organizer' });
  record('evt-spring-jam', { type: 'check_in', entity: 'Ticket TK-SJ01-0042', description: 'Checked in at the main door', at: ago(30), actorName: 'Aruzhan Bekova' });
  record('evt-spring-jam', { type: 'check_in', entity: 'Ticket TK-SJ01-0042', description: 'Check-in reversed (scanned by mistake)', at: ago(30), actorName: 'Aruzhan Bekova' });

  async function owned(eventId: string) {
    const event = await deps.events.getEvent(eventId).catch(() => null);
    if (!event) throw mockError(404, 'event_not_found', 'Event not found.');
    return event;
  }

  async function ordersFor(eventId: string) {
    return (await deps.orders.allOrders()).filter(({ order }) => order.event.id === eventId);
  }

  function toOrganizerOrder(userId: string, order: Order): OrganizerOrder {
    const buyer = mockAccountInfo(userId);
    return {
      id: order.id,
      number: order.number,
      buyer: { name: buyer?.name ?? 'Guest', email: buyer?.email ?? '—' },
      status: order.status,
      total: order.total,
      refundedAmount: order.status === 'refunded' ? order.total : 0,
      ticketCount: order.ticketCount,
      paymentsSimulated: order.paymentsSimulated,
      createdAt: order.createdAt,
      promoCode: order.promoCode,
      tickets: order.tickets.map((t) => ({ id: t.id, ticketTypeName: t.ticketTypeName, attendeeName: t.attendeeName, status: t.status, seat: t.seat, checkedInAt: t.checkedInAt })),
      refundable: (order.status === 'paid' || order.status === 'confirmed') && order.tickets.every((t) => t.status === 'valid'),
    };
  }

  async function voidAndRelease(eventId: string, order: Order) {
    const voided = await deps.orders.voidOrder(order.id);
    for (const line of order.lines) {
      await deps.ticketTypes
        .adjustCounts(eventId, line.ticketTypeId, { sold: -line.quantity, refunded: order.total > 0 ? line.quantity : 0 })
        .catch(() => {}); // demo orders reference ticket types that don't exist in the store
    }
    return voided;
  }

  return {
    record,

    async afterEventCancelled(eventId, reason) {
      for (const { userId, order } of await ordersFor(eventId)) {
        if (order.status !== 'paid' && order.status !== 'confirmed') continue;
        await voidAndRelease(eventId, order);
        deps.notifications.notify(userId, {
          type: 'event_cancelled',
          title: `${order.event.title} was cancelled`,
          body: order.total > 0 ? `Order ${order.number} will be refunded in full (simulated). ${reason}` : `Your registration ${order.number} was cancelled. ${reason}`,
          link: `/orders/${order.id}`,
        });
      }
      record(eventId, { type: 'event', entity: 'Event', description: `Event cancelled: ${reason}` });
    },

    async listEventOrders(eventId) {
      await mockDelay();
      await owned(eventId);
      return (await ordersFor(eventId))
        .map(({ userId, order }) => toOrganizerOrder(userId, order))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },

    async refundOrder(eventId, orderId, reason) {
      await mockDelay(500);
      await owned(eventId);
      const found = (await ordersFor(eventId)).find(({ order }) => order.id === orderId);
      if (!found) throw mockError(404, 'order_not_found', 'Order not found.');
      if (!toOrganizerOrder(found.userId, found.order).refundable) {
        throw mockError(409, 'not_refundable', 'This order can’t be refunded any more.');
      }
      const voided = await voidAndRelease(eventId, found.order);
      const paid = found.order.total > 0;
      record(eventId, {
        type: 'refund',
        entity: `Order ${found.order.number}`,
        description: paid ? `Full refund of ₸${found.order.total.toLocaleString('en')} (simulated). Reason: ${reason}` : `Free registration cancelled. Reason: ${reason}`,
      });
      deps.notifications.notify(found.userId, {
        type: 'refund_completed',
        title: paid ? `Refund for ${found.order.number}` : `Registration ${found.order.number} cancelled`,
        body: paid ? 'Your refund was processed (simulated: no money moved). The tickets are no longer valid.' : 'The organizer cancelled your registration. The tickets are no longer valid.',
        link: `/orders/${found.order.id}`,
      });
      return toOrganizerOrder(found.userId, voided!);
    },

    async listStaff(eventId) {
      await mockDelay();
      await owned(eventId);
      return structuredClone(staff.get(eventId) ?? []);
    },

    async addStaff(eventId, email) {
      await mockDelay();
      await owned(eventId);
      const account = mockAccountByEmail(email);
      if (!account) throw mockError(404, STAFF_ERRORS.userNotFound, 'There’s no BiletFlow account with this email. Ask them to register first.');
      const list = staff.get(eventId) ?? [];
      if (list.some((s) => s.id === account.id)) throw mockError(409, STAFF_ERRORS.alreadyStaff, 'This person is already check-in staff for this event.');
      const member: StaffMember = { id: account.id, name: account.name, email: account.email, role: 'event_admin', addedAt: new Date() };
      staff.set(eventId, [...list, member]);
      record(eventId, { type: 'staff', entity: member.name, description: 'Assigned as check-in staff' });
      return structuredClone(member);
    },

    async removeStaff(eventId, staffId) {
      await mockDelay();
      await owned(eventId);
      const list = staff.get(eventId) ?? [];
      const member = list.find((s) => s.id === staffId);
      staff.set(eventId, list.filter((s) => s.id !== staffId));
      if (member) record(eventId, { type: 'staff', entity: member.name, description: 'Removed from check-in staff' });
    },

    async getProfile() {
      await mockDelay();
      return structuredClone(profile);
    },

    async updateProfile({ payout, ...input }) {
      await mockDelay();
      if (payout && !/^KZ\d{2}[A-Z0-9]{16}$/.test(payout.iban.replace(/\s/g, '').toUpperCase())) {
        throw mockError(422, 'invalid_iban', 'Enter a Kazakhstan IBAN (KZ + 18 characters).');
      }
      profile = {
        ...profile,
        ...input,
        payout: payout
          ? { status: 'pending', accountHolder: payout.accountHolder, ibanLast4: payout.iban.replace(/\s/g, '').slice(-4), simulated: true }
          : profile.payout,
      };
      return structuredClone(profile);
    },

    async getAnalytics(eventId, { from, to, ticketTypeId }) {
      await mockDelay();
      const event = await owned(eventId);
      const allTypes = await deps.ticketTypes.listTicketTypes(eventId);
      const types = ticketTypeId ? allTypes.filter((t) => t.id === ticketTypeId) : allTypes;
      const campaigns = await deps.campaigns.listCampaigns(eventId);
      const orders = (await ordersFor(eventId)).map((o) => o.order);

      const sold = types.reduce((s, t) => s + t.counts.sold, 0);
      const capacity = ticketTypeId ? types.reduce((s, t) => s + t.quantity, 0) : event.capacity;
      const gross = types.reduce((s, t) => s + t.counts.sold * t.price, 0);
      const discounts = ticketTypeId ? 0 : campaigns.reduce((s, c) => s + c.stats.discountTotal, 0);
      const refunds = orders.filter((o) => o.status === 'refunded').reduce((s, o) => s + o.total - o.fee, 0);
      const fees = Math.round((gross - discounts) * FEE_RATE);
      const net = gross - discounts - refunds;
      const checkedIn = types.reduce((s, t) => s + t.counts.checkedIn, 0);

      // Spread sold tickets across the sales window by day (illustrative for seeded counters).
      const start = event.registrationOpensAt.getTime();
      const end = Math.min(Date.now(), event.registrationClosesAt.getTime());
      const days = Math.max(1, Math.ceil((end - start) / day));
      const weights = Array.from({ length: days }, (_, i) => 1 + Math.sin(i * 1.3) * 0.5 + (i === days - 1 ? 1 : 0));
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      let assigned = 0;
      const series = weights.map((w, i) => {
        const tickets = i === days - 1 ? sold - assigned : Math.floor((sold * w) / totalWeight);
        assigned += tickets;
        const date = new Date(start + i * day).toISOString().slice(0, 10);
        return { date, tickets, gross: sold ? Math.round((gross * tickets) / sold) : 0 };
      });
      const inRange = series.filter(
        (p) => (!from || p.date >= from.toISOString().slice(0, 10)) && (!to || p.date <= to.toISOString().slice(0, 10)),
      );

      const result: EventAnalytics = {
        capacity,
        sold,
        remaining: Math.max(0, capacity - sold),
        percentSold: capacity ? Math.round((sold / capacity) * 100) : 0,
        gross,
        discounts,
        refunds,
        fees,
        net,
        estimatedPayout: net,
        paymentsSimulated: true,
        salesOverTime: inRange,
        byTicketType: types.map((t) => ({ ticketTypeId: t.id, name: t.name, sold: t.counts.sold, capacity: t.quantity, gross: t.counts.sold * t.price })),
        campaigns: ticketTypeId
          ? []
          : campaigns.map((c) => ({ code: c.code, name: c.name, redemptions: c.stats.redemptions, tickets: c.stats.ticketsSold, gross: c.stats.grossRevenue, discount: c.stats.discountTotal, net: c.stats.netRevenue })),
        attendance: { checkedIn, absent: Math.max(0, sold - checkedIn), percent: sold ? Math.round((checkedIn / sold) * 100) : 0 },
        ticketTypes: allTypes.map((t) => ({ id: t.id, name: t.name })),
      };
      return result;
    },

    async getTimeline(eventId, { from, to, type }) {
      await mockDelay();
      await owned(eventId);
      const derived: TimelineEntry[] = (await ordersFor(eventId)).map(({ userId, order }) => ({
        id: `ord-${order.id}`,
        at: order.createdAt,
        actor: { name: mockAccountInfo(userId)?.name ?? 'Attendee' },
        type: 'order' as TimelineType,
        entity: `Order ${order.number}`,
        description: order.total > 0 ? `${order.ticketCount} ticket(s) bought (simulated payment)` : `${order.ticketCount} free ticket(s) registered`,
      }));
      return structuredClone(
        [...(audit.get(eventId) ?? []), ...derived]
          .filter((e) => (!type || e.type === type) && (!from || e.at >= from) && (!to || e.at <= to))
          .sort((a, b) => b.at.getTime() - a.at.getTime()),
      );
    },
  };
}

/**
 * Mock-only: wraps the events mock so cancelling and duplicating have the server's side effects
 * (tickets invalidated, attendees notified, ticket types copied, timeline entries).
 */
export function withEventSideEffects(events: EventsApi, organizer: MockOrganizerApi, ticketTypes: MockTicketTypesApi): EventsApi {
  return {
    ...events,
    async publishEvent(id) {
      const result = await events.publishEvent(id);
      organizer.record(id, { type: 'event', entity: 'Event', description: 'Event published' });
      return result;
    },
    async unpublishEvent(id) {
      const result = await events.unpublishEvent(id);
      organizer.record(id, { type: 'event', entity: 'Event', description: 'Event unpublished' });
      return result;
    },
    async cancelEvent(id, reason) {
      const result = await events.cancelEvent(id, reason);
      await organizer.afterEventCancelled(id, reason);
      return result;
    },
    async duplicateEvent(id) {
      const copy = await events.duplicateEvent(id);
      for (const t of await ticketTypes.listTicketTypes(id)) {
        const { name, description, kind, price, quantity, salesStartAt, salesEndAt, maxPerOrder } = t;
        await ticketTypes.createTicketType(copy.id, { name, description, kind, price, quantity, salesStartAt, salesEndAt, maxPerOrder });
      }
      organizer.record(copy.id, { type: 'event', entity: 'Event', description: `Duplicated from “${(await events.getEvent(id)).title}”` });
      return copy;
    },
  };
}
