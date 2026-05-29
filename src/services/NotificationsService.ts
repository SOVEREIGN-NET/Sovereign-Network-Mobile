/**
 * NotificationsService — release-announcement subscription.
 *
 * Wraps the open (unauthenticated) `/api/v1/notifications/*` endpoints.
 * A member opts in with their canonical chain DID; the Council later
 * fans release announcements out to the stored list.
 *
 * Scope: we only ever *send* — subscribe / unsubscribe. The
 * Council-only subscriber list (`GET /subscribers`) is backend tooling
 * and is deliberately not bound here.
 *
 * Storage is per-validator and best-effort: the list lives on whichever
 * validator served the request and isn't replicated. Both calls are
 * idempotent, so a defensive re-subscribe or a retry is always safe.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { publicQuicRequest } from './quic';

/**
 * AsyncStorage key holding the DID this device last opted in with (a
 * JSON-encoded string, or `null`). Shared so the Bubl-tab opt-in card
 * and the AuthContext defensive re-subscribe read and write the same
 * slot. Must match the `usePersistedState` key in `ReleaseNotifyCard`.
 */
export const RELEASE_SUBSCRIBED_DID_KEY = 'notifications.releaseSubscribedDid';

/** `subscribed: true` once the DID is stored. Idempotent server-side. */
export interface SubscribeResponse {
  subscribed: boolean;
  did: string;
}

/** `removed: false` simply means the DID wasn't on the list — still a
 *  success, not an error. */
export interface UnsubscribeResponse {
  removed: boolean;
  did: string;
}

// Server-documented DID constraints — checked client-side so an obvious
// mistake fails fast with a readable message instead of a 400 round-trip.
const DID_PREFIX = 'did:zhtp:';
const DID_MAX_LEN = 256;

function assertCanonicalDid(did: string): void {
  if (!did) {
    throw new Error('No identity — sign in before subscribing.');
  }
  if (!did.startsWith(DID_PREFIX)) {
    throw new Error(`Identity DID must start with "${DID_PREFIX}".`);
  }
  if (did.length > DID_MAX_LEN) {
    throw new Error(`Identity DID exceeds ${DID_MAX_LEN} characters.`);
  }
}

/**
 * Opt the given DID into release announcements. Idempotent — calling it
 * again with the same DID is a no-op server-side. Throws on a malformed
 * DID or a non-2xx response.
 */
export async function subscribeToReleases(
  did: string,
): Promise<SubscribeResponse> {
  assertCanonicalDid(did);
  return publicQuicRequest<SubscribeResponse>(
    '/api/v1/notifications/subscribe',
    {
      method: 'POST',
      body: JSON.stringify({ did }),
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

/**
 * Remove the given DID from release announcements. Succeeds (with
 * `removed: false`) even if the DID was never on the list.
 */
export async function unsubscribeFromReleases(
  did: string,
): Promise<UnsubscribeResponse> {
  assertCanonicalDid(did);
  return publicQuicRequest<UnsubscribeResponse>(
    '/api/v1/notifications/unsubscribe',
    {
      method: 'POST',
      body: JSON.stringify({ did }),
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

/**
 * Defensive re-subscribe, called on app launch / identity activation.
 *
 * The subscriber list is per-validator and not replicated, so a member
 * who opted in on the Bubl tab can quietly fall off the list after a
 * validator failover or a launch that lands on a different node. If
 * this device previously opted in with `did`, silently re-assert the
 * subscription against the validator we're now talking to.
 *
 * Idempotent and best-effort: a no-op when the device never opted in or
 * opted in under a different identity, and it never throws — the user's
 * explicit tap on the card stays the reliable path.
 */
export async function resubscribeIfOptedIn(
  did: string | null | undefined,
): Promise<void> {
  if (!did) return;
  try {
    const raw = await AsyncStorage.getItem(RELEASE_SUBSCRIBED_DID_KEY);
    if (raw == null) return;
    let stored: unknown;
    try {
      stored = JSON.parse(raw);
    } catch {
      stored = raw; // tolerate a bare (non-JSON) legacy value
    }
    if (stored !== did) return;
    await subscribeToReleases(did);
    console.log('[notifications] defensive re-subscribe ok');
  } catch (e) {
    console.warn('[notifications] defensive re-subscribe failed:', e);
  }
}
