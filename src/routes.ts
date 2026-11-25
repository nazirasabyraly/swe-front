/** Every route path in one place. */
export const paths = {
  home: '/',
  publicEvent: (id: string) => `/events/${encodeURIComponent(id)}`,
  /** Starts checkout: creates the reservation, then moves to `checkout`. `items` from selection.encodeItems. */
  checkoutStart: (eventId: string, items: string, promoCode: string | null) =>
    `/events/${encodeURIComponent(eventId)}/checkout?items=${encodeURIComponent(items)}${
      promoCode ? `&promo=${encodeURIComponent(promoCode)}` : ''
    }`,
  checkout: (reservationId: string) => `/checkout/${encodeURIComponent(reservationId)}`,
  myOrders: '/account/orders',
  myTickets: '/account/tickets',
  order: (id: string) => `/orders/${encodeURIComponent(id)}`,
  ticket: (id: string) => `/tickets/${encodeURIComponent(id)}`,
  admin: '/admin',
  support: '/support',
  supportCase: (id: string) => `/support/${encodeURIComponent(id)}`,
  /** New support case, pre-filled with whatever context the page has (SRS 4.13). */
  newSupportCase: (context: { kind?: 'attendee' | 'organizer'; event?: string; order?: string; ticket?: string; about?: string } = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(context)) if (value) params.set(key, value);
    const query = params.toString();
    return `/support/new${query ? `?${query}` : ''}`;
  },
  signIn: '/sign-in',
  register: '/register',
  checkEmail: '/register/check-email',
  verifyEmail: '/verify-email',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  account: '/account',
  organizerEvents: '/organizer/events',
  organizerNewEvent: '/organizer/events/new',
  organizerEvent: (id: string) => `/organizer/events/${encodeURIComponent(id)}`,
  organizerEventOrders: (id: string) => `/organizer/events/${encodeURIComponent(id)}/orders`,
  organizerEventStaff: (id: string) => `/organizer/events/${encodeURIComponent(id)}/staff`,
  organizerEventTimeline: (id: string) => `/organizer/events/${encodeURIComponent(id)}/timeline`,
  organizerProfile: '/organizer/profile',
  organizerEditEvent: (id: string) => `/organizer/events/${encodeURIComponent(id)}/edit`,
  organizerEventTickets: (id: string) => `/organizer/events/${encodeURIComponent(id)}/tickets`,
  organizerEventCampaigns: (id: string) => `/organizer/events/${encodeURIComponent(id)}/campaigns`,
  organizerEventPaidSales: (id: string) => `/organizer/events/${encodeURIComponent(id)}/paid-sales`,
  /** Create-event wizard steps for a saved draft (step 1 for a new event is organizerNewEvent). */
  organizerEventSetup: (id: string, step: 'details' | 'tickets' | 'activation' | 'review') =>
    `/organizer/events/${encodeURIComponent(id)}/setup/${step}`,
} as const;

/**
 * Only same-app paths are allowed as post-sign-in destinations, so a crafted
 * `?next=https://evil.example` or `//evil.example` can't redirect off-site.
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return null;
  return next;
}
