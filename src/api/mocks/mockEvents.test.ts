import { ApiError } from '../http';
import { createMockEventsApi } from './mockEvents';

const input = {
  title: 'Student Career Day 2026',
  description: 'Meet employers and alumni.',
  category: 'Education' as const,
  images: [new File(['x'], 'hall.png', { type: 'image/png' })],
  format: 'physical' as const,
  venue: { name: 'KBTU Main Hall', address: '', city: 'Almaty' },
  startsAt: new Date('2026-12-02T05:00:00Z'),
  endsAt: new Date('2026-12-02T12:00:00Z'),
  timeZone: 'Asia/Almaty',
  visibility: 'public' as const,
  registrationOpensAt: new Date('2026-11-25T04:00:00Z'),
  registrationClosesAt: new Date('2026-12-02T04:00:00Z'),
  capacity: 800,
  refundPolicy: '',
};

describe('mock events API', () => {
  it('creates drafts, lists, publishes and updates like the contract describes', async () => {
    const api = createMockEventsApi([]);

    const created = await api.createEvent(input);
    expect(created).toMatchObject({ status: 'draft', title: input.title, imageUrls: ['blob:mock/hall.png'] });
    expect(await api.listMyEvents()).toHaveLength(1);

    expect((await api.publishEvent(created.id)).status).toBe('published');
    expect((await api.unpublishEvent(created.id)).status).toBe('draft');

    const updated = await api.updateEvent(created.id, { ...input, images: [], capacity: 900 });
    expect(updated.capacity).toBe(900);
    expect(updated.imageUrls).toEqual(['blob:mock/hall.png']);
  });

  it('returns copies, so callers cannot mutate the store', async () => {
    const api = createMockEventsApi([]);
    const created = await api.createEvent(input);
    created.title = 'changed';
    expect((await api.getEvent(created.id)).title).toBe(input.title);
  });

  it('rejects unknown ids with an ApiError code', async () => {
    const api = createMockEventsApi([]);
    await expect(api.getEvent('nope')).rejects.toEqual(expect.any(ApiError));
    await expect(api.getEvent('nope')).rejects.toMatchObject({ status: 404, code: 'event_not_found' });
  });
});
