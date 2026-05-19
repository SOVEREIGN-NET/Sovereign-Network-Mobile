/**
 * KyberKeyService — publishes the user's Kyber public key on-chain.
 *
 * Per the contract at `POST /api/v1/identity/update-kyber-key`:
 *   1. Native FFI `buildKyberKeyUpdate(timestamp)` produces the signed
 *      JSON body — extracts DID + Kyber pk + Dilithium sk from the
 *      IdentityHandle, signs `UPDATE_KYBER_KEY:{did}:{kyber_pk_hex}:{timestamp}`,
 *      assembles the JSON. All inside Rust; sk never crosses to JS.
 *   2. POST that body to the route.
 *
 * The endpoint registers the Kyber pk on-chain so `/msg/session/init`
 * returns it to other users initiating encrypted sessions. Without
 * this call, inbound first-contact messages can't reach you — peers
 * have no key to encapsulate against.
 *
 * The DID derivation here is `Blake3(public_key)` — bit-identical to the
 * server's `identity_registry` lookup, because the FFI does it. Earlier
 * versions of this service built the body in TS using `getPublicIdentity`
 * + `signMessage`; that risked a DID-derivation mismatch with the server
 * if the cached `pub.did` ever drifted. Routing through the FFI removes
 * that whole class of bug.
 */

import { quicRequest } from './quic';
import { nativeIdentityProvisioning } from './NativeIdentityProvisioning';
import { QuicError } from '../types/api';

const ROUTE = '/api/v1/identity/update-kyber-key';

export type KyberKeyUpdateResult =
  | { ok: true; did: string; message: string }
  | { ok: false; status?: number; reason: string };

interface UpdateKyberKeyBody {
  did: string;
  kyber_public_key_hex: string;
  timestamp: number;
  signature_hex: string;
}

/**
 * Publish the active identity's Kyber public key. Returns a tagged
 * result instead of throwing so callers (auth flows) can decide
 * whether a failure is fatal — currently they treat it as best-effort.
 *
 * `timestampSec` defaults to now; override only for tests or to retry
 * a previously-built request inside the server's 5-minute window.
 */
export async function publishKyberKey(
  timestampSec: number = Math.floor(Date.now() / 1000),
): Promise<KyberKeyUpdateResult> {
  let bodyJson: string;
  try {
    bodyJson = await nativeIdentityProvisioning.buildKyberKeyUpdate(
      timestampSec,
    );
  } catch (e) {
    return { ok: false, reason: `buildKyberKeyUpdate failed: ${e}` };
  }

  // The Rust FFI always returns valid JSON — parse to surface the DID
  // we'll be publishing for the result tuple, and to re-stringify so
  // the wire body has consistent whitespace handling regardless of
  // serde_json's output formatting choices.
  let body: UpdateKyberKeyBody;
  try {
    body = JSON.parse(bodyJson) as UpdateKyberKeyBody;
  } catch (e) {
    return { ok: false, reason: `bridge returned malformed JSON: ${e}` };
  }

  try {
    const resp = await quicRequest<{
      status: string;
      did: string;
      message: string;
    }>(ROUTE, {
      method: 'POST',
      body: bodyJson,
      headers: { 'Content-Type': 'application/json' },
    });
    return { ok: true, did: resp.did, message: resp.message };
  } catch (e) {
    if (e instanceof QuicError) {
      const errBody =
        typeof e.body === 'string'
          ? e.body
          : e.body && typeof (e.body as { message?: unknown }).message === 'string'
            ? (e.body as { message: string }).message
            : e.message;
      return { ok: false, status: e.status, reason: errBody };
    }
    // Reference `body` so the parse step isn't a no-op when the wire
    // path skips happy-path execution; helps debugging if the request
    // never gets sent.
    return { ok: false, reason: `${String(e)} (did=${body.did})` };
  }
}

/**
 * Best-effort variant for use after register / recover — logs warnings
 * on failure but never throws, so the auth flow proceeds even when the
 * endpoint isn't deployed yet (404 is the expected dev case until the
 * server route ships). Returns the same tagged result for callers that
 * want to surface the outcome in UI.
 */
export async function publishKyberKeyBestEffort(
  context: 'register' | 'recover' | 'rotate',
): Promise<KyberKeyUpdateResult> {
  const result = await publishKyberKey();
  if (result.ok) {
    console.log(
      `[KyberKey] published after ${context}: ${result.message}`,
    );
  } else {
    console.warn(
      `[KyberKey] publish skipped after ${context}: ${
        result.status ? `HTTP ${result.status} — ` : ''
      }${result.reason}`,
    );
  }
  return result;
}
