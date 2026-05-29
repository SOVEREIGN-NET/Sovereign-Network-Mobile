/**
 * In-memory contact/message store for the messaging UI.
 *
 * Backs the inbox + chat detail screens with three Maps and a tiny
 * pub-sub so subscribers re-render when state changes. State is
 * hydrated from `MessagingStorage` (keychain-backed, encrypted at
 * rest) once `setSelfDid` is called with a live DID, and re-persisted
 * on every change via a debounced save.
 */

import {
  type Contact,
  type Conversation,
  type Did,
  type LocalMessage,
} from '../types/messaging';
import {
  loadMessagingState,
  saveMessagingState,
  type MessagingStateBlob,
} from './MessagingStorage';

const FALLBACK_SELF_DID: Did =
  'did:zhtp:0000000000000000000000000000000000000000000000000000000000000001';

/**
 * Live DID of the signed-in user, set by the auth layer once the
 * identity is loaded. Until then we hand callers the fallback mock
 * DID so the inbox UI still renders against seed fixtures during
 * development. Real REST calls will fail against the mock — the auth
 * layer should call `setSelfDid` before any messaging request fires.
 */
let liveSelfDid: Did | null = null;

export const SELF_USERNAME = 'you';

// ─── Mutable in-memory store ──────────────────────────────────────────

const contactsByDid = new Map<Did, Contact>();
const messagesByConversation = new Map<Did, LocalMessage[]>();
const unreadByDid = new Map<Did, number>();
/** Serialized native session blobs (base64) keyed by remote DID. */
const serializedSessionsByDid = new Map<Did, string>();

// ─── Persistence wiring ────────────────────────────────────────────────
//
// `saveEnabled` is gated to `false` between `setSelfDid` and the
// async hydrate completing — otherwise we'd persist an empty
// snapshot on top of real on-disk state during the load. Once
// hydrate is done (or fails) we flip the gate on and every
// subsequent notify schedules a debounced save.

let saveEnabled = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const SAVE_DEBOUNCE_MS = 300;

function snapshot(): MessagingStateBlob {
  return {
    version: 1,
    contacts: Array.from(contactsByDid.values()),
    messages: Object.fromEntries(messagesByConversation.entries()),
    unread: Object.fromEntries(unreadByDid.entries()),
    sessions: Object.fromEntries(serializedSessionsByDid.entries()),
  };
}

function scheduleSave(): void {
  if (!saveEnabled || !liveSelfDid) return;
  if (saveTimer) clearTimeout(saveTimer);
  const did = liveSelfDid;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void saveMessagingState(did, snapshot());
  }, SAVE_DEBOUNCE_MS);
}

function clearAll(): void {
  contactsByDid.clear();
  messagesByConversation.clear();
  unreadByDid.clear();
  serializedSessionsByDid.clear();
}

function hydrateFromBlob(blob: MessagingStateBlob): void {
  for (const c of blob.contacts) contactsByDid.set(c.did, c);
  for (const [did, msgs] of Object.entries(blob.messages)) {
    if (Array.isArray(msgs)) messagesByConversation.set(did, msgs);
  }
  for (const [did, n] of Object.entries(blob.unread)) {
    if (typeof n === 'number') unreadByDid.set(did, n);
  }
  if (blob.sessions) {
    for (const [did, b64] of Object.entries(blob.sessions)) {
      if (typeof b64 === 'string' && b64.length > 0) {
        serializedSessionsByDid.set(did, b64);
      }
    }
  }
}

export function setSelfDid(did: Did | null): void {
  const next = did && did.length > 0 ? did : null;
  if (next === liveSelfDid) return;

  // Block saves until the async hydrate finishes — otherwise the empty
  // in-memory state above would overwrite the persisted blob.
  saveEnabled = false;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  liveSelfDid = next;
  clearAll();
  notify();

  if (!next) return;

  void loadMessagingState(next).then(blob => {
    // Bail if the active DID has changed under us during the load.
    if (liveSelfDid !== next) return;
    if (blob) {
      hydrateFromBlob(blob);
      notify();
    }
    saveEnabled = true;
  });
}

// Tiny pub-sub for screens that want live updates.
type Listener = () => void;
const listeners = new Set<Listener>();

