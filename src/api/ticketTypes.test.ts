import { httpTicketTypesApi } from './ticketTypes';

/** `TicketTypeRead` (organizer view) as the backend sends it. */
const wire = {
  id: 'tt-1',
  event_id: 'evt-1',
  name: 'Standard',
  description: null,
  kind: 'paid',
  price_minor: 1_500_000,
  currency: 'KZT',
  quantity_total: 300,
  quantity_available: 250,
  max_per_order: 6,
  sales_start_at: '2026-09-25T05:00:00Z',
  sales_end_at: null,
  is_hidden: false,
  on_sale: true,
  sellable: false,
  quantity_sold: 40,
  quantity_reserved: 10,
  quantity_refunded: 2,
  quantity_checked_in: 0,
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('httpTicketTypesApi', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('lists types and maps prices, quantities and counters', async () => {
    fetchMock.mockResolvedValue(jsonResponse([wire]));

    const [type] = await httpTicketTypesApi.listTicketTypes('evt-1');

    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/events/evt-1/ticket-types');
    expect(type).toMatchObject({
      description: '',
      price: 15_000,
      quantity: 300,
      hidden: false,
      salesStartAt: new Date('2026-09-25T05:00:00Z'),
      counts: { available: 250, sold: 40, reserved: 10, refunded: 2, checkedIn: 0 },
    });
  });

  const input = {
    name: 'Standard',
    description: '',
    kind: 'paid' as const,
    price: 15_000,
    quantity: 300,
    salesStartAt: new Date('2026-09-25T05:00:00Z'),
    salesEndAt: new Date('2026-10-12T12:00:00Z'),
    maxPerOrder: 6,
  };

  it('creates under the event with kind and minor-unit price', async () => {
    fetchMock.mockResolvedValue(jsonResponse(wire, 201));
    await httpTicketTypesApi.createTicketType('evt-1', input);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/events/evt-1/ticket-types');
    expect(JSON.parse(init?.body as string)).toEqual({
      name: 'Standard',
      description: '',
      kind: 'paid',
      price_minor: 1_500_000,
      quantity_total: 300,
      max_per_order: 6,
      sales_start_at: '2026-09-25T05:00:00.000Z',
      sales_end_at: '2026-10-12T12:00:00.000Z',
    });
  });

  it('updates, hides and deletes by ticket type id', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(wire));

    await httpTicketTypesApi.updateTicketType('evt-1', 'tt-1', input);
    await httpTicketTypesApi.setTicketTypeHidden('evt-1', 'tt-1', true);
    await httpTicketTypesApi.setTicketTypeHidden('evt-1', 'tt-1', false);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await httpTicketTypesApi.deleteTicketType('evt-1', 'tt-1');

    const calls = fetchMock.mock.calls.map(([url, init]) => [init?.method, url]);
    expect(calls).toEqual([
      ['PATCH', '/api/v1/ticket-types/tt-1'],
      ['POST', '/api/v1/ticket-types/tt-1/hide'],
      ['POST', '/api/v1/ticket-types/tt-1/unhide'],
      ['DELETE', '/api/v1/ticket-types/tt-1'],
    ]);
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).not.toHaveProperty('kind');
  });
});
