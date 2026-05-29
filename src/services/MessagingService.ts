/**
 * MessagingService — REST + crypto facade for end-to-end encrypted DMs.
 *
 * Two layers live here, both designed to swap underneath a stable API:
 *
 *  1. Wire layer — wraps the five `/api/v1/msg/*` endpoints from the
 *     mobile integration guide, calling them over the QUIC transport.
 *     The server only ever sees signed envelopes; plaintext never
 *     leaves this process.
 *
 *  2. Crypto layer — `cryptoStub` exposes the lib-client API surface
 *     (initiate_session, accept_session, seal_text_message, etc.) as
 *     pure-TS placeholders. Phase 1 lets the UI exercise the full flow
 *     without the native FFI being wired. When the UniFFI bindings
 *     ship from lib-client, replace each function body with a
 *     NativeModule call — keep the signatures identical.
 *
 * Phase 1 also keeps an in-memory session/contact/message store
 * (`MessagingMockData`) so the inbox renders against realistic data.
 */

import {
  type DepositRequest,
  type DepositResponse,
  type Did,
  type LocalMessage,
  type MessageEnvelope,
  MessageContentType,
  type PresenceWatchRequest,
  type PresenceWatchResponse,
  type ReceiveResponse,
  type SendRequest,
  type SendResponse,
  type Session,
  type SessionInitRequest,
  type SessionInitResponse,
} from '../types/messaging';
import { quicRequest } from './quic';
import {
  appendMessage,
  clearSerializedSession,
  confirmSentMessage,
  deleteConversation as deleteConversationFromStore,
  getContact,
  getMessages,
  getSelfDid,
  getSerializedSession,
  hasLiveSelfDid,
  markRead,
  removeMessage,
  replaceMessage,
  setSelfDid,
  setSerializedSession,
  updateMessageStatus,
  upsertContact,
  subscribe as subscribeStore,
} from './MessagingMockData';
import {
  ContentTypeTag,
  type EnvelopeMetadata,
  isNativeMessagingAvailable,
  NativeMessaging,
} from './NativeMessaging';
import {
  isNativeQuicSessionAvailable,
  NativeQuicSession,
} from './NativeQuicSession';
import { getSession as getQuicSession } from './QuicSessionManager';
import { fetchIdentityRecord } from './RealAuthService';

const API_BASE = '/api/v1/msg';

// ─── Crypto stub ──────────────────────────────────────────────────────

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function randHex(bytes: number): string {
  // Math.random is fine for stub fixtures — production swaps to FFI.
  let out = '';
  for (let i = 0; i < bytes * 2; i++) {
    out += '0123456789abcdef'[Math.floor(Math.random() * 16)];
  }
  return out;
}

function utf8ToHex(s: string): string {
  // Phase-1 stub: percent-encode + decodeURIComponent is the most
  // dependency-free way to round-trip UTF-8 through bytes in RN. The
  // native FFI replaces this entirely.
  const bytes = unescape(encodeURIComponent(s));
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes.charCodeAt(i).toString(16).padStart(2, '0');
  }
  return out;
}

function hexToUtf8(hex: string): string {
  let raw = '';
  for (let i = 0; i < hex.length; i += 2) {
    raw += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  }
  return decodeURIComponent(escape(raw));
}

/**
 * Pure-TS stand-in for the lib-client crypto surface. The function
 * signatures match the integration guide one-for-one so the call sites
 * stay unchanged when the FFI lands.
 *
 * NB. ciphertexts here are reversible (just hex-encoded UTF-8) — that
 * is the point. Phase 1 needs round-trippable bodies so the chat UI
 * can decrypt mock inbound messages back to text.
 */
export const cryptoStub = {
  initiateSession(
    localDid: Did,
    remoteDid: Did,
    _remoteKyberPk: string,
  ): { ciphertext: string; session: Session } {
    return {
      ciphertext: randHex(1568),
      session: {
        local_did: localDid,
        remote_did: remoteDid,
        chain_key: randHex(32),
        counter: 0,
        epoch: 0,
        created_at: nowSec(),
      },
    };
  },

  acceptSession(
    localDid: Did,
    remoteDid: Did,
    _kyberCiphertext: string,
    _localKyberSk: string,
  ): Session {
    return {
      local_did: localDid,
      remote_did: remoteDid,
      chain_key: randHex(32),
      counter: 0,
      epoch: 0,
      created_at: nowSec(),
    };
  },

  rekeySession(session: Session, _remoteKyberPk: string): string {
    session.epoch += 1;
    session.counter = 0;
    session.chain_key = randHex(32);
    return randHex(1568);
  },

  sealTextMessage(session: Session, text: string): MessageEnvelope {
    const env: MessageEnvelope = {
      version: 1,
      sender_did: session.local_did,
      recipient_did: session.remote_did,
      timestamp: nowSec(),
      epoch: session.epoch,
      sequence: session.counter,
      content_type: MessageContentType.Text,
      ciphertext: utf8ToHex(text),
      signature: '',
    };
    session.counter += 1;
    session.chain_key = randHex(32); // ratchet advance
    return env;
  },

  sealKeyExchange(
    senderDid: Did,
    recipientDid: Did,
    kyberCiphertext: string,
  ): MessageEnvelope {
    return {
      version: 1,
      sender_did: senderDid,
      recipient_did: recipientDid,
      timestamp: nowSec(),
      epoch: 0,
      sequence: 0,
      content_type: MessageContentType.KeyExchange,
      ciphertext: kyberCiphertext,
      signature: '',
    };
  },

  signEnvelope(env: MessageEnvelope, _dilithiumSk: string): MessageEnvelope {
    return { ...env, signature: randHex(4595) }; // Dilithium5 sig length
  },

  verifyEnvelope(_env: MessageEnvelope, _dilithiumPk: string): boolean {
    return true;
  },

  openEnvelope(env: MessageEnvelope, _chainKey: string): string {
    // Body is hex-utf8 in phase 1; mirrors what sealTextMessage produces.
    if (env.content_type === MessageContentType.Text) {
      return hexToUtf8(env.ciphertext);
    }
    return env.ciphertext;
  },

  encodeEnvelope(env: MessageEnvelope): string {
    return utf8ToHex(JSON.stringify(env));
  },

  decodeEnvelope(hex: string): MessageEnvelope {
    return JSON.parse(hexToUtf8(hex)) as MessageEnvelope;
  },
};

// ─── Session store ────────────────────────────────────────────────────

const sessionsByRemoteDid = new Map<Did, Session>();

export function loadSession(remoteDid: Did): Session | undefined {
  return sessionsByRemoteDid.get(remoteDid);
}

export function saveSession(session: Session): void {
  sessionsByRemoteDid.set(session.remote_did, session);
}

// ─── REST endpoints ───────────────────────────────────────────────────

