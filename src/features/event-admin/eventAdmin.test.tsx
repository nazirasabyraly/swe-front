import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMockCampaignsApi } from '../../api/mocks/mockCampaigns';
import { createMockEventsApi } from '../../api/mocks/mockEvents';
import { createMockNotificationsApi } from '../../api/mocks/mockNotifications';
import { createMockOrdersApi } from '../../api/mocks/mockOrders';
import { createMockOrganizerApi } from '../../api/mocks/mockOrganizer';
import { createMockTicketTypesApi } from '../../api/mocks/mockTicketTypes';
import { renderApp } from '../../test/renderApp';

function setup(path: string) {
  sessionStorage.clear();
  sessionStorage.setItem('biletflow.mockSession', 'usr-organizer');
  const events = createMockEventsApi();
  const ticketTypes = createMockTicketTypesApi(events);
  const campaigns = createMockCampaignsApi(events);
  const orders = createMockOrdersApi(events);
  const notifications = createMockNotificationsApi();
  const organizer = createMockOrganizerApi({ events, ticketTypes, campaigns, orders, notifications });
  renderApp(path, { events, ticketTypes, campaigns, orders, notifications, organizer });
  return { user: userEvent.setup(), orders, notifications, ticketTypes };
}

const location = () => screen.getByTestId('location').textContent ?? '';
const kpi = (name: string) => screen.getByText(name, { selector: 'dt' }).nextElementSibling!;

describe('My events phases', () => {
  it('classifies events as upcoming, active, completed or cancelled', async () => {
    const { user } = setup('/organizer/events');
    await screen.findByRole('article', { name: 'Almaty Nights — Vol. 4' });
    await user.click(screen.getByRole('radio', { name: 'Completed (1)' }));
    expect(location()).toBe('/organizer/events?tab=completed');
    expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-labelledby'))).toEqual(['event-card-evt-spring-jam-title']);
    await user.click(screen.getByRole('radio', { name: 'Cancelled (0)' }));
    expect(screen.getByText('No events in this group.')).toBeInTheDocument();
  });

  it('opens an event’s management area from its title', async () => {
    const { user } = setup('/organizer/events');
    await user.click(await screen.findByRole('link', { name: 'Almaty Nights — Vol. 4' }));
    expect(await screen.findByRole('navigation', { name: 'Event management' })).toBeInTheDocument();
    expect(location()).toBe('/organizer/events/evt-almaty-nights');
  });
});

describe('event overview analytics', () => {
  it('shows server figures, filters by ticket type and offers a table view', async () => {
    const { user } = setup('/organizer/events/evt-almaty-nights');
    expect(await screen.findByRole('heading', { name: 'Sales and attendance' })).toBeInTheDocument();
    expect(kpi('Tickets sold')).toHaveTextContent('864of 1,200 (72%)');
    expect(kpi('Gross sales')).toHaveTextContent('₸8,172,000');
    expect(kpi('Discounts')).toHaveTextContent('₸49,400');
    expect(screen.getByText(/Demonstration revenue/)).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: /STUDENT20/ })).toBeInTheDocument();
    expect(screen.getByText('Check-in figures appear once the event starts.')).toBeInTheDocument();

    const byType = screen.getByRole('figure', { name: 'Tickets sold by type' });
    await user.click(within(byType).getByRole('button', { name: 'Show as table' }));
    expect(within(byType).getByRole('row', { name: 'VIP balcony 158' })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Ticket type'), 'VIP balcony');
    await waitFor(() => expect(kpi('Tickets sold')).toHaveTextContent('158of 200 (79%)'));
  });

  it('shows attendance for a completed event', async () => {
    setup('/organizer/events/evt-spring-jam');
    await screen.findByRole('heading', { name: 'Attendance' });
    expect(kpi('Checked in')).toHaveTextContent('96');
    expect(kpi('Not checked in')).toHaveTextContent('24');
    expect(kpi('Check-in rate')).toHaveTextContent('80%');
  });

  it('cancels an event: tickets invalidated, attendees notified', async () => {
    const { user, orders, notifications } = setup('/organizer/events/evt-almaty-nights');
    await user.click(await screen.findByRole('button', { name: 'Cancel event' }));
    const dialog = screen.getByRole('dialog', { name: 'Cancel “Almaty Nights — Vol. 4”?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel event' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Enter a reason for attendees.');

    await user.type(within(dialog).getByLabelText('Reason shown to attendees'), 'Venue flooded');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel event' }));

    expect(await screen.findByText('“Almaty Nights — Vol. 4” was cancelled')).toBeInTheDocument();
    const order = (await orders.allOrders()).find((o) => o.order.id === 'ord-demo-nights')!.order;
    expect(order.status).toBe('refunded');
    expect(order.tickets.every((t) => t.status === 'refunded')).toBe(true);
    sessionStorage.setItem('biletflow.mockSession', 'usr-attendee');
    expect((await notifications.listNotifications())[0]).toMatchObject({ type: 'event_cancelled' });
  });

  it('duplicates an event into a new draft with its ticket types', async () => {
    const { user, ticketTypes } = setup('/organizer/events/evt-almaty-nights');
    await user.click(await screen.findByRole('button', { name: 'Duplicate as new draft' }));
    expect(await screen.findByRole('heading', { name: 'Set up “Almaty Nights — Vol. 4 (copy)”' })).toBeInTheDocument();
    const copyId = location().split('/')[3];
    const copied = await ticketTypes.listTicketTypes(copyId);
    expect(copied.map((t) => [t.name, t.counts.sold])).toEqual([
      ['General admission', 0],
      ['Fan pit', 0],
      ['VIP balcony', 0],
    ]);
  });
});

