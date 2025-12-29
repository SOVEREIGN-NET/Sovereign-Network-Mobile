package com.sovereignnetworkmobile

import android.util.Log

/**
 * JNI Bridge to native Rust QUIC library (Quinn-based)
 * Provides low-level QUIC connectivity with self-signed certificate support
 */
object NativeQuicBridge {
    private const val TAG = "NativeQuicBridge"
    private var isInitialized = false

    init {
        try {
            System.loadLibrary("quic_jni")
            Log.d(TAG, "Native QUIC library loaded")
        } catch (e: UnsatisfiedLinkError) {
            Log.e(TAG, "Failed to load native QUIC library", e)
        }
    }

    /**
     * Initialize the native QUIC library
     * Must be called before using any other methods
     */
    @Synchronized
    fun init(): Boolean {
        if (isInitialized) {
            return true
        }
        return try {
            isInitialized = nativeInit()
            Log.d(TAG, "Native QUIC initialized: $isInitialized")
            isInitialized
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize native QUIC", e)
            false
        }
    }

    /**
     * Check if QUIC is supported on this device
     */
    fun isSupported(): Boolean {
        return try {
            nativeIsSupported()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to check QUIC support", e)
            false
        }
    }

    /**
     * Check UDP reachability to a host:port
     * Returns a map with: reachable (Boolean), latencyMs (Double), error (String?)
     */
    fun checkReachability(host: String, port: Int): Map<String, Any?>? {
        ensureInitialized()
        return try {
            @Suppress("UNCHECKED_CAST")
            nativeCheckReachability(host, port) as? Map<String, Any?>
        } catch (e: Exception) {
            Log.e(TAG, "Reachability check failed", e)
            mapOf("reachable" to false, "error" to e.message)
        }
    }

    /**
     * Test QUIC connection to a server
     * Returns a map with: success (Boolean), latencyMs (Double), protocol (String), error (String?)
     */
    fun testConnection(host: String, port: Int): Map<String, Any?>? {
        ensureInitialized()
        return try {
            @Suppress("UNCHECKED_CAST")
            nativeTestConnection(host, port) as? Map<String, Any?>
        } catch (e: Exception) {
            Log.e(TAG, "Connection test failed", e)
            mapOf("success" to false, "error" to e.message)
        }
    }

    /**
     * Make an HTTP request over QUIC
     * @param url Full URL (quic://host:port/path or https://host:port/path)
     * @param method HTTP method (GET, POST, etc.)
     * @param headersJson JSON string of headers
     * @param body Request body (for POST/PUT/PATCH)
     * @param timeoutSecs Timeout in seconds
     * @param insecure If true, accepts self-signed certificates
     * @return Map with: status (Int), statusText (String), body (String), headersJson (String), ok (Boolean), error (String?)
     */
    fun request(
        url: String,
        method: String = "GET",
        headersJson: String = "{}",
        body: String = "",
        timeoutSecs: Int = 30,
        insecure: Boolean = true
    ): Map<String, Any?>? {
        ensureInitialized()
        return try {
            @Suppress("UNCHECKED_CAST")
            nativeRequest(url, method, headersJson, body, timeoutSecs, insecure) as? Map<String, Any?>
        } catch (e: Exception) {
            Log.e(TAG, "Request failed", e)
            mapOf("ok" to false, "status" to 0, "error" to e.message)
        }
    }

    /**
     * Make an HTTP request over QUIC returning raw bytes
     */
    fun requestBytes(
        url: String,
        method: String = "GET",
        headersJson: String = "{}",
        body: ByteArray? = null,
        timeoutSecs: Int = 30,
        insecure: Boolean = true
    ): Map<String, Any?>? {
        ensureInitialized()
        return try {
            @Suppress("UNCHECKED_CAST")
            nativeRequestBytes(url, method, headersJson, body, timeoutSecs, insecure) as? Map<String, Any?>
        } catch (e: Exception) {
            Log.e(TAG, "Request (bytes) failed", e)
            mapOf("ok" to false, "status" to 0, "error" to e.message)
        }
    }

    /**
     * Cancel all active requests
     */
    fun cancelAll(): Boolean {
        return try {
            nativeCancelAll()
        } catch (e: Exception) {
            Log.e(TAG, "Cancel all failed", e)
            false
        }
    }

    /**
     * Shutdown the native library
     */
    fun shutdown() {
        try {
            nativeShutdown()
            isInitialized = false
        } catch (e: Exception) {
            Log.e(TAG, "Shutdown failed", e)
        }
    }

    private fun ensureInitialized() {
        if (!isInitialized) {
            init()
        }
    }

    // Native methods - implemented in Rust
    private external fun nativeInit(): Boolean
    private external fun nativeIsSupported(): Boolean
    private external fun nativeCheckReachability(host: String, port: Int): Any?
    private external fun nativeTestConnection(host: String, port: Int): Any?
    private external fun nativeRequest(
        url: String,
        method: String,
        headersJson: String,
        body: String,
        timeoutSecs: Int,
        insecure: Boolean
    ): Any?
    private external fun nativeRequestBytes(
        url: String,
        method: String,
        headersJson: String,
        body: ByteArray?,
        timeoutSecs: Int,
        insecure: Boolean
    ): Any?
    private external fun nativeCancelAll(): Boolean
    private external fun nativeShutdown()
}
