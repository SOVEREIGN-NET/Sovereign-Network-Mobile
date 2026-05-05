/**
 * useNetworkTopology — live view of the validator + gateway topology.
 *
 * Polls `/api/v1/network/directory` every 10 s by default; pauses when
 * the app is backgrounded (the `AppState` check keeps the phone from
 * draining the radio). Exposes loading / error / stale markers so the
 * UI can show a refresh ring + retry button without the consumer
 * writing its own polling loop.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import networkTopologyService from '../services/NetworkTopologyService';
import type { NetworkTopologyResponse } from '../types/networkTopology';

/** Poll interval in ms. 10s matches the server-side refresh cadence. */
const DEFAULT_POLL_MS = 10_000;
const STALE_AFTER_MS = 3 * DEFAULT_POLL_MS;

export interface UseNetworkTopologyResult {
  data: NetworkTopologyResponse | null;
  loading: boolean;
  error: Error | null;
  fetchedAt: number | null;
  stale: boolean;
  refetch: () => void;
}

export function useNetworkTopology(
  pollMs: number = DEFAULT_POLL_MS,
): UseNetworkTopologyResult {
  const [data, setData] = useState<NetworkTopologyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const mountedRef = useRef(true);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const load = useCallback(async () => {
    if (appStateRef.current !== 'active') return;
    setLoading(true);
    try {
      const fresh = await networkTopologyService.fetchTopology();
      if (!mountedRef.current) return;
      if (fresh) {
        setData(fresh);
        setFetchedAt(Date.now());
        setError(null);
      } else {
        setError(new Error('Failed to load network topology'));
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // Fire once on mount, then on a fixed interval.
  useEffect(() => {
    mountedRef.current = true;
    load();
    const id = setInterval(load, pollMs);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [load, pollMs]);

  // Pause polling in background — resume with an immediate fetch on
  // foreground so the user sees fresh data as soon as they switch back.
  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (prev !== 'active' && next === 'active') {
        load();
      }
    });
    return () => sub.remove();
  }, [load]);

  const stale =
    fetchedAt == null ? true : Date.now() - fetchedAt > STALE_AFTER_MS;

  return { data, loading, error, fetchedAt, stale, refetch: load };
}
