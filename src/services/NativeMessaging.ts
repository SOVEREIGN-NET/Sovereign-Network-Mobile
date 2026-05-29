/**
 * NativeMessaging — typed wrapper around the iOS / Android RN bridge.
 *
 * Underlying native modules:
 *   - iOS    : `ios/NativeMessaging.swift` (delegates to `Messaging.swift`)
 *   - Android: `android/.../NativeMessagingModule.kt` (delegates to `Messaging.kt`)
 *
 * Both export the same surface, the same method names, and the same
 * base64 conventions for binary blobs. Sessions are referenced by an
 * opaque `sessionId` string — the underlying `MessagingSessionHandle*`
 * lives entirely in native memory.
 *
 * NB. Plaintext and Kyber/Dilithium secret keys never travel through
 * this bridge. Only the chain key (32 bytes — passed back on `serialize`
 * / `getSessionInfo`), envelope bytes (bincode), and decrypted bodies
 * cross the boundary.
 */

import { NativeModules } from 'react-native';

export const ContentTypeTag = {
  Text: 0,
  Image: 1,
  File: 2,
  Voice: 3,
  KeyExchange: 4,
  KeyRatchet: 5,
  ReadReceipt: 6,
  GroupInvite: 7,
} as const;

export type ContentTypeTagValue =
  (typeof ContentTypeTag)[keyof typeof ContentTypeTag];

export interface InitiateSessionResult {
  sessionId: string;
  /** Base64 of the Kyber1024 ciphertext — ship as a KeyExchange envelope. */
  kyberCiphertextB64: string;
}

export interface AcceptSessionResult {
  sessionId: string;
}

export interface RekeyResult {
  kyberCiphertextB64: string;
}

export interface SessionInfo {
  localDid: string;
  remoteDid: string;
  counter: number;
  epoch: number;
  /** Base64 of the 32-byte chain key. Persist this to resume a session. */
  chainKeyB64: string;
}

export interface EnvelopeMetadata {
  version: number;
  senderDid: string;
  recipientDid: string;
  timestamp: number;
  epoch: number;
  sequence: number;
  contentType: ContentTypeTagValue;
  ciphertextLen: number;
  signatureLen: number;
}

interface NativeMessagingShape {
  // Session lifecycle ----------------------------------------------------
  initiateSession(
    localDid: string,
    remoteDid: string,
    remoteKyberPkB64: string,
  ): Promise<InitiateSessionResult>;

  acceptSession(
    localDid: string,
    remoteDid: string,
    kyberCtB64: string,
    localKyberSkB64: string,
  ): Promise<AcceptSessionResult>;

  rekeySession(sessionId: string, remoteKyberPkB64: string): Promise<RekeyResult>;

  acceptRekey(
    sessionId: string,
    kyberCtB64: string,
    localKyberSkB64: string,
  ): Promise<void>;

  freeSession(sessionId: string): void;

  // Inspection & at-rest storage ----------------------------------------
  getSessionInfo(sessionId: string): Promise<SessionInfo>;
  serializeSession(sessionId: string): Promise<string>;
  deserializeSession(sessionB64: string): Promise<AcceptSessionResult>;

  // Sealing -------------------------------------------------------------
  sealText(sessionId: string, text: string): Promise<string>;
  sealBinary(
    sessionId: string,
    contentTypeTag: number,
    dataB64: string,
  ): Promise<string>;
  sealKeyExchange(
    senderDid: string,
    recipientDid: string,
    kyberCtB64: string,
  ): Promise<string>;

  // Open / sign / verify ------------------------------------------------
  envelopeOpen(envelopeB64: string, chainKeyB64: string): Promise<string>;
  envelopeOpenText(envelopeB64: string, chainKeyB64: string): Promise<string>;
  envelopeSign(envelopeB64: string, dilithiumSkB64: string): Promise<string>;
  envelopeVerify(envelopeB64: string, dilithiumPkB64: string): Promise<boolean>;

