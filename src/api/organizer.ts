/*
 * Organizer back-office API: orders, refunds and attendees (SRS 4.4, 4.9), check-in staff (4.8),
 * organizer profile (4.1), analytics (4.6, 4.15) and the activity timeline (4.16).
 * Backend: /events/:id/{orders,attendees,staff,analytics,timeline}, /orders/:id/refund,
 * /organizers/me (+ /payout-accounts). All numbers come from the server.
 *
 * Mapping notes:
 * - Orders carry no buyer name/email; the first attendee stands in for the buyer.
 *   Ticket statuses come from the attendee list. Pending orders are left out.
 * - The profile has only a display name, contact email and phone; website and "about" aren't stored.
 * - Payout details are a sandbox reference: only the IBAN's last 4 characters are sent.
 */
import { ApiError, fromMinor, json, orderNumber, request, type Page } from './http';
import { orderStatus, seatOf, type OrderDto, type OrderStatus, type TicketStatus } from './orders';
import type { TicketTypeDto } from './ticketTypes';

// ---------- Orders, attendees, refunds ----------

export interface OrganizerTicket {
  id: string;
  ticketTypeName: string;
  attendeeName: string;
  status: TicketStatus;
  seat: { section: string; row: string; seat: string } | null;
  checkedInAt?: Date;
}

export interface OrganizerOrder {
  id: string;
  number: string;
  buyer: { name: string; email: string };
  status: OrderStatus;
  total: number;
  refundedAmount: number;
  ticketCount: number;
  paymentsSimulated: boolean;
  createdAt: Date;
  promoCode: string | null;
  tickets: OrganizerTicket[];
  /** Server's decision: a full refund (paid) or cancellation (free) is still possible. */
  refundable: boolean;
}

// ---------- Staff ----------

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  /** Event Admin = check-in staff in the mobile app (SRS 4.8). */
  role: 'event_admin';
  addedAt: Date;
}

// ---------- Profile ----------

export type PayoutStatus = 'not_set' | 'pending' | 'verified';

export interface OrganizerProfile {
  organizationName: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
  about: string;
  payout: {
    status: PayoutStatus;
    accountHolder: string;
    /** The server never returns the full IBAN. */
    ibanLast4: string | null;
    simulated: boolean;
  };
}

export interface ProfileInput {
  organizationName: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
  about: string;
  /** Only sent when the organizer changes payout details. */
  payout?: { accountHolder: string; iban: string };
}

// ---------- Analytics ----------

export interface AnalyticsFilter {
  from?: Date;
  to?: Date;
  ticketTypeId?: string;
}

export interface EventAnalytics {
  capacity: number;
  sold: number;
  remaining: number;
  /** 0–100, rounded by the server. */
  percentSold: number;
  gross: number;
  discounts: number;
  refunds: number;
  fees: number;
  net: number;
  estimatedPayout: number;
  paymentsSimulated: boolean;
  salesOverTime: { date: string; tickets: number; gross: number }[];
  byTicketType: { ticketTypeId: string; name: string; sold: number; capacity: number; gross: number }[];
  campaigns: { code: string; name: string; redemptions: number; tickets: number; gross: number; discount: number; net: number }[];
  attendance: { checkedIn: number; absent: number; percent: number };
  ticketTypes: { id: string; name: string }[];
}

// ---------- Timeline ----------

export type TimelineType =
  | 'event'
  | 'ticket_type'
  | 'order'
  | 'refund'
  | 'campaign'
  | 'support'
  | 'check_in'
  | 'staff'
  | 'paid_sales';

export interface TimelineEntry {
  id: string;
  at: Date;
  actor: { name: string };
  type: TimelineType;
  /** e.g. "Order BF-NGT4A2" */
  entity: string;
  description: string;
}

export interface OrganizerApi {
  listEventOrders(eventId: string): Promise<OrganizerOrder[]>;
  /** Full refund for paid orders; cancellation for free registrations (SRS 4.9). */
  refundOrder(eventId: string, orderId: string, reason: string): Promise<OrganizerOrder>;
  listStaff(eventId: string): Promise<StaffMember[]>;
  addStaff(eventId: string, email: string): Promise<StaffMember>;
  removeStaff(eventId: string, staffId: string): Promise<void>;
  getProfile(): Promise<OrganizerProfile>;
  updateProfile(input: ProfileInput): Promise<OrganizerProfile>;
  getAnalytics(eventId: string, filter: AnalyticsFilter): Promise<EventAnalytics>;
  getTimeline(eventId: string, filter: { from?: Date; to?: Date; type?: TimelineType }): Promise<TimelineEntry[]>;
}

export const STAFF_ERRORS = { userNotFound: 'user_not_found', alreadyStaff: 'already_staff' } as const;

// ---------- HTTP ----------

const ev = (id: string) => `/events/${encodeURIComponent(id)}`;
const query = (params: Record<string, string | undefined>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : '';
};