function notify(): void {
  listeners.forEach(l => l());
  scheduleSave();
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ─── Read API ─────────────────────────────────────────────────────────

export function getSelfDid(): Did {
  return liveSelfDid ?? FALLBACK_SELF_DID;
}

/** True once `setSelfDid` has been called with a real DID. Useful for
 *  the probe to refuse running against the mock. */
export function hasLiveSelfDid(): boolean {
  return liveSelfDid !== null;
}

export function getContacts(): Contact[] {
  return Array.from(contactsByDid.values());
}

export function getContact(did: Did): Contact | undefined {
  return contactsByDid.get(did);
}

export function getMessages(did: Did): LocalMessage[] {
  return messagesByConversation.get(did) ?? [];
}

export function getConversations(): Conversation[] {
  const rows: Conversation[] = [];
  for (const contact of contactsByDid.values()) {
    const msgs = messagesByConversation.get(contact.did);
    if (!msgs || msgs.length === 0) continue;
    const last = msgs[msgs.length - 1];
    rows.push({
      contact,
      last_message: last,
      unread_count: unreadByDid.get(contact.did) ?? 0,
    });
  }
  // Most-recent first.
  rows.sort(
    (a, b) =>
      (b.last_message?.timestamp ?? 0) - (a.last_message?.timestamp ?? 0),
  );
  return rows;
}

export function getSerializedSession(did: Did): string | undefined {
  return serializedSessionsByDid.get(did);
}

// ─── Write API ────────────────────────────────────────────────────────

export function upsertContact(contact: Contact): void {
  contactsByDid.set(contact.did, contact);
  notify();
}

export function appendMessage(msg: LocalMessage): void {
  // Build a fresh array reference so React's `Object.is` check picks
  // up the change. In-place mutation kept the same Array identity and
  // caused ChatScreen to silently skip the re-render — visible as
  // "had to leave the chat and come back to see new messages".
  const arr = messagesByConversation.get(msg.conversation_did) ?? [];
  messagesByConversation.set(msg.conversation_did, [...arr, msg]);
  if (msg.direction === 'received') {
    unreadByDid.set(
      msg.conversation_did,
      (unreadByDid.get(msg.conversation_did) ?? 0) + 1,
    );
  }
  notify();
}

export function markRead(did: Did): void {
  if ((unreadByDid.get(did) ?? 0) === 0) return;
  unreadByDid.set(did, 0);
  notify();
}

/**
 * Swap one message for another, in place. Used when an undecryptable
 * placeholder is rescued by a later KeyExchange: the placeholder's slot
 * in the timeline (and the unread count it already contributed) stays
 * put, but its content is now the decoded plaintext. No-op if `oldId`
 * isn't present in the conversation.
 */
export function replaceMessage(
  did: Did,
  oldId: string,
  next: LocalMessage,
): void {
  const arr = messagesByConversation.get(did);
  if (!arr) return;
  const idx = arr.findIndex(m => m.id === oldId);
  if (idx < 0) return;
  const updated = [...arr.slice(0, idx), next, ...arr.slice(idx + 1)];
  messagesByConversation.set(did, updated);
  notify();
}

/**
 * Drop a single message from a conversation by id. Used when an
 * undecryptable placeholder turns out, on retry, to have been a
 * `ReadReceipt` smuggled through the Text channel — the receipt is
 * processed (status flipped on the matching sent message) and the
 * placeholder removed so the timeline isn't littered with marker text.
 * No-op if `id` isn't present.
 */
export function removeMessage(did: Did, id: string): void {
  const arr = messagesByConversation.get(did);
  if (!arr) return;
  const filtered = arr.filter(m => m.id !== id);
  if (filtered.length === arr.length) return;
  messagesByConversation.set(did, filtered);
  notify();
}

/**
 * Update the status of a single message (and optionally other fields)
 * by id. Used by the resend path to flip a `'failed'` message back
 * through `'pending'` → `'sent'`/`'delivered'` as the retry POST
 * progresses, refreshing the seq + epoch from the post-seal session.
 * Returns true when the message was found, false otherwise.
 */
export function updateMessageStatus(
  did: Did,
  id: string,
  status: LocalMessage['status'],
  patch?: Partial<LocalMessage>,
): boolean {
  const arr = messagesByConversation.get(did);
  if (!arr) return false;
  const idx = arr.findIndex(m => m.id === id);
  if (idx < 0) return false;
  const updated = [...arr];
  updated[idx] = { ...updated[idx], ...patch, status };
  messagesByConversation.set(did, updated);
  notify();
  return true;
}

/**
 * Flip the status of a sent message identified by `(seq, epoch)` to
 * `'read'` — the end-to-end "recipient confirmed receipt" state, set
 * when a `ReadReceipt` envelope from the peer arrives. No-op if no
 * matching sent message is in the local store. Returns true when found.
 */
export function confirmSentMessage(
  did: Did,
  seq: number,
  epoch: number,
): boolean {
  const arr = messagesByConversation.get(did);
  if (!arr) return false;
  const idx = arr.findIndex(
    m =>
      m.direction === 'sent' &&
      m.sequence === seq &&
      m.epoch === epoch,
  );
  if (idx < 0) return false;
  const updated = [...arr];
  updated[idx] = { ...updated[idx], status: 'read' };
  messagesByConversation.set(did, updated);
  notify();
  return true;
}

export function setSerializedSession(did: Did, blobB64: string): void {
  serializedSessionsByDid.set(did, blobB64);
  notify();
}

/** Drop the persisted session blob for `did` so the next send
 *  re-handshakes from scratch instead of restoring a stale session. */
export function clearSerializedSession(did: Did): void {
  if (serializedSessionsByDid.delete(did)) {
    notify();
  }
}

/** Erase every local trace of a conversation — messages, contact,
 *  unread count and persisted session blob. Used by the "Delete
 *  conversation" action so a desynced thread can be restarted from
 *  a clean slate. */
export function deleteConversation(did: Did): void {
  messagesByConversation.delete(did);
  contactsByDid.delete(did);
  unreadByDid.delete(did);
  serializedSessionsByDid.delete(did);
  notify();
}
