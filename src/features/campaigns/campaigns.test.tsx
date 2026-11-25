import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMockCampaignsApi } from '../../api/mocks/mockCampaigns';
import { createMockEventsApi } from '../../api/mocks/mockEvents';
import { createMockTicketTypesApi } from '../../api/mocks/mockTicketTypes';
import { makeEvent } from '../../test/fakeEventsApi';
import { renderApp } from '../../test/renderApp';
import { toCampaignInput, validateCampaignDraft, type CampaignDraft } from './model';

beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem('biletflow.mockSession', 'usr-organizer');
});

function setup(path = '/organizer/events/evt-almaty-nights/campaigns') {
  const user = userEvent.setup();
  const events = createMockEventsApi();
  const campaigns = createMockCampaignsApi(events);
  renderApp(path, { events, ticketTypes: createMockTicketTypesApi(events), campaigns });
  return { user, campaigns };
}

const campaignItem = (name: string) => screen.getByRole('listitem', { name });

describe('promo campaigns page', () => {
  it('shows a campaign’s code, link, Campaign QR and server results', async () => {
    setup();
    const card = await screen.findByRole('listitem', { name: 'University posters' });

    expect(within(card).getByText('20% off · All ticket types')).toBeInTheDocument();
    expect(within(card).getByText('Active')).toBeInTheDocument();
    expect(within(card).getByText('STUDENT20')).toBeInTheDocument();
    // The link carries only an opaque token: no code, no discount.
    const link = (within(card).getByRole('textbox', { name: 'Campaign link for University posters' }) as HTMLInputElement).value;
    expect(link).toMatch(/^http:\/\/localhost(:\d+)?\/events\/evt-almaty-nights\?campaign=[a-z0-9]{16}$/);
    expect(link).not.toMatch(/STUDENT|discount|percent/i);
    expect(within(card).getByText('38 of 100 used')).toBeInTheDocument();
    expect(within(card).getByLabelText('Results for University posters')).toHaveTextContent(
      'Orders31Tickets sold38Gross₸247,000Discounts₸49,400Net₸197,600',
    );

    // Visibly a promo QR, not an admission ticket.
    expect(within(card).getByRole('img', { name: 'Campaign QR code for promo code STUDENT20' })).toBeInTheDocument();
    expect(within(card).getByText('PROMO QR')).toBeInTheDocument();
    expect(within(card).getByText(/Not an entry ticket/)).toBeInTheDocument();
    const download = within(card).getByRole('link', { name: 'Download Campaign QR for STUDENT20' });
    expect(download).toHaveAttribute('download', 'biletflow-campaign-STUDENT20.svg');
    expect(download.getAttribute('href')).toMatch(/^data:image\/svg\+xml/);
  });

  it('validates the form, then creates a campaign for chosen ticket types', async () => {
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name: 'New campaign' }));
    const form = screen.getByRole('form', { name: 'New campaign' });

    await user.click(within(form).getByRole('checkbox', { name: 'All ticket types' }));
    await user.click(within(form).getByRole('button', { name: 'Create campaign' }));
    expect(within(form).getByText('Enter a campaign name.')).toBeInTheDocument();
    expect(within(form).getByText('Enter a discount.')).toBeInTheDocument();
    expect(within(form).getByText('Choose at least one ticket type.')).toBeInTheDocument();
    expect(within(form).getByLabelText('Campaign name')).toHaveFocus();

    await user.type(within(form).getByLabelText('Campaign name'), 'Early birds');
    await user.type(within(form).getByLabelText('Promo code (optional)'), 'early-26');
    await user.type(within(form).getByLabelText('Discount (%)'), '150');
    expect(within(form).getByText('A percentage can’t be more than 100.')).toBeInTheDocument();

    await user.click(within(form).getByRole('radio', { name: 'Fixed amount (₸)' }));
    await user.clear(within(form).getByLabelText('Discount (₸)'));
    await user.type(within(form).getByLabelText('Discount (₸)'), '1000');
    await user.type(within(form).getByLabelText('Maximum redemptions (optional)'), '50');
    await user.click(within(form).getByRole('checkbox', { name: 'VIP balcony' }));
    await user.click(within(form).getByRole('button', { name: 'Create campaign' }));

    const card = await screen.findByRole('listitem', { name: 'Early birds' });
    expect(within(card).getByText('EARLY-26')).toBeInTheDocument();
    expect(within(card).getByText('₸1,000 off · VIP balcony')).toBeInTheDocument();
    expect(within(card).getByText('0 of 50 used')).toBeInTheDocument();
    // Newest first.
    expect(screen.getAllByRole('listitem')[0]).toBe(card);
  });

  it('generates a code when none is given', async () => {
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name: 'New campaign' }));
    const form = screen.getByRole('form', { name: 'New campaign' });
    await user.type(within(form).getByLabelText('Campaign name'), 'Radio partner');
    await user.type(within(form).getByLabelText('Discount (%)'), '10');
    await user.click(within(form).getByRole('button', { name: 'Create campaign' }));

    const card = await screen.findByRole('listitem', { name: 'Radio partner' });
    expect(within(card).getByRole('button', { name: /^Copy code [A-Z2-9]{8}$/ })).toBeInTheDocument();
    expect(within(card).getByText('0 used, no limit')).toBeInTheDocument();
  });

  it('shows the server error when the code is already taken', async () => {
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name: 'New campaign' }));
    const form = screen.getByRole('form', { name: 'New campaign' });
    await user.type(within(form).getByLabelText('Campaign name'), 'Copycat');
    await user.type(within(form).getByLabelText('Promo code (optional)'), 'student20');
    await user.type(within(form).getByLabelText('Discount (%)'), '5');
    await user.click(within(form).getByRole('button', { name: 'Create campaign' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent('The code STUDENT20 is already in use.');
  });

  it('disables and re-enables a campaign', async () => {
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Disable University posters' }));
    expect(await within(campaignItem('University posters')).findByText('Disabled')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Enable University posters' }));
    expect(await within(campaignItem('University posters')).findByText('Active')).toBeInTheDocument();
  });

  it('copies the campaign link', async () => {
    const { user } = setup();
    const card = await screen.findByRole('listitem', { name: 'University posters' });
    await user.click(within(card).getByRole('button', { name: 'Copy campaign link for University posters' }));

    expect(await navigator.clipboard.readText()).toMatch(/\/events\/evt-almaty-nights\?campaign=/);
    expect(within(card).getByRole('status')).toHaveTextContent('Link copied.');
  });

  it('warns that links only work once the event is published', async () => {
    setup('/organizer/events/evt-kazdev/campaigns');
    expect(await screen.findByText(/isn’t published yet/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No campaigns yet' })).toBeInTheDocument();
  });

  it('opens from the Campaigns button on My events', async () => {
    const { user } = setup('/organizer/events');
    await user.click(await screen.findByRole('button', { name: 'Promo campaigns for Almaty Nights — Vol. 4' }));
    expect(await screen.findByRole('heading', { name: 'Campaigns: Almaty Nights — Vol. 4' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/organizer/events/evt-almaty-nights/campaigns'));
  });
});

describe('campaign model', () => {
  const event = makeEvent();
  const ctx = { timeZone: 'Asia/Almaty', eventEndsAt: event.endsAt };
  const draft: CampaignDraft = {
    name: ' Posters ',
    code: ' student20 ',
    discountType: 'percent',
    discountValue: '20',
    validFrom: '2026-09-25T10:00',
    validUntil: '2026-10-12T17:00',
    maxRedemptions: '',
    allTicketTypes: false,
    ticketTypeIds: ['tt-1'],
  };

  it('converts a valid draft, with times in the event zone and no limit as null', () => {
    expect(validateCampaignDraft(draft, ctx)).toEqual({});
    expect(toCampaignInput(draft, 'Asia/Almaty')).toEqual({
      name: 'Posters',
      code: 'STUDENT20',
      discountType: 'percent',
      discountValue: 20,
      validFrom: new Date('2026-09-25T05:00:00Z'),
      validUntil: new Date('2026-10-12T12:00:00Z'),
      maxRedemptions: null,
      ticketTypeIds: ['tt-1'],
    });
  });

  it.each<[Partial<CampaignDraft>, keyof CampaignDraft, string]>([
    [{ code: 'AB' }, 'code', 'campaignValidation.codeInvalid'],
    [{ code: 'NO SPACES' }, 'code', 'campaignValidation.codeInvalid'],
    [{ discountValue: '12.5' }, 'discountValue', 'campaignValidation.discountInvalid'],
    [{ discountType: 'fixed', discountValue: '10000001' }, 'discountValue', 'campaignValidation.fixedTooHigh'],
    [{ validUntil: '2026-09-25T09:00' }, 'validUntil', 'campaignValidation.untilBeforeFrom'],
    [{ validUntil: '2026-10-13T00:00' }, 'validUntil', 'campaignValidation.untilAfterEvent'],
    [{ maxRedemptions: '0' }, 'maxRedemptions', 'campaignValidation.redemptionsInvalid'],
  ])('%o → %s error', (change, field, key) => {
    expect(validateCampaignDraft({ ...draft, ...change }, ctx)[field]).toBe(key);
  });

  it('sends an empty list for "all ticket types"', () => {
    expect(toCampaignInput({ ...draft, allTicketTypes: true }, 'Asia/Almaty').ticketTypeIds).toEqual([]);
  });
});
