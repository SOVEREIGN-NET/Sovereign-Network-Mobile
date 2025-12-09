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
 * Convert RequestInit to QuicRequestOptions
 */
function convertOptions(init?: RequestInit): QuicRequestOptions {
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

  return {
    method: (init?.method as QuicRequestOptions['method']) || 'GET',
    headers,
    body,
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

    // If QUIC not supported, fall back to standard fetch
    if (!quicSupported) {
      if (onFallback) {
        onFallback(url, 'QUIC not supported on this device');
      }
      return fetch(url, init);
    }

    try {
      const quicOptions = convertOptions(init);
      quicOptions.insecure = insecure;
      quicOptions.timeout = timeout;

      const quicResponse = await quicRequest(quicUrl, quicOptions);
      return createResponseFromQuic(quicResponse);
    } catch (error) {
      // If QUIC fails and fallback is enabled, try standard fetch
      if (fallbackToHttp) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
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

    // Convert URL
    const quicUrl = url.replace(/^https?:\/\//, 'quic://');

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
      const quicOptions = convertOptions(init);
      quicOptions.insecure = insecure;
      quicOptions.timeout = timeout;

      const quicResponse = await quicRequest(quicUrl, quicOptions);
      return createResponseFromQuic(quicResponse);
    } catch (error) {
      if (fallbackToHttp) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
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
