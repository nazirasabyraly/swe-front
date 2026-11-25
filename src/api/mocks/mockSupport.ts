import type { EventsApi } from '../events';
import type { Person, SupportApi, SupportCase, SupportCaseSummary, SupportContext } from '../support';
import { mockAccountInfo, mockSessionUserId } from './mockAuth';
import type { MockNotificationsApi } from './mockNotifications';
import type { MockOrdersApi } from './mockOrders';
import { mockDelay, mockError, mockId } from './util';

/**
 * In-browser stand-in for the support endpoints. Attendee cases about events in the organizer
 * mock store are handled by Demo Organizer; organizer cases by Demo Admin. Admins can see all.
 */

type Stored = Omit<SupportCase, 'canManage' | 'assignableStaff'>;

interface Deps {
  events: EventsApi;
  orders: MockOrdersApi;
  notifications: MockNotificationsApi;
}

const person = (id: string): Person => ({ id, name: mockAccountInfo(id)?.name ?? 'BiletFlow user' });
const ORGANIZER = 'usr-organizer';
const ADMIN = 'usr-admin';

function seed(): Stored[] {
  const hour = 60 * 60 * 1000;
  const t = (hoursAgo: number) => new Date(Date.now() - hoursAgo * hour);
  return [
    {
      id: 'sc-1001', number: 'SC-1001', kind: 'attendee', category: 'ticket_delivery', status: 'in_progress',
      subject: 'VIP ticket email never arrived', requester: person('usr-attendee'), assignee: person(ORGANIZER),
      context: { event: { id: 'evt-almaty-nights', title: 'Almaty Nights — Vol. 4' }, order: { id: 'ord-demo-nights', number: 'BF-NGT4A2' }, ticket: { id: 'TK-3HWP-8RNA' } },
      createdAt: t(30), updatedAt: t(26),
      messages: [
        { id: 'm1', author: { ...person('usr-attendee'), side: 'requester' }, body: 'I got the GA ticket email but not the VIP one for my friend.', createdAt: t(30) },
        { id: 'm2', author: { ...person(ORGANIZER), side: 'staff' }, body: 'Sorry about that! Both tickets are under My tickets, and I’ve asked for the email to be sent again.', createdAt: t(26) },
      ],
    },
    {
      id: 'sc-1002', number: 'SC-1002', kind: 'organizer', category: 'activation', status: 'open',
      subject: 'Question about the activation fee receipt', requester: person(ORGANIZER), assignee: null,
      context: { event: { id: 'evt-almaty-nights', title: 'Almaty Nights — Vol. 4' } },
      createdAt: t(5), updatedAt: t(5),
      messages: [
        { id: 'm3', author: { ...person(ORGANIZER), side: 'requester' }, body: 'Where can I find the receipt for the 9 900 ₸ activation fee?', createdAt: t(5) },
      ],
    },
  ];
}

