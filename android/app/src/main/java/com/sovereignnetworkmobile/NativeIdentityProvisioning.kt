package com.sovereignnetworkmobile

import android.provider.Settings
import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableNativeMap
import java.util.UUID
import java.util.concurrent.Executor
import java.util.concurrent.Executors

class NativeIdentityProvisioning(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "NativeIdentityProvisioning"
        init {
            try {
                System.loadLibrary("quic_jni")
            } catch (e: UnsatisfiedLinkError) {
                Log.e(TAG, "Failed to load native library", e)
            }
        }
    }

    private val executor: Executor = Executors.newCachedThreadPool()
    private val cachedIdentities: MutableMap<String, CachedIdentity> = mutableMapOf()

    override fun getName() = "NativeIdentityProvisioning"

    @ReactMethod
    fun generateLocalIdentity(displayName: String, promise: Promise) {
        executor.execute {
            try {
                val deviceId = getDeviceId()
                val result = nativeGenerateIdentity(deviceId) as? Map<*, *>
                if (result == null || result["ok"] != true) {
                    val error = result?.get("error")?.toString() ?: "Identity generation failed"
                    promise.reject("IDENTITY_ERROR", error)
                    return@execute
                }

                val did = result["did"] as? String ?: ""
                val publicKey = result["publicKey"] as? ByteArray ?: ByteArray(0)
                val kyberPublicKey = result["kyberPublicKey"] as? ByteArray ?: ByteArray(0)
                val nodeId = result["nodeId"] as? ByteArray ?: ByteArray(0)
                val createdAt = (result["createdAt"] as? Number)?.toLong() ?: 0L
                val identityJson = result["identityJson"] as? String ?: ""
                val handshakeJson = result["handshakeJson"] as? String ?: ""
                val dilithiumSk = result["dilithiumSk"] as? ByteArray ?: ByteArray(0)
                val kyberSk = result["kyberSk"] as? ByteArray ?: ByteArray(0)
                val masterSeed = result["masterSeed"] as? ByteArray ?: ByteArray(0)

                val cached = CachedIdentity(
                    did = did,
                    deviceId = deviceId,
                    publicKey = publicKey,
                    kyberPublicKey = kyberPublicKey,
                    nodeId = nodeId,
                    createdAt = createdAt,
                    identityJson = identityJson,
                    handshakeJson = handshakeJson,
                    dilithiumSk = dilithiumSk,
                    kyberSk = kyberSk,
                    masterSeed = masterSeed
                )
                cachedIdentities[did] = cached
                val identityId = if (did.startsWith("did:zhtp:")) did.removePrefix("did:zhtp:") else did
                IdentityStore.storeIdentity(reactApplicationContext, identityId, cached)

                val response = WritableNativeMap().apply {
                    putString("status", "generated")
                    putString("did", did)
                    putString("deviceId", deviceId)
                    putString("publicDilithium", b64(publicKey))
                    putString("publicKyber", b64(kyberPublicKey))
                    putDouble("timestamp", createdAt.toDouble())
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
                val cached = cachedIdentities[did]
                if (cached == null) {
                    promise.reject("IDENTITY_ERROR", "Identity not found - call provisionIdentity first")
                    return@execute
                }

                val timestamp = System.currentTimeMillis() / 1000
                val signResult = nativeSignRegistrationProof(cached.identityJson, timestamp) as? Map<*, *>
                if (signResult == null || signResult["ok"] != true) {
                    val error = signResult?.get("error")?.toString() ?: "Registration proof failed"
                    promise.reject("IDENTITY_ERROR", error)
                    return@execute
                }

                val signature = signResult["signature"] as? ByteArray ?: ByteArray(0)

                val response = WritableNativeMap().apply {
                    putString("did", cached.did)
                    putString("public_key", b64(cached.publicKey))
                    putString("kyber_public_key", b64(cached.kyberPublicKey))
                    putString("node_id", b64(cached.nodeId))
                    putString("device_id", cached.deviceId)
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
                val cached = cachedIdentities[did]
                if (cached == null) {
                    promise.reject("IDENTITY_ERROR", "Cached identity not found")
                    return@execute
                }

                IdentityStore.storeIdentity(reactApplicationContext, identityId, cached)

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
                val materials = IdentityStore.loadIdentity(reactApplicationContext, identityId)
                val response = WritableNativeMap().apply {
                    if (materials != null) {
                        val validation = nativeValidateIdentityJson(materials.identityJson) as? Map<*, *>
                        val ok = validation?.get("ok") as? Boolean ?: false
                        if (!ok) {
                            putString("status", "skipped")
                            putString("identity_id", identityId)
                            putString("reason", "invalid_identity_json")
                            putString("error", validation?.get("error")?.toString() ?: "Invalid identity JSON")
                            return@apply
                        }

                        val cached = CachedIdentity(
                            did = materials.did,
                            deviceId = materials.deviceId,
                            publicKey = ByteArray(0),
                            kyberPublicKey = ByteArray(0),
                            nodeId = ByteArray(0),
                            createdAt = 0L,
                            identityJson = materials.identityJson,
                            handshakeJson = materials.handshakeJson,
                            dilithiumSk = materials.dilithiumSk,
                            kyberSk = materials.kyberSk,
                            masterSeed = materials.masterSeed
                        )
                        cachedIdentities[materials.did] = cached
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

                val materials = IdentityStore.loadIdentity(reactApplicationContext, normalized)
                if (materials == null) {
                    promise.resolve(WritableNativeMap().apply {
                        putString("status", "missing")
                        putString("reason", "identity_materials_not_found")
                    })
                    return@execute
                }

                var createdAt = 0.0
                var identityType: String? = null
                try {
                    val json = org.json.JSONObject(materials.identityJson)
                    if (json.has("created_at")) {
                        createdAt = json.optDouble("created_at", 0.0)
                    }
                    if (json.has("identity_type")) {
                        identityType = json.optString("identity_type", null)
                    }
                } catch (_: Exception) {
                }

                val response = WritableNativeMap().apply {
                    putString("status", "found")
                    putString("identity_id", normalized)
                    putString("did", materials.did)
                    putString("device_id", materials.deviceId)
                    if (createdAt > 0) putDouble("created_at", createdAt)
                    if (!identityType.isNullOrBlank()) putString("identity_type", identityType)
                }
                promise.resolve(response)
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
                val cached = cachedIdentities[did]
                if (cached == null) {
                    promise.reject("IDENTITY_ERROR", "Identity not found for seed phrase")
                    return@execute
                }

                val phrase = nativeGetSeedPhrase(cached.identityJson)
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
                val materials = IdentityStore.loadIdentity(reactApplicationContext, normalized)
                if (materials == null) {
                    promise.reject("IDENTITY_ERROR", "Identity not found in local store")
                    return@execute
                }

                val validation = nativeValidateIdentityJson(materials.identityJson) as? Map<*, *>
                val ok = validation?.get("ok") as? Boolean ?: false
                if (!ok) {
                    promise.reject(
                        "IDENTITY_ERROR",
                        validation?.get("error")?.toString() ?: "Invalid identity JSON"
                    )
                    return@execute
                }

                val phrase = nativeGetSeedPhrase(materials.identityJson)
                if (phrase.isNullOrBlank()) {
                    promise.reject("IDENTITY_ERROR", "Failed to get seed phrase")
                    return@execute
                }

                promise.resolve(phrase)
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
                val result = nativeRestoreIdentityFromPhrase(phrase, deviceId) as? Map<*, *>
                if (result == null || result["ok"] != true) {
                    val error = result?.get("error")?.toString() ?: "Identity restore failed"
                    promise.reject("IDENTITY_ERROR", error)
                    return@execute
                }

                val did = result["did"] as? String ?: ""
                val publicKey = result["publicKey"] as? ByteArray ?: ByteArray(0)
                val kyberPublicKey = result["kyberPublicKey"] as? ByteArray ?: ByteArray(0)
                val nodeId = result["nodeId"] as? ByteArray ?: ByteArray(0)
                val createdAt = (result["createdAt"] as? Number)?.toLong() ?: 0L
                val identityJson = result["identityJson"] as? String ?: ""
                val handshakeJson = result["handshakeJson"] as? String ?: ""
                val dilithiumSk = result["dilithiumSk"] as? ByteArray ?: ByteArray(0)
                val kyberSk = result["kyberSk"] as? ByteArray ?: ByteArray(0)
                val masterSeed = result["masterSeed"] as? ByteArray ?: ByteArray(0)

                val cached = CachedIdentity(
                    did = did,
                    deviceId = deviceId,
                    publicKey = publicKey,
                    kyberPublicKey = kyberPublicKey,
                    nodeId = nodeId,
                    createdAt = createdAt,
                    identityJson = identityJson,
                    handshakeJson = handshakeJson,
                    dilithiumSk = dilithiumSk,
                    kyberSk = kyberSk,
                    masterSeed = masterSeed
                )
                cachedIdentities[did] = cached

                val response = WritableNativeMap().apply {
                    putString("status", "restored")
                    putString("did", did)
                    putString("deviceId", deviceId)
                    putString("publicDilithium", b64(publicKey))
                    putString("publicKyber", b64(kyberPublicKey))
                    putDouble("createdAt", createdAt.toDouble())
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

    @ReactMethod
    fun signTokenCreateTransaction(params: ReadableMap, promise: Promise) {
        executor.execute {
            try {
                val name = params.getString("name") ?: ""
                val symbol = params.getString("symbol") ?: ""

                // Parse initialSupply - accept both String and Number
                // String is preferred to preserve exact value without float precision loss
                val initialSupply = try {
                    when {
                        params.hasKey("initialSupply") && params.getType("initialSupply").name == "String" -> {
                            val supplyStr = params.getString("initialSupply") ?: "0"
                            supplyStr.toLong()
                        }
                        else -> {
                            // Fall back to Double->Long conversion (less precise but still supported)
                            params.getDouble("initialSupply").toLong()
                        }
                    }
                } catch (e: Exception) {
                    promise.reject("INVALID_PARAMS", "initialSupply must be a valid integer string or number: ${e.message}")
                    return@execute
                }

                val decimals = params.getInt("decimals")

                val identity = getLatestIdentity()
                if (identity == null) {
                    promise.reject("IDENTITY_ERROR", "No identity available for signing")
                    return@execute
                }

                Log.d(TAG, "Building token create transaction: $name/$symbol with supply=$initialSupply")

                // Use lib-client JNI to build and sign the full transaction
                // JNI handles: bincode serialization, signing, Transaction wrapping, hex encoding
                val hexSignedTx = nativeBuildTokenCreate(
                    identity.identityJson,
                    name,
                    symbol,
                    initialSupply,
                    decimals,
                    0x02  // testnet
                )

                if (hexSignedTx == null) {
                    promise.reject("SIGNING_ERROR", "Failed to build token creation transaction")
                    return@execute
                }

                val response = WritableNativeMap().apply {
                    putString("signed_tx", hexSignedTx)
                }
                promise.resolve(response)
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

                // Parse amount - accept both String and Number
                // String is preferred to preserve exact value without float precision loss
                val amount = try {
                    when {
                        params.hasKey("amount") && params.getType("amount").name == "String" -> {
                            val amountStr = params.getString("amount") ?: "0"
                            amountStr.toLong()
                        }
                        else -> {
                            // Fall back to Double->Long conversion (less precise but still supported)
                            params.getDouble("amount").toLong()
                        }
                    }
                } catch (e: Exception) {
                    promise.reject("INVALID_PARAMS", "amount must be a valid integer string or number: ${e.message}")
                    return@execute
                }

                val identity = getLatestIdentity()
                if (identity == null) {
                    promise.reject("IDENTITY_ERROR", "No identity available for signing")
                    return@execute
                }

                // Parse token ID and recipient from hex strings
                val tokenIdBytes = tokenId.chunked(2).mapNotNull { it.toByteOrNull(16) }.toByteArray()
                val recipientBytes = recipientDid.chunked(2).mapNotNull { it.toByteOrNull(16) }.toByteArray()

                Log.d(TAG, "Building token mint transaction: $tokenId -> $recipientDid")

                // Use lib-client JNI to build and sign the full transaction
                val hexSignedTx = nativeBuildTokenMint(
                    identity.identityJson,
                    tokenIdBytes,
                    recipientBytes,
                    amount,
                    0x02  // testnet
                )

                if (hexSignedTx == null) {
                    promise.reject("SIGNING_ERROR", "Failed to build token mint transaction")
                    return@execute
                }

                val response = WritableNativeMap().apply {
                    putString("signed_tx", hexSignedTx)
                }
                promise.resolve(response)
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

                // Parse amount - accept both String and Number
                // String is preferred to preserve exact value without float precision loss
                val amount = try {
                    when {
                        params.hasKey("amount") && params.getType("amount").name == "String" -> {
                            val amountStr = params.getString("amount") ?: "0"
                            amountStr.toLong()
                        }
                        else -> {
                            // Fall back to Double->Long conversion (less precise but still supported)
                            params.getDouble("amount").toLong()
                        }
                    }
                } catch (e: Exception) {
                    promise.reject("INVALID_PARAMS", "amount must be a valid integer string or number: ${e.message}")
                    return@execute
                }

                val identity = getLatestIdentity()
                if (identity == null) {
                    promise.reject("IDENTITY_ERROR", "No identity available for signing")
                    return@execute
                }

                // Parse token ID and recipient from hex strings
                val tokenIdBytes = tokenId.chunked(2).mapNotNull { it.toByteOrNull(16) }.toByteArray()
                val toAddressBytes = toAddress.chunked(2).mapNotNull { it.toByteOrNull(16) }.toByteArray()

                Log.d(TAG, "Building token transfer transaction: $tokenId -> $toAddress")

                // Use lib-client JNI to build and sign the full transaction
                val hexSignedTx = nativeBuildTokenTransfer(
                    identity.identityJson,
                    tokenIdBytes,
                    toAddressBytes,
                    amount,
                    0x02  // testnet
                )

                if (hexSignedTx == null) {
                    promise.reject("SIGNING_ERROR", "Failed to build token transfer transaction")
                    return@execute
                }

                val response = WritableNativeMap().apply {
                    putString("signed_tx", hexSignedTx)
                }
                promise.resolve(response)
            } catch (e: Exception) {
                Log.e(TAG, "Token transfer signing failed", e)
                promise.reject("IDENTITY_ERROR", "Failed to sign token transfer: ${e.message}", e)
            }
        }
    }

    private fun getLatestIdentity(): CachedIdentity? {
        return cachedIdentities.values.lastOrNull()
    }

    private fun b64(data: ByteArray): String {
        return Base64.encodeToString(data, Base64.NO_WRAP)
    }

    // Native methods (implemented in Rust via JNI)
    private external fun nativeGenerateIdentity(deviceId: String): Any?
    private external fun nativeSignRegistrationProof(identityJson: String, timestamp: Long): Any?
    private external fun nativeSignMessage(identityJson: String, messageData: ByteArray): Any?
    private external fun nativeGetSeedPhrase(identityJson: String): String?
    private external fun nativeRestoreIdentityFromPhrase(phrase: String, deviceId: String): Any?
    private external fun nativeValidateIdentityJson(identityJson: String): Any?

    // Token transaction building (returns hex-encoded signed transaction)
    private external fun nativeBuildTokenCreate(
        identityJson: String,
        name: String,
        symbol: String,
        initialSupply: Long,
        decimals: Int,
        chainId: Int
    ): String?

    private external fun nativeBuildTokenMint(
        identityJson: String,
        tokenId: ByteArray,
        toPubkey: ByteArray,
        amount: Long,
        chainId: Int
    ): String?

    private external fun nativeBuildTokenTransfer(
        identityJson: String,
        tokenId: ByteArray,
        toPubkey: ByteArray,
        amount: Long,
        chainId: Int
    ): String?

    private external fun nativeBuildTokenBurn(
        identityJson: String,
        tokenId: ByteArray,
        amount: Long,
        chainId: Int
    ): String?

    // Domain transaction building (returns hex-encoded signed transaction)
    private external fun nativeBuildDomainRegister(
        identityJson: String,
        domain: String,
        contentCid: String?,
        chainId: Int
    ): String?

    private external fun nativeBuildDomainUpdate(
        identityJson: String,
        domain: String,
        contentCid: String,
        chainId: Int
    ): String?

    private external fun nativeBuildDomainTransfer(
        identityJson: String,
        domain: String,
        toPubkeyJson: String,
        chainId: Int
    ): String?

    @ReactMethod
    fun signDomainRegisterTransaction(params: ReadableMap, promise: Promise) {
        executor.execute {
            try {
                val domain = params.getString("domain") ?: ""
                val contentCid = params.getString("contentCid")

                if (domain.isEmpty()) {
                    promise.reject("INVALID_PARAMS", "domain parameter is required")
                    return@execute
                }

                val identity = getLatestIdentity()
                if (identity == null) {
                    promise.reject("IDENTITY_ERROR", "No identity available for signing")
                    return@execute
                }

                Log.d(TAG, "Building domain register transaction: $domain")

                // Use lib-client JNI to build and sign the full transaction
                val hexSignedTx = nativeBuildDomainRegister(
                    identity.identityJson,
                    domain,
                    contentCid,
                    0x02  // testnet
                )

                if (hexSignedTx == null) {
                    promise.reject("SIGNING_ERROR", "Failed to build domain registration transaction")
                    return@execute
                }

                val response = WritableNativeMap().apply {
                    putString("signed_tx", hexSignedTx)
                }
                promise.resolve(response)
            } catch (e: Exception) {
                Log.e(TAG, "Domain registration signing failed", e)
                promise.reject("IDENTITY_ERROR", "Failed to sign domain registration: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun signMessage(message: String, promise: Promise) {
        executor.execute {
            try {
                val identity = getLatestIdentity()
                if (identity == null) {
                    promise.reject("IDENTITY_ERROR", "No identity available for signing")
                    return@execute
                }

                val result = nativeSignMessage(identity.identityJson, message.toByteArray(Charsets.UTF_8)) as? Map<*, *>
                if (result == null || result["ok"] != true) {
                    val error = result?.get("error")?.toString() ?: "Message signing failed"
                    promise.reject("SIGNING_ERROR", error)
                    return@execute
                }

                val signature = result["signature"] as? ByteArray ?: ByteArray(0)
                val hex = signature.joinToString("") { "%02x".format(it) }
                val response = WritableNativeMap().apply {
                    putString("signature", hex)
                }
                promise.resolve(response)
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

                val result = nativeSignMessage(identity.identityJson, message.toByteArray(Charsets.UTF_8)) as? Map<*, *>
                if (result == null || result["ok"] != true) {
                    val error = result?.get("error")?.toString() ?: "Message signing failed"
                    promise.reject("SIGNING_ERROR", error)
                    return@execute
                }

                val signature = result["signature"] as? ByteArray ?: ByteArray(0)
                val hex = signature.joinToString("") { "%02x".format(it) }
                val response = WritableNativeMap().apply {
                    putString("signature", hex)
                }
                promise.resolve(response)
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
                val result = nativeRestoreIdentityFromPhrase(phrase, deviceId) as? Map<*, *>
                if (result == null || result["ok"] != true) {
                    val error = result?.get("error")?.toString() ?: "Identity restore failed"
                    promise.reject("IDENTITY_ERROR", error)
                    return@execute
                }

                val identityJson = result["identityJson"] as? String ?: ""
                if (identityJson.isEmpty()) {
                    promise.reject("IDENTITY_ERROR", "Missing identity JSON for signing")
                    return@execute
                }

                val signResult = nativeSignMessage(identityJson, message.toByteArray(Charsets.UTF_8)) as? Map<*, *>
                if (signResult == null || signResult["ok"] != true) {
                    val error = signResult?.get("error")?.toString() ?: "Message signing failed"
                    promise.reject("SIGNING_ERROR", error)
                    return@execute
                }

                val signature = signResult["signature"] as? ByteArray ?: ByteArray(0)
                val hex = signature.joinToString("") { "%02x".format(it) }
                val response = WritableNativeMap().apply {
                    putString("signature", hex)
                }
                promise.resolve(response)
            } catch (e: Exception) {
                Log.e(TAG, "Message signing failed from seed", e)
                promise.reject("SIGNING_ERROR", "Failed to sign message from seed: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun signDomainUpdateTransaction(params: ReadableMap, promise: Promise) {
        executor.execute {
            try {
                val domain = params.getString("domain") ?: ""
                val contentCid = params.getString("contentCid") ?: ""

                if (domain.isEmpty()) {
                    promise.reject("INVALID_PARAMS", "domain parameter is required")
                    return@execute
                }

                if (contentCid.isEmpty()) {
                    promise.reject("INVALID_PARAMS", "contentCid parameter is required")
                    return@execute
                }

                val identity = getLatestIdentity()
                if (identity == null) {
                    promise.reject("IDENTITY_ERROR", "No identity available for signing")
                    return@execute
                }

                Log.d(TAG, "Building domain update transaction: $domain")

                // Use lib-client JNI to build and sign the full transaction
                val hexSignedTx = nativeBuildDomainUpdate(
                    identity.identityJson,
                    domain,
                    contentCid,
                    0x02  // testnet
                )

                if (hexSignedTx == null) {
                    promise.reject("SIGNING_ERROR", "Failed to build domain update transaction")
                    return@execute
                }

                val response = WritableNativeMap().apply {
                    putString("signed_tx", hexSignedTx)
                }
                promise.resolve(response)
            } catch (e: Exception) {
                Log.e(TAG, "Domain update signing failed", e)
                promise.reject("IDENTITY_ERROR", "Failed to sign domain update: ${e.message}", e)
            }
        }
    }
}
