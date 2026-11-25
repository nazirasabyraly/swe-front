/*
 * Support cases (SRS 4.13). Backend: /support/cases (+ /:id, /:id/messages).
 * Attendee cases are handled by the event's organizer; organizer cases by platform admins.
 * Asynchronous: no WebSocket, the thread is reloaded after each action.
 *
 * Mapping notes:
 * - The backend lists every case the user can see; "mine" = opened by me, "managed" = the rest.
 * - `canManage` = the case wasn't opened by me (the server still checks every change).
 * - Cases carry only ids: the requester's name comes from their messages, and the event title
 *   isn't available. The backend has no list of assignable staff, so staff can assign themselves.
 * - Category and status names differ slightly (`event_info`, `checkin`, `waiting_customer`);
 *   the backend has no "activation" category, so it's filed as "account".
 */
import { json, orderNumber, request, type Page } from './http';

export type SupportCaseKind = 'attendee' | 'organizer';
export type SupportStatus = 'open' | 'in_progress' | 'waiting_for_customer' | 'resolved';
export type SupportCategory =
  | 'ticket_delivery'
  | 'payment'
  | 'refund'
  | 'seating'
  | 'event_information'
  | 'check_in'
  | 'account'
  | 'activation'
  | 'technical';

export const SUPPORT_STATUSES: SupportStatus[] = ['open', 'in_progress', 'waiting_for_customer', 'resolved'];
export const ATTENDEE_CATEGORIES: SupportCategory[] = [
  'ticket_delivery', 'payment', 'refund', 'seating', 'event_information', 'check_in', 'account', 'technical',
];
export const ORGANIZER_CATEGORIES: SupportCategory[] = ['account', 'activation', 'payment', 'technical'];

export interface Person {
  id: string;
  name: string;
}

/** Filled in by the server from the IDs the case was opened with (SRS 4.13 "automatically include"). */
export interface SupportContext {
  event?: { id: string; title: string };
  order?: { id: string; number: string };
  ticket?: { id: string };
}

export interface SupportMessage {
  id: string;
  author: Person & { side: 'requester' | 'staff' };
  body: string;
  createdAt: Date;
}

export interface SupportCaseSummary {
  id: string;
  number: string;
  kind: SupportCaseKind;
  subject: string;
  category: SupportCategory;
  status: SupportStatus;
  requester: Person;
  assignee: Person | null;
  context: SupportContext;
  createdAt: Date;
  updatedAt: Date;
}

export interface SupportCase extends SupportCaseSummary {
  messages: SupportMessage[];
  /** True when the signed-in user is staff for this case (can assign and change status). */
  canManage: boolean;
  /** People the case can be assigned to; empty unless `canManage`. */
  assignableStaff: Person[];
}

export interface OpenCaseInput {
  kind: SupportCaseKind;
  category: SupportCategory;
  subject: string;
  message: string;
  eventId?: string;
  orderId?: string;
  ticketId?: string;
}

export interface SupportApi {
  /** Cases the signed-in user opened. */
  listMyCases(): Promise<SupportCaseSummary[]>;
  /** Cases the signed-in user handles: attendee cases for their events (organizer) or all cases (admin). */
  listManagedCases(): Promise<SupportCaseSummary[]>;
  getCase(id: string): Promise<SupportCase>;
  openCase(input: OpenCaseInput): Promise<SupportCase>;
  reply(id: string, body: string): Promise<SupportCase>;
  /** Staff only. */
  updateCase(id: string, change: { status?: SupportStatus; assigneeId?: string | null }): Promise<SupportCase>;
}

// ---- Wire format (backend schemas, after camelCasing) ----

interface CaseDto {
  id: string;
  openedByUserId: string;
  kind: SupportCaseKind;
  category: string;
  subject: string;
  status: string;
  eventId: string | null;
  orderId: string | null;
  ticketId: string | null;
  assignedToUserId: string | null;
  createdAt: string;
  updatedAt: string;
}
interface CaseDetailDto extends CaseDto {
  messages: { id: string; senderUserId: string; senderName: string; body: string; sentAt: string }[];
}
interface MeDto {
  id: string;
  fullName: string;
}

