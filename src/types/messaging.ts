/**
 * Post-quantum encrypted messaging — type contract.
 *
 * Mirrors the wire format and lib-client API surface described in the
 * mobile integration guide. The phone app's messaging stack is built
 * against these types so the UI can be wired up before the native FFI
 * (UniFFI bindings to lib-client) lands. When the bindings ship, the
 * crypto stubs in MessagingService swap to NativeModule calls and the
 * shapes here stay unchanged.
 */

/** ZHTP decentralised identifier — `did:zhtp:<hex>`. */
export type Did = string;

/**
 * Envelope content kinds. Mirrors the server-side `ContentType` enum;
 * spelled in snake_case so encoded envelopes round-trip without remap.
 */
export enum MessageContentType {
  Text = 'text',
  Image = 'image',
  File = 'file',
  Voice = 'voice',
  KeyExchange = 'key_exchange',
  KeyRatchet = 'key_ratchet',
  ReadReceipt = 'read_receipt',
}

/**
 * Wire envelope. Always signed; the server never sees plaintext.
 *
 * `ciphertext` is hex-encoded; for KeyExchange / KeyRatchet it carries
 * a Kyber1024 ciphertext, for content types it carries the
 * ChaCha20-Poly1305 sealed body.
 */
export interface MessageEnvelope {
  version: number;
  sender_did: Did;
  recipient_did: Did;
  timestamp: number;
  epoch: number;
  sequence: number;
  content_type: MessageContentType;
  /** Hex string. */
  ciphertext: string;
  /** Hex string — Dilithium5 signature over the canonical envelope. */
  signature: string;
}

/**
 * Per-contact session state. The chain key never leaves the device;
 * in production it lives in an encrypted SQLite store rooted in the
 * platform secure enclave.
 */
export interface Session {
  local_did: Did;
  remote_did: Did;
  /** 32-byte chain key, hex. Advances after each message via the ratchet. */
  chain_key: string;
  /** Message counter within the current epoch (resets on rekey). */
  counter: number;
  /** Ratchet generation; increments on every successful rekey. */
  epoch: number;
  /** Cached for re-keying. Hex. */
  remote_kyber_pk?: string;
  /** Cached for signature verification on inbound envelopes. Hex. */
  remote_dilithium_pk?: string;
  created_at: number;
}

/** Address-book entry. Public keys cached after first session-init. */
export interface Contact {
  did: Did;
  username: string;
  display_name: string;
  kyber_pk?: string;
  dilithium_pk?: string;
  online: boolean;
  last_seen?: number;
}

/** UI-side status for a single message. */
export type MessageStatus =
  | 'pending' // queued locally, not yet sent
  | 'sent' // server accepted (relayed/delivered)
  | 'delivered' // confirmed reached recipient's node
  | 'read' // read receipt observed
  | 'failed';

/**
 * A decrypted message stored in the local DB. Only the body is sensitive
 * here — the on-disk store is encrypted with a key from the secure enclave.
 */
export interface LocalMessage {
  id: string;
  conversation_did: Did;
  direction: 'sent' | 'received';
  content_type: MessageContentType;
  /** UTF-8 text for Text; base64 for binary kinds. */
  body: string;
  timestamp: number;
  epoch: number;
  sequence: number;
  status: MessageStatus;
}

/** Conversation row in the inbox list. */
export interface Conversation {
  contact: Contact;
  last_message?: LocalMessage;
  unread_count: number;
}

// ─── REST DTOs ────────────────────────────────────────────────────────

export interface SessionInitRequest {
  sender_did: Did;
  recipient: string; // username (e.g. "@alice") or DID
}

export interface SessionInitResponse {
  status: string;
  recipient_did: Did;
  recipient_username: string;
  /** Hex 1568 bytes. */
  kyber_public_key: string;
  /** Hex 2592 bytes. */
  dilithium_public_key: string;
}

export type SendStatus = 'delivered' | 'relayed' | 'queued';

export interface SendRequest {
  envelope_hex: string;
}

export interface SendResponse {
  status: SendStatus;
  envelope_id?: string;
}

export interface ReceiveResponse {
  count: number;
  messages: Array<{
    sender_did: Did;
    envelope_hex: string;
    deposited_at: number;
  }>;
}

export interface DepositRequest {
  sender_did: Did;
  recipient_did: Did;
  envelopes_hex: string[];
}

export interface DepositResponse {
  status: string;
  count: number;
  ttl_hours: number;
}

export interface PresenceWatchRequest {
  watcher_did: Did;
  target_dids: Did[];
}

export interface PresenceWatchResponse {
  watching: Array<{ did: Did; online: boolean }>;
}
