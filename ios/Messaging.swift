// Messaging.swift — Swift bindings for the post-quantum messaging FFI.
//
// Mirrors the C surface defined at the bottom of lib-client/src/lib.rs
// (zhtp_msg_*). Sessions are opaque pointers; envelopes flow as bincode
// bytes wrapped in `Data`. The high-level wrappers (`MessagingSession`,
// `MessagingEnvelope`) give Swift call-sites an idiomatic API and own
// the FFI lifetime via `deinit`.
//
// Keys never cross JS — the React Native bridge only sees:
//   - opaque session IDs (mapped to handles inside `NativeMessaging.swift`)
//   - base64-encoded ciphertext + envelope bytes
//   - already-encoded hex strings for the `/msg/send` body
// so plaintext + secret keys live in this file (or below it in Rust) and
// nowhere else.

import Foundation

// MARK: - C FFI Declarations: Session lifecycle

/// Initiate a new session. Writes the Kyber ciphertext into `kyberCtOut`
/// and returns the session handle, or null on error.
@_silgen_name("zhtp_msg_session_initiate")
private func cMsgSessionInitiate(
    _ localDid: UnsafePointer<CChar>,
    _ remoteDid: UnsafePointer<CChar>,
    _ remoteKyberPk: UnsafePointer<UInt8>,
    _ remoteKyberPkLen: Int,
    _ kyberCtOut: UnsafeMutablePointer<ByteBuffer>
) -> UnsafeMutableRawPointer?

@_silgen_name("zhtp_msg_session_accept")
private func cMsgSessionAccept(
    _ localDid: UnsafePointer<CChar>,
    _ remoteDid: UnsafePointer<CChar>,
    _ kyberCt: UnsafePointer<UInt8>,
    _ kyberCtLen: Int,
    _ localKyberSk: UnsafePointer<UInt8>,
    _ localKyberSkLen: Int
) -> UnsafeMutableRawPointer?

@_silgen_name("zhtp_msg_session_rekey")
private func cMsgSessionRekey(
    _ handle: UnsafeMutableRawPointer,
    _ remoteKyberPk: UnsafePointer<UInt8>,
    _ remoteKyberPkLen: Int,
    _ kyberCtOut: UnsafeMutablePointer<ByteBuffer>
) -> Int32

@_silgen_name("zhtp_msg_session_accept_rekey")
private func cMsgSessionAcceptRekey(
    _ handle: UnsafeMutableRawPointer,
    _ kyberCt: UnsafePointer<UInt8>,
    _ kyberCtLen: Int,
    _ localKyberSk: UnsafePointer<UInt8>,
    _ localKyberSkLen: Int
) -> Int32

@_silgen_name("zhtp_msg_session_free")
private func cMsgSessionFree(_ handle: UnsafeMutableRawPointer)

// MARK: - C FFI Declarations: Session field access

@_silgen_name("zhtp_msg_session_chain_key")
private func cMsgSessionChainKey(_ handle: UnsafeRawPointer) -> ByteBuffer

@_silgen_name("zhtp_msg_session_counter")
private func cMsgSessionCounter(_ handle: UnsafeRawPointer) -> UInt64

@_silgen_name("zhtp_msg_session_epoch")
private func cMsgSessionEpoch(_ handle: UnsafeRawPointer) -> UInt32

@_silgen_name("zhtp_msg_session_local_did")
private func cMsgSessionLocalDid(_ handle: UnsafeRawPointer) -> UnsafeMutablePointer<CChar>?

@_silgen_name("zhtp_msg_session_remote_did")
private func cMsgSessionRemoteDid(_ handle: UnsafeRawPointer) -> UnsafeMutablePointer<CChar>?

@_silgen_name("zhtp_msg_session_serialize")
private func cMsgSessionSerialize(_ handle: UnsafeRawPointer) -> ByteBuffer

@_silgen_name("zhtp_msg_session_deserialize")
private func cMsgSessionDeserialize(
    _ bytes: UnsafePointer<UInt8>,
    _ len: Int
) -> UnsafeMutableRawPointer?

// MARK: - C FFI Declarations: Sealing

@_silgen_name("zhtp_msg_seal_text")
private func cMsgSealText(
    _ handle: UnsafeMutableRawPointer,
    _ text: UnsafePointer<CChar>
) -> ByteBuffer

