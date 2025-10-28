/**
 * Manual mocks for src/hooks
 * This file is used by Jest to automatically mock the hooks module
 * See: https://jestjs.io/docs/en/manual-mocks
 */

export const useAuth = jest.fn();

// Set default return value for useAuth
(useAuth as jest.Mock).mockReturnValue({
  currentIdentity: null,
  isLoading: false,
  error: null,
  signIn: jest.fn(),
  createIdentity: jest.fn(),
  recoverIdentity: jest.fn(),
  signOut: jest.fn(),
  clearError: jest.fn(),
});

export const useAsyncData = jest.fn();

// Set default return value for useAsyncData
(useAsyncData as jest.Mock).mockReturnValue({
  data: null,
  loading: false,
  error: null,
});

export const useDebounce = jest.fn((callback: any) => callback);

export const usePersistedState = jest.fn((key: string, initialValue: any) => [initialValue, jest.fn()]);
