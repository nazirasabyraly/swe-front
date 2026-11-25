import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMockCampaignsApi } from '../../api/mocks/mockCampaigns';
import { createMockCheckoutApi } from '../../api/mocks/mockCheckout';
import { createMockEventsApi } from '../../api/mocks/mockEvents';
import { createMockOrdersApi } from '../../api/mocks/mockOrders';
import { createMockPaidSalesApi } from '../../api/mocks/mockPaidSales';
import { createMockPublicEventsApi } from '../../api/mocks/mockPublicEvents';
import { createMockTicketTypesApi } from '../../api/mocks/mockTicketTypes';
import { renderApp } from '../../test/renderApp';
import { formatRemaining } from './HoldTimer';

const EVENT = 'evt-almaty-nights';

async function setup({ holdMs, signedIn = true }: { holdMs?: number; signedIn?: boolean } = {}) {
  sessionStorage.clear();
  if (signedIn) sessionStorage.setItem('biletflow.mockSession', 'usr-attendee');
  const events = createMockEventsApi();
  const ticketTypes = createMockTicketTypesApi(events);
  const paidSales = createMockPaidSalesApi(events);
  const campaigns = createMockCampaignsApi(events);
  const publicEvents = createMockPublicEventsApi({ events, ticketTypes, paidSales, campaigns });
  const orders = createMockOrdersApi(events, { seed: false });
  const checkout = createMockCheckoutApi({ publicEvents, ticketTypes, campaigns, orders }, { holdMs });
  const types = await ticketTypes.listTicketTypes(EVENT);
  const id = (name: string) => types.find((t) => t.name === name)!.id;
  const counts = async (name: string) => (await ticketTypes.listTicketTypes(EVENT)).find((t) => t.name === name)!.counts;
  const render = (path: string) => renderApp(path, { events, ticketTypes, paidSales, campaigns, publicEvents, checkout, orders });
  return { user: userEvent.setup(), id, counts, campaigns, orders, render };
}

const location = () => screen.getByTestId('location').textContent ?? '';
const startPath = (items: string, promo?: string) =>
  `/events/${EVENT}/checkout?items=${encodeURIComponent(items)}${promo ? `&promo=${promo}` : ''}`;