interface AttendeeRowDto {
  ticketId: string;
  ticketStatus: TicketStatus;
  checkedInAt: string | null;
}

function organizerOrder(dto: OrderDto, attendees: Map<string, AttendeeRowDto>): OrganizerOrder {
  const status = orderStatus(dto);
  const first = dto.items[0];
  return {
    id: dto.id,
    number: orderNumber(dto.id),
    buyer: { name: first?.attendeeName ?? '', email: first?.attendeeEmail ?? '' },
    status,
    total: fromMinor(dto.totalMinor),
    refundedAmount: status === 'refunded' ? fromMinor(dto.totalMinor) : 0,
    ticketCount: dto.items.length,
    paymentsSimulated: true,
    createdAt: new Date(dto.createdAt),
    promoCode: dto.promoCode,
    tickets: dto.items.map((item) => {
      const row = item.ticketId ? attendees.get(item.ticketId) : undefined;
      return {
        id: item.ticketId ?? item.id,
        ticketTypeName: item.ticketTypeName,
        attendeeName: item.attendeeName ?? '',
        status: row?.ticketStatus ?? (status === 'refunded' ? 'refunded' : 'cancelled'),
        seat: seatOf(item),
        checkedInAt: row?.checkedInAt ? new Date(row.checkedInAt) : undefined,
      };
    }),
    refundable: status === 'paid' || status === 'confirmed',
  };
}

interface StaffDto {
  userId: string;
  fullName: string;
  email: string;
  role: 'event_admin';
  assignedAt: string;
}
const staffFromDto = (dto: StaffDto): StaffMember => ({
  id: dto.userId,
  name: dto.fullName,
  email: dto.email,
  role: dto.role,
  addedAt: new Date(dto.assignedAt),
});

interface ProfileDto {
  displayName: string;
  contactEmail: string | null;
  contactPhone: string | null;
}
interface PayoutAccountDto {
  providerRef: string;
  status: 'pending' | 'connected' | 'disabled';
}

