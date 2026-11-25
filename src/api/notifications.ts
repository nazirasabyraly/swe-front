/*
 * In-app notifications (SRS 4.10, 4.13). Contract: docs/backend-contract.md, "Notifications".
 * Email delivery is the server's job; the web app shows the in-app copy and marks it read.
 */
import { json, request } from './http';

export type NotificationType =
  | 'order_confirmed'
  | 'payment_failed'
  | 'event_updated'
  | 'event_cancelled'
  | 'refund_completed'
  | 'payout_status'
  | 'support_reply'
  | 'support_assigned'
  | 'support_status';

export interface AppNotification {
  id: string;
  type: NotificationType;
  /** Already localized by the server (Accept-Language). */
  title: string;
  body: string;
  /** In-app path to open, e.g. "/support/sc_1". */
  link: string | null;
  read: boolean;
  createdAt: Date;
}

export interface NotificationsApi {
  listNotifications(): Promise<AppNotification[]>;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;
}

type NotificationDto = Omit<AppNotification, 'createdAt'> & { createdAt: string };

export const httpNotificationsApi: NotificationsApi = {
  async listNotifications() {
    return (await request<NotificationDto[]>('/api/me/notifications')).map((n) => ({ ...n, createdAt: new Date(n.createdAt) }));
  },
  async markRead(id) {
    await request(`/api/me/notifications/${encodeURIComponent(id)}`, json('PATCH', { read: true }));
  },
  async markAllRead() {
    await request('/api/me/notifications/read-all', { method: 'POST' });
  },
};
