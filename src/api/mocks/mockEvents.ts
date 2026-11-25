import { DEFAULT_TIME_ZONE } from '../../features/create-event/timeZones';
import { toZonedInputs, zonedDateTime } from '../../lib/timezone';
import type { EventsApi, OrganizerEvent } from '../events';
import { mockDelay, mockError, mockId } from './util';

/** In-browser stand-in for the event endpoints in docs/backend-contract.md. Resets on reload. */

const day = 24 * 60 * 60 * 1000;
/** `hour`:00 Almaty time, `n` days from today. */
const inDays = (n: number, hour: number) => {
  const { date } = toZonedInputs(new Date(Date.now() + n * day), DEFAULT_TIME_ZONE);
  return zonedDateTime(date, `${String(hour).padStart(2, '0')}:00`, DEFAULT_TIME_ZONE)!;
};

const seed: OrganizerEvent[] = [
  {
    id: 'evt-almaty-nights',
    title: 'Almaty Nights — Vol. 4',
    description:
      'Three contemporary Kazakh acts and a late DJ set closing the autumn season.\n\nDoors open one hour before the start.',
    category: 'Music',
    imageUrls: [],
    format: 'physical',
    venue: { name: 'Almaty Arena', address: 'Momyshuly Ave 1', city: 'Almaty' },
    startsAt: inDays(18, 19),
    endsAt: inDays(18, 23),
    timeZone: DEFAULT_TIME_ZONE,
    visibility: 'public',
    registrationOpensAt: inDays(-5, 10),
    registrationClosesAt: inDays(18, 17),
    capacity: 1200,
    refundPolicy: 'Full refunds up to 48 hours before the event.',
    status: 'published',
  },
  {
    id: 'evt-kazdev',
    title: 'KazDev Meetup: Backends that survive launch day',
    description: 'Talks and a panel on running production backends in Kazakhstan.',
    category: 'Tech',
    imageUrls: [],
    format: 'physical',
    venue: { name: 'SmArt.Point', address: '', city: 'Astana' },
    startsAt: inDays(25, 18),
    endsAt: inDays(25, 21),
    timeZone: DEFAULT_TIME_ZONE,
    visibility: 'unlisted',
    registrationOpensAt: inDays(1, 9),
    registrationClosesAt: inDays(25, 12),
    capacity: 120,
    refundPolicy: '',
    status: 'draft',
  },
  {
    id: 'evt-winter-gala',
    title: 'Winter Gala Concert',
    description: 'The Almaty Symphony Orchestra plays Tchaikovsky and Kazakh composers. Assigned seating.',
    category: 'Music',
    imageUrls: [],
    format: 'physical',
    venue: { name: 'Kazakh State Philharmonic', address: 'Kaldayakov St 35', city: 'Almaty' },
    startsAt: inDays(30, 19),
    endsAt: inDays(30, 21),
    timeZone: DEFAULT_TIME_ZONE,
    visibility: 'public',
    registrationOpensAt: inDays(-3, 10),
    registrationClosesAt: inDays(30, 17),
    capacity: 144,
    refundPolicy: 'Full refunds up to 7 days before the concert.',
    status: 'published',
  },
  {
    id: 'evt-spring-jam',
    title: 'Spring Jam Session',
    description: 'An open stage evening for student bands.',
    category: 'Music',
    imageUrls: [],
    format: 'physical',
    venue: { name: 'Dom Kino', address: 'Abay Ave 50', city: 'Almaty' },
    startsAt: inDays(-30, 19),
    endsAt: inDays(-30, 22),
    timeZone: DEFAULT_TIME_ZONE,
    visibility: 'public',
    registrationOpensAt: inDays(-60, 10),
    registrationClosesAt: inDays(-30, 17),
    capacity: 150,
    refundPolicy: '',
    status: 'published',
  },
];

export function createMockEventsApi(initial: OrganizerEvent[] = seed): EventsApi {
  const store = new Map(initial.map((e) => [e.id, structuredClone(e)]));

  async function find(id: string) {
    await mockDelay();
    const event = store.get(id);
    if (!event) throw mockError(404, 'event_not_found', 'Event not found.');
    return event;
  }

  function save(event: OrganizerEvent) {
    store.set(event.id, event);
    return structuredClone(event);
  }

  return {
    async listMyEvents() {
      await mockDelay();
      return [...store.values()].map((e) => structuredClone(e));
    },
    async getEvent(id) {
      return structuredClone(await find(id));
    },
    async createEvent({ images, ...input }) {
      await mockDelay(500);
      return save({
        ...input,
        id: mockId('evt'),
        imageUrls: images.map((f) => URL.createObjectURL(f)),
        status: 'draft',
      });
    },
    async updateEvent(id, { images, ...input }) {
      const current = await find(id);
      return save({
        ...current,
        ...input,
        imageUrls: images.length ? images.map((f) => URL.createObjectURL(f)) : current.imageUrls,
      });
    },
    async publishEvent(id) {
      return save({ ...(await find(id)), status: 'published' });
    },
    async unpublishEvent(id) {
      return save({ ...(await find(id)), status: 'draft' });
    },
    async cancelEvent(id) {
      const current = await find(id);
      if (current.status === 'cancelled') throw mockError(409, 'already_cancelled', 'This event is already cancelled.');
      return save({ ...current, status: 'cancelled' });
    },
    async duplicateEvent(id) {
      const current = await find(id);
      return save({ ...structuredClone(current), id: mockId('evt'), title: `${current.title} (copy)`, status: 'draft' });
    },
  };
}
