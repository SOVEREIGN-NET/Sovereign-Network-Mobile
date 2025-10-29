import { useState, useEffect, useCallback, useRef } from 'react';

export interface UseAsyncDataState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

export interface UseAsyncDataReturn<T> extends UseAsyncDataState<T> {
  retry: () => void;
  reset: () => void;
}

/**
 * Custom hook for handling async data fetching
 *
 * Replaces the duplicated loading pattern found in all 5 screens
 *
 * @param asyncFunction - Function that performs the async operation
 * @param dependencies - Array of dependencies to trigger re-fetch (default: [])
 * @param initialData - Initial data value (default: null)
 * @returns Object with data, loading, error state and retry function
 *
 * @example
 * const { data, loading, error, retry } = useAsyncData(
 *   async () => {
 *     const response = await fetchData();
 *     return response;
 *   },
 *   []
 * );
 */
export function useAsyncData<T>(
  asyncFunction: () => Promise<T>,
  dependencies: any[] = [],
  initialData: T | null = null,
): UseAsyncDataReturn<T> {
  const [state, setState] = useState<UseAsyncDataState<T>>({
    data: initialData,
    loading: true,
    error: null,
  });

  const [retryCount, setRetryCount] = useState(0);

  // Store the async function in a ref to avoid causing the effect to re-run
  // when the function is redefined on each render
  const asyncFunctionRef = useRef(asyncFunction);

  useEffect(() => {
    asyncFunctionRef.current = asyncFunction;
  }, [asyncFunction]);

  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      setState(prev => ({ ...prev, loading: true, error: null }));
      try {
        const result = await asyncFunctionRef.current();
        if (mounted) {
          setState({
            data: result,
            loading: false,
            error: null,
          });
        }
      } catch (error) {
        if (mounted) {
          setState({
            data: null,
            loading: false,
            error: error instanceof Error ? error : new Error('Unknown error occurred'),
          });
        }
      }
    };

    fetchData();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, retryCount]);

  const retry = useCallback(() => {
    setRetryCount(prev => prev + 1);
  }, []);

  const reset = useCallback(() => {
    setState({
      data: initialData,
      loading: false,
      error: null,
    });
    setRetryCount(0);
  }, [initialData]);

  return {
    ...state,
    retry,
    reset,
  };
}
