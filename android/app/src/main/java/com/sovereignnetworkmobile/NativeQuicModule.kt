package com.sovereignnetworkmobile

import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableNativeMap
import org.json.JSONObject
import java.util.concurrent.Executor
import java.util.concurrent.Executors

/**
 * Native QUIC Module for Android
 * Implements HTTP/3 over QUIC using Quinn (Rust-based QUIC implementation)
 * Provides HTTP-like request/response semantics over QUIC streams
 * Supports self-signed certificates for development
 */
class NativeQuicModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "[🌐 Web4]"
        private const val DEFAULT_TIMEOUT = 30
        private const val ALPN_PROTOCOL = "zhtp-public/1"
        // These values are loaded from GeneratedConfig.kt which is generated from .env file
        // GeneratedConfig.kt is the single source of truth - updated at build time
        private const val QUINN_CONTROL_PLANE_HOST = com.sovereignnetworkmobile.config.GeneratedConfig.QUINN_CONTROL_PLANE_HOST
        private const val QUINN_CONTROL_PLANE_PORT = com.sovereignnetworkmobile.config.GeneratedConfig.QUINN_CONTROL_PLANE_PORT
        private const val QUINN_CONTROL_PLANE_SERVER_NAME = com.sovereignnetworkmobile.config.GeneratedConfig.QUINN_CONTROL_PLANE_SERVER_NAME
    }

    private val executor: Executor = Executors.newCachedThreadPool()
    private var isInitialized = false
    private val connectionLock = Any()
    private val quinnRequestQueue: MutableMap<String, MutableList<QuinnQueuedRequest>> = mutableMapOf()
    private val quinnHandshakeInProgress: MutableSet<String> = mutableSetOf()

    override fun getName() = "NativeQuic"

    override fun getConstants(): Map<String, Any> {
        return mapOf(
            "ALPN_PROTOCOL" to ALPN_PROTOCOL,
            "DEFAULT_TIMEOUT" to DEFAULT_TIMEOUT,
            "MIN_ANDROID_VERSION" to 21
        )
    }

    /**
     * Initialize the native QUIC library
     */
    private fun ensureInitialized(): Boolean {
        if (!isInitialized) {
            isInitialized = NativeQuicBridge.init()
            Log.d(TAG, "[🌐 Web4] Native QUIC initialized: $isInitialized")
        }
        return isInitialized
    }

    /**
     * Check if QUIC is supported on this device
     */
    @ReactMethod
    fun isSupported(promise: Promise) {
        try {
            val supported = NativeQuicBridge.isSupported()
            Log.d(TAG, "[🌐 Web4] QUIC supported: $supported")
            promise.resolve(supported)
        } catch (e: Exception) {
            Log.e(TAG, "[🌐 Web4] Error checking QUIC support", e)
            promise.resolve(false)
        }
    }

    /**
     * Simple UDP reachability check
     */
    @ReactMethod
    fun checkReachability(host: String, port: Int, promise: Promise) {
        executor.execute {
            try {
                ensureInitialized()
                val result = NativeQuicBridge.checkReachability(host, port)

                val responseMap = WritableNativeMap().apply {
                    putBoolean("reachable", result?.get("reachable") as? Boolean ?: false)
                    putDouble("latencyMs", (result?.get("latencyMs") as? Double) ?: 0.0)
                    putString("host", host)
                    putInt("port", port)
                    result?.get("error")?.let { putString("error", it.toString()) }
                }

                Log.d(TAG, "[🌐 Web4] UDP reachability: $responseMap")
                promise.resolve(responseMap)
            } catch (e: Exception) {
                Log.e(TAG, "[🌐 Web4] Reachability check failed", e)
                val errorMap = WritableNativeMap().apply {
                    putBoolean("reachable", false)
                    putString("error", e.message ?: "Unknown error")
                    putString("host", host)
                    putInt("port", port)
                }
                promise.resolve(errorMap)
            }
        }
    }

    /**
     * Test connection to a QUIC server
     */
    @ReactMethod
    fun testConnection(host: String, port: Int, promise: Promise) {
        executor.execute {
            try {
                ensureInitialized()
                Log.d(TAG, "[🌐 Web4] Testing QUIC connection to $host:$port")

                val result = NativeQuicBridge.testConnection(host, port)

                val success = result?.get("success") as? Boolean ?: false
                val latencyMs = (result?.get("latencyMs") as? Double) ?: 0.0
                val protocol = result?.get("protocol") as? String ?: "QUIC"
                val error = result?.get("error") as? String

                if (success) {
                    val responseMap = WritableNativeMap().apply {
                        putBoolean("success", true)
                        putDouble("latencyMs", latencyMs)
                        putString("protocol", protocol)
                        putString("host", host)
                        putInt("port", port)
                    }
                    Log.d(TAG, "[🌐 Web4] Connection test succeeded: $responseMap")
                    promise.resolve(responseMap)
                } else {
                    promise.reject("QUIC_ERROR", error ?: "Connection failed", null)
                }
            } catch (e: Exception) {
                Log.e(TAG, "[🌐 Web4] Connection test error", e)
                promise.reject("QUIC_ERROR", "Failed to test connection: ${e.message}", e)
            }
        }
    }

    /**
     * Make an HTTP request over QUIC
     * @param url URL in format quic://host:port/path or https://host:port/path
     * @param options Request options (method, headers, body, timeout, insecure)
     */
    @ReactMethod
    fun request(url: String, options: ReadableMap, promise: Promise) {
        executor.execute {
            try {
                ensureInitialized()

                val method = if (options.hasKey("method")) options.getString("method") else "GET"
                val timeout = if (options.hasKey("timeout")) options.getInt("timeout") else DEFAULT_TIMEOUT
                val body = if (options.hasKey("body")) options.getString("body") else ""
                val insecure = if (options.hasKey("insecure")) options.getBoolean("insecure") else true
                val alpn = if (options.hasKey("alpn")) options.getString("alpn") else "authenticated"

                // Convert headers to JSON
                val headersJson = if (options.hasKey("headers")) {
                    val headers = options.getMap("headers")
                    val jsonObj = JSONObject()
                    headers?.let {
                        val iterator = it.keySetIterator()
                        while (iterator.hasNextKey()) {
                            val key = iterator.nextKey()
                            jsonObj.put(key, it.getString(key))
                        }
                    }
                    jsonObj.toString()
                } else {
                    "{}"
                }

                val alpnMode = alpn ?: "authenticated"
                Log.d(TAG, "[🌐 Web4] QUIC request: $method $url (ALPN: $alpnMode)")

                if (alpnMode == "public") {
                    val result = NativeQuicBridge.request(
                        url = url,
                        method = method ?: "GET",
                        headersJson = headersJson,
                        body = body ?: "",
                        timeoutSecs = timeout,
                        insecure = insecure,
                        alpn = alpnMode
                    )
                    handleStringResponse(result, promise)
                    return@execute
                }

                val parsedUrl = parseQuicUrl(url)
                if (parsedUrl == null) {
                    promise.reject("QUIC_ERROR", "Invalid URL", null)
                    return@execute
                }

                val identityId = extractIdentityId(parsedUrl.path, body, headersJson)
                if (identityId.isNullOrEmpty()) {
                    promise.reject("QUIC_ERROR", "Missing identity_id for authenticated request", null)
                    return@execute
                }

                Log.d(TAG, "[🌐 Web4] Auth request identity_id=${maskIdentifier(identityId)} path=${parsedUrl.path}")
                enqueueAuthenticatedRequest(
                    identityId = identityId,
                    parsedUrl = parsedUrl,
                    method = method ?: "GET",
                    headersJson = headersJson,
                    body = body ?: "",
                    promise = promise
                )
                return@execute

            } catch (e: Exception) {
                Log.e(TAG, "[🌐 Web4] Request error", e)
                promise.reject("QUIC_ERROR", "Request failed: ${e.message}", e)
            }
        }
    }

    /**
     * Cancel all active requests
     */
    @ReactMethod
    fun cancelAll(promise: Promise) {
        try {
            val result = NativeQuicBridge.cancelAll()
            Log.d(TAG, "[🌐 Web4] Cancelled all requests: $result")
            promise.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "[🌐 Web4] Error cancelling requests", e)
            promise.resolve(false)
        }
    }

    private fun enqueueAuthenticatedRequest(
        identityId: String,
        parsedUrl: ParsedUrl,
        method: String,
        headersJson: String,
        body: String,
        promise: Promise
    ) {
        val request = QuinnQueuedRequest(
            parsedUrl = parsedUrl,
            method = method,
            headersJson = headersJson,
            body = body,
            promise = promise
        )

        var shouldStart = false
        synchronized(connectionLock) {
            val queue = quinnRequestQueue.getOrPut(identityId) { mutableListOf() }
            queue.add(request)
            if (!quinnHandshakeInProgress.contains(identityId)) {
                quinnHandshakeInProgress.add(identityId)
                shouldStart = true
            }
        }

        if (!shouldStart) {
            return
        }

        executor.execute {
            val identity = IdentityStore.loadIdentity(reactApplicationContext, identityId)
            if (identity == null) {
                failQuinnQueue(identityId, "Identity not found for $identityId")
                return@execute
            }

            NativeQuicBridge.initUhpQuinn()
            val spkiPin = com.sovereignnetworkmobile.config.GeneratedConfig.QUINN_SPKI_PIN_HEX

            val handshake: Map<String, Any?>? = if (NativeQuicBridge.useLibClientHandshake) {
                // New path: 3-leg UHP via lib-client HandshakeState (keys stay in Rust)
                // NOTE: Blocked on quinn-ffi ALPN-aware connect (zhtp-uhp/2)
                NativeQuicBridge.handshakeViaLibClient(
                    host = QUINN_CONTROL_PLANE_HOST,
                    port = QUINN_CONTROL_PLANE_PORT,
                    serverName = QUINN_CONTROL_PLANE_SERVER_NAME,
                    spkiPinHex = spkiPin,
                    identityHandle = identity.getHandle()
                )
            } else {
                // Legacy path: extract keys via deprecated getters (briefly in JVM memory)
                val handshakeJson = identity.toHandshakeJson() ?: ""
                @Suppress("DEPRECATION")
                val dilithiumSk = identity.getDilithiumSecretKey() ?: ByteArray(0)
                @Suppress("DEPRECATION")
                val kyberSk = identity.getKyberSecretKey() ?: ByteArray(0)
                @Suppress("DEPRECATION")
                val masterSeed = identity.getMasterSeed() ?: ByteArray(0)

                NativeQuicBridge.uhpQuicConnectAndHandshake(
                    host = QUINN_CONTROL_PLANE_HOST,
                    port = QUINN_CONTROL_PLANE_PORT,
                    serverName = QUINN_CONTROL_PLANE_SERVER_NAME,
                    spkiPinHex = spkiPin,
                    identityJson = handshakeJson,
                    dilithiumSk = dilithiumSk,
                    kyberSk = kyberSk,
                    masterSeed = masterSeed,
                    chainId = 0
                )
            }

            // Identity handle no longer needed after handshake setup
            identity.close()

            val ok = handshake?.get("ok") as? Boolean ?: false
            if (!ok) {
                val error = handshake?.get("error") as? String ?: "Handshake failed"
                failQuinnQueue(identityId, error)
                return@execute
            }

            val handle = (handshake?.get("handle") as? Number)?.toLong() ?: 0L
            Log.d(TAG, "[🌐 Web4] Handshake ok handle=$handle identity_id=${maskIdentifier(identityId)}")
            drainQuinnQueue(identityId, handle)
        }
    }

    private fun drainQuinnQueue(identityId: String, handle: Long) {
        val request = synchronized(connectionLock) {
            val queue = quinnRequestQueue[identityId]
            if (queue.isNullOrEmpty()) {
                quinnRequestQueue.remove(identityId)
                quinnHandshakeInProgress.remove(identityId)
                null
            } else {
                queue.removeAt(0)
            }
        }

        if (request == null) {
            NativeQuicBridge.uhpQuicClose(handle)
            return
        }

        val result = NativeQuicBridge.uhpQuicAuthenticatedRequest(
            handle = handle,
            method = request.method,
            path = request.parsedUrl.path,
            headersJson = request.headersJson,
            body = (request.body as String).toByteArray()
        )
        handleStringResponse(result, request.promise)

        drainQuinnQueue(identityId, handle)
    }

    private fun failQuinnQueue(identityId: String, error: String) {
        val queued = synchronized(connectionLock) {
            val queue = quinnRequestQueue.remove(identityId) ?: mutableListOf()
            quinnHandshakeInProgress.remove(identityId)
            queue.toList()
        }
        queued.forEach { req ->
            req.promise.reject("QUIC_ERROR", error, null)
        }
    }

    private fun handleStringResponse(result: Map<String, Any?>?, promise: Promise) {
        val status = (result?.get("status") as? Number)?.toInt() ?: 0
        val statusText = result?.get("statusText") as? String ?: ""
        val responseBody = result?.get("body") as? String ?: ""
        val ok = result?.get("ok") as? Boolean ?: false
        val error = result?.get("error") as? String

        if (error != null && status == 0) {
            promise.reject("QUIC_ERROR", error, null)
            return
        }

        val responseMap = WritableNativeMap().apply {
            putInt("status", status)
            putString("statusText", statusText)
            putMap("headers", WritableNativeMap())
            putString("body", responseBody)
            putBoolean("ok", ok)
        }

        if (!ok) {
            Log.d(TAG, "[🌐 Web4] Response error status=$status body=${responseBody.take(300)}")
        }
        promise.resolve(responseMap)
    }

    private data class ParsedUrl(val host: String, val port: Int, val path: String)

    private data class QuinnQueuedRequest(
        val parsedUrl: ParsedUrl,
        val method: String,
        val headersJson: String,
        val body: Any,
        val promise: Promise
    )

    private fun parseQuicUrl(urlString: String): ParsedUrl? {
        val normalizedUrl = urlString.replace("quic://", "https://")
        return try {
            val uri = java.net.URI(normalizedUrl)
            val host = uri.host ?: return null
            val port = if (uri.port == -1) 443 else uri.port
            var path = uri.path ?: "/"
            if (path.isEmpty()) path = "/"
            val query = uri.query
            if (!query.isNullOrEmpty()) {
                path += "?$query"
            }
            ParsedUrl(host, port, path)
        } catch (e: Exception) {
            null
        }
    }

    private fun extractIdentityId(path: String, body: String?, headersJson: String): String? {
        try {
            val headers = JSONObject(headersJson)
            val headerValue = headers.optString("X-Zhtp-Identity", headers.optString("x-zhtp-identity"))
            if (headerValue.isNotEmpty()) {
                return normalizeIdentityId(headerValue)
            }
        } catch (_: Exception) {
        }

        if (!body.isNullOrEmpty()) {
            try {
                val json = JSONObject(body)
                val identityId = json.optString("identity_id", "")
                if (identityId.isNotEmpty()) {
                    return normalizeIdentityId(identityId)
                }
                val did = json.optString("did", "")
                if (did.isNotEmpty()) {
                    return normalizeIdentityId(did)
                }
            } catch (_: Exception) {
            }
        }

        val components = path.split("/").filter { it.isNotEmpty() }
        if (components.size >= 5 &&
            components[0] == "api" &&
            components[1] == "v1" &&
            components[2] == "wallet" &&
            components[3] == "list"
        ) {
            return normalizeIdentityId(components[4])
        }

        if (components.size >= 6 &&
            components[0] == "api" &&
            components[1] == "v1" &&
            components[2] == "wallet" &&
            components[3] == "balance"
        ) {
            return normalizeIdentityId(components[5])
        }

        return null
    }

    private fun normalizeIdentityId(identityId: String): String {
        val trimmed = identityId.trim()
        return if (trimmed.startsWith("did:zhtp:")) {
            trimmed.removePrefix("did:zhtp:")
        } else {
            trimmed
        }
    }

    private fun maskIdentifier(value: String?): String {
        val trimmed = value?.trim() ?: return "<empty>"
        if (trimmed.isEmpty()) return "<empty>"
        val core = trimmed.replace(Regex("^did:[^:]*:"), "")
        if (core.length <= 8) return core
        return core.substring(0, 4) + "…" + core.substring(core.length - 4)
    }
}
