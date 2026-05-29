// NativeMessaging.swift — React Native bridge for the messaging FFI.
//
// JS calls land here, translate to `MessagingSession` / `MessagingEnvelope`,
// and the result returns as JSON-serialisable values (mostly base64
// strings for binary blobs). Sessions live in `MessagingSessionStore`
// behind opaque string IDs so we never expose raw pointers to JS.

import Foundation
import React

/// Thread-safe map from JS-visible session ID → live `MessagingSession`.
/// Sessions are released when JS calls `freeSession` or when the process
/// exits — there's no LRU eviction yet because realistic chat apps
/// have on the order of 10² peers, not 10⁴.
final class MessagingSessionStore {
    static let shared = MessagingSessionStore()
    private var sessions: [String: MessagingSession] = [:]
    private let queue = DispatchQueue(
        label: "com.sovereign.messaging.session-store",
        attributes: .concurrent
    )
    private init() {}

    func add(_ session: MessagingSession) -> String {
        let id = UUID().uuidString
        queue.sync(flags: .barrier) { sessions[id] = session }
        return id
    }

    func get(_ id: String) -> MessagingSession? {
        queue.sync { sessions[id] }
    }

    func remove(_ id: String) {
        queue.sync(flags: .barrier) { _ = sessions.removeValue(forKey: id) }
    }

    func clear() {
        queue.sync(flags: .barrier) { sessions.removeAll() }
    }
}

@objc(NativeMessaging)
class NativeMessaging: NSObject {

    @objc static func requiresMainQueueSetup() -> Bool { return false }

    // ── Helpers ──────────────────────────────────────────────────

    private static let errInvalidArg = "INVALID_ARG"
    private static let errNoSession = "NO_SESSION"
    private static let errCrypto = "CRYPTO"
    private static let errEncoding = "ENCODING"

    private func decodeBase64(_ s: String) -> Data? {
        Data(base64Encoded: s)
    }

    private func session(for id: String, _ reject: RCTPromiseRejectBlock) -> MessagingSession? {
        if let s = MessagingSessionStore.shared.get(id) { return s }
        reject(NativeMessaging.errNoSession, "session \(id) not found", nil)
        return nil
    }

    // ── Session lifecycle ────────────────────────────────────────

    @objc
    func initiateSession(
        _ localDid: String,
        remoteDid: String,
        remoteKyberPkB64: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let pk = decodeBase64(remoteKyberPkB64) else {
            reject(NativeMessaging.errInvalidArg, "remoteKyberPkB64 not base64", nil)
            return
        }
        do {
            let (ct, session) = try MessagingSession.initiate(
                localDid: localDid, remoteDid: remoteDid, remoteKyberPk: pk
            )
            let id = MessagingSessionStore.shared.add(session)
            resolve([
                "sessionId": id,
                "kyberCiphertextB64": ct.base64EncodedString(),
            ])
        } catch {
            reject(NativeMessaging.errCrypto, "initiate: \(error)", error)
        }
    }

    @objc
    func acceptSession(
        _ localDid: String,
        remoteDid: String,
        kyberCtB64: String,
        localKyberSkB64: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let ct = decodeBase64(kyberCtB64),
              let sk = decodeBase64(localKyberSkB64) else {
            reject(NativeMessaging.errInvalidArg, "expected base64 inputs", nil)
            return
        }
        do {
            let session = try MessagingSession.accept(
                localDid: localDid, remoteDid: remoteDid,
                kyberCiphertext: ct, localKyberSk: sk
            )
            let id = MessagingSessionStore.shared.add(session)
            resolve(["sessionId": id])
        } catch {
            reject(NativeMessaging.errCrypto, "accept: \(error)", error)
        }
    }

