/**
 * QuicSessionManager — singleton that owns one persistent
 * authenticated QUIC session per signed-in identity.
 *
 * Lifecycle:
 *   - `bindIdentity(did)` is called by AuthContext when the
 *     signed-in identity changes.
 *   - The first `getSession()` after that opens (lazily) the
 *     session against the configured node, identified to the
 *     server via the in-memory `Identity` resolved through the
 *     iOS `IdentityHandleStore` / Android `IdentityStore`.
 *   - `bindIdentity(null)` on sign-out closes the live session.
 *
 * One identity → one session. Concurrent callers share the same
 * `Promise<string>` while the open is in flight. Subsequent
 * `getSession()` calls resolve to the cached session ID.
 */

import {
  isNativeQuicSessionAvailable,
  NativeQuicSession,
  QuicAlpn,
} from './NativeQuicSession';
import { DEFAULT_NODE_HOST, DEFAULT_NODE_PORT } from '../config';

type Did = string;

let boundDid: Did | null = null;
let liveSessionId: string | null = null;
let inFlight: Promise<string> | null = null;

/**
 * Tell the manager which identity is currently signed in. If the DID
 * changed (including null), any cached session is torn down so the
 * next `getSession()` opens a fresh one against the new identity.
 */
export function bindIdentity(did: Did | null): void {
  const next = did && did.length > 0 ? did : null;
  if (next === boundDid) return;
  boundDid = next;
  if (liveSessionId) {
    try {
      NativeQuicSession.closeSession(liveSessionId);
    } catch (e) {
      console.warn('[QuicSessionManager] closeSession on rebind failed:', e);
    }
    liveSessionId = null;
  }
  inFlight = null;
}

/**
 * Resolve the currently-cached session ID, opening one on demand.
 * Throws if the bridge isn't available on the platform or if no
 * identity is bound.
 */
export async function getSession(): Promise<string> {
  if (!isNativeQuicSessionAvailable) {
    throw new Error('NativeQuicSession bridge not registered');
  }
  if (!boundDid) {
    throw new Error('QuicSessionManager: no identity bound');
  }
  if (liveSessionId) return liveSessionId;
  if (inFlight) return inFlight;

  const did = boundDid;
  inFlight = (async () => {
    // Pass empty strings rather than null for sni / spkiPinHex —
    // RN's iOS bridge complains about NSNull → NSString conversion,
    // and the FFI underscores both params (they're ignored).
    const id = await NativeQuicSession.openSession(
      did,
      DEFAULT_NODE_HOST,
      DEFAULT_NODE_PORT,
      QuicAlpn.Uhp,
      '',
      '',
    );
    // Race-guard: only cache if the identity hasn't changed under us
    // while the open was in flight.
    if (boundDid !== did) {
      try {
        NativeQuicSession.closeSession(id);
      } catch {
        /* best-effort */
      }
      throw new Error('QuicSessionManager: identity changed mid-open');
    }
    liveSessionId = id;
    return id;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

/**
 * Drop the live session unconditionally — used by the transport
 * desync recovery path. The next `getSession()` will reopen.
 */
export function dropSession(): void {
  if (liveSessionId) {
    try {
      NativeQuicSession.closeSession(liveSessionId);
    } catch {
      /* best-effort */
    }
    liveSessionId = null;
  }
  inFlight = null;
}

/** True once a session is open for the bound identity. */
export function hasLiveSession(): boolean {
  return liveSessionId !== null;
}
