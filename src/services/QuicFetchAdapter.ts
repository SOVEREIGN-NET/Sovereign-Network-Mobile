/**
 * QUIC Fetch Adapter
 * Provides a fetch-like interface using native QUIC transport
 * Compatible with @sovereign-net/api-client FetchAdapter interface
 *
 * ALPN ROUTING (DO NOT DRIFT):
 * - PUBLIC (read-only, no auth) → zhtp-public/1 (no UHP handshake)
 *   Examples:
 *     GET /api/v1/web4/domains/status/{domain}
 *     GET /api/v1/blockchain/balance/{address}
 *     GET /api/v1/protocol/info
 *     GET /health
 * - AUTHENTICATED (write / identity / proof) → zhtp-uhp/2 (UHP handshake required)
 *   Examples:
 *     POST /api/v1/identity/register
 *     POST /api/v1/web4/domains/register
 *     POST /api/v1/blockchain/transaction
 *     POST /api/v1/wallet/*
 *
 * Rule of thumb:
 * - Reading public data → zhtp-public/1
 * - Writing anything or proving identity → zhtp-uhp/2
 */

import {
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
}

/**
 * Create a minimal Response-like object from QUIC response
 */
function createResponseFromQuic(quicResponse: QuicResponse): Response {
  const headers = new Headers(quicResponse.headers);

  const toBytes = (): Uint8Array => {
    const bodyAny = (quicResponse as any).bodyBytes ?? (quicResponse as any).bodyBase64;
    if (bodyAny instanceof Uint8Array) {
      return bodyAny;
    }
    if (Array.isArray(bodyAny)) {
      return new Uint8Array(bodyAny);
    }
    if (typeof bodyAny === 'string') {
      if (typeof globalThis.atob === 'function') {
        const binary = globalThis.atob(bodyAny);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
      }
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { Buffer } = require('buffer');
        return new Uint8Array(Buffer.from(bodyAny, 'base64'));
      } catch {
        // fall through
      }
    }

    const bodyText = typeof quicResponse.body === 'string'
      ? quicResponse.body
      : String(quicResponse.body ?? '');
    const encoder = new TextEncoder();
    return encoder.encode(bodyText);
  };

  const toText = async (): Promise<string> => {
    const bytes = toBytes();
    if (bytes.length === 0) {
      return '';
    }
    if (typeof TextDecoder !== 'undefined') {
      return new TextDecoder().decode(bytes);
    }
    let text = '';
    for (let i = 0; i < bytes.length; i += 1) {
      text += String.fromCharCode(bytes[i]);
    }
    return text;
  };

  const ok = quicResponse.status >= 200 && quicResponse.status < 300;
  const response = {
    ok,
    status: quicResponse.status,
    statusText: quicResponse.statusText,
    headers,
    body: null,
    bodyUsed: false,
    redirected: false,
    type: 'basic' as ResponseType,
    url: '',

    clone: function () {
      return createResponseFromQuic(quicResponse);
    },

    json: async function () {
      const bodyStr = await toText();
      if (!bodyStr || bodyStr.trim() === '') {
        throw new Error('JSON parse error: empty body');
      }
      return JSON.parse(bodyStr);
    },

    text: async function () {
      return await toText();
    },

    arrayBuffer: async function () {
      const bytes = toBytes();
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },

    blob: async function () {
      const bytes = toBytes();
      return new Blob([bytes]);
    },

    formData: async function () {
      throw new Error('formData() not supported in QUIC adapter');
    },

    bytes: async function () {
      return toBytes();
    },
  };

  return response as unknown as Response;
}

/**
 * Public endpoints that don't require authentication
 * These use zhtp-public/1 ALPN instead of zhtp-uhp/2
 * NOTE: Keep in sync with protocol rules (see file header).
 */
type PublicEndpointRule = {
  method: string;
  path: string;
};

const PUBLIC_ENDPOINTS: PublicEndpointRule[] = [
  { method: 'GET', path: '/health' },
  { method: 'GET', path: '/api/v1/protocol/health' },
  { method: 'GET', path: '/api/v1/protocol/info' },
  { method: 'GET', path: '/api/v1/blockchain/balance/:address' },
  { method: 'GET', path: '/api/v1/web4/domains/status/:domain' },
  { method: 'GET', path: '/api/v1/identity/username/available/:username' },
  { method: 'POST', path: '/api/v1/identity/recover' },
];

