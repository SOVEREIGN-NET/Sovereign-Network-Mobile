/**
 * NativeLobbyAuth — typed wrapper around the RN bridge for the
 * lib-client OPAQUE FFI (`zhtp_opaque_*` / `zhtp_lobby_mac_compute`).
 *
 * Underlying native modules:
 *   - iOS    : `ios/NativeLobbyAuth.swift` (wraps `LobbyAuth.swift`)
 *   - Android: `android/.../NativeLobbyAuthModule.kt` (wraps `LobbyAuth.kt`)
 *
 * OPAQUE is a two-leg protocol: `*Start` produces the first message and
 * a state handle; `*Finish` consumes the handle with the server's reply.
 * The state handle lives natively (it holds OPRF blinding material) and
 * crosses the bridge only as an opaque `stateId` string.
 *
 * All binary values cross the bridge as standard padded base64.
 */

import { NativeModules } from 'react-native';

export interface OpaqueStartResult {
  /** Opaque handle to in-flight OPAQUE state; feed into the matching finish. */
  stateId: string;
  /** First protocol message (base64) to POST to the server's `/start`. */
  requestB64: string;
}

export interface OpaqueRegisterFinishResult {
  /** RegistrationUpload bytes (base64) to POST to `/register/finish`. */
  recordB64: string;
  /** 64-byte deterministic per-user export key (base64). */
  exportKeyB64: string;
}

export interface OpaqueLoginFinishResult {
  /** Third (final) login message (base64) to POST to `/login/finish`. */
  msg3B64: string;
  /** 64-byte OPAQUE session key (base64) — the `X-OPAQUE-Mac` HMAC key. */
  sessionKeyB64: string;
  /** 64-byte export key (base64) — identical to register's. */
  exportKeyB64: string;
}

interface NativeLobbyAuthShape {
  opaqueRegisterStart(password: string): Promise<OpaqueStartResult>;
  opaqueRegisterFinish(
    stateId: string,
    password: string,
    serverMsgB64: string,
  ): Promise<OpaqueRegisterFinishResult>;
  opaqueRegisterCancel(stateId: string): Promise<void>;

  opaqueLoginStart(password: string): Promise<OpaqueStartResult>;
  opaqueLoginFinish(
    stateId: string,
    password: string,
    serverMsgB64: string,
  ): Promise<OpaqueLoginFinishResult>;
  opaqueLoginCancel(stateId: string): Promise<void>;
}

const Native = NativeModules.NativeLobbyAuth as
  | NativeLobbyAuthShape
  | undefined;

/**
 * `true` when the bridge is wired on the current platform. The lobby UI
 * gates off this — when missing (app not yet rebuilt against the OPAQUE
 * FFI) the sign-up / sign-in screens surface a clear "update required".
 */
export const isNativeLobbyAuthAvailable: boolean =
  !!Native && typeof Native.opaqueLoginStart === 'function';

console.log(
  '[NativeLobbyAuth] bridge available =',
  isNativeLobbyAuthAvailable,
);

function ensure(): NativeLobbyAuthShape {
  if (!Native) {
    throw new Error(
      'NativeLobbyAuth bridge not registered — rebuild the app after ' +
        'adding the OPAQUE FFI.',
    );
  }
  return Native;
}

export const NativeLobbyAuth = {
  get available(): boolean {
    return isNativeLobbyAuthAvailable;
  },

  opaqueRegisterStart: (password: string): Promise<OpaqueStartResult> =>
    ensure().opaqueRegisterStart(password),

  opaqueRegisterFinish: (
    stateId: string,
    password: string,
    serverMsgB64: string,
  ): Promise<OpaqueRegisterFinishResult> =>
    ensure().opaqueRegisterFinish(stateId, password, serverMsgB64),

  opaqueRegisterCancel: (stateId: string): Promise<void> =>
    ensure().opaqueRegisterCancel(stateId),

  opaqueLoginStart: (password: string): Promise<OpaqueStartResult> =>
    ensure().opaqueLoginStart(password),

  opaqueLoginFinish: (
    stateId: string,
    password: string,
    serverMsgB64: string,
  ): Promise<OpaqueLoginFinishResult> =>
    ensure().opaqueLoginFinish(stateId, password, serverMsgB64),

  opaqueLoginCancel: (stateId: string): Promise<void> =>
    ensure().opaqueLoginCancel(stateId),
};

export default NativeLobbyAuth;
