import { useCallback, useEffect, useState } from 'react';
import { useEventsApi } from '../../api/EventsApiContext';
import type { OrganizerEvent } from '../../api/events';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; events: OrganizerEvent[] };

/** Loads the signed-in organizer's events, soonest first. */
export function useMyEvents() {
  const api = useEventsApi();
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    api.listMyEvents().then(
      (events) => {
        if (cancelled) return;
        const sorted = [...events].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
        setState({ status: 'ready', events: sorted });
      },
      (err: unknown) => {
        if (cancelled) return;
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Could not load your events.',
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(load, [load]);

  /** Replaces one event in place, e.g. after it was published. */
  const replaceEvent = useCallback((updated: OrganizerEvent) => {
    setState((s) =>
      s.status === 'ready'
        ? { ...s, events: s.events.map((e) => (e.id === updated.id ? updated : e)) }
        : s,
    );
  }, []);

  return { state, reload: load, replaceEvent };
}
