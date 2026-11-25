import { screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { createMockCampaignsApi } from '../../api/mocks/mockCampaigns';
import { createMockEventsApi } from '../../api/mocks/mockEvents';
import { createMockPaidSalesApi } from '../../api/mocks/mockPaidSales';
import { createMockPublicEventsApi } from '../../api/mocks/mockPublicEvents';
import { createMockTicketTypesApi } from '../../api/mocks/mockTicketTypes';
import { renderApp } from '../../test/renderApp';

beforeEach(() => sessionStorage.clear()); // signed out: these pages are public

/** The full demo data set: seeded events, ticket types, activation, STUDENT20 and other organizers. */
function setup(path: string) {
  const user = userEvent.setup();
  const events = createMockEventsApi();
  const ticketTypes = createMockTicketTypesApi(events);
  const paidSales = createMockPaidSalesApi(events);
  const campaigns = createMockCampaignsApi(events);
  const publicEvents = createMockPublicEventsApi({ events, ticketTypes, paidSales, campaigns });
  renderApp(path, { events, ticketTypes, paidSales, campaigns, publicEvents });
  return { user, events, ticketTypes, paidSales, campaigns };
}

const location = () => screen.getByTestId('location').textContent ?? '';
const ticket = (name: string) => screen.getByRole('listitem', { name });

async function choose(user: UserEvent, name: string, times = 1) {
  for (let i = 0; i < times; i++) await user.click(screen.getByRole('button', { name: `Add one ${name} ticket` }));
}

describe('Discover', () => {
  it('lists public upcoming events with prices and availability, and filters by category and search', async () => {
    const { user } = setup('/');
    expect(await screen.findByRole('heading', { name: 'Discover events', level: 1 })).toBeInTheDocument();
    const cards = await screen.findAllByRole('article');
    expect(cards.map((c) => within(c).getByRole('heading').textContent)).toEqual([
      'Student Career Day 2026',
      'Steppe Film Festival — Opening Night',
      'Jazz on Panfilov',
      'Almaty Nights — Vol. 4',
      'Astana Half Marathon — Expo',
      'Winter Gala Concert',
    ]);
    // Drafts (KazDev) never appear.
    expect(screen.queryByText(/KazDev/)).not.toBeInTheDocument();

    const nights = screen.getByRole('article', { name: 'Almaty Nights — Vol. 4' });
    expect(within(nights).getByText('₸6,500')).toBeInTheDocument();
    expect(within(nights).getByText('252 left')).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: 'Student Career Day 2026' })).getByText('Free')).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: 'Jazz on Panfilov' })).getByText('Free and paid')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Music' }));
    await waitFor(() => expect(location()).toBe('/?category=Music'));
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(3));

    await user.type(screen.getByRole('searchbox', { name: 'Search events' }), 'panfilov');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(screen.getAllByRole('article').map((c) => c.getAttribute('aria-labelledby'))).toEqual(['discover-evt-jazz-panfilov']));
    expect(location()).toBe('/?category=Music&q=panfilov');

    await user.click(screen.getByRole('radio', { name: 'Sport' }));
    expect(await screen.findByRole('heading', { name: 'No events match' })).toBeInTheDocument();
  });

  it('opens the event page from a card', async () => {
    const { user } = setup('/');
    await user.click(await screen.findByRole('link', { name: 'Almaty Nights — Vol. 4' }));
    expect(await screen.findByRole('heading', { name: 'Almaty Nights — Vol. 4', level: 1 })).toBeInTheDocument();
    expect(location()).toBe('/events/evt-almaty-nights');
  });
});