/**
 * COMPLIANCE: Mutating endpoints that require identity auto-population
 * These endpoints must derive sender/creator identity from authenticated session
 * not from client-supplied request body
 */
const MUTATING_IDENTITY_ENDPOINTS = [
  { method: 'POST', path: '/api/v1/token/create', identityField: 'creator_identity' },
  { method: 'POST', path: '/api/v1/token/mint', identityField: 'creator_identity' },
  { method: 'POST', path: '/api/v1/token/transfer', identityField: 'from' },
];

function normalizePath(pathname: string): string {
  if (!pathname) return '/';
  if (pathname === '/') return '/';
  return pathname.replace(/\/+$/, '');
}

function matchPath(pattern: string, actual: string): boolean {
  const patternPath = normalizePath(pattern);
  const actualPath = normalizePath(actual);
  const patternSegments = patternPath.split('/').filter(Boolean);
  const actualSegments = actualPath.split('/').filter(Boolean);

  if (patternSegments.length !== actualSegments.length) {
    return false;
  }

  for (let i = 0; i < patternSegments.length; i += 1) {
    const p = patternSegments[i];
    const a = actualSegments[i];
    if (p.startsWith(':')) {
      if (!a) return false;
      continue;
    }
    if (p !== a) return false;
  }

  return true;
}

/**
 * Determine if a URL path requires public (unauthenticated) ALPN
 * Default-deny: only explicit (method, path) pairs are public.
 */
