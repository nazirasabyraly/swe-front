import { httpCheckoutApi } from './checkout';
import { httpOrdersApi } from './orders';

const eventWire = {
  id: 'evt-1',
  organizer: { id: 'org-1', display_name: 'Steppe Sound' },
  title: 'Almaty Nights',
  description: null,
  category: 'music',
  cover_image_key: null,
  location_name: 'Almaty Arena',
  location_address: 'Abay Ave 10, Almaty',
  venue_id: null,
  starts_at: '2030-10-12T14:00:00Z',
  ends_at: '2030-10-12T18:00:00Z',
  timezone: 'Asia/Almaty',
  visibility: 'public',
  capacity: 100,
  seating_mode: 'general_admission',
  status: 'published',
  lifecycle: 'upcoming',
  paid_sales_active: true,
  registration_opens_at: null,
  registration_closes_at: null,
  published_at: null,
  cancelled_at: null,
  is_suspended: false,
  calendar_links: { ics: '', google: '', outlook: '' },
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
};

const typeWire = {
  id: 'tt-1',
  event_id: 'evt-1',
  name: 'Standard',
  description: null,
  kind: 'paid',
  price_minor: 500_000,
  currency: 'KZT',
  quantity_total: 100,
  quantity_available: 10,
  max_per_order: 6,
  sales_start_at: null,
  sales_end_at: null,
  is_hidden: false,
  on_sale: true,
  sellable: true,
};

const orderWire = (status: string) => ({
  id: 'abcdef12-0000-0000-0000-000000000000',
  event_id: 'evt-1',
  event_title: 'Almaty Nights',
  buyer_user_id: 'u-1',
  status,
  currency: 'KZT',
  subtotal_minor: 1_000_000,
  discount_minor: 0,
  fees_minor: 0,
  total_minor: 1_000_000,
  promo_code: null,
  reserved_until: '2030-01-01T00:10:00Z',
  paid_at: null,
  created_at: '2026-09-01T00:00:00Z',
  items: [
    { id: 'i1', ticket_type_id: 'tt-1', ticket_type_name: 'Standard', unit_price_minor: 500_000, section: null, row_label: null, seat_number: null, attendee_name: 'A', attendee_email: 'me@x.kz', ticket_id: status === 'paid' ? 't1' : null },
    { id: 'i2', ticket_type_id: 'tt-1', ticket_type_name: 'Standard', unit_price_minor: 500_000, section: null, row_label: null, seat_number: null, attendee_name: 'B', attendee_email: 'me@x.kz', ticket_id: status === 'paid' ? 't2' : null },
  ],
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('httpCheckoutApi', () => {
  const fetchMock = vi.fn<typeof fetch>();
  let payOutcome = 'succeeded';
  let paid = false;
  beforeEach(() => {
    sessionStorage.clear();
    paid = false;
    payOutcome = 'succeeded';
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url, init) => {
      const path = String(url);
      if (path.endsWith('/ticket-types')) return jsonResponse([typeWire]);
      if (path === '/api/v1/events/evt-1') return jsonResponse(eventWire);
      if (path === '/api/v1/me') return jsonResponse({ id: 'u-1', email: 'me@x.kz', full_name: 'Me' });
      if (path === '/api/v1/orders' && init?.method === 'POST') return jsonResponse(orderWire('pending'), 201);
      if (path.endsWith('/pay')) {
        paid = payOutcome === 'succeeded';
        return jsonResponse({ status: payOutcome, failure_reason: paid ? null : 'Card declined' });
      }
      if (path.startsWith('/api/v1/orders/')) return jsonResponse(orderWire(paid ? 'paid' : 'pending'));
      return jsonResponse({ error: { code: 'not_found', message: path } }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reserves from server prices, then creates and pays the order on confirm', async () => {
    const reservation = await httpCheckoutApi.createReservation('evt-1', [{ ticketTypeId: 'tt-1', quantity: 2 }], null);
    expect(reservation.status).toBe('held');
    expect(reservation.quote).toMatchObject({ subtotal: 10_000, total: 10_000 });
    expect(reservation.event.venue).toEqual({ name: 'Almaty Arena', city: 'Almaty' });

    const order = await httpCheckoutApi.confirmReservation(
      reservation.id,
      [{ ticketTypeId: 'tt-1', name: 'A' }, { ticketTypeId: 'tt-1', name: 'B' }],
      'success',
    );

    const create = fetchMock.mock.calls.find(([url, init]) => url === '/api/v1/orders' && init?.method === 'POST')!;
    expect(JSON.parse(create[1]?.body as string)).toEqual({
      event_id: 'evt-1',
      items: [{ ticket_type_id: 'tt-1', quantity: 2 }],
      attendees: [{ full_name: 'A', email: 'me@x.kz' }, { full_name: 'B', email: 'me@x.kz' }],
    });
    expect(order).toMatchObject({ number: 'ABCDEF12', status: 'paid', total: 10_000, ticketCount: 2 });
    expect((await httpCheckoutApi.getReservation(reservation.id)).status).toBe('completed');
  });

  it('keeps the order after a declined payment and pays it again on retry', async () => {
    const reservation = await httpCheckoutApi.createReservation('evt-1', [{ ticketTypeId: 'tt-1', quantity: 2 }], null);
    const attendees = [{ ticketTypeId: 'tt-1', name: 'A' }, { ticketTypeId: 'tt-1', name: 'B' }];

    payOutcome = 'failed';
    await expect(httpCheckoutApi.confirmReservation(reservation.id, attendees, 'declined')).rejects.toMatchObject({
      code: 'payment_declined',
    });
    const pay = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/pay'))!;
    expect(JSON.parse(pay[1]?.body as string)).toEqual({ simulate: 'fail' });

    payOutcome = 'succeeded';
    await httpCheckoutApi.confirmReservation(reservation.id, attendees, 'success');
    const creates = fetchMock.mock.calls.filter(([url, init]) => url === '/api/v1/orders' && init?.method === 'POST');
    expect(creates).toHaveLength(1);
  });

  it('fails with sold_out when the selection exceeds availability', async () => {
    await expect(
      httpCheckoutApi.createReservation('evt-1', [{ ticketTypeId: 'tt-1', quantity: 11 }], null),
    ).rejects.toMatchObject({ code: 'sold_out' });
  });
});

describe('httpOrdersApi', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('lists my orders without pending ones, with the event snapshot', async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).startsWith('/api/v1/me/orders')
        ? jsonResponse({ items: [orderWire('paid'), { ...orderWire('pending'), id: 'p-1' }], total: 2, limit: 100, offset: 0 })
        : jsonResponse(eventWire),
    );

    const orders = await httpOrdersApi.listMyOrders();

    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      number: 'ABCDEF12',
      status: 'paid',
      total: 10_000,
      ticketCount: 2,
      event: { title: 'Almaty Nights', timeZone: 'Asia/Almaty', venue: { city: 'Almaty' } },
    });
  });
});
