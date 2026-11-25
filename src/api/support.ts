/*
 * Support cases (SRS 4.13). Contract: docs/backend-contract.md, "Support".
 * Attendee cases are handled by the event's organizer; organizer cases by platform admins.
 * The server decides who may see or manage a case (`canManage`); the UI only follows it.
 * Asynchronous: no WebSocket, the thread is reloaded after each action.
 */
import { json, request } from './http';

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

type Dated<T> = Omit<T, 'createdAt' | 'updatedAt'> & { createdAt: string; updatedAt: string };
export type SupportCaseSummaryDto = Dated<SupportCaseSummary>;
export type SupportCaseDto = Dated<Omit<SupportCase, 'messages'>> & {
  messages: (Omit<SupportMessage, 'createdAt'> & { createdAt: string })[];
};

const summaryFromDto = (dto: SupportCaseSummaryDto): SupportCaseSummary => ({
  ...dto,
  createdAt: new Date(dto.createdAt),
  updatedAt: new Date(dto.updatedAt),
});

export const caseFromDto = (dto: SupportCaseDto): SupportCase => ({
  ...dto,
  createdAt: new Date(dto.createdAt),
  updatedAt: new Date(dto.updatedAt),
  messages: dto.messages.map((m) => ({ ...m, createdAt: new Date(m.createdAt) })),
});

const one = (id: string) => `/api/support/cases/${encodeURIComponent(id)}`;

export const httpSupportApi: SupportApi = {
  async listMyCases() {
    return (await request<SupportCaseSummaryDto[]>('/api/support/cases?mine=true')).map(summaryFromDto);
  },
  async listManagedCases() {
    return (await request<SupportCaseSummaryDto[]>('/api/support/cases?managed=true')).map(summaryFromDto);
  },
  async getCase(id) {
    return caseFromDto(await request<SupportCaseDto>(one(id)));
  },
  async openCase(input) {
    return caseFromDto(await request<SupportCaseDto>('/api/support/cases', json('POST', input)));
  },
  async reply(id, body) {
    return caseFromDto(await request<SupportCaseDto>(`${one(id)}/messages`, json('POST', { body })));
  },
  async updateCase(id, change) {
    return caseFromDto(await request<SupportCaseDto>(one(id), json('PATCH', change)));
  },
};
