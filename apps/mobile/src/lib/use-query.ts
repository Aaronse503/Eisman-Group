import * as React from 'react';
import { ApiClientError } from '@eisman/api-client';
import { withCache } from './cache';

/**
 * Fetch, with the last answer kept on the device.
 *
 * When the request fails and something was cached, that is shown and marked as
 * saved rather than presented as current. When nothing was cached, the error
 * is shown plainly. Figures are never invented to fill a gap.
 */
export interface QueryState<T> {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  /** True when what is on screen came from the device, not the server. */
  stale: boolean;
  fetchedAt: Date | null;
  refresh: () => Promise<void>;
}

export function useQuery<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
  deps: React.DependencyList = [],
): QueryState<T> {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [stale, setStale] = React.useState(false);
  const [fetchedAt, setFetchedAt] = React.useState<Date | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = React.useCallback(fetcher, deps);

  const load = React.useCallback(
    async (isRefresh: boolean) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const result = await withCache(cacheKey, run);
        setData(result.data);
        setStale(result.stale);
        setFetchedAt(result.at);
      } catch (err) {
        setError(
          err instanceof ApiClientError
            ? err.isOffline
              ? 'No connection, and nothing saved on this device yet.'
              : err.message
            : 'Could not load this.',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [cacheKey, run],
  );

  React.useEffect(() => {
    void load(false);
  }, [load]);

  return {
    data,
    loading,
    refreshing,
    error,
    stale,
    fetchedAt,
    refresh: () => load(true),
  };
}
