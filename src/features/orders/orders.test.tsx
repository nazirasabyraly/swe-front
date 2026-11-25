import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMockCampaignsApi } from '../../api/mocks/mockCampaigns';
import { createMockCheckoutApi } from '../../api/mocks/mockCheckout';
import { createMockEventsApi } from '../../api/mocks/mockEvents';
import { createMockOrdersApi, mockTicketPdf } from '../../api/mocks/mockOrders';
import { createMockPaidSalesApi } from '../../api/mocks/mockPaidSales';
import { createMockPublicEventsApi } from '../../api/mocks/mockPublicEvents';
import { createMockTicketTypesApi } from '../../api/mocks/mockTicketTypes';
import { renderApp } from '../../test/renderApp';

function setup(path: string, userId = 'usr-attendee') {
  sessionStorage.clear();
  sessionStorage.setItem('biletflow.mockSession', userId);
  const events = createMockEventsApi();
  const ticketTypes = createMockTicketTypesApi(events);
  const paidSales = createMockPaidSalesApi(events);
  const campaigns = createMockCampaignsApi(events);
  const publicEvents = createMockPublicEventsApi({ events, ticketTypes, paidSales, campaigns });
  const orders = createMockOrdersApi(events); // seeded demo history for attendee@demo.kz
  const checkout = createMockCheckoutApi({ publicEvents, ticketTypes, campaigns, orders });
  renderApp(path, { events, ticketTypes, paidSales, campaigns, publicEvents, orders, checkout });
  return { user: userEvent.setup(), ticketTypes };
}

const location = () => screen.getByTestId('location').textContent ?? '';

