import { fireEvent, screen } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

/** Fixed clock for tests: Thu 24 Sep 2026, 12:00 local time. */
export const NOW = new Date(2026, 8, 24, 12, 0);
export const now = () => NOW;

export interface FormValues {
  title: string;
  description: string;
  category: string;
  venueName: string;
  city: string;
  address: string;
  date: string;
  startTime: string;
  visibility: 'Public' | 'Unlisted' | 'Private';
  registrationOpensAt: string;
  registrationClosesAt: string;
  capacity: string;
}

export const validValues: FormValues = {
  title: 'Almaty Nights — Vol. 4',
  description:
    'Three contemporary Kazakh acts and a late DJ set.\n\nDoors open one hour before the start.',
  category: 'Music',
  venueName: 'Almaty Arena',
  city: 'Almaty',
  address: 'Momyshuly Ave 1',
  date: '2026-10-12',
  startTime: '19:00',
  visibility: 'Unlisted',
  registrationOpensAt: '2026-09-25T10:00',
  registrationClosesAt: '2026-10-12T17:00',
  capacity: '1200',
};

// Native date/time pickers aren't typeable in jsdom, so set their values directly.
const setValue = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

export async function fillEventForm(user: UserEvent, overrides: Partial<FormValues> = {}) {
  const v = { ...validValues, ...overrides };
  if (v.title) await user.type(screen.getByLabelText('Event title'), v.title);
  if (v.description) setValue('Description', v.description);
  if (v.category) await user.click(screen.getByRole('radio', { name: v.category }));
  if (v.venueName) await user.type(screen.getByLabelText('Venue name'), v.venueName);
  if (v.city) await user.type(screen.getByLabelText('City'), v.city);
  if (v.address) await user.type(screen.getByLabelText('Street address'), v.address);
  if (v.date) setValue('Date', v.date);
  if (v.startTime) setValue('Start time', v.startTime);
  await user.click(screen.getByRole('radio', { name: new RegExp(`^${v.visibility}`) }));
  if (v.registrationOpensAt) setValue('Registration opens', v.registrationOpensAt);
  if (v.registrationClosesAt) setValue('Registration closes', v.registrationClosesAt);
  if (v.capacity) await user.type(screen.getByLabelText('Capacity'), v.capacity);
}
