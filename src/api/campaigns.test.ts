import { httpCampaignsApi, type CampaignDto } from './campaigns';

const dto: CampaignDto = {
  id: 'cmp-1',
  eventId: 'evt-1',
  name: 'Posters',
  code: 'STUDENT20',
  discountType: 'percent',
  discountValue: 20,
  validFrom: '2026-09-25T05:00:00.000Z',
  validUntil: '2026-10-12T12:00:00.000Z',
  maxRedemptions: null,
  ticketTypeIds: [],
  enabled: true,
  status: 'active',
  link: 'https://biletflow.kz/events/evt-1?campaign=abc',
  qrImageUrl: 'https://cdn/qr.svg',
  qrDownloadUrl: 'https://api/qr.svg?download=1',
  stats: { redemptions: 0, orders: 0, ticketsSold: 0, grossRevenue: 0, discountTotal: 0, netRevenue: 0 },
  createdAt: '2026-09-20T00:00:00.000Z',
};

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('httpCampaignsApi', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('lists campaigns and parses dates', async () => {
    fetchMock.mockResolvedValue(jsonResponse([dto]));
    const [campaign] = await httpCampaignsApi.listCampaigns('evt-1');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/events/evt-1/campaigns');
    expect(campaign.validFrom).toEqual(new Date('2026-09-25T05:00:00.000Z'));
    expect(campaign.createdAt).toEqual(new Date('2026-09-20T00:00:00.000Z'));
  });

  it('creates with ISO dates and toggles with PATCH { enabled }', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(dto));
    await httpCampaignsApi.createCampaign('evt-1', {
      name: 'Posters',
      code: '',
      discountType: 'fixed',
      discountValue: 1000,
      validFrom: new Date('2026-09-25T05:00:00Z'),
      validUntil: new Date('2026-10-12T12:00:00Z'),
      maxRedemptions: 50,
      ticketTypeIds: ['tt-1'],
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      name: 'Posters',
      code: '',
      discountType: 'fixed',
      discountValue: 1000,
      validFrom: '2026-09-25T05:00:00.000Z',
      validUntil: '2026-10-12T12:00:00.000Z',
      maxRedemptions: 50,
      ticketTypeIds: ['tt-1'],
    });

    await httpCampaignsApi.setCampaignEnabled('evt-1', 'cmp-1', false);
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('/api/events/evt-1/campaigns/cmp-1');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toEqual({ enabled: false });
  });
});
