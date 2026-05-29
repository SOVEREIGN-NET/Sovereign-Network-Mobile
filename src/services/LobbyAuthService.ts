/**
 * LobbyAuthService — drives the OPAQUE register / login handshakes.
 *
 * OPAQUE is a two-round-trip protocol. Each flow interleaves a native
 * call (`NativeLobbyAuth`, which holds the OPRF blinding state) with a
 * server call (`/api/v1/auth/opaque/*`). The password never leaves the
 * device in any form a server or network observer can attack offline.
 *
 * Endpoint contract (server epic #2554, S3 #2557):
 *   register/start  {username, msg1_b64}            -> {msg2_b64, request_id}
 *   register/finish {request_id, record_b64, did}   -> {status, did, username}
 *   login/start     {username, msg1_b64}            -> {msg2_b64, request_id}
 *   login/finish    {request_id, msg3_b64}          -> {session_token, ...}
 *
 * Registration is split begin/complete: `register/start` is cheap and
 * rejects a taken username up front, so the caller can fail fast there
 * — before creating a wallet — and only run `register/finish` once the
 * wallet DID exists. register/finish is the one call bound to the
 * Dilithium identity (the server checks `did` against the QUIC
 * requester key), so it rides the authenticated ALPN.
 */

import { NativeLobbyAuth } from './NativeLobbyAuth';
import { quicRequestRaw } from './quic';
import { LobbyAuthError } from '../types/lobby';
import type { LobbySession } from '../types/lobby';

const REGISTER_START = '/api/v1/auth/opaque/register/start';
const REGISTER_FINISH = '/api/v1/auth/opaque/register/finish';
const LOGIN_START = '/api/v1/auth/opaque/login/start';
const LOGIN_FINISH = '/api/v1/auth/opaque/login/finish';

interface StartResponse {
  msg2_b64: string;
  request_id: string;
}
interface LoginFinishResponse {
  status: string;
  session_token: string;
  did: string;
  username: string;
  access_zone: string;
}

/**
 * In-flight registration handle returned by `opaqueRegisterBegin`. Hold
 * it across wallet creation, then pass to `opaqueRegisterComplete` (or
 * `opaqueRegisterCancel` if the flow is abandoned). Opaque to callers —
 * they only carry it from begin to complete.
 */
export interface RegisterHandle {
  /** Native OPAQUE state handle (held until finish/cancel). */
  stateId: string;
  /** Server-side ephemeral request id (60 s TTL). */
  requestId: string;
  /** Server's `register/start` reply — input to the OPAQUE second leg. */
  serverMsg2B64: string;
}

// ─── Server error mapping ─────────────────────────────────────────────

/** Pull a "retry after Ns" hint out of a server error body. */
function parseRetryAfter(body: string): number | undefined {
  const m = /retry\s*after\s*(\d+)\s*s/i.exec(body) ?? /(\d+)\s*s\b/.exec(body);
  if (!m) return undefined;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : undefined;
}

/** Map a non-2xx OPAQUE-endpoint response to a typed LobbyAuthError. */
function mapServerError(status: number, body: string): LobbyAuthError {
  const text = body || '';
  switch (status) {
    case 401:
      return new LobbyAuthError('wrong_password', 'Incorrect username or password.');
    case 409:
      if (/upgrade_required/i.test(text)) {
        return new LobbyAuthError(
          'upgrade_required',
          'This account needs a one-time security upgrade.',
        );
      }
      return new LobbyAuthError('username_taken', 'That username is already taken.');
    case 410:
    case 404:
      return new LobbyAuthError(
        'request_expired',
        'The request timed out. Please try again.',
      );
    case 423:
      return new LobbyAuthError(
        'locked',
        'Account temporarily locked.',
        parseRetryAfter(text),
      );
    case 429: {
      const retry = parseRetryAfter(text);
      if (/locked/i.test(text)) {
        return new LobbyAuthError('locked', 'Account temporarily locked.', retry);
      }
      if (/ip throttled/i.test(text)) {
        return new LobbyAuthError(
          'ip_throttled',
          'Too many attempts from this network.',
          retry,
        );
      }
      return new LobbyAuthError(
        'rate_limited',
        'Too many attempts. Please wait before trying again.',
        retry,
      );
    }
    case 503:
      return new LobbyAuthError(
        'not_configured',
        'Lobby sign-in is not available on this network.',
      );
    default:
      return new LobbyAuthError(
        'unknown',
        `Server error (${status}). Please try again.`,
      );
  }
}

/** Wrap a thrown native/transport error as a LobbyAuthError. */
function asLobbyError(e: unknown): LobbyAuthError {
  if (e instanceof LobbyAuthError) return e;
  const code = (e as { code?: string })?.code;
  const message = e instanceof Error ? e.message : String(e);
  if (code === 'WRONG_PASSWORD') {
    return new LobbyAuthError('wrong_password', 'Incorrect username or password.');
  }
  return new LobbyAuthError('network', message || 'Network error.');
}

