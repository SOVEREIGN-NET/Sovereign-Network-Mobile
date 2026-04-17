/**
 * Browser Authentication Bridge
 *
 * The mobile app acts as the authenticator for a browser extension.
 * A browser shows a QR / deep link encoding an authentication challenge;
 * the user confirms in the app; the app signs the challenge and submits
 * it to the ZHTP node it already has an active UHP v2 session with.
 *
 * Deep link format
 * ────────────────
 *     zhtp://auth?challenge=<64 hex chars>&node=<optional host:port>
 *
 *   - `challenge` — 64 hex characters (32 bytes) random nonce, required.
 *   - `node`      — optional. When omitted the app submits via its
 *                   currently-connected node (see `quicRequest`).
 *
 * Wire format
 * ───────────
 *   POST /api/v1/browser-auth
 *   {
 *     "challenge": "a1b2c3…",       // echoed hex challenge
 *     "signature": "deadbeef…",     // hex Dilithium5 signature over
 *                                    //   `${challenge_hex}|${timestamp}`
 *     "did":       "did:zhtp:…",
 *     "timestamp": 1713387600        // unix seconds, ±60s of node time
 *   }
 *
 *   200 → { status: "authenticated", session_id: string }
 *   401 → Invalid signature
 *   403 → DID not registered on chain
 *   410 → Challenge expired
 *
 * This module does NOT open a new connection — it rides the existing
 * authenticated QUIC + UHP v2 session established by the app. Any
 * validator or gateway accepting the request is equivalent to the
 * caller; the browser extension polls its own side for the result.
 */

import { quicRequest } from './quic';
import { nativeIdentityProvisioning } from './NativeIdentityProvisioning';

/** Parsed representation of a `zhtp://auth?...` deep link. */
export interface BrowserAuthChallenge {
  /** Lower-case hex, always 64 chars after validation. */
  challengeHex: string;
  /** Optional target node override from the link (not used by the wire
   *  call — the app submits via its connected session — but surfaced in
   *  the confirmation UI so the user can see what's being attested). */
  node: string | null;
}

export interface BrowserAuthSuccess {
  status: 'authenticated';
  session_id: string;
}

/** Discriminated error thrown on non-2xx responses. */
export class BrowserAuthError extends Error {
  constructor(
    public readonly status: number,
    public readonly code:
      | 'invalid_signature'
      | 'did_not_registered'
      | 'challenge_expired'
      | 'unknown',
    message: string,
  ) {
    super(message);
    this.name = 'BrowserAuthError';
  }
}

const CHALLENGE_REGEX = /^[0-9a-fA-F]{64}$/;

/** Validate the inbound challenge string. Throws on malformed input. */
export function validateChallenge(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new Error('Challenge missing from auth link');
  }
  const trimmed = raw.trim();
  if (!CHALLENGE_REGEX.test(trimmed)) {
    throw new Error(
      'Challenge must be exactly 64 hex characters (32 bytes)',
    );
  }
  return trimmed.toLowerCase();
}

/**
 * Parse a `zhtp://auth?challenge=…&node=…` URL into a validated
 * challenge. Returns null when the URL doesn't look like an auth link at
 * all; throws when the link IS an auth link but malformed (so the caller
 * can show the user a meaningful error).
 */
export function parseBrowserAuthLink(
  url: string | null | undefined,
): BrowserAuthChallenge | null {
  if (!url) return null;
  const trimmed = url.trim();

  // Accept both `zhtp://auth?…` and the manually-pasted hex alone — the
  // latter lets power users verify the flow without a working deep link.
  if (CHALLENGE_REGEX.test(trimmed)) {
    return { challengeHex: trimmed.toLowerCase(), node: null };
  }

  const authPrefix = 'zhtp://auth';
  if (!trimmed.toLowerCase().startsWith(authPrefix)) return null;

  // Manual query parsing — React Native's `URLSearchParams` polyfill is
  // flaky across versions, so we don't depend on it here.
  const queryStart = trimmed.indexOf('?');
  const query = queryStart >= 0 ? trimmed.slice(queryStart + 1) : '';
  const params: Record<string, string> = {};
  for (const part of query.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const rawKey = eq >= 0 ? part.slice(0, eq) : part;
    const rawVal = eq >= 0 ? part.slice(eq + 1) : '';
    try {
      params[decodeURIComponent(rawKey)] = decodeURIComponent(rawVal);
    } catch {
      params[rawKey] = rawVal;
    }
  }

  const challengeRaw = params.challenge;
  if (!challengeRaw) {
    throw new Error('Auth link is missing the `challenge` parameter');
  }
  const challengeHex = validateChallenge(challengeRaw);
  const node = params.node ? params.node.trim() : null;
  return { challengeHex, node };
}

export interface SubmitBrowserAuthResult {
  sessionId: string;
  timestamp: number;
}

/**
 * Sign the challenge with the user's Dilithium5 key and POST it to the
 * connected node.
 *
 * The exact message signed — `"{challenge_hex}|{timestamp}"` — must
 * match what the browser's verifier expects, so don't change the
 * separator or field order without updating the spec.
 */
export async function submitBrowserAuth(
  challengeHex: string,
  did: string,
): Promise<SubmitBrowserAuthResult> {
  const challenge = validateChallenge(challengeHex);
  if (!did || !did.startsWith('did:zhtp:')) {
    throw new Error('Active identity missing a valid DID');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const message = `${challenge}|${timestamp}`;
  const signature = await nativeIdentityProvisioning.signMessage(message);

  try {
    const response = await quicRequest<BrowserAuthSuccess>(
      '/api/v1/browser-auth',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge,
          signature,
          did,
          timestamp,
        }),
      },
    );
    if (response?.status !== 'authenticated' || !response.session_id) {
      throw new BrowserAuthError(
        500,
        'unknown',
        'Node accepted the request but returned no session id',
      );
    }
    return { sessionId: response.session_id, timestamp };
  } catch (err: any) {
    const status: number | undefined = err?.status;
    if (status === 401) {
      throw new BrowserAuthError(
        401,
        'invalid_signature',
        'The node rejected the signature. Make sure the app is up to date and try again.',
      );
    }
    if (status === 403) {
      throw new BrowserAuthError(
        403,
        'did_not_registered',
        'This identity is not yet registered on-chain. Finish registration from the welcome screen and retry.',
      );
    }
    if (status === 410) {
      throw new BrowserAuthError(
        410,
        'challenge_expired',
        'The challenge has expired. Generate a new QR / link from the browser and try again.',
      );
    }
    // Unclassified — surface the original error so the user gets
    // something actionable (e.g. transport errors, 500s).
    if (err instanceof Error) throw err;
    throw new BrowserAuthError(
      status ?? 0,
      'unknown',
      typeof err === 'string' ? err : 'Unknown browser-auth error',
    );
  }
}
