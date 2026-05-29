package com.sovereignnetworkmobile

import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONObject
import java.util.UUID

/**
 * Bridge between JS and the post-quantum messaging stack. Mirrors
 * `NativeMessaging.swift` on iOS — same method names, same b64-string
 * conventions for binary data, same sessionId opaque-handle pattern.
 *
 * Sessions live in a process-local map keyed by UUID strings. Plaintext
 * and Kyber/Dilithium secret keys never cross JS — only chain keys (32
 * bytes, persistable for at-rest storage) and envelope bytes do.
 */
class NativeMessagingModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "NativeMessaging"

    private val sessions = mutableMapOf<String, Messaging>()
    private val lock = Any()

    private fun storeSession(s: Messaging): String {
        val id = UUID.randomUUID().toString()
        synchronized(lock) { sessions[id] = s }
        return id
    }

    private fun getSession(id: String): Messaging? =
        synchronized(lock) { sessions[id] }

    private fun removeSession(id: String) {
        val s = synchronized(lock) { sessions.remove(id) }
        s?.close()
    }

    private fun decode(b64: String): ByteArray? = try {
        Base64.decode(b64, Base64.NO_WRAP)
    } catch (_: IllegalArgumentException) {
        null
    }

    private fun encode(bytes: ByteArray): String =
        Base64.encodeToString(bytes, Base64.NO_WRAP)

    // ── Session lifecycle ────────────────────────────────────────

    @ReactMethod
    fun initiateSession(
        localDid: String, remoteDid: String, remoteKyberPkB64: String, promise: Promise,
    ) {
        val pk = decode(remoteKyberPkB64)
            ?: return promise.reject("INVALID_ARG", "remoteKyberPkB64 not base64")
        val result = Messaging.initiate(localDid, remoteDid, pk)
            ?: return promise.reject("CRYPTO", "initiate failed")
        val id = storeSession(result.session)
        val map = Arguments.createMap().apply {
            putString("sessionId", id)
            putString("kyberCiphertextB64", encode(result.kyberCiphertext))
        }
        promise.resolve(map)
    }

    @ReactMethod
    fun acceptSession(
        localDid: String, remoteDid: String,
        kyberCtB64: String, localKyberSkB64: String, promise: Promise,
    ) {
        val ct = decode(kyberCtB64)
            ?: return promise.reject("INVALID_ARG", "kyberCtB64 not base64")
        val sk = decode(localKyberSkB64)
            ?: return promise.reject("INVALID_ARG", "localKyberSkB64 not base64")
        val session = Messaging.accept(localDid, remoteDid, ct, sk)
            ?: return promise.reject("CRYPTO", "accept failed")
        val id = storeSession(session)
        promise.resolve(Arguments.createMap().apply { putString("sessionId", id) })
    }

    @ReactMethod
    fun rekeySession(sessionId: String, remoteKyberPkB64: String, promise: Promise) {
        val session = getSession(sessionId)
            ?: return promise.reject("NO_SESSION", "session $sessionId not found")
        val pk = decode(remoteKyberPkB64)
            ?: return promise.reject("INVALID_ARG", "remoteKyberPkB64 not base64")
        val ct = session.rekey(pk)
        if (ct.isEmpty()) return promise.reject("CRYPTO", "rekey failed")
        promise.resolve(Arguments.createMap().apply { putString("kyberCiphertextB64", encode(ct)) })
    }

    @ReactMethod
    fun acceptRekey(
        sessionId: String, kyberCtB64: String, localKyberSkB64: String, promise: Promise,
    ) {
        val session = getSession(sessionId)
            ?: return promise.reject("NO_SESSION", "session $sessionId not found")
        val ct = decode(kyberCtB64)
            ?: return promise.reject("INVALID_ARG", "kyberCtB64 not base64")
        val sk = decode(localKyberSkB64)
            ?: return promise.reject("INVALID_ARG", "localKyberSkB64 not base64")
        if (!session.acceptRekey(ct, sk)) {
            return promise.reject("CRYPTO", "acceptRekey failed")
        }
        promise.resolve(null)
    }

    @ReactMethod
    fun freeSession(sessionId: String) {
        removeSession(sessionId)
    }

    // ── Session inspection ───────────────────────────────────────

    @ReactMethod
    fun getSessionInfo(sessionId: String, promise: Promise) {
        val session = getSession(sessionId)
            ?: return promise.reject("NO_SESSION", "session $sessionId not found")
        val map = Arguments.createMap().apply {
            putString("localDid", session.localDid)
            putString("remoteDid", session.remoteDid)
            // RN WritableMap doesn't have a u64 type; counter fits in
            // double precision until ~2^53 messages, which we'll never
            // hit in a single session.
            putDouble("counter", session.counter.toDouble())
            putInt("epoch", session.epoch)
            putString("chainKeyB64", encode(session.chainKey))
        }
        promise.resolve(map)
    }

    @ReactMethod
    fun serializeSession(sessionId: String, promise: Promise) {
        val session = getSession(sessionId)
            ?: return promise.reject("NO_SESSION", "session $sessionId not found")
        val bytes = session.serialize()
        if (bytes.isEmpty()) return promise.reject("CRYPTO", "serialize failed")
        promise.resolve(encode(bytes))
    }

    @ReactMethod
    fun deserializeSession(sessionB64: String, promise: Promise) {
        val bytes = decode(sessionB64)
            ?: return promise.reject("INVALID_ARG", "sessionB64 not base64")
        val session = Messaging.deserialize(bytes)
            ?: return promise.reject("CRYPTO", "deserialize failed")
        val id = storeSession(session)
        promise.resolve(Arguments.createMap().apply { putString("sessionId", id) })
    }

    // ── Sealing ──────────────────────────────────────────────────

    @ReactMethod
    fun sealText(sessionId: String, text: String, promise: Promise) {
        val session = getSession(sessionId)
            ?: return promise.reject("NO_SESSION", "session $sessionId not found")
        val env = session.sealText(text)
        if (env.isEmpty()) return promise.reject("CRYPTO", "sealText failed")
        promise.resolve(encode(env))
    }

    @ReactMethod
    fun sealBinary(
        sessionId: String, contentTypeTag: Int, dataB64: String, promise: Promise,
    ) {
        val session = getSession(sessionId)
            ?: return promise.reject("NO_SESSION", "session $sessionId not found")
        val data = decode(dataB64)
            ?: return promise.reject("INVALID_ARG", "dataB64 not base64")
        val env = session.sealBinary(contentTypeTag, data)
        if (env.isEmpty()) return promise.reject("CRYPTO", "sealBinary failed")
        promise.resolve(encode(env))
    }

    @ReactMethod
    fun sealKeyExchange(
        senderDid: String, recipientDid: String, kyberCtB64: String, promise: Promise,
    ) {
        val ct = decode(kyberCtB64)
            ?: return promise.reject("INVALID_ARG", "kyberCtB64 not base64")
        val env = Messaging.sealKeyExchange(senderDid, recipientDid, ct)
        if (env.isEmpty()) return promise.reject("CRYPTO", "sealKeyExchange failed")
        promise.resolve(encode(env))
    }

    // ── Open / sign / verify ─────────────────────────────────────

    @ReactMethod
    fun envelopeOpen(envelopeB64: String, chainKeyB64: String, promise: Promise) {
        val env = decode(envelopeB64)
            ?: return promise.reject("INVALID_ARG", "envelopeB64 not base64")
        val key = decode(chainKeyB64)
            ?: return promise.reject("INVALID_ARG", "chainKeyB64 not base64")
        val body = Messaging.open(env, key)
        if (body.isEmpty()) return promise.reject("CRYPTO", "open failed")
        promise.resolve(encode(body))
    }

    @ReactMethod
    fun envelopeOpenText(envelopeB64: String, chainKeyB64: String, promise: Promise) {
        val env = decode(envelopeB64)
            ?: return promise.reject("INVALID_ARG", "envelopeB64 not base64")
        val key = decode(chainKeyB64)
            ?: return promise.reject("INVALID_ARG", "chainKeyB64 not base64")
        val body = Messaging.open(env, key)
        if (body.isEmpty()) return promise.reject("CRYPTO", "open failed")
        promise.resolve(String(body, Charsets.UTF_8))
    }

    @ReactMethod
    fun envelopeSign(envelopeB64: String, dilithiumSkB64: String, promise: Promise) {
        val env = decode(envelopeB64)
            ?: return promise.reject("INVALID_ARG", "envelopeB64 not base64")
        val sk = decode(dilithiumSkB64)
            ?: return promise.reject("INVALID_ARG", "dilithiumSkB64 not base64")
        val signed = Messaging.sign(env, sk)
        if (signed.isEmpty()) return promise.reject("CRYPTO", "sign failed")
        promise.resolve(encode(signed))
    }

    @ReactMethod
    fun envelopeVerify(envelopeB64: String, dilithiumPkB64: String, promise: Promise) {
        val env = decode(envelopeB64)
            ?: return promise.reject("INVALID_ARG", "envelopeB64 not base64")
        val pk = decode(dilithiumPkB64)
            ?: return promise.reject("INVALID_ARG", "dilithiumPkB64 not base64")
        promise.resolve(Messaging.verify(env, pk))
    }

    // ── Wire format / inspection ─────────────────────────────────

    @ReactMethod
    fun envelopeToHex(envelopeB64: String, promise: Promise) {
        val env = decode(envelopeB64)
            ?: return promise.reject("INVALID_ARG", "envelopeB64 not base64")
        val hex = Messaging.toHex(env)
        if (hex.isEmpty()) return promise.reject("ENCODING", "toHex failed")
        promise.resolve(hex)
    }

    @ReactMethod
    fun envelopeFromHex(hex: String, promise: Promise) {
        val bytes = Messaging.fromHex(hex)
        if (bytes.isEmpty()) return promise.reject("ENCODING", "fromHex failed")
        promise.resolve(encode(bytes))
    }

    // ── Identity-aware variants (secret keys stay in Rust) ──────
    //
    // Each call resolves the senderDid/localDid to the cached
    // `Identity` via IdentityStore + the current-identity ID, opens
    // it (creates a Rust handle), runs the FFI call, and closes it.
    // The Identity handle never crosses to JS.

    private fun loadIdentityForDid(did: String): Identity? {
        val ctx = reactApplicationContext
        val currentId = IdentityStore.getCurrentIdentityId(ctx) ?: return null
        val storedDid = IdentityStore.getStoredDid(ctx, currentId) ?: return null
        if (storedDid != did) return null
        return IdentityStore.loadIdentity(ctx, currentId)
    }

    @ReactMethod
    fun sealTextSigned(
        sessionId: String, text: String, senderDid: String, promise: Promise,
    ) {
        val session = getSession(sessionId)
            ?: return promise.reject("NO_SESSION", "session $sessionId not found")
        val identity = loadIdentityForDid(senderDid)
            ?: return promise.reject("NO_IDENTITY", "no Identity for $senderDid")
        try {
            val hex = session.sealTextSigned(text, identity)
            if (hex.isEmpty()) {
                promise.reject("CRYPTO", "sealTextSigned failed")
            } else {
                promise.resolve(hex)
            }
        } finally {
            identity.close()
        }
    }

    @ReactMethod
    fun sealBinarySigned(
        sessionId: String, contentTypeTag: Int, dataB64: String, senderDid: String,
        promise: Promise,
    ) {
        val session = getSession(sessionId)
            ?: return promise.reject("NO_SESSION", "session $sessionId not found")
        val data = decode(dataB64)
            ?: return promise.reject("INVALID_ARG", "dataB64 not base64")
        val identity = loadIdentityForDid(senderDid)
            ?: return promise.reject("NO_IDENTITY", "no Identity for $senderDid")
        try {
            val hex = session.sealBinarySigned(contentTypeTag, data, identity)
            if (hex.isEmpty()) {
                promise.reject("CRYPTO", "sealBinarySigned failed")
            } else {
                promise.resolve(hex)
            }
        } finally {
            identity.close()
        }
    }

    @ReactMethod
    fun sealKeyExchangeSigned(
        senderDid: String, recipientDid: String, kyberCtB64: String, promise: Promise,
    ) {
        val ct = decode(kyberCtB64)
            ?: return promise.reject("INVALID_ARG", "kyberCtB64 not base64")
        val identity = loadIdentityForDid(senderDid)
            ?: return promise.reject("NO_IDENTITY", "no Identity for $senderDid")
        try {
            val hex = Messaging.sealKeyExchangeSigned(senderDid, recipientDid, ct, identity)
            if (hex.isEmpty()) {
                promise.reject("CRYPTO", "sealKeyExchangeSigned failed")
            } else {
                promise.resolve(hex)
            }
        } finally {
            identity.close()
        }
    }

    @ReactMethod
    fun acceptSessionWithIdentity(
        localDid: String, remoteDid: String, kyberCtB64: String, promise: Promise,
    ) {
        val ct = decode(kyberCtB64)
            ?: return promise.reject("INVALID_ARG", "kyberCtB64 not base64")
        val identity = loadIdentityForDid(localDid)
            ?: return promise.reject("NO_IDENTITY", "no Identity for $localDid")
        try {
            val session = Messaging.acceptWithIdentity(localDid, remoteDid, ct, identity)
                ?: return promise.reject("CRYPTO", "acceptSessionWithIdentity failed")
            val id = storeSession(session)
            promise.resolve(Arguments.createMap().apply { putString("sessionId", id) })
        } finally {
            identity.close()
        }
    }

    @ReactMethod
    fun acceptRekeyWithIdentity(
        sessionId: String, kyberCtB64: String, localDid: String, promise: Promise,
    ) {
        val session = getSession(sessionId)
            ?: return promise.reject("NO_SESSION", "session $sessionId not found")
        val ct = decode(kyberCtB64)
            ?: return promise.reject("INVALID_ARG", "kyberCtB64 not base64")
        val identity = loadIdentityForDid(localDid)
            ?: return promise.reject("NO_IDENTITY", "no Identity for $localDid")
        try {
            if (!session.acceptRekeyWithIdentity(ct, identity)) {
                promise.reject("CRYPTO", "acceptRekeyWithIdentity failed")
            } else {
                promise.resolve(null)
            }
        } finally {
            identity.close()
        }
    }

    @ReactMethod
    fun envelopeOpenVerified(
        envelopeB64: String, chainKeyB64: String, peerDilithiumPkB64: String,
        promise: Promise,
    ) {
        val env = decode(envelopeB64)
            ?: return promise.reject("INVALID_ARG", "envelopeB64 not base64")
        val key = decode(chainKeyB64)
            ?: return promise.reject("INVALID_ARG", "chainKeyB64 not base64")
        val pk = decode(peerDilithiumPkB64)
            ?: return promise.reject("INVALID_ARG", "peerDilithiumPkB64 not base64")
        val body = Messaging.openVerified(env, key, pk)
        if (body.isEmpty()) {
            promise.reject("CRYPTO", "openVerified failed")
        } else {
            promise.resolve(encode(body))
        }
    }

    @ReactMethod
    fun acceptEnvelopeWithIdentity(
        localDid: String, remoteDid: String, envelopeB64: String, promise: Promise,
    ) {
        val env = decode(envelopeB64)
            ?: return promise.reject("INVALID_ARG", "envelopeB64 not base64")
        val identity = loadIdentityForDid(localDid)
            ?: return promise.reject("NO_IDENTITY", "no Identity for $localDid")
        try {
            val session = Messaging.acceptEnvelopeWithIdentity(localDid, remoteDid, env, identity)
                ?: return promise.reject("CRYPTO", "acceptEnvelopeWithIdentity failed")
            val id = storeSession(session)
            promise.resolve(Arguments.createMap().apply { putString("sessionId", id) })
        } finally {
            identity.close()
        }
    }

    @ReactMethod
    fun acceptRekeyEnvelopeWithIdentity(
        sessionId: String, envelopeB64: String, localDid: String, promise: Promise,
    ) {
        val session = getSession(sessionId)
            ?: return promise.reject("NO_SESSION", "session $sessionId not found")
        val env = decode(envelopeB64)
            ?: return promise.reject("INVALID_ARG", "envelopeB64 not base64")
        val identity = loadIdentityForDid(localDid)
            ?: return promise.reject("NO_IDENTITY", "no Identity for $localDid")
        try {
            if (!session.acceptRekeyEnvelopeWithIdentity(env, identity)) {
                promise.reject("CRYPTO", "acceptRekeyEnvelopeWithIdentity failed")
            } else {
                promise.resolve(null)
            }
        } finally {
            identity.close()
        }
    }

    @ReactMethod
    fun envelopeOpenVerifiedText(
        envelopeB64: String, chainKeyB64: String, peerDilithiumPkB64: String,
        promise: Promise,
    ) {
        val env = decode(envelopeB64)
            ?: return promise.reject("INVALID_ARG", "envelopeB64 not base64")
        val key = decode(chainKeyB64)
            ?: return promise.reject("INVALID_ARG", "chainKeyB64 not base64")
        val pk = decode(peerDilithiumPkB64)
            ?: return promise.reject("INVALID_ARG", "peerDilithiumPkB64 not base64")
        val body = Messaging.openVerified(env, key, pk)
        if (body.isEmpty()) {
            promise.reject("CRYPTO", "openVerified failed")
        } else {
            promise.resolve(String(body, Charsets.UTF_8))
        }
    }

    @ReactMethod
    fun envelopeOpenVerifiedWithSession(
        sessionId: String, envelopeB64: String, peerDilithiumPkB64: String,
        promise: Promise,
    ) {
        val session = getSession(sessionId)
            ?: return promise.reject("NO_SESSION", "session $sessionId not found")
        val env = decode(envelopeB64)
            ?: return promise.reject("INVALID_ARG", "envelopeB64 not base64")
        val pk = decode(peerDilithiumPkB64)
            ?: return promise.reject("INVALID_ARG", "peerDilithiumPkB64 not base64")
        val body = session.openVerifiedWithSession(env, pk)
        if (body.isEmpty()) {
            promise.reject("CRYPTO", "openVerifiedWithSession failed")
        } else {
            promise.resolve(String(body, Charsets.UTF_8))
        }
    }

    @ReactMethod
    fun envelopeDescribe(envelopeB64: String, promise: Promise) {
        val env = decode(envelopeB64)
            ?: return promise.reject("INVALID_ARG", "envelopeB64 not base64")
        val json = Messaging.describeJson(env)
        if (json.isEmpty()) return promise.reject("ENCODING", "describe failed")
        try {
            val parsed = JSONObject(json)
            val map = Arguments.createMap().apply {
                putInt("version", parsed.optInt("version"))
                putString("senderDid", parsed.optString("sender_did"))
                putString("recipientDid", parsed.optString("recipient_did"))
                putDouble("timestamp", parsed.optLong("timestamp").toDouble())
                putInt("epoch", parsed.optInt("epoch"))
                putDouble("sequence", parsed.optLong("sequence").toDouble())
                putInt("contentType", parsed.optInt("content_type"))
                putInt("ciphertextLen", parsed.optInt("ciphertext_len"))
                putInt("signatureLen", parsed.optInt("signature_len"))
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("ENCODING", "describe parse failed", e)
        }
    }
}