    @objc
    func rekeySession(
        _ sessionId: String,
        remoteKyberPkB64: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let session = self.session(for: sessionId, reject) else { return }
        guard let pk = decodeBase64(remoteKyberPkB64) else {
            reject(NativeMessaging.errInvalidArg, "remoteKyberPkB64 not base64", nil)
            return
        }
        do {
            let ct = try session.rekey(remoteKyberPk: pk)
            resolve(["kyberCiphertextB64": ct.base64EncodedString()])
        } catch {
            reject(NativeMessaging.errCrypto, "rekey: \(error)", error)
        }
    }

    @objc
    func acceptRekey(
        _ sessionId: String,
        kyberCtB64: String,
        localKyberSkB64: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let session = self.session(for: sessionId, reject) else { return }
        guard let ct = decodeBase64(kyberCtB64),
              let sk = decodeBase64(localKyberSkB64) else {
            reject(NativeMessaging.errInvalidArg, "expected base64 inputs", nil)
            return
        }
        do {
            try session.acceptRekey(kyberCiphertext: ct, localKyberSk: sk)
            resolve(nil)
        } catch {
            reject(NativeMessaging.errCrypto, "acceptRekey: \(error)", error)
        }
    }

    @objc
    func freeSession(_ sessionId: String) {
        MessagingSessionStore.shared.remove(sessionId)
    }

    // ── Session inspection ───────────────────────────────────────

    @objc
    func getSessionInfo(
        _ sessionId: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let session = self.session(for: sessionId, reject) else { return }
        resolve([
            "localDid": session.localDid,
            "remoteDid": session.remoteDid,
            "counter": session.counter,
            "epoch": session.epoch,
            "chainKeyB64": session.chainKey.base64EncodedString(),
        ])
    }

    @objc
    func serializeSession(
        _ sessionId: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let session = self.session(for: sessionId, reject) else { return }
        do {
            let bytes = try session.serialize()
            resolve(bytes.base64EncodedString())
        } catch {
            reject(NativeMessaging.errCrypto, "serialize: \(error)", error)
        }
    }

    @objc
    func deserializeSession(
        _ sessionB64: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let bytes = decodeBase64(sessionB64) else {
            reject(NativeMessaging.errInvalidArg, "sessionB64 not base64", nil)
            return
        }
        do {
            let session = try MessagingSession.deserialize(bytes)
            let id = MessagingSessionStore.shared.add(session)
            resolve(["sessionId": id])
        } catch {
            reject(NativeMessaging.errCrypto, "deserialize: \(error)", error)
        }
    }

    // ── Sealing ──────────────────────────────────────────────────

    @objc
    func sealText(
        _ sessionId: String,
        text: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let session = self.session(for: sessionId, reject) else { return }
        do {
            let env = try session.sealText(text)
            resolve(env.base64EncodedString())
        } catch {
            reject(NativeMessaging.errCrypto, "sealText: \(error)", error)
        }
    }

    @objc
    func sealBinary(
        _ sessionId: String,
        contentTypeTag: NSNumber,
        dataB64: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let session = self.session(for: sessionId, reject) else { return }
        guard let data = decodeBase64(dataB64) else {
            reject(NativeMessaging.errInvalidArg, "dataB64 not base64", nil)
            return
        }
        do {
            let env = try session.sealBinary(contentType: contentTypeTag.uint8Value, data: data)
            resolve(env.base64EncodedString())
        } catch {
            reject(NativeMessaging.errCrypto, "sealBinary: \(error)", error)
        }
    }

    @objc
    func sealKeyExchange(
        _ senderDid: String,
        recipientDid: String,
        kyberCtB64: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let ct = decodeBase64(kyberCtB64) else {
            reject(NativeMessaging.errInvalidArg, "kyberCtB64 not base64", nil)
            return
        }
        do {
            let env = try MessagingEnvelope.sealKeyExchange(
                senderDid: senderDid, recipientDid: recipientDid, kyberCiphertext: ct
            )
            resolve(env.base64EncodedString())
        } catch {
            reject(NativeMessaging.errCrypto, "sealKeyExchange: \(error)", error)
        }
    }

    // ── Open / Sign / Verify ─────────────────────────────────────

