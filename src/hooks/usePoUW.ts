import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_SOV_NODE_URL } from '../config';
import { PoUWController } from '../lib-client-react-native-js';

export interface UsePoUWResult {
  verifyContent: (
    contentId: Uint8Array,
    bytes: Uint8Array,
    providerId?: Uint8Array,
  ) => Promise<void>;
  flush: () => Promise<void>;
  getPendingCount: () => Promise<number>;
  isAvailable: boolean;
  error: Error | null;
  isLoading: boolean;
  /** Unix timestamp (seconds) when this identity becomes eligible for PoUW rewards.
   *  Null means the identity is already eligible (no maturation pending). */
  maturesAt: number | null;
}

/**
 * Extract maturation timing from a server error response body.
 * Returns { ageSecs, requiredSecs } when the error indicates the identity is
 * too new to claim PoUW rewards, null otherwise.
 */
function extractMaturationInfo(
  error: unknown,
): { ageSecs: number; requiredSecs: number } | null {
  const body = (error as any)?.body;
  if (!body || typeof body !== 'object') return null;

  const obj = body as Record<string, unknown>;

  // Top-level: { age_secs, required_secs }
  if (typeof obj.age_secs === 'number' && typeof obj.required_secs === 'number') {
    return { ageSecs: obj.age_secs, requiredSecs: obj.required_secs };
  }

  // Nested in rejected receipts: [{ ..., age_secs, required_secs }]
  if (Array.isArray(obj.rejected)) {
    for (const r of obj.rejected) {
      if (r && typeof r === 'object') {
        const rObj = r as Record<string, unknown>;
        if (
          typeof rObj.age_secs === 'number' &&
          typeof rObj.required_secs === 'number'
        ) {
          return { ageSecs: rObj.age_secs, requiredSecs: rObj.required_secs };
        }
      }
    }
  }

  return null;
}

export function usePoUW(): UsePoUWResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [maturesAt, setMaturesAt] = useState<number | null>(null);
  const mountedRef = useRef(true);

  const controller = useMemo(
    () => PoUWController.getInstance({ nodeApiBase: DEFAULT_SOV_NODE_URL }),
    [],
  );

  useEffect(() => {
    mountedRef.current = true;
    controller.start().catch(e => {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e : new Error(String(e)));
    });
    return () => {
      mountedRef.current = false;
    };
  }, [controller]);

  const verifyContent = useCallback(async (): Promise<void> => {
    throw new Error(
      'Direct verifyContent is unsupported in canonical PoUW path. Use recordWeb4* events.',
    );
  }, []);

  const flush = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      await controller.flush();
      // Success — identity is eligible, clear any pending maturation state
      if (mountedRef.current) setMaturesAt(null);
    } catch (e) {
      if (mountedRef.current) {
        const info = extractMaturationInfo(e);
        if (info) {
          const remainingSecs = info.requiredSecs - info.ageSecs;
          setMaturesAt(Math.floor(Date.now() / 1000) + remainingSecs);
        }
      }
      throw e;
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [controller]);

  const getPendingCount = useCallback(async (): Promise<number> => {
    return controller.pendingCount;
  }, [controller]);

  return {
    verifyContent,
    flush,
    getPendingCount,
    isAvailable: true,
    error,
    isLoading,
    maturesAt,
  };
}

export default usePoUW;
