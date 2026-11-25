import type { CampaignsApi, Campaign } from '../campaigns';
import type { EventsApi, OrganizerEvent } from '../events';
import type { PaidSalesApi, PaidSalesState } from '../paidSales';
import {
  PROMO_ERRORS,
  type AppliedPromo,
  type PublicEvent,
  type PublicEventsApi,
  type PublicEventSummary,
  type PublicTicketState,
  type Quote,
} from '../publicEvents';
import type { TicketType, TicketTypesApi } from '../ticketTypes';
import { DEFAULT_TIME_ZONE } from '../../features/create-event/timeZones';
import { toZonedInputs, zonedDateTime } from '../../lib/timezone';
import { mockDelay, mockError } from './util';

/**
 * In-browser stand-in for the public endpoints. It reads the organizer-side mocks, so anything an
 * organizer publishes shows up here, plus a few events by other organizers for Discover.
 * Discounts and fees are calculated here because this plays the server.
 */

/** Simulated processing fee: 3.5% of the discounted subtotal (prototype: 20 000 ₸ → 700 ₸). */
const FEE_RATE = 0.035;

interface Source {
  event: OrganizerEvent;
  organizerName: string;
  types: TicketType[];
  paidSales: PaidSalesState;
  campaigns: Campaign[];
}

const day = 24 * 60 * 60 * 1000;
const at = (days: number, time: string) => {
  const { date } = toZonedInputs(new Date(Date.now() + days * day), DEFAULT_TIME_ZONE);
  return zonedDateTime(date, time, DEFAULT_TIME_ZONE)!;
};

type OtherSeed = Pick<OrganizerEvent, 'id' | 'title' | 'description' | 'category' | 'venue' | 'capacity' | 'refundPolicy'> & {
  inDays: number;
  start: string;
  end: string;
  organizerName: string;
  types: { name: string; kind: 'free' | 'paid'; price: number; quantity: number; sold: number; maxPerOrder: number }[];
};

/** Other organizers' events from prototype screen 1. */
const OTHERS: OtherSeed[] = [
  {
    id: 'evt-steppe-film', title: 'Steppe Film Festival — Opening Night', category: 'Arts', inDays: 9, start: '20:00', end: '23:00',
    description: 'Premiere screening and a Q&A with the directors.', venue: { name: 'Kinopark 11', address: 'Abay Ave 44', city: 'Almaty' },
    capacity: 300, refundPolicy: 'Refunds up to 24 hours before the screening.', organizerName: 'Steppe Film Society',
    types: [{ name: 'Standard seat', kind: 'paid', price: 3500, quantity: 280, sold: 256, maxPerOrder: 6 }],
  },
  {
    id: 'evt-career-day', title: 'Student Career Day 2026', category: 'Education', inDays: 6, start: '10:00', end: '17:00',
    description: 'Meet 40 employers, CV reviews and short talks.', venue: { name: 'KBTU Main Hall', address: 'Tole Bi 59', city: 'Almaty' },
    capacity: 400, refundPolicy: '', organizerName: 'KBTU Careers Office',
    types: [{ name: 'Student entry', kind: 'free', price: 0, quantity: 400, sold: 220, maxPerOrder: 1 }],
  },
  {
    id: 'evt-half-marathon-expo', title: 'Astana Half Marathon — Expo', category: 'Sport', inDays: 23, start: '09:00', end: '18:00',
    description: 'Bib pick-up, gear stalls and a pacing clinic.', venue: { name: 'EXPO Congress Centre', address: 'Mangilik El 53/1', city: 'Astana' },
    capacity: 800, refundPolicy: '', organizerName: 'Astana Runners',
    types: [{ name: 'Expo pass', kind: 'free', price: 0, quantity: 800, sold: 640, maxPerOrder: 4 }],
  },
  {
    id: 'evt-jazz-panfilov', title: 'Jazz on Panfilov', category: 'Music', inDays: 11, start: '17:00', end: '20:00',
    description: 'An open-air afternoon of standards.', venue: { name: 'Panfilov Park Stage', address: 'Panfilov St', city: 'Almaty' },
    capacity: 400, refundPolicy: 'Full refunds if the concert is cancelled for weather.', organizerName: 'Almaty Jazz Club',
    types: [
      { name: 'Lawn', kind: 'free', price: 0, quantity: 300, sold: 120, maxPerOrder: 4 },
      { name: 'Reserved bench', kind: 'paid', price: 2000, quantity: 100, sold: 70, maxPerOrder: 4 },
    ],
  },
];

