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
      return JSON.parse(quicResponse.body);
    },

    text: async function () {
      return quicResponse.body;
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
 * These use zhtp-public/1 ALPN instead of zhtp-uhp/1
 * Note: Server must whitelist POST endpoints on public ALPN
 */
const PUBLIC_ENDPOINT_PATTERNS = [
  // Identity endpoints (read-only or whitelisted POST)
  '/api/v1/identity/create',
  '/api/v1/identity/signup',
  '/api/v1/identity/exists',
  // Protocol health
  '/api/v1/protocol/health',
  // UBI endpoints (read-only GET)
  '/api/v1/ubi/status',
  '/api/v1/ubi/history',
  // DAO endpoints (read-only GET)
  '/api/v1/dao/proposals',
  '/api/v1/dao/vote/history',
  // Wallet endpoints (read-only GET)
  '/api/v1/wallet/list',
  '/api/v1/wallet/balance',
  '/api/v1/wallet/transactions',
  // Web4 public content
  '/web4/',
];

/**
 * Determine if a URL path requires public (unauthenticated) ALPN
 */
function isPublicEndpoint(url: string): boolean {
  try {
    const urlObj = new URL(url.replace(/^quic:\/\//, 'https://'));
    const path = urlObj.pathname;
    const isPublic = PUBLIC_ENDPOINT_PATTERNS.some(pattern => path.startsWith(pattern));
    // console.log('[QuicFetchAdapter] 🔍 isPublicEndpoint check:', { url, path, isPublic });
    return isPublic;
  } catch (e) {
    // console.log('[QuicFetchAdapter] ⚠️ isPublicEndpoint parse error:', { url, error: e });
    return false;
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

  // Determine ALPN based on endpoint
  const alpn: 'public' | 'authenticated' = url && isPublicEndpoint(url) ? 'public' : 'authenticated';

  // console.log('[QuicFetchAdapter] 🔑 convertOptions ALPN result:', { url, alpn });

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
    fallbackToHttp = true,
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

    // if (__DEV__) {
    //   console.log('[QuicFetchAdapter] ▶️ REQUEST:', {
    //     url: quicUrl,
    //     method: quicOptions.method,
    //     alpn: quicOptions.alpn,
    //     headers: quicOptions.headers,
    //     bodyLength: quicOptions.body?.length || 0,
    //   });
    // }

    // If QUIC not supported, fall back to standard fetch
    if (!quicSupported) {
      if (onFallback) {
        onFallback(url, 'QUIC not supported on this device');
      }
      return fetch(url, init);
    }

    try {
      const startTime = Date.now();
      const quicResponse = await quicRequest(quicUrl, quicOptions);
      const elapsed = Date.now() - startTime;

      // if (__DEV__) {
      //   console.log('[QuicFetchAdapter] ✅ RESPONSE:', {
      //     url: quicUrl,
      //     status: quicResponse.status,
      //     statusText: quicResponse.statusText,
      //     ok: quicResponse.ok,
      //     elapsed: `${elapsed}ms`,
      //     bodyLength: quicResponse.body?.length || 0,
      //     bodyPreview: quicResponse.body?.substring(0, 200),
      //   });
      // }

      return createResponseFromQuic(quicResponse);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // if (__DEV__) {
      //   console.log('[QuicFetchAdapter] ❌ ERROR:', {
      //     url: quicUrl,
      //     error: errorMessage,
      //     alpn: quicOptions.alpn,
      //   });
      // }

      // If QUIC fails and fallback is enabled, try standard fetch
      if (fallbackToHttp) {
        if (onFallback) {
          onFallback(url, `QUIC failed: ${errorMessage}`);
        }
        console.warn(`QUIC request failed, falling back to HTTP: ${errorMessage}`);
        return fetch(url, init);
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
    fallbackToHttp = true,
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

    // if (__DEV__) {
    //   console.log('[QuicFetchAdapterSync] ▶️ REQUEST:', {
    //     url: quicUrl,
    //     method: quicOptions.method,
    //     alpn: quicOptions.alpn,
    //     headers: quicOptions.headers,
    //     bodyLength: quicOptions.body?.length || 0,
    //   });
    // }

    // Fallback if not supported
    if (!quicSupported) {
      if (fallbackToHttp) {
        if (onFallback) {
          onFallback(url, 'QUIC not supported');
        }
        return fetch(url, init);
      }
      throw new Error('QUIC not supported and fallback disabled');
    }

    try {
      const startTime = Date.now();
      const quicResponse = await quicRequest(quicUrl, quicOptions);
      const elapsed = Date.now() - startTime;

      // if (__DEV__) {
      //   console.log('[QuicFetchAdapterSync] ✅ RESPONSE:', {
      //     url: quicUrl,
      //     status: quicResponse.status,
      //     statusText: quicResponse.statusText,
      //     ok: quicResponse.ok,
      //     elapsed: `${elapsed}ms`,
      //     bodyLength: quicResponse.body?.length || 0,
      //     bodyPreview: quicResponse.body?.substring(0, 200),
      //   });
      // }

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

      if (fallbackToHttp) {
        if (onFallback) {
          onFallback(url, `QUIC error: ${errorMessage}`);
        }
        return fetch(url, init);
      }
      throw error;
    }
  };
}

export default createQuicFetchAdapter;
