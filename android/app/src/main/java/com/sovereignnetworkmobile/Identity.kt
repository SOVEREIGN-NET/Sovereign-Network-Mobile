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

    /**
     * Module-private accessor for the raw Rust handle. Used by
     * sibling classes in this package (currently `Messaging`) that
     * need to pass the IdentityHandle into JNI calls so secret keys
     * stay in Rust. Not part of the public API — never expose to JS.
     */
    internal fun nativeHandle(): Long = handle

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
        @JvmStatic private external fun nativeIdentityGetWalletId(handle: Long): ByteArray?
        @JvmStatic private external fun nativeIdentityGetCreatedAt(handle: Long): Long

        // ─── JNI: Serialization ───
        @JvmStatic private external fun nativeIdentitySerialize(handle: Long): String?
        @JvmStatic private external fun nativeIdentityToHandshakeJson(handle: Long): String?
        @JvmStatic private external fun nativeIdentityGetSeedPhrase(handle: Long): String?
        @JvmStatic private external fun nativeExportKeystoreBase64(handle: Long): String?

        // ─── JNI: Signing ───
        @JvmStatic private external fun nativeSignMessage(handle: Long, message: ByteArray): ByteArray?
        @JvmStatic private external fun nativeSignPoUWReceiptJson(handle: Long, receiptJson: String): ByteArray?
        @JvmStatic private external fun nativeSignRegistrationProof(handle: Long, timestamp: Long): ByteArray?

        // ─── JNI: Kyber key publish / rotate ───
        @JvmStatic private external fun nativeBuildKyberKeyUpdate(handle: Long, timestamp: Long): String?

        // ─── JNI: Token transactions (returns hex-encoded signed tx) ───
        // All amounts are decimal u128 atoms STRINGS. u64/Long is not wide
        // enough for 18-decimal tokens (1000 SOV = 1e21 atoms > u64::MAX).
        // The JNI parses the string via `parse_amount_atoms` in Rust.
        @JvmStatic private external fun nativeBuildTokenCreate(
            handle: Long, name: String, symbol: String,
            initialSupplyAtoms: String, decimals: Int,
            treasuryRecipient: ByteArray, chainId: Int
        ): String?

        @JvmStatic private external fun nativeBuildTokenMint(
            handle: Long, tokenId: ByteArray, toPubkey: ByteArray,
            amountAtoms: String, chainId: Int
        ): String?

        @JvmStatic private external fun nativeBuildTokenTransfer(
            handle: Long, tokenId: ByteArray, toPubkey: ByteArray,
            amountAtoms: String, chainId: Int, nonce: Long
        ): String?

        @JvmStatic private external fun nativeBuildTokenBurn(
            handle: Long, tokenId: ByteArray, amountAtoms: String, chainId: Int
        ): String?

        @JvmStatic private external fun nativeBuildSovWalletTransfer(
            handle: Long, fromWalletId: ByteArray, toWalletId: ByteArray,
            amountAtoms: String, chainId: Int, nonce: Long
        ): String?

        @JvmStatic private external fun nativeBuildTokenWalletTransfer(
            handle: Long, tokenId: ByteArray, fromWalletId: ByteArray,
            toWalletId: ByteArray, amountAtoms: String, chainId: Int, nonce: Long
        ): String?

        @JvmStatic private external fun nativeBuildDaoStake(
            handle: Long, sectorDaoKeyId: ByteArray,
            amountAtoms: String, nonce: Long, lockBlocks: Long, chainId: Int
        ): String?

        // ─── JNI: Domain requests (returns JSON for REST API) ───
        @JvmStatic private external fun nativeBuildDomainRegisterRequest(
            handle: Long, domain: String, contentMappingsJson: String?, feePaymentTxHex: String
        ): String?

        @JvmStatic private external fun nativeBuildDomainUpdateRequest(
            handle: Long, domain: String, newManifestCid: String, expectedPreviousManifestCid: String
        ): String?

        @JvmStatic private external fun nativeBuildDomainTransferRequest(
            handle: Long, domain: String, toOwnerDid: String
        ): String?

        // Empty treasuryWalletId byte array → JNI uses the deterministic
        // blake3("SOV_DAO_TREASURY_V1") constant (matches lib-client C FFI).
        @JvmStatic private external fun nativeBuildDomainFeePaymentTx(
            handle: Long,
            senderWalletId: ByteArray,
            treasuryWalletId: ByteArray,
            amountAtoms: String,
            nonce: Long,
            chainId: Int
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
            return if (ok == 1) Pair(heights[0], heights[1]) else null
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

    /** Get primary wallet ID = blake3(dilithium_pk || kyber_pk) — 32 bytes. Use as from_wallet_id in SOV transfers. */
    fun getWalletId(): ByteArray? = nativeIdentityGetWalletId(handle)

    /** Get 24-word BIP39 seed phrase. Show to user once during onboarding. */
    fun getSeedPhrase(): String? = nativeIdentityGetSeedPhrase(handle)

    /** Export identity keystore as base64 string. */
    fun exportKeystoreBase64(): String? = nativeExportKeystoreBase64(handle)

    // ─── Signing (keys stay in Rust) ───

    /** Sign arbitrary message bytes with Dilithium5. Returns detached signature. */
    fun signMessage(message: ByteArray): ByteArray? = nativeSignMessage(handle, message)

    /** Sign PoUW receipt JSON via canonical bincode serialization path in Rust. */
    fun signPoUWReceiptJson(receiptJson: String): ByteArray? = nativeSignPoUWReceiptJson(handle, receiptJson)

    /** Sign registration proof for timestamp. Returns detached signature. */
    fun signRegistrationProof(timestamp: Long): ByteArray? = nativeSignRegistrationProof(handle, timestamp)

    /**
     * Build the signed JSON request body for `POST /api/v1/identity/update-kyber-key`.
     * Rust assembles + signs internally — Dilithium sk never leaves the IdentityHandle.
     * Returns null on failure (no Kyber key, signing error).
     */
    fun buildKyberKeyUpdate(timestamp: Long): String? =
        nativeBuildKyberKeyUpdate(handle, timestamp)

    // ─── Token transactions ───
    //
    // Every amount parameter is a decimal u128 atoms STRING. See
    // buildSovWalletTransfer for rationale. Do NOT add Long-typed overloads —
    // u64 silently truncates 18-decimal values and caused a production bug
    // where 1000 SOV became 3.87 SOV on-chain.

    fun buildTokenCreate(
        name: String,
        symbol: String,
        initialSupplyAtoms: String,
        decimals: Int,
        treasuryRecipient: ByteArray,
        chainId: Int = 0x03,
    ): String? = nativeBuildTokenCreate(
        handle, name, symbol, initialSupplyAtoms, decimals, treasuryRecipient, chainId,
    )

    fun buildTokenMint(
        tokenId: ByteArray,
        toPubkey: ByteArray,
        amountAtoms: String,
        chainId: Int = 0x03,
    ): String? = nativeBuildTokenMint(handle, tokenId, toPubkey, amountAtoms, chainId)

    fun buildTokenTransfer(
        tokenId: ByteArray,
        toPubkey: ByteArray,
        amountAtoms: String,
        chainId: Int = 0x03,
        nonce: Long = 0L,
    ): String? = nativeBuildTokenTransfer(
        handle, tokenId, toPubkey, amountAtoms, chainId, nonce,
    )

    fun buildTokenBurn(
        tokenId: ByteArray,
        amountAtoms: String,
        chainId: Int = 0x03,
    ): String? = nativeBuildTokenBurn(handle, tokenId, amountAtoms, chainId)

    /**
     * Build signed SOV wallet-to-wallet transfer.
     *
     * fromWalletId and toWalletId must each be 32 bytes.
     * `amountAtoms` is a decimal u128 STRING in atoms (18 decimals for SOV),
     * NOT a Long. u64 is not wide enough — 1000 SOV = 1e21 atoms, which
     * wraps to 3.87 SOV if squeezed into Long. The JNI parses the string
     * into u128.
     */
    fun buildSovWalletTransfer(
        fromWalletId: ByteArray,
        toWalletId: ByteArray,
        amountAtoms: String,
        chainId: Int = 0x03,
        nonce: Long = 0L
    ): String? = nativeBuildSovWalletTransfer(handle, fromWalletId, toWalletId, amountAtoms, chainId, nonce)

    /**
     * Build signed token transfer where the sender is identified by an explicit
     * wallet_id. Use this for CBE and any token whose sender lives at wallet_id
     * rather than the identity key. All three byte arrays must be 32 bytes.
     */
    fun buildTokenWalletTransfer(
        tokenId: ByteArray,
        fromWalletId: ByteArray,
        toWalletId: ByteArray,
        amountAtoms: String,
        chainId: Int = 0x03,
        nonce: Long = 0L,
    ): String? = nativeBuildTokenWalletTransfer(
        handle, tokenId, fromWalletId, toWalletId, amountAtoms, chainId, nonce,
    )

    /**
     * Build signed DAO stake. sectorDaoKeyId must be 32 bytes.
     * `amountAtoms` is a decimal u128 atoms string (18 decimals for SOV).
     */
    fun buildDaoStake(
        sectorDaoKeyId: ByteArray,
        amountAtoms: String,
        nonce: Long,
        lockBlocks: Long,
        chainId: Int = 0x03,
    ): String? = nativeBuildDaoStake(
        handle, sectorDaoKeyId, amountAtoms, nonce, lockBlocks, chainId,
    )

    // ─── Domain requests (returns JSON for REST API) ───

    /**
     * Build domain register request body for `POST /api/v1/web4/domains/register`.
     * `contentMappingsJson` is optional JSON `{"path": {"content": "<base64>", "content_type": "<mime>"}, ...}`.
     * `feePaymentTxHex` is REQUIRED for new registrations — build it via [buildDomainFeePaymentTx] first.
     */
    fun buildDomainRegisterRequest(
        domain: String,
        contentMappingsJson: String? = null,
        feePaymentTxHex: String,
    ): String? = nativeBuildDomainRegisterRequest(handle, domain, contentMappingsJson, feePaymentTxHex)

    /**
     * Build the signed 10 SOV fee TokenTransfer (Primary wallet → DAO treasury) to attach
     * as `fee_payment_tx` on a domain registration. `treasuryWalletId` may be empty/null
     * to use lib-client's deterministic `blake3("SOV_DAO_TREASURY_V1")` constant.
     * `amountAtoms` is a decimal u128 atoms string (10 SOV = "10000000000000000000").
     */
    fun buildDomainFeePaymentTx(
        senderWalletId: ByteArray,
        treasuryWalletId: ByteArray? = null,
        amountAtoms: String,
        nonce: Long,
        chainId: Int = 0x03,
    ): String? = nativeBuildDomainFeePaymentTx(
        handle,
        senderWalletId,
        treasuryWalletId ?: ByteArray(0),
        amountAtoms,
        nonce,
        chainId,
    )

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
