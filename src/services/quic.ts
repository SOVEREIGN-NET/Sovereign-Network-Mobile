/**
 * QUIC Transport Layer — single entry point for all node communication
 *
 * Replaces QuicClient.ts + QuicFetchAdapter.ts with one module.
 * Handles ALPN routing, identity injection, JSON parsing, and typed errors.
 *
 * ALPN ROUTING (DO NOT DRIFT):
 * - PUBLIC (read-only, no auth) → zhtp-public/1 (no UHP handshake)
 * - AUTHENTICATED (write / identity / proof) → zhtp-uhp/2 (UHP handshake required)
 * Default-deny: everything is authenticated unless explicitly listed in PUBLIC_ENDPOINTS.
 */

import { NativeModules, Platform } from 'react-native';
import { DEFAULT_NODE_HOST, DEFAULT_NODE_PORT, QUIC_CONFIG } from '../config';
import SecureIdentityStorage from './SecureIdentityStorage';
// Gate the transport on ZDNS bootstrap — ensures the first request dials
// the DNS-selected validator, not the hardcoded fallback.
import { bootstrapReady } from './NetworkBootstrap';
import {
  dropSession as dropQuicSession,
  getSession as getQuicSession,
} from './QuicSessionManager';
import {
  isNativeQuicSessionAvailable,
  NativeQuicSession,
} from './NativeQuicSession';
import type {
  QuicRequestOptions,
  QuicRawResponse,
  QuicConnectionTestResult,
  QuicHealthCheckResult,
  HttpMethod,
} from '../types/api';
import { QuicError } from '../types/api';

const { NativeQuic } = NativeModules;
let latestAuthSessionIdPrefix: string | null = null;

// ---------------------------------------------------------------------------
// ALPN routing tables
// ---------------------------------------------------------------------------

type EndpointRule = { method: string; path: string };

/**
 * Public endpoints that don't require authentication.
 * Keep in sync with protocol rules.
 */
const PUBLIC_ENDPOINTS: EndpointRule[] = [
  { method: 'GET', path: '/health' },
  { method: 'GET', path: '/api/v1/protocol/health' },
  { method: 'GET', path: '/api/v1/protocol/info' },
  { method: 'GET', path: '/api/v1/blockchain/balance/:address' },
  { method: 'GET', path: '/api/v1/web4/domains/status/:domain' },
  { method: 'GET', path: '/api/v1/identity/username/available/:username' },
  { method: 'POST', path: '/api/v1/identity/recover' },
  { method: 'POST', path: '/api/v1/identity/migrate' },
  { method: 'POST', path: '/api/v1/identity/register' },
  { method: 'GET', path: '/api/v1/blockchain/fee-config' },
  { method: 'GET', path: '/api/v1/chain/info' },
  { method: 'GET', path: '/api/v1/blockchain/status' },
  { method: 'GET', path: '/api/v1/blockchain/tip' },
];

/**
 * Mutating endpoints that require identity auto-population.
 * The server derives sender/creator from the authenticated session.
 */
// Token endpoints use signed_tx — identity is embedded in the transaction,
// not injected as a separate body field.
const MUTATING_IDENTITY_ENDPOINTS: { method: string; path: string; identityField: string }[] = [];

// ---------------------------------------------------------------------------
// Path matching helpers
// ---------------------------------------------------------------------------

function normalizePath(pathname: string): string {
  if (!pathname || pathname === '/') return '/';
  return pathname.replace(/\/+$/, '');
}

function matchPath(pattern: string, actual: string): boolean {
  const pSegs = normalizePath(pattern).split('/').filter(Boolean);
  const aSegs = normalizePath(actual).split('/').filter(Boolean);
  if (pSegs.length !== aSegs.length) return false;
  return pSegs.every((p, i) =>
    p.startsWith(':') ? !!aSegs[i] : p === aSegs[i],
  );
}

