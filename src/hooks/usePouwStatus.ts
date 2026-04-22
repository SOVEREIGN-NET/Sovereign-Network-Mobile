import { useOracleData } from './useOracleData';
import type { UseOracleDataResult } from './useOracleData';
import {
  fetchPouwStatus,
  PouwStatusResponse,
} from '../services/PouwStatusService';

/**
 * PoUW status polling hook.
 *
 * Same transport, same cache/polling machinery as the oracle price
 * views (see `useOracleData`): disk cache hydrates on mount so the
 * card renders without flashing blank, the background poll refreshes
 * every 60s (matching the oracle cadence recommended by the endpoint
 * spec), and errors degrade gracefully by keeping the last value
 * visible with `stale = true`.
 */
const POUW_POLL_MS = 60_000;

export function usePouwStatus(): UseOracleDataResult<PouwStatusResponse> {
  return useOracleData<PouwStatusResponse>({
    cacheKey: 'pouw:status',
    fetcher: () => fetchPouwStatus(),
    intervalMs: POUW_POLL_MS,
  });
}
