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

/**
 * React Native bridge for identity provisioning.
 * Uses opaque Identity handles — secret keys never leave Rust memory.
 */
class NativeIdentityProvisioning(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "NativeIdentityProvisioning"
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
                val initialSupply = parseAmount(params, "initialSupply")
                    ?: run {
                        promise.reject("INVALID_PARAMS", "initialSupply must be a valid integer string or number")
                        return@execute
                    }
                val decimals = params.getInt("decimals")

                val identity = getLatestIdentity()
                if (identity == null) {
                    promise.reject("IDENTITY_ERROR", "No identity available for signing")
                    return@execute
                }

                Log.d(TAG, "Building token create transaction: $name/$symbol with supply=$initialSupply")

                val hexSignedTx = identity.buildTokenCreate(name, symbol, initialSupply, decimals)
                if (hexSignedTx == null) {
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
                val amount = parseAmount(params, "amount")
                    ?: run {
                        promise.reject("INVALID_PARAMS", "amount must be a valid integer string or number")
                        return@execute
                    }

                val identity = getLatestIdentity()
                if (identity == null) {
                    promise.reject("IDENTITY_ERROR", "No identity available for signing")
                    return@execute
                }

                val tokenIdBytes = hexToBytes(tokenId)
                val recipientBytes = hexToBytes(recipientDid)

                Log.d(TAG, "Building token mint transaction: $tokenId -> $recipientDid")

                val hexSignedTx = identity.buildTokenMint(tokenIdBytes, recipientBytes, amount)
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
                val amount = parseAmount(params, "amount")
                    ?: run {
                        promise.reject("INVALID_PARAMS", "amount must be a valid integer string or number")
                        return@execute
                    }

                val identity = getLatestIdentity()
                if (identity == null) {
                    promise.reject("IDENTITY_ERROR", "No identity available for signing")
                    return@execute
                }

                val tokenIdBytes = hexToBytes(tokenId)
                val toAddressBytes = hexToBytes(toAddress)

                Log.d(TAG, "Building token transfer transaction: $tokenId -> $toAddress")

                val hexSignedTx = identity.buildTokenTransfer(tokenIdBytes, toAddressBytes, amount)
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
                val identity = cachedIdentities[did]
                if (identity == null) {
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

    private fun hexToBytes(hex: String): ByteArray {
        return hex.chunked(2).mapNotNull { it.toByteOrNull(16) }.toByteArray()
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
}