function isPublicEndpoint(method: string, path: string): boolean {
  const m = method.toUpperCase();
  const p = normalizePath(path);
  return PUBLIC_ENDPOINTS.some(
    e => e.method.toUpperCase() === m && matchPath(e.path, p),
  );
}

// ---------------------------------------------------------------------------
// Identity injection
// ---------------------------------------------------------------------------

function isIdentityRegisterPath(method: string, path: string): boolean {
  return (
    method === 'POST' && normalizePath(path) === '/api/v1/identity/register'
  );
}

function deriveIdentityIdFromBody(
  body: string | undefined,
): string | undefined {
  if (!body) return undefined;
  try {
    const did: string | undefined = JSON.parse(body)?.did;
    if (!did || typeof did !== 'string') return undefined;
    return did.startsWith('did:zhtp:')
      ? did.substring('did:zhtp:'.length)
      : did;
  } catch {
    return undefined;
  }
}

function normalizeIdentityId(value: string): string {
  return value.startsWith('did:zhtp:')
    ? value.substring('did:zhtp:'.length)
    : value;
}

function toDid(value: string): string {
  return value.startsWith('did:zhtp:') ? value : `did:zhtp:${value}`;
}

function redactDidInPath(path: string): string {
  return path.replaceAll(
    /(did%3Azhtp%3A|did:zhtp:)[A-Za-z0-9%._:-]+/gi,
    (_, prefix: string) => `${prefix}<redacted>`,
  );
}

function populateIdentityFields(
  body: string | undefined,
  path: string,
  method: string,
  identityId: string,
): string | undefined {
  if (!body || method === 'GET') return body;
  const p = normalizePath(path);
  const rule = MUTATING_IDENTITY_ENDPOINTS.find(
    e => e.method === method && normalizePath(e.path) === p,
  );
  if (!rule) return body;

  const parsed = JSON.parse(body);
  parsed[rule.identityField] = identityId;
  if (__DEV__) {
    console.log('[quic] enforced identity field:', rule.identityField);
  }
  return JSON.stringify(parsed);
}

// ---------------------------------------------------------------------------
// Core request
// ---------------------------------------------------------------------------

interface RequestOptions {
  method?: HttpMethod;
  body?: string;
  headers?: Record<string, string>;
  timeout?: number;
  /**
   * Override the target node. Defaults to `DEFAULT_NODE_HOST` /
   * `DEFAULT_NODE_PORT`. Used to pin the rewards endpoints to g1 (they
   * 503 on every other validator by design) regardless of where
   * general API traffic is routed — see `RewardsService`.
   */
  host?: string;
  port?: number;
}

/**
 * A native error or 401 body indicating the current UHP session has
 * desynced from the server (counter replay, framing mismatch, stale
 * session cache). The client-side remedy is to drop the session and
 * re-handshake on the next call.
 */
const SESSION_DESYNC_PATTERNS = [
  /invalid counter/i,
  /possible replay/i,
  /not enough bytes for length header/i,
  /session (not found|expired|mismatch)/i,
];

function matchesSessionDesync(text: string | undefined): boolean {
  if (!text) return false;
  return SESSION_DESYNC_PATTERNS.some(p => p.test(text));
}

/**
 * Force any cached UHP session to be abandoned so the next authenticated
 * request performs a fresh handshake. Best-effort: ignore native errors.
 */
async function resetAuthSession(): Promise<void> {
  // Drop both transports — the persistent session (used when the new
  // FFI is available) and the legacy one-shot pool — so the retry
  // re-handshakes from scratch.
  dropQuicSession();
  if (!NativeQuic?.cancelAll) return;
  try {
    await NativeQuic.cancelAll();
  } catch {
    /* best-effort */
  }
  latestAuthSessionIdPrefix = null;
  // Small gap so any in-flight native drain finishes closing its handle
  // before we queue the retry onto a fresh handshake.
  await new Promise<void>(resolve => setTimeout(() => resolve(), 100));
}

