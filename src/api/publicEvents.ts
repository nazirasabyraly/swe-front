/*
 * Public (attendee-facing) event API: discovery, the event page, promo codes and price quotes.
 * Contract: docs/backend-contract.md, "Public events". No sign-in needed.
 * Every amount here is calculated by the server; the client only displays it.
 */
import type { EventCategory } from '../features/create-event/types';
import { json, request } from './http';

/** Why a ticket type can or can't be selected right now, decided by the server. */
export type PublicTicketState = 'on_sale' | 'scheduled' | 'ended' | 'sold_out' | 'unavailable';

export interface PublicTicketType {
  id: string;
  name: string;
  description: string;
  kind: 'free' | 'paid';
  price: number;
  maxPerOrder: number;
  available: number;
  salesStartAt: Date;
  salesEndAt: Date;
  state: PublicTicketState;
}

export interface PublicEvent {
  id: string;
  title: string;
  description: string;
  category: EventCategory;
  imageUrls: string[];
  venue: { name: string; address: string; city: string };
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
  refundPolicy: string;
  registrationOpensAt: Date;
  registrationClosesAt: Date;
  capacity: number;
  organizerName: string;
  registration: 'not_open' | 'open' | 'closed';
  paidSalesActive: boolean;
  /** An admin stopped all sales for this event (SRS 4.12); every ticket is `unavailable`. */
  salesSuspended: boolean;
  /** True while payments are simulated (academic MVP). The UI must say so wherever money is shown. */
  paymentsSimulated: boolean;
  ticketTypes: PublicTicketType[];
}

export interface PublicEventSummary {
  id: string;
  title: string;
  category: EventCategory;
  coverUrl: string | null;
  startsAt: Date;
  timeZone: string;
  venue: { name: string; city: string };
  /** Lowest visible price in KZT; null when no tickets are listed. */
  priceFrom: number | null;
  allFree: boolean;
  available: number;
  /** Total tickets across visible types; only used to draw the remaining-inventory bar. */
  total: number;
}

export interface DiscoverQuery {
  q?: string;
  category?: EventCategory;
}

/** A promo the server accepted for this event. */
export interface AppliedPromo {
  code: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  /** Empty means every ticket type. */
  ticketTypeIds: string[];
}

export interface QuoteItem {
  ticketTypeId: string;
  quantity: number;
  /** Assigned seating only: the chosen seats; `quantity` equals their count (SRS 4.3.1). */
  seatIds?: string[];
}

export interface Quote {
  lines: { ticketTypeId: string; name: string; quantity: number; unitPrice: number; lineTotal: number }[];
  subtotal: number;
  discount: number;
  /** The code the discount came from, or null when none applies. */
  promoCode: string | null;
  fee: number;
  total: number;
}

export const PROMO_ERRORS = {
  notFound: 'promo_not_found',
  notStarted: 'promo_not_started',
  expired: 'promo_expired',
  disabled: 'promo_disabled',
  exhausted: 'promo_exhausted',
  notApplicable: 'promo_not_applicable',
} as const;
export type PromoErrorCode = (typeof PROMO_ERRORS)[keyof typeof PROMO_ERRORS];

export interface PublicEventsApi {
  listPublicEvents(query: DiscoverQuery): Promise<PublicEventSummary[]>;
  /** 404 `event_not_found` for drafts, cancelled and private events. Unlisted events open by link. */
  getPublicEvent(id: string): Promise<PublicEvent>;
  /** Resolves the opaque token from a campaign link or QR; errors use PROMO_ERRORS codes. */
  redeemCampaignLink(eventId: string, token: string): Promise<AppliedPromo>;
  checkPromoCode(eventId: string, code: string): Promise<AppliedPromo>;
  /** Server-side totals for a selection; a promo that no longer applies fails with a PROMO_ERRORS code. */
  quote(eventId: string, items: QuoteItem[], promoCode: string | null): Promise<Quote>;
}

type Dated<T, K extends keyof T> = Omit<T, K> & Record<K, string>;
export type PublicTicketTypeDto = Dated<PublicTicketType, 'salesStartAt' | 'salesEndAt'>;
export interface PublicEventDto
  extends Omit<
    Dated<PublicEvent, 'startsAt' | 'endsAt' | 'registrationOpensAt' | 'registrationClosesAt'>,
    'ticketTypes'
  > {
  ticketTypes: PublicTicketTypeDto[];
}
export type PublicEventSummaryDto = Dated<PublicEventSummary, 'startsAt'>;

export const publicEventFromDto = (dto: PublicEventDto): PublicEvent => ({
  ...dto,
  startsAt: new Date(dto.startsAt),
  endsAt: new Date(dto.endsAt),
  registrationOpensAt: new Date(dto.registrationOpensAt),
  registrationClosesAt: new Date(dto.registrationClosesAt),
  ticketTypes: dto.ticketTypes.map((t) => ({
    ...t,
    salesStartAt: new Date(t.salesStartAt),
    salesEndAt: new Date(t.salesEndAt),
  })),
});

const base = (id: string) => `/api/public/events/${encodeURIComponent(id)}`;

export const httpPublicEventsApi: PublicEventsApi = {
  async listPublicEvents({ q, category }) {
    const params = new URLSearchParams();
    if (q?.trim()) params.set('q', q.trim());
    if (category) params.set('category', category);
    const query = params.toString();
    const list = await request<PublicEventSummaryDto[]>(`/api/public/events${query ? `?${query}` : ''}`);
    return list.map((dto) => ({ ...dto, startsAt: new Date(dto.startsAt) }));
  },
  async getPublicEvent(id) {
    return publicEventFromDto(await request<PublicEventDto>(base(id)));
  },
  redeemCampaignLink(eventId, token) {
    return request<AppliedPromo>(`${base(eventId)}/campaign-links/${encodeURIComponent(token)}`);
  },
  checkPromoCode(eventId, code) {
    return request<AppliedPromo>(`${base(eventId)}/promo-codes/check`, json('POST', { code }));
  },
  quote(eventId, items, promoCode) {
    return request<Quote>(`${base(eventId)}/quote`, json('POST', { items, promoCode }));
  },
};
