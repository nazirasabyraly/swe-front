import { useCallback, useEffect, useState } from 'react';
import { useEventsApi } from '../../api/ApiContext';
import { useDescribeError } from '../../api/errors';
import type { OrganizerEvent } from '../../api/events';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; event: OrganizerEvent };

export function useOrganizerEvent(id: string) {
  const api = useEventsApi();
  const describeError = useDescribeError();
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    api.getEvent(id).then(
      (event) => !cancelled && setState({ status: 'ready', event }),
      (err: unknown) => !cancelled && setState({ status: 'error', message: describeError(err) }),
    );
    return () => {
      cancelled = true;
    };
  }, [api, id, describeError]);

  useEffect(load, [load]);
  return { state, reload: load };
}