async function postJson<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
  return quicRequest<TRes>(path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Wire probe — fires `/msg/session/init` against the connected node
 * and reports whether the endpoint is live, what status it returns,
 * and roughly how long the round-trip took. Used to triage the
 * "is the messaging backend deployed" question before any of the
 * higher-level flows are worth running.
 */
export type WireProbeResult =
  | {
      ok: true;
      latencyMs: number;
      recipientDid: string;
      hasKyberPk: boolean;
      hasDilithiumPk: boolean;
    }
  | {
      ok: false;
      latencyMs: number;
      status?: number;
      statusText?: string;
      code?: string;
      message: string;
    };

export async function probeMessagingWire(
  recipient?: string,
): Promise<WireProbeResult> {
  // Refuse to probe with the fallback mock DID — it always 404s and
  // makes the wire look broken when the actual issue is "auth layer
  // hasn't told us the live DID yet". Caller should plumb the real
  // signed-in DID via `setSelfDid` before calling.
  if (!recipient && !hasLiveSelfDid()) {
    return {
      ok: false,
      latencyMs: 0,
      message:
        'no live identity — sign in first (probe refused on mock DID)',
    };
  }
  const target = recipient ?? getSelfDid();
  const t0 = Date.now();
  try {
    const r = await sessionInit(target);
    return {
      ok: true,
      latencyMs: Date.now() - t0,
      recipientDid: r.recipient_did,
      hasKyberPk: !!r.kyber_public_key && r.kyber_public_key.length > 0,
      hasDilithiumPk:
        !!r.dilithium_public_key && r.dilithium_public_key.length > 0,
    };
  } catch (e) {
    const ms = Date.now() - t0;
    // Avoid pulling QuicError type at top of file — interrogate by shape.
    const err = e as {
      status?: number;
      statusText?: string;
      code?: string;
      message?: string;
    };
    return {
      ok: false,
      latencyMs: ms,
      status: typeof err.status === 'number' ? err.status : undefined,
      statusText: err.statusText,
      code: err.code,
      message: err.message ?? String(e),
    };
  }
}

/** POST /api/v1/msg/session/init — fetch the recipient's public keys. */
export async function sessionInit(
  recipient: string,
): Promise<SessionInitResponse> {
  const req: SessionInitRequest = {
    sender_did: getSelfDid(),
    recipient,
  };
  return postJson(`${API_BASE}/session/init`, req);
}

/**
 * `sessionInit` when all we have is a peer's DID — the case for every
 * inbound envelope, since `/msg/receive` carries only `sender_did`.
 *
 * The server's bare-DID resolution on `/msg/session/init` is
 * unreliable (404s for accounts whose registry entry is keyed by
 * username), so try the DID path, and on a 404 resolve the DID to a
 * `@username` via the identity registry (`/identity/get/{did}` does
 * accept bare DIDs) and retry by handle — the path that works.
 * Throws if neither path resolves the peer.
 */
async function sessionInitByDid(did: Did): Promise<SessionInitResponse> {
  try {
    return await sessionInit(did);
  } catch (e) {
    if ((e as { status?: number })?.status !== 404) throw e;
  }
  const record = await fetchIdentityRecord(did);
  const handle = record?.username?.replace(/^@+/, '');
  if (!handle) {
    throw new Error(`no username registered for ${did}`);
  }
  return sessionInit(`@${handle}`);
}

/** POST /api/v1/msg/send — relay one signed envelope. */
export async function sendEnvelope(
  envelopeHex: string,
): Promise<SendResponse> {
  const req: SendRequest = { envelope_hex: envelopeHex };
  return postJson(`${API_BASE}/send`, req);
}

/** GET /api/v1/msg/receive — poll for pending envelopes. */
export async function receivePending(): Promise<ReceiveResponse> {
  const r = await quicRequest<ReceiveResponse>(`${API_BASE}/receive`, {
    method: 'GET',
  });
  // Log every non-empty receive in the exact shape the server team
  // asked for so we can correlate phone-side state with their deposit
  // store. Empty receives stay silent to keep the 5 s poll quiet.
  if (r && typeof r.count === 'number' && r.count > 0) {
    console.log(
      '[msg] /receive parsed: self_did=' + getSelfDid() +
        ' count=' + r.count +
        ' shape={status,count,messages[*].{sender_did,envelope_hex,deposited_at}}',
    );
    for (const m of r.messages ?? []) {
      console.log(
        '[msg] /receive entry: sender=' + m.sender_did +
          ' envelope_hex_len=' + (m.envelope_hex?.length ?? 0) +
          ' deposited_at=' + m.deposited_at,
      );
    }
  }
  return r;
}

/** POST /api/v1/msg/deposit — drop queued envelopes before going offline. */
export async function depositEnvelopes(
  recipientDid: Did,
  envelopesHex: string[],
): Promise<DepositResponse> {
  const req: DepositRequest = {
    sender_did: getSelfDid(),
    recipient_did: recipientDid,
    envelopes_hex: envelopesHex,
  };
  return postJson(`${API_BASE}/deposit`, req);
}

/** POST /api/v1/msg/presence/watch — get online status for a contact list. */
export async function watchPresence(
  targetDids: Did[],
): Promise<PresenceWatchResponse> {
  const req: PresenceWatchRequest = {
    watcher_did: getSelfDid(),
    target_dids: targetDids,
  };
  return postJson(`${API_BASE}/presence/watch`, req);
}

// ─── Native crypto path ───────────────────────────────────────────────
//
// When the native bridge is registered (built lib-client + linked JNI/
// Swift modules), `sendTextMessage` and `ingestEnvelopes` delegate the
// crypto work to Rust via the bridge. Plaintext, Kyber and Dilithium
// secret keys never cross the JS boundary in this path. The TS-level
// session store holds only an opaque `sessionId` per peer DID; the
// actual `MessagingSession` lives in native memory.

// Two native sessions per peer — one per direction.
//
// The lib-client `MessagingSession` is a single ratchet chain: both
// `sealTextSigned` and `envelopeOpenVerifiedText` advance the same
// counter. Using ONE session object for both directions desyncs the
// moment the two peers don't strictly alternate (glare) — each side's
// send bumps the shared counter, and an inbound message stamped at an
// earlier sequence can no longer be opened.
//
// The fix: keep the session we INITIATED for our outbound traffic and
// the session we ACCEPTED (from the peer's KeyExchange) for inbound.
// Each direction then has its own counter, which the single-chain
// design handles correctly because only one party ever seals on it.
const sendSessionByDid = new Map<Did, string>();
const recvSessionByDid = new Map<Did, string>();

// Coalesces concurrent outbound-session inits, keyed by peer DID. A
// desync recovery (which resets the send session) and a user-typed send
// routinely both ask for the send session within the same tick; without
// this each runs a full first-contact handshake and ships its own
// KeyExchange, and the two sessions race to win `sendSessionByDid` —
// leaving our send session paired to a different KeyExchange generation
// than the peer's receive session, so the peer silently can't decrypt
// anything we send. One in-flight promise per peer guarantees exactly
// one handshake.
const sendSessionInitInFlight = new Map<Did, Promise<string>>();

type SessionDir = 'send' | 'recv';

/** Persisted-blob key — suffixed so the two directions don't collide
 *  in the serialized-session store. */
function sessionStoreKey(did: Did, dir: SessionDir): string {
  return `${did}#${dir}`;
}

/** Snapshot a native session to the persistent store so a cold
 *  restart resumes the conversation without re-handshaking. */
async function persistSession(
  did: Did,
  dir: SessionDir,
  sessionId: string,
): Promise<void> {
  try {
    const blob = await NativeMessaging.serializeSession(sessionId);
    setSerializedSession(sessionStoreKey(did, dir), blob);
  } catch (e) {
    console.warn(
      '[MessagingService] serializeSession failed for',
      did,
      dir,
      e,
    );
  }
}

/** Restore a previously-serialized directional session. Returns the
 *  new native session id on success, undefined if no blob is stored
 *  or the deserialize fails (caller then re-handshakes). */
async function tryRestoreSession(
  did: Did,
  dir: SessionDir,
): Promise<string | undefined> {
  const blob = getSerializedSession(sessionStoreKey(did, dir));
  if (!blob) return undefined;
  try {
    const r = await NativeMessaging.deserializeSession(blob);
    (dir === 'send' ? sendSessionByDid : recvSessionByDid).set(
      did,
      r.sessionId,
    );
    console.log(
      '[MessagingService] restored ' + dir + ' session from disk for',
      did,
    );
    return r.sessionId;
  } catch (e) {
    console.warn(
      '[MessagingService] deserializeSession failed for',
      did,
      dir,
      e,
    );
    return undefined;
  }
}

/** Encode an ASCII string to base64. Receipts are tiny JSON payloads —
 *  always pure ASCII — so `btoa` is safe here. */
function asciiToBase64(s: string): string {
  const g = globalThis as unknown as {
    btoa?: (s: string) => string;
    Buffer?: { from: (s: string, e: string) => { toString: (e: string) => string } };
  };
  if (typeof g.btoa === 'function') return g.btoa(s);
  return g.Buffer!.from(s, 'binary').toString('base64');
}

/** Convert the hex strings the REST layer hands us to the base64 the
 *  native bridge expects. Lives here (not in a util) because messaging
 *  is the only consumer of this conversion shape on the wire. */
function hexToBase64(hex: string): string {
  const trimmed = hex.startsWith('0x') ? hex.slice(2) : hex;
  let raw = '';
  for (let i = 0; i < trimmed.length; i += 2) {
    raw += String.fromCharCode(parseInt(trimmed.slice(i, i + 2), 16));
  }
  // btoa is part of the RN runtime via core-js polyfills; falls back to
  // a Buffer if the global isn't available (e.g. older RN versions).
  const g = globalThis as unknown as {
    btoa?: (s: string) => string;
    Buffer?: { from: (s: string, e: string) => { toString: (e: string) => string } };
  };
  if (typeof g.btoa === 'function') {
    return g.btoa(raw);
  }
  return g.Buffer!.from(raw, 'binary').toString('base64');
}

/**
 * Resolve (or create) our OUTBOUND session for `remoteDid` — the one
 * we seal all our messages with. On first contact this fetches the
 * peer's Kyber + Dilithium pks via `/msg/session/init`, caches them
 * on the contact row, encapsulates a fresh shared secret, and ships
 * the `KeyExchange` envelope so the peer can build the matching
 * inbound (receive) session.
 *
 * `recipient` is what `/msg/session/init` looks up on the server side
 * — typically a `@username` or DID. When the caller already knows the
 * peer's DID we pass it as both, since the server accepts either.
 *
 * Concurrency-safe: returns the cached session if one exists, joins an
 * in-flight handshake if one is running, and otherwise starts exactly
 * one. Two callers in the same tick (a recovery + a user send) never
 * fork two competing handshakes — see `sendSessionInitInFlight`.
 */
async function getOrInitSendSession(
  remoteDid: Did,
  recipient: string,
): Promise<string> {
  const cached = sendSessionByDid.get(remoteDid);
  if (cached) return cached;

  const inFlight = sendSessionInitInFlight.get(remoteDid);
  if (inFlight) return inFlight;

  // No cache, no in-flight handshake — start one and register it
  // synchronously (before the first await) so a concurrent caller in
  // the same tick joins this promise instead of forking its own.
  const p = initSendSession(remoteDid, recipient);
  sendSessionInitInFlight.set(remoteDid, p);
  try {
    return await p;
  } finally {
    sendSessionInitInFlight.delete(remoteDid);
  }
}

/**
 * The actual outbound-session handshake. Never call directly — always
 * go through `getOrInitSendSession`, which coalesces concurrent callers
 * onto a single invocation. Restores a persisted send session if one
 * exists, otherwise runs a fresh first-contact KeyExchange.
 */
async function initSendSession(
  remoteDid: Did,
  recipient: string,
): Promise<string> {
  // Cold-start restore — if we have a persisted send session for this
  // peer from a previous launch, deserialize it instead of forcing
  // another KeyExchange round-trip.
  const restored = await tryRestoreSession(remoteDid, 'send');
  if (restored) return restored;

  // First contact — fetch the peer's public keys. A bare DID goes
  // through the DID->username fallback; a `@handle` resolves directly.
  const init = recipient.startsWith('did:zhtp:')
    ? await sessionInitByDid(recipient)
    : await sessionInit(recipient);

  // Cache pks on the contact for verify-on-receive + future sessions.
  const existingContact = getContact(init.recipient_did);
  upsertContact({
    did: init.recipient_did,
    username: init.recipient_username,
    display_name: existingContact?.display_name ?? init.recipient_username,
    kyber_pk: init.kyber_public_key,
    dilithium_pk: init.dilithium_public_key,
    online: existingContact?.online ?? false,
    last_seen: existingContact?.last_seen,
  });

  const localDid = getSelfDid();
  const initResult = await NativeMessaging.initiateSession(
    localDid,
    init.recipient_did,
    hexToBase64(init.kyber_public_key),
  );
  sendSessionByDid.set(remoteDid, initResult.sessionId);

  // Ship the Kyber ciphertext to the peer as a signed KeyExchange
  // envelope so they can call `acceptEnvelopeWithIdentity` and build
  // their inbound session paired with this one.
  const keyExchangeHex = await NativeMessaging.sealKeyExchangeSigned(
    localDid,
    init.recipient_did,
    initResult.kyberCiphertextB64,
  );
  const kxResp = await sendEnvelope(keyExchangeHex);
  console.log('[MessagingService] KeyExchange send response:', {
    status: kxResp.status,
    envelope_id: kxResp.envelope_id,
    recipient_did: init.recipient_did,
  });

  // Persist immediately so a cold start before the next send still
  // resumes the session instead of forcing a fresh KeyExchange.
  await persistSession(remoteDid, 'send', initResult.sessionId);

  return initResult.sessionId;
}

/**
 * Forget our outbound session for `did` — in-memory id and persisted
 * blob — so the next `getOrInitSendSession` is forced into a fresh
 * handshake (a new `KeyExchange` envelope). The inbound session is
 * left alone; it gets refreshed when the peer's reciprocal
 * `KeyExchange` arrives.
 */
function resetSendSession(did: Did): void {
  sendSessionByDid.delete(did);
  clearSerializedSession(sessionStoreKey(did, 'send'));
}

// Last recovery attempt per peer. A desync that the peer never
// picks up (they were offline) must be retryable, but not on every
// inbound envelope — so allow one re-handshake per peer per window.
const recoveryAttemptAt = new Map<Did, number>();
const RECOVERY_COOLDOWN_MS = 60_000;

// Peers whose last inbound message failed to decrypt (missing session
// or ratchet desync) and hasn't since recovered. A successful decrypt
// clears the entry. Drives `conversationConnected`.
const desyncedDids = new Set<Did>();

/**
 * Self-heal a desynced conversation. An inbound Text we can't decrypt
 * — no inbound session, or one whose ratchet diverged — means our
 * handshake with the peer needs redoing. Re-handshake our outbound
 * session (`resetSendSession` + `getOrInitSendSession` ships a fresh
 * `KeyExchange`). The peer accepts it, refreshes its inbound session,
 * and — because the accept handler detects a re-handshake — ships its
 * own fresh `KeyExchange` back, which refreshes OUR inbound session.
 * Both directions converge.
 *
 * Messages already sent under the lost session stay undecryptable.
 * Rate-limited to one attempt per peer per `RECOVERY_COOLDOWN_MS` so
 * the mutual KeyExchange exchange terminates and an offline peer is
 * retried on later inbound traffic without flooding the wire.
 */
async function recoverMissingSession(senderDid: Did): Promise<void> {
  const last = recoveryAttemptAt.get(senderDid) ?? 0;
  if (Date.now() - last < RECOVERY_COOLDOWN_MS) return;
  recoveryAttemptAt.set(senderDid, Date.now());
  try {
    resetSendSession(senderDid);
    await getOrInitSendSession(senderDid, senderDid);
    console.log(
      '[msg] recovery: re-handshake shipped to ' + senderDid,
    );
  } catch (e) {
    // Let the cooldown lapse naturally — the next inbound envelope
    // from this peer retries.
    console.warn('[msg] recovery: failed for ' + senderDid, e);
  }
}

/**
 * On accepting a peer's `KeyExchange`, make sure they can receive
 * from us too. `hadPriorInbound` distinguishes the two cases:
 *  - First contact (no prior inbound session): ship our outbound
 *    `KeyExchange` once if we don't already have one.
 *  - Re-handshake (peer replaced an existing inbound session): they
 *    desynced, so reciprocate with a full re-handshake — which is
 *    cooldown-gated, so the mutual exchange terminates.
 */
async function completeHandshake(
  peerDid: Did,
  hadPriorInbound: boolean,
): Promise<void> {
  if (hadPriorInbound) {
    void recoverMissingSession(peerDid);
    return;
  }
  if (sendSessionByDid.has(peerDid)) return;
  if (await tryRestoreSession(peerDid, 'send')) return;
  try {
    await getOrInitSendSession(peerDid, peerDid);
    console.log(
      '[msg] handshake: reciprocal KeyExchange shipped to ' + peerDid,
    );
  } catch (e) {
    console.warn('[msg] handshake: reciprocal KX failed for ' + peerDid, e);
  }
}

/**
 * Manually re-establish the secure session with `did`. Re-handshakes
 * our outbound session and ships a fresh `KeyExchange`; the peer
 * accepts it and reciprocates, so both directions resume. The
 * user-facing "Reconnect" action — works from either side of a
 * desync. Throws on failure so the caller can surface it.
 */
export async function reconnectSession(did: Did): Promise<void> {
  recoveryAttemptAt.set(did, Date.now());
  resetSendSession(did);
  await getOrInitSendSession(did, did);
  console.log('[msg] reconnect: fresh KeyExchange shipped to ' + did);
}

/**
 * Whether the conversation with `did` is healthy — its receive path
 * is working. Returns false once an inbound message has failed to
 * decrypt (missing session or ratchet desync) and stays false until
 * a later message from that peer decrypts successfully. A brand-new
 * conversation that simply hasn't received anything yet counts as
 * connected — there is nothing broken to fix.
 */
export function conversationConnected(did: Did): boolean {
  return !desyncedDids.has(did);
}

/**
 * Erase a conversation completely — message history, contact, and all
 * session state (both directions, native + persisted). After this the
 * conversation is gone; re-looking the peer up in NewChat starts a
 * genuinely fresh thread. The user-facing "Delete conversation"
 * action, for when a thread is too desynced to salvage.
 */
export function deleteConversation(did: Did): void {
  sendSessionByDid.delete(did);
  recvSessionByDid.delete(did);
  recoveryAttemptAt.delete(did);
  desyncedDids.delete(did);
  pendingDecryptByDid.delete(did);
  clearSerializedSession(sessionStoreKey(did, 'send'));
  clearSerializedSession(sessionStoreKey(did, 'recv'));
  deleteConversationFromStore(did);
  console.log('[msg] conversation deleted: ' + did);
}

/**
 * Append a local-only "couldn't decrypt" placeholder so the user
 * sees that a message arrived even though its plaintext is
 * unrecoverable. Deduped by a deterministic id so a re-ingested
 * envelope (e.g. /receive + inbound stream both deliver it) doesn't
 * stack duplicate bubbles.
 */
function appendUndecryptablePlaceholder(meta: {
  senderDid: Did;
  timestamp: number;
  epoch: number;
  sequence: number;
}): string {
  const id = `undecryptable-${meta.senderDid}-${meta.epoch}-${meta.sequence}`;
  // Deterministic id, so a re-ingested envelope stacks no duplicates.
  // Return the id either way — the caller buffers it for retry.
  if (getMessages(meta.senderDid).some(m => m.id === id)) return id;
  appendMessage({
    id,
    conversation_did: meta.senderDid,
    direction: 'received',
    content_type: MessageContentType.Undecryptable,
    body: '',
    timestamp: meta.timestamp,
    epoch: meta.epoch,
    sequence: meta.sequence,
    status: 'failed',
  });
  return id;
}

// ─── Pending-decrypt buffer ────────────────────────────────────────────
//
// Per-peer queue of Text envelopes that couldn't be decrypted on first
// arrival — either we had no receive session yet (first contact, or
// session blob lost) or the ratchet had drifted (peer re-handshaked
// while we were offline). Without this buffer the ciphertext was
// dropped on the floor: a "couldn't decrypt" placeholder appeared, the
// recovery KeyExchange dance ran, but by the time a fresh session
// landed the original envelope was gone, so the content was permanently
// lost. We now keep the ciphertext around and, the moment a new recv
// session for that peer is built (KeyExchange accept) or refreshed
// (KeyRatchet accept), we retry every buffered envelope through it —
// replacing each placeholder with the recovered plaintext when the open
// succeeds. The buffer is in-memory only; messages that don't drain
// before the app is killed stay as placeholders, which is the same
// behaviour as before for that edge.

interface PendingDecrypt {
  envelopeB64: string;
  placeholderId: string;
  meta: EnvelopeMetadata;
}

const pendingDecryptByDid = new Map<Did, PendingDecrypt[]>();

/** Cap per peer so a flood of undecryptable envelopes (e.g. a peer
 *  rotating their send chain repeatedly while we're offline) can't grow
 *  unbounded. Oldest entries fall off — they were the least likely to
 *  ever resolve anyway. */
const PENDING_DECRYPT_LIMIT_PER_PEER = 64;

function bufferUndecryptable(did: Did, item: PendingDecrypt): void {
  const buf = pendingDecryptByDid.get(did) ?? [];
  // Dedupe by placeholder id — re-ingesting the same envelope (e.g. a
  // /receive poll and the inbound stream both deliver it) must not
  // create two queue entries.
  if (buf.some(p => p.placeholderId === item.placeholderId)) return;
  buf.push(item);
  if (buf.length > PENDING_DECRYPT_LIMIT_PER_PEER) {
    buf.splice(0, buf.length - PENDING_DECRYPT_LIMIT_PER_PEER);
  }
  pendingDecryptByDid.set(did, buf);
}

/**
 * Retry every buffered envelope for `did` against the current receive
 * session. Called right after a KeyExchange or KeyRatchet accept builds
 * or refreshes that session. On a successful open, the placeholder is
 * swapped in-place for the decoded message and the entry leaves the
 * buffer; on failure the entry stays buffered for the next refresh.
 */
async function drainPendingDecrypt(did: Did): Promise<void> {
  const buf = pendingDecryptByDid.get(did);
  if (!buf || buf.length === 0) return;

  const sessionId =
    recvSessionByDid.get(did) ?? (await tryRestoreSession(did, 'recv'));
  if (!sessionId) return;

  const peerPkHex = getContact(did)?.dilithium_pk;
  if (!peerPkHex) return;
  const peerPkB64 = hexToBase64(peerPkHex);

  const remaining: PendingDecrypt[] = [];
  for (const item of buf) {
    let body: string;
    try {
      body = await NativeMessaging.envelopeOpenVerifiedWithSession(
        sessionId,
        item.envelopeB64,
        peerPkB64,
      );
    } catch {
      // Still can't open — keep it for the next refresh.
      remaining.push(item);
      continue;
    }
    // A recovered envelope might itself be a receipt that was
    // smuggled through the Text channel — process it as a receipt
    // and drop the placeholder so the user doesn't see marker bytes
    // in their timeline.
    if (body.startsWith(RECEIPT_MARKER)) {
      try {
        const payload = JSON.parse(body.slice(RECEIPT_MARKER.length)) as {
          seq?: unknown;
          epoch?: unknown;
        };
        if (
          typeof payload.seq === 'number' &&
          typeof payload.epoch === 'number'
        ) {
          confirmSentMessage(did, payload.seq, payload.epoch);
        }
      } catch {
        // Malformed receipt payload — silently drop.
      }
      removeMessage(did, item.placeholderId);
      desyncedDids.delete(did);
      await persistSession(did, 'recv', sessionId);
      continue;
    }
    // Recovered. Swap the placeholder for the real decoded message in
    // its original slot, so the timeline stays in order and the unread
    // count the placeholder already contributed isn't double-bumped.
    replaceMessage(did, item.placeholderId, {
      id: `recv-${item.meta.timestamp}-${item.meta.sequence}`,
      conversation_did: did,
      direction: 'received',
      content_type: MessageContentType.Text,
      body,
      timestamp: item.meta.timestamp,
      epoch: item.meta.epoch,
      sequence: item.meta.sequence,
      status: 'delivered',
    });
    desyncedDids.delete(did);
    await persistSession(did, 'recv', sessionId);
    // Late-recovered messages also deserve a receipt so the peer sees
    // them as confirmed — same fire-and-forget as the inline path.
    void shipReadReceipt(did, item.meta.sequence, item.meta.epoch);
    console.log(
      '[msg] pending-decrypt recovered: sender=' + did +
        ' seq=' + item.meta.sequence +
        ' epoch=' + item.meta.epoch,
    );
  }

  if (remaining.length === 0) pendingDecryptByDid.delete(did);
  else pendingDecryptByDid.set(did, remaining);
}

/** Native-backed send. Falls through to the stub at the call site
 *  whenever `isNativeMessagingAvailable` is false. */
async function sendTextMessageNative(
  remoteDid: Did,
  text: string,
): Promise<LocalMessage> {
  // `/msg/session/init` reliably resolves a `@username`; the bare-DID
  // resolution path 404s for accounts whose server registry entry is
  // keyed by username. Every contact row carries the handle (the
  // NewChat lookup and the ingest path both cache it), so prefer it
  // and fall back to the DID only when no handle is known.
  const contact = getContact(remoteDid);
  const recipient =
    contact?.username && contact.username.length > 0
      ? `@${contact.username.replace(/^@+/, '')}`
      : remoteDid;
  const sessionId = await getOrInitSendSession(remoteDid, recipient);

  const localDid = getSelfDid();
  const wireHex = await NativeMessaging.sealTextSigned(sessionId, text, localDid);

  let sendStatus: LocalMessage['status'] = 'sent';
  try {
    const r = await sendEnvelope(wireHex);
    console.log('[MessagingService] Text send response:', {
      status: r.status,
      envelope_id: r.envelope_id,
      remote_did: remoteDid,
    });
    sendStatus = r.status === 'delivered' ? 'delivered'
      : r.status === 'queued' ? 'pending'
      : 'sent';
  } catch (e) {
    console.warn('[MessagingService] Text send threw:', e);
    // The POST never reached the server (transport blip, no QUIC
    // session, etc.). The message is recorded locally so the user
    // sees what they typed and can hit Resend — distinguished from
    // 'pending' (server has the envelope, peer offline) by being
    // explicitly retryable.
    sendStatus = 'failed';
  }

  // Ask the native side for the post-seal counter/epoch so the stored
  // row reflects the actual ratchet position.
  const info = await NativeMessaging.getSessionInfo(sessionId);

  // Snapshot the ratchet-advanced send session so a restart picks up
  // at the right counter instead of replaying / desyncing.
  await persistSession(remoteDid, 'send', sessionId);

  const local: LocalMessage = {
    id: `local-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    conversation_did: remoteDid,
    direction: 'sent',
    content_type: MessageContentType.Text,
    body: text,
    timestamp: nowSec(),
    epoch: info.epoch,
    sequence: Math.max(0, info.counter - 1),
    status: sendStatus,
  };
  appendMessage(local);
  return local;
}

/**
 * Marker prefix for a ReadReceipt smuggled through the Text channel.
 *
 * lib-client's `zhtp_msg_seal_binary_signed` currently fails when handed
 * `ContentType::ReadReceipt` ("sealFailed(\"binary_signed\")"), so the
 * proper ContentType-tagged receipt path can't seal today. As a
 * frontend-only workaround we ship receipts as Text envelopes with a
 * recognisable prefix — the U+0001 (start-of-heading) control byte can
 * never appear in user-typed text, so the receiver can dispatch on this
 * prefix before treating the body as a chat message. When lib-client
 * gains proper ReadReceipt support, the dedicated branch in
 * `ingestEnvelopesNative` keyed on `ContentTypeTag.ReadReceipt` already
 * handles the clean path; we just drop this workaround.
 */
const RECEIPT_MARKER = 'ZHTP_RR_V1';

/**
 * Ship a delivery receipt back to the sender, acknowledging that we
 * successfully decoded message `(seq, epoch)`. Fire-and-forget — the
 * receipt is best-effort, and the sender simply doesn't see ✓✓ if it
 * fails. Rides the same send session as outgoing Texts, so it consumes
 * one send seq on our chain.
 */
async function shipReadReceipt(
  toDid: Did,
  seq: number,
  epoch: number,
): Promise<void> {
  try {
    // `getOrInitSendSession` is single-flight — if `completeHandshake`
    // already kicked off a first-contact init, this joins it instead
    // of starting another KeyExchange.
    const sessionId = await getOrInitSendSession(toDid, toDid);
    const localDid = getSelfDid();
    const body = RECEIPT_MARKER + JSON.stringify({ seq, epoch });
    const envHex = await NativeMessaging.sealTextSigned(
      sessionId,
      body,
      localDid,
    );
    await sendEnvelope(envHex);
    await persistSession(toDid, 'send', sessionId);
  } catch (e) {
    // Receipt loss is non-fatal — log and move on.
    console.warn('[msg] shipReadReceipt failed for', toDid, e);
  }
}

/**
 * Re-send a previously-failed outbound message. The original ciphertext
 * was sealed but never reached the server (the POST threw and the
 * message was tagged `'failed'`), and the send ratchet has advanced
 * since then — so we can't replay the same envelope. We re-seal the
 * body against the *current* send session (consuming a fresh seq), POST
 * it, and update the local row's status + ratchet position in place.
 * The bubble keeps its id and position in the timeline; only its state
 * changes — `'failed'` → `'pending'` while in flight, then
 * `'sent'`/`'delivered'`/`'pending'` per the server response, or back
 * to `'failed'` if it throws again.
 */
export async function resendMessage(
  did: Did,
  messageId: string,
): Promise<void> {
  const msg = getMessages(did).find(m => m.id === messageId);
  if (!msg) throw new Error('resend: message not found');
  if (msg.direction !== 'sent') {
    throw new Error('resend: not a sent message');
  }
  if (msg.content_type !== MessageContentType.Text) {
    throw new Error('resend: only text messages can be resent');
  }

  updateMessageStatus(did, messageId, 'pending');

  const contact = getContact(did);
  const recipient =
    contact?.username && contact.username.length > 0
      ? `@${contact.username.replace(/^@+/, '')}`
      : did;

  try {
    const sessionId = await getOrInitSendSession(did, recipient);
    const localDid = getSelfDid();
    const wireHex = await NativeMessaging.sealTextSigned(
      sessionId,
      msg.body,
      localDid,
    );
    let nextStatus: LocalMessage['status'];
    try {
      const r = await sendEnvelope(wireHex);
      nextStatus =
        r.status === 'delivered'
          ? 'delivered'
          : r.status === 'queued'
            ? 'pending'
            : 'sent';
    } catch (e) {
      console.warn('[MessagingService] resend POST threw:', e);
      updateMessageStatus(did, messageId, 'failed');
      throw e;
    }
    // Refresh the ratchet position on the local row so the (seq, epoch)
    // matches the envelope the peer will actually receive — used by the
    // ReadReceipt lookup when the peer confirms it.
    const info = await NativeMessaging.getSessionInfo(sessionId);
    await persistSession(did, 'send', sessionId);
    updateMessageStatus(did, messageId, nextStatus, {
      epoch: info.epoch,
      sequence: Math.max(0, info.counter - 1),
    });
  } catch (e) {
    updateMessageStatus(did, messageId, 'failed');
    throw e;
  }
}

/**
 * Ensure we have the sender's pks + contact row cached. Called from
 * the ingest path when a message arrives from someone we haven't
 * exchanged with locally — without this, signature verification has
 * no key to check against, and the inbox can't render a row even
 * after the message is decrypted (the conversation list iterates
 * contactsByDid, so the contact has to exist there). Best-effort:
 * returns false on lookup failure; caller decides whether to drop.
 */
async function ensureContactCached(did: Did): Promise<boolean> {
  const existing = getContact(did);
  if (existing?.dilithium_pk) return true;
  try {
    const r = await sessionInitByDid(did);
    upsertContact({
      did: r.recipient_did,
      username: r.recipient_username || '',
      display_name:
        r.recipient_username ||
        existing?.display_name ||
        `did:zhtp:${r.recipient_did.replace(/^did:zhtp:/, '').slice(0, 8)}…`,
      kyber_pk: r.kyber_public_key,
      dilithium_pk: r.dilithium_public_key,
      online: existing?.online ?? false,
      last_seen: existing?.last_seen,
    });
    return true;
  } catch (e) {
    console.warn('[MessagingService] ensureContactCached failed:', did, e);
    return false;
  }
}

/** Native-backed ingest. Each envelope is decoded + verified +
 *  decrypted entirely in Rust; we only see the plaintext at the end. */
async function ingestEnvelopesNative(
  envelopes: ReceiveResponse['messages'],
): Promise<void> {
  console.log(
    '[MessagingService] ingestEnvelopesNative batch:',
    envelopes.length,
    'envelopes',
    envelopes.map(e => ({
      sender: e.sender_did.slice(0, 24) + '…',
      hex_len: e.envelope_hex.length,
      deposited_at: e.deposited_at,
    })),
  );
  // Decode + describe every envelope up front, then process handshake
  // envelopes (KeyExchange / KeyRatchet) before Text. A Text can only
  // be opened once the session it rides has been built — so when a
  // batch carries both, the handshake must run first regardless of
  // wire order. `sort` is stable, so Text stays in delivery order.
  const prepared: Array<{ envelopeB64: string; meta: EnvelopeMetadata }> = [];
  for (const raw of envelopes) {
    let envelopeB64: string;
    try {
      envelopeB64 = await NativeMessaging.envelopeFromHex(raw.envelope_hex);
    } catch (e) {
      console.warn(
        '[MessagingService] envelope outcome: drop (malformed hex)',
        e,
      );
      continue;
    }
    try {
      const meta = await NativeMessaging.envelopeDescribe(envelopeB64);
      prepared.push({ envelopeB64, meta });
    } catch (e) {
      console.warn(
        '[MessagingService] envelope outcome: drop (describe failed)',
        e,
      );
    }
  }
  const isHandshake = (ct: number): boolean =>
    ct === ContentTypeTag.KeyExchange || ct === ContentTypeTag.KeyRatchet;
  prepared.sort(
    (a, b) =>
      (isHandshake(a.meta.contentType) ? 0 : 1) -
      (isHandshake(b.meta.contentType) ? 0 : 1),
  );

  for (const { envelopeB64, meta } of prepared) {
    const senderShort = meta.senderDid.slice(0, 24) + '…';

    if (meta.contentType === ContentTypeTag.KeyExchange) {
      // Inbound handshake. Hand the whole bincode envelope to the
      // native side; Rust extracts the Kyber ciphertext, asserts the
      // DID routing, and decapsulates against our local Kyber sk —
      // producing our INBOUND (receive) session for this peer.
      // Cache the peer's pks first so Text envelopes from them verify
      // cleanly + their conversation row appears in the inbox.
      await ensureContactCached(meta.senderDid);
      // Distinguish first contact from a re-handshake: if we already
      // had an inbound session, the peer is recovering a desync and
      // we must reciprocate (see completeHandshake).
      const hadPriorInbound =
        recvSessionByDid.has(meta.senderDid) ||
        getSerializedSession(sessionStoreKey(meta.senderDid, 'recv')) !=
          null;
      try {
        const accepted = await NativeMessaging.acceptEnvelopeWithIdentity(
          getSelfDid(),
          meta.senderDid,
          envelopeB64,
        );
        recvSessionByDid.set(meta.senderDid, accepted.sessionId);
        await persistSession(meta.senderDid, 'recv', accepted.sessionId);
        // The new receive session may now open envelopes we had to
        // placeholder before this KX landed — replay the per-peer
        // pending buffer through it.
        void drainPendingDecrypt(meta.senderDid);
        console.log(
          '[MessagingService] envelope outcome: KeyExchange accepted from',
          senderShort,
        );
        // Make sure the peer can receive from us too.
        void completeHandshake(meta.senderDid, hadPriorInbound);
      } catch (e) {
        console.warn(
          '[MessagingService] envelope outcome: KeyExchange reject from',
          senderShort,
          e,
        );
      }
      continue;
    }

    if (meta.contentType === ContentTypeTag.KeyRatchet) {
      // A re-key from the peer applies to their send chain — which is
      // our INBOUND session.
      let sessionId = recvSessionByDid.get(meta.senderDid);
      if (!sessionId) {
        sessionId = await tryRestoreSession(meta.senderDid, 'recv');
      }
      if (!sessionId) {
        console.warn(
          '[MessagingService] envelope outcome: KeyRatchet no-session from',
          senderShort,
        );
        continue;
      }
      try {
        await NativeMessaging.acceptRekeyEnvelopeWithIdentity(
          sessionId,
          envelopeB64,
          getSelfDid(),
        );
        await persistSession(meta.senderDid, 'recv', sessionId);
        // A rekey refreshes the chain — give the pending-decrypt
        // buffer a chance to drain through the updated session.
        void drainPendingDecrypt(meta.senderDid);
        console.log(
          '[MessagingService] envelope outcome: KeyRatchet accepted from',
          senderShort,
        );
      } catch (e) {
        console.warn(
          '[MessagingService] envelope outcome: KeyRatchet failed from',
          senderShort,
          e,
        );
      }
      continue;
    }

    if (meta.contentType === ContentTypeTag.ReadReceipt) {
      // The peer is confirming they decoded a message we sent. Open
      // the receipt on our INBOUND session (same path as a Text), pull
      // the (seq, epoch) of the original out of the body, and flip the
      // matching sent message to 'read' so the bubble can show ✓✓.
      let sessionId = recvSessionByDid.get(meta.senderDid);
      if (!sessionId) {
        sessionId = await tryRestoreSession(meta.senderDid, 'recv');
      }
      if (!sessionId) {
        console.warn(
          '[msg] read receipt dropped — no recv session for',
          senderShort,
        );
        continue;
      }
      if (!getContact(meta.senderDid)?.dilithium_pk) {
        await ensureContactCached(meta.senderDid);
      }
      const peerPkHex = getContact(meta.senderDid)?.dilithium_pk;
      if (!peerPkHex) {
        console.warn(
          '[msg] read receipt dropped — no peer pk for',
          senderShort,
        );
        continue;
      }
      try {
        const bodyStr = await NativeMessaging.envelopeOpenVerifiedWithSession(
          sessionId,
          envelopeB64,
          hexToBase64(peerPkHex),
        );
        await persistSession(meta.senderDid, 'recv', sessionId);
        let payload: { seq?: unknown; epoch?: unknown };
        try {
          payload = JSON.parse(bodyStr);
        } catch {
          continue;
        }
        if (
          typeof payload?.seq === 'number' &&
          typeof payload?.epoch === 'number'
        ) {
          const confirmed = confirmSentMessage(
            meta.senderDid,
            payload.seq,
            payload.epoch,
          );
          if (confirmed) {
            console.log(
              '[msg] receipt: confirmed sent seq=' + payload.seq +
                ' epoch=' + payload.epoch +
                ' from=' + meta.senderDid,
            );
          }
        }
      } catch (e) {
        console.warn(
          '[MessagingService] envelope outcome: ReadReceipt open failed from',
          senderShort,
          e,
        );
      }
      continue;
    }

    if (meta.contentType !== ContentTypeTag.Text) {
      console.log(
        '[MessagingService] envelope outcome: skip non-text contentType',
        meta.contentType,
        'from',
        senderShort,
      );
      continue;
    }

    // [msg] log line 1 — exact shape the server team asked for.
    console.log(
      '[msg] received envelope: sender=' + meta.senderDid +
        ' seq=' + meta.sequence +
        ' epoch=' + meta.epoch +
        ' ct_bytes=' + meta.ciphertextLen,
    );

    // Inbound Text opens with our RECEIVE session for this peer —
    // the one we built from their KeyExchange.
    let sessionId = recvSessionByDid.get(meta.senderDid);
    if (!sessionId) {
      // We may have restarted since the peer's KeyExchange — try the
      // persisted inbound blob before giving up.
      sessionId = await tryRestoreSession(meta.senderDid, 'recv');
    }
    if (!sessionId) {
      console.warn(
        '[msg] session found: NONE for sender=' + meta.senderDid +
          ' (peer-initiated KeyExchange may have been missed)',
      );
      // Show a placeholder immediately and re-handshake — but also
      // buffer the envelope so that when the peer's KeyExchange does
      // land we can retry it through the new session and recover the
      // plaintext instead of losing it.
      desyncedDids.add(meta.senderDid);
      const placeholderId = appendUndecryptablePlaceholder(meta);
      bufferUndecryptable(meta.senderDid, {
        envelopeB64,
        placeholderId,
        meta,
      });
      void recoverMissingSession(meta.senderDid);
      continue;
    }

    // Lazy-fetch the sender's pks if we don't have them yet — covers
    // the case where Text arrives in the same /receive batch as the
    // KeyExchange but ahead of it (server queue ordering isn't a hard
    // guarantee).
    if (!getContact(meta.senderDid)?.dilithium_pk) {
      await ensureContactCached(meta.senderDid);
    }
    const senderContact = getContact(meta.senderDid);
    if (!senderContact?.dilithium_pk) {
      console.warn(
        '[MessagingService] envelope outcome: Text drop (no peer pk) from',
        senderShort,
      );
      continue;
    }

    let info;
    try {
      info = await NativeMessaging.getSessionInfo(sessionId);
    } catch (e) {
      console.warn(
        '[msg] session found: getSessionInfo FAILED for sender=' +
          meta.senderDid,
        e,
      );
      continue;
    }

    // chain_key comes back as base64 from the native bridge — decode
    // to hex so the prefix line matches the server team's "<8 hex>"
    // request and is comparable to their logs.
    const chainKeyHexPrefix = base64Top8Hex(info.chainKeyB64);

    // [msg] log line 2 — exact shape the server team asked for.
    console.log(
      '[msg] session found: chain_key_prefix=' + chainKeyHexPrefix +
        ' counter=' + info.counter +
        ' epoch=' + info.epoch,
    );

    let body: string;
    try {
      // Stateful decrypt — opens against the receive ratchet and
      // advances it in place, so the next inbound message decrypts in
      // order. Handles skip-forward / out-of-order delivery natively.
      body = await NativeMessaging.envelopeOpenVerifiedWithSession(
        sessionId,
        envelopeB64,
        hexToBase64(senderContact.dilithium_pk),
      );
    } catch (e) {
      // [msg] log line 3 — failure path with the native error.
      console.warn(
        '[msg] decrypt FAILED: ' + (e instanceof Error ? e.message : String(e)) +
          ' (sender=' + meta.senderDid +
          ' seq=' + meta.sequence +
          ' epoch=' + meta.epoch +
          ')',
      );
      // Ratchet drift — same remedy as the no-session case: show the
      // placeholder, buffer the ciphertext for a post-rehandshake
      // retry, and ship a fresh KeyExchange so the peer reciprocates.
      desyncedDids.add(meta.senderDid);
      const placeholderId = appendUndecryptablePlaceholder(meta);
      bufferUndecryptable(meta.senderDid, {
        envelopeB64,
        placeholderId,
        meta,
      });
      void recoverMissingSession(meta.senderDid);
      continue;
    }
    // Decrypt succeeded — the receive path is healthy again.
    desyncedDids.delete(meta.senderDid);
    // [msg] log line 3 — success path.
    console.log(
      '[msg] decrypt OK: sender=' + meta.senderDid +
        ' seq=' + meta.sequence +
        ' epoch=' + meta.epoch +
        ' body_bytes=' + body.length,
    );

    // Receipt-as-Text dispatch — see RECEIPT_MARKER. The peer is
    // confirming a message we sent. Flip the matching sent row to
    // 'read' and skip both the chat-bubble append and the
    // ship-receipt-back (we don't ack acks). The ratchet still
    // advanced, so persist before continuing.
    if (body.startsWith(RECEIPT_MARKER)) {
      await persistSession(meta.senderDid, 'recv', sessionId);
      try {
        const payload = JSON.parse(body.slice(RECEIPT_MARKER.length)) as {
          seq?: unknown;
          epoch?: unknown;
        };
        if (
          typeof payload.seq === 'number' &&
          typeof payload.epoch === 'number'
        ) {
          const confirmed = confirmSentMessage(
            meta.senderDid,
            payload.seq,
            payload.epoch,
          );
          if (confirmed) {
            console.log(
              '[msg] receipt: confirmed sent seq=' + payload.seq +
                ' epoch=' + payload.epoch +
                ' from=' + meta.senderDid,
            );
          }
        }
      } catch {
        // Malformed receipt payload — silently drop.
      }
      continue;
    }

    appendMessage({
      id: `recv-${meta.timestamp}-${meta.sequence}`,
      conversation_did: meta.senderDid,
      direction: 'received',
      content_type: MessageContentType.Text,
      body,
      timestamp: meta.timestamp,
      epoch: meta.epoch,
      sequence: meta.sequence,
      status: 'delivered',
    });
    // Decrypt advances the inbound ratchet — snapshot so the next
    // message (or a cold restart in between) opens at the right spot.
    await persistSession(meta.senderDid, 'recv', sessionId);
    // Send a delivery receipt back so the peer can flip the original
    // message to ✓✓ in their UI. Best-effort, fire-and-forget.
    void shipReadReceipt(meta.senderDid, meta.sequence, meta.epoch);
    // SECURITY: never log decrypted message bodies — not even truncated,
    // not even in dev. This is end-to-end encrypted messaging; the
    // whole point is that the plaintext is only ever held in memory for
    // rendering. Counter, length, and metadata are fine to log; the
    // body itself is not. (An earlier `[msg] rendered text:` line that
    // dumped the first 80 chars was a regression — do not add it back.)
  }
}

/** Pull the first 8 hex chars out of a base64-encoded byte string —
 *  used for the chain_key_prefix log so we can match against the
 *  server team's wire-format expectations. */
function base64Top8Hex(b64: string): string {
  const g = globalThis as unknown as {
    atob?: (s: string) => string;
    Buffer?: { from: (s: string, e: string) => { toString: (e: string) => string } };
  };
  try {
    const raw = typeof g.atob === 'function'
      ? g.atob(b64)
      : g.Buffer!.from(b64, 'base64').toString('binary');
    let hex = '';
    for (let i = 0; i < Math.min(4, raw.length); i++) {
      hex += raw.charCodeAt(i).toString(16).padStart(2, '0');
    }
    return hex;
  } catch {
    return '<decode-fail>';
  }
}

// ─── Inbound push subscription ────────────────────────────────────────
//
// Replaces the 5 s `GET /msg/receive` poll. Server pushes envelope
// frames into a long-lived stream the moment they're routable. Each
// frame is one bincode-encoded `MessageEnvelope` (the same shape
// `POST /msg/send` accepts). We hand it back to the existing native
// ingest path via the hex-wrapped wire shape `ingestEnvelopes`
// already understands, so all envelope-type handling stays in one
// place.

let inboundStreamId: string | null = null;
let inboundUnsubscribe: (() => void) | null = null;
// In-flight open promise. Used to coalesce concurrent
// `startInboundSubscription` calls (AuthContext effect re-runs,
// AppState foreground/background cycles, React Strict Mode double
// mount in dev) — without this, both calls pass the
// `inboundStreamId !== null` guard while the first is still in
// `await openInbound(...)`, the server's `register_subscriber`
// overwrites the first sender, and the first stream dies before
// its JS listener is even attached.
let inboundOpenInFlight: Promise<void> | null = null;

// Auto-reopen state. The server-push stream can drop (peer close,
// transport error, server cycling subscribers); without a revive it
// stays dead until the next foreground cycle and messages silently
// stop arriving. We re-open with a capped exponential backoff.
let inboundReopenTimer: ReturnType<typeof setTimeout> | null = null;
let inboundReopenAttempts = 0;
// Set by `stopInboundSubscription` (sign-out / identity change) so a
// close that races the teardown doesn't resurrect a dead stream.
let inboundStopped = false;
const INBOUND_REOPEN_BASE_MS = 2_000;
const INBOUND_REOPEN_MAX_MS = 30_000;

/**
 * Schedule a re-open of the inbound stream after a backoff. A healthy
 * stream resets the backoff via `onFrame`; a stream that keeps
 * flapping without delivering escalates the delay to the cap.
 */
function scheduleInboundReopen(): void {
  if (inboundStopped || inboundReopenTimer) return;
  const delay = Math.min(
    INBOUND_REOPEN_BASE_MS * 2 ** inboundReopenAttempts,
    INBOUND_REOPEN_MAX_MS,
  );
  inboundReopenAttempts++;
  console.log('[msg] inbound reopen scheduled in ' + delay + 'ms');
  inboundReopenTimer = setTimeout(() => {
    inboundReopenTimer = null;
    void startInboundSubscription();
  }, delay);
}

function bytesToHex(b64: string): string {
  // RN ships `atob`; if absent we fall back to Buffer.
  const g = globalThis as unknown as {
    atob?: (s: string) => string;
    Buffer?: { from: (s: string, e: string) => { toString: (e: string) => string } };
  };
  const raw =
    typeof g.atob === 'function'
      ? g.atob(b64)
      : g.Buffer!.from(b64, 'base64').toString('binary');
  let hex = '';
  for (let i = 0; i < raw.length; i++) {
    hex += raw.charCodeAt(i).toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Open the server-push inbound stream for the currently-bound
 * identity and start forwarding frames into the ingest pipeline.
 *
 * Default behaviour is idempotent: if a stream is already open, returns
 * immediately. `bindIdentity` (in `QuicSessionManager`) MUST have been
 * called with the same DID before this — caller is expected to be the
 * AuthContext effect that owns the messaging plumbing.
 *
 * `force: true` discards the existing stream state before opening a
 * fresh one. Used on AppState='active' (foreground): iOS may tear down
 * the QUIC socket while the app is suspended, but the JS side still
 * sees `inboundStreamId !== null` — the stale guard would then bail
 * and the server would keep delivering to a phantom stream, silently
 * losing messages that arrive while the chat is on screen. Forcing a
 * cycle re-registers us with the server and the deposit-store drain
 * (in AuthContext) catches anything that landed in the gap.
 */
let _startInboundCallSeq = 0;

export async function startInboundSubscription(
  force: boolean = false,
): Promise<void> {
  const callId = ++_startInboundCallSeq;
  console.log(
    '[msg] startInboundSubscription call#' + callId,
    'bridgeAvail=' + isNativeQuicSessionAvailable,
    'streamId=' + (inboundStreamId ?? 'null'),
    'inFlight=' + (inboundOpenInFlight !== null),
    'force=' + force,
  );
  if (!isNativeQuicSessionAvailable || !isNativeMessagingAvailable) {
    console.warn(
      '[MessagingService] inbound subscribe skipped — bridge not available; ' +
        'staying on legacy /msg/receive poll',
    );
    return;
  }
  // A caller asking for the stream re-arms auto-reopen — a prior
  // sign-out may have set the stopped flag.
  inboundStopped = false;
  // Force-cycle: detach the old listener and clear state so the open
  // below builds a fresh stream. The server's `register_subscriber`
  // overwrites prior subscribers on the new register, so we don't have
  // to send an explicit close — and the deposit-store drain that runs
  // alongside this call catches any envelope that landed during the
  // gap between the dead stream and the new register.
  if (force && inboundStreamId !== null) {
    console.log(
      '[msg] call#' + callId + ' force-cycle: dropping stale stream ' +
        inboundStreamId,
    );
    inboundUnsubscribe?.();
    inboundUnsubscribe = null;
    inboundStreamId = null;
  }
  // Already open, or an open is in flight — coalesce.
  if (inboundStreamId !== null) {
    console.log('[msg] call#' + callId + ' bail: already open');
    return;
  }
  if (inboundOpenInFlight) {
    console.log('[msg] call#' + callId + ' coalescing into in-flight open');
    return inboundOpenInFlight;
  }
  console.log('[msg] call#' + callId + ' opening fresh stream');

  inboundOpenInFlight = (async () => {
    let sessionId: string;
    try {
      sessionId = await getQuicSession();
    } catch (e) {
      console.warn('[MessagingService] getSession failed:', e);
      scheduleInboundReopen();
      return;
    }

    // Subscribe to the per-stream events BEFORE we publish the
    // streamId. The native reader thread starts the moment
    // `openInbound` resolves, so a server-side immediate-close
    // would otherwise fire `QuicInboundClosed` with no listeners
    // attached and we'd never know the stream died.
    let pendingStreamId: string;
    try {
      pendingStreamId = await NativeQuicSession.openInbound(
        sessionId,
        `${API_BASE}/inbound`,
      );
    } catch (e) {
      const err = e as { message?: string; code?: string };
      console.warn(
        '[MessagingService] openInbound failed:',
        'code=' + (err.code ?? 'unknown'),
        'message=' + (err.message ?? String(e)),
      );
      scheduleInboundReopen();
      return;
    }
    console.log('[msg] inbound stream opened streamId=' + pendingStreamId);

    const unsub = NativeQuicSession.subscribeInbound(pendingStreamId, {
      onFrame: (frameB64: string) => {
        // A delivered frame means the stream is healthy — reset the
        // reopen backoff so a future drop revives promptly.
        inboundReopenAttempts = 0;
        // Each frame is exactly one MessageEnvelope's bincode bytes.
        // Wrap in the ReceiveResponse shape `ingestEnvelopes` expects
        // and let the existing pipeline run unchanged. `sender_did`
        // is left blank — the ingest path pulls it from the envelope
        // metadata itself, so this field is informational only.
        const hex = bytesToHex(frameB64);
        void ingestEnvelopes([
          {
            sender_did: '',
            envelope_hex: hex,
            deposited_at: Math.floor(Date.now() / 1000),
          },
        ]);
      },
      onClosed: () => {
        console.warn('[msg] inbound stream closed by peer');
        if (inboundStreamId === pendingStreamId) {
          inboundStreamId = null;
          inboundUnsubscribe?.();
          inboundUnsubscribe = null;
          // Server-push is now dead — revive it (unless we were
          // explicitly stopped by a sign-out).
          scheduleInboundReopen();
        }
      },
      onError: (msg: string) => {
        console.warn('[msg] inbound stream error:', msg);
        if (inboundStreamId === pendingStreamId) {
          inboundStreamId = null;
          inboundUnsubscribe?.();
          inboundUnsubscribe = null;
          scheduleInboundReopen();
        }
      },
    });

    inboundStreamId = pendingStreamId;
    inboundUnsubscribe = unsub;
  })();

  try {
    await inboundOpenInFlight;
  } finally {
    inboundOpenInFlight = null;
  }
}

/** Close the inbound stream and tear down the listener. Suppresses
 *  auto-reopen — call only on sign-out / identity change. */
export function stopInboundSubscription(): void {
  inboundStopped = true;
  if (inboundReopenTimer) {
    clearTimeout(inboundReopenTimer);
    inboundReopenTimer = null;
  }
  inboundReopenAttempts = 0;
  if (inboundUnsubscribe) {
    inboundUnsubscribe();
    inboundUnsubscribe = null;
  }
  if (inboundStreamId) {
    try {
      NativeQuicSession.closeInbound(inboundStreamId);
    } catch {
      /* best-effort */
    }
    inboundStreamId = null;
  }
}

// ─── High-level helpers used by screens ───────────────────────────────

/**
 * Send a plaintext chat message to `remoteDid`. Returns the local
 * message row (already appended to the store) so screens can render
 * an optimistic bubble immediately.
 *
 * When the native messaging bridge is registered, takes the keys-stay-
 * in-Rust path: `sessionInit` REST → native `initiateSession` →
 * `sealKeyExchangeSigned` → native `sealTextSigned` → `/msg/send`.
 * Otherwise falls through to the legacy stub so dev environments
 * without the bridge keep working.
 */
export async function sendTextMessage(
  remoteDid: Did,
  text: string,
): Promise<LocalMessage> {
  if (isNativeMessagingAvailable) {
    return sendTextMessageNative(remoteDid, text);
  }

  let session = loadSession(remoteDid);
  if (!session) {
    // No prior session — synthesise one. Real flow goes through
    // `sessionInit` + `cryptoStub.initiateSession`.
    const result = cryptoStub.initiateSession(getSelfDid(), remoteDid, '');
    session = result.session;
    saveSession(session);
  }

  const envelope = cryptoStub.sealTextMessage(session, text);
  const signed = cryptoStub.signEnvelope(envelope, '');
  const _hex = cryptoStub.encodeEnvelope(signed);
  saveSession(session);

  // Live path (uncomment once the backend is reachable):
  //   await sendEnvelope(_hex);

  const local: LocalMessage = {
    id: `local-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    conversation_did: remoteDid,
    direction: 'sent',
    content_type: MessageContentType.Text,
    body: text,
    timestamp: envelope.timestamp,
    epoch: envelope.epoch,
    sequence: envelope.sequence,
    status: 'sent',
  };
  appendMessage(local);
  return local;
}

/**
 * Process a batch of inbound envelopes coming back from `receivePending`.
 * Verifies signatures, accepts new sessions, decrypts content envelopes,
 * and appends the resulting `LocalMessage` rows to the store.
 *
 * Async when the native bridge is in play (each envelope round-trips
 * through the native side); sync for the legacy stub fallback. Callers
 * should `await` regardless — it's a no-op for sync paths.
 */
export async function ingestEnvelopes(
  envelopes: ReceiveResponse['messages'],
): Promise<void> {
  if (isNativeMessagingAvailable) {
    await ingestEnvelopesNative(envelopes);
    return;
  }
  ingestEnvelopesStub(envelopes);
}

function ingestEnvelopesStub(
  envelopes: ReceiveResponse['messages'],
): void {
  for (const raw of envelopes) {
    let env: MessageEnvelope;
    try {
      env = cryptoStub.decodeEnvelope(raw.envelope_hex);
    } catch {
      continue; // malformed envelope, drop
    }

    const senderContact = getContact(env.sender_did);
    const senderPk = senderContact?.dilithium_pk ?? '';
    if (!cryptoStub.verifyEnvelope(env, senderPk)) continue;

    if (env.content_type === MessageContentType.KeyExchange) {
      const session = cryptoStub.acceptSession(
        getSelfDid(),
        env.sender_did,
        env.ciphertext,
        '',
      );
      saveSession(session);
      continue;
    }

    if (env.content_type === MessageContentType.KeyRatchet) {
      const session = loadSession(env.sender_did);
      if (session) {
        session.epoch += 1;
        session.counter = 0;
        saveSession(session);
      }
      continue;
    }

    const session = loadSession(env.sender_did);
    if (!session) continue; // no session, can't decrypt

    const body = cryptoStub.openEnvelope(env, session.chain_key);
    appendMessage({
      id: `recv-${env.timestamp}-${env.sequence}`,
      conversation_did: env.sender_did,
      direction: 'received',
      content_type: env.content_type,
      body,
      timestamp: env.timestamp,
      epoch: env.epoch,
      sequence: env.sequence,
      status: 'delivered',
    });
  }
}

// Re-export read helpers so screens have a single import surface.
export {
  getContact,
  getMessages,
  getSelfDid,
  hasLiveSelfDid,
  markRead,
  setSelfDid,
  subscribeStore as subscribe,
  upsertContact,
};
export { getContacts, getConversations } from './MessagingMockData';
