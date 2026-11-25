import { render, screen, within } from '@testing-library/react';
import { EventPreview } from './EventPreview';
import type { TicketType } from '../../api/ticketTypes';
import type { PreviewEvent } from './EventPreview';

const event: PreviewEvent = {
  title: 'Steppe Film Festival — Opening Night',
  description: 'Opening gala screening.\n\nRed carpet from 19:00.',
  category: 'Arts',
  imageUrls: ['https://cdn.example/cover.jpg', 'https://cdn.example/hall.jpg'],
  format: 'physical',
  venue: { name: 'Kinopark 11', address: 'Timiryazev St 42', city: 'Almaty' },
  // Times in Almaty (UTC+5): 3 Oct 20:00–23:00, registration 25 Sep 09:00 → 3 Oct 18:30.
  startsAt: new Date('2026-10-03T15:00:00Z'),
  endsAt: new Date('2026-10-03T18:00:00Z'),
  timeZone: 'Asia/Almaty',
  visibility: 'public',
  registrationOpensAt: new Date('2026-09-25T04:00:00Z'),
  registrationClosesAt: new Date('2026-10-03T13:30:00Z'),
  capacity: 18500,
  refundPolicy: 'Full refunds up to 48 hours before the event.',
};

describe('EventPreview', () => {
  it('renders the event as attendees will see it', async () => {
    render(<EventPreview event={event} organizerName="Nomad Sound Collective" />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Steppe Film Festival — Opening Night' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Arts')).toBeInTheDocument();
    // Shown in the event's zone even though the test browser runs in New York time.
    expect(screen.getByText('Sat, 03 Oct 2026, 20:00–23:00 (GMT+5)')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Refund policy' })).toBeInTheDocument();
    expect(screen.getByText('Full refunds up to 48 hours before the event.')).toBeInTheDocument();
    expect(screen.getByText('Kinopark 11, Almaty')).toBeInTheDocument();
    expect(screen.getByText('Timiryazev St 42')).toBeInTheDocument();
    expect(screen.getByText('Nomad Sound Collective')).toBeInTheDocument();
    expect(screen.getByText('Opening gala screening.')).toBeInTheDocument();
    expect(screen.getByText('Red carpet from 19:00.')).toBeInTheDocument();

    const registration = screen.getByRole('complementary', { name: 'Registration' });
    expect(within(registration).getByText('Fri, 25 Sept 2026, 09:00')).toBeInTheDocument();
    expect(within(registration).getByText('Sat, 03 Oct 2026, 18:30')).toBeInTheDocument();
    expect(within(registration).getByText('18,500 spots')).toBeInTheDocument();

    expect(
      await screen.findByRole('img', { name: 'Cover image for Steppe Film Festival — Opening Night' }),
    ).toHaveAttribute('src', 'https://cdn.example/cover.jpg');
    expect(screen.getByRole('img', { name: /photo 2$/ })).toHaveAttribute('src', 'https://cdn.example/hall.jpg');
  });

  it('falls back to the striped placeholder when there are no images', () => {
    render(<EventPreview event={{ ...event, imageUrls: [], refundPolicy: '' }} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText('Organizer')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Refund policy' })).not.toBeInTheDocument();
  });

  it('lists the ticket types attendees can buy, with server counts', () => {
    const type = (over: Partial<TicketType>): TicketType => ({
      id: over.name ?? 'x',
      eventId: 'e',
      name: 'x',
      description: '',
      kind: 'paid',
      price: 6500,
      quantity: 100,
      salesStartAt: new Date('2026-09-25T04:00:00Z'),
      salesEndAt: new Date('2026-10-03T13:30:00Z'),
      maxPerOrder: 10,
      hidden: false,
      counts: { available: 40, reserved: 0, sold: 60, refunded: 0, checkedIn: 0 },
      ...over,
    });
    render(
      <EventPreview
        event={event}
        ticketTypes={[
          type({ name: 'General admission', description: 'Standing floor' }),
          type({ name: 'Fan pit', price: 12000, counts: { available: 0, reserved: 0, sold: 100, refunded: 0, checkedIn: 0 } }),
          type({ name: 'Student', kind: 'free', price: 0 }),
          type({ name: 'Staff only', hidden: true }),
        ]}
        paidSalesActive
      />,
    );

    const tickets = screen.getAllByRole('listitem');
    expect(tickets.map((li) => li.textContent)).toEqual([
      'General admission₸6,500Standing floor40 left',
      'Fan pit₸12,000Sold out',
      'StudentFree40 left',
    ]);
    expect(screen.queryByText('Staff only')).not.toBeInTheDocument();
  });

  it('shows paid tickets as not on sale until paid sales are activated', () => {
    const paid = {
      id: 'tt-p', eventId: 'evt-1', name: 'VIP', description: '', kind: 'paid' as const, price: 18500, quantity: 10,
      salesStartAt: new Date('2026-09-25T05:00:00Z'), salesEndAt: new Date('2026-10-03T13:30:00Z'), maxPerOrder: 2, hidden: false,
      counts: { available: 10, reserved: 0, sold: 0, refunded: 0, checkedIn: 0 },
    };
    render(<EventPreview event={event} ticketTypes={[paid, { ...paid, id: 'tt-f', name: 'Free entry', kind: 'free', price: 0 }]} />);
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'VIP₸18,500Not on sale yet',
      'Free entryFree10 left',
    ]);
  });

  it('says when no tickets are on sale yet', () => {
    render(<EventPreview event={event} />);
    expect(screen.getByText('No tickets are on sale yet.')).toBeInTheDocument();
  });
});

