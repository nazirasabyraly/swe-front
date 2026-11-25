/*
 * Organizer back-office API: orders, refunds and attendees (SRS 4.4, 4.9), check-in staff (4.8),
 * organizer profile (4.1), analytics (4.6, 4.15) and the activity timeline (4.16).
 * Contract: docs/backend-contract.md, "Organizer back office". All numbers come from the server.
 */
import { json, request } from './http';
import type { OrderStatus, TicketStatus } from './orders';

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

const ev = (id: string) => `/api/organizer/events/${encodeURIComponent(id)}`;
const query = (params: Record<string, string | undefined>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : '';
};

type OrderDto = Omit<OrganizerOrder, 'createdAt' | 'tickets'> & {
  createdAt: string;
  tickets: (Omit<OrganizerTicket, 'checkedInAt'> & { checkedInAt?: string })[];
};
const orderFromDto = (dto: OrderDto): OrganizerOrder => ({
  ...dto,
  createdAt: new Date(dto.createdAt),
  tickets: dto.tickets.map((t) => ({ ...t, checkedInAt: t.checkedInAt ? new Date(t.checkedInAt) : undefined })),
});
type StaffDto = Omit<StaffMember, 'addedAt'> & { addedAt: string };
const staffFromDto = (dto: StaffDto): StaffMember => ({ ...dto, addedAt: new Date(dto.addedAt) });

export const httpOrganizerApi: OrganizerApi = {
  async listEventOrders(eventId) {
    return (await request<OrderDto[]>(`${ev(eventId)}/orders`)).map(orderFromDto);
  },
  async refundOrder(eventId, orderId, reason) {
    return orderFromDto(await request<OrderDto>(`${ev(eventId)}/orders/${encodeURIComponent(orderId)}/refund`, json('POST', { reason })));
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
  getProfile: () => request<OrganizerProfile>('/api/organizer/profile'),
  updateProfile: (input) => request<OrganizerProfile>('/api/organizer/profile', json('PUT', input)),
  getAnalytics(eventId, { from, to, ticketTypeId }) {
    return request<EventAnalytics>(
      `${ev(eventId)}/analytics${query({ from: from?.toISOString(), to: to?.toISOString(), ticketTypeId })}`,
    );
  },
  async getTimeline(eventId, { from, to, type }) {
    const list = await request<(Omit<TimelineEntry, 'at'> & { at: string })[]>(
      `${ev(eventId)}/timeline${query({ from: from?.toISOString(), to: to?.toISOString(), type })}`,
    );
    return list.map((e) => ({ ...e, at: new Date(e.at) }));
  },
};
