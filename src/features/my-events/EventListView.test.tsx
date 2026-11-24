import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createFakeApi, makeEvent, renderOrganizerApp } from '../../test/fakeEventsApi';

const draft = makeEvent({ id: 'evt-1', title: 'Almaty Nights — Vol. 4', status: 'draft' });
const published = makeEvent({
  id: 'evt-2',
  title: 'Jazz on Panfilov',
  category: 'Music',
  status: 'published',
  visibility: 'unlisted',
  startsAt: new Date(2026, 9, 5, 17, 0),
  venue: { name: 'Panfilov Park Stage', address: '', city: 'Almaty' },
  capacity: 310,
});

const card = (title: string) => screen.getByRole('article', { name: title });

describe('EventListView', () => {
  it('lists the organizer’s events from the API, soonest first', async () => {
    const api = createFakeApi([draft, published]);
    renderOrganizerApp(api);

    const cards = await screen.findAllByRole('article');
    expect(api.listMyEvents).toHaveBeenCalledTimes(1);
    expect(cards.map((c) => within(c).getByRole('heading').textContent)).toEqual([
      'Jazz on Panfilov',
      'Almaty Nights — Vol. 4',
    ]);

    const jazz = card('Jazz on Panfilov');
    expect(within(jazz).getByText('Published')).toBeInTheDocument();
    expect(within(jazz).getByText(/Mon 05 Oct 2026, 17:00/)).toBeInTheDocument();
    expect(within(jazz).getByText(/Panfilov Park Stage, Almaty/)).toBeInTheDocument();
    expect(within(jazz).getByText(/Unlisted · Capacity 310/)).toBeInTheDocument();
    expect(within(card('Almaty Nights — Vol. 4')).getByText('Draft')).toBeInTheDocument();
  });

  it('shows the empty state when the organizer has no events', async () => {
    renderOrganizerApp(createFakeApi([]));

    expect(await screen.findByRole('heading', { name: 'No events yet' })).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create your first event' })).toHaveAttribute(
      'href',
      '/events/new',
    );
  });

  it('shows an error with a retry when the list fails to load', async () => {
    const user = userEvent.setup();
    const api = createFakeApi([draft]);
    api.listMyEvents.mockRejectedValueOnce(new Error('Server unavailable'));
    renderOrganizerApp(api);

    expect(await screen.findByRole('alert')).toHaveTextContent('Server unavailable');
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('article', { name: 'Almaty Nights — Vol. 4' })).toBeInTheDocument();
    expect(api.listMyEvents).toHaveBeenCalledTimes(2);
  });

  it('publishes a draft event and then lets the organizer unpublish it', async () => {
    const user = userEvent.setup();
    const api = createFakeApi([draft]);
    renderOrganizerApp(api);

    await user.click(await screen.findByRole('button', { name: 'Publish Almaty Nights — Vol. 4' }));

    expect(api.publishEvent).toHaveBeenCalledWith('evt-1');
    const event = card('Almaty Nights — Vol. 4');
    expect(await within(event).findByText('Published')).toBeInTheDocument();

    await user.click(within(event).getByRole('button', { name: 'Unpublish Almaty Nights — Vol. 4' }));

    expect(api.unpublishEvent).toHaveBeenCalledWith('evt-1');
    expect(await within(event).findByText('Draft')).toBeInTheDocument();
    expect(within(event).getByRole('button', { name: 'Publish Almaty Nights — Vol. 4' })).toBeEnabled();
  });

  it('disables the card’s actions while publishing', async () => {
    const user = userEvent.setup();
    const api = createFakeApi([draft]);
    let resolve!: () => void;
    api.publishEvent.mockImplementationOnce(
      (id) => new Promise((r) => (resolve = () => r({ ...draft, id, status: 'published' }))),
    );
    renderOrganizerApp(api);

    await user.click(await screen.findByRole('button', { name: 'Publish Almaty Nights — Vol. 4' }));

    const event = card('Almaty Nights — Vol. 4');
    expect(within(event).getByRole('button', { name: 'Publish Almaty Nights — Vol. 4' })).toHaveTextContent(
      'Publishing…',
    );
    expect(within(event).getByRole('button', { name: 'Publish Almaty Nights — Vol. 4' })).toBeDisabled();
    expect(within(event).getByRole('button', { name: 'Edit Almaty Nights — Vol. 4' })).toBeDisabled();

    resolve();
    expect(await within(event).findByText('Published')).toBeInTheDocument();
  });

  it('keeps the event unpublished and shows the error when publishing fails', async () => {
    const user = userEvent.setup();
    const api = createFakeApi([draft]);
    api.publishEvent.mockRejectedValueOnce(new Error('Registration has already closed.'));
    renderOrganizerApp(api);

    await user.click(await screen.findByRole('button', { name: 'Publish Almaty Nights — Vol. 4' }));

    const event = card('Almaty Nights — Vol. 4');
    expect(await within(event).findByRole('alert')).toHaveTextContent(
      'Couldn’t publish the event. Registration has already closed.',
    );
    expect(within(event).getByText('Draft')).toBeInTheDocument();
  });

  it('navigates to the edit page for the chosen event', async () => {
    const user = userEvent.setup();
    const api = createFakeApi([draft, published]);
    renderOrganizerApp(api);

    await user.click(await screen.findByRole('button', { name: 'Edit Jazz on Panfilov' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/events/evt-2/edit');
    expect(await screen.findByRole('heading', { name: 'Edit event' })).toBeInTheDocument();
    expect(api.getEvent).toHaveBeenCalledWith('evt-2');
    expect(await screen.findByLabelText('Event title')).toHaveValue('Jazz on Panfilov');
  });
});
