import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Custom hook for persisting state to AsyncStorage
 * State is automatically loaded from storage on mount and saved on change
 *
 * @param key - The AsyncStorage key
 * @param initialValue - Initial value if storage is empty
 * @returns [value, setValue, isLoading]
 *
 * @example
 * const [selectedWalletId, setSelectedWalletId] = usePersistedState('selectedWallet', 'wallet-1');
 *
 * // Value is loaded from storage on mount and saved on every change
 */
export function usePersistedState<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((prev: T) => T)) => void, boolean] {
  const [state, setState] = useState<T>(initialValue);
  const [isLoading, setIsLoading] = useState(true);

  // Load from storage on mount
  useEffect(() => {
    const loadFromStorage = async () => {
      try {
        const storedValue = await AsyncStorage.getItem(key);
        if (storedValue !== null) {
          try {
            setState(JSON.parse(storedValue));
          } catch {
            // If JSON parse fails, treat as string
            setState(storedValue as unknown as T);
          }
        }
      } catch (error) {
        console.error(`Error loading persisted state for key "${key}":`, error);
      } finally {
        setIsLoading(false);
      }
    };

    loadFromStorage();
  }, [key]);

  // Save to storage on state change
  const setPersistedState = useCallback(
    (value: T | ((prev: T) => T)) => {
      try {
        const newValue = value instanceof Function ? value(state) : value;
        setState(newValue);

        // Async save to storage (fire and forget)
        AsyncStorage.setItem(key, JSON.stringify(newValue)).catch(error => {
          console.error(`Error saving persisted state for key "${key}":`, error);
        });
      } catch (error) {
        console.error(`Error setting persisted state for key "${key}":`, error);
      }
    },
    [key, state],
  );

  return [state, setPersistedState, isLoading];
}