@_silgen_name("zhtp_msg_seal_binary")
private func cMsgSealBinary(
    _ handle: UnsafeMutableRawPointer,
    _ contentType: UInt8,
    _ data: UnsafePointer<UInt8>,
    _ dataLen: Int
) -> ByteBuffer

@_silgen_name("zhtp_msg_seal_key_exchange")
private func cMsgSealKeyExchange(
    _ senderDid: UnsafePointer<CChar>,
    _ recipientDid: UnsafePointer<CChar>,
    _ kyberCt: UnsafePointer<UInt8>,
    _ kyberCtLen: Int
) -> ByteBuffer

// MARK: - C FFI Declarations: Open / Sign / Verify

@_silgen_name("zhtp_msg_envelope_open")
private func cMsgEnvelopeOpen(
    _ envelopeBytes: UnsafePointer<UInt8>,
    _ envelopeLen: Int,
    _ chainKey: UnsafePointer<UInt8>,
    _ chainKeyLen: Int
) -> ByteBuffer

@_silgen_name("zhtp_msg_envelope_sign")
private func cMsgEnvelopeSign(
    _ envelopeBytes: UnsafePointer<UInt8>,
    _ envelopeLen: Int,
    _ dilithiumSk: UnsafePointer<UInt8>,
    _ dilithiumSkLen: Int
) -> ByteBuffer

@_silgen_name("zhtp_msg_envelope_verify")
private func cMsgEnvelopeVerify(
    _ envelopeBytes: UnsafePointer<UInt8>,
    _ envelopeLen: Int,
    _ dilithiumPk: UnsafePointer<UInt8>,
    _ dilithiumPkLen: Int
) -> Int32

// MARK: - C FFI Declarations: Wire format / inspection

@_silgen_name("zhtp_msg_envelope_to_hex")
private func cMsgEnvelopeToHex(
    _ envelopeBytes: UnsafePointer<UInt8>,
    _ envelopeLen: Int
) -> UnsafeMutablePointer<CChar>?

@_silgen_name("zhtp_msg_envelope_from_hex")
private func cMsgEnvelopeFromHex(_ hex: UnsafePointer<CChar>) -> ByteBuffer

@_silgen_name("zhtp_msg_envelope_to_json")
private func cMsgEnvelopeToJson(
    _ envelopeBytes: UnsafePointer<UInt8>,
    _ envelopeLen: Int
) -> UnsafeMutablePointer<CChar>?

// MARK: - C FFI Declarations: Identity-aware variants
// These keep the Dilithium / Kyber secret keys inside Rust by taking
// an `IdentityHandle*` instead of raw key buffers. Outputs are hex
// strings ready for the `/msg/send` body — saves the JS side from
// chaining seal → sign → toHex across three FFI calls.

@_silgen_name("zhtp_msg_seal_text_signed")
private func cMsgSealTextSigned(
    _ session: UnsafeMutableRawPointer,
    _ text: UnsafePointer<CChar>,
    _ identity: UnsafeRawPointer
) -> UnsafeMutablePointer<CChar>?

@_silgen_name("zhtp_msg_seal_binary_signed")
private func cMsgSealBinarySigned(
    _ session: UnsafeMutableRawPointer,
    _ contentType: UInt8,
    _ data: UnsafePointer<UInt8>,
    _ dataLen: Int,
    _ identity: UnsafeRawPointer
) -> UnsafeMutablePointer<CChar>?

@_silgen_name("zhtp_msg_seal_key_exchange_signed")
private func cMsgSealKeyExchangeSigned(
    _ senderDid: UnsafePointer<CChar>,
    _ recipientDid: UnsafePointer<CChar>,
    _ kyberCt: UnsafePointer<UInt8>,
    _ kyberCtLen: Int,
    _ identity: UnsafeRawPointer
) -> UnsafeMutablePointer<CChar>?

@_silgen_name("zhtp_msg_session_accept_with_identity")
private func cMsgSessionAcceptWithIdentity(
    _ localDid: UnsafePointer<CChar>,
    _ remoteDid: UnsafePointer<CChar>,
    _ kyberCt: UnsafePointer<UInt8>,
    _ kyberCtLen: Int,
    _ identity: UnsafeRawPointer
) -> UnsafeMutableRawPointer?

