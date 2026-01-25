package com.sovereignnetworkmobile

import android.util.Log

/**
 * JNI Bridge to native Rust QUIC library (Quinn-based)
 * Provides low-level QUIC connectivity with self-signed certificate support
 */
object NativeQuicBridge {
    private const val TAG = "[🌐 Web4]"
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
     * @param alpn ALPN protocol: 'public' for zhtp-public/1, 'authenticated' for zhtp-uhp/1
     * @return Map with: status (Int), statusText (String), body (String), headersJson (String), ok (Boolean), error (String?)
     */
    fun request(
        url: String,
        method: String = "GET",
        headersJson: String = "{}",
        body: String = "",
        timeoutSecs: Int = 30,
        insecure: Boolean = true,
        alpn: String = "authenticated"
    ): Map<String, Any?>? {
        ensureInitialized()
        return try {
            @Suppress("UNCHECKED_CAST")
            nativeRequest(url, method, headersJson, body, timeoutSecs, insecure, alpn) as? Map<String, Any?>
        } catch (e: Exception) {
            Log.e(TAG, "Request failed", e)
            mapOf("ok" to false, "status" to 0, "error" to e.message)
        }
    }

    /**
     * Make an HTTP request over QUIC returning raw bytes
     * @param alpn ALPN protocol: 'public' for zhtp-public/1, 'authenticated' for zhtp-uhp/1
     */
    fun requestBytes(
        url: String,
        method: String = "GET",
        headersJson: String = "{}",
        body: ByteArray? = null,
        timeoutSecs: Int = 30,
        insecure: Boolean = true,
        alpn: String = "authenticated"
    ): Map<String, Any?>? {
        ensureInitialized()
        return try {
            @Suppress("UNCHECKED_CAST")
            nativeRequestBytes(url, method, headersJson, body, timeoutSecs, insecure, alpn) as? Map<String, Any?>
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

    /**
     * Initialize the Quinn UHP layer (installs crypto provider)
     */
    fun initUhpQuinn(): Boolean {
        return try {
            nativeUhpQuinnInit()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize UHP Quinn", e)
            false
        }
    }

    /**
     * Connect + UHP handshake (returns handle + session info map)
     */
    fun uhpQuicConnectAndHandshake(
        host: String,
        port: Int,
        serverName: String,
        spkiPinHex: String,
        identityJson: String,
        dilithiumSk: ByteArray,
        kyberSk: ByteArray,
        masterSeed: ByteArray,
        chainId: Int
    ): Map<String, Any?>? {
        ensureInitialized()
        return try {
            @Suppress("UNCHECKED_CAST")
            nativeUhpQuicConnectAndHandshake(
                host,
                port,
                serverName,
                spkiPinHex,
                identityJson,
                dilithiumSk,
                kyberSk,
                masterSeed,
                chainId
            ) as? Map<String, Any?>
        } catch (e: Exception) {
            Log.e(TAG, "UHP handshake failed", e)
            mapOf("ok" to false, "error" to e.message)
        }
    }

    /**
     * Send framed ZHTP request on an existing handle
     */
    fun uhpQuicRequest(handle: Long, requestBytes: ByteArray): Map<String, Any?>? {
        ensureInitialized()
        return try {
            @Suppress("UNCHECKED_CAST")
            nativeUhpQuicRequest(handle, requestBytes) as? Map<String, Any?>
        } catch (e: Exception) {
            Log.e(TAG, "UHP request failed", e)
            mapOf("ok" to false, "error" to e.message)
        }
    }

    /**
     * Send authenticated ZHTP request using existing UHP session
     */
    fun uhpQuicAuthenticatedRequest(
        handle: Long,
        method: String,
        path: String,
        headersJson: String,
        body: ByteArray?
    ): Map<String, Any?>? {
        ensureInitialized()
        return try {
            @Suppress("UNCHECKED_CAST")
            nativeUhpQuicAuthenticatedRequest(handle, method, path, headersJson, body) as? Map<String, Any?>
        } catch (e: Exception) {
            Log.e(TAG, "UHP authenticated request failed", e)
            mapOf("ok" to false, "error" to e.message)
        }
    }

    /**
     * Send authenticated ZHTP request returning raw bytes
     */
    fun uhpQuicAuthenticatedRequestBytes(
        handle: Long,
        method: String,
        path: String,
        headersJson: String,
        body: ByteArray?
    ): Map<String, Any?>? {
        ensureInitialized()
        return try {
            @Suppress("UNCHECKED_CAST")
            nativeUhpQuicAuthenticatedRequestBytes(handle, method, path, headersJson, body) as? Map<String, Any?>
        } catch (e: Exception) {
            Log.e(TAG, "UHP authenticated request (bytes) failed", e)
            mapOf("ok" to false, "error" to e.message)
        }
    }

    /**
     * Close an existing handle
     */
    fun uhpQuicClose(handle: Long) {
        try {
            nativeUhpQuicClose(handle)
        } catch (e: Exception) {
            Log.e(TAG, "UHP close failed", e)
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
        insecure: Boolean,
        alpn: String
    ): Any?
    private external fun nativeRequestBytes(
        url: String,
        method: String,
        headersJson: String,
        body: ByteArray?,
        timeoutSecs: Int,
        insecure: Boolean,
        alpn: String
    ): Any?
    private external fun nativeCancelAll(): Boolean
    private external fun nativeShutdown()
    private external fun nativeUhpQuinnInit(): Boolean
    private external fun nativeUhpQuicConnectAndHandshake(
        host: String,
        port: Int,
        serverName: String,
        spkiPinHex: String,
        identityJson: String,
        dilithiumSk: ByteArray,
        kyberSk: ByteArray,
        masterSeed: ByteArray,
        chainId: Int
    ): Any?
    private external fun nativeUhpQuicRequest(handle: Long, requestBytes: ByteArray): Any?
    private external fun nativeUhpQuicAuthenticatedRequest(
        handle: Long,
        method: String,
        path: String,
        headersJson: String,
        body: ByteArray?
    ): Any?
    private external fun nativeUhpQuicAuthenticatedRequestBytes(
        handle: Long,
        method: String,
        path: String,
        headersJson: String,
        body: ByteArray?
    ): Any?
    private external fun nativeUhpQuicClose(handle: Long)
}