    @objc
    func envelopeOpen(
        _ envelopeB64: String,
        chainKeyB64: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let env = decodeBase64(envelopeB64),
              let key = decodeBase64(chainKeyB64) else {
            reject(NativeMessaging.errInvalidArg, "expected base64 inputs", nil)
            return
        }
        do {
            let body = try MessagingEnvelope.open(envelope: env, chainKey: key)
            resolve(body.base64EncodedString())
        } catch {
            reject(NativeMessaging.errCrypto, "open: \(error)", error)
        }
    }

    /// Convenience for Text envelopes — returns UTF-8 string directly.
    @objc
    func envelopeOpenText(
        _ envelopeB64: String,
        chainKeyB64: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let env = decodeBase64(envelopeB64),
              let key = decodeBase64(chainKeyB64) else {
            reject(NativeMessaging.errInvalidArg, "expected base64 inputs", nil)
            return
        }
        do {
            let text = try MessagingEnvelope.openText(envelope: env, chainKey: key)
            resolve(text)
        } catch {
            reject(NativeMessaging.errCrypto, "openText: \(error)", error)
        }
    }

    @objc
    func envelopeSign(
        _ envelopeB64: String,
        dilithiumSkB64: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let env = decodeBase64(envelopeB64),
              let sk = decodeBase64(dilithiumSkB64) else {
            reject(NativeMessaging.errInvalidArg, "expected base64 inputs", nil)
            return
        }
        do {
            let signed = try MessagingEnvelope.sign(envelope: env, dilithiumSk: sk)
            resolve(signed.base64EncodedString())
        } catch {
            reject(NativeMessaging.errCrypto, "sign: \(error)", error)
        }
    }

    @objc
    func envelopeVerify(
        _ envelopeB64: String,
        dilithiumPkB64: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let env = decodeBase64(envelopeB64),
              let pk = decodeBase64(dilithiumPkB64) else {
            reject(NativeMessaging.errInvalidArg, "expected base64 inputs", nil)
            return
        }
        let ok = MessagingEnvelope.verify(envelope: env, dilithiumPk: pk)
        resolve(ok)
    }

    // ── Wire format / inspection ─────────────────────────────────

    @objc
    func envelopeToHex(
        _ envelopeB64: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let env = decodeBase64(envelopeB64) else {
            reject(NativeMessaging.errInvalidArg, "envelopeB64 not base64", nil)
            return
        }
        do {
            let hex = try MessagingEnvelope.toHex(envelope: env)
            resolve(hex)
        } catch {
            reject(NativeMessaging.errEncoding, "toHex: \(error)", error)
        }
    }

    @objc
    func envelopeFromHex(
        _ hex: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        do {
            let bytes = try MessagingEnvelope.fromHex(hex)
            resolve(bytes.base64EncodedString())
        } catch {
            reject(NativeMessaging.errEncoding, "fromHex: \(error)", error)
        }
    }

    @objc
    func envelopeDescribe(
        _ envelopeB64: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let env = decodeBase64(envelopeB64) else {
            reject(NativeMessaging.errInvalidArg, "envelopeB64 not base64", nil)
            return
        }
        do {
            let meta = try MessagingEnvelope.describe(envelope: env)
            resolve([
                "version": meta.version,
                "senderDid": meta.senderDid,
                "recipientDid": meta.recipientDid,
                "timestamp": meta.timestamp,
                "epoch": meta.epoch,
                "sequence": meta.sequence,
                "contentType": meta.contentType,
                "ciphertextLen": meta.ciphertextLen,
                "signatureLen": meta.signatureLen,
            ])
        } catch {
            reject(NativeMessaging.errEncoding, "describe: \(error)", error)
        }
    }

    // ── Identity-aware variants (secret keys stay in Rust) ───────
    //
    // These all take a `senderDid` string and resolve it to the
    // cached `Identity` via `IdentityHandleStore`. The IdentityHandle
    // never leaves the bridge — JS only sees the wire-ready hex
    // string returned by Rust.

    private static let errNoIdentity = "NO_IDENTITY"

