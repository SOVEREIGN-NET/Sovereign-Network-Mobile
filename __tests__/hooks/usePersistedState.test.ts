import { renderHook, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePersistedState } from 'src/hooks/usePersistedState';

jest.mock('@react-native-async-storage/async-storage');

describe('usePersistedState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  });

  it('should initialize with provided initial value', () => {
    const { result } = renderHook(() => usePersistedState('test-key', 'initial'));

    expect(result.current[0]).toBe('initial');
    expect(result.current[2]).toBe(true); // isLoading starts as true
  });

  it('should load value from storage on mount', async () => {
    const storedValue = JSON.stringify('stored-value');
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(storedValue);

    const { result } = renderHook(() => usePersistedState('test-key', 'initial'));

    await waitFor(() => {
      expect(result.current[2]).toBe(false); // isLoading becomes false
    });

    expect(result.current[0]).toBe('stored-value');
    expect(AsyncStorage.getItem).toHaveBeenCalledWith('test-key');
  });

  it('should parse JSON stored values', async () => {
    const storedValue = JSON.stringify({ name: 'John', age: 30 });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(storedValue);

    const { result } = renderHook(() =>
      usePersistedState('test-key', { name: '', age: 0 }),
    );

    await waitFor(() => {
      expect(result.current[2]).toBe(false);
    });

    expect(result.current[0]).toEqual({ name: 'John', age: 30 });
  });

  it('should fallback to string if JSON parsing fails', async () => {
    const invalidJson = 'not-valid-json';
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(invalidJson);

    const { result } = renderHook(() => usePersistedState('test-key', ''));

    await waitFor(() => {
      expect(result.current[2]).toBe(false);
    });

    expect(result.current[0]).toBe(invalidJson);
  });

  it('should save state to storage when updated with value', async () => {
    const { result } = renderHook(() => usePersistedState('test-key', 'initial'));

    await waitFor(() => {
      expect(result.current[2]).toBe(false);
    });

    act(() => {
      result.current[1]('new-value');
    });

    expect(result.current[0]).toBe('new-value');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'test-key',
      JSON.stringify('new-value'),
    );
  });

  it('should save state to storage when updated with updater function', async () => {
    const { result } = renderHook(() => usePersistedState('test-key', 5));

    await waitFor(() => {
      expect(result.current[2]).toBe(false);
    });

    act(() => {
      result.current[1](prev => prev + 1);
    });

    expect(result.current[0]).toBe(6);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('test-key', JSON.stringify(6));
  });

  it('should handle errors when loading from storage', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    (AsyncStorage.getItem as jest.Mock).mockRejectedValue(
      new Error('Storage error'),
    );

    const { result } = renderHook(() => usePersistedState('test-key', 'initial'));

    await waitFor(() => {
      expect(result.current[2]).toBe(false);
    });

    expect(result.current[0]).toBe('initial');
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('should handle errors when saving to storage', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    (AsyncStorage.setItem as jest.Mock).mockRejectedValue(
      new Error('Storage error'),
    );

    const { result } = renderHook(() => usePersistedState('test-key', 'initial'));

    await waitFor(() => {
      expect(result.current[2]).toBe(false);
    });

    act(() => {
      result.current[1]('new-value');
    });

    expect(result.current[0]).toBe('new-value');

    consoleErrorSpy.mockRestore();
  });

  it('should support object state', async () => {
    interface User {
      name: string;
      age: number;
    }

    const initialUser: User = { name: 'Alice', age: 25 };
    const { result } = renderHook(() => usePersistedState('user-key', initialUser));

    await waitFor(() => {
      expect(result.current[2]).toBe(false);
    });

    act(() => {
      result.current[1]({ name: 'Bob', age: 30 });
    });

    expect(result.current[0]).toEqual({ name: 'Bob', age: 30 });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'user-key',
      JSON.stringify({ name: 'Bob', age: 30 }),
    );
  });

  it('should return isLoading as true initially and false after loading', async () => {
    const { result } = renderHook(() => usePersistedState('test-key', 'initial'));

    expect(result.current[2]).toBe(true);

    await waitFor(() => {
      expect(result.current[2]).toBe(false);
    });
  });

  it('should handle null stored values', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

    const { result } = renderHook(() => usePersistedState('test-key', 'default'));

    await waitFor(() => {
      expect(result.current[2]).toBe(false);
    });

    expect(result.current[0]).toBe('default');
  });

  it('should call AsyncStorage.getItem with correct key', async () => {
    renderHook(() => usePersistedState('my-custom-key', 'initial'));

    await waitFor(() => {
      expect(AsyncStorage.getItem).toHaveBeenCalledWith('my-custom-key');
    });
  });

  it('should support array state with updater function', async () => {
    const { result } = renderHook(() => usePersistedState('items-key', [1, 2, 3]));

    await waitFor(() => {
      expect(result.current[2]).toBe(false);
    });

    act(() => {
      result.current[1](prev => [...prev, 4]);
    });

    expect(result.current[0]).toEqual([1, 2, 3, 4]);
  });
});
