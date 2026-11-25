import type { ApiClient } from '../client';
import { createMockAuthApi } from './mockAuth';
import { createMockCampaignsApi } from './mockCampaigns';
import { createMockCheckoutApi } from './mockCheckout';
import { createMockEventsApi } from './mockEvents';
import { createMockNotificationsApi } from './mockNotifications';
import { createMockOrdersApi } from './mockOrders';
import { createMockOrganizerApi, withEventSideEffects } from './mockOrganizer';
import { createMockSupportApi } from './mockSupport';
import { createMockSeatingApi } from './mockSeating';
import { createMockPaidSalesApi } from './mockPaidSales';
import { createMockModeration, createMockPublicEventsApi } from './mockPublicEvents';
import { createMockAdminApi } from './mockAdmin';
import { createMockTicketTypesApi } from './mockTicketTypes';

function createMockApiClient(): ApiClient {
  const events = createMockEventsApi();
  const ticketTypes = createMockTicketTypesApi(events);
  const moderation = createMockModeration();
  const paidSales = createMockPaidSalesApi(events, undefined, () => moderation.settings.activationFee);
  const campaigns = createMockCampaignsApi(events);
  const publicEvents = createMockPublicEventsApi({ events, ticketTypes, paidSales, campaigns, moderation });
  const orders = createMockOrdersApi(events);
  const notifications = createMockNotificationsApi();
  const seating = createMockSeatingApi({ events, ticketTypes });
  const organizer = createMockOrganizerApi({ events, ticketTypes, campaigns, orders, notifications });
  return {
    auth: createMockAuthApi(),
    events: withEventSideEffects(events, organizer, ticketTypes),
    organizer,
    seating,
    admin: createMockAdminApi({ events, paidSales, campaigns, orders, organizer, moderation }),
    ticketTypes,
    paidSales,
    campaigns,
    publicEvents,
    checkout: createMockCheckoutApi({ publicEvents, ticketTypes, campaigns, orders, notifications, seating }),
    orders,
    notifications,
    support: createMockSupportApi({ events, orders, notifications }),
  };
}

// Pure so production builds (VITE_USE_MOCKS unset) tree-shake all mock code and seed data.
export const mockApiClient: ApiClient = /* @__PURE__ */ createMockApiClient();
