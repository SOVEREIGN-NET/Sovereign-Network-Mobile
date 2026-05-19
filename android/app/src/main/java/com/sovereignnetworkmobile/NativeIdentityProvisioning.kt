package com.sovereignnetworkmobile

import android.provider.Settings
import android.net.Uri
import android.os.Environment
import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableNativeMap
import org.json.JSONObject
import java.io.File
import java.util.UUID
import java.util.concurrent.Executor
import java.util.concurrent.Executors

/**
 * React Native bridge for identity provisioning.
 * Uses opaque Identity handles — secret keys never leave Rust memory.
 */
class NativeIdentityProvisioning(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "NativeIdentityProvisioning"

        // Protocol treasury recipient key-id (32 bytes)
        private val TREASURY_RECIPIENT: ByteArray = byteArrayOf(
            0x6a.toByte(), 0xdb.toByte(), 0x02.toByte(), 0x79.toByte(),
            0xd2.toByte(), 0xaf.toByte(), 0x62.toByte(), 0x5f.toByte(),
            0x4d.toByte(), 0x29.toByte(), 0x2b.toByte(), 0xaf.toByte(),
            0xe0.toByte(), 0xfc.toByte(), 0xfe.toByte(), 0x3e.toByte(),
            0x20.toByte(), 0x20.toByte(), 0x43.toByte(), 0x64.toByte(),
            0x78.toByte(), 0xb0.toByte(), 0xf9.toByte(), 0x0d.toByte(),
            0x98.toByte(), 0xad.toByte(), 0xaf.toByte(), 0x82.toByte(),
            0x0c.toByte(), 0xac.toByte(), 0x15.toByte(), 0x47.toByte()
        )

        @JvmStatic private external fun nativeBuildTokenCreate(
            identityJson: String, name: String, symbol: String,
            initialSupplyAtoms: String, decimals: Int,
            treasuryRecipient: ByteArray, chainId: Int
        ): String
    }

    private val executor: Executor = Executors.newCachedThreadPool()
    private val cachedIdentities: MutableMap<String, Identity> = mutableMapOf()

    override fun getName() = "NativeIdentityProvisioning"

    @ReactMethod
    fun generateLocalIdentity(displayName: String, promise: Promise) {
        executor.execute {
            try {
                val deviceId = getDeviceId()
                val identity = Identity.generate(deviceId)
                if (identity == null) {
                    promise.reject("IDENTITY_ERROR", "Identity generation failed")
                    return@execute
                }

                // Replace any existing cached identity for this DID
                cachedIdentities[identity.did]?.close()
                cachedIdentities[identity.did] = identity

                val response = WritableNativeMap().apply {
                    putString("status", "generated")
                    putString("did", identity.did)
                    putString("deviceId", deviceId)
                    putString("publicDilithium", identity.publicKeyBase64())
                    putString("publicKyber", identity.kyberPublicKeyBase64())
                    putDouble("timestamp", identity.createdAt.toDouble())
                    putString("masterSeedHex", "")
                }
                promise.resolve(response)
            } catch (e: Exception) {
                Log.e(TAG, "Identity generation failed", e)
                promise.reject("IDENTITY_ERROR", "Identity generation failed: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun provisionIdentity(displayName: String, serverUrl: String, promise: Promise) {
        generateLocalIdentity(displayName, promise)
    }

    @ReactMethod
    fun createRegistrationProof(displayName: String, didData: ReadableMap, promise: Promise) {
        executor.execute {
            try {
                val did = didData.getString("did") ?: ""
                val identity = cachedIdentities[did]
                if (identity == null) {
                    promise.reject("IDENTITY_ERROR", "Identity not found - call provisionIdentity first")
                    return@execute
                }

                val timestamp = System.currentTimeMillis() / 1000
                // Use dedicated registration proof FFI (matches iOS zhtp_client_sign_registration_proof)
                val signature = identity.signRegistrationProof(timestamp)
                if (signature == null) {
                    promise.reject("IDENTITY_ERROR", "Registration proof signing failed")
                    return@execute
                }

                Log.d(TAG, "Registration proof signature length: ${signature.size} bytes")

                val response = WritableNativeMap().apply {
                    putString("did", identity.did)
                    putString("public_key", identity.publicKeyBase64())
                    putString("kyber_public_key", identity.kyberPublicKeyBase64())
                    putString("node_id", b64(identity.nodeId))
                    putString("device_id", identity.deviceId)
                    putString("display_name", displayName)
                    putString("identity_type", "human")
                    putString("registration_proof", b64(signature))
                    putDouble("timestamp", timestamp.toDouble())
                }
                promise.resolve(response)
            } catch (e: Exception) {
                Log.e(TAG, "Registration proof failed", e)
                promise.reject("IDENTITY_ERROR", "Failed to create proof: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun storeProvisionedIdentity(identityId: String, didData: ReadableMap, promise: Promise) {
        executor.execute {
            try {
                val did = didData.getString("did") ?: ""
                val identity = cachedIdentities[did]
                if (identity == null) {
                    promise.reject("IDENTITY_ERROR", "Cached identity not found")
                    return@execute
                }

                IdentityStore.storeIdentity(reactApplicationContext, identityId, identity)

                val response = WritableNativeMap().apply {
                    putString("status", "provisioned")
                    putString("identity_id", identityId)
                    putString("did", did)
                }
                promise.resolve(response)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to store identity", e)
                promise.reject("IDENTITY_ERROR", "Failed to store identity: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun restoreIdentityToHandleStore(identityId: String, promise: Promise) {
        executor.execute {
            try {
                val identity = IdentityStore.loadIdentity(reactApplicationContext, identityId)
                val response = WritableNativeMap().apply {
                    if (identity != null) {
                        // Replace any existing cached identity for this DID
                        cachedIdentities[identity.did]?.close()
                        cachedIdentities[identity.did] = identity
                        IdentityStore.setCurrentIdentityId(reactApplicationContext, identityId)
                        putString("status", "restored")
                        putString("identity_id", identityId)
                    } else {
                        putString("status", "skipped")
                        putString("identity_id", identityId)
                        putString("reason", "identity_materials_not_found")
                    }
                }
                promise.resolve(response)
            } catch (e: Exception) {
                Log.e(TAG, "Restore identity failed", e)
                val response = WritableNativeMap().apply {
                    putString("status", "skipped")
                    putString("identity_id", identityId)
                    putString("reason", "restore_failed")
                    putString("error", e.message ?: "unknown")
                }
                promise.resolve(response)
            }
        }
    }

    @ReactMethod
    fun getLocalIdentity(identityIdOrDid: String, promise: Promise) {
        executor.execute {
            try {
                val normalized = normalizeIdentityId(identityIdOrDid)
                if (normalized.isEmpty()) {
                    promise.resolve(WritableNativeMap().apply {
                        putString("status", "missing")
                        putString("reason", "empty_identity_id")
                    })
                    return@execute
                }

                // Load identity temporarily to extract metadata, then close
                val identity = IdentityStore.loadIdentity(reactApplicationContext, normalized)
                if (identity == null) {
                    promise.resolve(WritableNativeMap().apply {
                        putString("status", "missing")
                        putString("reason", "identity_materials_not_found")
                    })
                    return@execute
                }

                identity.use { id ->
                    val response = WritableNativeMap().apply {
                        putString("status", "found")
                        putString("identity_id", normalized)
                        putString("did", id.did)
                        putString("device_id", id.deviceId)
                        if (id.createdAt > 0) putDouble("created_at", id.createdAt.toDouble())
                    }
                    promise.resolve(response)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to get local identity", e)
                promise.resolve(WritableNativeMap().apply {
                    putString("status", "missing")
                    putString("reason", "exception")
                    putString("error", e.message ?: "unknown")
                })
            }
        }
    }

    @ReactMethod
    fun getSeedPhraseForBackup(did: String, promise: Promise) {
        executor.execute {
            try {
                val identity = cachedIdentities[did]
                if (identity == null) {
                    promise.reject("IDENTITY_ERROR", "Identity not found for seed phrase")
                    return@execute
                }

                val phrase = identity.getSeedPhrase()
                if (phrase.isNullOrBlank()) {
                    promise.reject("IDENTITY_ERROR", "Failed to get seed phrase")
                    return@execute
                }

                promise.resolve(phrase)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to get seed phrase", e)
                promise.reject("IDENTITY_ERROR", "Failed to get seed phrase: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun getSeedPhraseFromStoredIdentity(identityIdOrDid: String, promise: Promise) {
        executor.execute {
            try {
                val normalized = normalizeIdentityId(identityIdOrDid)
                val identity = IdentityStore.loadIdentity(reactApplicationContext, normalized)
                if (identity == null) {
                    promise.reject("IDENTITY_ERROR", "Identity not found in local store")
                    return@execute
                }

                identity.use { id ->
                    val phrase = id.getSeedPhrase()
                    if (phrase.isNullOrBlank()) {
                        promise.reject("IDENTITY_ERROR", "Failed to get seed phrase")
                        return@execute
                    }
                    promise.resolve(phrase)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to get seed phrase from stored identity", e)
                promise.reject("IDENTITY_ERROR", "Failed to get seed phrase: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun restoreIdentityFromPhrase(phrase: String, promise: Promise) {
        executor.execute {
            try {
                val deviceId = getDeviceId()
                val identity = Identity.restoreFromPhrase(phrase, deviceId)
                if (identity == null) {
                    promise.reject("IDENTITY_ERROR", "Identity restore failed")
                    return@execute
                }

                // Replace any existing cached identity for this DID
                cachedIdentities[identity.did]?.close()
                cachedIdentities[identity.did] = identity

                val response = WritableNativeMap().apply {
                    putString("status", "restored")
                    putString("did", identity.did)
                    putString("deviceId", deviceId)
                    putString("publicDilithium", identity.publicKeyBase64())
                    putString("publicKyber", identity.kyberPublicKeyBase64())
                    putDouble("createdAt", identity.createdAt.toDouble())
                    putString("identityType", "human")
                }
                promise.resolve(response)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to restore identity", e)
                promise.reject("IDENTITY_ERROR", "Failed to restore identity: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun cleanKeystoreDirectory(promise: Promise) {
        executor.execute {
            try {
                IdentityStore.clearAll(reactApplicationContext)
                cachedIdentities.values.forEach { it.close() }
                cachedIdentities.clear()
                promise.resolve(true)
            } catch (e: Exception) {
                Log.e(TAG, "Cleanup failed", e)
                promise.reject("IDENTITY_ERROR", "Cleanup failed: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun cleanKeystoreDirectoryForId(identityId: String, promise: Promise) {
        executor.execute {
            try {
                IdentityStore.clearIdentity(reactApplicationContext, identityId)
                promise.resolve(true)
            } catch (e: Exception) {
                Log.e(TAG, "Cleanup identity failed", e)
                promise.reject("IDENTITY_ERROR", "Cleanup failed: ${e.message}", e)
            }
        }
    }

    // ─── Token transaction signing ───

    @ReactMethod
    fun signTokenCreateTransaction(params: ReadableMap, promise: Promise) {
        executor.execute {
            try {
                val name = params.getString("name") ?: ""
                val symbol = params.getString("symbol") ?: ""
                val initialSupplyAtoms = parseAmountAtoms(params, "initialSupply")
                    ?: run {
                        promise.reject(
                            "INVALID_PARAMS",
                            "initialSupply must be a decimal u128 atoms string",
                        )
                        return@execute
                    }
                val decimals = params.getInt("decimals")

                val identity = getLatestIdentity()
                if (identity == null) {
                    promise.reject("IDENTITY_ERROR", "No identity available for signing")
                    return@execute
                }

                Log.d(TAG, "Building token create transaction: $name/$symbol atoms=$initialSupplyAtoms")

                val identityJson = identity.serialize()
                if (identityJson == null) {
                    promise.reject("SIGNING_ERROR", "Failed to serialize identity for signing")
                    return@execute
                }
                val hexSignedTx = nativeBuildTokenCreate(
                    identityJson, name, symbol, initialSupplyAtoms, decimals,
                    TREASURY_RECIPIENT, 0x03
                )
                if (hexSignedTx.isEmpty()) {
                    promise.reject("SIGNING_ERROR", "Failed to build token creation transaction")
                    return@execute
                }

                promise.resolve(WritableNativeMap().apply {
                    putString("signed_tx", hexSignedTx)
                })
            } catch (e: Exception) {
                Log.e(TAG, "Token creation signing failed", e)
                promise.reject("IDENTITY_ERROR", "Failed to sign token creation: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun signTokenMintTransaction(params: ReadableMap, promise: Promise) {
        executor.execute {
            try {
                val tokenId = params.getString("tokenId") ?: ""
                val recipientDid = params.getString("recipientDid") ?: ""
                val amountAtoms = parseAmountAtoms(params, "amount")
                    ?: run {
                        promise.reject(
                            "INVALID_PARAMS",
                            "amount must be a decimal u128 atoms string",
                        )
                        return@execute
                    }

                val identity = getLatestIdentity()
                if (identity == null) {
                    promise.reject("IDENTITY_ERROR", "No identity available for signing")
                    return@execute
                }

                val tokenIdBytes = hexToBytes(tokenId)
                val recipientBytes = hexToBytes(recipientDid)

                Log.d(TAG, "Building token mint transaction: $tokenId -> $recipientDid atoms=$amountAtoms")

                val hexSignedTx = identity.buildTokenMint(tokenIdBytes, recipientBytes, amountAtoms)
                if (hexSignedTx == null) {
                    promise.reject("SIGNING_ERROR", "Failed to build token mint transaction")
                    return@execute
                }

                promise.resolve(WritableNativeMap().apply {
                    putString("signed_tx", hexSignedTx)
                })
            } catch (e: Exception) {
                Log.e(TAG, "Token mint signing failed", e)
                promise.reject("IDENTITY_ERROR", "Failed to sign token mint: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun signTokenTransferTransaction(params: ReadableMap, promise: Promise) {
        executor.execute {
            try {
                val tokenId = params.getString("tokenId") ?: ""
                val toAddress = params.getString("toAddress") ?: ""
                val amountAtoms = parseAmountAtoms(params, "amount")
                    ?: run {
                        promise.reject(
                            "INVALID_PARAMS",
                            "amount must be a decimal u128 atoms string",
                        )
                        return@execute
                    }

                val identity = getLatestIdentity()
                if (identity == null) {
                    promise.reject("IDENTITY_ERROR", "No identity available for signing")
                    return@execute
                }

                val tokenIdBytes = hexToBytes(tokenId)
                val toAddressBytes = hexToBytes(toAddress)
                val senderAddress = normalizeDidToAddress(identity.did)
                val nonce = fetchTokenTransferNonce(tokenId.lowercase(), senderAddress)

                Log.d(TAG, "Building token transfer transaction: $tokenId -> $toAddress atoms=$amountAtoms nonce=$nonce")

                val hexSignedTx = identity.buildTokenTransfer(
                    tokenIdBytes,
                    toAddressBytes,
                    amountAtoms,
                    nonce = nonce,
                )
                if (hexSignedTx == null) {
                    promise.reject("SIGNING_ERROR", "Failed to build token transfer transaction")
                    return@execute
                }

                promise.resolve(WritableNativeMap().apply {
                    putString("signed_tx", hexSignedTx)
                })
            } catch (e: Exception) {
                Log.e(TAG, "Token transfer signing failed", e)
                promise.reject("IDENTITY_ERROR", "Failed to sign token transfer: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun signTokenBurnTransaction(params: ReadableMap, promise: Promise) {
        executor.execute {
            try {
                val tokenId = params.getString("tokenId") ?: ""
                val amountAtoms = parseAmountAtoms(params, "amount")
                    ?: run {
                        promise.reject(
                            "INVALID_PARAMS",
                            "amount must be a decimal u128 atoms string",
                        )
                        return@execute
                    }

                val identity = getLatestIdentity()
                if (identity == null) {
                    promise.reject("IDENTITY_ERROR", "No identity available for signing")
                    return@execute
                }

                val tokenIdBytes = hexToBytes(tokenId)
                Log.d(TAG, "Building token burn transaction: $tokenId atoms=$amountAtoms")

                val hexSignedTx = identity.buildTokenBurn(tokenIdBytes, amountAtoms)
                if (hexSignedTx == null) {
                    promise.reject("SIGNING_ERROR", "Failed to build token burn transaction")
                    return@execute
                }

                promise.resolve(WritableNativeMap().apply {
                    putString("signed_tx", hexSignedTx)
                })
            } catch (e: Exception) {
                Log.e(TAG, "Token burn signing failed", e)
                promise.reject("IDENTITY_ERROR", "Failed to sign token burn: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun signSovWalletTransferTransaction(params: ReadableMap, promise: Promise) {
        executor.execute {
            try {
                val fromWalletIdHex = params.getString("fromWalletId") ?: ""
                val toWalletIdHex = params.getString("toWalletId") ?: ""
                // amount is a decimal u128 atoms string — JS side MUST NOT
                // pass a JS Number here because 1000 SOV = 1e21 atoms would
                // lose precision. See src/services/TokenService.coerceAmountAtoms.
                val amountAtoms = parseAmountAtoms(params, "amount")
                    ?: run {
                        promise.reject(
                            "INVALID_PARAMS",
                            "amount must be a decimal u128 atoms string (no negatives, no fractions)",
                        )
                        return@execute
                    }
                val chainId = if (params.hasKey("chainId") && !params.isNull("chainId")) {
                    params.getInt("chainId")
                } else {
                    0x03
                }

                // Validate wallet IDs are 64 hex chars (32 bytes each)
                if (fromWalletIdHex.length != 64 || !fromWalletIdHex.matches(Regex("[0-9a-fA-F]+"))) {
                    promise.reject("INVALID_PARAMS", "fromWalletId must be 64 hex characters (32 bytes)")
                    return@execute
                }
                if (toWalletIdHex.length != 64 || !toWalletIdHex.matches(Regex("[0-9a-fA-F]+"))) {
                    promise.reject("INVALID_PARAMS", "toWalletId must be 64 hex characters (32 bytes)")
                    return@execute
                }

                val identity = getLatestIdentity()
                if (identity == null) {
                    promise.reject("IDENTITY_ERROR", "No identity available for signing")
                    return@execute
                }

                val fromWalletId = hexToBytes(fromWalletIdHex)
                val toWalletId = hexToBytes(toWalletIdHex)

                // Parse nonce from JS params (required)
                val nonceParam = params.getDouble("nonce")
                val nonce = nonceParam.toLong()

                // Trust the JS-provided fromWalletId. The caller has already
                // selected the wallet from /api/v1/wallet/list for this identity.
                //
                // Historically this code overrode fromWalletId with
                // blake3(current_dilithium_pk || current_kyber_pk) from the live
                // identity handle. That worked before key rotation existed, but
                // breaks after a chain re-registration / recovery: the balance
                // lives under the OLD wallet_id (pre-rotation), while the live
                // handle hashes to the NEW wallet_id. The override made the tx
                // carry data.from = new_wallet_id (balance = 0) and fail.
                //
                // The server's legacy validation path already handles this case:
                // Dilithium keys are seed-deterministic (unchanged by recovery),
                // so wallet_registry[old_wallet_id].dilithium_pk still matches
                // the signature's dilithium_pk, and the balance check uses the
                // funded wallet. See MEMORY.md "iOS ↔ Android Convergence".
                val liveWalletId = identity.getWalletId()
                if (liveWalletId != null) {
                    val liveWalletIdHex = liveWalletId.joinToString("") { "%02x".format(it) }
                    if (liveWalletIdHex != fromWalletIdHex) {
                        Log.i(
                            TAG,
                            "fromWalletId differs from live handle (likely post-rotation): " +
                                "js=$fromWalletIdHex, live=$liveWalletIdHex",
                        )
                    }
                }

                Log.d(TAG, "Building SOV wallet transfer: $fromWalletIdHex -> $toWalletIdHex atoms=$amountAtoms nonce=$nonce")

                val hexSignedTx = identity.buildSovWalletTransfer(
                    fromWalletId,
                    toWalletId,
                    amountAtoms,
                    chainId = chainId,
                    nonce = nonce,
                )
                if (hexSignedTx == null) {
                    promise.reject("SIGNING_ERROR", "Failed to build SOV wallet transfer transaction")
                    return@execute
                }

                promise.resolve(WritableNativeMap().apply {
                    putString("signed_tx", hexSignedTx)
                })
            } catch (e: Exception) {
                Log.e(TAG, "SOV wallet transfer signing failed", e)
                promise.reject("IDENTITY_ERROR", "Failed to sign SOV wallet transfer: ${e.message}", e)
            }
        }
    }

    /**
     * Sign a token transfer where the sender is an explicit wallet_id (e.g.
     * CBE). Mirrors signSovWalletTransferTransaction but carries a token_id.
     * The nonce MUST be fetched against (token_id, fromWalletId).
     */
    @ReactMethod
    fun signTokenWalletTransferTransaction(params: ReadableMap, promise: Promise) {
        executor.execute {
            try {
                val tokenIdHex = params.getString("tokenId") ?: ""
                val fromWalletIdHex = params.getString("fromWalletId") ?: ""
                val toWalletIdHex = params.getString("toWalletId") ?: ""
                val amountAtoms = parseAmountAtoms(params, "amount")
                    ?: run {
                        promise.reject(
                            "INVALID_PARAMS",
                            "amount must be a decimal u128 atoms string",
                        )
                        return@execute
                    }
                val chainId = if (params.hasKey("chainId") && !params.isNull("chainId")) {
                    params.getInt("chainId")
                } else {
                    0x03
                }

                if (tokenIdHex.length != 64 || !tokenIdHex.matches(Regex("[0-9a-fA-F]+"))) {
                    promise.reject("INVALID_PARAMS", "tokenId must be 64 hex characters (32 bytes)")
                    return@execute
                }
                if (fromWalletIdHex.length != 64 || !fromWalletIdHex.matches(Regex("[0-9a-fA-F]+"))) {
                    promise.reject("INVALID_PARAMS", "fromWalletId must be 64 hex characters (32 bytes)")
                    return@execute
                }
                if (toWalletIdHex.length != 64 || !toWalletIdHex.matches(Regex("[0-9a-fA-F]+"))) {
                    promise.reject("INVALID_PARAMS", "toWalletId must be 64 hex characters (32 bytes)")
                    return@execute
                }

                val identity = getLatestIdentity()
                if (identity == null) {
                    promise.reject("IDENTITY_ERROR", "No identity available for signing")
                    return@execute
                }

                val nonceParam = params.getDouble("nonce")
                val nonce = nonceParam.toLong()

                val tokenIdBytes = hexToBytes(tokenIdHex)
                val fromWalletIdBytes = hexToBytes(fromWalletIdHex)
                val toWalletIdBytes = hexToBytes(toWalletIdHex)

                Log.d(TAG, "Building token wallet transfer: token=$tokenIdHex from=$fromWalletIdHex to=$toWalletIdHex atoms=$amountAtoms nonce=$nonce")

                val hexSignedTx = identity.buildTokenWalletTransfer(
                    tokenIdBytes,
                    fromWalletIdBytes,
                    toWalletIdBytes,
                    amountAtoms,
                    chainId = chainId,
                    nonce = nonce,
                )
                if (hexSignedTx == null) {
                    promise.reject("SIGNING_ERROR", "Failed to build token wallet transfer transaction")
                    return@execute
                }

                promise.resolve(WritableNativeMap().apply {
                    putString("signed_tx", hexSignedTx)
                })
            } catch (e: Exception) {
                Log.e(TAG, "Token wallet transfer signing failed", e)
                promise.reject("IDENTITY_ERROR", "Failed to sign token wallet transfer: ${e.message}", e)
            }
        }
    }

    /**
     * Sign a DAO stake transaction. Moves SOV from the caller's identity wallet
     * into a sector welfare DAO wallet, locked for lockBlocks.
     * Params: { sectorDaoKeyId (64 hex), amount, nonce, lockBlocks, chainId? }
     */
    @ReactMethod
    fun signDaoStakeTransaction(params: ReadableMap, promise: Promise) {
        executor.execute {
            try {
                val sectorDaoKeyIdHex = params.getString("sectorDaoKeyId") ?: ""
                val amountAtoms = parseAmountAtoms(params, "amount")
                    ?: run {
                        promise.reject(
                            "INVALID_PARAMS",
                            "amount must be a decimal u128 atoms string",
                        )
                        return@execute
                    }
                val lockBlocks = parseAmount(params, "lockBlocks")
                    ?: run {
                        promise.reject("INVALID_PARAMS", "lockBlocks must be a valid integer string or number")
                        return@execute
                    }
                val nonce = parseAmount(params, "nonce")
                    ?: run {
                        promise.reject("INVALID_PARAMS", "nonce must be a valid integer string or number")
                        return@execute
                    }
                val chainId = if (params.hasKey("chainId") && !params.isNull("chainId")) {
                    params.getInt("chainId")
                } else {
                    0x03
                }

                if (sectorDaoKeyIdHex.length != 64 || !sectorDaoKeyIdHex.matches(Regex("[0-9a-fA-F]+"))) {
                    promise.reject("INVALID_PARAMS", "sectorDaoKeyId must be 64 hex characters (32 bytes)")
                    return@execute
                }

                val identity = getLatestIdentity()
                if (identity == null) {
                    promise.reject("IDENTITY_ERROR", "No identity available for signing")
                    return@execute
                }

                val daoKeyIdBytes = hexToBytes(sectorDaoKeyIdHex)

                Log.d(
                    TAG,
                    "Building DAO stake: dao=$sectorDaoKeyIdHex atoms=$amountAtoms nonce=$nonce lockBlocks=$lockBlocks chainId=$chainId",
                )

                val hexSignedTx = identity.buildDaoStake(
                    sectorDaoKeyId = daoKeyIdBytes,
                    amountAtoms = amountAtoms,
                    nonce = nonce,
                    lockBlocks = lockBlocks,
                    chainId = chainId,
                )
                if (hexSignedTx == null) {
                    promise.reject("SIGNING_ERROR", "Failed to build DAO stake transaction")
                    return@execute
                }

                promise.resolve(WritableNativeMap().apply {
                    putString("signed_tx", hexSignedTx)
                })
            } catch (e: Exception) {
                Log.e(TAG, "DAO stake signing failed", e)
                promise.reject("IDENTITY_ERROR", "Failed to sign DAO stake: ${e.message}", e)
            }
        }
    }

    // ─── Fee config ───

    @ReactMethod
    fun setFeeConfig(configJson: String, promise: Promise) {
        executor.execute {
            try {
                val result = Identity.setFeeConfig(configJson)
                if (result != null) {
                    Log.d(TAG, "Fee config set: updatedAt=${result.first} chainHeight=${result.second}")
                    val map = WritableNativeMap().apply {
                        putBoolean("ok", true)
                        putDouble("updatedAt", result.first.toDouble())
                        putDouble("chainHeight", result.second.toDouble())
                    }
                    promise.resolve(map)
                } else {
                    promise.reject("FEE_CONFIG_ERROR", "Rust returned error for fee config")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to set fee config", e)
                promise.reject("FEE_CONFIG_ERROR", "Failed to set fee config: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun quoteFeeForTxHex(txHex: String, promise: Promise) {
        executor.execute {
            try {
                val fee = Identity.quoteFeeForTxHex(txHex)
                promise.resolve(fee.toDouble())
            } catch (e: Exception) {
                Log.e(TAG, "Failed to quote fee", e)
                promise.reject("FEE_QUOTE_ERROR", "Failed to quote fee: ${e.message}", e)
            }
        }
    }

    // ─── Domain transaction signing ───

    @ReactMethod
    fun signDomainRegisterRequest(params: ReadableMap, promise: Promise) {
        executor.execute {
            try {
                val domain = params.getString("domain") ?: ""
                val contentMappingsJson = params.getString("contentMappingsJson")

                if (domain.isEmpty()) {
                    promise.reject("INVALID_PARAMS", "domain parameter is required")
                    return@execute
                }

                val identity = getLatestIdentity()
                if (identity == null) {
                    promise.reject("IDENTITY_ERROR", "No identity available for signing")
                    return@execute
                }

                Log.d(TAG, "Building domain register request: $domain")

                val requestJson = identity.buildDomainRegisterRequest(domain, contentMappingsJson)
                if (requestJson == null) {
                    promise.reject("SIGNING_ERROR", "Failed to build domain registration request")
                    return@execute
                }

                promise.resolve(WritableNativeMap().apply {
                    putString("request_json", requestJson)
                })
            } catch (e: Exception) {
                Log.e(TAG, "Domain registration request failed", e)
                promise.reject("IDENTITY_ERROR", "Failed to build domain registration request: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun signDomainUpdateRequest(params: ReadableMap, promise: Promise) {
        executor.execute {
            try {
                val domain = params.getString("domain") ?: ""
                val newManifestCid = params.getString("newManifestCid") ?: ""
                val expectedPreviousManifestCid = params.getString("expectedPreviousManifestCid") ?: ""

                if (domain.isEmpty()) {
                    promise.reject("INVALID_PARAMS", "domain parameter is required")
                    return@execute
                }
                if (newManifestCid.isEmpty()) {
                    promise.reject("INVALID_PARAMS", "newManifestCid parameter is required")
                    return@execute
                }

                val identity = getLatestIdentity()
                if (identity == null) {
                    promise.reject("IDENTITY_ERROR", "No identity available for signing")
                    return@execute
                }

                Log.d(TAG, "Building domain update request: $domain")

                val requestJson = identity.buildDomainUpdateRequest(domain, newManifestCid, expectedPreviousManifestCid)
                if (requestJson == null) {
                    promise.reject("SIGNING_ERROR", "Failed to build domain update request")
                    return@execute
                }

                promise.resolve(WritableNativeMap().apply {
                    putString("request_json", requestJson)
                })
            } catch (e: Exception) {
                Log.e(TAG, "Domain update request failed", e)
                promise.reject("IDENTITY_ERROR", "Failed to build domain update request: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun signDomainTransferRequest(params: ReadableMap, promise: Promise) {
        executor.execute {
            try {
                val domain = params.getString("domain") ?: ""
                val toOwnerDid = params.getString("toOwnerDid") ?: ""

                if (domain.isEmpty()) {
                    promise.reject("INVALID_PARAMS", "domain parameter is required")
                    return@execute
                }
                if (toOwnerDid.isEmpty()) {
                    promise.reject("INVALID_PARAMS", "toOwnerDid parameter is required")
                    return@execute
                }

                val identity = getLatestIdentity()
                if (identity == null) {
                    promise.reject("IDENTITY_ERROR", "No identity available for signing")
                    return@execute
                }

                Log.d(TAG, "Building domain transfer request: $domain -> $toOwnerDid")

                val requestJson = identity.buildDomainTransferRequest(domain, toOwnerDid)
                if (requestJson == null) {
                    promise.reject("SIGNING_ERROR", "Failed to build domain transfer request")
                    return@execute
                }

                promise.resolve(WritableNativeMap().apply {
                    putString("request_json", requestJson)
                })
            } catch (e: Exception) {
                Log.e(TAG, "Domain transfer request failed", e)
                promise.reject("IDENTITY_ERROR", "Failed to build domain transfer request: ${e.message}", e)
            }
        }
    }

    // ─── Kyber key publish / rotate ───

    @ReactMethod
    fun buildKyberKeyUpdate(timestamp: Double, promise: Promise) {
        executor.execute {
            try {
                val identity = getLatestIdentity()
                if (identity == null) {
                    promise.reject("NO_IDENTITY", "No active identity for kyber key update")
                    return@execute
                }
                // RN bridges numeric args as Double; convert to Long (u64 on the
                // Rust side). Realistic timestamps fit comfortably in 53-bit
                // float precision until ~year 287396, so the cast is lossless.
                val body = identity.buildKyberKeyUpdate(timestamp.toLong())
                if (body.isNullOrEmpty()) {
                    promise.reject("BUILD_ERROR", "Failed to build kyber key update")
                    return@execute
                }
                promise.resolve(WritableNativeMap().apply { putString("body", body) })
            } catch (e: Exception) {
                Log.e(TAG, "buildKyberKeyUpdate failed", e)
                promise.reject("BUILD_ERROR", "Failed to build kyber key update: ${e.message}", e)
            }
        }
    }

    // ─── Message signing ───

    @ReactMethod
    fun signMessage(message: String, promise: Promise) {
        executor.execute {
            try {
                val identity = getLatestIdentity()
                if (identity == null) {
                    promise.reject("IDENTITY_ERROR", "No identity available for signing")
                    return@execute
                }

                val signature = identity.signMessage(message.toByteArray(Charsets.UTF_8))
                if (signature == null) {
                    promise.reject("SIGNING_ERROR", "Message signing failed")
                    return@execute
                }

                val hex = signature.joinToString("") { "%02x".format(it) }
                promise.resolve(WritableNativeMap().apply {
                    putString("signature", hex)
                })
            } catch (e: Exception) {
                Log.e(TAG, "Message signing failed", e)
                promise.reject("SIGNING_ERROR", "Failed to sign message: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun signMessageForDid(did: String, message: String, promise: Promise) {
        executor.execute {
            try {
                val identity = cachedIdentities[did]
                if (identity == null) {
                    promise.reject("NO_IDENTITY", "Cached identity not found for DID")
                    return@execute
                }

                val signature = identity.signMessage(message.toByteArray(Charsets.UTF_8))
                if (signature == null) {
                    promise.reject("SIGNING_ERROR", "Message signing failed")
                    return@execute
                }

                val hex = signature.joinToString("") { "%02x".format(it) }
                promise.resolve(WritableNativeMap().apply {
                    putString("signature", hex)
                })
            } catch (e: Exception) {
                Log.e(TAG, "Message signing failed for DID", e)
                promise.reject("SIGNING_ERROR", "Failed to sign message for DID: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun signMessageFromSeed(phrase: String, message: String, promise: Promise) {
        executor.execute {
            try {
                val deviceId = getDeviceId()
                val identity = Identity.restoreFromPhrase(phrase, deviceId)
                if (identity == null) {
                    promise.reject("IDENTITY_ERROR", "Identity restore failed")
                    return@execute
                }

                identity.use { id ->
                    val signature = id.signMessage(message.toByteArray(Charsets.UTF_8))
                    if (signature == null) {
                        promise.reject("SIGNING_ERROR", "Message signing failed")
                        return@execute
                    }

                    val hex = signature.joinToString("") { "%02x".format(it) }
                    promise.resolve(WritableNativeMap().apply {
                        putString("signature", hex)
                    })
                }
            } catch (e: Exception) {
                Log.e(TAG, "Message signing failed from seed", e)
                promise.reject("SIGNING_ERROR", "Failed to sign message from seed: ${e.message}", e)
            }
        }
    }

    // ─── Keystore export ───

    @ReactMethod
    fun exportKeystoreBase64(did: String, promise: Promise) {
        executor.execute {
            try {
                val trimmed = did.trim()
                if (trimmed.isEmpty()) {
                    promise.reject("IDENTITY_ERROR", "Missing identity id or DID")
                    return@execute
                }

                val normalized = normalizeIdentityId(trimmed)
                val prefixedDid = if (trimmed.startsWith("did:zhtp:")) trimmed else "did:zhtp:$normalized"

                val identity = cachedIdentities[trimmed]
                    ?: cachedIdentities[prefixedDid]
                    ?: cachedIdentities[normalized]
                    ?: getLatestIdentity()
                if (identity == null) {
                    promise.reject("IDENTITY_ERROR", "Identity not found for DID")
                    return@execute
                }

                val matchesQuery = identity.did == trimmed ||
                    identity.did == prefixedDid ||
                    identity.did.endsWith(normalized)
                if (!matchesQuery) {
                    promise.reject("IDENTITY_ERROR", "Identity not found for DID")
                    return@execute
                }

                val base64 = identity.exportKeystoreBase64()
                if (base64.isNullOrBlank()) {
                    promise.reject("IDENTITY_ERROR", "Failed to export keystore as base64")
                    return@execute
                }

                promise.resolve(base64)
            } catch (e: Exception) {
                Log.e(TAG, "Export keystore base64 failed", e)
                promise.reject("IDENTITY_ERROR", "Failed to export keystore: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun createBackupFile(fileName: String, content: String, promise: Promise) {
        executor.execute {
            try {
                val safeFileName = fileName
                    .replace(Regex("[^A-Za-z0-9._-]"), "_")
                    .ifBlank { "sov-identity-backup.zkdid.json" }
                val downloadsRoot =
                    reactApplicationContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
                        ?: reactApplicationContext.cacheDir
                val backupDir = File(downloadsRoot, "backups")
                if (!backupDir.exists()) {
                    backupDir.mkdirs()
                }

                val file = File(backupDir, safeFileName)
                file.writeText(content, Charsets.UTF_8)

                promise.resolve(WritableNativeMap().apply {
                    putString("path", file.absolutePath)
                    putString("uri", Uri.fromFile(file).toString())
                    putString("fileName", safeFileName)
                })
            } catch (e: Exception) {
                Log.e(TAG, "Create backup file failed", e)
                promise.reject("BACKUP_FILE_ERROR", "Failed to create backup file: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun getCurrentIdentityDid(promise: Promise) {
        executor.execute {
            try {
                val identityId = IdentityStore.getCurrentIdentityId(reactApplicationContext)
                if (identityId.isNullOrEmpty()) {
                    promise.resolve(null)
                    return@execute
                }
                val identity = IdentityStore.loadIdentity(reactApplicationContext, identityId)
                if (identity == null) {
                    promise.resolve(null)
                    return@execute
                }
                identity.use { id ->
                    promise.resolve(id.did)
                }
            } catch (e: Exception) {
                Log.e(TAG, "getCurrentIdentityDid failed", e)
                promise.resolve(null)
            }
        }
    }

    @ReactMethod
    fun getPublicIdentity(promise: Promise) {
        executor.execute {
            try {
                val identity = getLatestIdentity()
                if (identity == null) {
                    promise.reject("NO_IDENTITY", "No active identity available")
                    return@execute
                }

                promise.resolve(WritableNativeMap().apply {
                    putString("did", identity.did)
                    putString("publicKey", b64(identity.publicKey))
                    putString("kyberPublicKey", b64(identity.kyberPublicKey))
                    putString("nodeId", b64(identity.nodeId))
                })
            } catch (e: Exception) {
                Log.e(TAG, "getPublicIdentity failed", e)
                promise.reject("IDENTITY_ERROR", "Failed to read public identity: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun signPouwReceipt(receiptJson: String, promise: Promise) {
        executor.execute {
            try {
                val identity = getLatestIdentity()
                if (identity == null) {
                    promise.reject("NO_IDENTITY", "No active identity for PoUW signing")
                    return@execute
                }

                val signature = identity.signPoUWReceiptJson(receiptJson)
                if (signature == null || signature.isEmpty()) {
                    promise.reject("SIGNING_ERROR", "PoUW receipt signing failed")
                    return@execute
                }

                promise.resolve(b64(signature))
            } catch (e: Exception) {
                Log.e(TAG, "signPouwReceipt failed", e)
                promise.reject("SIGNING_ERROR", "Failed to sign PoUW receipt: ${e.message}", e)
            }
        }
    }

    // ─── Helpers ───

    private fun getDeviceId(): String {
        val androidId = Settings.Secure.getString(
            reactApplicationContext.contentResolver,
            Settings.Secure.ANDROID_ID
        )
        return if (!androidId.isNullOrBlank()) androidId else UUID.randomUUID().toString()
    }

    private fun normalizeIdentityId(identityId: String): String {
        val trimmed = identityId.trim()
        return if (trimmed.startsWith("did:zhtp:")) {
            trimmed.removePrefix("did:zhtp:")
        } else {
            trimmed
        }
    }

    /**
     * Single point of access for the current signing identity.
     * Self-heals: if the in-memory cache is empty (e.g. after process restart),
     * auto-restores from IdentityStore (EncryptedSharedPreferences).
     */
    private fun getLatestIdentity(): Identity? {
        cachedIdentities.values.lastOrNull()?.let { return it }

        // Cache miss — auto-restore from persistent storage
        val identityId = IdentityStore.getCurrentIdentityId(reactApplicationContext) ?: return null
        val identity = IdentityStore.loadIdentity(reactApplicationContext, identityId) ?: return null
        Log.d(TAG, "Auto-restored identity from IdentityStore: ${identity.did}")
        cachedIdentities[identity.did] = identity
        return identity
    }

    private fun b64(data: ByteArray): String {
        return Base64.encodeToString(data, Base64.NO_WRAP)
    }

    private fun normalizeDidToAddress(did: String): String {
        val trimmed = did.trim()
        return if (trimmed.startsWith("did:zhtp:")) {
            trimmed.removePrefix("did:zhtp:")
        } else {
            trimmed
        }
    }

    private fun fetchTokenTransferNonce(tokenIdHex: String, senderAddress: String): Long {
        val host = com.sovereignnetworkmobile.config.GeneratedConfig.NODE_HOST
        val port = com.sovereignnetworkmobile.config.GeneratedConfig.NODE_PORT
        val path = "/api/v1/token/nonce/$tokenIdHex/$senderAddress"
        val url = "quic://$host:$port$path"

        val result = NativeQuicBridge.request(
            url = url,
            method = "GET",
            headersJson = "{}",
            body = "",
            timeoutSecs = 15,
            insecure = true,
            alpn = "public",
        ) ?: throw IllegalStateException("Nonce request returned null")

        val status = (result["status"] as? Number)?.toInt() ?: 0
        val body = result["body"] as? String ?: ""
        val error = result["error"] as? String
        if (status != 200) {
            throw IllegalStateException("Nonce request failed status=$status error=${error ?: "unknown"}")
        }

        val json = JSONObject(body)
        val nonce = extractNonce(json)
            ?: throw IllegalStateException("Nonce response missing nonce field")
        return nonce
    }

    private fun fetchSovTokenId(): String {
        val host = com.sovereignnetworkmobile.config.GeneratedConfig.NODE_HOST
        val port = com.sovereignnetworkmobile.config.GeneratedConfig.NODE_PORT
        val url = "quic://$host:$port/api/v1/token/list"

        val result = NativeQuicBridge.request(
            url = url,
            method = "GET",
            headersJson = "{}",
            body = "",
            timeoutSecs = 15,
            insecure = true,
            alpn = "public",
        ) ?: throw IllegalStateException("SOV token lookup returned null")

        val status = (result["status"] as? Number)?.toInt() ?: 0
        val body = result["body"] as? String ?: ""
        val error = result["error"] as? String
        if (status != 200) {
            throw IllegalStateException("SOV token lookup failed status=$status error=${error ?: "unknown"}")
        }

        val json = JSONObject(body)
        val tokens = json.optJSONArray("tokens")
            ?: throw IllegalStateException("Token list response missing tokens")

        for (i in 0 until tokens.length()) {
            val token = tokens.optJSONObject(i) ?: continue
            val symbol = token.optString("symbol", "")
            val tokenId = token.optString("token_id", "")
            if (symbol.equals("SOV", ignoreCase = true) && tokenId.length == 64) {
                return tokenId.lowercase()
            }
        }

        throw IllegalStateException("SOV token not found in token list")
    }

    private fun extractNonce(json: JSONObject): Long? {
        val keys = listOf("nonce", "next_nonce", "account_nonce")
        for (key in keys) {
            if (!json.has(key)) continue
            val value = json.opt(key) ?: continue
            when (value) {
                is Number -> return value.toLong()
                is String -> value.toLongOrNull()?.let { return it }
            }
        }
        val nestedKeys = listOf("data", "result")
        for (nested in nestedKeys) {
            val nestedObj = json.optJSONObject(nested) ?: continue
            extractNonce(nestedObj)?.let { return it }
        }
        return null
    }

    private fun hexToBytes(hex: String): ByteArray {
        return hex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
    }

    /** Parse an amount from ReadableMap — accepts both String and Number. */
    private fun parseAmount(params: ReadableMap, key: String): Long? {
        return try {
            when {
                params.hasKey(key) && params.getType(key).name == "String" -> {
                    val str = params.getString(key) ?: "0"
                    str.toLong()
                }
                else -> params.getDouble(key).toLong()
            }
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Parse an amount as a decimal u128 atoms STRING. Used for every token
     * amount passed to the signing bridge. Rejects fractions, negatives,
     * and any value above 2^128-1. Returns null on invalid input.
     *
     * This is the Android mirror of `coerceAmountAtoms` in TokenService.ts
     * and `parseU128Halves` in ZhtpClient.swift. Keep the three in sync.
     */
    private fun parseAmountAtoms(params: ReadableMap, key: String): String? {
        if (!params.hasKey(key) || params.isNull(key)) return null
        return try {
            val str = when (params.getType(key).name) {
                "String" -> params.getString(key)?.trim() ?: return null
                "Number" -> {
                    // Only accept numbers that round-trip to a non-negative
                    // integer and fit in the JS "safe integer" range. Anything
                    // larger must have been passed as a string — or the
                    // precision is already gone before we got here.
                    val d = params.getDouble(key)
                    if (d < 0.0 || d != Math.floor(d) || d > 9_007_199_254_740_992.0) {
                        return null
                    }
                    d.toLong().toString()
                }
                else -> return null
            }
            if (!str.matches(Regex("^\\d+$"))) return null
            val bi = java.math.BigInteger(str)
            val u128Max = java.math.BigInteger.ONE.shiftLeft(128).subtract(java.math.BigInteger.ONE)
            if (bi.signum() < 0 || bi > u128Max) return null
            str
        } catch (e: Exception) {
            null
        }
    }
}
