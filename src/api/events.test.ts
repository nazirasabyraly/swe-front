import { ApiError } from './http';
import { httpEventsApi, type EventDto } from './events';

const dto: EventDto = {
  id: 'evt-1',
  title: 'Almaty Nights — Vol. 4',
  description: 'Three contemporary Kazakh acts.',
  category: 'Music',
  imageUrls: [],
  format: 'physical',
  venue: { name: 'Almaty Arena', address: '', city: 'Almaty' },
  startsAt: '2026-10-12T14:00:00.000Z',
  visibility: 'public',
  registrationOpensAt: '2026-09-25T05:00:00.000Z',
  registrationClosesAt: '2026-10-12T12:00:00.000Z',
  capacity: 1200,
  status: 'draft',
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('httpEventsApi', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('loads the organizer’s events and parses dates', async () => {
    fetchMock.mockResolvedValue(jsonResponse([dto]));

    const [event] = await httpEventsApi.listMyEvents();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/organizer/events');
    expect(init).toMatchObject({ credentials: 'include' });
    expect(event.startsAt).toEqual(new Date('2026-10-12T14:00:00.000Z'));
    expect(event.title).toBe('Almaty Nights — Vol. 4');
  });

  it.each([
    ['publishEvent', '/api/events/evt-1/publish'],
    ['unpublishEvent', '/api/events/evt-1/unpublish'],
  ] as const)('%s POSTs to %s', async (method, path) => {
    fetchMock.mockResolvedValue(jsonResponse({ ...dto, status: 'published' }));

    const event = await httpEventsApi[method]('evt-1');

    expect(fetchMock).toHaveBeenCalledWith(path, expect.objectContaining({ method: 'POST' }));
    expect(event.status).toBe('published');
  });

  it('throws ApiError with the server’s message on failure', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Registration has already closed.' }, 409));

    await expect(httpEventsApi.publishEvent('evt-1')).rejects.toEqual(
      new ApiError('Registration has already closed.', 409),
    );
  });

  it('reports network failures', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(httpEventsApi.listMyEvents()).rejects.toMatchObject({ status: 0 });
  });
});