function isPublicEndpoint(method: string, url: string): boolean {
  try {
    const urlObj = new URL(url.replace(/^quic:\/\//, 'https://'));
    const path = urlObj.pathname;
    const normalizedMethod = method.toUpperCase();

    const isPublic = PUBLIC_ENDPOINTS.some(entry => {
      if (entry.method.toUpperCase() !== normalizedMethod) {
        return false;
      }
      return matchPath(entry.path, path);
    });

    if (__DEV__ && isPublic) {
      console.log('[🌐 Web4] QuicFetchAdapter: Public endpoint detected');
      console.log('[🌐 Web4] QuicFetchAdapter:   URL:', url);
      console.log('[🌐 Web4] QuicFetchAdapter:   Method:', normalizedMethod);
      console.log('[🌐 Web4] QuicFetchAdapter:   Path:', path);
    }
    return isPublic;
  } catch (e) {
    console.warn('[🌐 Web4] QuicFetchAdapter: Error checking public endpoint:', url, e);
    return false;
  }
}

function extractHeaders(init?: RequestInit): Record<string, string> {
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

  return headers;
}

function extractBody(init?: RequestInit): string | undefined {
  if (!init?.body) {
    return undefined;
  }

  if (typeof init.body === 'string') {
    return init.body;
  }

  if (init.body instanceof ArrayBuffer) {
    return new TextDecoder().decode(init.body);
  }

  if (typeof init.body === 'object') {
    return JSON.stringify(init.body);
  }

  return undefined;
}

function isIdentityRegisterEndpoint(method: string, url: string): boolean {
  if (method !== 'POST') {
    return false;
  }
  if (url.includes('/api/v1/identity/register')) {
    return true;
  }
  try {
    const parsed = new URL(url.replace(/^quic:\/\//, 'https://'));
    const normalizedPath = parsed.pathname.replace(/\/{2,}/g, '/');
    return normalizedPath === '/api/v1/identity/register';
  } catch {
    return false;
  }
}

function deriveIdentityIdFromRegisterBody(body: string | undefined): string | undefined {
  if (!body) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(body);
    const did: string | undefined = parsed?.did;
    if (!did || typeof did !== 'string') {
      return undefined;
    }
    return did.startsWith('did:zhtp:') ? did.substring('did:zhtp:'.length) : did;
  } catch {
    return undefined;
  }
}

/**
 * COMPLIANCE: Populate identity fields in request body for mutating endpoints
 * Ensures sender/creator identity is derived from authenticated session
 * Called by shared request pipeline before final request preparation
 */
async function populateIdentityFields(
  body: string | undefined,
  url: string,
  method: string,
  identityId: string
): Promise<string | undefined> {
  if (!body || method.toUpperCase() === 'GET') {
    return body;
  }

  const urlObj = new URL(url.replace(/^quic:\/\//, 'https://'));
  const path = normalizePath(urlObj.pathname);
  const identityEndpoint = MUTATING_IDENTITY_ENDPOINTS.find(
    e => e.method.toUpperCase() === method.toUpperCase() && normalizePath(e.path) === path
  );
  if (!identityEndpoint) {
    return body;
  }

  const parsed = JSON.parse(body);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid JSON body for identity injection');
  }

  parsed[identityEndpoint.identityField] = identityId;
  if (__DEV__) {
    console.log('[QuicFetchAdapter] ✓ Enforced identity field:', identityEndpoint.identityField);
  }
  return JSON.stringify(parsed);
}

async function prepareQuicRequest(
  url: string,
  init: RequestInit | undefined,
  quicSupported: boolean,
  insecure: boolean,
  timeout: number
): Promise<{ quicUrl: string; quicOptions: QuicRequestOptions }>
{
  if (!quicSupported) {
    throw new Error(
      'QUIC_UNSUPPORTED: QUIC protocol is required but not available on this device.'
    );
  }

  const method = (init?.method || 'GET').toUpperCase();
  const headers = extractHeaders(init);
  let body = extractBody(init);

  const quicUrl = url.replace(/^https?:\/\//, 'quic://');
  const publicEndpoint = isPublicEndpoint(method, quicUrl);
  const alpn: 'public' | 'authenticated' = publicEndpoint ? 'public' : 'authenticated';

  if (!publicEndpoint) {
    let identityId = await SecureIdentityStorage.getIdentityId();
    if (!identityId && isIdentityRegisterEndpoint(method, quicUrl)) {
      identityId = deriveIdentityIdFromRegisterBody(body);
    }
    if (!identityId) {
      throw new Error('Missing identity for authenticated request');
    }

    headers['X-Zhtp-Identity'] = identityId;
    body = await populateIdentityFields(body, quicUrl, method, identityId);
  }

  const quicOptions: QuicRequestOptions = {
    method: method as QuicRequestOptions['method'],
    headers,
    body,
    alpn,
    insecure,
    timeout,
  };

  if (__DEV__) {
    console.log('[🌐 Web4] QuicFetchAdapter: ALPN selection:');
    console.log('[🌐 Web4] QuicFetchAdapter:   URL:', quicUrl);
    console.log('[🌐 Web4] QuicFetchAdapter:   Method:', method);
    console.log('[🌐 Web4] QuicFetchAdapter:   ALPN:', alpn);
  }

  return { quicUrl, quicOptions };
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
  } = options;

  const quicSupported = await isQuicSupported();
  if (!quicSupported) {
    throw new Error(
      'QUIC_UNSUPPORTED: QUIC protocol is required but not available on this device.'
    );
  }

  return async (url: string, init?: RequestInit): Promise<Response> => {
    const { quicUrl, quicOptions } = await prepareQuicRequest(
      url,
      init,
      quicSupported,
      insecure,
      timeout
    );

    const startTime = Date.now();
    const quicResponse = await quicRequest(quicUrl, quicOptions);
    const elapsed = Date.now() - startTime;

    if (__DEV__) {
      console.log('[🌐 Web4] QuicFetchAdapter: Request completed');
      console.log('[🌐 Web4] QuicFetchAdapter:   Time taken:', `${elapsed}ms`);
      console.log('[🌐 Web4] QuicFetchAdapter:   Response body length:', `${quicResponse.body?.length || 0} bytes`);
    }

    return createResponseFromQuic(quicResponse);
  };
}

/**
 * Synchronous version that creates adapter with default behavior
 * Uses the same deterministic request pipeline as the async adapter.
 */
export function createQuicFetchAdapterSync(
  options: QuicFetchAdapterOptions = {}
): FetchAdapter {
  const {
    insecure = __DEV__,
    timeout = 30,
  } = options;

  let quicSupportChecked = false;
  let quicSupported = false;

  return async (url: string, init?: RequestInit): Promise<Response> => {
    if (!quicSupportChecked) {
      quicSupported = await isQuicSupported();
      quicSupportChecked = true;
    }

    const { quicUrl, quicOptions } = await prepareQuicRequest(
      url,
      init,
      quicSupported,
      insecure,
      timeout
    );

    if (__DEV__) {
      console.log('[QuicFetchAdapterSync] ▶️ REQUEST:', {
        url: quicUrl,
        method: quicOptions.method,
        alpn: quicOptions.alpn,
        headers: quicOptions.headers,
        bodyLength: quicOptions.body?.length || 0,
      });
    }

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
  };
}

export default createQuicFetchAdapter;
