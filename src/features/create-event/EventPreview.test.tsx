import { render, screen, within } from '@testing-library/react';
import { EventPreview } from './EventPreview';
import type { CreateEventInput } from './types';

const event: CreateEventInput = {
  title: 'Steppe Film Festival — Opening Night',
  description: 'Opening gala screening.\n\nRed carpet from 19:00.',
  category: 'Arts',
  images: [
    new File(['a'], 'cover.jpg', { type: 'image/jpeg' }),
    new File(['b'], 'hall.jpg', { type: 'image/jpeg' }),
  ],
  format: 'physical',
  venue: { name: 'Kinopark 11', address: 'Timiryazev St 42', city: 'Almaty' },
  startsAt: new Date(2026, 9, 3, 20, 0),
  visibility: 'public',
  registrationOpensAt: new Date(2026, 8, 25, 9, 0),
  registrationClosesAt: new Date(2026, 9, 3, 18, 30),
  capacity: 18500,
};

describe('EventPreview', () => {
  it('renders the event as attendees will see it', async () => {
    render(<EventPreview event={event} organizerName="Nomad Sound Collective" />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Steppe Film Festival — Opening Night' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Arts')).toBeInTheDocument();
    expect(screen.getByText('Sat 03 Oct 2026, 20:00')).toBeInTheDocument();
    expect(screen.getByText('Kinopark 11, Almaty')).toBeInTheDocument();
    expect(screen.getByText('Timiryazev St 42')).toBeInTheDocument();
    expect(screen.getByText('Nomad Sound Collective')).toBeInTheDocument();
    expect(screen.getByText('Opening gala screening.')).toBeInTheDocument();
    expect(screen.getByText('Red carpet from 19:00.')).toBeInTheDocument();

    const registration = screen.getByRole('complementary', { name: 'Registration' });
    expect(within(registration).getByText('Fri 25 Sep 2026, 09:00')).toBeInTheDocument();
    expect(within(registration).getByText('Sat 03 Oct 2026, 18:30')).toBeInTheDocument();
    expect(within(registration).getByText(/^18\s500 spots$/)).toBeInTheDocument();

    expect(
      await screen.findByRole('img', { name: 'Cover image for Steppe Film Festival — Opening Night' }),
    ).toHaveAttribute('src', 'blob:mock/cover.jpg');
    expect(screen.getByRole('img', { name: /photo 2$/ })).toHaveAttribute('src', 'blob:mock/hall.jpg');
  });

  it('falls back to the striped placeholder when there are no images', () => {
    render(<EventPreview event={{ ...event, images: [] }} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText('Organizer')).not.toBeInTheDocument();
  });
});
