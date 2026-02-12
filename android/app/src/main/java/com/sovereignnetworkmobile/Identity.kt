package com.sovereignnetworkmobile

import android.util.Base64
import android.util.Log
import java.io.Closeable

/**
 * Wraps an opaque Rust IdentityHandle* pointer (as Long).
 * Mirrors iOS Identity class in ZhtpClient.swift.
 * Secret keys never leave Rust memory.
 *
 * Lifecycle: create via companion factory methods, close when done.
 * Uses finalize() as safety net for leaked handles.
 */
class Identity private constructor(
    val did: String,
    val deviceId: String,
    val publicKey: ByteArray,
    val kyberPublicKey: ByteArray,
    val nodeId: ByteArray,
    val createdAt: Long,
    private val handle: Long
) : Closeable {

    private var closed = false

    companion object {
        private const val TAG = "Identity"

        init {
            try {
                System.loadLibrary("quic_jni")
            } catch (e: UnsatisfiedLinkError) {
                Log.e(TAG, "Failed to load native library", e)
            }
        }

        /** Generate a new identity. Returns null on failure. */
        fun generate(deviceId: String): Identity? {
            val handle = nativeGenerateIdentity(deviceId)
            if (handle == 0L) return null
            return fromHandle(handle)
        }

        /** Restore identity from 24-word BIP39 seed phrase. Returns null on failure. */
        fun restoreFromPhrase(phrase: String, deviceId: String): Identity? {
            val handle = nativeRestoreIdentityFromPhrase(phrase, deviceId)
            if (handle == 0L) return null
            return fromHandle(handle)
        }

        /** Deserialize identity from JSON (e.g. loaded from EncryptedSharedPreferences). */
        fun deserialize(json: String): Identity? {
            val handle = nativeDeserializeIdentity(json)
            if (handle == 0L) return null
            return fromHandle(handle)
        }

        /** Check if identity JSON is valid without keeping the handle. */
        fun validate(json: String): Boolean {
            val handle = nativeDeserializeIdentity(json)
            if (handle == 0L) return false
            nativeIdentityFree(handle)
            return true
        }

        private fun fromHandle(handle: Long): Identity? {
            val did = nativeIdentityGetDid(handle)
            if (did.isNullOrEmpty()) {
                nativeIdentityFree(handle)
                return null
            }
            return Identity(
                did = did,
                deviceId = nativeIdentityGetDeviceId(handle) ?: "",
                publicKey = nativeIdentityGetPublicKey(handle) ?: ByteArray(0),
                kyberPublicKey = nativeIdentityGetKyberPublicKey(handle) ?: ByteArray(0),
                nodeId = nativeIdentityGetNodeId(handle) ?: ByteArray(0),
                createdAt = nativeIdentityGetCreatedAt(handle),
                handle = handle
            )
        }

        // ─── JNI: Lifecycle ───
        @JvmStatic private external fun nativeGenerateIdentity(deviceId: String): Long
        @JvmStatic private external fun nativeRestoreIdentityFromPhrase(phrase: String, deviceId: String): Long
        @JvmStatic private external fun nativeDeserializeIdentity(json: String): Long
        @JvmStatic private external fun nativeIdentityFree(handle: Long)

        // ─── JNI: Field access ───
        @JvmStatic private external fun nativeIdentityGetDid(handle: Long): String?
        @JvmStatic private external fun nativeIdentityGetDeviceId(handle: Long): String?
        @JvmStatic private external fun nativeIdentityGetPublicKey(handle: Long): ByteArray?
        @JvmStatic private external fun nativeIdentityGetKyberPublicKey(handle: Long): ByteArray?
        @JvmStatic private external fun nativeIdentityGetNodeId(handle: Long): ByteArray?
        @JvmStatic private external fun nativeIdentityGetCreatedAt(handle: Long): Long

        // ─── JNI: Serialization ───
        @JvmStatic private external fun nativeIdentitySerialize(handle: Long): String?
        @JvmStatic private external fun nativeIdentityToHandshakeJson(handle: Long): String?
        @JvmStatic private external fun nativeIdentityGetSeedPhrase(handle: Long): String?
        @JvmStatic private external fun nativeExportKeystoreBase64(handle: Long): String?

        // ─── JNI: Signing ───
        @JvmStatic private external fun nativeSignMessage(handle: Long, message: ByteArray): ByteArray?
        @JvmStatic private external fun nativeSignRegistrationProof(handle: Long, timestamp: Long): ByteArray?

        // ─── JNI: Token transactions (returns hex-encoded signed tx) ───
        @JvmStatic private external fun nativeBuildTokenCreate(
            handle: Long, name: String, symbol: String,
            initialSupply: Long, decimals: Int, chainId: Int
        ): String?

        @JvmStatic private external fun nativeBuildTokenMint(
            handle: Long, tokenId: ByteArray, toPubkey: ByteArray,
            amount: Long, chainId: Int
        ): String?

        @JvmStatic private external fun nativeBuildTokenTransfer(
            handle: Long, tokenId: ByteArray, toPubkey: ByteArray,
            amount: Long, chainId: Int
        ): String?

        @JvmStatic private external fun nativeBuildTokenBurn(
            handle: Long, tokenId: ByteArray, amount: Long, chainId: Int
        ): String?

        @JvmStatic private external fun nativeBuildSovWalletTransfer(
            handle: Long, fromWalletId: ByteArray, toWalletId: ByteArray,
            amount: Long, chainId: Int
        ): String?

        // ─── JNI: Domain requests (returns JSON for REST API) ───
        @JvmStatic private external fun nativeBuildDomainRegisterRequest(
            handle: Long, domain: String, contentMappingsJson: String?
        ): String?

        @JvmStatic private external fun nativeBuildDomainUpdateRequest(
            handle: Long, domain: String, newManifestCid: String, expectedPreviousManifestCid: String
        ): String?

        @JvmStatic private external fun nativeBuildDomainTransferRequest(
            handle: Long, domain: String, toOwnerDid: String
        ): String?

        // ─── JNI: Fee config (global, no handle) ───
        @JvmStatic private external fun nativeSetFeeConfigJsonEx(
            json: String, heights: LongArray
        ): Int

        @JvmStatic private external fun nativeQuoteFeeForTxHex(txHex: String): Long

        /** Pass fee config JSON to Rust. Returns (updatedAt, chainHeight) or null on error. */
        fun setFeeConfig(json: String): Pair<Long, Long>? {
            val heights = LongArray(2)
            val ok = nativeSetFeeConfigJsonEx(json, heights)
            return if (ok == 0) Pair(heights[0], heights[1]) else null
        }

        fun quoteFeeForTxHex(txHex: String): Long = nativeQuoteFeeForTxHex(txHex)

        // ─── JNI: Deprecated secret key getters (legacy handshake path only) ───
        @JvmStatic private external fun nativeIdentityGetDilithiumSk(handle: Long): ByteArray?
        @JvmStatic private external fun nativeIdentityGetKyberSk(handle: Long): ByteArray?
        @JvmStatic private external fun nativeIdentityGetMasterSeed(handle: Long): ByteArray?
    }

    /** Opaque handle for passing to NativeQuicBridge HandshakeState methods. */
    fun getHandle(): Long = handle

    // ─── Serialization ───

    /** Serialize identity to JSON for secure storage. */
    fun serialize(): String? = nativeIdentitySerialize(handle)

    /** Serialize to handshake-compatible JSON format for UHP. */
    fun toHandshakeJson(): String? = nativeIdentityToHandshakeJson(handle)

    /** Get 24-word BIP39 seed phrase. Show to user once during onboarding. */
    fun getSeedPhrase(): String? = nativeIdentityGetSeedPhrase(handle)

    /** Export identity keystore as base64 string. */
    fun exportKeystoreBase64(): String? = nativeExportKeystoreBase64(handle)

    // ─── Signing (keys stay in Rust) ───

    /** Sign arbitrary message bytes with Dilithium5. Returns detached signature. */
    fun signMessage(message: ByteArray): ByteArray? = nativeSignMessage(handle, message)

    /** Sign registration proof for timestamp. Returns detached signature. */
    fun signRegistrationProof(timestamp: Long): ByteArray? = nativeSignRegistrationProof(handle, timestamp)

    // ─── Token transactions ───

    fun buildTokenCreate(name: String, symbol: String, supply: Long, decimals: Int, chainId: Int = 0x02): String? =
        nativeBuildTokenCreate(handle, name, symbol, supply, decimals, chainId)

    fun buildTokenMint(tokenId: ByteArray, toPubkey: ByteArray, amount: Long, chainId: Int = 0x02): String? =
        nativeBuildTokenMint(handle, tokenId, toPubkey, amount, chainId)

    fun buildTokenTransfer(tokenId: ByteArray, toPubkey: ByteArray, amount: Long, chainId: Int = 0x02): String? =
        nativeBuildTokenTransfer(handle, tokenId, toPubkey, amount, chainId)

    fun buildTokenBurn(tokenId: ByteArray, amount: Long, chainId: Int = 0x02): String? =
        nativeBuildTokenBurn(handle, tokenId, amount, chainId)

    /** Build signed SOV wallet-to-wallet transfer. fromWalletId and toWalletId must each be 32 bytes. */
    fun buildSovWalletTransfer(fromWalletId: ByteArray, toWalletId: ByteArray, amount: Long, chainId: Int = 0x02): String? =
        nativeBuildSovWalletTransfer(handle, fromWalletId, toWalletId, amount, chainId)

    // ─── Domain requests (returns JSON for REST API) ───

    /** Build domain register request. contentMappingsJson is optional JSON: {"path": {"content": "...", "content_type": "..."}} */
    fun buildDomainRegisterRequest(domain: String, contentMappingsJson: String? = null): String? =
        nativeBuildDomainRegisterRequest(handle, domain, contentMappingsJson)

    /** Build domain update request with manifest CID versioning. */
    fun buildDomainUpdateRequest(domain: String, newManifestCid: String, expectedPreviousManifestCid: String): String? =
        nativeBuildDomainUpdateRequest(handle, domain, newManifestCid, expectedPreviousManifestCid)

    /** Build domain transfer request. toOwnerDid is the recipient's DID string. */
    fun buildDomainTransferRequest(domain: String, toOwnerDid: String): String? =
        nativeBuildDomainTransferRequest(handle, domain, toOwnerDid)

    // ─── Base64 helpers ───

    fun publicKeyBase64(): String = Base64.encodeToString(publicKey, Base64.NO_WRAP)
    fun kyberPublicKeyBase64(): String = Base64.encodeToString(kyberPublicKey, Base64.NO_WRAP)

    // ─── Deprecated secret key getters (legacy handshake path only) ───

    @Deprecated("Use HandshakeState for UHP handshake — keys stay in Rust")
    fun getDilithiumSecretKey(): ByteArray? = nativeIdentityGetDilithiumSk(handle)

    @Deprecated("Use HandshakeState for UHP handshake — keys stay in Rust")
    fun getKyberSecretKey(): ByteArray? = nativeIdentityGetKyberSk(handle)

    @Deprecated("Use HandshakeState for UHP handshake — keys stay in Rust")
    fun getMasterSeed(): ByteArray? = nativeIdentityGetMasterSeed(handle)

    // ─── Lifecycle ───

    override fun close() {
        if (!closed) {
            closed = true
            nativeIdentityFree(handle)
        }
    }

    @Suppress("removal")
    protected fun finalize() {
        close()
    }
}
