import { screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { createMockEventsApi } from '../../api/mocks/mockEvents';
import { createMockPaidSalesApi } from '../../api/mocks/mockPaidSales';
import { createMockTicketTypesApi } from '../../api/mocks/mockTicketTypes';
import { makeEvent } from '../../test/fakeEventsApi';
import { renderApp } from '../../test/renderApp';

const event = makeEvent({ id: 'evt-1' });
const paidType = { name: 'VIP balcony', description: '', kind: 'paid' as const, price: 18500, quantity: 200, maxPerOrder: 6, hidden: false };
const freeType = { name: 'Community entry', description: '', kind: 'free' as const, price: 0, quantity: 100, maxPerOrder: 4, hidden: false };

beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem('biletflow.mockSession', 'usr-organizer');
});

function setup(path: string, { types = [paidType, freeType], active = false } = {}) {
  const events = createMockEventsApi([event]);
  const paidSales = createMockPaidSalesApi(events, active ? ['evt-1'] : []);
  renderApp(path, { events, ticketTypes: createMockTicketTypesApi(events, { 'evt-1': types }), paidSales });
  return { user: userEvent.setup(), paidSales };
}

const item = (name: string) => screen.getByRole('listitem', { name });
const location = () => screen.getByTestId('location').textContent ?? '';

async function completeChecklist(user: UserEvent) {
  const identity = screen.getByRole('form', { name: 'Identity verification' });
  await user.type(within(identity).getByLabelText('Full legal name'), 'Demo Organizer');
  await user.type(within(identity).getByLabelText('IIN'), '900101300123');
  await user.click(within(identity).getByRole('button', { name: 'Verify identity' }));
  expect(await within(item('Identity verification')).findByText('Verified: Demo Organizer')).toBeInTheDocument();

  const payout = screen.getByRole('form', { name: 'Payout account connected' });
  await user.type(within(payout).getByLabelText('Account holder'), 'Demo Organizer');
  await user.type(within(payout).getByLabelText('IBAN'), 'kz86 125k zt50 0410 4417');
  await user.click(within(payout).getByRole('button', { name: 'Connect account' }));
  expect(await within(item('Payout account connected')).findByText('Demo KZT account ending 4417')).toBeInTheDocument();

  await user.click(within(item('Activation fee paid')).getByRole('button', { name: 'Pay ₸9,900 (simulated)' }));
  expect(await within(item('Activation fee paid')).findByText(/Simulated payment, reference SIM-.*No money was charged/)).toBeInTheDocument();

  const terms = screen.getByRole('form', { name: 'Paid-event terms accepted' });
  await user.click(within(terms).getByRole('checkbox', { name: 'I accept the paid-event terms (version 2026-09)' }));
  await user.click(within(terms).getByRole('button', { name: 'Accept terms' }));
  expect(await within(item('Paid-event terms accepted')).findByText(/Accepted version 2026-09/)).toBeInTheDocument();
}

