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
  getContact,
  getMessages,
  getSelfDid,
  getSerializedSession,
  hasLiveSelfDid,
  markRead,
  setSelfDid,
  setSerializedSession,
  upsertContact,
  subscribe as subscribeStore,
} from './MessagingMockData';
import {
  ContentTypeTag,
  isNativeMessagingAvailable,
  NativeMessaging,
} from './NativeMessaging';
import {
  isNativeQuicSessionAvailable,
  NativeQuicSession,
} from './NativeQuicSession';
import { getSession as getQuicSession } from './QuicSessionManager';

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

/** remote_did → opaque native session id.
 *
 *  In-memory; the durable copy is the serialized blob persisted by
 *  `MessagingMockData.setSerializedSession`. On cold start the first
 *  call to `getOrInitNativeSession` for a given peer looks up the
 *  persisted blob and deserializes it back into the native runtime
 *  before falling back to a fresh handshake. */
const nativeSessionByDid = new Map<Did, string>();

/** Snapshot the current native session state to the persistent store.
 *  Called after every initiate / accept / send so a cold restart can
 *  resume the conversation without re-handshaking. */
async function persistSerializedSession(
  did: Did,
  sessionId: string,
): Promise<void> {
  try {
    const blob = await NativeMessaging.serializeSession(sessionId);
    setSerializedSession(did, blob);
  } catch (e) {
    console.warn('[MessagingService] serializeSession failed for', did, e);
  }
}

/** Try to restore a previously-serialized session from the persisted
 *  store. Returns the new native session id on success, undefined if
 *  no blob is stored or the deserialize call fails (in which case the
 *  caller should re-handshake). */
