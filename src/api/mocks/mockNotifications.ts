import type { AppNotification, NotificationsApi } from '../notifications';
import { mockSessionUserId } from './mockAuth';
import { mockDelay, mockError, mockId } from './util';

export interface MockNotificationsApi extends NotificationsApi {
  /** Mock-only: what the server does when something happens that a user should hear about. */
  notify(userId: string, n: Pick<AppNotification, 'type' | 'title' | 'body' | 'link'>): void;
}

export function createMockNotificationsApi(): MockNotificationsApi {
  const byUser = new Map<string, AppNotification[]>();
  const mine = () => {
    const userId = mockSessionUserId();
    if (!userId) throw mockError(401, 'unauthenticated', 'Sign in first.');
    return byUser.get(userId) ?? [];
  };
  return {
    async listNotifications() {
      await mockDelay(100);
      return structuredClone(mine());
    },
    async markRead(id) {
      await mockDelay(50);
      const found = mine().find((n) => n.id === id);
      if (found) found.read = true;
    },
    async markAllRead() {
      await mockDelay(50);
      mine().forEach((n) => (n.read = true));
    },
    notify(userId, n) {
      byUser.set(userId, [{ ...n, id: mockId('ntf'), read: false, createdAt: new Date() }, ...(byUser.get(userId) ?? [])]);
    },
  };
}