@_silgen_name("zhtp_msg_session_accept_rekey_with_identity")
private func cMsgSessionAcceptRekeyWithIdentity(
    _ session: UnsafeMutableRawPointer,
    _ kyberCt: UnsafePointer<UInt8>,
    _ kyberCtLen: Int,
    _ identity: UnsafeRawPointer
) -> Int32

@_silgen_name("zhtp_msg_envelope_open_verified")
private func cMsgEnvelopeOpenVerified(
    _ envelopeBytes: UnsafePointer<UInt8>,
    _ envelopeLen: Int,
    _ chainKey: UnsafePointer<UInt8>,
    _ chainKeyLen: Int,
    _ peerDilithiumPk: UnsafePointer<UInt8>,
    _ peerDilithiumPkLen: Int
) -> ByteBuffer

// Stateful + verified open. Decrypts against the session's receive
// ratchet and advances it in place — the next call opens the next
// sequence. Handles in-order, skip-forward and out-of-order delivery
// internally; on any failure the session is left untouched.
@_silgen_name("zhtp_msg_envelope_open_verified_with_session")
private func cMsgEnvelopeOpenVerifiedWithSession(
    _ handle: UnsafeMutableRawPointer,
    _ envelopeBytes: UnsafePointer<UInt8>,
    _ envelopeLen: Int,
    _ peerDilithiumPk: UnsafePointer<UInt8>,
    _ peerDilithiumPkLen: Int
) -> ByteBuffer

// Envelope-shaped session accept variants — Rust extracts the Kyber
// ciphertext from the bincode envelope itself, mirroring the send-side
// `seal_key_exchange_signed` API.

@_silgen_name("zhtp_msg_session_accept_envelope_with_identity")
private func cMsgSessionAcceptEnvelopeWithIdentity(
    _ localDid: UnsafePointer<CChar>,
    _ remoteDid: UnsafePointer<CChar>,
    _ envelopeBytes: UnsafePointer<UInt8>,
    _ envelopeLen: Int,
    _ identity: UnsafeRawPointer
) -> UnsafeMutableRawPointer?

@_silgen_name("zhtp_msg_session_accept_rekey_envelope_with_identity")
private func cMsgSessionAcceptRekeyEnvelopeWithIdentity(
    _ session: UnsafeMutableRawPointer,
    _ envelopeBytes: UnsafePointer<UInt8>,
    _ envelopeLen: Int,
    _ identity: UnsafeRawPointer
) -> Int32

// MARK: - Aliases for the existing memory free helpers

// `cBufferFree` and `cStringFree` are declared `private` in ZhtpClient.swift,
// so we re-declare the matching FFI aliases here. Calling either symbol
// frees the same Vec<u8> / CString — they're aliases on the Rust side.
@_silgen_name("zhtp_client_free_bytes")
private func cMsgBufferFree(_ buf: ByteBuffer)

@_silgen_name("zhtp_client_free_string")
private func cMsgStringFree(_ ptr: UnsafeMutablePointer<CChar>)

// MARK: - Swift errors

public enum MessagingError: Error {
    case sessionInitFailed
    case sessionAcceptFailed
    case sessionRekeyFailed
    case sealFailed(String)
    case openFailed
    case signFailed
    case decodeFailed
    case ffiError(String)
}

// MARK: - Helpers

private extension Data {
    /// Run a closure with the bytes pinned to a stable pointer. Empty
    /// data is allowed — the closure receives a non-null but-zero-length
    /// view, matching the Rust side's `borrow_slice` fallback.
    func withRustBytes<R>(_ body: (UnsafePointer<UInt8>, Int) throws -> R) rethrows -> R {
        if isEmpty {
            // A single-byte sentinel keeps us from passing a null pointer;
            // the FFI rejects on length, not pointer identity.
            var sentinel: UInt8 = 0
            return try withUnsafePointer(to: &sentinel) { try body($0, 0) }
        }
        return try withUnsafeBytes { raw in
            let base = raw.baseAddress!.assumingMemoryBound(to: UInt8.self)
            return try body(base, raw.count)
        }
    }
}

private func bufferToData(_ buf: ByteBuffer) -> Data? {
    guard let data = buf.data, buf.len > 0 else { return nil }
    let copy = Data(bytes: data, count: buf.len)
    cMsgBufferFree(buf)
    return copy
}

private func cstrToString(_ ptr: UnsafeMutablePointer<CChar>?) -> String? {
    guard let ptr else { return nil }
    let s = String(cString: ptr)
    cMsgStringFree(ptr)
    return s
}

