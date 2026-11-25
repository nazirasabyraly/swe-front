/*
 * Public (attendee-facing) event API: discovery, the event page, promo codes and price quotes.
 * Backend: GET /events, GET /events/:id, GET /events/:id/ticket-types, GET /campaigns/resolve,
 * POST /promo/validate. No sign-in needed.
 *
 * The backend has no combined "public event" or quote endpoint, so they are assembled here:
 * - The event page = the event + its ticket types; registration and ticket states are derived
 *   from the server's dates, `on_sale`, `sellable` and availability.
 * - A quote without a promo code is priced from the server's ticket prices; with a code it comes
 *   from `/promo/validate`. Fees are added by the server when the order is created.
 */
import type { EventCategory } from '../features/create-event/types';
import { fromDto as eventFromDto, isUrl, toCategory, type EventDto } from './events';
import { ApiError, fromMinor, json, notSupported, request, type Page } from './http';
import { ticketTypeFromDto, type TicketTypeDto } from './ticketTypes';

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

/** Backend `EventSummary`, after camelCasing. */
interface EventSummaryDto {
  id: string;
  title: string;
  category: string | null;
  coverImageKey: string | null;
  locationName: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  minPriceMinor: number | null;
}

const one = (id: string) => `/events/${encodeURIComponent(id)}`;

const listTicketTypes = async (eventId: string) =>
  (await request<TicketTypeDto[]>(`${one(eventId)}/ticket-types`)).filter((t) => !t.isHidden);

function ticketState(dto: TicketTypeDto, suspended: boolean, now: Date): PublicTicketState {
  if (suspended || !dto.sellable) return 'unavailable';
  if (dto.quantityAvailable <= 0) return 'sold_out';
  if (dto.onSale) return 'on_sale';
  if (dto.salesStartAt && now < new Date(dto.salesStartAt)) return 'scheduled';
  if (dto.salesEndAt && now > new Date(dto.salesEndAt)) return 'ended';
  return 'unavailable';
}

function toPublicEvent(dto: EventDto, types: TicketTypeDto[]): PublicEvent {
  const event = eventFromDto(dto);
  const now = new Date();
  const registration =
    now < event.registrationOpensAt ? 'not_open' : now > event.registrationClosesAt ? 'closed' : 'open';
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    category: event.category,
    imageUrls: event.imageUrls,
    venue: event.venue,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    timeZone: event.timeZone,
    refundPolicy: event.refundPolicy,
    registrationOpensAt: event.registrationOpensAt,
    registrationClosesAt: event.registrationClosesAt,
    capacity: event.capacity,
    organizerName: dto.organizer.displayName,
    registration,
    paidSalesActive: dto.paidSalesActive,
    salesSuspended: dto.isSuspended,
    // Payments are always simulated by this backend.
    paymentsSimulated: true,
    ticketTypes: types.map((t) => {
      const type = ticketTypeFromDto(t);
      return {
        id: type.id,
        name: type.name,
        description: type.description,
        kind: type.kind,
        price: type.price,
        maxPerOrder: type.maxPerOrder,
        available: t.quantityAvailable,
        salesStartAt: type.salesStartAt,
        salesEndAt: type.salesEndAt,
        state: ticketState(t, dto.isSuspended, now),
      };
    }),
  };
}

async function summaryFromDto(dto: EventSummaryDto): Promise<PublicEventSummary> {
  // The catalog entry has no availability, so each event's ticket types are loaded too.
  const types = await listTicketTypes(dto.id);
  return {
    id: dto.id,
    title: dto.title,
    category: toCategory(dto.category),
    coverUrl: isUrl(dto.coverImageKey) ? dto.coverImageKey : null,
    startsAt: new Date(dto.startsAt),
    timeZone: dto.timezone,
    // The catalog entry has no address, so the city is unknown here.
    venue: { name: dto.locationName ?? '', city: '' },
    priceFrom: dto.minPriceMinor === null ? null : fromMinor(dto.minPriceMinor),
    allFree: types.length > 0 && types.every((t) => t.kind === 'free'),
    available: types.reduce((sum, t) => sum + t.quantityAvailable, 0),
    total: types.reduce((sum, t) => sum + t.quantityTotal, 0),
  };
}

interface PromoValidateDto {
  valid: boolean;
  errorCode: string | null;
  message: string | null;
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
}

export const httpPublicEventsApi: PublicEventsApi = {
  async listPublicEvents({ q, category }) {
    const params = new URLSearchParams({ limit: '100' });
    if (q?.trim()) params.set('q', q.trim());
    if (category) params.set('category', category.toLowerCase());
    const page = await request<Page<EventSummaryDto>>(`/events?${params}`);
    return Promise.all(page.items.map(summaryFromDto));
  },
  async getPublicEvent(id) {
    const [event, types] = await Promise.all([request<EventDto>(one(id)), listTicketTypes(id)]);
    return toPublicEvent(event, types);
  },
  async redeemCampaignLink(_eventId, token) {
    const { eventId, code } = await request<{ eventId: string; code: string }>(
      `/campaigns/resolve?token=${encodeURIComponent(token)}`,
    );
    // The link only names the code; its discount comes from the promo check.
    return httpPublicEventsApi.checkPromoCode(eventId, code);
  },
  async checkPromoCode() {
    // `/promo/validate` needs the selected tickets and returns totals, not the campaign's terms.
    return notSupported('Promo codes');
  },
  async quote(eventId, items, promoCode) {
    if (items.some((i) => i.seatIds?.length)) notSupported('Assigned seating');
    const types = await request<TicketTypeDto[]>(`${one(eventId)}/ticket-types`);
    const lines = items.map((item) => {
      const type = types.find((t) => t.id === item.ticketTypeId);
      if (!type) throw new ApiError(404, { code: 'ticket_type_not_found', serverMessage: 'Ticket type not found' });
      if (item.quantity > type.quantityAvailable) {
        throw new ApiError(409, { code: 'sold_out', serverMessage: `Only ${type.quantityAvailable} “${type.name}” tickets left` });
      }
      const unitPrice = fromMinor(type.priceMinor);
      return { ticketTypeId: type.id, name: type.name, quantity: item.quantity, unitPrice, lineTotal: unitPrice * item.quantity };
    });
    const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
    if (!promoCode) return { lines, subtotal, discount: 0, promoCode: null, fee: 0, total: subtotal };

    const result = await request<PromoValidateDto>(
      '/promo/validate',
      json('POST', { eventId, code: promoCode, items: items.map(({ ticketTypeId, quantity }) => ({ ticketTypeId, quantity })) }),
    );
    if (!result.valid) {
      throw new ApiError(422, { code: result.errorCode ?? 'promo_not_applicable', serverMessage: result.message ?? undefined });
    }
    return {
      lines,
      subtotal: fromMinor(result.subtotalMinor),
      discount: fromMinor(result.discountMinor),
      promoCode,
      fee: 0,
      total: fromMinor(result.totalMinor),
    };
  },
};
