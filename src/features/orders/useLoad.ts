import { useCallback, useEffect, useState, type DependencyList } from 'react';
import { useDescribeError } from '../../api/errors';

export type LoadState<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T };

/** Loads data once per `deps` change; only the latest response is kept. */
export function useLoad<T>(fetcher: () => Promise<T>, deps: DependencyList) {
  const describeError = useDescribeError();
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' });

  // `deps` lists what `fetcher` reads, like useEffect deps.
  const load = useCallback(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    fetcher().then(
      (data) => !cancelled && setState({ status: 'ready', data }),
      (err: unknown) => !cancelled && setState({ status: 'error', message: describeError(err) }),
    );
    return () => {
      cancelled = true;
    };
  }, [...deps, describeError]);

  useEffect(load, [load]);
  return { state, reload: load };
}
