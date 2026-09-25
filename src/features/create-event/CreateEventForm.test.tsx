import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateEventForm } from './CreateEventForm';
import { emptyEventDraft } from './types';
import { fillEventForm, now } from './testUtils';

function renderForm() {
  const onContinue = vi.fn();
  const user = userEvent.setup();
  render(<CreateEventForm initialDraft={emptyEventDraft} onContinue={onContinue} now={now} />);
  const submit = () => user.click(screen.getByRole('button', { name: 'Continue to preview' }));
  return { onContinue, user, submit };
}

describe('CreateEventForm', () => {
  it('shows an error for every required field and does not continue when empty', async () => {
    const { onContinue, submit } = renderForm();

    await submit();

    expect(onContinue).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Fix 10 fields before previewing');
    for (const message of [
      'Enter an event title.',
      'Enter a description.',
      'Choose a category.',
      'Enter the venue name.',
      'Enter the city.',
      'Choose the event date.',
      'Choose the start time.',
      'Choose when registration opens.',
      'Choose when registration closes.',
      'Enter the event capacity.',
    ]) {
      expect(screen.getByText(message)).toBeInTheDocument();
    }
    expect(screen.getByLabelText('Event title')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Event title')).toHaveFocus();
  });

  it('clears a field error as soon as it is fixed', async () => {
    const { user, submit } = renderForm();
    await submit();

    await user.type(screen.getByLabelText('Event title'), 'Jazz on Panfilov');

    expect(screen.queryByText('Enter an event title.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Event title')).toHaveAttribute('aria-invalid', 'false');
  });

  it('rejects an event that starts in the past', async () => {
    const { onContinue, user, submit } = renderForm();
    await fillEventForm(user, { date: '2026-09-01', registrationClosesAt: '2026-08-31T10:00' });

    await submit();

    expect(onContinue).not.toHaveBeenCalled();
    expect(screen.getByText('The event must start in the future.')).toBeInTheDocument();
  });

  it('requires registration to close after it opens and before the event starts', async () => {
    const { user, submit } = renderForm();
    await fillEventForm(user, { registrationClosesAt: '2026-10-12T20:00' });
    await submit();
    expect(screen.getByText('Registration must close before the event starts.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Registration closes'), {
      target: { value: '2026-10-12T18:00' },
    });
    expect(screen.queryByText('Registration must close before the event starts.')).toBeNull();
  });

  it('rejects closing time before opening time', async () => {
    const { user, submit } = renderForm();
    await fillEventForm(user, {
      registrationOpensAt: '2026-10-01T10:00',
      registrationClosesAt: '2026-09-30T10:00',
    });
    await submit();
    expect(screen.getByText('Registration must close after it opens.')).toBeInTheDocument();
  });

  it.each([
    ['0', 'Capacity must be a whole number of at least 1.'],
    ['12.5', 'Capacity must be a whole number of at least 1.'],
    ['100001', 'Capacity cannot exceed 100,000.'],
  ])('rejects capacity %s', async (capacity, message) => {
    const { onContinue, user, submit } = renderForm();
    await fillEventForm(user, { capacity });
    await submit();
    expect(onContinue).not.toHaveBeenCalled();
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it('rejects non-image uploads', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const onContinue = vi.fn();
    render(<CreateEventForm initialDraft={emptyEventDraft} onContinue={onContinue} now={now} />);
    await fillEventForm(user);
    await user.upload(
      screen.getByLabelText('Images'),
      new File(['%PDF'], 'poster.pdf', { type: 'application/pdf' }),
    );

    await user.click(screen.getByRole('button', { name: 'Continue to preview' }));

    expect(onContinue).not.toHaveBeenCalled();
    expect(screen.getByText('Only image files can be uploaded.')).toBeInTheDocument();
  });

  it('continues with the entered values when the form is valid', async () => {
    const { onContinue, user, submit } = renderForm();
    await fillEventForm(user);

    await submit();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onContinue.mock.calls[0][0]).toMatchObject({
      title: 'Almaty Nights — Vol. 4',
      category: 'Music',
      venueName: 'Almaty Arena',
      city: 'Almaty',
      date: '2026-10-12',
      startTime: '19:00',
      visibility: 'unlisted',
      capacity: '1200',
    });
  });
});
