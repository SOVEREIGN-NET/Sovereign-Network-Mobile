package com.sovereignnetworkmobile

import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.*
import com.sovereignnetworkmobile.pouw.PoUWController
import com.sovereignnetworkmobile.pouw.model.PoUWError
import kotlinx.coroutines.*

/**
 * React Native Bridge for PoUW (Proof-of-Useful-Work)
 * Phase 4: React Native Bridge
 *
 * STRICT BOUNDARY ENFORCEMENT:
 * - RN never passes URLs
 * - RN never sees keys
 * - RN never sees receipts or signatures
 * - RN never serializes protobuf
 * - RN never performs cryptography
 *
 * RN is a button + lifecycle trigger, nothing more.
 *
 * TODO: Integrate with initialized PoUWController from MainApplication
 * The controller should be provided via dependency injection or singleton access
 */
class PoUWModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "PoUWModule"
    }

    override fun getName() = "PoUW"

    /**
     * Coroutine scope for async operations
     */
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    /**
     * Lazy initialization of PoUWController
     * TODO: Replace with proper dependency injection from MainApplication
     */
    private val controller: PoUWController? by lazy {
        PoUWController.getInstance()
    }

    /**
     * Verify content integrity and create a receipt
     *
     * @param contentId Base64-encoded content identifier (CID digest)
     * @param bytes Base64-encoded content bytes
     * @param providerId Optional base64-encoded provider identifier
     * @param promise Promise to resolve/reject
     */
    @ReactMethod
    fun verifyContent(
        contentId: String,
        bytes: String,
        providerId: String?,
        promise: Promise
    ) {
        val ctrl = controller
        if (ctrl == null) {
            promise.reject("CONTROLLER_NOT_INITIALIZED", "PoUWController not initialized")
            return
        }

        scope.launch {
            try {
                // Decode base64 inputs
                val contentIdBytes = try {
                    Base64.decode(contentId, Base64.NO_WRAP)
                } catch (e: IllegalArgumentException) {
                    promise.reject("INVALID_CONTENT_ID", "Failed to decode contentId from base64: ${e.message}")
                    return@launch
                }

                val bytesData = try {
                    Base64.decode(bytes, Base64.NO_WRAP)
                } catch (e: IllegalArgumentException) {
                    promise.reject("INVALID_BYTES", "Failed to decode bytes from base64: ${e.message}")
                    return@launch
                }

                val providerIdBytes = providerId?.let {
                    try {
                        Base64.decode(it, Base64.NO_WRAP)
                    } catch (e: IllegalArgumentException) {
                        promise.reject("INVALID_PROVIDER_ID", "Failed to decode providerId from base64: ${e.message}")
                        return@launch
                    }
                }

                // Call controller to submit content
                // Note: Android's submitContent combines verification and recording
                ctrl.submitContent(bytesData, contentIdBytes)

                promise.resolve(null)
            } catch (e: PoUWError) {
                val (code, message) = mapPoUWError(e)
                promise.reject(code, message)
            } catch (e: Exception) {
                Log.e(TAG, "Verification error", e)
                promise.reject("VERIFICATION_ERROR", e.message, e)
            }
        }
    }

    /**
     * Flush pending receipts to the server
     *
     * @param promise Promise to resolve/reject
     */
    @ReactMethod
    fun flush(promise: Promise) {
        val ctrl = controller
        if (ctrl == null) {
            promise.reject("CONTROLLER_NOT_INITIALIZED", "PoUWController not initialized")
            return
        }

        scope.launch {
            try {
                ctrl.flushPending()
                promise.resolve(null)
            } catch (e: PoUWError) {
                val (code, message) = mapPoUWError(e)
                promise.reject(code, message)
            } catch (e: Exception) {
                Log.e(TAG, "Flush error", e)
                promise.reject("FLUSH_ERROR", e.message, e)
            }
        }
    }

    /**
     * Get the count of pending receipts
     *
     * @param promise Promise to resolve with count
     */
    @ReactMethod
    fun getPendingCount(promise: Promise) {
        val ctrl = controller
        if (ctrl == null) {
            promise.reject("CONTROLLER_NOT_INITIALIZED", "PoUWController not initialized")
            return
        }

        scope.launch {
            try {
                val count = ctrl.getPendingCount()
                promise.resolve(count)
            } catch (e: Exception) {
                Log.e(TAG, "Get pending count error", e)
                promise.reject("PENDING_COUNT_ERROR", e.message, e)
            }
        }
    }

    /**
     * Clean up resources when module is destroyed
     */
    fun destroy() {
        scope.cancel()
    }

    /**
     * Set the node URL for PoUW operations
     */
    @ReactMethod
    fun setNodeUrl(nodeUrl: String, promise: Promise) {
        try {
            controller?.setNodeUrl(nodeUrl)
            promise.resolve(nodeUrl)
        } catch (e: Exception) {
            promise.reject("SET_NODE_URL_ERROR", e.message, e)
        }
    }

    /**
     * Get a challenge token from the node
     */
    @ReactMethod
    fun getChallenge(cap: String?, maxBytes: Double, maxReceipts: Double, promise: Promise) {
        scope.launch {
            try {
                val result = controller?.getChallenge(cap, maxBytes.toLong(), maxReceipts.toInt())
                if (result != null) {
                    promise.resolve(Arguments.createMap().apply {
                        putString("token", result.token)
                        putDouble("expires_at", result.expiresAt.toDouble())
                    })
                } else {
                    promise.reject("CHALLENGE_ERROR", "Failed to get challenge")
                }
            } catch (e: Exception) {
                promise.reject("CHALLENGE_ERROR", e.message, e)
            }
        }
    }

    /**
     * Map PoUWError to React Native error codes
     */
    private fun mapPoUWError(error: PoUWError): Pair<String, String> {
        return when (error) {
            is PoUWError.InvalidContent ->
                "INVALID_CONTENT" to "Invalid content data provided"
            is PoUWError.VerificationFailed ->
                "VERIFICATION_FAILED" to "Content hash verification failed"
            is PoUWError.ChallengeExpired ->
                "CHALLENGE_EXPIRED" to "Challenge token has expired"
            is PoUWError.NetworkError ->
                "NETWORK_ERROR" to "Network error: ${error.cause?.message}"
            is PoUWError.SerializationError ->
                "SERIALIZATION_ERROR" to "Failed to serialize receipt data"
            is PoUWError.StorageError ->
                "STORAGE_ERROR" to "Storage error: ${error.cause?.message}"
            is PoUWError.SignatureError ->
                "SIGNATURE_ERROR" to "Failed to generate signature"
        }
    }
}
