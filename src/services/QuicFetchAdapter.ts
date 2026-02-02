/**
 * QUIC Fetch Adapter
 * Provides a fetch-like interface using native QUIC transport
 * Compatible with @sovereign-net/api-client FetchAdapter interface
 */

import QuicClient, {
  isQuicSupported,
  quicRequest,
  type QuicRequestOptions,
  type QuicResponse,
} from './QuicClient';
import SecureIdentityStorage from './SecureIdentityStorage';

/**
 * FetchAdapter type from @sovereign-net/api-client
 * Redefining here to avoid import issues
 */
export type FetchAdapter = (
  url: string,
  options?: RequestInit
) => Promise<Response>;

/**
 * Options for creating the QUIC fetch adapter
 */
export interface QuicFetchAdapterOptions {
  /** Allow self-signed certificates (default: true in dev) */
  insecure?: boolean;
  /** Request timeout in seconds (default: 30) */
  timeout?: number;
  /** Fall back to standard fetch if QUIC unavailable */
  fallbackToHttp?: boolean;
  /** Called when falling back to HTTP */
  onFallback?: (url: string, reason: string) => void;
}

/**
 * Create a minimal Response-like object from QUIC response
 */
function createResponseFromQuic(quicResponse: QuicResponse): Response {
  const headers = new Headers(quicResponse.headers);

  // Create a Response-like object
  const response = {
    ok: quicResponse.ok,
    status: quicResponse.status,
    statusText: quicResponse.statusText,
    headers,
    body: null,
    bodyUsed: false,
    redirected: false,
    type: 'basic' as ResponseType,
    url: '',

    // Clone method
    clone: function () {
      return createResponseFromQuic(quicResponse);
    },

    // Body methods
    json: async function () {
      // Ensure body is a string before parsing (Android may return different types)
      const bodyStr = typeof quicResponse.body === 'string'
        ? quicResponse.body
        : JSON.stringify(quicResponse.body);

      if (!bodyStr || bodyStr.trim() === '') {
        return {};
      }

      try {
        return JSON.parse(bodyStr);
      } catch (error) {
        console.error('[QuicFetchAdapter] JSON parse failed:', error);
        console.error('[QuicFetchAdapter] Body type:', typeof quicResponse.body);
        console.error('[QuicFetchAdapter] Body value:', String(quicResponse.body).substring(0, 200));
        throw new Error(`JSON parse error: ${error}`);
      }
    },

    text: async function () {
      // Ensure body is a string (Android may return different types)
      return typeof quicResponse.body === 'string'
        ? quicResponse.body
        : String(quicResponse.body);
    },

    arrayBuffer: async function () {
      const encoder = new TextEncoder();
      return encoder.encode(quicResponse.body).buffer;
    },

    blob: async function () {
      return new Blob([quicResponse.body]);
    },

    formData: async function () {
      throw new Error('formData() not supported in QUIC adapter');
    },

    bytes: async function () {
      const encoder = new TextEncoder();
      return encoder.encode(quicResponse.body);
    },
  };

  return response as unknown as Response;
}

/**
 * Public endpoints that don't require authentication
 * These use zhtp-public/1 ALPN instead of zhtp-uhp/2
 * Note: Server must whitelist POST endpoints on public ALPN
 */
const PUBLIC_ENDPOINT_PATTERNS = [
  // Identity endpoints (public - no UHP authentication required)
  '/api/v1/identity/create',
  '/api/v1/identity/signup',
  '/api/v1/identity/register',  // Client-side key registration (iOS)
  '/api/v1/identity/login',
  '/api/v1/identity/signin',
  '/api/v1/identity/exists',
  // Protocol health
  '/api/v1/protocol/health',
  // DAO endpoints (read-only GET)
  '/api/v1/dao/proposals',
  '/api/v1/dao/vote/history',
  // Wallet endpoints require authentication (UHP)
  // Web4 browsing endpoints (read-only GET)
  '/api/v1/web4/resolve',
  '/api/v1/web4/content',
  '/api/v1/web4/cid',
  '/api/v1/web4/domains',
  // Web4 public content
  '/web4/',
];

