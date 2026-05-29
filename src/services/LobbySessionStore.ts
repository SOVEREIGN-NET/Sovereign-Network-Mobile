/**
 * LobbySessionStore — secure persistence for the OPAQUE session.
 *
 * The session secret (bearer token + 64-byte OPAQUE session key) lives
 * in the Keychain/Keystore. It is restored on cold start so a signed-in
 * user stays signed in across launches.
 */

import * as Keychain from 'react-native-keychain';
import type { LobbySession } from '../types/lobby';

const SESSION_SERVICE = 'sovnet_lobby_session_v1';

export async function loadLobbySession(): Promise<LobbySession | null> {
  try {
    const r = await Keychain.getGenericPassword({ service: SESSION_SERVICE });
    if (!r) return null;
    const parsed = JSON.parse(r.password) as LobbySession;
    if (!parsed.sessionToken || !parsed.sessionKeyB64) return null;
    return parsed;
  } catch (e) {
    console.warn('[LobbySessionStore] load failed:', e);
    return null;
  }
}

export async function saveLobbySession(session: LobbySession): Promise<void> {
  await Keychain.setGenericPassword('lobby_session', JSON.stringify(session), {
    service: SESSION_SERVICE,
    accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}

export async function clearLobbySession(): Promise<void> {
  try {
    await Keychain.resetGenericPassword({ service: SESSION_SERVICE });
  } catch (e) {
    console.warn('[LobbySessionStore] clear failed:', e);
  }
}