export function createMockSupportApi(deps: Deps): SupportApi {
  const cases = seed();
  let counter = 1003;

  function me(): string {
    const id = mockSessionUserId();
    if (!id) throw mockError(401, 'unauthenticated', 'Sign in first.');
    return id;
  }

  /** Who handles a case: the organizer for attendee cases on their events, admins for the rest. */
  async function staffFor(c: Pick<Stored, 'kind' | 'context'>): Promise<string[]> {
    if (c.kind === 'organizer') return [ADMIN];
    const owned = c.context.event && (await deps.events.getEvent(c.context.event.id).then(() => true, () => false));
    return owned ? [ORGANIZER] : [ADMIN];
  }

  async function canManage(userId: string, c: Stored) {
    if (mockAccountInfo(userId)?.roles.includes('platform_admin')) return true;
    return (await staffFor(c)).includes(userId);
  }

  async function view(c: Stored, userId: string): Promise<SupportCase> {
    const manage = await canManage(userId, c);
    if (!manage && c.requester.id !== userId) throw mockError(404, 'case_not_found', 'Support case not found.');
    const staff = manage ? [...new Set([...(await staffFor(c)), ADMIN])].map(person) : [];
    return structuredClone({ ...c, canManage: manage, assignableStaff: staff });
  }

  const summary = ({ messages: _m, ...rest }: Stored): SupportCaseSummary => structuredClone(rest);
  const byNewest = (a: Stored, b: Stored) => b.updatedAt.getTime() - a.updatedAt.getTime();

  async function find(id: string) {
    const found = cases.find((c) => c.id === id);
    if (!found) throw mockError(404, 'case_not_found', 'Support case not found.');
    return found;
  }

  const link = (c: Stored) => `/support/${c.id}`;

  return {
    async listMyCases() {
      await mockDelay();
      const userId = me();
      return cases.filter((c) => c.requester.id === userId).sort(byNewest).map(summary);
    },
    async listManagedCases() {
      await mockDelay();
      const userId = me();
      const managed: Stored[] = [];
      for (const c of cases) if (await canManage(userId, c)) managed.push(c);
      return managed.sort(byNewest).map(summary);
    },
    async getCase(id) {
      await mockDelay();
      return view(await find(id), me());
    },
    async openCase(input) {
      await mockDelay();
      const userId = me();
      if (!input.subject.trim() || !input.message.trim()) throw mockError(422, 'invalid_case', 'Add a subject and a message.');
      const context: SupportContext = {};
      if (input.eventId) {
        const event = await deps.events.getEvent(input.eventId).catch(() => null);
        const fromOrder = (await deps.orders.allOrders()).find((o) => o.order.event.id === input.eventId)?.order.event;
        const title = event?.title ?? fromOrder?.title;
        if (title) context.event = { id: input.eventId, title };
      }
      if (input.orderId) {
        const found = (await deps.orders.allOrders()).find((o) => o.order.id === input.orderId && o.userId === userId);
        if (found) {
          context.order = { id: found.order.id, number: found.order.number };
          context.event ??= { id: found.order.event.id, title: found.order.event.title };
        }
      }
      if (input.ticketId) context.ticket = { id: input.ticketId };
      const now = new Date();
      const created: Stored = {
        id: `sc-${counter}`, number: `SC-${counter++}`, kind: input.kind, category: input.category, status: 'open',
        subject: input.subject.trim(), requester: person(userId), assignee: null, context, createdAt: now, updatedAt: now,
        messages: [{ id: mockId('msg'), author: { ...person(userId), side: 'requester' }, body: input.message.trim(), createdAt: now }],
      };
      cases.push(created);
      for (const staffId of await staffFor(created)) {
        deps.notifications.notify(staffId, { type: 'support_status', title: `New support case ${created.number}`, body: created.subject, link: link(created) });
      }
      return view(created, userId);
    },
    async reply(id, body) {
      await mockDelay();
      const userId = me();
      const c = await find(id);
      const manage = await canManage(userId, c);
      if (!manage && c.requester.id !== userId) throw mockError(404, 'case_not_found', 'Support case not found.');
      if (!body.trim()) throw mockError(422, 'empty_message', 'Write a message first.');
      const side = c.requester.id === userId ? 'requester' : 'staff';
      c.messages.push({ id: mockId('msg'), author: { ...person(userId), side }, body: body.trim(), createdAt: new Date() });
      c.updatedAt = new Date();
      if (side === 'staff') {
        if (c.status === 'open') c.status = 'in_progress';
        deps.notifications.notify(c.requester.id, { type: 'support_reply', title: `New reply on ${c.number}`, body: c.subject, link: link(c) });
      } else {
        if (c.status === 'waiting_for_customer' || c.status === 'resolved') c.status = 'open';
        const to = c.assignee ? [c.assignee.id] : await staffFor(c);
        to.forEach((staffId) => deps.notifications.notify(staffId, { type: 'support_reply', title: `New reply on ${c.number}`, body: c.subject, link: link(c) }));
      }
      return view(c, userId);
    },
    async updateCase(id, change) {
      await mockDelay();
      const userId = me();
      const c = await find(id);
      if (!(await canManage(userId, c))) throw mockError(403, 'forbidden', 'Only support staff can change this case.');
      if (change.status && change.status !== c.status) {
        c.status = change.status;
        deps.notifications.notify(c.requester.id, { type: 'support_status', title: `${c.number} status changed`, body: c.subject, link: link(c) });
      }
      if (change.assigneeId !== undefined) {
        c.assignee = change.assigneeId ? person(change.assigneeId) : null;
        if (change.assigneeId && change.assigneeId !== userId) {
          deps.notifications.notify(change.assigneeId, { type: 'support_assigned', title: `${c.number} was assigned to you`, body: c.subject, link: link(c) });
        }
      }
      c.updatedAt = new Date();
      return view(c, userId);
    },
  };
}