/**
 * COMPLIANCE: Mutating endpoints that require identity auto-population
 * These endpoints must derive sender/creator identity from authenticated session
 * not from client-supplied request body
 */
const MUTATING_IDENTITY_ENDPOINTS = [
  { path: '/api/v1/token/create', identityField: 'creator_identity' },
  { path: '/api/v1/token/mint', identityField: 'creator_identity' },
  { path: '/api/v1/token/transfer', identityField: 'from' },
];

/**
 * Determine if a URL path requires public (unauthenticated) ALPN
 */
function isPublicEndpoint(url: string): boolean {
  try {
    const urlObj = new URL(url.replace(/^quic:\/\//, 'https://'));
    const path = urlObj.pathname;
    const isPublic = PUBLIC_ENDPOINT_PATTERNS.some(pattern => path.startsWith(pattern));
    if (__DEV__ && isPublic) {
      console.log('[🌐 Web4] QuicFetchAdapter: Public endpoint detected');
      console.log('[🌐 Web4] QuicFetchAdapter:   URL:', url);
      console.log('[🌐 Web4] QuicFetchAdapter:   Path:', path);
    }
    return isPublic;
  } catch (e) {
    console.warn('[🌐 Web4] QuicFetchAdapter: Error checking public endpoint:', url, e);
    return false;
  }
}

function normalizeIdentityBody(body: string, url?: string): string {
  if (!url) return body;
  try {
    const urlObj = new URL(url.replace(/^quic:\/\//, 'https://'));
    const path = urlObj.pathname.replace(/\/+$/, '');
    if (!path.startsWith('/api/v1/identity/')) {
      return body;
    }

    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.identity_id === 'string') {
      parsed.identity_id = parsed.identity_id.trim();
      return JSON.stringify(parsed);
    }
  } catch {
    return body;
  }
  return body;
}

/**
 * COMPLIANCE: Populate identity fields in request body for mutating endpoints
 * Ensures sender/creator identity is derived from authenticated session
 * Called by convertOptions before final request preparation
 */
async function populateIdentityFields(body: string, url?: string, method?: string): Promise<string> {
  if (!url || !body || method === 'GET') {
    return body;
  }

  try {
    const urlObj = new URL(url.replace(/^quic:\/\//, 'https://'));
    const path = urlObj.pathname.replace(/\/+$/, '');

    // Check if this is a mutating endpoint that requires identity
    const identityEndpoint = MUTATING_IDENTITY_ENDPOINTS.find(e => path === e.path);
    if (!identityEndpoint) {
      return body;
    }

    // Get authenticated identity from session
    const identityId = await SecureIdentityStorage.getIdentityId();
    if (!identityId) {
      console.warn('[QuicFetchAdapter] ⚠️ No authenticated identity for mutating endpoint:', path);
      return body;
    }

    // Parse request body
    const parsed = JSON.parse(body);
    if (!parsed) {
      return body;
    }

    // Populate identity field if not already set
    if (!parsed[identityEndpoint.identityField]) {
      parsed[identityEndpoint.identityField] = identityId;
      if (__DEV__) {
        console.log('[QuicFetchAdapter] ✓ Auto-populated identity field:', identityEndpoint.identityField);
      }
      return JSON.stringify(parsed);
    }

    return body;
  } catch (error) {
    console.warn('[QuicFetchAdapter] Failed to populate identity fields:', error);
    return body;
  }
}

/**
 * Convert RequestInit to QuicRequestOptions
 */
function convertOptions(init?: RequestInit, url?: string): QuicRequestOptions {
  const headers: Record<string, string> = {};

  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(init.headers)) {
      init.headers.forEach(([key, value]) => {
        headers[key] = value;
      });
    } else {
      Object.assign(headers, init.headers);
    }
  }

  let body: string | undefined;
  if (init?.body) {
    if (typeof init.body === 'string') {
      body = init.body;
    } else if (init.body instanceof ArrayBuffer) {
      body = new TextDecoder().decode(init.body);
    } else if (typeof init.body === 'object') {
      body = JSON.stringify(init.body);
    }
  }
  if (body) {
    body = normalizeIdentityBody(body, url);
  }

  // Determine ALPN based on endpoint
  const alpn: 'public' | 'authenticated' = url && isPublicEndpoint(url) ? 'public' : 'authenticated';

  if (__DEV__) {
    console.log('[🌐 Web4] QuicFetchAdapter: ALPN selection:');
    console.log('[🌐 Web4] QuicFetchAdapter:   URL:', url);
    console.log('[🌐 Web4] QuicFetchAdapter:   ALPN:', alpn);
  }

  return {
    method: (init?.method as QuicRequestOptions['method']) || 'GET',
    headers,
    body,
    alpn,
  };
}

/**
 * Create a QUIC-based fetch adapter for @sovereign-net/api-client
 *
 * @example
 * ```typescript
 * import { createQuicFetchAdapter } from './QuicFetchAdapter';
 * import { ZhtpApi } from '@sovereign-net/api-client';
 *
 * const quicFetch = await createQuicFetchAdapter({ insecure: true });
 * const api = new ZhtpApi(configProvider, quicFetch);
 * ```
 */
export async function createQuicFetchAdapter(
  options: QuicFetchAdapterOptions = {}
): Promise<FetchAdapter> {
  const {
    insecure = __DEV__,
    timeout = 30,
    fallbackToHttp = false,
    onFallback,
  } = options;

  // Check QUIC support
  const quicSupported = await isQuicSupported();

  if (!quicSupported && !fallbackToHttp) {
    throw new Error(
      'QUIC is not supported on this device and fallback is disabled'
    );
  }

  return async (url: string, init?: RequestInit): Promise<Response> => {
    // Convert HTTP URL to QUIC URL if needed
    const quicUrl = url.replace(/^https?:\/\//, 'quic://');

    // Determine ALPN based on endpoint
    const quicOptions = convertOptions(init, quicUrl);
    quicOptions.insecure = insecure;
    quicOptions.timeout = timeout;

    // SECURITY: QUIC is required - do not fall back to HTTP
    // HTTP would expose the protocol to downgrade attacks
    if (!quicSupported) {
      const error = new Error(
        'QUIC_UNSUPPORTED: QUIC protocol is required but not available on this device. ' +
        'HTTP fallback is disabled for security reasons.'
      );
      if (onFallback) {
        onFallback(url, error.message);
      }
      throw error;
    }

    try {
      const startTime = Date.now();
      const quicResponse = await quicRequest(quicUrl, quicOptions);
      const elapsed = Date.now() - startTime;

      if (__DEV__) {
        console.log('[🌐 Web4] QuicFetchAdapter: Request completed');
        console.log('[🌐 Web4] QuicFetchAdapter:   Time taken:', `${elapsed}ms`);
        console.log('[🌐 Web4] QuicFetchAdapter:   Response body length:', `${quicResponse.body?.length || 0} bytes`);
      }

      return createResponseFromQuic(quicResponse);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      console.error('[🌐 Web4] QuicFetchAdapter: Request failed:', errorMessage);
      console.error('[🌐 Web4] QuicFetchAdapter:   URL:', quicUrl);
      console.error('[🌐 Web4] QuicFetchAdapter:   ALPN:', quicOptions.alpn);

      // SECURITY: QUIC is required - no HTTP fallback on error
      // Failing securely is better than exposing to downgrade attacks
      if (onFallback) {
        onFallback(url, `QUIC failed: ${errorMessage}`);
      }
      throw error;
    }
  };
}

/**
 * Synchronous version that creates adapter with default fallback behavior
 * Use this when you don't need to await QUIC support check
 */
export function createQuicFetchAdapterSync(
  options: QuicFetchAdapterOptions = {}
): FetchAdapter {
  const {
    insecure = __DEV__,
    timeout = 30,
    fallbackToHttp = false,
    onFallback,
  } = options;

  let quicSupportChecked = false;
  let quicSupported = false;

  return async (url: string, init?: RequestInit): Promise<Response> => {
    // Check QUIC support once
    if (!quicSupportChecked) {
      quicSupported = await isQuicSupported();
      quicSupportChecked = true;
    }

    // Convert URL to QUIC scheme
    const quicUrl = url.replace(/^https?:\/\//, 'quic://');

    // Determine ALPN based on endpoint
    const quicOptions = convertOptions(init, quicUrl);
    quicOptions.insecure = insecure;
    quicOptions.timeout = timeout;

    // For authenticated requests, add X-Zhtp-Identity header
    if (quicOptions.alpn === 'authenticated') {
      try {
        const identityId = await SecureIdentityStorage.getIdentityId();
        if (identityId) {
          quicOptions.headers = quicOptions.headers || {};
          quicOptions.headers['X-Zhtp-Identity'] = identityId;
          if (__DEV__) {
            console.log('[🌐 Web4] QuicFetchAdapter: Added X-Zhtp-Identity header for authenticated request');
          }
        } else {
          console.warn('[🌐 Web4] QuicFetchAdapter: ⚠️ No identity_id found for authenticated request');
        }
      } catch (error) {
        console.warn('[🌐 Web4] QuicFetchAdapter: Failed to retrieve identity_id:', error);
      }

      // COMPLIANCE: Populate identity fields in request body for mutating endpoints
      if (quicOptions.body) {
        try {
          quicOptions.body = await populateIdentityFields(quicOptions.body, quicUrl, quicOptions.method);
        } catch (error) {
          console.warn('[QuicFetchAdapter] Failed to populate identity fields:', error);
        }
      }
    }

    if (__DEV__) {
      console.log('[QuicFetchAdapterSync] ▶️ REQUEST:', {
        url: quicUrl,
        method: quicOptions.method,
        alpn: quicOptions.alpn,
        headers: quicOptions.headers,
        bodyLength: quicOptions.body?.length || 0,
      });
    }

    // SECURITY: QUIC is required - do not fall back to HTTP
    // HTTP would expose the protocol to downgrade attacks
    if (!quicSupported) {
      const error = new Error(
        'QUIC_UNSUPPORTED: QUIC protocol is required but not available on this device. ' +
        'HTTP fallback is disabled for security reasons.'
      );
      if (onFallback) {
        onFallback(url, error.message);
      }
      throw error;
    }

    try {
      const startTime = Date.now();
      const quicResponse = await quicRequest(quicUrl, quicOptions);
      const elapsed = Date.now() - startTime;

      if (__DEV__) {
        console.log('[QuicFetchAdapterSync] ✅ RESPONSE:', {
          url: quicUrl,
          status: quicResponse.status,
          statusText: quicResponse.statusText,
          ok: quicResponse.ok,
          elapsed: `${elapsed}ms`,
          bodyLength: quicResponse.body?.length || 0,
          bodyPreview: quicResponse.body?.substring(0, 200),
        });
      }

      return createResponseFromQuic(quicResponse);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // if (__DEV__) {
      //   console.log('[QuicFetchAdapterSync] ❌ ERROR:', {
      //     url: quicUrl,
      //     error: errorMessage,
      //     alpn: quicOptions.alpn,
      //   });
      // }

      // SECURITY: QUIC is required - no HTTP fallback on error
      // Failing securely is better than exposing to downgrade attacks
      if (onFallback) {
        onFallback(url, `QUIC error: ${errorMessage}`);
      }
      throw error;
    }
  };
}

export default createQuicFetchAdapter;