describe('orders and refunds', () => {
  it('refunds an order in full and records it', async () => {
    const { user, notifications } = setup('/organizer/events/evt-almaty-nights/orders');
    const row = (await screen.findByRole('rowheader', { name: 'BF-NGT4A2' })).closest('tr')!;
    expect(within(row).getByText('Demo Attendee')).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: 'Refund order BF-NGT4A2' }));

    const dialog = screen.getByRole('dialog', { name: 'Refund order BF-NGT4A2?' });
    expect(dialog).toHaveTextContent('Demo Attendee gets a full refund of ₸20,700 (simulated: no money moves).');
    await user.type(within(dialog).getByLabelText('Reason (recorded in the audit log)'), 'Customer request');
    await user.click(within(dialog).getByRole('button', { name: 'Refund in full' }));

    await waitFor(() => expect(within(row).getByText('Refunded')).toBeInTheDocument());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /Refund/ })).not.toBeInTheDocument();

    sessionStorage.setItem('biletflow.mockSession', 'usr-attendee');
    expect((await notifications.listNotifications())[0]).toMatchObject({ type: 'refund_completed', link: '/orders/ord-demo-nights' });
  });

  it('lists attendees and searches them', async () => {
    const { user } = setup('/organizer/events/evt-almaty-nights/orders');
    await screen.findByRole('rowheader', { name: 'BF-NGT4A2' });
    await user.click(screen.getByRole('radio', { name: 'Attendees (2)' }));
    expect(screen.getByRole('rowheader', { name: 'Aigerim Sadykova' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Search name, email, order or ticket'), 'aigerim');
    expect(screen.getByRole('radio', { name: 'Attendees (2)' })).toBeChecked(); // same order, both tickets match
    await user.clear(screen.getByLabelText('Search name, email, order or ticket'));
    await user.type(screen.getByLabelText('Search name, email, order or ticket'), 'nobody');
    expect(screen.getByRole('radio', { name: 'Attendees (0)' })).toBeChecked();
  });
});

describe('check-in staff', () => {
  it('adds and removes Event Admins by account email', async () => {
    const { user } = setup('/organizer/events/evt-almaty-nights/staff');
    expect(await screen.findByRole('rowheader', { name: /Aruzhan Bekova/ })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Their account email'), 'stranger@example.kz');
    await user.click(screen.getByRole('button', { name: 'Add staff' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('There’s no BiletFlow account with this email.');

    await user.clear(screen.getByLabelText('Their account email'));
    await user.type(screen.getByLabelText('Their account email'), 'attendee@demo.kz');
    await user.click(screen.getByRole('button', { name: 'Add staff' }));
    expect(await screen.findByRole('rowheader', { name: /Demo Attendee/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove Aruzhan Bekova' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(screen.queryByRole('rowheader', { name: /Aruzhan Bekova/ })).not.toBeInTheDocument());
  });
});

describe('activity timeline', () => {
  it('lists history newest first and filters by type', async () => {
    const { user } = setup('/organizer/events/evt-almaty-nights/timeline');
    const entries = await screen.findAllByRole('listitem');
    expect(entries.length).toBeGreaterThan(5);
    await user.selectOptions(screen.getByLabelText('Activity type'), 'Promo code');
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    expect(screen.getByText('Promo code STUDENT20')).toBeInTheDocument();
  });
});

describe('organizer profile', () => {
  it('saves contact details and a new payout account', async () => {
    const { user } = setup('/organizer/profile');
    expect(await screen.findByLabelText('Organizer name')).toHaveValue('Nomad Sound Collective');
    expect(screen.getByText('Verified')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Change payout account' }));
    await user.type(screen.getByLabelText('Account holder'), 'Nomad Sound LLP');
    await user.type(screen.getByLabelText('IBAN'), 'KZ12');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(screen.getByText('Enter a Kazakhstan IBAN: KZ followed by 18 letters or digits.')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('IBAN'));
    await user.type(screen.getByLabelText('IBAN'), 'KZ86125KZT5004109999');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(await screen.findByText('Profile saved.')).toBeInTheDocument();
    expect(screen.getByText('Being verified')).toBeInTheDocument();
    expect(screen.getByText('Nomad Sound LLP, account ending 9999')).toBeInTheDocument();
  });
});
