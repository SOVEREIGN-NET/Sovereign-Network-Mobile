import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useAsyncData } from 'src/hooks';

describe('useAsyncData Hook', () => {
  describe('initial state', () => {
    it('should start with loading state', () => {
      const asyncFn = jest.fn(async () => 'data');
      const { result } = renderHook(() => useAsyncData(asyncFn, []));

      expect(result.current.loading).toBe(true);
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  describe('successful data fetch', () => {
    it('should fetch data successfully', async () => {
      const mockData = { id: 1, name: 'Test' };
      const asyncFn = jest.fn(async () => mockData);

      const { result } = renderHook(() => useAsyncData(asyncFn, []));

      // Wait for loading to complete
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual(mockData);
      expect(result.current.error).toBeNull();
      expect(asyncFn).toHaveBeenCalled();
    });

    it('should handle array data', async () => {
      const mockData = [{ id: 1 }, { id: 2 }];
      const asyncFn = jest.fn(async () => mockData);

      const { result } = renderHook(() => useAsyncData(asyncFn, []));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual(mockData);
      expect(Array.isArray(result.current.data)).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle errors', async () => {
      const error = new Error('Fetch failed');
      const asyncFn = jest.fn(async () => {
        throw error;
      });

      const { result } = renderHook(() => useAsyncData(asyncFn, []));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeDefined();
      expect(result.current.data).toBeNull();
    });

    it('should handle non-Error objects as errors', async () => {
      const asyncFn = jest.fn(async () => {
        throw 'string error';
      });

      const { result } = renderHook(() => useAsyncData(asyncFn, []));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeDefined();
    });
  });

  describe('retry functionality', () => {
    it('should retry on retry call', async () => {
      const asyncFn = jest.fn(async () => 'data');

      const { result } = renderHook(() => useAsyncData(asyncFn, []));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const callCount = asyncFn.mock.calls.length;

      await act(async () => {
        result.current.retry();
      });

      await waitFor(() => {
        expect(asyncFn.mock.calls.length).toBeGreaterThan(callCount);
      });
    });
  });

  describe('reset functionality', () => {
    it('should reset state', async () => {
      const asyncFn = jest.fn(async () => 'data');

      const { result } = renderHook(() => useAsyncData(asyncFn, []));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual('data');

      await act(async () => {
        result.current.reset();
      });

      expect(result.current.data).toBeNull();
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('dependencies', () => {
    it('should re-fetch when dependencies change', async () => {
      const asyncFn = jest.fn(async () => 'data');

      const { result, rerender } = renderHook(
        ({ deps }) => useAsyncData(asyncFn, deps),
        { initialProps: { deps: ['dep1'] } },
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const callCount = asyncFn.mock.calls.length;

      rerender({ deps: ['dep2'] });

      await waitFor(() => {
        expect(asyncFn.mock.calls.length).toBeGreaterThan(callCount);
      });
    });
  });

  describe('initial data', () => {
    it('should accept initial data', async () => {
      const initialData = { cached: true };
      const asyncFn = jest.fn(async () => ({ updated: true }));

      const { result } = renderHook(() =>
        useAsyncData(asyncFn, [], initialData),
      );

      // Should start with initial data
      expect(result.current.data).toEqual(initialData);
      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual({ updated: true });
    });
  });
});
