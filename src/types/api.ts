/**
 * Transport layer types for QUIC communication
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface QuicRequestOptions {
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  alpn?: 'public' | 'authenticated';
}

/** Raw response from NativeModules.NativeQuic — body is always a JSON string */
export interface QuicRawResponse {
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

export interface QuicHealthCheckResult {
  success: boolean;
  data?: unknown;
  error?: string;
  latencyMs?: number;
}

/**
 * Typed error for QUIC request failures.
 * Thrown when the node returns a non-2xx status.
 */
export class QuicError extends Error {
  public readonly status: number;
  public readonly statusText: string;
  public readonly code: string | undefined;
  public readonly body: unknown;

  constructor(
    status: number,
    statusText: string,
    code?: string,
    body?: unknown,
  ) {
    super(`QUIC ${status} ${statusText}${code ? ` [${code}]` : ''}`);
    this.name = 'QuicError';
    this.status = status;
    this.statusText = statusText;
    this.code = code;
    this.body = body;
  }
}
