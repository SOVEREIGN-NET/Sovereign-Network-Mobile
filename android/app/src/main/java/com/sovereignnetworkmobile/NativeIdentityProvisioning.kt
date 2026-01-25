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
                val exists = IdentityStore.hasIdentity(reactApplicationContext, identityId)
                val response = WritableNativeMap().apply {
                    if (exists) {
                        putString("status", "restored")
                        putString("identity_id", identityId)
                    } else {
                        putString("status", "skipped")
                        putString("identity_id", identityId)
                        putString("reason", "serialized_identity_not_found")
                    }
                }
                promise.resolve(response)
            } catch (e: Exception) {
                Log.e(TAG, "Restore identity failed", e)
                val response = WritableNativeMap().apply {
                    putString("status", "skipped")
                    putString("identity_id", identityId)
                    putString("reason", "deserialization_failed")
                    putString("error", e.message ?: "unknown")
                }
                promise.resolve(response)
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

    private fun b64(data: ByteArray): String {
        return Base64.encodeToString(data, Base64.NO_WRAP)
    }

    // Native methods (implemented in Rust via JNI)
    private external fun nativeGenerateIdentity(deviceId: String): Any?
    private external fun nativeSignRegistrationProof(identityJson: String, timestamp: Long): Any?
}
