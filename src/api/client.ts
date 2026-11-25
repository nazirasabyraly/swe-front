import { httpAdminApi, type AdminApi } from './admin';
import { httpAuthApi, type AuthApi } from './auth';
import { httpCampaignsApi, type CampaignsApi } from './campaigns';
import { httpCheckoutApi, type CheckoutApi } from './checkout';
import { USE_MOCKS } from './config';
import { httpEventsApi, type EventsApi } from './events';
import { mockApiClient } from './mocks';
import { httpNotificationsApi, type NotificationsApi } from './notifications';
import { httpOrdersApi, type OrdersApi } from './orders';
import { httpOrganizerApi, type OrganizerApi } from './organizer';
import { httpPaidSalesApi, type PaidSalesApi } from './paidSales';
import { httpPublicEventsApi, type PublicEventsApi } from './publicEvents';
import { httpSeatingApi, type SeatingApi } from './seating';
import { httpSupportApi, type SupportApi } from './support';
import { httpTicketTypesApi, type TicketTypesApi } from './ticketTypes';

/** Every backend API the web app talks to. Add new APIs here. */
export interface ApiClient {
  auth: AuthApi;
  events: EventsApi;
  ticketTypes: TicketTypesApi;
  paidSales: PaidSalesApi;
  campaigns: CampaignsApi;
  publicEvents: PublicEventsApi;
  checkout: CheckoutApi;
  orders: OrdersApi;
  support: SupportApi;
  notifications: NotificationsApi;
  organizer: OrganizerApi;
  admin: AdminApi;
  seating: SeatingApi;
}

export const httpApiClient: ApiClient = {
  auth: httpAuthApi,
  events: httpEventsApi,
  ticketTypes: httpTicketTypesApi,
  paidSales: httpPaidSalesApi,
  campaigns: httpCampaignsApi,
  publicEvents: httpPublicEventsApi,
  checkout: httpCheckoutApi,
  orders: httpOrdersApi,
  support: httpSupportApi,
  notifications: httpNotificationsApi,
  organizer: httpOrganizerApi,
  admin: httpAdminApi,
  seating: httpSeatingApi,
};

export const defaultApiClient: ApiClient = USE_MOCKS ? mockApiClient : httpApiClient;