// ─── Server POST helper ───────────────────────────────────────────────

async function postOpaque<T>(
  path: string,
  body: Record<string, unknown>,
  alpn: 'public' | 'authenticated',
): Promise<T> {
  const res = await quicRequestRaw(path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    alpnOverride: alpn,
  });
  if (!res.ok) throw mapServerError(res.status, res.body);
  return JSON.parse(res.body) as T;
}

// ─── Registration ─────────────────────────────────────────────────────

/**
 * Begin registration: run the OPAQUE first leg and `register/start`.
 * Rejects (kind `username_taken`) before any wallet is created if the
 * name is already claimed. The returned handle MUST be passed to
 * `opaqueRegisterComplete` or `opaqueRegisterCancel`.
 */
export async function opaqueRegisterBegin(params: {
  username: string;
  password: string;
}): Promise<RegisterHandle> {
  const username = params.username.trim().toLowerCase();
  let stateId: string | null = null;
  try {
    const started = await NativeLobbyAuth.opaqueRegisterStart(params.password);
    stateId = started.stateId;
    const startRes = await postOpaque<StartResponse>(
      REGISTER_START,
      { username, msg1_b64: started.requestB64 },
      'public',
    );
    return {
      stateId,
      requestId: startRes.request_id,
      serverMsg2B64: startRes.msg2_b64,
    };
  } catch (err) {
    if (stateId) {
      await NativeLobbyAuth.opaqueRegisterCancel(stateId).catch(() => {});
    }
    throw asLobbyError(err);
  }
}

/**
 * Complete registration: finish the OPAQUE handshake and upload the
 * credential record bound to the wallet `did`. The `register/finish`
 * call rides the authenticated ALPN — the wallet identity must already
 * be created + stored so the server can match `did` to the requester.
 *
 * Consumes the handle. Registration alone does not establish a session;
 * follow with `opaqueLogin`.
 */
export async function opaqueRegisterComplete(
  handle: RegisterHandle,
  password: string,
  did: string,
): Promise<void> {
  try {
    // opaqueRegisterFinish consumes the native state regardless of outcome.
    const finished = await NativeLobbyAuth.opaqueRegisterFinish(
      handle.stateId,
      password,
      handle.serverMsg2B64,
    );
    await postOpaque(
      REGISTER_FINISH,
      { request_id: handle.requestId, record_b64: finished.recordB64, did },
      'authenticated',
    );
  } catch (err) {
    throw asLobbyError(err);
  }
}

/** Release a registration handle that will not be completed. */
export async function opaqueRegisterCancel(
  handle: RegisterHandle,
): Promise<void> {
  await NativeLobbyAuth.opaqueRegisterCancel(handle.stateId).catch(() => {});
}

// ─── Login ────────────────────────────────────────────────────────────

/**
 * Run the OPAQUE login handshake and return a fresh `LobbySession`.
 * Does not persist anything — the caller owns session lifecycle.
 *
 * Throws `LobbyAuthError`; `kind === 'upgrade_required'` means a legacy
 * argon2id account that must be re-registered via OPAQUE.
 */
export async function opaqueLogin(params: {
  username: string;
  password: string;
}): Promise<LobbySession> {
  const username = params.username.trim().toLowerCase();
  const { password } = params;

  let stateId: string | null = null;
  try {
    const started = await NativeLobbyAuth.opaqueLoginStart(password);
    stateId = started.stateId;

    let startRes: StartResponse;
    try {
      startRes = await postOpaque<StartResponse>(
        LOGIN_START,
        { username, msg1_b64: started.requestB64 },
        'public',
      );
    } catch (serverErr) {
      await NativeLobbyAuth.opaqueLoginCancel(stateId).catch(() => {});
      stateId = null;
      throw serverErr;
    }

    const finished = await NativeLobbyAuth.opaqueLoginFinish(
      stateId,
      password,
      startRes.msg2_b64,
    );
    stateId = null;

    const loginRes = await postOpaque<LoginFinishResponse>(
      LOGIN_FINISH,
      { request_id: startRes.request_id, msg3_b64: finished.msg3B64 },
      'public',
    );

    return {
      sessionToken: loginRes.session_token,
      sessionKeyB64: finished.sessionKeyB64,
      did: loginRes.did,
      username: loginRes.username,
      accessZone: loginRes.access_zone,
      createdAt: Date.now(),
    };
  } catch (err) {
    if (stateId) {
      await NativeLobbyAuth.opaqueLoginCancel(stateId).catch(() => {});
    }
    throw asLobbyError(err);
  }
}
