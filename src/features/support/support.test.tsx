import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMockEventsApi } from '../../api/mocks/mockEvents';
import { createMockNotificationsApi } from '../../api/mocks/mockNotifications';
import { createMockOrdersApi } from '../../api/mocks/mockOrders';
import { createMockSupportApi } from '../../api/mocks/mockSupport';
import { renderApp } from '../../test/renderApp';

function setup(path: string, userId: string) {
  sessionStorage.clear();
  sessionStorage.setItem('biletflow.mockSession', userId);
  const events = createMockEventsApi();
  const orders = createMockOrdersApi(events);
  const notifications = createMockNotificationsApi();
  const support = createMockSupportApi({ events, orders, notifications });
  renderApp(path, { events, orders, notifications, support });
  return { user: userEvent.setup(), notifications, support };
}

const location = () => screen.getByTestId('location').textContent ?? '';

describe('support', () => {
  it('opens a case from a ticket with its context attached', async () => {
    const { user } = setup('/tickets/TK-3HWP-8RNA', 'usr-attendee');
    await user.click(await screen.findByRole('link', { name: 'Get help' }));

    expect(await screen.findByRole('heading', { name: 'Get help', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('Included with your requestTK-3HWP-8RNA · Almaty Nights — Vol. 4');

    await user.click(screen.getByRole('button', { name: 'Send request' }));
    expect(screen.getByLabelText('What is it about?')).toHaveFocus();
    expect(screen.getByText('Write a message.')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('What is it about?'), 'Seating');
    await user.type(screen.getByLabelText('Subject'), 'Can we sit together?');
    await user.type(screen.getByLabelText('Message'), 'We have two tickets in different sections.');
    await user.click(screen.getByRole('button', { name: 'Send request' }));

    expect(await screen.findByRole('heading', { name: 'Can we sit together?', level: 1 })).toBeInTheDocument();
    expect(location()).toMatch(/^\/support\/sc-/);
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('BF-NGT4A2')).toBeInTheDocument();
    expect(screen.getByText('TK-3HWP-8RNA')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Almaty Nights — Vol. 4' })).toBeInTheDocument();
    expect(screen.getByText('We have two tickets in different sections.')).toBeInTheDocument();
    // Requesters don't get staff controls.
    expect(screen.queryByRole('form', { name: 'Manage case' })).not.toBeInTheDocument();
  });

  it('lets the organizer reply, change status and assign; the attendee is notified', async () => {
    const { user, notifications } = setup('/support', 'usr-organizer');
    const managed = await screen.findByRole('region', { name: 'Cases to handle' });
    await user.click(await within(managed).findByRole('link', { name: 'VIP ticket email never arrived' }));

    expect(await screen.findByRole('heading', { name: 'VIP ticket email never arrived', level: 1 })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Your reply'), 'Re-sent just now, please check spam too.');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Re-sent just now, please check spam too.')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Status'), 'Waiting for customer');
    await user.selectOptions(screen.getByLabelText('Assigned to'), 'Demo Admin');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(screen.getAllByText('Waiting for customer').length).toBeGreaterThan(0);

    sessionStorage.setItem('biletflow.mockSession', 'usr-attendee');
    const inbox = await notifications.listNotifications();
    expect(inbox.map((n) => n.type)).toEqual(['support_status', 'support_reply']);
    expect(inbox[0].link).toBe('/support/sc-1001');
  });

  it('keeps cases private to their requester and staff', async () => {
    setup('/support/sc-1002', 'usr-attendee');
    expect(await screen.findByRole('alert')).toHaveTextContent('Support case not found.');
  });

  it('routes organizer requests to platform support with organizer topics', async () => {
    const { user } = setup('/support', 'usr-organizer');
    await user.click(await screen.findByRole('link', { name: 'Contact BiletFlow support' }));
    const topics = within(await screen.findByLabelText('What is it about?')).getAllByRole('option').map((o) => o.textContent);
    expect(topics).toEqual(['Choose a topic', 'Account', 'Paid-sales activation', 'Payment', 'Technical problem']);
  });

  it('shows platform admins every case to handle', async () => {
    setup('/support', 'usr-admin');
    const managed = await screen.findByRole('region', { name: 'Cases to handle' });
    await waitFor(() => expect(within(managed).getAllByRole('listitem')).toHaveLength(2));
  });
});
