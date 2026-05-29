/**
 * Lobby Auth — types for the OPAQUE password-session layer.
 *
 * The "lobby" is a username/password session fully decoupled from the
 * wallet/Dilithium identity. It grants read-only access to public chain
 * state. Anything requiring a signature still needs the Dilithium key.
 *
 * See epic SOVEREIGN-NET/The-Sovereign-Network#2554.
 */

/**
 * A live lobby session. Everything needed to authenticate subsequent
 * lobby requests: the bearer token, the OPAQUE-derived 64-byte session
 * key (HMAC key for per-request channel binding), and identity metadata.
 *
 * `sessionKeyB64` lives only in device memory + the secure store. It is
 * what makes a stolen `sessionToken` useless on its own.
 */
export interface LobbySession {
  /** Bearer token issued by `/auth/opaque/login/finish`. */
  sessionToken: string;
  /** OPAQUE session_key, 64 bytes, base64. The `X-OPAQUE-Mac` HMAC key. */
  sessionKeyB64: string;
  /** DID the credential is bound to (`did:zhtp:<hex>`). */
  did: string;
  /** Lowercased lobby username. */
  username: string;
  /** Access zone granted to the session — `public` for lobby sessions. */
  accessZone: string;
  /** Epoch millis the session was established. */
  createdAt: number;
}

/**
 * Why a lobby auth attempt failed. Drives the UX: lockout countdowns,
 * the legacy-account upgrade prompt, friendly error copy.
 */
export type LobbyAuthErrorKind =
  | 'wrong_password' // 401 — bad username/password
  | 'locked' // 429 — username locked after repeated failures
  | 'ip_throttled' // 429 — IP throttled
  | 'rate_limited' // 429 — login_start burst / lifetime cap
  | 'upgrade_required' // 409 — legacy argon2id account, must re-register
  | 'username_taken' // 409 — registration username already claimed
  | 'request_expired' // 410 — OPAQUE request_id TTL elapsed
  | 'not_configured' // 503 — lobby auth not enabled at genesis
  | 'network' // transport failure
  | 'unknown';

/** Discriminated error for the OPAQUE flows. */
export class LobbyAuthError extends Error {
  readonly kind: LobbyAuthErrorKind;
  /** Seconds until the caller may retry — set for lockout/throttle. */
  readonly retryAfterSeconds?: number;

  constructor(
    kind: LobbyAuthErrorKind,
    message: string,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'LobbyAuthError';
    this.kind = kind;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