  // Wire format / inspection --------------------------------------------
  envelopeToHex(envelopeB64: string): Promise<string>;
  envelopeFromHex(hex: string): Promise<string>;
  envelopeDescribe(envelopeB64: string): Promise<EnvelopeMetadata>;

  // Identity-aware variants ---------------------------------------------
  // These take a `senderDid` / `localDid` string. The native bridge
  // resolves it to the cached IdentityHandle and uses the secret keys
  // internally — they never cross to JS. Outputs from the seal-signed
  // variants are wire-ready hex strings, ready to POST to /msg/send.
  sealTextSigned(
    sessionId: string,
    text: string,
    senderDid: string,
  ): Promise<string>;
  sealBinarySigned(
    sessionId: string,
    contentTypeTag: number,
    dataB64: string,
    senderDid: string,
  ): Promise<string>;
  sealKeyExchangeSigned(
    senderDid: string,
    recipientDid: string,
    kyberCtB64: string,
  ): Promise<string>;
  acceptSessionWithIdentity(
    localDid: string,
    remoteDid: string,
    kyberCtB64: string,
  ): Promise<AcceptSessionResult>;
  acceptRekeyWithIdentity(
    sessionId: string,
    kyberCtB64: string,
    localDid: string,
  ): Promise<void>;
  envelopeOpenVerified(
    envelopeB64: string,
    chainKeyB64: string,
    peerDilithiumPkB64: string,
  ): Promise<string>; // body bytes, base64
  envelopeOpenVerifiedText(
    envelopeB64: string,
    chainKeyB64: string,
    peerDilithiumPkB64: string,
  ): Promise<string>; // UTF-8 text

  // Stateful receive-side decrypt. Verifies the sender's signature and
  // opens the body against the session's receive ratchet, advancing it
  // in place — the next call decrypts the following sequence. The
  // receive-side counterpart of `sealTextSigned`.
  envelopeOpenVerifiedWithSession(
    sessionId: string,
    envelopeB64: string,
    peerDilithiumPkB64: string,
  ): Promise<string>; // UTF-8 text

  // Envelope-shaped accept (receive path) — JS hands the whole bincode
  // KeyExchange / KeyRatchet envelope; Rust extracts the Kyber
  // ciphertext + checks content_type + DID routing internally.
  acceptEnvelopeWithIdentity(
    localDid: string,
    remoteDid: string,
    envelopeB64: string,
  ): Promise<AcceptSessionResult>;
  acceptRekeyEnvelopeWithIdentity(
    sessionId: string,
    envelopeB64: string,
    localDid: string,
  ): Promise<void>;
}

const Native = NativeModules.NativeMessaging as NativeMessagingShape | undefined;

/**
 * `true` when the bridge is wired on the current platform. Use to gate
 * the messaging UI off of the legacy stub on devices/simulators where
 * the native libs aren't loaded yet.
 */
export const isNativeMessagingAvailable: boolean =
  !!Native && typeof Native.initiateSession === 'function';

function ensure(): NativeMessagingShape {
  if (!Native) {
    throw new Error(
      'NativeMessaging bridge is not registered on this platform — ' +
        'rebuild the app after adding the messaging FFI.',
    );
  }
  return Native;
}