/**
 * Convert a body string to base64 for the persistent-session bridge.
 * The legacy `NativeQuic.request` takes raw UTF-8 in `options.body`;
 * the new bridge takes base64 so binary payloads survive the JS
 * channel. Everything we send is JSON for now so a UTF-8 → base64
 * step is correct; binary callers will pre-base64 their body and we
 * pass it through.
 */
function utf8ToBase64(s: string): string {
  // RN polyfills `btoa`, but it expects binary string input. JSON
  // text is ASCII enough in practice; for safety, encode through
  // a UTF-8 byte conversion first.
  let binary = '';
  // unescape(encodeURIComponent(x)) is the standard hack to coerce
  // arbitrary UTF-8 into a binary string for btoa.
  const utf8 = unescape(encodeURIComponent(s));
  for (let i = 0; i < utf8.length; i++) binary += utf8.charAt(i);
  const g = globalThis as unknown as {
    btoa?: (s: string) => string;
    Buffer?: { from: (s: string, e: string) => { toString: (e: string) => string } };
  };
  if (typeof g.btoa === 'function') return g.btoa(binary);
  return g.Buffer!.from(binary, 'binary').toString('base64');
}

/**
 * Send one request over the persistent QUIC session. Returns the
 * response in the same `QuicRawResponse` shape as the legacy path so
 * the rest of the stack doesn't care which transport was used.
 */
// Serialization tail for persistent-session RPCs.
//
// Every authenticated request multiplexes over ONE UHP session. The
// session carries a monotonic sequence counter and the server's
// replay protection rejects out-of-order sequences. When a screen
// fires several authenticated calls at once (the wallet screen
// fans out wallet/list + token/balances + transactions + token/list
// simultaneously), those RPCs race for sequence numbers — the
// server sees them out of order and resets the streams, surfacing
// as opaque `rpcFailed` nulls from the FFI.
//
// Chaining each RPC onto the previous one's completion guarantees
// in-order sequence allocation. The legacy one-shot transport was
// already effectively serialized (one connection, one request), so
// this is not a regression — it restores the ordering the UHP
// counter assumes.
let rpcTail: Promise<unknown> = Promise.resolve();

