import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persistent, polling data hook tailored to the oracle screens.
 *
 * Behaviour differs from `useAsyncData` in three important ways:
 *
 *   1. Disk-backed cache. On mount we read the last-known value from
 *      AsyncStorage under `cacheKey` and surface it *immediately*, so the
 *      screen never renders a placeholder while a QUIC handshake + public
 *      fetch round-trip. The value is marked `stale: true` until a fresh
 *      fetch confirms it.
 *
 *   2. Background polling. We re-fetch every `intervalMs` without ever
 *      blanking `data`. While a fetch is in flight we expose `loading`
 *      without dropping `data`, so the caller can render a subtle
 *      indicator (see `RefreshRing`) on top of the last-known value.
 *
 *   3. Graceful degradation. Errors don't discard cached data — they set
 *      `error` and `stale = true`. The screen keeps showing the last
 *      value with a warning badge instead of flipping to an error card.
 *
 * The hook intentionally keeps a single source of truth per `cacheKey`, so
 * multiple tabs sharing the same endpoint (e.g. SOV/USD price used by both
 * dashboard and oracle screen) can reuse the cache entry without fighting.
 */
export interface UseOracleDataResult<T> {
  /** Most recently known value, from disk on first render then from the
   *  network. `null` only when there has never been a successful fetch
   *  and nothing was in the cache. */
  data: T | null;
  /** True while a fetch is in flight. Does NOT imply `data` is absent. */
  loading: boolean;
  /** Last fetch error, cleared on success. Coexists with `data` when we
   *  degraded gracefully to the cache. */
  error: Error | null;
  /** True when `data` was loaded from disk or when the last fetch failed —
   *  i.e. the value on screen is not guaranteed to match the node's
   *  current view. Clears on the next successful fetch. */
  stale: boolean;
  /** Unix ms timestamp of the last successful fetch, null if never. */
  lastFetchedAt: number | null;
  /** Unix ms timestamp when the next auto-refetch will fire. */
  nextRefetchAt: number | null;
  /** Trigger an immediate refetch. Cancels the pending interval tick. */
  retry: () => void;
}

interface CacheEnvelope<T> {
  v: 1;
  fetchedAt: number;
  data: T;
}

const CACHE_NAMESPACE = 'oracle:v1:';

async function readCache<T>(key: string): Promise<CacheEnvelope<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_NAMESPACE + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (parsed?.v !== 1 || typeof parsed.fetchedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache<T>(key: string, data: T): Promise<void> {
  try {
    const envelope: CacheEnvelope<T> = { v: 1, fetchedAt: Date.now(), data };
    await AsyncStorage.setItem(CACHE_NAMESPACE + key, JSON.stringify(envelope));
  } catch {
    /* best-effort — cache failures must never surface to the user */
  }
}

export interface UseOracleDataOptions<T> {
  /** Stable key for the AsyncStorage entry. Include any pair/period
   *  parameters so different selections don't clobber each other. */
  cacheKey: string;
  /** Async loader. Thrown errors are captured into `error`. */
  fetcher: () => Promise<T>;
  /** Auto-refetch interval in ms. Defaults to 60s — matches the
   *  dashboard trending-tokens cadence. */
  intervalMs?: number;
  /** Re-run dependencies (e.g. selected pair). Change resets the
   *  interval and refires the fetch. */
  deps?: ReadonlyArray<unknown>;
}

export function useOracleData<T>(opts: UseOracleDataOptions<T>): UseOracleDataResult<T> {
  const { cacheKey, fetcher, intervalMs = 60_000, deps = [] } = opts;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [stale, setStale] = useState<boolean>(true);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  const [nextRefetchAt, setNextRefetchAt] = useState<number | null>(null);

  // Keep the latest fetcher in a ref so changing it between renders
  // doesn't cause the effect to re-fire — only `deps` does.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleNext = useCallback(() => {
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
    const at = Date.now() + intervalMs;
    setNextRefetchAt(at);
    intervalRef.current = setTimeout(() => {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      runFetch();
    }, intervalMs);
  }, [intervalMs]);

  const runFetch = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetcherRef.current();
      if (!mountedRef.current) return;
      setData(result);
      setError(null);
      setStale(false);
      const now = Date.now();
      setLastFetchedAt(now);
      writeCache(cacheKey, result);
    } catch (caught) {
      if (!mountedRef.current) return;
      const normalized =
        caught instanceof Error ? caught : new Error('Oracle fetch failed');
      setError(normalized);
      setStale(true);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        scheduleNext();
      }
    }
  }, [cacheKey, scheduleNext]);

  // Hydrate from disk cache on mount / when cacheKey changes, then fetch.
  useEffect(() => {
    let cancelled = false;

    // Reset visible state when the cache key rotates (e.g. pair change)
    // so we don't briefly show the wrong pair's data.
    setData(null);
    setLoading(true);
    setError(null);
    setStale(true);
    setLastFetchedAt(null);

    readCache<T>(cacheKey).then(entry => {
      if (cancelled || !mountedRef.current) return;
      if (entry) {
        setData(entry.data);
        setLastFetchedAt(entry.fetchedAt);
        // Keep stale=true until the next fetch confirms.
      }
    });

    runFetch();

    return () => {
      cancelled = true;
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, ...deps]);

  const retry = useCallback(() => {
    runFetch();
  }, [runFetch]);

  return {
    data,
    loading,
    error,
    stale,
    lastFetchedAt,
    nextRefetchAt,
    retry,
  };
}
