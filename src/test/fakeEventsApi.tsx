import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { EventsApiProvider } from '../api/EventsApiContext';
import type { EventsApi, OrganizerEvent } from '../api/events';
import { EditEventPage } from '../features/edit-event/EditEventPage';
import { EventListView } from '../features/my-events';
import { now } from '../features/create-event/testUtils';

export function makeEvent(overrides: Partial<OrganizerEvent> = {}): OrganizerEvent {
  return {
    id: 'evt-1',
    title: 'Almaty Nights — Vol. 4',
    description: 'Three contemporary Kazakh acts and a late DJ set.',
    category: 'Music',
    imageUrls: [],
    format: 'physical',
    venue: { name: 'Almaty Arena', address: 'Momyshuly Ave 1', city: 'Almaty' },
    startsAt: new Date(2026, 9, 12, 19, 0),
    visibility: 'public',
    registrationOpensAt: new Date(2026, 8, 25, 10, 0),
    registrationClosesAt: new Date(2026, 9, 12, 17, 0),
    capacity: 1200,
    status: 'draft',
    ...overrides,
  };
}

/** In-memory EventsApi backed by `events`; every method is a vi.fn spy. */
export function createFakeApi(events: OrganizerEvent[] = []) {
  const store = new Map(events.map((e) => [e.id, e]));
  const find = async (id: string) => {
    const event = store.get(id);
    if (!event) throw new Error('Event not found.');
    return event;
  };
  const setStatus = async (id: string, status: OrganizerEvent['status']) => {
    const updated = { ...(await find(id)), status };
    store.set(id, updated);
    return updated;
  };
  const api = {
    listMyEvents: vi.fn(async () => [...store.values()]),
    getEvent: vi.fn(find),
    createEvent: vi.fn(async () => makeEvent({ id: 'new' })),
    updateEvent: vi.fn(async (id: string, input) => {
      const updated: OrganizerEvent = { ...(await find(id)), ...input, images: undefined } as never;
      store.set(id, updated);
      return updated;
    }),
    publishEvent: vi.fn((id: string) => setStatus(id, 'published')),
    unpublishEvent: vi.fn((id: string) => setStatus(id, 'draft')),
  } satisfies EventsApi;
  return api;
}

function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

/** Renders the organizer routes in a memory router with a fake API. */
export function renderOrganizerApp(api: EventsApi, initialPath = '/events', extra?: ReactElement) {
  return render(
    <EventsApiProvider api={api}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/events" element={<EventListView />} />
          <Route path="/events/new" element={<h1>Create event</h1>} />
          <Route path="/events/:id/edit" element={<EditEventPage now={now} />} />
        </Routes>
        <LocationProbe />
        {extra}
      </MemoryRouter>
    </EventsApiProvider>,
  );
}
