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
}

export function usePoUW(): UsePoUWResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
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
  };
}

export default usePoUW;