// MARK: - Public API: MessagingSession

/// A live messaging session with one peer. Wraps the opaque
/// `MessagingSessionHandle*` and frees it on `deinit`.
public final class MessagingSession {
    fileprivate let handle: UnsafeMutableRawPointer

    fileprivate init(handle: UnsafeMutableRawPointer) {
        self.handle = handle
    }

    deinit { cMsgSessionFree(handle) }

    public var localDid: String {
        cstrToString(cMsgSessionLocalDid(handle)) ?? ""
    }

    public var remoteDid: String {
        cstrToString(cMsgSessionRemoteDid(handle)) ?? ""
    }

    public var counter: UInt64 { cMsgSessionCounter(handle) }
    public var epoch: UInt32 { cMsgSessionEpoch(handle) }

    /// 32-byte ratchet root. Sensitive — never log, never ship to the
    /// server. The receive-path needs it as input to `MessagingEnvelope.open`.
    public var chainKey: Data {
        bufferToData(cMsgSessionChainKey(handle)) ?? Data()
    }

    // ── Construction ──────────────────────────────────────────────

    /// Encapsulate against the recipient's Kyber public key, returning
    /// the resulting Kyber ciphertext (to be sent in a KeyExchange
    /// envelope) and the new session.
    public static func initiate(
        localDid: String,
        remoteDid: String,
        remoteKyberPk: Data
    ) throws -> (kyberCiphertext: Data, session: MessagingSession) {
        var ctOut = ByteBuffer(data: nil, len: 0)
        let handle: UnsafeMutableRawPointer? = localDid.withCString { localPtr in
            remoteDid.withCString { remotePtr in
                remoteKyberPk.withRustBytes { keyPtr, keyLen in
                    cMsgSessionInitiate(localPtr, remotePtr, keyPtr, keyLen, &ctOut)
                }
            }
        }
        guard let handle else { throw MessagingError.sessionInitFailed }
        guard let ct = bufferToData(ctOut) else {
            cMsgSessionFree(handle)
            throw MessagingError.sessionInitFailed
        }
        return (ct, MessagingSession(handle: handle))
    }

    /// Decapsulate a peer's Kyber ciphertext to produce the matching
    /// session. The Kyber secret key never leaves Rust after this returns.
    public static func accept(
        localDid: String,
        remoteDid: String,
        kyberCiphertext: Data,
        localKyberSk: Data
    ) throws -> MessagingSession {
        let handle: UnsafeMutableRawPointer? = localDid.withCString { localPtr in
            remoteDid.withCString { remotePtr in
                kyberCiphertext.withRustBytes { ctPtr, ctLen in
                    localKyberSk.withRustBytes { skPtr, skLen in
                        cMsgSessionAccept(localPtr, remotePtr, ctPtr, ctLen, skPtr, skLen)
                    }
                }
            }
        }
        guard let handle else { throw MessagingError.sessionAcceptFailed }
        return MessagingSession(handle: handle)
    }

    /// Identity-aware accept — pulls the Kyber secret from the
    /// IdentityHandle so it never crosses to Swift.
    public static func acceptWithIdentity(
        localDid: String,
        remoteDid: String,
        kyberCiphertext: Data,
        identity: UnsafeRawPointer
    ) throws -> MessagingSession {
        let handle: UnsafeMutableRawPointer? = localDid.withCString { localPtr in
            remoteDid.withCString { remotePtr in
                kyberCiphertext.withRustBytes { ctPtr, ctLen in
                    cMsgSessionAcceptWithIdentity(localPtr, remotePtr, ctPtr, ctLen, identity)
                }
            }
        }
        guard let handle else { throw MessagingError.sessionAcceptFailed }
        return MessagingSession(handle: handle)
    }

    /// Envelope-shaped accept — feed the full bincode KeyExchange
    /// envelope and let Rust extract the Kyber ciphertext + DID
    /// fields. Use on the receive path when a peer initiates contact.
    public static func acceptEnvelopeWithIdentity(
        localDid: String,
        remoteDid: String,
        envelope: Data,
        identity: UnsafeRawPointer
    ) throws -> MessagingSession {
        let handle: UnsafeMutableRawPointer? = localDid.withCString { localPtr in
            remoteDid.withCString { remotePtr in
                envelope.withRustBytes { envPtr, envLen in
                    cMsgSessionAcceptEnvelopeWithIdentity(
                        localPtr, remotePtr, envPtr, envLen, identity)
                }
            }
        }
        guard let handle else { throw MessagingError.sessionAcceptFailed }
        return MessagingSession(handle: handle)
    }

