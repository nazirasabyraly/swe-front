import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMockAdminApi } from '../../api/mocks/mockAdmin';
import { createMockCampaignsApi } from '../../api/mocks/mockCampaigns';
import { createMockEventsApi } from '../../api/mocks/mockEvents';
import { createMockNotificationsApi } from '../../api/mocks/mockNotifications';
import { createMockOrdersApi } from '../../api/mocks/mockOrders';
import { createMockOrganizerApi } from '../../api/mocks/mockOrganizer';
import { createMockPaidSalesApi } from '../../api/mocks/mockPaidSales';
import { createMockModeration, createMockPublicEventsApi } from '../../api/mocks/mockPublicEvents';
import { createMockTicketTypesApi } from '../../api/mocks/mockTicketTypes';
import { toCsv } from '../../lib/csv';
import { renderApp } from '../../test/renderApp';

function setup(path: string, userId = 'usr-admin') {
  sessionStorage.clear();
  sessionStorage.setItem('biletflow.mockSession', userId);
  const moderation = createMockModeration();
  const events = createMockEventsApi();
  const ticketTypes = createMockTicketTypesApi(events);
  const paidSales = createMockPaidSalesApi(events, undefined, () => moderation.settings.activationFee);
  const campaigns = createMockCampaignsApi(events);
  const orders = createMockOrdersApi(events);
  const notifications = createMockNotificationsApi();
  const organizer = createMockOrganizerApi({ events, ticketTypes, campaigns, orders, notifications });
  const publicEvents = createMockPublicEventsApi({ events, ticketTypes, paidSales, campaigns, moderation }, []);
  const admin = createMockAdminApi({ events, paidSales, campaigns, orders, organizer, moderation });
  renderApp(path, { events, ticketTypes, paidSales, campaigns, orders, notifications, organizer, publicEvents, admin, moderation });
  return { user: userEvent.setup(), admin, paidSales, publicEvents, organizer };
}

async function confirmWithReason(user: ReturnType<typeof userEvent.setup>, reason = 'Policy review') {
  const dialog = await screen.findByRole('dialog');
  await user.type(within(dialog).getByLabelText('Reason (recorded in the audit log)'), reason);
  await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
}

describe('admin portal', () => {
  it('is only for platform admins', async () => {
    setup('/admin', 'usr-organizer');
    expect(await screen.findByRole('heading', { name: 'You don’t have access to this page' })).toBeInTheDocument();
  });

  it('searches users, events, orders and payments, and suspends a user', async () => {
    const { user } = setup('/admin');
    await user.type(await screen.findByRole('searchbox', { name: 'Search users, events, orders and payments' }), 'attendee');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    const users = await screen.findByRole('region', { name: 'Users (1)' });
    expect(within(users).getByText('Demo Attendee')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Orders (3)' })).toBeInTheDocument();

    await user.click(within(users).getByRole('button', { name: 'Suspend' }));
    await confirmWithReason(user);
    expect(await within(screen.getByRole('region', { name: 'Users (1)' })).findByText('Suspended')).toBeInTheDocument();
  });

  it('suspends all sales for an event, which stops public sales and is logged', async () => {
    const { user, publicEvents, organizer } = setup('/admin/events');
    await user.click(await screen.findByRole('button', { name: 'Suspend all sales for Almaty Nights — Vol. 4' }));
    await confirmWithReason(user, 'Reported as misleading');
    await waitFor(() => {
      const row = screen.getByRole('rowheader', { name: /Almaty Nights/ }).closest('tr')!;
      expect(within(row).getByText('Sales suspended')).toBeInTheDocument();
    });

    const page = await publicEvents.getPublicEvent('evt-almaty-nights');
    expect(page.salesSuspended).toBe(true);
    expect(page.ticketTypes.every((tt) => tt.state === 'unavailable')).toBe(true);
    sessionStorage.setItem('biletflow.mockSession', 'usr-organizer');
    const [latest] = await organizer.getTimeline('evt-almaty-nights', {});
    expect(latest.description).toBe('All sales suspended by a platform admin: Reported as misleading');
  });

  it('suspends and reinstates paid sales (SRS 4.5)', async () => {
    const { user, paidSales } = setup('/admin/events');
    await user.click(await screen.findByRole('button', { name: 'Suspend paid sales for Almaty Nights — Vol. 4' }));
    await confirmWithReason(user);
    expect((await paidSales.getPaidSales('evt-almaty-nights')).state).toBe('suspended');
    await user.click(await screen.findByRole('button', { name: 'Reinstate paid sales for Almaty Nights — Vol. 4' }));
    await confirmWithReason(user, 'Cleared');
    expect((await paidSales.getPaidSales('evt-almaty-nights')).state).toBe('active');
  });

  it('reviews reported events', async () => {
    const { user } = setup('/admin/reports');
    expect(await screen.findByText(/headliner is confirmed/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(await screen.findByText('Dismissed')).toBeInTheDocument();
  });

  it('monitors failed payments, labels them simulated and exports CSV', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { user } = setup('/admin/payments');
    expect(await screen.findByText('Every payment here is a demonstration record. No real money moved.')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Status'), 'Failed');
    expect(await screen.findByText('1 record')).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'SIM-FAIL-0007' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(click).toHaveBeenCalled();
  });

  it('changes the activation fee for new activations', async () => {
    const { user, paidSales } = setup('/admin/settings');
    const fee = await screen.findByLabelText('Activation fee (₸ per event)');
    expect(fee).toHaveValue('9900');
    await user.clear(fee);
    await user.type(fee, '12.5');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(screen.getByText('Enter a whole number of tenge.')).toBeInTheDocument();
    await user.clear(fee);
    await user.type(fee, '12000');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByText('Settings saved.')).toBeInTheDocument();
    expect((await paidSales.getPaidSales('evt-kazdev')).activationFee).toBe(12000);
  });
});

describe('reporting an event', () => {
  it('lets a signed-in attendee report an event for admins to review', async () => {
    const { user, admin } = setup('/events/evt-almaty-nights', 'usr-attendee');
    await user.click(await screen.findByRole('button', { name: 'Report this event' }));
    const dialog = screen.getByRole('dialog', { name: 'Report this event' });
    await user.selectOptions(within(dialog).getByLabelText('Reason'), 'Suspected fraud');
    await user.type(within(dialog).getByLabelText('Details (optional)'), 'Same event listed twice with different prices.');
    await user.click(within(dialog).getByRole('button', { name: 'Send report' }));
    expect(await screen.findByText('Thanks, your report was sent to BiletFlow moderators.')).toBeInTheDocument();

    sessionStorage.setItem('biletflow.mockSession', 'usr-admin');
    const [latest] = await admin.listReports();
    expect(latest).toMatchObject({ reason: 'fraud', reporter: { email: 'attendee@demo.kz' }, status: 'open' });
  });
});

describe('toCsv', () => {
  it('quotes cells that need it and adds a BOM for Excel', () => {
    expect(toCsv([['a', 'b,c'], ['Алматы', 'say "hi"']])).toBe('﻿a,"b,c"\r\nАлматы,"say ""hi"""\r\n');
  });
});
