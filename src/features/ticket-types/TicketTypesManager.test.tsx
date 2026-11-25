import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { ApiProvider } from '../../api/ApiContext';
import { createMockEventsApi } from '../../api/mocks/mockEvents';
import { createMockPaidSalesApi } from '../../api/mocks/mockPaidSales';
import { createMockTicketTypesApi } from '../../api/mocks/mockTicketTypes';
import { makeEvent } from '../../test/fakeEventsApi';
import { createTestClient } from '../../test/renderApp';
import { TicketTypesManager } from './TicketTypesManager';

const event = makeEvent({ id: 'evt-1', capacity: 1000 });
const now = () => new Date('2026-10-01T00:00:00Z'); // during the sales window

function setup(
  seed: Parameters<typeof createMockTicketTypesApi>[1] = {},
  { paidSalesActive = true }: { paidSalesActive?: boolean } = {},
) {
  const user = userEvent.setup();
  const events = createMockEventsApi([event]);
  const ticketTypes = createMockTicketTypesApi(events, seed);
  const paidSales = createMockPaidSalesApi(events, paidSalesActive ? ['evt-1'] : []);
  render(
    <ApiProvider api={createTestClient({ events, ticketTypes, paidSales })}>
      <MemoryRouter>
        <TicketTypesManager event={event} now={now} activationHref="/activate" />
      </MemoryRouter>
    </ApiProvider>,
  );
  return { user, ticketTypes, paidSales };
}

const soldSeed = {
  'evt-1': [
    { name: 'General admission', description: '', kind: 'paid' as const, price: 6500, quantity: 800, maxPerOrder: 10, hidden: false, sold: 586 },
    { name: 'Fan pit', description: '', kind: 'paid' as const, price: 12000, quantity: 120, maxPerOrder: 4, hidden: false, sold: 120 },
  ],
};

const row = (name: string) => screen.getByRole('listitem', { name });