export async function getProfileDto(): Promise<ProfileDto | null> {
  try {
    return await request<ProfileDto>('/organizers/me');
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

async function getProfile(): Promise<OrganizerProfile> {
  const profile = await getProfileDto();
  const accounts = profile ? await request<PayoutAccountDto[]>('/organizers/me/payout-accounts') : [];
  const account = accounts.find((a) => a.status === 'connected') ?? accounts.find((a) => a.status === 'pending');
  return {
    organizationName: profile?.displayName ?? '',
    contactEmail: profile?.contactEmail ?? '',
    contactPhone: profile?.contactPhone ?? '',
    website: '',
    about: '',
    payout: {
      status: !account ? 'not_set' : account.status === 'connected' ? 'verified' : 'pending',
      accountHolder: '',
      ibanLast4: account ? account.providerRef.slice(-4) : null,
      simulated: true,
    },
  };
}

/** Creates the organizer profile on first save, updates it afterwards. */
export async function saveProfile(input: { displayName: string; contactEmail?: string; contactPhone?: string }) {
  const body = {
    displayName: input.displayName,
    contactEmail: input.contactEmail || null,
    contactPhone: input.contactPhone || null,
  };
  const exists = (await getProfileDto()) !== null;
  await request('/organizers/me', json(exists ? 'PATCH' : 'POST', body));
}

/** Sandbox payout reference built from the IBAN's last 4 characters; the full IBAN is never sent. */
export async function connectPayoutAccount(iban: string) {
  const last4 = iban.replace(/\s/g, '').slice(-4).toUpperCase();
  await request('/organizers/me/payout-accounts', json('POST', { providerRef: `sandbox_${last4}` }));
}

interface AnalyticsDto {
  capacity: { capacity: number; sold: number; reserved: number; remaining: number; soldPercent: number };
  revenue: { grossMinor: number; discountsMinor: number; refundsMinor: number; netMinor: number; isSimulated: boolean };
  salesOverTime: { bucketStart: string; tickets: number; revenueMinor: number }[];
  byTicketType: { ticketTypeId: string; name: string; sold: number; revenueMinor: number }[];
  byCampaign: { code: string; name: string; redemptions: number; discountMinor: number; revenueMinor: number }[];
  attendance: { issued: number; checkedIn: number; checkedInPercent: number };
}

interface TimelineDto {
  id: string;
  occurredAt: string;
  actionType: string;
  entityType: string;
  entityId: string;
  description: string;
  actorName: string | null;
}

/** App timeline type -> backend `action_type` prefix. */
const TIMELINE_PREFIX: Record<TimelineType, string> = {
  event: 'event',
  ticket_type: 'ticket_type',
  order: 'order',
  refund: 'refund',
  campaign: 'campaign',
  support: 'support',
  check_in: 'checkin',
  staff: 'staff',
  paid_sales: 'event.paid_sales_activated',
};

function timelineType(actionType: string): TimelineType {
  if (actionType === 'event.paid_sales_activated' || actionType.startsWith('payment.')) return 'paid_sales';
  const prefix = actionType.split('.')[0];
  const found = (Object.keys(TIMELINE_PREFIX) as TimelineType[]).find((t) => TIMELINE_PREFIX[t] === prefix);
  return found ?? 'event';
}

export const httpOrganizerApi: OrganizerApi = {
  async listEventOrders(eventId) {
    const [orders, attendees] = await Promise.all([
      request<Page<OrderDto>>(`${ev(eventId)}/orders?limit=100`),
      request<Page<AttendeeRowDto>>(`${ev(eventId)}/attendees?limit=200`),
    ]);
    const rows = new Map(attendees.items.map((a) => [a.ticketId, a]));
    return orders.items.filter((o) => o.status !== 'pending').map((o) => organizerOrder(o, rows));
  },
  async refundOrder(eventId, orderId, reason) {
    await request(`/orders/${encodeURIComponent(orderId)}/refund`, json('POST', { reason }));
    const orders = await httpOrganizerApi.listEventOrders(eventId);
    const order = orders.find((o) => o.id === orderId);
    if (!order) throw new ApiError(404, { code: 'order_not_found', serverMessage: 'Order not found' });
    return order;
  },
  async listStaff(eventId) {
    return (await request<StaffDto[]>(`${ev(eventId)}/staff`)).map(staffFromDto);
  },
  async addStaff(eventId, email) {
    return staffFromDto(await request<StaffDto>(`${ev(eventId)}/staff`, json('POST', { email })));
  },
  async removeStaff(eventId, staffId) {
    await request(`${ev(eventId)}/staff/${encodeURIComponent(staffId)}`, { method: 'DELETE' });
  },
  getProfile,
  async updateProfile(input) {
    await saveProfile({ displayName: input.organizationName, contactEmail: input.contactEmail, contactPhone: input.contactPhone });
    if (input.payout) await connectPayoutAccount(input.payout.iban);
    return getProfile();
  },
  async getAnalytics(eventId, { from, to, ticketTypeId }) {
    const [a, types] = await Promise.all([
      request<AnalyticsDto>(
        `${ev(eventId)}/analytics${query({ date_from: from?.toISOString(), date_to: to?.toISOString(), ticket_type_id: ticketTypeId })}`,
      ),
      request<TicketTypeDto[]>(`${ev(eventId)}/ticket-types`),
    ]);
    const net = fromMinor(a.revenue.netMinor);
    return {
      capacity: a.capacity.capacity,
      sold: a.capacity.sold,
      remaining: a.capacity.remaining,
      percentSold: Math.round(a.capacity.soldPercent),
      gross: fromMinor(a.revenue.grossMinor),
      discounts: fromMinor(a.revenue.discountsMinor),
      refunds: fromMinor(a.revenue.refundsMinor),
      fees: 0,
      net,
      estimatedPayout: net,
      paymentsSimulated: a.revenue.isSimulated,
      // Buckets start at midnight in the event's zone; the app wants the calendar date.
      salesOverTime: a.salesOverTime.map((p) => ({ date: p.bucketStart.slice(0, 10), tickets: p.tickets, gross: fromMinor(p.revenueMinor) })),
      byTicketType: a.byTicketType.map((t) => ({
        ticketTypeId: t.ticketTypeId,
        name: t.name,
        sold: t.sold,
        capacity: types.find((x) => x.id === t.ticketTypeId)?.quantityTotal ?? 0,
        gross: fromMinor(t.revenueMinor),
      })),
      campaigns: a.byCampaign.map((c) => ({
        code: c.code,
        name: c.name,
        redemptions: c.redemptions,
        tickets: c.redemptions,
        gross: fromMinor(c.revenueMinor + c.discountMinor),
        discount: fromMinor(c.discountMinor),
        net: fromMinor(c.revenueMinor),
      })),
      attendance: {
        checkedIn: a.attendance.checkedIn,
        absent: Math.max(0, a.attendance.issued - a.attendance.checkedIn),
        percent: Math.round(a.attendance.checkedInPercent),
      },
      ticketTypes: types.map((t) => ({ id: t.id, name: t.name })),
    };
  },
  async getTimeline(eventId, { from, to, type }) {
    const page = await request<Page<TimelineDto>>(
      `${ev(eventId)}/timeline${query({
        date_from: from?.toISOString(),
        date_to: to?.toISOString(),
        action_type: type ? TIMELINE_PREFIX[type] : undefined,
        limit: '100',
      })}`,
    );
    return page.items.map((e) => ({
      id: e.id,
      at: new Date(e.occurredAt),
      actor: { name: e.actorName ?? 'System' },
      type: timelineType(e.actionType),
      entity: e.entityType === 'order' ? `Order ${orderNumber(e.entityId)}` : e.entityType.replace(/_/g, ' '),
      description: e.description,
    }));
  },
};
