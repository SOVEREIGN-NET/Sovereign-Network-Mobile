/**
 * Application Configuration
 * Single source of truth for all URLs, endpoints, and network settings
 */

// =============================================================================
// NETWORK CONFIGURATION
// =============================================================================

/**
 * Default SOV Node URL
 * The development node at this address only supports pure QUIC/UDP - no HTTP fallback
 * Port 9334 is the standard SOV port
 * Note: Use http:// scheme - the QUIC adapter converts to quic:// internally
 *
 * ⚠️  SINGLE POINT TO CHANGE NODE URL:
 *     - Local testing:  'http://192.168.1.30:9334'
 *     - Remote server:  'http://77.42.37.161:9334'
 */
export const DEFAULT_SOV_NODE_URL = 'http://77.42.37.161:9334';

/**
 * Default node host and port (parsed from URL)
 */
export const DEFAULT_NODE_HOST = '77.42.37.161';
export const DEFAULT_NODE_PORT = 9334;

/**
 * Network type - testnet or mainnet
 */
export const DEFAULT_NETWORK_TYPE: 'testnet' | 'mainnet' = 'testnet';

// =============================================================================
// API ENDPOINTS
// =============================================================================

/**
 * All API endpoint paths - matches the sovereign-net-api-client library
 * These are relative paths appended to the node URL
 */
export const API_ENDPOINTS = {
  // Identity endpoints
  identity: {
    create: '/api/v1/identity/create',
    login: '/api/v1/identity/login',
    signin: '/api/v1/identity/signin',
    verify: '/api/v1/identity/verify',
    exists: '/api/v1/identity/exists',
  },

  // Wallet endpoints
  wallet: {
    list: '/api/v1/wallet/list', // /{identity_id}
    balance: '/api/v1/wallet/balance', // /{type}/{identity_id}
    send: '/api/v1/wallet/send',
    receive: '/api/v1/wallet/receive',
    stake: '/api/v1/wallet/stake',
    unstake: '/api/v1/wallet/unstake',
    transactions: '/api/v1/wallet/transactions', // /{wallet_id}
  },

  // DAO endpoints
  dao: {
    proposals: {
      list: '/api/v1/dao/proposals/list',
      get: '/api/v1/dao/proposals', // /{proposal_id}
      create: '/api/v1/dao/proposals/create',
    },
    vote: {
      cast: '/api/v1/dao/vote/cast',
      history: '/api/v1/dao/vote/history', // /{identity_id}
    },
  },

  // UBI endpoints
  ubi: {
    status: '/api/v1/ubi/status', // /{identity_id}
    claim: '/api/v1/ubi/claim',
    history: '/api/v1/ubi/history', // /{identity_id}
  },

  // Network/Protocol endpoints
  network: {
    health: '/api/v1/protocol/health',
    peers: '/api/v1/blockchain/network/peers',
    status: '/api/v1/blockchain/network/status',
  },

  // Recovery endpoints
  recovery: {
    seed: '/api/v1/identity/recovery/seed',
    backup: '/api/v1/identity/recovery/backup',
    guardians: {
      list: '/api/v1/identity/guardians/list',
      add: '/api/v1/identity/guardians/add',
      remove: '/api/v1/identity/guardians/remove',
      initiate: '/api/v1/identity/recovery/guardians/initiate',
      approve: '/api/v1/identity/recovery/guardians/approve',
      status: '/api/v1/identity/recovery/guardians/status',
    },
  },

  // ZK-DID endpoints
  zkdid: {
    create: '/api/v1/zkdid/create',
    verify: '/api/v1/zkdid/verify',
    prove: '/api/v1/zkdid/prove',
  },
} as const;

// =============================================================================
// QUIC/TRANSPORT CONFIGURATION
// =============================================================================

/**
 * QUIC transport settings
 */
export const QUIC_CONFIG = {
  /** ALPN protocol identifier for SOV */
  alpnProtocol: 'zhtp/1.0',

  /** Default request timeout in seconds */
  defaultTimeout: 30,

  /** Accept self-signed certificates (dev mode) */
  insecure: __DEV__,

  /** Fallback to HTTP if QUIC unavailable - disabled since server is pure QUIC */
  fallbackToHttp: false,

  /** Maximum response size in bytes (1MB) */
  maxResponseSize: 1024 * 1024,

  /** Idle timeout in seconds */
  idleTimeout: 30,
} as const;

// =============================================================================
// APP DEFAULTS
// =============================================================================

/**
 * Default app configuration values
 */
export const APP_DEFAULTS = {
  /** Use mock data service in development */
  useMockData: __DEV__,

  /** Enable biometric authentication if available */
  enableBiometrics: true,

  /** Debug mode - extra logging */
  debugMode: __DEV__,
} as const;

// =============================================================================
// LEGACY EXPORTS (for backward compatibility)
// =============================================================================

/**
 * Legacy export for backward compatibility during migration
 */
export const DEFAULT_ZHTP_NODE_URL = DEFAULT_SOV_NODE_URL;
export const SOV_NODE_URL = DEFAULT_SOV_NODE_URL;
export const ZHTP_NODE_URL = DEFAULT_SOV_NODE_URL;

/**
 * Legacy config object - use individual exports above for new code
 */
export const config = {
  DEFAULT_ZHTP_NODE_URL: DEFAULT_SOV_NODE_URL,
  SOV_NODE_URL: DEFAULT_SOV_NODE_URL,
  ZHTP_NODE_URL: DEFAULT_SOV_NODE_URL,
  NODE_HOST: DEFAULT_NODE_HOST,
  NODE_PORT: DEFAULT_NODE_PORT,
  NETWORK_TYPE: DEFAULT_NETWORK_TYPE,
  API_ENDPOINTS,
  QUIC_CONFIG,
  APP_DEFAULTS,
};

export default config;