function otherSource(seed: OtherSeed): Source {
  const startsAt = at(seed.inDays, seed.start);
  const event: OrganizerEvent = {
    ...seed,
    imageUrls: [],
    format: 'physical',
    startsAt,
    endsAt: at(seed.inDays, seed.end),
    timeZone: DEFAULT_TIME_ZONE,
    visibility: 'public',
    registrationOpensAt: at(-10, '09:00'),
    registrationClosesAt: startsAt,
    status: 'published',
  };
  const types = seed.types.map((t, i): TicketType => ({
    id: `${seed.id}-tt${i}`,
    eventId: seed.id,
    description: '',
    hidden: false,
    salesStartAt: event.registrationOpensAt,
    salesEndAt: event.registrationClosesAt,
    ...t,
    counts: { available: t.quantity - t.sold, reserved: 0, sold: t.sold, refunded: 0, checkedIn: 0 },
  }));
  return { event, organizerName: seed.organizerName, types, paidSales: 'active', campaigns: [] };
}

const ORGANIZER_NAMES: Record<string, string> = { 'evt-almaty-nights': 'Nomad Sound Collective' };

/** Shared with the admin mock: suspensions and platform settings. */
export interface MockModeration {
  suspendedEvents: Set<string>;
  suspendedUsers: Set<string>;
  settings: { activationFee: number; processingFeePercent: number; holdMinutes: number; supportEmail: string };
}

export const createMockModeration = (): MockModeration => ({
  suspendedEvents: new Set(),
  suspendedUsers: new Set(),
  settings: { activationFee: 9900, processingFeePercent: 3.5, holdMinutes: 10, supportEmail: 'support@biletflow.kz' },
});

interface Deps {
  moderation?: MockModeration;
  events: EventsApi;
  ticketTypes: TicketTypesApi;
  paidSales: PaidSalesApi;
  campaigns: CampaignsApi;
}

