import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createFakeApi, makeEvent, renderOrganizerApp } from '../../test/fakeEventsApi';

const event = makeEvent({
  id: 'evt-1',
  status: 'published',
  visibility: 'unlisted',
  imageUrls: ['https://cdn.example/cover.jpg'],
});

describe('EditEventPage', () => {
  it('pre-fills the form with the saved event', async () => {
    renderOrganizerApp(createFakeApi([event]), '/events/evt-1/edit');

    expect(await screen.findByLabelText('Event title')).toHaveValue('Almaty Nights — Vol. 4');
    expect(screen.getByLabelText('Description')).toHaveValue(event.description);
    expect(screen.getByRole('radio', { name: 'Music' })).toBeChecked();
    expect(screen.getByRole('radio', { name: /^Unlisted/ })).toBeChecked();
    expect(screen.getByLabelText('Venue name')).toHaveValue('Almaty Arena');
    expect(screen.getByLabelText('City')).toHaveValue('Almaty');
    expect(screen.getByLabelText('Street address')).toHaveValue('Momyshuly Ave 1');
    expect(screen.getByLabelText('Date')).toHaveValue('2026-10-12');
    expect(screen.getByLabelText('Start time')).toHaveValue('19:00');
    expect(screen.getByLabelText('Registration opens')).toHaveValue('2026-09-25T10:00');
    expect(screen.getByLabelText('Registration closes')).toHaveValue('2026-10-12T17:00');
    expect(screen.getByLabelText('Capacity')).toHaveValue(1200);
    expect(screen.getByText(/This event is published/)).toBeInTheDocument();
    expect(screen.getByText(/This event has 1 image\(s\)/)).toBeInTheDocument();
  });

  it('saves changes and returns to My events with a confirmation', async () => {
    const user = userEvent.setup();
    const api = createFakeApi([event]);
    renderOrganizerApp(api, '/events/evt-1/edit');

    const title = await screen.findByLabelText('Event title');
    await user.clear(title);
    await user.type(title, 'Almaty Nights — Vol. 5');
    fireEvent.change(screen.getByLabelText('Capacity'), { target: { value: '1500' } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(api.updateEvent).toHaveBeenCalledWith(
      'evt-1',
      expect.objectContaining({ title: 'Almaty Nights — Vol. 5', capacity: 1500, images: [] }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Changes to “Almaty Nights — Vol. 5” saved',
    );
    expect(screen.getByTestId('location')).toHaveTextContent('/events');
  });

  it('stays on the page and shows the error when saving fails', async () => {
    const user = userEvent.setup();
    const api = createFakeApi([event]);
    api.updateEvent.mockRejectedValueOnce(new Error('Capacity is below tickets already sold.'));
    renderOrganizerApp(api, '/events/evt-1/edit');

    await user.click(await screen.findByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Capacity is below tickets already sold.');
    expect(screen.getByTestId('location')).toHaveTextContent('/events/evt-1/edit');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  it('shows an error when the event can’t be loaded', async () => {
    renderOrganizerApp(createFakeApi([]), '/events/missing/edit');
    expect(await screen.findByRole('alert')).toHaveTextContent('Event not found.');
  });
});
