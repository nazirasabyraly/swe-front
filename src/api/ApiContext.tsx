import { createContext, useContext, type ReactNode } from 'react';
import { defaultApiClient, type ApiClient } from './client';

const ApiContext = createContext<ApiClient>(defaultApiClient);

/** Supplies the API client; tests pass fakes, the app uses the default (HTTP or mocks). */
export function ApiProvider({ api, children }: { api: ApiClient; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export const useApi = (): ApiClient => useContext(ApiContext);
export const useEventsApi = () => useApi().events;
export const useAuthApi = () => useApi().auth;
export const useTicketTypesApi = () => useApi().ticketTypes;
export const usePaidSalesApi = () => useApi().paidSales;
export const useCampaignsApi = () => useApi().campaigns;
export const usePublicEventsApi = () => useApi().publicEvents;
export const useCheckoutApi = () => useApi().checkout;
export const useOrdersApi = () => useApi().orders;
export const useSupportApi = () => useApi().support;
export const useNotificationsApi = () => useApi().notifications;
export const useOrganizerApi = () => useApi().organizer;
export const useAdminApi = () => useApi().admin;
export const useSeatingApi = () => useApi().seating;