    // ── Re-key ────────────────────────────────────────────────────

    /// Re-key for post-compromise security. Returns the new Kyber
    /// ciphertext to deliver to the peer as a KeyRatchet envelope.
    public func rekey(remoteKyberPk: Data) throws -> Data {
        var ctOut = ByteBuffer(data: nil, len: 0)
        let rc: Int32 = remoteKyberPk.withRustBytes { keyPtr, keyLen in
            cMsgSessionRekey(handle, keyPtr, keyLen, &ctOut)
        }
        guard rc == 0, let ct = bufferToData(ctOut) else {
            throw MessagingError.sessionRekeyFailed
        }
        return ct
    }

    public func acceptRekey(kyberCiphertext: Data, localKyberSk: Data) throws {
        let rc: Int32 = kyberCiphertext.withRustBytes { ctPtr, ctLen in
            localKyberSk.withRustBytes { skPtr, skLen in
                cMsgSessionAcceptRekey(handle, ctPtr, ctLen, skPtr, skLen)
            }
        }
        guard rc == 0 else { throw MessagingError.sessionRekeyFailed }
    }

    /// Identity-aware accept-rekey — Kyber secret stays in Rust.
    public func acceptRekeyWithIdentity(
        kyberCiphertext: Data,
        identity: UnsafeRawPointer
    ) throws {
        let rc: Int32 = kyberCiphertext.withRustBytes { ctPtr, ctLen in
            cMsgSessionAcceptRekeyWithIdentity(handle, ctPtr, ctLen, identity)
        }
        guard rc == 0 else { throw MessagingError.sessionRekeyFailed }
    }

    /// Envelope-shaped accept-rekey — feed the full bincode
    /// KeyRatchet envelope; Rust extracts the ciphertext.
    public func acceptRekeyEnvelopeWithIdentity(
        envelope: Data,
        identity: UnsafeRawPointer
    ) throws {
        let rc: Int32 = envelope.withRustBytes { envPtr, envLen in
            cMsgSessionAcceptRekeyEnvelopeWithIdentity(handle, envPtr, envLen, identity)
        }
        guard rc == 0 else { throw MessagingError.sessionRekeyFailed }
    }

    // ── At-rest storage ───────────────────────────────────────────

    /// Bincode-encoded snapshot for the encrypted-at-rest store. Pass
    /// the resulting bytes back through `deserialize` on next launch.
    public func serialize() throws -> Data {
        guard let bytes = bufferToData(cMsgSessionSerialize(handle)) else {
            throw MessagingError.ffiError("session serialize")
        }
        return bytes
    }

    public static func deserialize(_ bytes: Data) throws -> MessagingSession {
        let handle: UnsafeMutableRawPointer? = bytes.withRustBytes { ptr, len in
            cMsgSessionDeserialize(ptr, len)
        }
        guard let handle else { throw MessagingError.ffiError("session deserialize") }
        return MessagingSession(handle: handle)
    }

    // ── Sealing ───────────────────────────────────────────────────

    /// Encrypt + seal a UTF-8 text message. Advances the ratchet.
    /// Returns bincode envelope bytes — pass to `MessagingEnvelope.sign`.
    public func sealText(_ text: String) throws -> Data {
        let buf: ByteBuffer = text.withCString { textPtr in
            cMsgSealText(handle, textPtr)
        }
        guard let bytes = bufferToData(buf) else {
            throw MessagingError.sealFailed("text")
        }
        return bytes
    }

    public func sealBinary(contentType: UInt8, data: Data) throws -> Data {
        let buf: ByteBuffer = data.withRustBytes { ptr, len in
            cMsgSealBinary(handle, contentType, ptr, len)
        }
        guard let bytes = bufferToData(buf) else {
            throw MessagingError.sealFailed("binary")
        }
        return bytes
    }

    // ── Identity-aware sealing (keys stay in Rust) ────────────────

