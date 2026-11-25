import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMockNotificationsApi } from '../api/mocks/mockNotifications';
import { renderApp } from '../test/renderApp';

describe('notifications bell', () => {
  it('shows the unread count, opens a notification and marks everything read', async () => {
    sessionStorage.clear();
    sessionStorage.setItem('biletflow.mockSession', 'usr-attendee');
    const notifications = createMockNotificationsApi();
    notifications.notify('usr-attendee', { type: 'support_reply', title: 'New reply on SC-1001', body: 'VIP ticket email', link: '/support/sc-1001' });
    notifications.notify('usr-attendee', { type: 'refund_completed', title: 'Refund for BF-1', body: 'Processed', link: '/account/orders' });
    const user = userEvent.setup();
    renderApp('/account', { notifications });

    const bell = await screen.findByRole('button', { name: 'Notifications, 2 unread' });
    await user.click(bell);
    const panel = screen.getByRole('region', { name: 'Notifications' });
    await user.click(within(panel).getByRole('button', { name: /New reply on SC-1001/ }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/support/sc-1001'));
    expect(await screen.findByRole('button', { name: 'Notifications, 1 unread' })).toHaveAttribute('aria-expanded', 'false');

    await user.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }));
    await user.click(screen.getByRole('button', { name: 'Mark all as read' }));
    expect(await screen.findByRole('button', { name: 'Notifications, 0 unread' })).toBeInTheDocument();
  });

  it('isn’t shown when signed out', async () => {
    sessionStorage.clear();
    renderApp('/');
    await screen.findByRole('heading', { name: 'Discover events' });
    expect(screen.queryByRole('button', { name: /^Notifications/ })).not.toBeInTheDocument();
  });
});
