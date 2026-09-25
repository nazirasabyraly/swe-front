import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateEventWizard } from './CreateEventWizard';
import { fillEventForm, now } from './testUtils';

async function renderAtReview(onSubmit = vi.fn()) {
  const user = userEvent.setup();
  render(<CreateEventWizard onSubmit={onSubmit} organizerName="Nomad Sound Collective" now={now} />);
  await fillEventForm(user);
  await user.upload(
    screen.getByLabelText('Images'),
    new File(['img'], 'arena.png', { type: 'image/png' }),
  );
  await user.click(screen.getByRole('button', { name: 'Continue to preview' }));
  return { user, onSubmit };
}

describe('CreateEventWizard', () => {
  it('shows the preview with the entered data before anything is submitted', async () => {
    const { onSubmit } = await renderAtReview();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Review & publish');
    expect(screen.getByText(/Preview: this is how attendees will see your event/)).toBeInTheDocument();
    expect(screen.getByText(/Visibility: Unlisted\./)).toBeInTheDocument();

    const preview = screen.getByRole('article', { name: 'Event preview' });
    expect(within(preview).getByRole('heading', { name: 'Almaty Nights — Vol. 4' })).toBeInTheDocument();
    expect(within(preview).getByText('Music')).toBeInTheDocument();
    expect(within(preview).getByText('Mon 12 Oct 2026, 19:00')).toBeInTheDocument();
    expect(within(preview).getByText('Almaty Arena, Almaty')).toBeInTheDocument();
    expect(within(preview).getByText('Nomad Sound Collective')).toBeInTheDocument();
    expect(within(preview).getByText('Doors open one hour before the start.')).toBeInTheDocument();
    expect(within(preview).getByText(/^1\s200 spots$/)).toBeInTheDocument();
    expect(await within(preview).findByRole('img', { name: /^Cover image/ })).toHaveAttribute(
      'src',
      'blob:mock/arena.png',
    );
  });

  it('submits the normalised event when the organizer confirms', async () => {
    const { user, onSubmit } = await renderAtReview(vi.fn().mockResolvedValue(undefined));

    await user.click(screen.getByRole('button', { name: 'Confirm and create event' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [payload] = onSubmit.mock.calls[0];
    expect(payload).toEqual({
      title: 'Almaty Nights — Vol. 4',
      description:
        'Three contemporary Kazakh acts and a late DJ set.\n\nDoors open one hour before the start.',
      category: 'Music',
      images: [expect.objectContaining({ name: 'arena.png' })],
      format: 'physical',
      venue: { name: 'Almaty Arena', address: 'Momyshuly Ave 1', city: 'Almaty' },
      startsAt: new Date(2026, 9, 12, 19, 0),
      visibility: 'unlisted',
      registrationOpensAt: new Date(2026, 8, 25, 10, 0),
      registrationClosesAt: new Date(2026, 9, 12, 17, 0),
      capacity: 1200,
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Event created');
  });

  it('shows the error and stays on the preview when submission fails', async () => {
    const { user } = await renderAtReview(vi.fn().mockRejectedValue(new Error('Network error')));

    await user.click(screen.getByRole('button', { name: 'Confirm and create event' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Network error');
    expect(screen.getByRole('article', { name: 'Event preview' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm and create event' })).toBeEnabled();
  });

  it('keeps the entered values when going back to edit', async () => {
    const { user } = await renderAtReview();

    await user.click(screen.getByRole('button', { name: 'Back to edit' }));

    expect(screen.getByLabelText('Event title')).toHaveValue('Almaty Nights — Vol. 4');
    expect(screen.getByRole('radio', { name: 'Music' })).toBeChecked();
    expect(screen.getByLabelText('Capacity')).toHaveValue(1200);
    expect(screen.getByText('arena.png')).toBeInTheDocument();
  });
});