describe('checkout', () => {
  it('asks anonymous visitors to sign in and brings them back to the same selection', async () => {
    const { user, render } = await setup({ signedIn: false });
    render(`/events/${EVENT}`);
    await user.click(await screen.findByRole('button', { name: 'Add one General admission ticket' }));
    expect(screen.getByText('You’ll sign in before checkout.')).toBeInTheDocument();
    const checkoutButton = screen.getByRole('button', { name: 'Checkout · 1 ticket' });
    await waitFor(() => expect(checkoutButton).toBeEnabled());
    await user.click(checkoutButton);

    await screen.findByRole('heading', { name: 'Sign in' });
    expect(decodeURIComponent(location())).toMatch(/^\/sign-in\?next=\/events\/evt-almaty-nights\/checkout\?items=.+(:|%3A)1$/);

    await user.type(screen.getByLabelText('Email'), 'attendee@demo.kz');
    await user.type(screen.getByLabelText('Password'), 'demo1234');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Checkout', level: 1 })).toBeInTheDocument();
    expect(location()).toMatch(/^\/checkout\/res-/);
  });

  it('holds tickets, validates details, takes a simulated payment and issues the order', async () => {
    const { user, id, counts, campaigns, render } = await setup();
    render(startPath(`${id('General admission')}:1,${id('VIP balcony')}:1`, 'STUDENT20'));

    expect(await screen.findByRole('heading', { name: 'Checkout', level: 1 })).toBeInTheDocument();
    expect(location()).toMatch(/^\/checkout\/res-/); // reload-safe URL
    expect((await counts('General admission')).reserved).toBe(1); // held, not sold

    const summary = screen.getByLabelText('Order summary');
    expect(summary).toHaveTextContent('Subtotal₸25,000Discount (STUDENT20)−₸5,000Processing fee₸700Total₸20,700');
    expect(screen.getByRole('timer')).toHaveTextContent(/^(10:00|9:5\d)$/);
    expect(screen.getByText('SIMULATION')).toBeInTheDocument();
    expect(screen.getByText(/this payment is simulated. No card details are needed/)).toBeInTheDocument();
    expect(screen.getByLabelText('Ticket 1 · General admission: attendee name')).toHaveValue('Demo Attendee');

    await user.click(screen.getByRole('button', { name: 'Pay ₸20,700 (simulated)' }));
    const second = screen.getByLabelText('Ticket 2 · VIP balcony: attendee name');
    expect(second).toHaveFocus();
    expect(second).toHaveAccessibleDescription('Enter the attendee’s name.');

    await user.type(second, 'Aigerim Sadykova');
    await user.click(screen.getByRole('button', { name: 'Pay ₸20,700 (simulated)' }));
    expect(screen.getByRole('checkbox', { name: 'I’ve read the refund policy.' })).toHaveFocus();
    expect(screen.getByText('Confirm that you’ve read the refund policy.')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'I’ve read the refund policy.' }));
    await user.click(screen.getByRole('button', { name: 'Pay ₸20,700 (simulated)' }));

    expect(await screen.findByRole('heading', { name: 'You’re going!' })).toBeInTheDocument();
    expect(screen.getByText(/^BF-[A-Z2-9]{6}$/)).toBeInTheDocument();
    expect(screen.getByText('Demo order: the payment was simulated and no money moved.')).toBeInTheDocument();
    expect(screen.getByText('Your tickets are on their way to attendee@demo.kz.')).toBeInTheDocument();

    expect(await counts('General admission')).toMatchObject({ reserved: 0, sold: 587 });
    const [student] = await campaigns.listCampaigns(EVENT);
    expect(student.stats).toMatchObject({ redemptions: 39, ticketsSold: 40, discountTotal: 54400 });
  });

  it('issues no tickets when the simulated payment is declined, and lets the attendee retry', async () => {
    const { user, id, counts, render } = await setup();
    render(startPath(`${id('General admission')}:2`));
    await screen.findByRole('heading', { name: 'Checkout', level: 1 });
    await user.type(screen.getByLabelText('Ticket 2 · General admission: attendee name'), 'Dana');
    await user.click(screen.getByRole('checkbox', { name: 'I’ve read the refund policy.' }));

    await user.click(screen.getByRole('radio', { name: 'Card is declined' }));
    await user.click(screen.getByRole('button', { name: 'Pay ₸13,455 (simulated)' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Payment declined (simulated)');
    expect(alert).toHaveTextContent('No money moved and no tickets were issued.');
    expect(await counts('General admission')).toMatchObject({ reserved: 2, sold: 586 });

    await user.click(screen.getByRole('radio', { name: 'Payment succeeds' }));
    await user.click(screen.getByRole('button', { name: 'Pay ₸13,455 (simulated)' }));
    expect(await screen.findByRole('heading', { name: 'You’re going!' })).toBeInTheDocument();
  });

  it('releases the tickets when the attendee cancels', async () => {
    const { user, id, counts, render } = await setup();
    render(startPath(`${id('VIP balcony')}:3`));
    await screen.findByRole('heading', { name: 'Checkout', level: 1 });
    expect((await counts('VIP balcony')).reserved).toBe(7); // 4 seeded + 3

    await user.click(screen.getByRole('button', { name: 'Cancel and release tickets' }));
    await waitFor(() => expect(location()).toBe(`/events/${EVENT}`));
    expect((await counts('VIP balcony')).reserved).toBe(4);
  });

  it('shows an expired hold and releases its tickets', async () => {
    const { id, counts, render } = await setup({ holdMs: 1 });
    render(startPath(`${id('General admission')}:1`));
    expect(await screen.findByRole('heading', { name: 'Your reservation expired' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Choose tickets again' })).toHaveAttribute('href', `/events/${EVENT}`);
    expect((await counts('General admission')).reserved).toBe(0);
  });

  it('switches to the expired state when the timer runs out', async () => {
    const { id, render } = await setup({ holdMs: 1500 });
    render(startPath(`${id('General admission')}:1`));
    await screen.findByRole('heading', { name: 'Checkout', level: 1 });
    expect(await screen.findByRole('heading', { name: 'Your reservation expired' }, { timeout: 4000 })).toBeInTheDocument();
  });

  it('registers free tickets without any payment step', async () => {
    const { user, render } = await setup();
    render('/events/evt-career-day/checkout?items=evt-career-day-tt0:1');
    expect(await screen.findByRole('heading', { name: 'Complete registration', level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Payment' })).not.toBeInTheDocument();
    expect(screen.queryByText('SIMULATION')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Order summary')).toHaveTextContent('Total₸0');

    await user.click(screen.getByRole('button', { name: 'Complete registration' }));
    const success = await screen.findByRole('region', { name: 'You’re registered!' });
    expect(within(success).getByText('Free')).toBeInTheDocument();
    expect(within(success).queryByText(/payment was simulated/)).not.toBeInTheDocument();
  });

  it('explains why tickets couldn’t be held', async () => {
    const { id, render } = await setup();
    render(startPath(`${id('Fan pit')}:1`));
    expect(await screen.findByRole('heading', { name: 'We couldn’t hold these tickets' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('One of the selected tickets is no longer on sale.');
  });

  it('rejects a malformed checkout link', async () => {
    const { render } = await setup();
    render(`/events/${EVENT}/checkout?items=garbage`);
    expect(await screen.findByText('This checkout link is incomplete. Choose your tickets again.')).toBeInTheDocument();
  });
});

describe('formatRemaining', () => {
  it.each([
    [600_000, '10:00'],
    [59_001, '1:00'],
    [9_000, '0:09'],
    [0, '0:00'],
    [-5_000, '0:00'],
  ])('%i ms → %s', (ms, text) => expect(formatRemaining(ms)).toBe(text));
});
