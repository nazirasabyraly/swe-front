import { ApiError } from './http';
import { httpEventsApi } from './events';
import type { CreateEventInput } from '../features/create-event/types';

/** `EventRead` as the backend sends it (snake_case). */
const wire = {
  id: 'evt-1',
  organizer: { id: 'org-1', display_name: 'Steppe Sound' },
  title: 'Almaty Nights — Vol. 4',
  description: 'Three contemporary Kazakh acts.',
  category: 'music',
  cover_image_key: null,
  location_name: 'Almaty Arena',
  location_address: 'Abay Ave 10, apt 5, Almaty',
  venue_id: null,
  starts_at: '2026-10-12T14:00:00Z',
  ends_at: '2026-10-12T18:00:00Z',
  timezone: 'Asia/Almaty',
  visibility: 'public',
  capacity: 1200,
  seating_mode: 'general_admission',
  status: 'draft',
  lifecycle: 'draft',
  paid_sales_active: false,
  registration_opens_at: '2026-09-25T05:00:00Z',
  registration_closes_at: null,
  published_at: null,
  cancelled_at: null,
  is_suspended: false,
  calendar_links: { ics: '', google: '', outlook: '' },
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
};

const input: CreateEventInput = {
  title: 'Almaty Nights — Vol. 4',
  description: 'Three acts.',
  category: 'Music',
  images: [],
  format: 'physical',
  venue: { name: 'Almaty Arena', address: 'Abay Ave 10', city: 'Almaty' },
  startsAt: new Date('2026-10-12T14:00:00Z'),
  endsAt: new Date('2026-10-12T18:00:00Z'),
  timeZone: 'Asia/Almaty',
  visibility: 'unlisted',
  registrationOpensAt: new Date('2026-09-25T05:00:00Z'),
  registrationClosesAt: new Date('2026-10-12T12:00:00Z'),
  capacity: 500,
  refundPolicy: '',
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

  it('maps the backend event to the app’s shape', async () => {
    fetchMock.mockResolvedValue(jsonResponse(wire));

    const event = await httpEventsApi.getEvent('evt-1');

    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/events/evt-1');
    expect(event).toMatchObject({
      category: 'Music',
      timeZone: 'Asia/Almaty',
      venue: { name: 'Almaty Arena', address: 'Abay Ave 10, apt 5', city: 'Almaty' },
      imageUrls: [],
      startsAt: new Date('2026-10-12T14:00:00Z'),
      registrationOpensAt: new Date('2026-09-25T05:00:00Z'),
      // Not set on the server: falls back to the start time.
      registrationClosesAt: new Date('2026-10-12T14:00:00Z'),
    });
  });

  it('lists the organizer’s events from /organizers/me/events and loads each one', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: 'evt-1' }], total: 1, limit: 100, offset: 0 }))
      .mockResolvedValueOnce(jsonResponse(wire));

    const [event] = await httpEventsApi.listMyEvents();

    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/organizers/me/events?limit=100');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/events/evt-1');
    expect(event.title).toBe('Almaty Nights — Vol. 4');
  });

  it('creates with a snake_case JSON body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(wire, 201));

    await httpEventsApi.createEvent(input);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/events');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({
      title: 'Almaty Nights — Vol. 4',
      description: 'Three acts.',
      category: 'music',
      location_name: 'Almaty Arena',
      location_address: 'Abay Ave 10, Almaty',
      starts_at: '2026-10-12T14:00:00.000Z',
      ends_at: '2026-10-12T18:00:00.000Z',
      timezone: 'Asia/Almaty',
      visibility: 'unlisted',
      capacity: 500,
      registration_opens_at: '2026-09-25T05:00:00.000Z',
      registration_closes_at: '2026-10-12T12:00:00.000Z',
    });
  });

  it.each([
    ['publishEvent', '/api/v1/events/evt-1/publish'],
    ['unpublishEvent', '/api/v1/events/evt-1/unpublish'],
    ['duplicateEvent', '/api/v1/events/evt-1/duplicate'],
  ] as const)('%s POSTs to %s', async (method, path) => {
    fetchMock.mockResolvedValue(jsonResponse({ ...wire, status: 'published' }));

    const event = await httpEventsApi[method]('evt-1');

    expect(fetchMock).toHaveBeenCalledWith(path, expect.objectContaining({ method: 'POST' }));
    expect(event.status).toBe('published');
  });

  it('throws ApiError with the server’s message on failure', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 'registration_closed', message: 'Registration has already closed.' } }, 409),
    );

    const error = await httpEventsApi.publishEvent('evt-1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: 'registration_closed',
      serverMessage: 'Registration has already closed.',
    });
  });

  it('reports network failures', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(httpEventsApi.getEvent('evt-1')).rejects.toMatchObject({ status: 0 });
  });
});