    private func identityHandle(
        for did: String,
        _ reject: RCTPromiseRejectBlock
    ) -> UnsafeMutableRawPointer? {
        guard let identity = IdentityHandleStore.shared.retrieve(by: did) as? Identity else {
            reject(
                NativeMessaging.errNoIdentity,
                "no Identity in store for \(did)",
                nil
            )
            return nil
        }
        return identity.getHandle()
    }

    @objc
    func sealTextSigned(
        _ sessionId: String,
        text: String,
        senderDid: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let session = self.session(for: sessionId, reject) else { return }
        guard let handle = identityHandle(for: senderDid, reject) else { return }
        do {
            let hex = try session.sealTextSigned(text, identity: handle)
            resolve(hex)
        } catch {
            reject(NativeMessaging.errCrypto, "sealTextSigned: \(error)", error)
        }
    }

    @objc
    func sealBinarySigned(
        _ sessionId: String,
        contentTypeTag: NSNumber,
        dataB64: String,
        senderDid: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let session = self.session(for: sessionId, reject) else { return }
        guard let data = decodeBase64(dataB64) else {
            reject(NativeMessaging.errInvalidArg, "dataB64 not base64", nil)
            return
        }
        guard let handle = identityHandle(for: senderDid, reject) else { return }
        do {
            let hex = try session.sealBinarySigned(
                contentType: contentTypeTag.uint8Value,
                data: data,
                identity: handle
            )
            resolve(hex)
        } catch {
            reject(NativeMessaging.errCrypto, "sealBinarySigned: \(error)", error)
        }
    }

    @objc
    func sealKeyExchangeSigned(
        _ senderDid: String,
        recipientDid: String,
        kyberCtB64: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let ct = decodeBase64(kyberCtB64) else {
            reject(NativeMessaging.errInvalidArg, "kyberCtB64 not base64", nil)
            return
        }
        guard let handle = identityHandle(for: senderDid, reject) else { return }
        do {
            let hex = try MessagingEnvelope.sealKeyExchangeSigned(
                senderDid: senderDid,
                recipientDid: recipientDid,
                kyberCiphertext: ct,
                identity: handle
            )
            resolve(hex)
        } catch {
            reject(NativeMessaging.errCrypto, "sealKeyExchangeSigned: \(error)", error)
        }
    }

    @objc
    func acceptSessionWithIdentity(
        _ localDid: String,
        remoteDid: String,
        kyberCtB64: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let ct = decodeBase64(kyberCtB64) else {
            reject(NativeMessaging.errInvalidArg, "kyberCtB64 not base64", nil)
            return
        }
        guard let handle = identityHandle(for: localDid, reject) else { return }
        do {
            let session = try MessagingSession.acceptWithIdentity(
                localDid: localDid,
                remoteDid: remoteDid,
                kyberCiphertext: ct,
                identity: handle
            )
            let id = MessagingSessionStore.shared.add(session)
            resolve(["sessionId": id])
        } catch {
            reject(NativeMessaging.errCrypto, "acceptSessionWithIdentity: \(error)", error)
        }
    }

    @objc
    func acceptRekeyWithIdentity(
        _ sessionId: String,
        kyberCtB64: String,
        localDid: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let session = self.session(for: sessionId, reject) else { return }
        guard let ct = decodeBase64(kyberCtB64) else {
            reject(NativeMessaging.errInvalidArg, "kyberCtB64 not base64", nil)
            return
        }
        guard let handle = identityHandle(for: localDid, reject) else { return }
        do {
            try session.acceptRekeyWithIdentity(kyberCiphertext: ct, identity: handle)
            resolve(nil)
        } catch {
            reject(NativeMessaging.errCrypto, "acceptRekeyWithIdentity: \(error)", error)
        }
    }

