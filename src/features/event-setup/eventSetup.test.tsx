import { screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { createMockEventsApi } from '../../api/mocks/mockEvents';
import { renderApp } from '../../test/renderApp';
import { fillEventForm } from '../create-event/testUtils';

// Real clock in these tests, so use next year's dates.
const future = {
  date: '2027-10-12',
  registrationOpensAt: '2027-09-25T10:00',
  registrationClosesAt: '2027-10-12T17:00',
};

beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem('biletflow.mockSession', 'usr-organizer');
});

const location = () => screen.getByTestId('location').textContent ?? '';

async function addFreeType(user: UserEvent, name: string) {
  await user.click(await screen.findByRole('button', { name: 'Add ticket type' }));
  const form = screen.getByRole('form', { name: 'New ticket type' });
  await user.type(within(form).getByLabelText('Name'), name);
  await user.type(within(form).getByLabelText('Quantity'), '200');
  await user.click(within(form).getByRole('button', { name: 'Save ticket type' }));
  await screen.findByRole('listitem', { name });
}

describe('create event wizard', () => {
  it('saves a draft after step 1, adds ticket types, previews and publishes', async () => {
    const user = userEvent.setup();
    const events = createMockEventsApi([]);
    renderApp('/organizer/events/new', { events });

    await screen.findByRole('heading', { name: 'Create event' });
    await fillEventForm(user, future);
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));

    // Step 2 runs on the saved draft.
    await waitFor(() => expect(location()).toMatch(/^\/organizer\/events\/[^/]+\/setup\/tickets$/));
    const [draft] = await events.listMyEvents();
    expect(draft).toMatchObject({ title: 'Almaty Nights — Vol. 4', status: 'draft' });
    expect(await screen.findByRole('heading', { name: 'Set up “Almaty Nights — Vol. 4”' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue to review' })).toBeDisabled();
    expect(screen.getByText('Add at least one visible ticket type to continue.')).toBeInTheDocument();

    await addFreeType(user, 'Community entry');
    await user.click(screen.getByRole('button', { name: 'Continue to review' }));

    // Step 4: attendee view of the saved event, including its tickets.
    const preview = await screen.findByRole('article', { name: 'Event preview' });
    expect(within(preview).getByRole('heading', { name: 'Almaty Nights — Vol. 4' })).toBeInTheDocument();
    expect(within(preview).getByText('Community entry')).toBeInTheDocument();
    expect(within(preview).getByText('Free')).toBeInTheDocument();
    expect(within(preview).getByText('Demo Organizer')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Publish event' }));

    await waitFor(() => expect(location()).toBe('/organizer/events'));
    expect(await screen.findByText('“Almaty Nights — Vol. 4” is published')).toBeInTheDocument();
    // The list loads after the flash renders, so wait for the card.
    const card = await screen.findByRole('article', { name: 'Almaty Nights — Vol. 4' });
    expect(within(card).getByText('Published')).toBeInTheDocument();
  });

  it('going back to step 1 updates the same draft instead of creating another', async () => {
    const user = userEvent.setup();
    const events = createMockEventsApi([]);
    renderApp('/organizer/events/new', { events });
    await screen.findByRole('heading', { name: 'Create event' });
    await fillEventForm(user, future);
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));
    await screen.findByRole('heading', { name: /^Set up/ });

    await user.click(screen.getByRole('link', { name: 'Back to details' }));
    const title = await screen.findByLabelText('Event title');
    expect(title).toHaveValue('Almaty Nights — Vol. 4');
    await user.clear(title);
    await user.type(title, 'Almaty Nights — Vol. 5');
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));

    expect(await screen.findByRole('heading', { name: 'Set up “Almaty Nights — Vol. 5”' })).toBeInTheDocument();
    expect(await events.listMyEvents()).toHaveLength(1);
  });

  it('shows the save error and stays on step 1 when creating fails', async () => {
    const user = userEvent.setup();
    const events = createMockEventsApi([]);
    vi.spyOn(events, 'createEvent').mockRejectedValueOnce(new Error('Server unavailable'));
    renderApp('/organizer/events/new', { events });
    await screen.findByRole('heading', { name: 'Create event' });
    await fillEventForm(user, future);

    await user.click(screen.getByRole('button', { name: 'Save and continue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t save the eventServer unavailable');
    expect(location()).toBe('/organizer/events/new');
  });

  it('opens the standalone Tickets page from My events', async () => {
    const user = userEvent.setup();
    renderApp('/organizer/events', { events: createMockEventsApi() });

    await user.click(await screen.findByRole('button', { name: 'Ticket types for Almaty Nights — Vol. 4' }));

    expect(await screen.findByRole('heading', { name: 'Tickets: Almaty Nights — Vol. 4' })).toBeInTheDocument();
    expect(location()).toMatch(/\/organizer\/events\/evt-almaty-nights\/tickets$/);
  });
});
