import { renderHook, act } from '@testing-library/react-native';
import { useDebounce } from 'src/hooks';

describe('useDebounce Hook', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('debounce behavior', () => {
    it('should return initial value immediately', () => {
      const { result } = renderHook(() => useDebounce('test', 300));

      expect(result.current).toBe('test');
    });

    it('should debounce value changes', () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        { initialProps: { value: 'initial', delay: 300 } },
      );

      expect(result.current).toBe('initial');

      act(() => {
        rerender({ value: 'updated', delay: 300 });
      });
      expect(result.current).toBe('initial'); // Not updated yet

      act(() => {
        jest.advanceTimersByTime(300);
      });
      expect(result.current).toBe('updated');
    });

    it('should reset timer on value change', () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        { initialProps: { value: 'first', delay: 300 } },
      );

      act(() => {
        jest.advanceTimersByTime(150);
      });
      act(() => {
        rerender({ value: 'second', delay: 300 });
      });
      act(() => {
        jest.advanceTimersByTime(150);
      });
      expect(result.current).toBe('first'); // Not debounced yet

      act(() => {
        jest.advanceTimersByTime(150);
      });
      expect(result.current).toBe('second');
    });
  });

  describe('custom delay', () => {
    it('should use custom delay', () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        { initialProps: { value: 'initial', delay: 500 } },
      );

      act(() => {
        rerender({ value: 'updated', delay: 500 });
      });
      act(() => {
        jest.advanceTimersByTime(300);
      });
      expect(result.current).toBe('initial');

      act(() => {
        jest.advanceTimersByTime(200);
      });
      expect(result.current).toBe('updated');
    });

    it('should handle default delay of 500ms', () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebounce(value),
        { initialProps: { value: 'initial' } },
      );

      act(() => {
        rerender({ value: 'updated' });
      });
      act(() => {
        jest.advanceTimersByTime(499);
      });
      expect(result.current).toBe('initial');

      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(result.current).toBe('updated');
    });
  });

  describe('various value types', () => {
    it('should debounce string values', () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebounce(value, 300),
        { initialProps: { value: 'text' } },
      );

      act(() => {
        rerender({ value: 'updated text' });
      });
      act(() => {
        jest.advanceTimersByTime(300);
      });
      expect(result.current).toBe('updated text');
    });

    it('should debounce number values', () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebounce(value, 300),
        { initialProps: { value: 0 } },
      );

      act(() => {
        rerender({ value: 42 });
      });
      act(() => {
        jest.advanceTimersByTime(300);
      });
      expect(result.current).toBe(42);
    });

    it('should debounce object values', () => {
      const obj = { id: 1 };
      const { result, rerender } = renderHook(
        ({ value }) => useDebounce(value, 300),
        { initialProps: { value: obj } },
      );

      const newObj = { id: 2 };
      act(() => {
        rerender({ value: newObj });
      });
      act(() => {
        jest.advanceTimersByTime(300);
      });
      expect(result.current).toEqual(newObj);
    });
  });

  describe('cleanup', () => {
    it('should cleanup timer on unmount', () => {
      const { unmount } = renderHook(
        ({ value }) => useDebounce(value, 300),
        { initialProps: { value: 'initial' } },
      );

      unmount();
      jest.advanceTimersByTime(300);
      // Should not throw or cause issues
    });
  });
});