describe('paid-sales activation (wizard step 3)', () => {
  it('walks the simulated checklist, activates, then the review shows paid tickets on sale', async () => {
    const { user } = setup('/organizer/events/evt-1/setup/tickets');

    await user.click(await screen.findByRole('button', { name: 'Continue to paid sales' }));
    await waitFor(() => expect(location()).toBe('/organizer/events/evt-1/setup/activation'));

    expect(await screen.findByText('SIMULATION')).toBeInTheDocument();
    expect(screen.getByText(/No money moves and nothing is sent to a bank/)).toBeInTheDocument();
    expect(screen.getByText('One-time ₸9,900 per event')).toBeInTheDocument();
    const activate = screen.getByRole('button', { name: 'Activate paid sales' });
    expect(activate).toBeDisabled();
    expect(activate).toHaveAccessibleDescription('Complete every item above to activate paid sales for this event.');

    await completeChecklist(user);
    await user.click(screen.getByRole('button', { name: 'Activate paid sales' }));
    expect(await screen.findByText('Paid sales active for this event')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activate paid sales' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Continue to review' }));
    const preview = await screen.findByRole('article', { name: 'Event preview' });
    expect(within(preview).getByText('₸18,500')).toBeInTheDocument();
    expect(within(preview).queryByText('Not on sale yet')).not.toBeInTheDocument();
    expect(screen.queryByText(/until paid-sales activation is complete/)).not.toBeInTheDocument();
  });

  it('validates identity and payout input before sending it', async () => {
    const { user } = setup('/organizer/events/evt-1/setup/activation');
    const identity = await screen.findByRole('form', { name: 'Identity verification' });
    await user.type(within(identity).getByLabelText('IIN'), '12345');
    await user.click(within(identity).getByRole('button', { name: 'Verify identity' }));
    expect(within(identity).getByText('Enter a name.')).toBeInTheDocument();
    expect(within(identity).getByText('An IIN has exactly 12 digits.')).toBeInTheDocument();
    expect(within(identity).getByLabelText('IIN')).toHaveAttribute('aria-invalid', 'true');

    const payout = screen.getByRole('form', { name: 'Payout account connected' });
    await user.type(within(payout).getByLabelText('Account holder'), 'Demo');
    await user.type(within(payout).getByLabelText('IBAN'), 'DE89370400440532013000');
    await user.click(within(payout).getByRole('button', { name: 'Connect account' }));
    expect(within(payout).getByText('Enter a Kazakhstan IBAN: KZ followed by 18 letters or digits.')).toBeInTheDocument();

    const terms = screen.getByRole('form', { name: 'Paid-event terms accepted' });
    await user.click(within(terms).getByRole('button', { name: 'Accept terms' }));
    expect(within(terms).getByText('Tick the box to accept the terms.')).toBeInTheDocument();
    expect(within(item('Paid-event terms accepted')).getByText('To do')).toBeInTheDocument();
  });

  it('shows the server’s error when activation is refused', async () => {
    const { user, paidSales } = setup('/organizer/events/evt-1/setup/activation');
    await screen.findByRole('form', { name: 'Identity verification' });
    await completeChecklist(user);
    paidSales.suspend('evt-1', 'Policy review');

    await user.click(screen.getByRole('button', { name: 'Activate paid sales' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Paid sales for this event are suspended.');
  });

  it('shows an admin suspension read-only, with the reason', async () => {
    const events = createMockEventsApi([event]);
    const paidSales = createMockPaidSalesApi(events, ['evt-1']);
    paidSales.suspend('evt-1', 'Suspected ticket fraud');
    renderApp('/organizer/events/evt-1/setup/activation', {
      events,
      ticketTypes: createMockTicketTypesApi(events, { 'evt-1': [paidType] }),
      paidSales,
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Paid sales suspended by a platform administrator');
    expect(alert).toHaveTextContent('Reason: Suspected ticket fraud.');
    expect(screen.getByText('Suspended')).toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activate paid sales' })).not.toBeInTheDocument();
  });

  it('skips activation when every ticket type is free', async () => {
    const { user } = setup('/organizer/events/evt-1/setup/tickets', { types: [freeType] });
    await screen.findByRole('listitem', { name: 'Community entry' });
    await user.click(screen.getByRole('button', { name: 'Continue to review' }));
    await waitFor(() => expect(location()).toBe('/organizer/events/evt-1/setup/review'));
    expect(await screen.findByRole('link', { name: 'Back to ticket types' })).toBeInTheDocument();
  });

  it('marks paid tickets as not on sale in the review until activation', async () => {
    setup('/organizer/events/evt-1/setup/review');
    const preview = await screen.findByRole('article', { name: 'Event preview' });
    expect(within(preview).getByText('Not on sale yet')).toBeInTheDocument();
    expect(screen.getByText(/until paid-sales activation is complete/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to paid sales' })).toBeInTheDocument();
  });

  it('opens the standalone activation page from the Tickets page notice', async () => {
    const { user } = setup('/organizer/events/evt-1/tickets');
    await user.click(await screen.findByRole('link', { name: 'Complete paid-sales activation' }));
    expect(await screen.findByRole('heading', { name: 'Paid sales: Almaty Nights — Vol. 4' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Paid sales activation checklist' })).toBeInTheDocument();
  });
});
