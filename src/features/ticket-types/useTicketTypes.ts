import { useCallback, useEffect, useState } from 'react';
import { useTicketTypesApi } from '../../api/ApiContext';
import { useDescribeError } from '../../api/errors';
import type { TicketType } from '../../api/ticketTypes';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; types: TicketType[] };

/** Loads an event's ticket types and keeps the list in sync with local changes. */
export function useTicketTypes(eventId: string) {
  const api = useTicketTypesApi();
  const describeError = useDescribeError();
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    api.listTicketTypes(eventId).then(
      (types) => !cancelled && setState({ status: 'ready', types }),
      (err: unknown) => !cancelled && setState({ status: 'error', message: describeError(err) }),
    );
    return () => {
      cancelled = true;
    };
  }, [api, eventId, describeError]);

  useEffect(load, [load]);

  const update = useCallback((change: (types: TicketType[]) => TicketType[]) => {
    setState((s) => (s.status === 'ready' ? { ...s, types: change(s.types) } : s));
  }, []);

  return {
    state,
    reload: load,
    upsert: (type: TicketType) =>
      update((types) =>
        types.some((t) => t.id === type.id) ? types.map((t) => (t.id === type.id ? type : t)) : [...types, type],
      ),
    remove: (id: string) => update((types) => types.filter((t) => t.id !== id)),
  };
}
