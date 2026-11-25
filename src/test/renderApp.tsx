import { render } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { ApiProvider } from '../api/ApiContext';
import type { ApiClient } from '../api/client';
import { createMockAuthApi } from '../api/mocks/mockAuth';
import { createMockCampaignsApi, type MockCampaignsApi } from '../api/mocks/mockCampaigns';
import { createMockCheckoutApi } from '../api/mocks/mockCheckout';
import { createMockEventsApi } from '../api/mocks/mockEvents';
import { createMockNotificationsApi, type MockNotificationsApi } from '../api/mocks/mockNotifications';
import { createMockOrdersApi, type MockOrdersApi } from '../api/mocks/mockOrders';
import { createMockOrganizerApi, withEventSideEffects, type MockOrganizerApi } from '../api/mocks/mockOrganizer';
import { createMockSupportApi } from '../api/mocks/mockSupport';
import { createMockSeatingApi, type MockSeatingApi } from '../api/mocks/mockSeating';
import { createMockPaidSalesApi, type MockPaidSalesApi } from '../api/mocks/mockPaidSales';
import { createMockModeration, createMockPublicEventsApi, type MockModeration } from '../api/mocks/mockPublicEvents';
import { createMockAdminApi } from '../api/mocks/mockAdmin';
import { createMockTicketTypesApi, type MockTicketTypesApi } from '../api/mocks/mockTicketTypes';
import { App } from '../App';
import { AuthProvider } from '../auth/AuthContext';

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <div data-testid="location">{pathname + search}</div>;
}

/**
 * Mock API client for tests. Unseeded by default (no ticket types, campaigns or other
 * organizers' events) unless the caller passes its own APIs.
 */
export type TestApis = Partial<Omit<ApiClient, 'ticketTypes' | 'campaigns' | 'orders' | 'notifications' | 'organizer' | 'paidSales' | 'seating'>> & {
  paidSales?: MockPaidSalesApi;
  moderation?: MockModeration;
  organizer?: MockOrganizerApi;
  notifications?: MockNotificationsApi;
  seating?: MockSeatingApi;
  ticketTypes?: MockTicketTypesApi;
  campaigns?: MockCampaignsApi;
  orders?: MockOrdersApi;
};

export function createTestClient(api: TestApis = {}): ApiClient {
  const events = api.events ?? createMockEventsApi([]);
  const ticketTypes = api.ticketTypes ?? createMockTicketTypesApi(events, {});
  const paidSales = api.paidSales ?? createMockPaidSalesApi(events, []);
  const campaigns = api.campaigns ?? createMockCampaignsApi(events, {});
  const moderation = api.moderation ?? createMockModeration();
  const publicEvents = api.publicEvents ?? createMockPublicEventsApi({ events, ticketTypes, paidSales, campaigns, moderation }, []);
  const orders = api.orders ?? createMockOrdersApi(events, { seed: false });
  const notifications = api.notifications ?? createMockNotificationsApi();
  const seating = api.seating ?? createMockSeatingApi({ events, ticketTypes }, {});
  const organizer = api.organizer ?? createMockOrganizerApi({ events, ticketTypes, campaigns, orders, notifications });
  return {
    seating,
    organizer,
    admin: api.admin ?? createMockAdminApi({ events, paidSales, campaigns, orders, organizer, moderation }),
    orders,
    events: withEventSideEffects(events, organizer, ticketTypes),
    notifications,
    support: api.support ?? createMockSupportApi({ events, orders, notifications }),
    auth: api.auth ?? createMockAuthApi(),
    ticketTypes,
    paidSales,
    campaigns,
    publicEvents,
    checkout: api.checkout ?? createMockCheckoutApi({ publicEvents, ticketTypes, campaigns, orders, notifications, seating }),
  };
}

/** Renders the whole app (routes, guards, header) at `path` against mock APIs. */
export function renderApp(path: string, api: TestApis = {}) {
  const client = createTestClient(api);
  render(
    <ApiProvider api={client}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <App />
        </AuthProvider>
        <LocationProbe />
      </MemoryRouter>
    </ApiProvider>,
  );
  return client;
}