describe('TicketTypesManager', () => {
  it('starts empty and adds a free ticket type with defaults from the event', async () => {
    const { user, ticketTypes } = setup();
    expect(await screen.findByRole('heading', { name: 'No ticket types yet' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add ticket type' }));
    const form = screen.getByRole('form', { name: 'New ticket type' });
    expect(within(form).getByLabelText('Sales start')).toHaveValue('2026-09-25T10:00');
    expect(within(form).getByLabelText('Sales end')).toHaveValue('2026-10-12T17:00');
    expect(within(form).queryByLabelText('Price (₸)')).not.toBeInTheDocument();

    await user.type(within(form).getByLabelText('Name'), 'Community entry');
    await user.type(within(form).getByLabelText('Quantity'), '200');
    await user.click(within(form).getByRole('button', { name: 'Save ticket type' }));

    const created = await screen.findByRole('listitem', { name: 'Community entry' });
    expect(within(created).getByText('Free')).toBeInTheDocument();
    expect(within(created).getByText('On sale')).toBeInTheDocument();
    expect(within(created).getByText('Sales 25 Sept → 12 Oct')).toBeInTheDocument();
    expect(await ticketTypes.listTicketTypes('evt-1')).toHaveLength(1);
  });

  it('asks for a price only for paid types and validates before saving', async () => {
    const { user } = setup({}, { paidSalesActive: false });
    await user.click(await screen.findByRole('button', { name: 'Add ticket type' }));
    const form = screen.getByRole('form', { name: 'New ticket type' });

    await user.click(within(form).getByRole('radio', { name: 'Paid' }));
    await user.click(within(form).getByRole('button', { name: 'Save ticket type' }));

    expect(within(form).getByText('Enter a name.')).toBeInTheDocument();
    expect(within(form).getByText('Enter a price.')).toBeInTheDocument();
    expect(within(form).getByText('Enter a quantity.')).toBeInTheDocument();
    expect(within(form).getByLabelText('Name')).toHaveFocus();

    await user.type(within(form).getByLabelText('Name'), 'VIP balcony');
    await user.type(within(form).getByLabelText('Price (₸)'), '18500');
    await user.type(within(form).getByLabelText('Quantity'), '200');
    await user.click(within(form).getByRole('button', { name: 'Save ticket type' }));

    const created = await screen.findByRole('listitem', { name: 'VIP balcony' });
    expect(within(created).getByText('₸18,500')).toBeInTheDocument();
    // Not purchasable until activation, so never "On sale".
    expect(within(created).getByText('Awaiting activation')).toBeInTheDocument();
    expect(screen.getByText(/Paid tickets go on sale only after paid-sales activation/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Complete paid-sales activation' })).toHaveAttribute('href', '/activate');
  });

  it('shows paid types as on sale with no notice once paid sales are active', async () => {
    setup(soldSeed);
    expect(await within(await screen.findByRole('listitem', { name: 'General admission' })).findByText('On sale')).toBeInTheDocument();
    expect(screen.queryByText(/Paid tickets go on sale only after/)).not.toBeInTheDocument();
  });

  it('shows the admin suspension and marks paid types as suspended', async () => {
    const events = createMockEventsApi([event]);
    const paidSales = createMockPaidSalesApi(events, ['evt-1']);
    paidSales.suspend('evt-1', 'Unusual refund pattern');
    render(
      <ApiProvider api={createTestClient({ events, ticketTypes: createMockTicketTypesApi(events, soldSeed), paidSales })}>
        <MemoryRouter>
          <TicketTypesManager event={event} now={now} activationHref="/activate" />
        </MemoryRouter>
      </ApiProvider>,
    );
    const ga = await screen.findByRole('listitem', { name: 'General admission' });
    expect(within(ga).getByText('Sales suspended')).toBeInTheDocument();
    expect(screen.getByText(/Reason: Unusual refund pattern/)).toBeInTheDocument();
    // Suspension doesn't block managing the types themselves.
    expect(within(ga).getByRole('button', { name: 'Edit General admission' })).toBeEnabled();
  });

  it('shows server counters and sold-out status, and blocks quantity below sales', async () => {
    const { user } = setup(soldSeed);

    const ga = await screen.findByRole('listitem', { name: 'General admission' });
    expect(within(ga).getByLabelText('Ticket counts for General admission')).toHaveTextContent('Available214Reserved0Sold586Refunded0Checked in0');
    expect(within(row('Fan pit')).getByText('Sold out')).toBeInTheDocument();

    await user.click(within(ga).getByRole('button', { name: 'Edit General admission' }));
    const form = screen.getByRole('form', { name: 'Edit “General admission”' });
    expect(within(form).getByText('At least 586: already sold or reserved.')).toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText('Quantity'), { target: { value: '500' } });
    await user.click(within(form).getByRole('button', { name: 'Save ticket type' }));
    expect(within(form).getByText('Quantity can’t be lower than 586 (already sold or reserved).')).toBeInTheDocument();
  });

  it('hides and shows a type without deleting it, and only offers delete when nothing is sold', async () => {
    const { user } = setup(soldSeed);
    const ga = await screen.findByRole('listitem', { name: 'General admission' });
    expect(within(ga).queryByRole('button', { name: 'Delete General admission' })).not.toBeInTheDocument();

    await user.click(within(ga).getByRole('button', { name: 'Hide General admission' }));
    expect(await within(row('General admission')).findByText('Hidden')).toBeInTheDocument();

    await user.click(within(row('General admission')).getByRole('button', { name: 'Show General admission' }));
    expect(await within(row('General admission')).findByText('On sale')).toBeInTheDocument();
  });

  it('deletes an unsold type after confirmation', async () => {
    const { user } = setup({
      'evt-1': [{ name: 'Mistake', description: '', kind: 'free', price: 0, quantity: 5, maxPerOrder: 1, hidden: false }],
    });
    await user.click(await screen.findByRole('button', { name: 'Delete Mistake' }));

    const dialog = screen.getByRole('dialog', { name: 'Delete “Mistake”?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('heading', { name: 'No ticket types yet' })).toBeInTheDocument();
  });

  it('warns when ticket quantities exceed the event capacity', async () => {
    setup(soldSeed); // 800 + 120 visible vs capacity 1000 → fine
    await screen.findByRole('listitem', { name: 'Fan pit' });
    expect(screen.queryByText(/more than the event capacity/)).not.toBeInTheDocument();
  });

  it('shows the capacity warning once quantities pass capacity', async () => {
    setup({ 'evt-1': [{ ...soldSeed['evt-1'][0], quantity: 1500, sold: 0 }] });
    expect(await screen.findByText(/Ticket quantities add up to 1,500, more than the event capacity of 1,000/)).toBeInTheDocument();
  });
});