describe('My orders', () => {
  it('lists orders newest first with status and server totals, and opens one', async () => {
    const { user } = setup('/account/orders');
    expect(await screen.findByRole('heading', { name: 'My orders', level: 1 })).toBeInTheDocument();
    const rows = await screen.findAllByRole('listitem');
    expect(rows.map((row) => within(row).getByRole('heading').textContent)).toEqual([
      'Almaty Nights — Vol. 4',
      'Jazz on Panfilov',
      'Steppe Film Festival — Spring Screening',
    ]);
    expect(within(rows[0]).getByText('Paid')).toBeInTheDocument();
    expect(within(rows[0]).getByText('₸20,700')).toBeInTheDocument();
    expect(within(rows[0]).getByText('(simulated)')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Refunded')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'View order BF-NGT4A2' }));
    expect(await screen.findByRole('heading', { name: 'Order BF-NGT4A2', level: 1 })).toBeInTheDocument();
    expect(screen.getByLabelText('Order summary')).toHaveTextContent(
      'General admission × 1₸6,500VIP balcony × 1₸18,500Discount (STUDENT20)−₸5,000Processing fee₸700Total₸20,700Payment methodSimulated card',
    );
    expect(screen.getByText('Demo order: the payment was simulated and no money moved.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '2 tickets' })).toBeInTheDocument();
  });

  it('shows only the signed-in user’s orders', async () => {
    setup('/account/orders', 'usr-organizer');
    expect(await screen.findByRole('heading', { name: 'No orders yet' })).toBeInTheDocument();
  });

  it('requires sign-in', async () => {
    sessionStorage.clear();
    renderApp('/account/tickets');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});

describe('My tickets', () => {
  it('splits tickets into upcoming and past', async () => {
    setup('/account/tickets');
    const upcoming = await screen.findByRole('region', { name: 'Upcoming' });
    const past = screen.getByRole('region', { name: 'Past' });

    const names = (region: HTMLElement) =>
      within(region).getAllByRole('listitem').map((li) => li.getAttribute('aria-labelledby'));
    expect(names(upcoming)).toEqual(['ticket-item-TK-5JZ2-RFND', 'ticket-item-TK-7Q2M-K9XD', 'ticket-item-TK-3HWP-8RNA']);
    expect(names(past)).toEqual(['ticket-item-TK-9FLM-CHKD']);
    expect(within(past).getByText('Checked in')).toBeInTheDocument();
    expect(within(upcoming).getByText('Refunded')).toBeInTheDocument();
  });
});

describe('ticket page', () => {
  it('shows a valid ticket with its QR, details, PDF and print', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const { user } = setup('/tickets/TK-3HWP-8RNA');

    const ticket = await screen.findByRole('article', { name: 'Almaty Nights — Vol. 4' });
    expect(within(ticket).getByText('Valid')).toBeInTheDocument();
    expect(within(ticket).getByRole('img', { name: 'Entry QR code for ticket TK-3HWP-8RNA' })).toBeInTheDocument();
    expect(within(ticket).getByText('VIP balcony')).toBeInTheDocument();
    expect(within(ticket).getByText('Aigerim Sadykova')).toBeInTheDocument();
    expect(within(ticket).getByText('Balcony B, row 2, seat 14')).toBeInTheDocument();
    expect(within(ticket).getByText('TK-3HWP-8RNA')).toBeInTheDocument();
    // No payment details on the ticket (SRS 4.7).
    expect(within(ticket).queryByText(/₸|card/i)).not.toBeInTheDocument();

    const pdf = screen.getByRole('link', { name: 'Download PDF' });
    expect(pdf).toHaveAttribute('download', 'biletflow-ticket-TK-3HWP-8RNA.pdf');
    expect(pdf.getAttribute('href')).toMatch(/^data:application\/pdf;base64,/);

    await user.click(screen.getByRole('button', { name: 'Print' }));
    expect(print).toHaveBeenCalled();
  });

  it('withdraws the QR of a refunded ticket and explains why', async () => {
    setup('/tickets/TK-5JZ2-RFND');
    expect(await screen.findByRole('alert')).toHaveTextContent('This ticket was refunded');
    expect(screen.queryByRole('img', { name: /Entry QR code/ })).not.toBeInTheDocument();
    expect(screen.getByText('No QR code: not valid for entry')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Download PDF' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Print' })).not.toBeInTheDocument();
  });

  it('shows when a ticket was checked in', async () => {
    setup('/tickets/TK-9FLM-CHKD');
    await screen.findByRole('article');
    expect(screen.getByRole('status')).toHaveTextContent(/^Checked in .+\d{2}:41/);
  });

  it('reports an unknown ticket', async () => {
    setup('/tickets/TK-NOPE');
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load this ticketTicket not found.');
  });
});

describe('after checkout', () => {
  it('confirms the order and issues a viewable ticket per attendee', async () => {
    const { user } = setup('/');
    await user.click(await screen.findByRole('link', { name: 'Almaty Nights — Vol. 4' }));
    await user.click(await screen.findByRole('button', { name: 'Add one General admission ticket' }));
    await user.click(screen.getByRole('button', { name: 'Add one General admission ticket' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Checkout · 2 tickets' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Checkout · 2 tickets' }));

    await user.type(await screen.findByLabelText('Ticket 2 · General admission: attendee name'), 'Dana Nurlanovna');
    await user.click(screen.getByRole('checkbox', { name: 'I’ve read the refund policy.' }));
    await user.click(screen.getByRole('button', { name: /^Pay .* \(simulated\)$/ }));

    expect(await screen.findByRole('heading', { name: 'You’re going!', level: 1 })).toBeInTheDocument();
    expect(location()).toMatch(/^\/orders\/ord-/);
    expect(screen.getByText('Your tickets are on their way to attendee@demo.kz.')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'View General admission ticket for Dana Nurlanovna' }));

    const ticket = await screen.findByRole('article', { name: 'Almaty Nights — Vol. 4' });
    expect(within(ticket).getByText('Dana Nurlanovna')).toBeInTheDocument();
    expect(within(ticket).getByText(/^TK-[A-Z2-9]{4}-[A-Z2-9]{4}$/)).toBeInTheDocument();
  });
});

describe('mock ticket PDF', () => {
  it('is a PDF containing the ticket ID', () => {
    const url = mockTicketPdf({
      id: 'TK-AAAA-BBBB', orderId: 'o', orderNumber: 'BF-X', ticketTypeName: 'GA', attendeeName: 'Ä (test)', seat: null,
      status: 'valid', qrImageUrl: null,
      event: { id: 'e', title: 'Night — 1', startsAt: new Date(0), endsAt: new Date(0), timeZone: 'Asia/Almaty', venue: { name: 'V', address: '', city: 'C' } },
    });
    const pdf = atob(url.split(',')[1]);
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('TK-AAAA-BBBB');
    expect(pdf).toContain('Night - 1');
    expect(pdf).toContain('? \\(test\\)');
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
  });
});

describe('mock orders API', () => {
  it('returns the seeded history to concurrent first calls', async () => {
    sessionStorage.setItem('biletflow.mockSession', 'usr-attendee');
    const orders = createMockOrdersApi(createMockEventsApi());
    const [a, b] = await Promise.all([orders.listMyTickets(), orders.listMyTickets()]);
    expect(a).toHaveLength(4);
    expect(b).toHaveLength(4);
  });
});
