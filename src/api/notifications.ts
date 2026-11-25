/*
 * In-app notifications (SRS 4.10, 4.13). Backend: GET /me/notifications,
 * POST /me/notifications/:id/read. Email delivery is the server's job.
 *
 * The backend sends `{ type, payload: { subject, link, ...context }, read_at }`: the subject is
 * the (already localized) title, and the link is a full web URL, turned into an in-app path here.
 * There's no "mark all read" endpoint, so each unread notification is marked in turn.
 */
import { request, type Page } from './http';

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

interface NotificationDto {
  id: string;
  type: NotificationType;
  payload: { subject?: string; body?: string; link?: string | null };
  readAt: string | null;
  createdAt: string;
}

function inAppPath(link: string | null | undefined): string | null {
  if (!link) return null;
  try {
    const url = new URL(link, window.location.origin);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

const fromDto = (n: NotificationDto): AppNotification => ({
  id: n.id,
  type: n.type,
  title: n.payload.subject ?? '',
  body: n.payload.body ?? '',
  link: inAppPath(n.payload.link),
  read: n.readAt !== null,
  createdAt: new Date(n.createdAt),
});

const markRead = async (id: string) => {
  await request(`/me/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' });
};

export const httpNotificationsApi: NotificationsApi = {
  async listNotifications() {
    return (await request<Page<NotificationDto>>('/me/notifications?limit=50')).items.map(fromDto);
  },
  markRead,
  async markAllRead() {
    const unread = await request<Page<NotificationDto>>('/me/notifications?unread=true&limit=100');
    await Promise.all(unread.items.map((n) => markRead(n.id)));
  },
};