const CATEGORY_TO_SERVER: Partial<Record<SupportCategory, string>> = {
  event_information: 'event_info',
  check_in: 'checkin',
  activation: 'account',
};
const CATEGORY_FROM_SERVER: Record<string, SupportCategory> = { event_info: 'event_information', checkin: 'check_in' };
const STATUS_TO_SERVER: Partial<Record<SupportStatus, string>> = { waiting_for_customer: 'waiting_customer' };
const STATUS_FROM_SERVER: Record<string, SupportStatus> = { waiting_customer: 'waiting_for_customer' };

function summaryFromDto(dto: CaseDto, names: Map<string, string> = new Map()): SupportCaseSummary {
  return {
    id: dto.id,
    number: orderNumber(dto.id),
    kind: dto.kind,
    subject: dto.subject,
    category: CATEGORY_FROM_SERVER[dto.category] ?? (dto.category as SupportCategory),
    status: STATUS_FROM_SERVER[dto.status] ?? (dto.status as SupportStatus),
    requester: { id: dto.openedByUserId, name: names.get(dto.openedByUserId) ?? '' },
    assignee: dto.assignedToUserId ? { id: dto.assignedToUserId, name: names.get(dto.assignedToUserId) ?? '' } : null,
    context: {
      event: dto.eventId ? { id: dto.eventId, title: '' } : undefined,
      order: dto.orderId ? { id: dto.orderId, number: orderNumber(dto.orderId) } : undefined,
      ticket: dto.ticketId ? { id: dto.ticketId } : undefined,
    },
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
  };
}

function caseFromDto(dto: CaseDetailDto, me: MeDto): SupportCase {
  const names = new Map(dto.messages.map((m) => [m.senderUserId, m.senderName]));
  names.set(me.id, me.fullName);
  const canManage = dto.openedByUserId !== me.id;
  return {
    ...summaryFromDto(dto, names),
    messages: dto.messages.map((m) => ({
      id: m.id,
      author: { id: m.senderUserId, name: m.senderName, side: m.senderUserId === dto.openedByUserId ? 'requester' : 'staff' },
      body: m.body,
      createdAt: new Date(m.sentAt),
    })),
    canManage,
    assignableStaff: canManage ? [{ id: me.id, name: me.fullName }] : [],
  };
}

const one = (id: string) => `/support/cases/${encodeURIComponent(id)}`;
const me = () => request<MeDto>('/me');

async function listCases(mine: boolean): Promise<SupportCaseSummary[]> {
  const [user, page] = await Promise.all([me(), request<Page<CaseDto>>('/support/cases?limit=100')]);
  return page.items.filter((c) => (c.openedByUserId === user.id) === mine).map((c) => summaryFromDto(c));
}

async function getCase(id: string): Promise<SupportCase> {
  const [user, dto] = await Promise.all([me(), request<CaseDetailDto>(one(id))]);
  return caseFromDto(dto, user);
}

export const httpSupportApi: SupportApi = {
  listMyCases: () => listCases(true),
  listManagedCases: () => listCases(false),
  getCase,
  async openCase(input) {
    const body = { ...input, category: CATEGORY_TO_SERVER[input.category] ?? input.category };
    const [user, dto] = await Promise.all([me(), request<CaseDetailDto>('/support/cases', json('POST', body))]);
    return caseFromDto(dto, user);
  },
  async reply(id, body) {
    await request(`${one(id)}/messages`, json('POST', { body }));
    return getCase(id);
  },
  async updateCase(id, change) {
    const body: Record<string, unknown> = {};
    if (change.status) body.status = STATUS_TO_SERVER[change.status] ?? change.status;
    if (change.assigneeId !== undefined) body.assignedToUserId = change.assigneeId;
    await request(one(id), json('PATCH', body));
    return getCase(id);
  },
};
