package com.sovereignnetworkmobile

import android.util.Log
import java.io.Closeable

/**
 * Wraps a Rust `MessagingSessionHandle*` via an opaque `Long`. Mirrors
 * the iOS `MessagingSession` class. Secret keys never leave Rust — the
 * Kotlin side only sees the chain key (32 bytes, persistable) and
 * envelope bytes.
 */
class Messaging private constructor(
    private var handle: Long
) : Closeable {

    private var closed = false

    val localDid: String
        get() = if (handle == 0L) "" else nativeSessionLocalDid(handle).orEmpty()

    val remoteDid: String
        get() = if (handle == 0L) "" else nativeSessionRemoteDid(handle).orEmpty()

    val counter: Long
        get() = if (handle == 0L) 0 else nativeSessionCounter(handle)

    val epoch: Int
        get() = if (handle == 0L) 0 else nativeSessionEpoch(handle)

    val chainKey: ByteArray
        get() = if (handle == 0L) ByteArray(0)
                else nativeSessionChainKey(handle) ?: ByteArray(0)

    /**
     * Re-key with the peer's Kyber public key. Returns the new Kyber
     * ciphertext; deliver it as a `KeyRatchet` envelope.
     */
    fun rekey(remoteKyberPk: ByteArray): ByteArray {
        check(!closed) { "session is closed" }
        return nativeRekeySession(handle, remoteKyberPk) ?: ByteArray(0)
    }

    fun acceptRekey(kyberCiphertext: ByteArray, localKyberSk: ByteArray): Boolean {
        check(!closed) { "session is closed" }
        return nativeAcceptRekey(handle, kyberCiphertext, localKyberSk) == 0
    }

    fun serialize(): ByteArray {
        check(!closed) { "session is closed" }
        return nativeSessionSerialize(handle) ?: ByteArray(0)
    }

    fun sealText(text: String): ByteArray {
        check(!closed) { "session is closed" }
        return nativeSealText(handle, text) ?: ByteArray(0)
    }

    fun sealBinary(contentTypeTag: Int, data: ByteArray): ByteArray {
        check(!closed) { "session is closed" }
        return nativeSealBinary(handle, contentTypeTag, data) ?: ByteArray(0)
    }

    // ── Identity-aware sealing (keys stay in Rust) ──────────────

    /**
     * Seal + sign + hex-encode in one call. The Dilithium secret key
     * is read internally from the IdentityHandle and never crosses
     * to Kotlin. Returns the wire-ready hex string for `/msg/send`,
     * or empty on error.
     */
    fun sealTextSigned(text: String, identity: Identity): String {
        check(!closed) { "session is closed" }
        return nativeSealTextSigned(handle, text, identity.nativeHandle()).orEmpty()
    }

    fun sealBinarySigned(contentTypeTag: Int, data: ByteArray, identity: Identity): String {
        check(!closed) { "session is closed" }
        return nativeSealBinarySigned(
            handle, contentTypeTag, data, identity.nativeHandle()
        ).orEmpty()
    }

    fun acceptRekeyWithIdentity(kyberCiphertext: ByteArray, identity: Identity): Boolean {
        check(!closed) { "session is closed" }
        return nativeAcceptRekeyWithIdentity(
            handle, kyberCiphertext, identity.nativeHandle()
        ) == 0
    }

    /**
     * Envelope-shaped accept-rekey — feed the full bincode KeyRatchet
     * envelope, Rust extracts the ciphertext + verifies content_type.
     */
    fun acceptRekeyEnvelopeWithIdentity(envelopeBytes: ByteArray, identity: Identity): Boolean {
        check(!closed) { "session is closed" }
        return nativeAcceptRekeyEnvelopeWithIdentity(
            handle, envelopeBytes, identity.nativeHandle()
        ) == 0
    }

    override fun close() {
        if (closed || handle == 0L) return
        nativeSessionFree(handle)
        handle = 0
        closed = true
    }

    @Suppress("removal", "DEPRECATION")
    protected fun finalize() {
        if (!closed && handle != 0L) {
            Log.w(TAG, "Messaging session leaked — closing in finalize()")
            close()
        }
    }

    companion object {
        private const val TAG = "Messaging"

        init {
            try {
                System.loadLibrary("quic_jni")
            } catch (e: UnsatisfiedLinkError) {
                Log.e(TAG, "Failed to load native library", e)
            }
        }

        // ── Construction ──────────────────────────────────────────

        /**
         * Initiate a new outbound session. Returns the session paired
         * with the Kyber ciphertext to ship as a `KeyExchange` envelope.
         */
        fun initiate(
            localDid: String,
            remoteDid: String,
            remoteKyberPk: ByteArray,
        ): InitiateResult? {
            val handle = nativeInitiateSession(localDid, remoteDid, remoteKyberPk)
            if (handle == 0L) return null
            val ct = nativeTakeInitCiphertext(handle) ?: ByteArray(0)
            if (ct.isEmpty()) {
                nativeSessionFree(handle)
                return null
            }
            return InitiateResult(Messaging(handle), ct)
        }

        fun accept(
            localDid: String,
            remoteDid: String,
            kyberCiphertext: ByteArray,
            localKyberSk: ByteArray,
        ): Messaging? {
            val handle = nativeAcceptSession(localDid, remoteDid, kyberCiphertext, localKyberSk)
            return if (handle == 0L) null else Messaging(handle)
        }

        /**
         * Identity-aware accept — the Kyber secret key is pulled from
         * the IdentityHandle internally so it never crosses to Kotlin.
         */
        fun acceptWithIdentity(
            localDid: String,
            remoteDid: String,
            kyberCiphertext: ByteArray,
            identity: Identity,
        ): Messaging? {
            val handle = nativeAcceptSessionWithIdentity(
                localDid, remoteDid, kyberCiphertext, identity.nativeHandle(),
            )
            return if (handle == 0L) null else Messaging(handle)
        }

        /**
         * Envelope-shaped accept — feed the full bincode KeyExchange
         * envelope; Rust verifies content_type + DID routing and pulls
         * the Kyber ciphertext out itself. Use on the receive path.
         */
        fun acceptEnvelopeWithIdentity(
            localDid: String,
            remoteDid: String,
            envelopeBytes: ByteArray,
            identity: Identity,
        ): Messaging? {
            val handle = nativeAcceptEnvelopeWithIdentity(
                localDid, remoteDid, envelopeBytes, identity.nativeHandle(),
            )
            return if (handle == 0L) null else Messaging(handle)
        }

        fun deserialize(bytes: ByteArray): Messaging? {
            val handle = nativeSessionDeserialize(bytes)
            return if (handle == 0L) null else Messaging(handle)
        }

        // ── Stateless envelope helpers ────────────────────────────

        fun sealKeyExchange(
            senderDid: String,
            recipientDid: String,
            kyberCiphertext: ByteArray,
        ): ByteArray = nativeSealKeyExchange(senderDid, recipientDid, kyberCiphertext)
            ?: ByteArray(0)

        /** Identity-aware key-exchange seal — returns wire-ready hex. */
        fun sealKeyExchangeSigned(
            senderDid: String,
            recipientDid: String,
            kyberCiphertext: ByteArray,
            identity: Identity,
        ): String = nativeSealKeyExchangeSigned(
            senderDid, recipientDid, kyberCiphertext, identity.nativeHandle(),
        ).orEmpty()

        /** Verify the Dilithium signature, then decrypt. Empty bytes on bad sig or failure. */
        fun openVerified(
            envelopeBytes: ByteArray,
            chainKey: ByteArray,
            peerDilithiumPk: ByteArray,
        ): ByteArray =
            nativeEnvelopeOpenVerified(envelopeBytes, chainKey, peerDilithiumPk) ?: ByteArray(0)

        fun open(envelopeBytes: ByteArray, chainKey: ByteArray): ByteArray =
            nativeEnvelopeOpen(envelopeBytes, chainKey) ?: ByteArray(0)

        fun sign(envelopeBytes: ByteArray, dilithiumSk: ByteArray): ByteArray =
            nativeEnvelopeSign(envelopeBytes, dilithiumSk) ?: ByteArray(0)

        fun verify(envelopeBytes: ByteArray, dilithiumPk: ByteArray): Boolean =
            nativeEnvelopeVerify(envelopeBytes, dilithiumPk) == 1

        fun toHex(envelopeBytes: ByteArray): String =
            nativeEnvelopeToHex(envelopeBytes).orEmpty()

        fun fromHex(hex: String): ByteArray =
            nativeEnvelopeFromHex(hex) ?: ByteArray(0)

        fun describeJson(envelopeBytes: ByteArray): String =
            nativeEnvelopeToJson(envelopeBytes).orEmpty()

        // ── JNI declarations ──────────────────────────────────────

        @JvmStatic private external fun nativeInitiateSession(
            localDid: String, remoteDid: String, remoteKyberPk: ByteArray,
        ): Long
        @JvmStatic private external fun nativeTakeInitCiphertext(handle: Long): ByteArray?
        @JvmStatic private external fun nativeAcceptSession(
            localDid: String, remoteDid: String, kyberCiphertext: ByteArray, localKyberSk: ByteArray,
        ): Long
        @JvmStatic private external fun nativeRekeySession(
            handle: Long, remoteKyberPk: ByteArray,
        ): ByteArray?
        @JvmStatic private external fun nativeAcceptRekey(
            handle: Long, kyberCiphertext: ByteArray, localKyberSk: ByteArray,
        ): Int
        @JvmStatic private external fun nativeSessionFree(handle: Long)

        @JvmStatic private external fun nativeSessionLocalDid(handle: Long): String?
        @JvmStatic private external fun nativeSessionRemoteDid(handle: Long): String?
        @JvmStatic private external fun nativeSessionCounter(handle: Long): Long
        @JvmStatic private external fun nativeSessionEpoch(handle: Long): Int
        @JvmStatic private external fun nativeSessionChainKey(handle: Long): ByteArray?
        @JvmStatic private external fun nativeSessionSerialize(handle: Long): ByteArray?
        @JvmStatic private external fun nativeSessionDeserialize(bytes: ByteArray): Long

        @JvmStatic private external fun nativeSealText(handle: Long, text: String): ByteArray?
        @JvmStatic private external fun nativeSealBinary(
            handle: Long, contentTypeTag: Int, data: ByteArray,
        ): ByteArray?
        @JvmStatic private external fun nativeSealKeyExchange(
            senderDid: String, recipientDid: String, kyberCiphertext: ByteArray,
        ): ByteArray?

        @JvmStatic private external fun nativeEnvelopeOpen(
            envelopeBytes: ByteArray, chainKey: ByteArray,
        ): ByteArray?
        @JvmStatic private external fun nativeEnvelopeSign(
            envelopeBytes: ByteArray, dilithiumSk: ByteArray,
        ): ByteArray?
        @JvmStatic private external fun nativeEnvelopeVerify(
            envelopeBytes: ByteArray, dilithiumPk: ByteArray,
        ): Int

        @JvmStatic private external fun nativeEnvelopeToHex(envelopeBytes: ByteArray): String?
        @JvmStatic private external fun nativeEnvelopeFromHex(hex: String): ByteArray?
        @JvmStatic private external fun nativeEnvelopeToJson(envelopeBytes: ByteArray): String?

        // Identity-aware variants — JNI implementations in messaging_jni.rs
        @JvmStatic private external fun nativeSealTextSigned(
            sessionHandle: Long, text: String, identityHandle: Long,
        ): String?
        @JvmStatic private external fun nativeSealBinarySigned(
            sessionHandle: Long, contentTypeTag: Int, data: ByteArray, identityHandle: Long,
        ): String?
        @JvmStatic private external fun nativeSealKeyExchangeSigned(
            senderDid: String, recipientDid: String, kyberCiphertext: ByteArray, identityHandle: Long,
        ): String?
        @JvmStatic private external fun nativeAcceptSessionWithIdentity(
            localDid: String, remoteDid: String, kyberCiphertext: ByteArray, identityHandle: Long,
        ): Long
        @JvmStatic private external fun nativeAcceptRekeyWithIdentity(
            sessionHandle: Long, kyberCiphertext: ByteArray, identityHandle: Long,
        ): Int
        @JvmStatic private external fun nativeEnvelopeOpenVerified(
            envelopeBytes: ByteArray, chainKey: ByteArray, peerDilithiumPk: ByteArray,
        ): ByteArray?

        // Envelope-shaped accept variants (receive path)
        @JvmStatic private external fun nativeAcceptEnvelopeWithIdentity(
            localDid: String, remoteDid: String, envelopeBytes: ByteArray, identityHandle: Long,
        ): Long
        @JvmStatic private external fun nativeAcceptRekeyEnvelopeWithIdentity(
            sessionHandle: Long, envelopeBytes: ByteArray, identityHandle: Long,
        ): Int
    }

    /** Result tuple from `Messaging.initiate(...)`. */
    data class InitiateResult(val session: Messaging, val kyberCiphertext: ByteArray) {
        override fun equals(other: Any?): Boolean =
            other is InitiateResult && session === other.session &&
                kyberCiphertext.contentEquals(other.kyberCiphertext)
        override fun hashCode(): Int =
            session.hashCode() * 31 + kyberCiphertext.contentHashCode()
    }

    /** Stable tags matching iOS `MessagingContentTypeTag`. */
    object ContentType {
        const val TEXT = 0
        const val IMAGE = 1
        const val FILE = 2
        const val VOICE = 3
        const val KEY_EXCHANGE = 4
        const val KEY_RATCHET = 5
        const val READ_RECEIPT = 6
        const val GROUP_INVITE = 7
    }
}
