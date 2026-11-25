import { httpNotificationsApi } from './notifications';
import { httpSupportApi } from './support';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const page = (items: unknown[]) => ({ items, total: items.length, limit: 100, offset: 0 });

describe('httpNotificationsApi', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const wire = {
    id: 'n-1',
    type: 'support_reply',
    channel: 'in_app',
    payload: { subject: 'New reply', link: 'http://localhost:3000/support/sc-1' },
    read_at: null,
    sent_at: null,
    created_at: '2026-09-01T00:00:00Z',
  };

  it('uses the subject as title and turns the link into an in-app path', async () => {
    fetchMock.mockResolvedValue(jsonResponse(page([wire])));
    const [n] = await httpNotificationsApi.listNotifications();
    expect(n).toMatchObject({ title: 'New reply', link: '/support/sc-1', read: false });
  });

  it('marks all read one by one', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(page([wire, { ...wire, id: 'n-2' }])))
      .mockResolvedValue(new Response(null, { status: 204 }));
    await httpNotificationsApi.markAllRead();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/me/notifications?unread=true&limit=100');
    expect(fetchMock.mock.calls.slice(1).map(([url]) => url)).toEqual([
      '/api/v1/me/notifications/n-1/read',
      '/api/v1/me/notifications/n-2/read',
    ]);
  });
});

describe('httpSupportApi', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const caseWire = {
    id: 'abcdef12-0000',
    opened_by_user_id: 'u-attendee',
    kind: 'attendee',
    category: 'event_info',
    subject: 'Parking?',
    status: 'waiting_customer',
    event_id: 'evt-1',
    order_id: null,
    ticket_id: null,
    assigned_to_user_id: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    resolved_at: null,
    messages: [{ id: 'm-1', sender_user_id: 'u-attendee', sender_name: 'Aigerim', body: 'Hi', sent_at: '2026-09-01T00:00:00Z' }],
  };

  it('maps names, statuses and who can manage the case', async () => {
    fetchMock.mockImplementation(async (url) =>
      jsonResponse(String(url) === '/api/v1/me' ? { id: 'u-organizer', full_name: 'Organizer' } : caseWire),
    );
    const c = await httpSupportApi.getCase('abcdef12-0000');
    expect(c).toMatchObject({
      category: 'event_information',
      status: 'waiting_for_customer',
      requester: { id: 'u-attendee', name: 'Aigerim' },
      canManage: true,
      assignableStaff: [{ id: 'u-organizer', name: 'Organizer' }],
      messages: [{ author: { side: 'requester' } }],
    });
  });

  it('splits the case list into mine and managed', async () => {
    fetchMock.mockImplementation(async (url) =>
      jsonResponse(
        String(url) === '/api/v1/me'
          ? { id: 'u-attendee', full_name: 'Aigerim' }
          : page([caseWire, { ...caseWire, id: 'other', opened_by_user_id: 'u-x' }]),
      ),
    );
    expect((await httpSupportApi.listMyCases()).map((c) => c.id)).toEqual(['abcdef12-0000']);
    expect((await httpSupportApi.listManagedCases()).map((c) => c.id)).toEqual(['other']);
  });

  it('sends backend names when updating', async () => {
    fetchMock.mockImplementation(async (url) =>
      jsonResponse(String(url) === '/api/v1/me' ? { id: 'u-organizer', full_name: 'O' } : caseWire),
    );
    await httpSupportApi.updateCase('abcdef12-0000', { status: 'waiting_for_customer', assigneeId: 'u-organizer' });
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')!;
    expect(JSON.parse(patch[1]?.body as string)).toEqual({ status: 'waiting_customer', assigned_to_user_id: 'u-organizer' });
  });
});
