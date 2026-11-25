import { httpAuthApi } from './auth';
import { ApiError, json, request, tokenStore } from './http';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const userDto = {
  id: 'u-1',
  email: 'a@example.com',
  full_name: 'Aigerim',
  locale: 'ru',
  status: 'active',
  email_verified: true,
  roles: ['organizer'],
  created_at: '2026-01-01T00:00:00Z',
};

describe('request', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    tokenStore.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  const authHeader = (call: number) => new Headers(fetchMock.mock.calls[call][1]?.headers).get('Authorization');

  it('prefixes /api/v1, sends snake_case and returns camelCase', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ total_minor: 500, items: [{ ticket_type_id: 't' }] }));

    const result = await request('/orders', json('POST', { eventId: 'e', promoCode: null, startsAt: new Date(0) }));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/orders');
    expect(JSON.parse(init?.body as string)).toEqual({
      event_id: 'e',
      promo_code: null,
      starts_at: '1970-01-01T00:00:00.000Z',
    });
    expect(result).toEqual({ totalMinor: 500, items: [{ ticketTypeId: 't' }] });
  });

  it('reads the { error: { code, message, details } } envelope', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 'sold_out', message: 'Sold out', details: { left: 0 } } }, 409),
    );
    const error = await request('/orders').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'sold_out', serverMessage: 'Sold out', details: { left: 0 } });
  });

  it('sends the bearer token, and refreshes once on 401', async () => {
    tokenStore.set({ accessToken: 'old', refreshToken: 'r1' });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'token_expired', message: 'x' } }, 401))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'new', refresh_token: 'r2', token_type: 'bearer', expires_in: 900 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await expect(request('/me/orders')).resolves.toEqual({ ok: true });

    expect(authHeader(0)).toBe('Bearer old');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/auth/refresh');
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual({ refresh_token: 'r1' });
    expect(authHeader(2)).toBe('Bearer new');
    expect(tokenStore.refresh).toBe('r2');
  });

  it('drops the session when the refresh token is rejected', async () => {
    tokenStore.set({ accessToken: 'old', refreshToken: 'r1' });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'token_expired', message: 'x' } }, 401))
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'invalid_token', message: 'x' } }, 401));

    await expect(request('/me/orders')).rejects.toMatchObject({ status: 401 });
    expect(tokenStore.access).toBeNull();
    expect(tokenStore.refresh).toBeNull();
  });
});

describe('httpAuthApi', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    tokenStore.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('signs in with /auth/login, stores tokens and loads /me', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'a', refresh_token: 'r', token_type: 'bearer', expires_in: 900 }))
      .mockResolvedValueOnce(jsonResponse(userDto));

    const user = await httpAuthApi.signIn('a@example.com', 'secret123');

    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/auth/login');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/me');
    expect(tokenStore.access).toBe('a');
    expect(user).toEqual({ id: 'u-1', name: 'Aigerim', email: 'a@example.com', roles: ['organizer'], emailVerified: true });
  });

  it('has no session without tokens, and sign-out revokes the refresh token', async () => {
    await expect(httpAuthApi.me()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    tokenStore.set({ accessToken: 'a', refreshToken: 'r' });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await httpAuthApi.signOut();

    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/auth/logout');
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({ refresh_token: 'r' });
    expect(tokenStore.refresh).toBeNull();
  });

  it('registers with full_name and role', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(userDto, 201));
    await httpAuthApi.register({ name: 'Aigerim', email: 'a@example.com', password: 'secret123', accountType: 'organizer' });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/auth/register');
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toMatchObject({
      full_name: 'Aigerim',
      role: 'organizer',
      email: 'a@example.com',
    });
  });
});