async function runOverPersistentSession(
  path: string,
  opts: QuicRequestOptions,
): Promise<QuicRawResponse> {
  const run = async (): Promise<QuicRawResponse> => {
    const sessionId = await getQuicSession();
    // Pass empty strings instead of null — RN's iOS bridge logs
    // "JSON value '<null>' of type NSNull cannot be converted to
    // NSString" otherwise. Empty string is safe: the FFI's
    // headers_json is underscored (ignored), and an empty body is
    // valid for GET / DELETE.
    const bodyB64 = opts.body != null ? utf8ToBase64(opts.body) : '';
    const headersJson =
      opts.headers && Object.keys(opts.headers).length > 0
        ? JSON.stringify(opts.headers)
        : '';
    const r = await NativeQuicSession.rpc(
      sessionId,
      opts.method ?? 'GET',
      path,
      headersJson,
      bodyB64,
    );
    return {
      status: r.status,
      statusText: r.statusText,
      headers: r.headers,
      body: r.body,
      ok: r.ok,
    } as QuicRawResponse;
  };

  // Append to the tail; a prior failure must not wedge the queue,
  // so the tail swallows errors (callers still see their own).
  const result = rpcTail.then(run, run);
  rpcTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/**
 * Run a single UHP-authenticated (or public) QUIC request with bounded
 * retries for session-desync symptoms. Extracted so `rawRequest` stays
 * under Sonar's cognitive-complexity threshold — the retry logic itself
 * is identical to the inline version it replaces.
 *
 * Retries on:
 *   - thrown errors whose message matches `matchesSessionDesync`
 *   - 401 responses with "Invalid counter"-style bodies
 * Both cases reset the UHP session via `resetAuthSession` before the
 * next attempt. Public (`zhtp-public/1`) requests never retry.
 */
async function runWithSessionRecovery(
  url: string,
  requestOptions: QuicRequestOptions,
  alpn: 'public' | 'authenticated',
  maxAttempts: number,
): Promise<QuicRawResponse> {
  // Authenticated requests go through the persistent QUIC session
  // when the new FFI is wired: one PQC handshake at sign-in, all
  // subsequent RPCs multiplex over the same connection. Public
  // requests + platforms without the bridge (Android until its
  // build ships) fall back to the legacy one-shot
  // `NativeQuic.request`.
  const usePersistent =
    alpn === 'authenticated' && isNativeQuicSessionAvailable;
  const parsed = parseQuicUrl(url);
  const pathOnly = parsed ? parsed.path : url;

  for (let i = 1; i <= maxAttempts; i++) {
    let current: QuicRawResponse;
    try {
      current = usePersistent
        ? await runOverPersistentSession(pathOnly, requestOptions)
        : await NativeQuic.request(url, requestOptions);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // A throw from the persistent-session path is opaque — the FFI
      // collapses every failure (dead connection, stream reset,
      // serialization error) into `rpcFailed`. Treat any such throw
      // as a session-desync: drop the session and re-handshake on
      // the next attempt. The legacy one-shot path keeps the
      // narrower `matchesSessionDesync` gate since its errors are
      // descriptive.
      const retryable =
        alpn === 'authenticated' &&
        (usePersistent || matchesSessionDesync(msg));
      if (!retryable || i === maxAttempts) throw err;
      if (__DEV__) {
        console.warn(
          `[quic] auth request failed (attempt ${i}/${maxAttempts}), re-handshaking:`,
          msg,
        );
      }
      await resetAuthSession();
      continue;
    }

    const shouldRetry401 =
      alpn === 'authenticated' &&
      current.status === 401 &&
      matchesSessionDesync(current.body) &&
      i < maxAttempts;
    if (shouldRetry401) {
      if (__DEV__) {
        // Counter-replay 401s are part of the normal UHP recovery loop —
        // a stale server-side session is replaced by a fresh handshake
        // and the request retries transparently. Logged at info level
        // so a routine retry doesn't surface as a red warning; if all
        // attempts ultimately fail, the caller's error logging takes
        // over.
        console.log(
          `[quic] 401 counter-replay detected (attempt ${i}/${maxAttempts}), re-handshaking`,
        );
      }
      await resetAuthSession();
      continue;
    }

    return current;
  }
  // Unreachable: the loop body either returns, continues, or throws.
  throw new Error('QUIC request exhausted retry attempts');
}

async function rawRequest(
  path: string,
  options: RequestOptions & { alpnOverride?: 'public' | 'authenticated' } = {},
): Promise<QuicRawResponse> {
  if (!NativeQuic) {
    throw new Error('NativeQuic module not available');
  }

  // Wait for ZDNS bootstrap (resolves quickly or times out — never hangs).
  // This is why the very first request no longer dials the hardcoded target.
  await bootstrapReady;

  const method: HttpMethod = options.method ?? 'GET';
  const headers: Record<string, string> = { ...options.headers };
  let body = options.body;

  const alpn =
    options.alpnOverride ??
    (isPublicEndpoint(method, path) ? 'public' : 'authenticated');

  // Inject identity for authenticated requests
  if (alpn === 'authenticated') {
    let identityId = await SecureIdentityStorage.getIdentityId();
    if (!identityId && isIdentityRegisterPath(method, path)) {
      identityId = deriveIdentityIdFromBody(body) ?? null;
    }
    if (!identityId) {
      throw new Error('Missing identity for authenticated request');
    }
    // SecureIdentityStorage.getIdentityId() returns the cached
    // `did:zhtp:<hex>` form (it's literally the persisted DID). A
    // few server handlers (wallet/token routes specifically) read
    // `X-Zhtp-Identity` as raw hex and `hex::decode` chokes on the
    // `did:zhtp:` prefix or its `:` separators, surfacing as
    // 500 "Invalid hex for identity_id: Odd number of digits". The
    // canonical form for the header is bare hex — strip the prefix
    // here so every handler gets the same shape.
    headers['X-Zhtp-Identity'] = normalizeIdentityId(identityId);
    body = populateIdentityFields(body, path, method, identityId);
  }

  const url = `quic://${options.host ?? DEFAULT_NODE_HOST}:${
    options.port ?? DEFAULT_NODE_PORT
  }${path}`;

  const requestOptions: QuicRequestOptions = {
    method,
    headers,
    body,
    alpn,
    timeout: options.timeout ?? QUIC_CONFIG.defaultTimeout,
  };

  if (__DEV__) {
    console.log('[quic] request:', method, redactDidInPath(path), `(${alpn})`);
  }

  // Attempt the request up to MAX_ATTEMPTS times, recycling the UHP session
  // between attempts when the failure signature matches a known desync
  // (framing error at native layer, or 401 "Invalid counter" from the
  // server). Stale server-side session caches can take more than one fresh
  // handshake to clear, so a single retry is not always enough.
  const MAX_ATTEMPTS = 3;
  const response = await runWithSessionRecovery(
    url,
    requestOptions,
    alpn,
    MAX_ATTEMPTS,
  );

  if (alpn === 'authenticated') {
    const sid = (response as { sessionIdPrefix?: unknown })?.sessionIdPrefix;
    if (typeof sid === 'string' && /^[0-9a-fA-F]{16}$/.test(sid)) {
      latestAuthSessionIdPrefix = sid.toLowerCase();
    }
  }

  if (__DEV__) {
    console.log(
      '[quic] response:',
      response.status,
      response.statusText,
      `(${response.body?.length ?? 0} bytes)`,
    );
  }

  return response;
}

export async function getCurrentAuthSessionIdPrefix(options?: {
  forceRefresh?: boolean;
}): Promise<string | null> {
  const forceRefresh = options?.forceRefresh === true;
  if (!forceRefresh && latestAuthSessionIdPrefix)
    return latestAuthSessionIdPrefix;
  if (!NativeQuic?.getCurrentSessionIdPrefix) return null;

  const identityId = await SecureIdentityStorage.getIdentityId();
  if (!identityId) return null;

  // Force a fresh authenticated request so native captures the newest session ID.
  if (forceRefresh) {
    latestAuthSessionIdPrefix = null;
    try {
      const did = toDid(normalizeIdentityId(identityId));
      await rawRequest(`/api/v1/pouw/rewards/${encodeURIComponent(did)}`, {
        method: 'GET',
        alpnOverride: 'authenticated',
      });
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch {
      // Best-effort refresh; fallback to native getter below.
    }
  }

  try {
    const sid = await NativeQuic.getCurrentSessionIdPrefix(identityId);
    if (typeof sid === 'string' && /^[0-9a-fA-F]{16}$/.test(sid)) {
      latestAuthSessionIdPrefix = sid.toLowerCase();
      return latestAuthSessionIdPrefix;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Make a typed QUIC request. ALPN is auto-detected from the path.
 * Authenticated requests get identity headers injected automatically.
 * Throws QuicError on non-2xx responses.
 */
export async function quicRequest<T>(
  path: string,
  options?: RequestOptions,
): Promise<T> {
  const response = await rawRequest(path, options);

  if (!response.ok) {
    let code: string | undefined;
    let body: unknown;
    try {
      body = JSON.parse(response.body);
      code = (body as Record<string, unknown>)?.code as string | undefined;
    } catch {
      body = response.body;
    }
    if (__DEV__) {
      // 5xx logged as errors — except 503 Service Unavailable, which is
      // an expected "not here / not ready" state rather than a fault:
      // the rewards endpoints answer 503 on every non-rewards node and
      // before the rewards module is deployed at all. 4xx are likewise
      // expected client outcomes (auth, not-found), so both log quietly.
      if (response.status >= 500 && response.status !== 503) {
        console.error('[quic] error body:', response.body);
      } else {
        console.log('[quic] error body:', response.body);
      }
    }
    throw new QuicError(response.status, response.statusText, code, body);
  }

  return JSON.parse(response.body) as T;
}

/**
 * Make a public (unauthenticated) QUIC request.
 * Use when you know the endpoint is public and want to skip identity injection.
 */
export async function publicQuicRequest<T>(
  path: string,
  options?: RequestOptions,
): Promise<T> {
  const response = await rawRequest(path, {
    ...options,
    alpnOverride: 'public',
  });

  if (!response.ok) {
    let code: string | undefined;
    let body: unknown;
    try {
      body = JSON.parse(response.body);
      code = (body as Record<string, unknown>)?.code as string | undefined;
    } catch {
      body = response.body;
    }
    if (__DEV__) {
      // 503 is an expected "not ready" state, not a fault — log it
      // quietly like a 4xx (see the same note in quicRequest).
      if (response.status >= 500 && response.status !== 503) {
        console.error('[quic] error body:', response.body);
      } else {
        console.log('[quic] error body:', response.body);
      }
    }
    throw new QuicError(response.status, response.statusText, code, body);
  }

  return JSON.parse(response.body) as T;
}

/**
 * Make a raw QUIC request without JSON parsing.
 * Returns the raw response for callers that need status/headers inspection.
 */
export async function quicRequestRaw(
  path: string,
  options?: RequestOptions & { alpnOverride?: 'public' | 'authenticated' },
): Promise<QuicRawResponse> {
  return rawRequest(path, options);
}

// ---------------------------------------------------------------------------
// Connectivity helpers
// ---------------------------------------------------------------------------

export async function isQuicSupported(): Promise<boolean> {
  if (!NativeQuic) {
    if (__DEV__) console.warn('NativeQuic module not available');
    return false;
  }
  try {
    return await NativeQuic.isSupported();
  } catch {
    return false;
  }
}

export async function testQuicConnection(
  host: string,
  port: number,
): Promise<QuicConnectionTestResult> {
  if (!NativeQuic) throw new Error('NativeQuic module not available');
  // Gate on ZDNS bootstrap too — the test probe should reflect the active
  // validator, not the hardcoded default.
  await bootstrapReady;
  return await NativeQuic.testConnection(host, port);
}

export async function testQuicHealthCheck(
  host: string,
  port: number,
): Promise<QuicHealthCheckResult> {
  const startTime = Date.now();
  try {
    const url = `quic://${host}:${port}/api/v1/protocol/health`;
    const response: QuicRawResponse = await NativeQuic.request(url, {
      method: 'GET',
      headers: {},
      timeout: 10,
      insecure: QUIC_CONFIG.insecure,
      alpn: 'public',
    });
    const latencyMs = Date.now() - startTime;
    if (response.ok) {
      let data: unknown;
      try {
        data = JSON.parse(response.body);
      } catch {
        data = response.body;
      }
      return { success: true, data, latencyMs };
    }
    return {
      success: false,
      error: `HTTP ${response.status}: ${response.statusText}`,
      latencyMs,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - startTime,
    };
  }
}

export async function cancelAllQuicConnections(): Promise<boolean> {
  if (!NativeQuic) return false;
  return await NativeQuic.cancelAll();
}

// ---------------------------------------------------------------------------
// URL utilities
// ---------------------------------------------------------------------------

export function toQuicUrl(url: string): string {
  return url.replace(/^https?:\/\//, 'quic://');
}

export function parseQuicUrl(
  url: string,
): { host: string; port: number; path: string } | null {
  try {
    const normalized = url.replace(/^quic:\/\//, 'https://');
    const parsed = new URL(normalized);
    return {
      host: parsed.hostname,
      port: parsed.port ? Number.parseInt(parsed.port, 10) : 443,
      path: parsed.pathname + parsed.search,
    };
  } catch {
    return null;
  }
}

export const quicPlatform = Platform.OS;