async function tryRestoreSession(did: Did): Promise<string | undefined> {
  const blob = getSerializedSession(did);
  if (!blob) return undefined;
  try {
    const r = await NativeMessaging.deserializeSession(blob);
    nativeSessionByDid.set(did, r.sessionId);
    console.log('[MessagingService] restored session from disk for', did);
    return r.sessionId;
  } catch (e) {
    console.warn('[MessagingService] deserializeSession failed for', did, e);
    return undefined;
  }
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
 * Resolve (or create) a native session for `remoteDid`. On first
 * contact this fetches the peer's Kyber + Dilithium pks via
 * `/msg/session/init`, caches them on the contact row, encapsulates a
 * fresh shared secret, and ships the `KeyExchange` envelope to the
 * peer. The native session id is cached for subsequent sends.
 *
 * `recipient` is what `/msg/session/init` looks up on the server side
 * — typically a `@username` or DID. When the caller already knows the
 * peer's DID we pass it as both, since the server accepts either.
 */
async function getOrInitNativeSession(
  remoteDid: Did,
  recipient: string,
): Promise<string> {
  const cached = nativeSessionByDid.get(remoteDid);
  if (cached) return cached;

  // Cold-start restore — if we have a persisted session for this peer
  // from a previous app launch, deserialize it back into the native
  // runtime instead of forcing another KeyExchange round-trip.
  const restored = await tryRestoreSession(remoteDid);
  if (restored) return restored;

  // First contact — fetch the peer's public keys.
  const init = await sessionInit(recipient);

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
  nativeSessionByDid.set(init.recipient_did, initResult.sessionId);

  // Ship the Kyber ciphertext to the peer as a signed KeyExchange
  // envelope so they can call `acceptSessionWithIdentity` and reach
  // the same chain key.
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
  await persistSerializedSession(init.recipient_did, initResult.sessionId);

  return initResult.sessionId;
}

/** Native-backed send. Falls through to the stub at the call site
 *  whenever `isNativeMessagingAvailable` is false. */
async function sendTextMessageNative(
  remoteDid: Did,
  text: string,
): Promise<LocalMessage> {
  // For now `recipient` and `remoteDid` are the same — the inbox is
  // populated with DIDs, not usernames. When username lookup lands the
  // caller should pass the @handle instead.
  const sessionId = await getOrInitNativeSession(remoteDid, remoteDid);

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
    // Local optimistic append still happens; UI shows pending.
    sendStatus = 'pending';
  }

  // Ask the native side for the post-seal counter/epoch so the stored
  // row reflects the actual ratchet position.
  const info = await NativeMessaging.getSessionInfo(sessionId);

  // Snapshot the ratchet-advanced session so a restart picks up at
  // the right counter instead of replaying / desyncing.
  await persistSerializedSession(remoteDid, sessionId);

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
    const r = await sessionInit(did);
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

    let meta;
    try {
      meta = await NativeMessaging.envelopeDescribe(envelopeB64);
    } catch (e) {
      console.warn(
        '[MessagingService] envelope outcome: drop (describe failed)',
        e,
      );
      continue;
    }

    const senderShort = meta.senderDid.slice(0, 24) + '…';

    if (meta.contentType === ContentTypeTag.KeyExchange) {
      // Inbound first-contact. Hand the whole bincode envelope to the
      // native side; Rust extracts the Kyber ciphertext, asserts the
      // DID routing, and decapsulates against our local Kyber sk.
      // Cache the peer's pks first so future Text envelopes from them
      // verify cleanly + their conversation row appears in the inbox.
      await ensureContactCached(meta.senderDid);
      try {
        const accepted = await NativeMessaging.acceptEnvelopeWithIdentity(
          getSelfDid(),
          meta.senderDid,
          envelopeB64,
        );
        nativeSessionByDid.set(meta.senderDid, accepted.sessionId);
        await persistSerializedSession(meta.senderDid, accepted.sessionId);
        console.log(
          '[MessagingService] envelope outcome: KeyExchange accepted from',
          senderShort,
        );
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
      const sessionId = nativeSessionByDid.get(meta.senderDid);
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
        await persistSerializedSession(meta.senderDid, sessionId);
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

    let sessionId = nativeSessionByDid.get(meta.senderDid);
    if (!sessionId) {
      // Receiver might have restarted between sender's KeyExchange and
      // this Text — try restoring from the persisted session blob
      // before giving up.
      sessionId = await tryRestoreSession(meta.senderDid);
    }
    if (!sessionId) {
      console.warn(
        '[msg] session found: NONE for sender=' + meta.senderDid +
          ' (peer-initiated KeyExchange may have been missed)',
      );
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
      body = await NativeMessaging.envelopeOpenVerifiedText(
        envelopeB64,
        info.chainKeyB64,
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
      continue;
    }
    // [msg] log line 3 — success path.
    console.log(
      '[msg] decrypt OK: sender=' + meta.senderDid +
        ' seq=' + meta.sequence +
        ' epoch=' + meta.epoch +
        ' body_bytes=' + body.length,
    );

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
    // Decrypt advances the ratchet — snapshot so the next message
    // (or a cold restart in between) opens at the correct position.
    await persistSerializedSession(meta.senderDid, sessionId);
    // [msg] log line 4 — rendered text (truncated for the log).
    console.log(
      '[msg] rendered text: ' +
        (body.length > 80 ? body.slice(0, 80) + '…' : body),
    );
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
 * Idempotent: if a stream is already open, returns immediately.
 * `bindIdentity` (in `QuicSessionManager`) MUST have been called
 * with the same DID before this — caller is expected to be the
 * AuthContext effect that owns the messaging plumbing.
 */
let _startInboundCallSeq = 0;

export async function startInboundSubscription(): Promise<void> {
  const callId = ++_startInboundCallSeq;
  console.log(
    '[msg] startInboundSubscription call#' + callId,
    'bridgeAvail=' + isNativeQuicSessionAvailable,
    'streamId=' + (inboundStreamId ?? 'null'),
    'inFlight=' + (inboundOpenInFlight !== null),
  );
  if (!isNativeQuicSessionAvailable || !isNativeMessagingAvailable) {
    console.warn(
      '[MessagingService] inbound subscribe skipped — bridge not available; ' +
        'staying on legacy /msg/receive poll',
    );
    return;
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
      return;
    }
    console.log('[msg] inbound stream opened streamId=' + pendingStreamId);

    const unsub = NativeQuicSession.subscribeInbound(pendingStreamId, {
      onFrame: (frameB64: string) => {
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
        }
      },
      onError: (msg: string) => {
        console.warn('[msg] inbound stream error:', msg);
        if (inboundStreamId === pendingStreamId) {
          inboundStreamId = null;
          inboundUnsubscribe?.();
          inboundUnsubscribe = null;
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

/** Close the inbound stream and tear down the listener. */
export function stopInboundSubscription(): void {
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
