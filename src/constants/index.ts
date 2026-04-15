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

// Welfare DAO brand colors — used consistently across the UI to identify each DAO
export const WELFARE_DAOS = [
  {
    id: 'food',
    name: 'Food Hub',
    desc: 'Community food security network',
    url: 'food.dao.sov',
    wallet: '5ad4d36b1d3a1aa783c05f316d67309b2b60de4fb76324428237dd25c2f9ffb4',
    color: '#8BA888',
  },
  {
    id: 'health',
    name: 'Health Hub',
    desc: 'Decentralized healthcare access',
    url: 'health.dao.sov',
    wallet: '9f8d4ccf10869f9a95b4d3e76834da4140aed7fe6af7e8aa3af0d7074c4ac86c',
    color: '#C97B7B',
  },
  {
    id: 'education',
    name: 'Education Hub',
    desc: 'Open learning resources',
    url: 'edu.dao.sov',
    wallet: 'e4611cc1a4ebf28ad119e0c415b4300f53dd97703ee6aa793847c40fceea1d5d',
    color: '#7A9BC4',
  },
  {
    id: 'housing',
    name: 'Housing Hub',
    desc: 'Affordable housing collective',
    url: 'housing.dao.sov',
    wallet: 'ccf0caad2c80e51c2e43ceab4a8b5d1d34d4914da57534697ba8003cea3a4ca2',
    color: '#B8956A',
  },
  {
    id: 'energy',
    name: 'Energy Hub',
    desc: 'Renewable energy sharing',
    url: 'energy.dao.sov',
    wallet: 'cb4fc86f2f0177f24be863874845ef3e4560dd89e981d1ff4fe07372ea693768',
    color: '#D4B35A',
  },
] as const;

export type WelfareDaoId = (typeof WELFARE_DAOS)[number]['id'];
