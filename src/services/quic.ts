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
];

/**
 * Mutating endpoints that require identity auto-population.
 * The server derives sender/creator from the authenticated session.
 */
const MUTATING_IDENTITY_ENDPOINTS = [
  { method: 'POST', path: '/api/v1/token/create', identityField: 'creator_identity' },
  { method: 'POST', path: '/api/v1/token/mint', identityField: 'creator_identity' },
  { method: 'POST', path: '/api/v1/token/transfer', identityField: 'from' },
] as const;

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
  return pSegs.every((p, i) => p.startsWith(':') ? !!aSegs[i] : p === aSegs[i]);
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
  return method === 'POST' && normalizePath(path) === '/api/v1/identity/register';
}

function deriveIdentityIdFromBody(body: string | undefined): string | undefined {
  if (!body) return undefined;
  try {
    const did: string | undefined = JSON.parse(body)?.did;
    if (!did || typeof did !== 'string') return undefined;
    return did.startsWith('did:zhtp:') ? did.substring('did:zhtp:'.length) : did;
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
  return path.replace(
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
}

async function rawRequest(
  path: string,
  options: RequestOptions & { alpnOverride?: 'public' | 'authenticated' } = {},
): Promise<QuicRawResponse> {
  if (!NativeQuic) {
    throw new Error('NativeQuic module not available');
  }

  const method: HttpMethod = options.method ?? 'GET';
  const headers: Record<string, string> = { ...options.headers };
  let body = options.body;

  const alpn = options.alpnOverride
    ?? (isPublicEndpoint(method, path) ? 'public' : 'authenticated');

  // Inject identity for authenticated requests
  if (alpn === 'authenticated') {
    let identityId = await SecureIdentityStorage.getIdentityId();
    if (!identityId && isIdentityRegisterPath(method, path)) {
      identityId = deriveIdentityIdFromBody(body) ?? null;
    }
    if (!identityId) {
      throw new Error('Missing identity for authenticated request');
    }
    headers['X-Zhtp-Identity'] = identityId;
    body = populateIdentityFields(body, path, method, identityId);
  }

  const url = `quic://${DEFAULT_NODE_HOST}:${DEFAULT_NODE_PORT}${path}`;

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

  const response: QuicRawResponse = await NativeQuic.request(url, requestOptions);

  if (alpn === 'authenticated') {
    const sid = (response as any)?.sessionIdPrefix;
    if (typeof sid === 'string' && /^[0-9a-fA-F]{16}$/.test(sid)) {
      latestAuthSessionIdPrefix = sid.toLowerCase();
    }
  }

  if (__DEV__) {
    console.log('[quic] response:', response.status, response.statusText,
      `(${response.body?.length ?? 0} bytes)`);
  }

  return response;
}

export async function getCurrentAuthSessionIdPrefix(options?: {
  forceRefresh?: boolean;
}): Promise<string | null> {
  const forceRefresh = options?.forceRefresh === true;
  if (!forceRefresh && latestAuthSessionIdPrefix) return latestAuthSessionIdPrefix;
  if (!NativeQuic?.getCurrentSessionIdPrefix) return null;

  const identityId = await SecureIdentityStorage.getIdentityId();
  if (!identityId) return null;

  // Force a fresh authenticated request so native captures the newest session ID.
  if (forceRefresh) {
    try {
      const did = toDid(normalizeIdentityId(identityId));
      await rawRequest(`/api/v1/pouw/rewards/${encodeURIComponent(did)}`, {
        method: 'GET',
        alpnOverride: 'authenticated',
      });
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
  const response = await rawRequest(path, { ...options, alpnOverride: 'public' });

  if (!response.ok) {
    let code: string | undefined;
    let body: unknown;
    try {
      body = JSON.parse(response.body);
      code = (body as Record<string, unknown>)?.code as string | undefined;
    } catch {
      body = response.body;
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
      try { data = JSON.parse(response.body); } catch { data = response.body; }
      return { success: true, data, latencyMs };
    }
    return { success: false, error: `HTTP ${response.status}: ${response.statusText}`, latencyMs };
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

export function parseQuicUrl(url: string): { host: string; port: number; path: string } | null {
  try {
    const normalized = url.replace(/^quic:\/\//, 'https://');
    const parsed = new URL(normalized);
    return {
      host: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port, 10) : 443,
      path: parsed.pathname + parsed.search,
    };
  } catch {
    return null;
  }
}

export const quicPlatform = Platform.OS;
