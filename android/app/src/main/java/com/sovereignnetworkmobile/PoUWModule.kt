package com.sovereignnetworkmobile

import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.*
import com.sovereignnetworkmobile.config.GeneratedConfig
import com.sovereignnetworkmobile.pouw.PoUWController
import com.sovereignnetworkmobile.pouw.model.PoUWError
import com.sovereignnetworkmobile.web4.Web4Client
import com.sovereignnetworkmobile.web4.Web4ManifestFile
import kotlinx.coroutines.*
import java.security.MessageDigest

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
 */
class PoUWModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "PoUWModule"
        private const val MIN_VERIFIED_BYTES = 1024
    }

    override fun getName() = "PoUW"

    /**
     * Coroutine scope for async operations
     */
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    @Volatile
    private var controller: PoUWController? = null
    private var controllerIdentityId: String? = null
    private var loadedIdentity: Identity? = null
    private var loadedIdentityId: String? = null

    @Synchronized
    private fun ensureController(): PoUWController? {
        val currentIdentityId = IdentityStore.getCurrentIdentityId(reactApplicationContext) ?: return null
        val normalizedIdentityId = normalizeIdentityId(currentIdentityId)

        if (loadedIdentity == null || loadedIdentityId != normalizedIdentityId) {
            loadedIdentity?.close()
            loadedIdentity = IdentityStore.loadIdentity(reactApplicationContext, normalizedIdentityId)
            loadedIdentityId = if (loadedIdentity != null) normalizedIdentityId else null
        }

        val identity = loadedIdentity ?: return null
        val existingController = controller

        if (existingController == null || controllerIdentityId != normalizedIdentityId) {
            existingController?.destroy()
            val created = PoUWController(
                context = reactApplicationContext,
                identity = identity,
                nodeHost = GeneratedConfig.NODE_HOST,
                nodePort = GeneratedConfig.NODE_PORT
            )
            created.start()
            controller = created
            controllerIdentityId = normalizedIdentityId
            return created
        }

        if (!existingController.isRunning) {
            existingController.start()
        }

        return existingController
    }

    private fun normalizeIdentityId(identityIdOrDid: String): String {
        val trimmed = identityIdOrDid.trim()
        return if (trimmed.startsWith("did:zhtp:")) {
            trimmed.removePrefix("did:zhtp:")
        } else {
            trimmed
        }
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
        val ctrl = ensureController()
        if (ctrl == null) {
            promise.reject(
                "CONTROLLER_NOT_INITIALIZED",
                "PoUWController not initialized (no active identity)"
            )
            return
        }

        scope.launch {
            try {
                val bytesData = try {
                    Base64.decode(bytes, Base64.NO_WRAP)
                } catch (e: IllegalArgumentException) {
                    promise.reject("INVALID_BYTES", "Failed to decode bytes from base64: ${e.message}")
                    return@launch
                }

                val contentIdBytes = if (contentId.isBlank()) {
                    // iOS parity: when contentId is missing, derive content hash from bytes.
                    MessageDigest.getInstance("SHA-256").digest(bytesData)
                } else {
                    try {
                        Base64.decode(contentId, Base64.NO_WRAP)
                    } catch (e: IllegalArgumentException) {
                        promise.reject(
                            "INVALID_CONTENT_ID",
                            "Failed to decode contentId from base64: ${e.message}"
                        )
                        return@launch
                    }
                }

                val providerIdBytes = providerId?.let {
                    try {
                        Base64.decode(it, Base64.NO_WRAP)
                    } catch (e: IllegalArgumentException) {
                        promise.reject("INVALID_PROVIDER_ID", "Failed to decode providerId from base64: ${e.message}")
                        return@launch
                    }
                }

                if (bytesData.size < MIN_VERIFIED_BYTES) {
                    promise.resolve(Arguments.createMap().apply {
                        putBoolean("eligible", false)
                        putString("reason", "min_bytes")
                        putDouble("min_bytes_required", MIN_VERIFIED_BYTES.toDouble())
                        putDouble("bytes_verified", bytesData.size.toDouble())
                        putString("proof_type", "hash")
                    })
                    return@launch
                }

                // Call controller to submit content
                // Note: Android's submitContent combines verification and recording
                val receipt = ctrl.submitContent(bytesData, contentIdBytes, providerIdBytes)

                promise.resolve(Arguments.createMap().apply {
                    putBoolean("eligible", true)
                    putString("receipt_id", receipt.receiptNonce.toHex())
                    putDouble("bytes_verified", bytesData.size.toDouble())
                    putString("proof_type", "hash")
                })
            } catch (e: PoUWError) {
                val (code, message) = mapPoUWError(e)
                promise.reject(code, message)
            } catch (e: Exception) {
                Log.e(TAG, "Verification error", e)
                promise.reject("VERIFICATION_ERROR", e.message, e)
            }
        }
    }

    private fun ByteArray.toHex(): String = joinToString("") { b -> "%02x".format(b) }

    /**
     * Flush pending receipts to the server
     *
     * @param promise Promise to resolve/reject
     */
    @ReactMethod
    fun flush(promise: Promise) {
        val ctrl = ensureController()
        if (ctrl == null) {
            promise.reject(
                "CONTROLLER_NOT_INITIALIZED",
                "PoUWController not initialized (no active identity)"
            )
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
        val ctrl = ensureController()
        if (ctrl == null) {
            promise.resolve(0)
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
        controller?.destroy()
        controller = null
        controllerIdentityId = null
        loadedIdentity?.close()
        loadedIdentity = null
        loadedIdentityId = null
    }

    override fun invalidate() {
        super.invalidate()
        destroy()
    }

    /**
     * Set the node URL for PoUW operations
     */
    @ReactMethod
    fun setNodeUrl(nodeUrl: String, promise: Promise) {
        try {
            val ctrl = ensureController()
            if (ctrl == null) {
                promise.reject(
                    "CONTROLLER_NOT_INITIALIZED",
                    "PoUWController not initialized (no active identity)"
                )
                return
            }
            ctrl.setNodeUrl(nodeUrl)
            promise.resolve(nodeUrl.trim())
        } catch (e: Exception) {
            promise.reject("SET_NODE_URL_ERROR", e.message, e)
        }
    }

    /**
     * Get a challenge token from the node
     */
    @ReactMethod
    fun getChallenge(cap: String?, maxBytes: Double, maxReceipts: Double, promise: Promise) {
        val ctrl = ensureController()
        if (ctrl == null) {
            promise.reject(
                "CONTROLLER_NOT_INITIALIZED",
                "PoUWController not initialized (no active identity)"
            )
            return
        }

        scope.launch {
            try {
                val result = ctrl.getChallenge(cap, maxBytes.toLong(), maxReceipts.toInt())
                promise.resolve(Arguments.createMap().apply {
                    putString("token", result.token)
                    putDouble("expires_at", result.expiresAt.toDouble())
                })
            } catch (e: Exception) {
                promise.reject("CHALLENGE_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun verifyDomainContent(domain: String, path: String?, providerId: String?, promise: Promise) {
        val ctrl = ensureController()
        if (ctrl == null) {
            promise.reject(
                "CONTROLLER_NOT_INITIALIZED",
                "PoUWController not initialized (no active identity)"
            )
            return
        }

        val domainNormalized = domain.trim().lowercase()
        val pathNormalized = normalizeManifestPath(path ?: "/")
        if (domainNormalized.isEmpty()) {
            promise.reject("INVALID_INPUT", "Domain is required")
            return
        }

        scope.launch {
            try {
                val baseUrl = "quic://${GeneratedConfig.NODE_HOST}:${GeneratedConfig.NODE_PORT}"
                val client = Web4Client(baseUrl = baseUrl, timeoutSecs = 30, insecure = true)

                val resolved = client.resolveDomain(domainNormalized)
                val manifest = client.fetchManifest(resolved.manifest_cid)
                val selected = selectManifestFile(manifest.files, pathNormalized)
                    ?: throw IllegalStateException("No file entry found for $domainNormalized$pathNormalized")
                val bytesData = client.fetchBlob(selected.cid)

                if (bytesData.size < MIN_VERIFIED_BYTES) {
                    promise.resolve(Arguments.createMap().apply {
                        putBoolean("eligible", false)
                        putString("reason", "min_bytes")
                        putDouble("min_bytes_required", MIN_VERIFIED_BYTES.toDouble())
                        putDouble("bytes_verified", bytesData.size.toDouble())
                        putString("proof_type", "hash")
                        putString("domain", domainNormalized)
                        putString("path", selected.path)
                        putString("cid", selected.cid)
                    })
                    return@launch
                }

                val contentHash = MessageDigest.getInstance("SHA-256").digest(bytesData)
                val providerIdBytes = providerId?.takeIf { it.isNotBlank() }?.let {
                    try {
                        Base64.decode(it, Base64.NO_WRAP)
                    } catch (e: IllegalArgumentException) {
                        null
                    }
                }

                val receipt = ctrl.submitContent(bytesData, contentHash, providerIdBytes)
                promise.resolve(Arguments.createMap().apply {
                    putBoolean("eligible", true)
                    putString("receipt_id", receipt.receiptNonce.toHex())
                    putDouble("bytes_verified", bytesData.size.toDouble())
                    putString("proof_type", "hash")
                    putString("domain", domainNormalized)
                    putString("path", selected.path)
                    putString("cid", selected.cid)
                })
            } catch (e: PoUWError) {
                val (code, message) = mapPoUWError(e)
                promise.reject(code, message)
            } catch (e: Exception) {
                Log.e(TAG, "verifyDomainContent error", e)
                promise.reject("WEB4_ERROR", "Failed to verify domain content: ${e.message}", e)
            }
        }
    }

    private fun selectManifestFile(files: List<Web4ManifestFile>, preferredPath: String): Web4ManifestFile? {
        if (files.isEmpty()) return null

        val normalized = normalizeManifestPath(preferredPath)
        val normalizedNoSlash = if (normalized.startsWith("/")) normalized.substring(1) else normalized

        files.firstOrNull { normalizeManifestPath(it.path) == normalized }?.let { return it }
        files.firstOrNull { normalizeManifestPath(it.path) == normalizedNoSlash }?.let { return it }

        files.firstOrNull { normalizeManifestPath(it.path) == "/index.html" }?.let { return it }
        files.firstOrNull { normalizeManifestPath(it.path) == "index.html" }?.let { return it }

        return files
            .filter { it.size >= MIN_VERIFIED_BYTES.toLong() }
            .maxByOrNull { it.size }
            ?: files.maxByOrNull { it.size }
    }

    private fun normalizeManifestPath(path: String): String {
        val trimmed = path.trim()
        if (trimmed.isEmpty() || trimmed == "/") return "/index.html"
        return trimmed
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
