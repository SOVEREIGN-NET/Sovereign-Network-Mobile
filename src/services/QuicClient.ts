/**
 * QUIC Client Service
 * Platform-agnostic wrapper for native QUIC implementations
 * Uses Network.framework on iOS and Cronet on Android
 */

import { NativeModules, Platform } from 'react-native';

const { NativeQuic } = NativeModules;

export interface QuicRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  insecure?: boolean; // Allow self-signed certs (dev mode)
  /** ALPN profile: 'public' for unauthenticated, 'authenticated' for UHP (default) */
  alpn?: 'public' | 'authenticated';
}

export interface QuicResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  ok: boolean;
}

export interface QuicConnectionTestResult {
  success: boolean;
  latencyMs: number;
  protocol: string;
  host: string;
  port: number;
}

export interface QuicReachabilityResult {
  reachable: boolean;
  latencyMs?: number;
  host: string;
  port: number;
  error?: string;
  note?: string;
}

export interface QuicConstants {
  ALPN_PROTOCOL: string;
  DEFAULT_TIMEOUT: number;
  MIN_IOS_VERSION: number;
}

/**
 * Check if QUIC transport is available on this device
 */
export async function isQuicSupported(): Promise<boolean> {
  if (!NativeQuic) {
    console.warn('NativeQuic module not available');
    return false;
  }

  try {
    return await NativeQuic.isSupported();
  } catch (error) {
    console.error('Failed to check QUIC support:', error);
    return false;
  }
}

/**
 * Check if a QUIC node is reachable via UDP
 * This is a simple reachability check that doesn't require full QUIC/PQC handshake
 * Useful for showing node status on UI without complex protocol negotiation
 */
export async function checkNodeReachability(
  host: string,
  port: number
): Promise<QuicReachabilityResult> {
  if (!NativeQuic) {
    throw new Error('NativeQuic module not available');
  }

  return await NativeQuic.checkReachability(host, port);
}

/**
 * Test connection to a QUIC server
 * Returns latency and connection info
 * NOTE: This requires full QUIC+PQC handshake which the server expects
 */
export async function testQuicConnection(
  host: string,
  port: number
): Promise<QuicConnectionTestResult> {
  if (!NativeQuic) {
    throw new Error('NativeQuic module not available');
  }

  return await NativeQuic.testConnection(host, port);
}

/**
 * Make an HTTP-like request over QUIC transport
 */
export async function quicRequest(
  url: string,
  options: QuicRequestOptions = {}
): Promise<QuicResponse> {
  if (!NativeQuic) {
    throw new Error('NativeQuic module not available');
  }

  const requestOptions = {
    method: options.method || 'GET',
    headers: options.headers || {},
    body: options.body,
    timeout: options.timeout || 30,
    insecure: options.insecure ?? __DEV__, // Default to insecure in dev
    alpn: options.alpn || 'authenticated', // Default to authenticated (zhtp-uhp/1)
  };

  console.log('[🌐 Web4] QuicClient: Making QUIC request:');
  console.log('[🌐 Web4] QuicClient:   URL:', url);
  console.log('[🌐 Web4] QuicClient:   Method:', requestOptions.method);
  console.log('[🌐 Web4] QuicClient:   ALPN:', requestOptions.alpn);
  console.log('[🌐 Web4] QuicClient:   Timeout:', requestOptions.timeout, 'seconds');
  if (options.body) {
    console.log('[🌐 Web4] QuicClient:   Body:', options.body);
  }

  try {
    const response = await NativeQuic.request(url, requestOptions);
    console.log('[🌐 Web4] QuicClient: Response received:');
    console.log('[🌐 Web4] QuicClient:   Status:', response.status, response.statusText);
    console.log('[🌐 Web4] QuicClient:   Body length:', response.body?.length || 0, 'bytes');
    return response;
  } catch (error) {
    console.error('[🌐 Web4] QuicClient: Request failed:', error);
    throw error;
  }
}

/**
 * Cancel all active QUIC connections
 */
export async function cancelAllQuicConnections(): Promise<boolean> {
  if (!NativeQuic) {
    return false;
  }

  return await NativeQuic.cancelAll();
}

/**
 * Get QUIC module constants
 */
export function getQuicConstants(): QuicConstants | null {
  if (!NativeQuic) {
    return null;
  }

  return NativeQuic.getConstants?.() || {
    ALPN_PROTOCOL: 'zhtp-mesh',
    DEFAULT_TIMEOUT: 30,
    MIN_IOS_VERSION: 15.0,
  };
}

/**
 * Convert a standard URL to QUIC URL format
 * e.g., http://host:port -> quic://host:port
 */
export function toQuicUrl(url: string): string {
  return url
    .replace(/^https?:\/\//, 'quic://')
    .replace(/^quic:\/\//, 'quic://');
}

/**
 * Parse QUIC URL into components
 */
export function parseQuicUrl(url: string): { host: string; port: number; path: string } | null {
  try {
    // Normalize to https for URL parsing
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

/**
 * Test HTTP/3 request to node's health endpoint
 * This verifies the full QUIC+HTTP/3 transport works
 */
export async function testQuicHealthCheck(
  host: string,
  port: number
): Promise<{ success: boolean; data?: any; error?: string; latencyMs?: number }> {
  const startTime = Date.now();

  try {
    const url = `quic://${host}:${port}/api/v1/protocol/health`;
    console.log(`[QuicClient] Testing health endpoint: ${url}`);

    const response = await quicRequest(url, {
      method: 'GET',
      timeout: 10,
      insecure: true,
    });

    const latencyMs = Date.now() - startTime;

    console.log(`[QuicClient] Health response:`, {
      status: response.status,
      ok: response.ok,
      body: response.body?.substring(0, 200),
      latencyMs,
    });

    if (response.ok) {
      let data;
      try {
        data = JSON.parse(response.body);
      } catch {
        data = response.body;
      }
      return { success: true, data, latencyMs };
    } else {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        latencyMs
      };
    }
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    console.error(`[QuicClient] Health check failed:`, error);
    return {
      success: false,
      error: error.message || String(error),
      latencyMs
    };
  }
}

// Default export for convenience
const QuicClient = {
  isSupported: isQuicSupported,
  checkReachability: checkNodeReachability,
  testConnection: testQuicConnection,
  testHealthCheck: testQuicHealthCheck,
  request: quicRequest,
  cancelAll: cancelAllQuicConnections,
  getConstants: getQuicConstants,
  toQuicUrl,
  parseQuicUrl,
  platform: Platform.OS,
};

export default QuicClient;
