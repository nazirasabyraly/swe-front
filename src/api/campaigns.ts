/*
 * Promo campaign API client (SRS 4.14). Backend: GET/POST /events/:id/campaigns,
 * POST /campaigns/:id/enable|disable, GET /campaigns/:id/qr.png.
 * The server generates the promo code, the trackable link and the QR image.
 *
 * Mapping notes:
 * - The backend status is only active/disabled; scheduled/expired/exhausted follow from the
 *   campaign's dates and remaining redemptions.
 * - Fixed discounts are in minor units on the server.
 * - Per-campaign results are in event analytics, not here, so `stats` reads zero.
 * - The QR image needs the bearer token, so it's loaded into an object URL.
 */
import { fromMinor, json, objectUrl, request, toMinor } from './http';
import { NO_END, NO_START } from './ticketTypes';

export type DiscountType = 'percent' | 'fixed';

/** Server-computed. Only `enabled` is set by the organizer; the rest follow from dates and limits. */
export type CampaignStatus = 'active' | 'scheduled' | 'expired' | 'exhausted' | 'disabled';

/** Server-recorded results (SRS 4.14). Money in KZT. */
export interface CampaignStats {
  redemptions: number;
  orders: number;
  ticketsSold: number;
  grossRevenue: number;
  discountTotal: number;
  netRevenue: number;
}

export interface Campaign {
  id: string;
  eventId: string;
  name: string;
  code: string;
  discountType: DiscountType;
  /** Percent (1–100) or whole KZT, depending on `discountType`. */
  discountValue: number;
  validFrom: Date;
  validUntil: Date;
  /** `null` means unlimited. */
  maxRedemptions: number | null;
  /** Empty means every ticket type of the event. */
  ticketTypeIds: string[];
  enabled: boolean;
  status: CampaignStatus;
  /** HTTPS event link with an opaque token; it never carries the discount itself. */
  link: string;
  /** Server-generated Campaign QR image (SVG) for display. */
  qrImageUrl: string;
  /** Same image, served as a download (Content-Disposition: attachment). */
  qrDownloadUrl: string;
  stats: CampaignStats;
  createdAt: Date;
}

export interface CampaignInput {
  name: string;
  /** Optional custom code; the server generates a unique one when it's empty. */
  code: string;
  discountType: DiscountType;
  discountValue: number;
  validFrom: Date;
  validUntil: Date;
  maxRedemptions: number | null;
  ticketTypeIds: string[];
}

export const CAMPAIGN_ERRORS = {
  codeTaken: 'promo_code_taken',
} as const;

export interface CampaignsApi {
  listCampaigns(eventId: string): Promise<Campaign[]>;
  createCampaign(eventId: string, input: CampaignInput): Promise<Campaign>;
  /** Disabling stops new redemptions straight away; orders already placed keep their discount. */
  setCampaignEnabled(eventId: string, id: string, enabled: boolean): Promise<Campaign>;
}

/** Backend `CampaignRead`, after camelCasing. */
export interface CampaignDto {
  id: string;
  eventId: string;
  name: string;
  discountType: DiscountType;
  discountValue: number;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  remaining: number | null;
  status: 'active' | 'disabled';
  ticketTypeIds: string[];
  code: string;
  qrLink: string;
  createdAt: string;
}

function campaignStatus(dto: CampaignDto, now = new Date()): CampaignStatus {
  if (dto.status === 'disabled') return 'disabled';
  if (dto.startsAt && now < new Date(dto.startsAt)) return 'scheduled';
  if (dto.endsAt && now > new Date(dto.endsAt)) return 'expired';
  if (dto.remaining === 0) return 'exhausted';
  return 'active';
}

export const campaignFromDto = (dto: CampaignDto, qrImageUrl = ''): Campaign => ({
  id: dto.id,
  eventId: dto.eventId,
  name: dto.name,
  code: dto.code,
  discountType: dto.discountType,
  discountValue: dto.discountType === 'fixed' ? fromMinor(dto.discountValue) : dto.discountValue,
  validFrom: dto.startsAt ? new Date(dto.startsAt) : NO_START,
  validUntil: dto.endsAt ? new Date(dto.endsAt) : NO_END,
  maxRedemptions: dto.maxRedemptions,
  ticketTypeIds: dto.ticketTypeIds,
  enabled: dto.status !== 'disabled',
  status: campaignStatus(dto),
  link: dto.qrLink,
  qrImageUrl,
  qrDownloadUrl: qrImageUrl,
  stats: { redemptions: dto.redemptionCount, orders: 0, ticketsSold: 0, grossRevenue: 0, discountTotal: 0, netRevenue: 0 },
  createdAt: new Date(dto.createdAt),
});

/** Adds the QR image (protected endpoint) to a campaign. */
async function withQr(dto: CampaignDto): Promise<Campaign> {
  const qr = await objectUrl(`/campaigns/${encodeURIComponent(dto.id)}/qr.png`).catch(() => '');
  return campaignFromDto(dto, qr);
}

const base = (eventId: string) => `/events/${encodeURIComponent(eventId)}/campaigns`;

export const httpCampaignsApi: CampaignsApi = {
  async listCampaigns(eventId) {
    return Promise.all((await request<CampaignDto[]>(base(eventId))).map(withQr));
  },
  async createCampaign(eventId, input) {
    const body = {
      name: input.name,
      // Omitted -> the server generates one.
      code: input.code.trim() ? input.code.trim().toUpperCase() : undefined,
      discountType: input.discountType,
      discountValue: input.discountType === 'fixed' ? toMinor(input.discountValue) : input.discountValue,
      startsAt: input.validFrom.toISOString(),
      endsAt: input.validUntil.toISOString(),
      maxRedemptions: input.maxRedemptions,
      ticketTypeIds: input.ticketTypeIds,
    };
    return withQr(await request<CampaignDto>(base(eventId), json('POST', body)));
  },
  async setCampaignEnabled(_eventId, id, enabled) {
    const path = `/campaigns/${encodeURIComponent(id)}/${enabled ? 'enable' : 'disable'}`;
    return withQr(await request<CampaignDto>(path, { method: 'POST' }));
  },
};
