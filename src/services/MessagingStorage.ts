/**
 * MessagingStorage — encrypted-at-rest persistence for the messaging
 * store (contacts, message history, unread counts, native session
 * blobs).
 *
 * Backing: react-native-keychain in `setGenericPassword` mode, which
 * lands on iOS Keychain + Android EncryptedSharedPreferences. Both are
 * hardware-encrypted on modern devices. One entry per signed-in DID
 * (service name carries a short DID tail) so multi-identity flows on
 * the same device don't share storage.
 *
 * Shape on disk is a single JSON blob — fine for the current message
 * volumes. Migrate to SQLCipher once history grows past a few hundred
 * KB; the in-memory store in `MessagingMockData` already isolates this
 * module behind a load/save interface.
 */

import * as Keychain from 'react-native-keychain';
import type { Contact, Did, LocalMessage } from '../types/messaging';

const SERVICE_PREFIX = 'sovnet_messaging_v1_';

export interface MessagingStateBlob {
  version: 1;
  contacts: Contact[];
  /** Serialized message history, keyed by conversation peer DID. */
  messages: Record<Did, LocalMessage[]>;
  /** Unread counts, keyed by conversation peer DID. */
  unread: Record<Did, number>;
  /**
   * Native session state, base64 of the bincode blob produced by
   * `NativeMessaging.serializeSession`. Keyed by remote peer DID.
   * Restored on cold start so receivers can decrypt without
   * re-handshaking.
   */
  sessions: Record<Did, string>;
}

/**
 * Service name on the keychain. Last 16 chars of the DID hex are
 * unique enough across identities, and short enough to stay well
 * under any platform-specific service-name limits.
 */
function serviceFor(selfDid: Did): string {
  const tail = selfDid.replace(/^did:zhtp:/, '').slice(-16);
  return `${SERVICE_PREFIX}${tail}`;
}

export async function loadMessagingState(
  selfDid: Did,
): Promise<MessagingStateBlob | null> {
  try {
    const r = await Keychain.getGenericPassword({ service: serviceFor(selfDid) });
    if (!r) return null;
    const parsed = JSON.parse(r.password) as MessagingStateBlob;
    if (parsed.version !== 1) {
      console.warn('[MessagingStorage] unknown blob version', parsed.version);
      return null;
    }
    return parsed;
  } catch (e) {
    console.warn('[MessagingStorage] load failed:', e);
    return null;
  }
}

export async function saveMessagingState(
  selfDid: Did,
  blob: MessagingStateBlob,
): Promise<void> {
  try {
    await Keychain.setGenericPassword(
      'messaging_state',
      JSON.stringify(blob),
      {
        service: serviceFor(selfDid),
        accessible:
          Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      },
    );
  } catch (e) {
    console.warn('[MessagingStorage] save failed:', e);
  }
}

export async function clearMessagingState(selfDid: Did): Promise<void> {
  try {
    await Keychain.resetGenericPassword({ service: serviceFor(selfDid) });
  } catch (e) {
    console.warn('[MessagingStorage] clear failed:', e);
  }
}