export function createMockPublicEventsApi(deps: Deps, others: OtherSeed[] = OTHERS, now = () => new Date()): PublicEventsApi {
  const otherSources = others.map(otherSource);

  async function ownSource(event: OrganizerEvent): Promise<Source> {
    const [types, paidSales, campaigns] = await Promise.all([
      deps.ticketTypes.listTicketTypes(event.id),
      deps.paidSales.getPaidSales(event.id),
      deps.campaigns.listCampaigns(event.id),
    ]);
    return { event, organizerName: ORGANIZER_NAMES[event.id] ?? 'Demo Organizer', types, paidSales: paidSales.state, campaigns };
  }

  const visibleTo = (event: OrganizerEvent) =>
    event.status === 'published' && event.visibility !== 'private' && event.endsAt > now();

  async function sources(): Promise<Source[]> {
    const own = (await deps.events.listMyEvents()).filter(visibleTo);
    return [...(await Promise.all(own.map(ownSource))), ...otherSources];
  }

  async function sourceFor(id: string): Promise<Source> {
    const other = otherSources.find((s) => s.event.id === id);
    if (other) return other;
    const event = await deps.events.getEvent(id).catch(() => null);
    if (!event || !visibleTo(event)) throw mockError(404, 'event_not_found', 'This event isn’t available.');
    return ownSource(event);
  }

  const suspended = (eventId: string) => deps.moderation?.suspendedEvents.has(eventId) ?? false;

  function ticketState(type: TicketType, source: Source): PublicTicketState {
    const t = now();
    if (suspended(source.event.id)) return 'unavailable';
    if (type.kind === 'paid' && source.paidSales !== 'active') return 'unavailable';
    if (type.counts.available === 0) return 'sold_out';
    if (t < type.salesStartAt || t < source.event.registrationOpensAt) return 'scheduled';
    if (t > type.salesEndAt || t > source.event.registrationClosesAt) return 'ended';
    return 'on_sale';
  }

  function toPublic(source: Source): PublicEvent {
    const { event } = source;
    const t = now();
    return structuredClone({
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
      organizerName: source.organizerName,
      registration: t < event.registrationOpensAt ? 'not_open' : t > event.registrationClosesAt ? 'closed' : 'open',
      paidSalesActive: source.paidSales === 'active',
      salesSuspended: suspended(event.id),
      paymentsSimulated: true,
      ticketTypes: source.types
        .filter((type) => !type.hidden)
        .map((type) => ({
          id: type.id,
          name: type.name,
          description: type.description,
          kind: type.kind,
          price: type.price,
          maxPerOrder: type.maxPerOrder,
          available: type.counts.available,
          salesStartAt: type.salesStartAt,
          salesEndAt: type.salesEndAt,
          state: ticketState(type, source),
        })),
    });
  }

  function summary(source: Source): PublicEventSummary {
    const types = source.types.filter((type) => !type.hidden);
    return {
      id: source.event.id,
      title: source.event.title,
      category: source.event.category,
      coverUrl: source.event.imageUrls[0] ?? null,
      startsAt: source.event.startsAt,
      timeZone: source.event.timeZone,
      venue: { name: source.event.venue.name, city: source.event.venue.city },
      priceFrom: types.length ? Math.min(...types.map((type) => type.price)) : null,
      allFree: types.length > 0 && types.every((type) => type.price === 0),
      available: types.reduce((sum, type) => sum + type.counts.available, 0),
      total: types.reduce((sum, type) => sum + type.quantity, 0),
    };
  }

  /** Validates a campaign the way the server would; returns it as an applied promo. */
  function validCampaign(campaign: Campaign | undefined): AppliedPromo {
    if (!campaign) throw mockError(404, PROMO_ERRORS.notFound, 'This promo code doesn’t exist for this event.');
    const errors: Partial<Record<Campaign['status'], [string, string]>> = {
      disabled: [PROMO_ERRORS.disabled, 'This promo code has been turned off by the organizer.'],
      expired: [PROMO_ERRORS.expired, 'This promo code has expired.'],
      scheduled: [PROMO_ERRORS.notStarted, 'This promo code isn’t valid yet.'],
      exhausted: [PROMO_ERRORS.exhausted, 'This promo code has been used the maximum number of times.'],
    };
    const error = errors[campaign.status];
    if (error) throw mockError(409, error[0], error[1]);
    const { code, discountType, discountValue, ticketTypeIds } = campaign;
    return { code, discountType, discountValue, ticketTypeIds };
  }

  const tokenOf = (campaign: Campaign) => new URL(campaign.link).searchParams.get('campaign');

  return {
    async listPublicEvents({ q, category }) {
      await mockDelay();
      const needle = q?.trim().toLowerCase() ?? '';
      return (await sources())
        .filter((s) => s.event.visibility === 'public')
        .filter((s) => !category || s.event.category === category)
        .filter((s) =>
          !needle ||
          [s.event.title, s.event.venue.name, s.event.venue.city].some((text) => text.toLowerCase().includes(needle)),
        )
        .sort((a, b) => a.event.startsAt.getTime() - b.event.startsAt.getTime())
        .map(summary);
    },
    async getPublicEvent(id) {
      await mockDelay();
      return toPublic(await sourceFor(id));
    },
    async redeemCampaignLink(eventId, token) {
      await mockDelay();
      const source = await sourceFor(eventId);
      return validCampaign(source.campaigns.find((c) => tokenOf(c) === token));
    },
    async checkPromoCode(eventId, code) {
      await mockDelay();
      const source = await sourceFor(eventId);
      const wanted = code.trim().toUpperCase();
      return validCampaign(source.campaigns.find((c) => c.code === wanted));
    },
    async quote(eventId, items, promoCode): Promise<Quote> {
      await mockDelay();
      const source = await sourceFor(eventId);
      const event = toPublic(source);
      const lines = items
        .filter((item) => item.quantity > 0)
        .map((item) => {
          const type = event.ticketTypes.find((t) => t.id === item.ticketTypeId);
          if (!type || type.state !== 'on_sale') {
            throw mockError(409, 'ticket_unavailable', 'One of the selected tickets is no longer on sale.');
          }
          if (item.quantity > type.maxPerOrder || item.quantity > type.available) {
            throw mockError(422, 'quantity_over_limit', `You can choose up to ${Math.min(type.maxPerOrder, type.available)} “${type.name}” tickets.`);
          }
          return { ticketTypeId: type.id, name: type.name, quantity: item.quantity, unitPrice: type.price, lineTotal: type.price * item.quantity };
        });
      const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);

      let discount = 0;
      let appliedCode: string | null = null;
      if (promoCode) {
        const promo = validCampaign(source.campaigns.find((c) => c.code === promoCode.toUpperCase()));
        const applicable = lines.filter(
          (line) => line.unitPrice > 0 && (promo.ticketTypeIds.length === 0 || promo.ticketTypeIds.includes(line.ticketTypeId)),
        );
        if (lines.length > 0 && applicable.length === 0) {
          throw mockError(409, PROMO_ERRORS.notApplicable, 'This promo code doesn’t apply to the tickets you chose.');
        }
        discount = applicable.reduce(
          (sum, line) =>
            sum +
            (promo.discountType === 'percent'
              ? Math.round((line.lineTotal * promo.discountValue) / 100)
              : Math.min(promo.discountValue, line.unitPrice) * line.quantity),
          0,
        );
        appliedCode = promo.code;
      }
      const rate = deps.moderation ? deps.moderation.settings.processingFeePercent / 100 : FEE_RATE;
      const fee = Math.round((subtotal - discount) * rate);
      return { lines, subtotal, discount, promoCode: appliedCode, fee, total: subtotal - discount + fee };
    },
  };
}
