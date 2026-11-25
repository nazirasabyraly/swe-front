import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMockCampaignsApi } from '../../api/mocks/mockCampaigns';
import { createMockCheckoutApi } from '../../api/mocks/mockCheckout';
import { createMockEventsApi } from '../../api/mocks/mockEvents';
import { createMockOrdersApi } from '../../api/mocks/mockOrders';
import { createMockPaidSalesApi } from '../../api/mocks/mockPaidSales';
import { createMockPublicEventsApi } from '../../api/mocks/mockPublicEvents';
import { createMockSeatingApi } from '../../api/mocks/mockSeating';
import { createMockTicketTypesApi } from '../../api/mocks/mockTicketTypes';
import { renderApp } from '../../test/renderApp';

describe('assigned seating', () => {
  it('lets an attendee pick seats, holds them through checkout and prints them on the tickets', async () => {
    sessionStorage.clear();
    sessionStorage.setItem('biletflow.mockSession', 'usr-attendee');
    const events = createMockEventsApi();
    const ticketTypes = createMockTicketTypesApi(events);
    const paidSales = createMockPaidSalesApi(events);
    const campaigns = createMockCampaignsApi(events);
    const seating = createMockSeatingApi({ events, ticketTypes });
    const publicEvents = createMockPublicEventsApi({ events, ticketTypes, paidSales, campaigns });
    const orders = createMockOrdersApi(events, { seed: false });
    const checkout = createMockCheckoutApi({ publicEvents, ticketTypes, campaigns, orders, seating });
    const user = userEvent.setup();
    renderApp('/events/evt-winter-gala', { events, ticketTypes, paidSales, campaigns, seating, publicEvents, orders, checkout });

    const map = await screen.findByRole('region', { name: 'Choose your seats' });
    // Sold and accessible seats are announced with text, not only colour.
    expect(within(map).getByRole('button', { name: 'Parterre, row C, seat 4, ₸9,000, Sold' })).toBeDisabled();
    expect(within(map).getByRole('button', { name: 'Parterre, row A, seat 1, ₸9,000, Wheelchair accessible, Available' })).toBeEnabled();
    expect(screen.queryByRole('group', { name: 'Quantity for Parterre' })).not.toBeInTheDocument();

    await user.click(within(map).getByRole('button', { name: 'Parterre, row B, seat 7, ₸9,000, Available' }));
    await user.click(within(map).getByRole('button', { name: 'Balcony, row D, seat 1, ₸6,000, Available' }));
    expect(within(map).getByRole('button', { name: 'Parterre, row B, seat 7, ₸9,000, Selected' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByText('1 seat chosen on the map')).toHaveLength(2); // one Parterre, one Balcony

    const pay = screen.getByRole('button', { name: 'Checkout · 2 tickets' });
    await waitFor(() => expect(pay).toBeEnabled());
    await user.click(pay);

    expect(await screen.findByRole('list', { name: 'Your seats' })).toHaveTextContent('Parterre, row B, seat 7Balcony, row D, seat 1');
    // Held seats can't be taken by anyone else meanwhile.
    expect((await seating.getSeatMap('evt-winter-gala')).sections[0].rows[1].seats[6].status).toBe('held');

    await user.type(screen.getByLabelText('Ticket 2 · Balcony: attendee name'), 'Dana');
    await user.click(screen.getByRole('checkbox', { name: 'I’ve read the refund policy.' }));
    await user.click(screen.getByRole('button', { name: /^Pay .* \(simulated\)$/ }));
    await screen.findByRole('heading', { name: 'You’re going!' });

    const [ticketA, ticketB] = (await orders.listMyTickets()).map((t) => t.seat);
    expect(ticketA).toEqual({ section: 'Parterre', row: 'B', seat: '7' });
    expect(ticketB).toEqual({ section: 'Balcony', row: 'D', seat: '1' });
    expect((await seating.getSeatMap('evt-winter-gala')).sections[0].rows[1].seats[6].status).toBe('sold');
  });

  it('never sells the same seat twice', async () => {
    const events = createMockEventsApi();
    const ticketTypes = createMockTicketTypesApi(events);
    const seating = createMockSeatingApi({ events, ticketTypes });
    await seating.hold('evt-winter-gala', ['PAR-B-7'], 'res-1');
    await expect(seating.hold('evt-winter-gala', ['PAR-B-7'], 'res-2')).rejects.toMatchObject({ code: 'seat_unavailable' });
    seating.release('res-1');
    await expect(seating.hold('evt-winter-gala', ['PAR-B-7'], 'res-2')).resolves.toBeUndefined();
  });
});