    /// Seal + sign + hex-encode in one call. The Dilithium secret
    /// key never leaves the IdentityHandle — only the wire-ready hex
    /// string crosses back to Swift.
    public func sealTextSigned(_ text: String, identity: UnsafeRawPointer) throws -> String {
        let ptr = text.withCString { textPtr in
            cMsgSealTextSigned(handle, textPtr, identity)
        }
        guard let s = cstrToString(ptr) else {
            throw MessagingError.sealFailed("text_signed")
        }
        return s
    }

    public func sealBinarySigned(
        contentType: UInt8,
        data: Data,
        identity: UnsafeRawPointer
    ) throws -> String {
        let ptr = data.withRustBytes { dataPtr, dataLen in
            cMsgSealBinarySigned(handle, contentType, dataPtr, dataLen, identity)
        }
        guard let s = cstrToString(ptr) else {
            throw MessagingError.sealFailed("binary_signed")
        }
        return s
    }

    /// Verify the sender's Dilithium signature + DID binding, then
    /// decrypt the body — advancing THIS session's receive ratchet in
    /// place, so the next call decrypts the following sequence. This is
    /// the receive-side counterpart of `sealTextSigned`. Throws on bad
    /// signature / decrypt failure; the session is left untouched so
    /// the caller may retry.
    public func openVerifiedWithSession(
        envelope: Data,
        peerDilithiumPk: Data
    ) throws -> Data {
        let buf: ByteBuffer = envelope.withRustBytes { envPtr, envLen in
            peerDilithiumPk.withRustBytes { pkPtr, pkLen in
                cMsgEnvelopeOpenVerifiedWithSession(
                    handle, envPtr, envLen, pkPtr, pkLen
                )
            }
        }
        guard let body = bufferToData(buf) else {
            throw MessagingError.openFailed
        }
        return body
    }
}

// MARK: - Public API: MessagingEnvelope

/// Stateless envelope helpers. These don't touch a session — they take
/// raw bincode bytes and a key, and live on the host side of the FFI
/// because the receive path runs without a mutable session reference.
public enum MessagingEnvelope {
    public static func sealKeyExchange(
        senderDid: String,
        recipientDid: String,
        kyberCiphertext: Data
    ) throws -> Data {
        let buf: ByteBuffer = senderDid.withCString { senderPtr in
            recipientDid.withCString { recipientPtr in
                kyberCiphertext.withRustBytes { ctPtr, ctLen in
                    cMsgSealKeyExchange(senderPtr, recipientPtr, ctPtr, ctLen)
                }
            }
        }
        guard let bytes = bufferToData(buf) else {
            throw MessagingError.sealFailed("key_exchange")
        }
        return bytes
    }

    /// Identity-aware variant — seals + signs + hex-encodes in one
    /// call so the Dilithium secret stays in Rust.
    public static func sealKeyExchangeSigned(
        senderDid: String,
        recipientDid: String,
        kyberCiphertext: Data,
        identity: UnsafeRawPointer
    ) throws -> String {
        let ptr = senderDid.withCString { senderPtr in
            recipientDid.withCString { recipientPtr in
                kyberCiphertext.withRustBytes { ctPtr, ctLen in
                    cMsgSealKeyExchangeSigned(senderPtr, recipientPtr, ctPtr, ctLen, identity)
                }
            }
        }
        guard let s = cstrToString(ptr) else {
            throw MessagingError.sealFailed("key_exchange_signed")
        }
        return s
    }

    /// Verify the Dilithium signature, then decrypt the body. Returns
    /// the plaintext on success; throws on bad signature or decrypt
    /// failure (caller treats both identically — drop the envelope).
    public static func openVerified(
        envelope: Data,
        chainKey: Data,
        peerDilithiumPk: Data
    ) throws -> Data {
        guard chainKey.count == 32 else {
            throw MessagingError.ffiError("chain key must be 32 bytes")
        }
        let buf: ByteBuffer = envelope.withRustBytes { envPtr, envLen in
            chainKey.withRustBytes { keyPtr, _ in
                peerDilithiumPk.withRustBytes { pkPtr, pkLen in
                    cMsgEnvelopeOpenVerified(envPtr, envLen, keyPtr, 32, pkPtr, pkLen)
                }
            }
        }
        guard let body = bufferToData(buf) else {
            throw MessagingError.openFailed
        }
        return body
    }