describe('public event page', () => {
  it('shows the event and each ticket type’s server state', async () => {
    setup('/events/evt-almaty-nights');
    expect(await screen.findByRole('heading', { name: 'Almaty Nights — Vol. 4', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Nomad Sound Collective')).toBeInTheDocument();
    expect(screen.getByText('Paid sales active · prices include VAT')).toBeInTheDocument();

    expect(within(ticket('General admission')).getByText('214 left')).toBeInTheDocument();
    expect(within(ticket('Fan pit')).getByText('Sold out')).toBeInTheDocument();
    expect(within(ticket('Fan pit')).queryByRole('group')).not.toBeInTheDocument();
    expect(within(ticket('VIP balcony')).getByText('38 left')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose tickets' })).toBeDisabled();
  });

  it('shows server totals and applies a typed promo code (prototype numbers)', async () => {
    const { user } = setup('/events/evt-almaty-nights');
    await screen.findByRole('heading', { name: 'Almaty Nights — Vol. 4', level: 1 });

    await choose(user, 'General admission');
    await choose(user, 'VIP balcony');
    await waitFor(() => expect(screen.getByLabelText('Order summary')).toHaveTextContent('Subtotal₸25,000Processing fee₸875Total₸25,875'));
    expect(screen.getByText(/payments are simulated in KZT. No money moves/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Checkout · 2 tickets' })).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Promo code' }), 'student20');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(await screen.findByText('STUDENT20 applied: 20% off')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText('Order summary')).toHaveTextContent(
        'Subtotal₸25,000Discount (STUDENT20)−₸5,000Processing fee₸700Total₸20,700',
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Remove code' }));
    await waitFor(() => expect(screen.getByLabelText('Order summary')).toHaveTextContent('Total₸25,875'));
  });

  it('applies the promo from a campaign link after the server validates it', async () => {
    const events = createMockEventsApi();
    const campaigns = createMockCampaignsApi(events);
    const [student] = await campaigns.listCampaigns('evt-almaty-nights');
    const url = new URL(student.link);

    const ticketTypes = createMockTicketTypesApi(events);
    const paidSales = createMockPaidSalesApi(events);
    renderApp(url.pathname + url.search, {
      events, ticketTypes, paidSales, campaigns,
      publicEvents: createMockPublicEventsApi({ events, ticketTypes, paidSales, campaigns }),
    });

    expect(await screen.findByText('STUDENT20 applied: 20% off')).toBeInTheDocument();
    expect(screen.getByText('Added from the campaign link you opened.')).toBeInTheDocument();
  });

  it('explains why a campaign link’s code wasn’t applied', async () => {
    const events = createMockEventsApi();
    const campaigns = createMockCampaignsApi(events);
    const [student] = await campaigns.listCampaigns('evt-almaty-nights');
    await campaigns.setCampaignEnabled('evt-almaty-nights', student.id, false);
    const url = new URL(student.link);
    const ticketTypes = createMockTicketTypesApi(events);
    const paidSales = createMockPaidSalesApi(events);
    renderApp(url.pathname + url.search, {
      events, ticketTypes, paidSales, campaigns,
      publicEvents: createMockPublicEventsApi({ events, ticketTypes, paidSales, campaigns }),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('This promo code is no longer active.');
    expect(screen.queryByText(/applied/)).not.toBeInTheDocument();
  });

  it('rejects unknown codes and codes that don’t cover the chosen tickets', async () => {
    const { user, campaigns, ticketTypes } = setup('/events/evt-almaty-nights');
    const vip = (await ticketTypes.listTicketTypes('evt-almaty-nights')).find((t) => t.name === 'VIP balcony')!;
    const now = new Date();
    await campaigns.createCampaign('evt-almaty-nights', {
      name: 'VIP only', code: 'VIPONLY', discountType: 'fixed', discountValue: 1000,
      validFrom: new Date(now.getTime() - 60_000), validUntil: new Date(now.getTime() + 86_400_000),
      maxRedemptions: null, ticketTypeIds: [vip.id],
    });
    await screen.findByRole('heading', { name: 'Almaty Nights — Vol. 4', level: 1 });

    await user.type(screen.getByRole('textbox', { name: 'Promo code' }), 'NOPE');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This promo code doesn’t exist for this event.');
    expect(screen.getByRole('textbox', { name: 'Promo code' })).toHaveAttribute('aria-invalid', 'true');

    await user.clear(screen.getByRole('textbox', { name: 'Promo code' }));
    await user.type(screen.getByRole('textbox', { name: 'Promo code' }), 'VIPONLY');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText('VIPONLY applied: ₸1,000 off')).toBeInTheDocument();

    await choose(user, 'General admission');
    expect(await screen.findByRole('alert')).toHaveTextContent('doesn’t apply to the tickets you chose');
    await waitFor(() => expect(screen.getByLabelText('Order summary')).toHaveTextContent('Subtotal₸6,500Processing fee₸228Total₸6,728'));
  });

  it('limits each type to its per-order maximum', async () => {
    const { user } = setup('/events/evt-almaty-nights');
    await screen.findByRole('heading', { name: 'Almaty Nights — Vol. 4', level: 1 });
    await choose(user, 'VIP balcony', 6);
    expect(screen.getByRole('button', { name: 'Add one VIP balcony ticket' })).toBeDisabled();
    expect(within(ticket('VIP balcony')).getByText('Up to 6 per order.')).toBeInTheDocument();
  });

  it('shows paid tickets as not on sale while paid sales are suspended', async () => {
    const events = createMockEventsApi();
    const ticketTypes = createMockTicketTypesApi(events);
    const paidSales = createMockPaidSalesApi(events);
    paidSales.suspend('evt-almaty-nights', 'Review');
    const campaigns = createMockCampaignsApi(events);
    renderApp('/events/evt-almaty-nights', {
      events, ticketTypes, paidSales, campaigns,
      publicEvents: createMockPublicEventsApi({ events, ticketTypes, paidSales, campaigns }),
    });
    await screen.findByRole('heading', { name: 'Almaty Nights — Vol. 4', level: 1 });
    expect(within(ticket('General admission')).getByText('Not on sale yet')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /Quantity for/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Paid sales active · prices include VAT')).not.toBeInTheDocument();
  });

  it('treats drafts as not found', async () => {
    setup('/events/evt-kazdev');
    expect(await screen.findByRole('heading', { name: 'Event not found' })).toBeInTheDocument();
  });

  it('opens a published unlisted event by its link', async () => {
    const events = createMockEventsApi();
    await events.publishEvent('evt-kazdev'); // unlisted in the seed
    renderApp('/events/evt-kazdev', { events });
    expect(await screen.findByRole('heading', { name: /KazDev Meetup/, level: 1 })).toBeInTheDocument();
    expect(screen.getByText('No tickets are on sale yet.')).toBeInTheDocument();
  });
});
