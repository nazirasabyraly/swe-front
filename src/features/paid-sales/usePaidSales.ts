import { useCallback, useEffect, useState } from 'react';
import { usePaidSalesApi } from '../../api/ApiContext';
import { useDescribeError } from '../../api/errors';
import type { PaidSalesStatus } from '../../api/paidSales';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; paidSales: PaidSalesStatus };

/** Loads an event's paid-sales activation status. `set` stores the status a mutation returned. */
export function usePaidSales(eventId: string) {
  const api = usePaidSalesApi();
  const describeError = useDescribeError();
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    api.getPaidSales(eventId).then(
      (paidSales) => !cancelled && setState({ status: 'ready', paidSales }),
      (err: unknown) => !cancelled && setState({ status: 'error', message: describeError(err) }),
    );
    return () => {
      cancelled = true;
    };
  }, [api, eventId, describeError]);

  useEffect(load, [load]);

  const set = useCallback((paidSales: PaidSalesStatus) => setState({ status: 'ready', paidSales }), []);
  return { state, reload: load, set };
}
