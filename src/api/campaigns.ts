/*
 * Promo campaign API client (SRS 4.14). Contract: docs/backend-contract.md, "Promo campaigns".
 * The server generates the promo code, the trackable link, the QR image and every statistic.
 * The client never calculates a discount: it only shows how a campaign is configured.
 */
import { json, request } from './http';

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

export interface CampaignDto extends Omit<Campaign, 'validFrom' | 'validUntil' | 'createdAt'> {
  validFrom: string;
  validUntil: string;
  createdAt: string;
}

export const campaignFromDto = (dto: CampaignDto): Campaign => ({
  ...dto,
  validFrom: new Date(dto.validFrom),
  validUntil: new Date(dto.validUntil),
  createdAt: new Date(dto.createdAt),
});

const base = (eventId: string) => `/api/events/${encodeURIComponent(eventId)}/campaigns`;

export const httpCampaignsApi: CampaignsApi = {
  async listCampaigns(eventId) {
    return (await request<CampaignDto[]>(base(eventId))).map(campaignFromDto);
  },
  async createCampaign(eventId, input) {
    const body = { ...input, validFrom: input.validFrom.toISOString(), validUntil: input.validUntil.toISOString() };
    return campaignFromDto(await request<CampaignDto>(base(eventId), json('POST', body)));
  },
  async setCampaignEnabled(eventId, id, enabled) {
    return campaignFromDto(
      await request<CampaignDto>(`${base(eventId)}/${encodeURIComponent(id)}`, json('PATCH', { enabled })),
    );
  },
};
