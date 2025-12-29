/**
 * Application Configuration
 * Single source of truth for all URLs, endpoints, and network settings
 * NOTE: Node URL MUST be set in .env file - change nowhere else
 *
 * The .env file is read by a build script (scripts/generate-config.js) that
 * sets these values. This ensures:
 * 1. Single source of truth in .env
 * 2. No hardcoded IPs in multiple files
 * 3. Clean build-time configuration injection
 */

// =============================================================================
// NETWORK CONFIGURATION
// =============================================================================

/**
 * Default SOV Node URL
 * Set in .env file: ZHTP_NODE_URL=http://your-node-ip:9334
 * The development node only supports pure QUIC/UDP - no HTTP fallback
 * Port 9334 is the standard SOV port
 *
 * ⚠️  SINGLE POINT TO CHANGE NODE URL:
 *     Edit .env file only:
 *     - Local testing:  ZHTP_NODE_URL=http://192.168.1.30:9334
 *     - Remote server:  ZHTP_NODE_URL=http://77.42.37.161:9334
 *
 * This value is injected at build time via scripts/generate-config.js
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ZHTP_NODE_URL: envNodeUrl } = require('../.env.generated.json');

export const DEFAULT_SOV_NODE_URL = envNodeUrl || 'http://77.42.37.161:9334';

/**
 * Parse host and port from the node URL
 */
function parseNodeUrl(url: string): { host: string; port: number } {
  try {
    const urlObj = new URL(url.replace('http://', 'http://').replace('quic://', 'http://'));
    const host = urlObj.hostname;
    const port = parseInt(urlObj.port || '9334', 10);
    return { host, port };
  } catch {
    return { host: '77.42.37.161', port: 9334 };
  }
}

const { host: parsedHost, port: parsedPort } = parseNodeUrl(DEFAULT_SOV_NODE_URL);

/**
 * Default node host and port (parsed from URL)
 */
export const DEFAULT_NODE_HOST = parsedHost;
export const DEFAULT_NODE_PORT = parsedPort;

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
