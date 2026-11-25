import { httpPaidSalesApi, type PaidSalesStatusDto } from './paidSales';

const dto: PaidSalesStatusDto = {
  eventId: 'evt-1',
  state: 'suspended',
  simulated: true,
  activationFee: 9900,
  termsVersion: '2026-09',
  checklist: {
    identity: { done: true, verifiedName: 'Aigerim Sadykova' },
    payout: { done: true, accountLast4: '4417' },
    fee: { done: true, paidAt: '2026-09-20T08:00:00.000Z', reference: 'SIM-1' },
    terms: { done: true, acceptedAt: '2026-09-20T08:05:00.000Z' },
  },
  activatedAt: '2026-09-20T08:06:00.000Z',
  suspension: { reason: 'Chargeback spike', suspendedAt: '2026-10-01T10:00:00.000Z' },
};

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('httpPaidSalesApi', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => jsonResponse(dto));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('loads the status for one event and parses its dates', async () => {
    const status = await httpPaidSalesApi.getPaidSales('evt 1');

    expect(fetchMock.mock.calls[0][0]).toBe('/api/events/evt%201/paid-sales');
    expect(status.checklist.fee.paidAt).toEqual(new Date('2026-09-20T08:00:00.000Z'));
    expect(status.checklist.terms.acceptedAt).toEqual(new Date('2026-09-20T08:05:00.000Z'));
    expect(status.activatedAt).toEqual(new Date('2026-09-20T08:06:00.000Z'));
    expect(status.suspension).toEqual({ reason: 'Chargeback spike', suspendedAt: new Date('2026-10-01T10:00:00.000Z') });
  });

  it.each([
    ['verifyIdentity', () => httpPaidSalesApi.verifyIdentity('evt-1', { fullName: 'A', iin: '000000000000' }), '/identity', { fullName: 'A', iin: '000000000000' }],
    ['connectPayout', () => httpPaidSalesApi.connectPayout('evt-1', { accountHolder: 'A', iban: 'KZ00' }), '/payout', { accountHolder: 'A', iban: 'KZ00' }],
    ['payActivationFee', () => httpPaidSalesApi.payActivationFee('evt-1'), '/fee', {}],
    ['acceptTerms', () => httpPaidSalesApi.acceptTerms('evt-1', '2026-09'), '/terms', { termsVersion: '2026-09' }],
    ['activate', () => httpPaidSalesApi.activate('evt-1'), '/activate', {}],
  ] as const)('%s posts to its endpoint', async (_name, call, suffix, body) => {
    await call();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/events/evt-1/paid-sales${suffix}`);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual(body);
  });
});