export const NativeMessaging = {
  get available(): boolean {
    return isNativeMessagingAvailable;
  },

  initiateSession: (localDid: string, remoteDid: string, remoteKyberPkB64: string) =>
    ensure().initiateSession(localDid, remoteDid, remoteKyberPkB64),
  acceptSession: (
    localDid: string,
    remoteDid: string,
    kyberCtB64: string,
    localKyberSkB64: string,
  ) => ensure().acceptSession(localDid, remoteDid, kyberCtB64, localKyberSkB64),
  rekeySession: (sessionId: string, remoteKyberPkB64: string) =>
    ensure().rekeySession(sessionId, remoteKyberPkB64),
  acceptRekey: (sessionId: string, kyberCtB64: string, localKyberSkB64: string) =>
    ensure().acceptRekey(sessionId, kyberCtB64, localKyberSkB64),
  freeSession: (sessionId: string) => ensure().freeSession(sessionId),

  getSessionInfo: (sessionId: string) => ensure().getSessionInfo(sessionId),
  serializeSession: (sessionId: string) => ensure().serializeSession(sessionId),
  deserializeSession: (sessionB64: string) =>
    ensure().deserializeSession(sessionB64),

  sealText: (sessionId: string, text: string) =>
    ensure().sealText(sessionId, text),
  sealBinary: (sessionId: string, contentTypeTag: ContentTypeTagValue, dataB64: string) =>
    ensure().sealBinary(sessionId, contentTypeTag, dataB64),
  sealKeyExchange: (senderDid: string, recipientDid: string, kyberCtB64: string) =>
    ensure().sealKeyExchange(senderDid, recipientDid, kyberCtB64),

  envelopeOpen: (envelopeB64: string, chainKeyB64: string) =>
    ensure().envelopeOpen(envelopeB64, chainKeyB64),
  envelopeOpenText: (envelopeB64: string, chainKeyB64: string) =>
    ensure().envelopeOpenText(envelopeB64, chainKeyB64),
  envelopeSign: (envelopeB64: string, dilithiumSkB64: string) =>
    ensure().envelopeSign(envelopeB64, dilithiumSkB64),
  envelopeVerify: (envelopeB64: string, dilithiumPkB64: string) =>
    ensure().envelopeVerify(envelopeB64, dilithiumPkB64),

  envelopeToHex: (envelopeB64: string) => ensure().envelopeToHex(envelopeB64),
  envelopeFromHex: (hex: string) => ensure().envelopeFromHex(hex),
  envelopeDescribe: (envelopeB64: string) =>
    ensure().envelopeDescribe(envelopeB64),

  sealTextSigned: (sessionId: string, text: string, senderDid: string) =>
    ensure().sealTextSigned(sessionId, text, senderDid),
  sealBinarySigned: (
    sessionId: string,
    contentTypeTag: ContentTypeTagValue,
    dataB64: string,
    senderDid: string,
  ) => ensure().sealBinarySigned(sessionId, contentTypeTag, dataB64, senderDid),
  sealKeyExchangeSigned: (
    senderDid: string,
    recipientDid: string,
    kyberCtB64: string,
  ) => ensure().sealKeyExchangeSigned(senderDid, recipientDid, kyberCtB64),
  acceptSessionWithIdentity: (
    localDid: string,
    remoteDid: string,
    kyberCtB64: string,
  ) => ensure().acceptSessionWithIdentity(localDid, remoteDid, kyberCtB64),
  acceptRekeyWithIdentity: (
    sessionId: string,
    kyberCtB64: string,
    localDid: string,
  ) => ensure().acceptRekeyWithIdentity(sessionId, kyberCtB64, localDid),
  envelopeOpenVerified: (
    envelopeB64: string,
    chainKeyB64: string,
    peerDilithiumPkB64: string,
  ) =>
    ensure().envelopeOpenVerified(envelopeB64, chainKeyB64, peerDilithiumPkB64),
  envelopeOpenVerifiedText: (
    envelopeB64: string,
    chainKeyB64: string,
    peerDilithiumPkB64: string,
  ) =>
    ensure().envelopeOpenVerifiedText(
      envelopeB64,
      chainKeyB64,
      peerDilithiumPkB64,
    ),
  envelopeOpenVerifiedWithSession: (
    sessionId: string,
    envelopeB64: string,
    peerDilithiumPkB64: string,
  ) =>
    ensure().envelopeOpenVerifiedWithSession(
      sessionId,
      envelopeB64,
      peerDilithiumPkB64,
    ),

  acceptEnvelopeWithIdentity: (
    localDid: string,
    remoteDid: string,
    envelopeB64: string,
  ) => ensure().acceptEnvelopeWithIdentity(localDid, remoteDid, envelopeB64),
  acceptRekeyEnvelopeWithIdentity: (
    sessionId: string,
    envelopeB64: string,
    localDid: string,
  ) =>
    ensure().acceptRekeyEnvelopeWithIdentity(sessionId, envelopeB64, localDid),
};

export default NativeMessaging;