    public static func open(envelope: Data, chainKey: Data) throws -> Data {
        guard chainKey.count == 32 else {
            throw MessagingError.ffiError("chain key must be 32 bytes")
        }
        let buf: ByteBuffer = envelope.withRustBytes { envPtr, envLen in
            chainKey.withRustBytes { keyPtr, _ in
                cMsgEnvelopeOpen(envPtr, envLen, keyPtr, 32)
            }
        }
        guard let plaintext = bufferToData(buf) else {
            throw MessagingError.openFailed
        }
        return plaintext
    }

    /// Open a Text envelope and decode UTF-8.
    public static func openText(envelope: Data, chainKey: Data) throws -> String {
        let body = try open(envelope: envelope, chainKey: chainKey)
        guard let s = String(data: body, encoding: .utf8) else {
            throw MessagingError.decodeFailed
        }
        return s
    }

    public static func sign(envelope: Data, dilithiumSk: Data) throws -> Data {
        let buf: ByteBuffer = envelope.withRustBytes { envPtr, envLen in
            dilithiumSk.withRustBytes { skPtr, skLen in
                cMsgEnvelopeSign(envPtr, envLen, skPtr, skLen)
            }
        }
        guard let bytes = bufferToData(buf) else {
            throw MessagingError.signFailed
        }
        return bytes
    }

    /// Returns true if the signature checks against the supplied
    /// Dilithium public key. Crypto / parse errors collapse to `false`
    /// — callers should reject the envelope identically in either case.
    public static func verify(envelope: Data, dilithiumPk: Data) -> Bool {
        let rc: Int32 = envelope.withRustBytes { envPtr, envLen in
            dilithiumPk.withRustBytes { pkPtr, pkLen in
                cMsgEnvelopeVerify(envPtr, envLen, pkPtr, pkLen)
            }
        }
        return rc == 1
    }

    public static func toHex(envelope: Data) throws -> String {
        let ptr = envelope.withRustBytes { envPtr, envLen in
            cMsgEnvelopeToHex(envPtr, envLen)
        }
        guard let s = cstrToString(ptr) else {
            throw MessagingError.ffiError("to_hex")
        }
        return s
    }

    public static func fromHex(_ hex: String) throws -> Data {
        let buf: ByteBuffer = hex.withCString { p in cMsgEnvelopeFromHex(p) }
        guard let bytes = bufferToData(buf) else {
            throw MessagingError.decodeFailed
        }
        return bytes
    }

    /// JSON inspection view (sender, recipient, content_type tag, etc.).
    /// The body / signature are reported as lengths only — callers that
    /// need raw bytes should use `open` and the Dilithium signature
    /// stays tucked inside the envelope's bincode bytes.
    public static func describe(envelope: Data) throws -> EnvelopeMetadata {
        let ptr = envelope.withRustBytes { envPtr, envLen in
            cMsgEnvelopeToJson(envPtr, envLen)
        }
        guard let json = cstrToString(ptr),
              let data = json.data(using: .utf8),
              let parsed = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { throw MessagingError.decodeFailed }

        return EnvelopeMetadata(
            version: parsed["version"] as? UInt8 ?? 0,
            senderDid: parsed["sender_did"] as? String ?? "",
            recipientDid: parsed["recipient_did"] as? String ?? "",
            timestamp: parsed["timestamp"] as? UInt64 ?? 0,
            epoch: parsed["epoch"] as? UInt32 ?? 0,
            sequence: parsed["sequence"] as? UInt64 ?? 0,
            contentType: parsed["content_type"] as? UInt8 ?? 0,
            ciphertextLen: parsed["ciphertext_len"] as? Int ?? 0,
            signatureLen: parsed["signature_len"] as? Int ?? 0
        )
    }
}

public struct EnvelopeMetadata {
    public let version: UInt8
    public let senderDid: String
    public let recipientDid: String
    public let timestamp: UInt64
    public let epoch: UInt32
    public let sequence: UInt64
    public let contentType: UInt8
    public let ciphertextLen: Int
    public let signatureLen: Int
}

// MARK: - Content-type tag constants

/// Stable u8 tags matching the Rust side's `content_type_tag`. JS uses
/// the same numbers via the bridge, so keep them in sync.
public enum MessagingContentTypeTag {
    public static let text: UInt8 = 0
    public static let image: UInt8 = 1
    public static let file: UInt8 = 2
    public static let voice: UInt8 = 3
    public static let keyExchange: UInt8 = 4
    public static let keyRatchet: UInt8 = 5
    public static let readReceipt: UInt8 = 6
    public static let groupInvite: UInt8 = 7
}
