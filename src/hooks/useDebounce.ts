import { useState, useEffect } from 'react';

/**
 * Custom hook for debouncing values
 * Delays the return of a value until after a specified delay
 *
 * Useful for search inputs, API calls, etc.
 *
 * @param value - The value to debounce
 * @param delay - Debounce delay in milliseconds (default: 500)
 * @returns The debounced value
 *
 * @example
 * const [searchText, setSearchText] = useState('');
 * const debouncedSearch = useDebounce(searchText, 300);
 *
 * useEffect(() => {
 *   // This effect runs 300ms after searchText stops changing
 *   handleSearch(debouncedSearch);
 * }, [debouncedSearch]);
 */
export function useDebounce<T>(value: T, delay: number = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Set up the timeout
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Clean up the timeout if value changes before delay expires
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
