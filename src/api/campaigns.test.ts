import { httpCampaignsApi } from './campaigns';

/** `CampaignRead` as the backend sends it. */
const wire = {
  id: 'cmp-1',
  event_id: 'evt-1',
  name: 'Posters',
  discount_type: 'fixed',
  discount_value: 100_000,
  starts_at: '2026-09-25T05:00:00Z',
  ends_at: null,
  max_redemptions: 50,
  redemption_count: 3,
  remaining: 47,
  status: 'active',
  ticket_type_ids: ['tt-1'],
  code: 'POSTER10',
  qr_link: 'https://biletflow.kz/e/evt-1?c=tok',
  created_at: '2026-09-01T00:00:00Z',
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('httpCampaignsApi', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:qr' }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const respond = () =>
    fetchMock.mockImplementation(async (url) =>
      String(url).endsWith('/qr.png') ? new Response('png') : jsonResponse(String(url).endsWith('/campaigns') ? [wire] : wire),
    );

  it('lists campaigns and maps them', async () => {
    respond();
    const [campaign] = await httpCampaignsApi.listCampaigns('evt-1');

    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/events/evt-1/campaigns');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/campaigns/cmp-1/qr.png');
    expect(campaign).toMatchObject({
      discountValue: 1000,
      validFrom: new Date('2026-09-25T05:00:00Z'),
      enabled: true,
      status: 'active',
      link: 'https://biletflow.kz/e/evt-1?c=tok',
      qrImageUrl: 'blob:qr',
      stats: { redemptions: 3 },
    });
  });

  it('creates with backend field names and toggles with enable/disable', async () => {
    respond();
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
      discount_type: 'fixed',
      discount_value: 100_000,
      starts_at: '2026-09-25T05:00:00.000Z',
      ends_at: '2026-10-12T12:00:00.000Z',
      max_redemptions: 50,
      ticket_type_ids: ['tt-1'],
    });

    fetchMock.mockClear();
    await httpCampaignsApi.setCampaignEnabled('evt-1', 'cmp-1', false);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/campaigns/cmp-1/disable');
    expect(init?.method).toBe('POST');
  });
});
