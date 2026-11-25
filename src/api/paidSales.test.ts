import { httpPaidSalesApi } from './paidSales';

const activation = (over: Record<string, unknown> = {}) => ({
  event_id: 'evt-1',
  paid_sales_active: false,
  fee_minor: 500_000,
  currency: 'KZT',
  profile_complete: true,
  verified: true,
  payout_account_connected: false,
  activation_payment: null,
  ...over,
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('httpPaidSalesApi', () => {
  const fetchMock = vi.fn<typeof fetch>();
  let state = activation();
  beforeEach(() => {
    localStorage.clear();
    state = activation();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url) => {
      const path = String(url);
      if (path.endsWith('/activation')) return jsonResponse(state);
      if (path.endsWith('/organizers/me')) return jsonResponse({ display_name: 'Steppe Sound', contact_email: 'a@b.kz', contact_phone: null });
      if (path.endsWith('/payout-accounts')) return jsonResponse([{ provider_ref: 'sandbox_1234', status: 'connected' }]);
      if (path.endsWith('/activate-paid-sales')) {
        state = activation({ paid_sales_active: true, payout_account_connected: true });
        return jsonResponse(state);
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('maps the backend checklist', async () => {
    const status = await httpPaidSalesApi.getPaidSales('evt-1');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/events/evt-1/activation');
    expect(status).toMatchObject({
      state: 'in_progress',
      activationFee: 5000,
      checklist: {
        identity: { done: true, verifiedName: 'Steppe Sound' },
        payout: { done: false },
        fee: { done: false },
        terms: { done: false },
      },
    });
  });

  it('sends only a sandbox reference for the payout account', async () => {
    await httpPaidSalesApi.connectPayout('evt-1', { accountHolder: 'A', iban: 'KZ86125KZT5004100100' });
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(call[0]).toBe('/api/v1/organizers/me/payout-accounts');
    expect(JSON.parse(call[1]?.body as string)).toEqual({ provider_ref: 'sandbox_0100' });
  });

  it('activates after the fee and terms are confirmed in the app', async () => {
    await expect(httpPaidSalesApi.activate('evt-1')).rejects.toMatchObject({ code: 'activation_checklist_incomplete' });

    await httpPaidSalesApi.payActivationFee('evt-1');
    await httpPaidSalesApi.acceptTerms('evt-1', '2026-01');
    const status = await httpPaidSalesApi.activate('evt-1');

    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/activate-paid-sales'))!;
    expect(JSON.parse(call[1]?.body as string)).toEqual({ simulate: 'success' });
    expect(status.state).toBe('active');
  });
});