    @objc
    func envelopeOpenVerified(
        _ envelopeB64: String,
        chainKeyB64: String,
        peerDilithiumPkB64: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let env = decodeBase64(envelopeB64),
              let key = decodeBase64(chainKeyB64),
              let pk = decodeBase64(peerDilithiumPkB64) else {
            reject(NativeMessaging.errInvalidArg, "expected base64 inputs", nil)
            return
        }
        do {
            let body = try MessagingEnvelope.openVerified(
                envelope: env,
                chainKey: key,
                peerDilithiumPk: pk
            )
            resolve(body.base64EncodedString())
        } catch {
            reject(NativeMessaging.errCrypto, "openVerified: \(error)", error)
        }
    }

    @objc
    func acceptEnvelopeWithIdentity(
        _ localDid: String,
        remoteDid: String,
        envelopeB64: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let env = decodeBase64(envelopeB64) else {
            reject(NativeMessaging.errInvalidArg, "envelopeB64 not base64", nil)
            return
        }
        guard let handle = identityHandle(for: localDid, reject) else { return }
        do {
            let session = try MessagingSession.acceptEnvelopeWithIdentity(
                localDid: localDid,
                remoteDid: remoteDid,
                envelope: env,
                identity: handle
            )
            let id = MessagingSessionStore.shared.add(session)
            resolve(["sessionId": id])
        } catch {
            reject(NativeMessaging.errCrypto, "acceptEnvelopeWithIdentity: \(error)", error)
        }
    }

    @objc
    func acceptRekeyEnvelopeWithIdentity(
        _ sessionId: String,
        envelopeB64: String,
        localDid: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let session = self.session(for: sessionId, reject) else { return }
        guard let env = decodeBase64(envelopeB64) else {
            reject(NativeMessaging.errInvalidArg, "envelopeB64 not base64", nil)
            return
        }
        guard let handle = identityHandle(for: localDid, reject) else { return }
        do {
            try session.acceptRekeyEnvelopeWithIdentity(envelope: env, identity: handle)
            resolve(nil)
        } catch {
            reject(NativeMessaging.errCrypto, "acceptRekeyEnvelopeWithIdentity: \(error)", error)
        }
    }

    @objc
    func envelopeOpenVerifiedText(
        _ envelopeB64: String,
        chainKeyB64: String,
        peerDilithiumPkB64: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let env = decodeBase64(envelopeB64),
              let key = decodeBase64(chainKeyB64),
              let pk = decodeBase64(peerDilithiumPkB64) else {
            reject(NativeMessaging.errInvalidArg, "expected base64 inputs", nil)
            return
        }
        do {
            let body = try MessagingEnvelope.openVerified(
                envelope: env,
                chainKey: key,
                peerDilithiumPk: pk
            )
            guard let text = String(data: body, encoding: .utf8) else {
                reject(NativeMessaging.errEncoding, "body is not UTF-8", nil)
                return
            }
            resolve(text)
        } catch {
            reject(NativeMessaging.errCrypto, "openVerifiedText: \(error)", error)
        }
    }

    /// Stateful receive-side decrypt. Verifies the sender's signature +
    /// DID binding and opens the body against the session's receive
    /// ratchet, advancing it in place so the next call decrypts the
    /// following sequence. Resolves the UTF-8 text.
    @objc
    func envelopeOpenVerifiedWithSession(
        _ sessionId: String,
        envelopeB64: String,
        peerDilithiumPkB64: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let session = self.session(for: sessionId, reject) else { return }
        guard let env = decodeBase64(envelopeB64),
              let pk = decodeBase64(peerDilithiumPkB64) else {
            reject(NativeMessaging.errInvalidArg, "expected base64 inputs", nil)
            return
        }
        do {
            let body = try session.openVerifiedWithSession(
                envelope: env,
                peerDilithiumPk: pk
            )
            guard let text = String(data: body, encoding: .utf8) else {
                reject(NativeMessaging.errEncoding, "body is not UTF-8", nil)
                return
            }
            resolve(text)
        } catch {
            reject(
                NativeMessaging.errCrypto,
                "openVerifiedWithSession: \(error)",
                error,
            )
        }
    }
}
