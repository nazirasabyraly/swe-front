import { createContext, useContext, type ReactNode } from 'react';
import { httpEventsApi, type EventsApi } from './events';

const EventsApiContext = createContext<EventsApi>(httpEventsApi);

/** Lets tests (or a future mock backend) swap the API implementation. */
export function EventsApiProvider({ api, children }: { api: EventsApi; children: ReactNode }) {
  return <EventsApiContext.Provider value={api}>{children}</EventsApiContext.Provider>;
}

export function useEventsApi(): EventsApi {
  return useContext(EventsApiContext);
}
