/**
 * Application Constants
 * Centralized constants and configuration values
 */

// Animation Durations (milliseconds)
export const ANIMATION_DURATIONS = {
  FAST: 150,
  NORMAL: 300,
  SLOW: 500,
} as const;

// Toast Durations (milliseconds)
export const TOAST_DURATIONS = {
  SHORT: 2000,
  NORMAL: 3000,
  LONG: 5000,
} as const;

// Network Timeouts (milliseconds)
export const NETWORK_TIMEOUTS = {
  SHORT: 5000,
  NORMAL: 10000,
  LONG: 30000,
} as const;

// Debounce Delays (milliseconds)
export const DEBOUNCE_DELAYS = {
  INSTANT: 100,
  NORMAL: 300,
  SLOW: 1000,
} as const;

// API Constants
export const API = {
  BASE_URL: 'https://api.zhtp.network',
  VERSION: 'v1',
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
} as const;

// App Limits
export const LIMITS = {
  MAX_WALLET_NAME_LENGTH: 50,
  MAX_MESSAGE_LENGTH: 500,
  MAX_ADDRESSES_DISPLAY: 8,
  LIST_PAGINATION_SIZE: 20,
} as const;

// Feature Flags
export const FEATURES = {
  DARK_MODE_ENABLED: true,
  NOTIFICATIONS_ENABLED: true,
  OFFLINE_MODE_ENABLED: false,
  BETA_FEATURES_ENABLED: false,
} as const;

// Device Constants
export const DEVICE = {
  MIN_SCALE: 0.8,
  MAX_SCALE: 1.2,
} as const;

// Cache Keys for AsyncStorage
export const STORAGE_KEYS = {
  USER_IDENTITY: '@app:user_identity',
  SELECTED_WALLET: '@app:selected_wallet',
  BROWSER_HISTORY: '@app:browser_history',
  APP_PREFERENCES: '@app:preferences',
  CACHED_PROPOSALS: '@app:cached_proposals',
  CACHED_TRANSACTIONS: '@app:cached_transactions',
} as const;

// Error Messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  TIMEOUT_ERROR: 'Request timed out. Please try again.',
  INVALID_ADDRESS: 'Invalid address format.',
  INSUFFICIENT_BALANCE: 'Insufficient balance for this transaction.',
  UNKNOWN_ERROR: 'An unknown error occurred. Please try again.',
} as const;

// Success Messages
export const SUCCESS_MESSAGES = {
  TRANSACTION_SENT: 'Transaction sent successfully',
  VOTE_RECORDED: 'Your vote has been recorded',
  UBI_CLAIMED: 'UBI claimed successfully',
  PROPOSAL_CREATED: 'Proposal created successfully',
} as const;

// Regex Patterns
export const PATTERNS = {
  WALLET_ADDRESS: /^zhtp1[a-z0-9]{39}$/,
  DID: /^did:zhtp:[a-zA-Z0-9_-]+$/,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  AMOUNT: /^\d+(\.\d{1,2})?$/,
} as const;

// Default Values
export const DEFAULTS = {
  PAGE_SIZE: 20,
  DECIMAL_PLACES: 2,
  DATE_FORMAT: 'MMM d, yyyy',
  TIME_FORMAT: 'HH:mm',
} as const;

// Transaction Types
export const TRANSACTION_TYPES = {
  SEND: 'send',
  RECEIVE: 'receive',
  STAKE: 'stake',
  UBI: 'ubi',
} as const;

// Wallet Types
export const WALLET_TYPES = {
  PRIMARY: 'primary',
  UBI: 'ubi',
  SAVINGS: 'savings',
} as const;

// Proposal Status
export const PROPOSAL_STATUS = {
  ACTIVE: 'active',
  PASSED: 'passed',
  FAILED: 'failed',
  EXECUTED: 'executed',
} as const;

// Identity Types
export const IDENTITY_TYPES = {
  HUMAN: 'human',
  ORGANIZATION: 'organization',
  DEVELOPER: 'developer',
} as const;
