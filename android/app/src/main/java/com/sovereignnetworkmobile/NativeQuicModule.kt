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
        private const val TAG = "NativeQuic"
        private const val DEFAULT_TIMEOUT = 30
        private const val ALPN_PROTOCOL = "zhtp-public/1"
    }

    private val executor: Executor = Executors.newCachedThreadPool()
    private var isInitialized = false

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
            Log.d(TAG, "Native QUIC initialized: $isInitialized")
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
            Log.d(TAG, "QUIC supported: $supported")
            promise.resolve(supported)
        } catch (e: Exception) {
            Log.e(TAG, "Error checking QUIC support", e)
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

                Log.d(TAG, "UDP reachability: $responseMap")
                promise.resolve(responseMap)
            } catch (e: Exception) {
                Log.e(TAG, "Reachability check failed", e)
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
                Log.d(TAG, "Testing QUIC connection to $host:$port")

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
                    Log.d(TAG, "Connection test succeeded: $responseMap")
                    promise.resolve(responseMap)
                } else {
                    promise.reject("QUIC_ERROR", error ?: "Connection failed", null)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Connection test error", e)
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

                Log.d(TAG, "QUIC request: $method $url")

                val result = NativeQuicBridge.request(
                    url = url,
                    method = method ?: "GET",
                    headersJson = headersJson,
                    body = body ?: "",
                    timeoutSecs = timeout,
                    insecure = insecure
                )

                val status = (result?.get("status") as? Number)?.toInt() ?: 0
                val statusText = result?.get("statusText") as? String ?: ""
                val responseBody = result?.get("body") as? String ?: ""
                val ok = result?.get("ok") as? Boolean ?: false
                val error = result?.get("error") as? String

                if (error != null && status == 0) {
                    promise.reject("QUIC_ERROR", error, null)
                    return@execute
                }

                // Parse headers from JSON
                val headersMap = WritableNativeMap()
                val responseHeadersJson = result?.get("headersJson") as? String
                if (!responseHeadersJson.isNullOrEmpty()) {
                    try {
                        val jsonHeaders = JSONObject(responseHeadersJson)
                        val keys = jsonHeaders.keys()
                        while (keys.hasNext()) {
                            val key = keys.next()
                            headersMap.putString(key, jsonHeaders.getString(key))
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "Failed to parse headers JSON", e)
                    }
                }

                val responseMap = WritableNativeMap().apply {
                    putInt("status", status)
                    putString("statusText", statusText)
                    putMap("headers", headersMap)
                    putString("body", responseBody)
                    putBoolean("ok", ok)
                }

                Log.d(TAG, "Request completed: status=$status ok=$ok")
                promise.resolve(responseMap)

            } catch (e: Exception) {
                Log.e(TAG, "Request error", e)
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
            Log.d(TAG, "Cancelled all requests: $result")
            promise.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "Error cancelling requests", e)
            promise.resolve(false)
        }
    }
}
