package com.sovereignnetworkmobile

import android.util.Log

/**
 * JNI Bridge to native Rust QUIC library (Quinn-based)
 * Provides low-level QUIC connectivity with self-signed certificate support
 */
object NativeQuicBridge {
    private const val TAG = "[🌐 Web4]"
    private var isInitialized = false
    private var isLibraryLoaded = false

    init {
        try {
            System.loadLibrary("quic_jni")
            isLibraryLoaded = true
            Log.d(TAG, "Native QUIC library loaded")
        } catch (t: Throwable) {
            isLibraryLoaded = false
            Log.e(TAG, "Failed to load native QUIC library", t)
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
        if (!isLibraryLoaded) {
            Log.e(TAG, "Native QUIC library not loaded")
            return false
        }
        return try {
            isInitialized = nativeInit()
            Log.d(TAG, "Native QUIC initialized: $isInitialized")
            isInitialized
        } catch (t: Throwable) {
            Log.e(TAG, "Failed to initialize native QUIC", t)
            false
        }
    }

    /**
     * Check if QUIC is supported on this device
     */
    fun isSupported(): Boolean {
        if (!isLibraryLoaded) {
            Log.e(TAG, "Native QUIC library not loaded")
            return false
        }
        return try {
            nativeIsSupported()
        } catch (t: Throwable) {
            Log.e(TAG, "Failed to check QUIC support", t)
            false
        }
    }

    /**
     * Check UDP reachability to a host:port
     * Returns a map with: reachable (Boolean), latencyMs (Double), error (String?)
     */
    fun checkReachability(host: String, port: Int): Map<String, Any?>? {
        if (!ensureInitialized()) {
            return mapOf("reachable" to false, "error" to "Native QUIC library not loaded")
        }
        return try {
            @Suppress("UNCHECKED_CAST")
            nativeCheckReachability(host, port) as? Map<String, Any?>
        } catch (t: Throwable) {
            Log.e(TAG, "Reachability check failed", t)
            mapOf("reachable" to false, "error" to t.message)
        }
    }

    /**
     * Test QUIC connection to a server
     * Returns a map with: success (Boolean), latencyMs (Double), protocol (String), error (String?)
     */
    fun testConnection(host: String, port: Int): Map<String, Any?>? {
        if (!ensureInitialized()) {
            return mapOf("success" to false, "error" to "Native QUIC library not loaded")
        }
        return try {
            @Suppress("UNCHECKED_CAST")
            nativeTestConnection(host, port) as? Map<String, Any?>
        } catch (t: Throwable) {
            Log.e(TAG, "Connection test failed", t)
            mapOf("success" to false, "error" to t.message)
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
        if (!ensureInitialized()) {
            return mapOf("ok" to false, "status" to 0, "error" to "Native QUIC library not loaded")
        }
        return try {
            @Suppress("UNCHECKED_CAST")
            nativeRequest(url, method, headersJson, body, timeoutSecs, insecure, alpn) as? Map<String, Any?>
        } catch (t: Throwable) {
            Log.e(TAG, "Request failed", t)
            mapOf("ok" to false, "status" to 0, "error" to t.message)
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
        if (!ensureInitialized()) {
            return mapOf("ok" to false, "status" to 0, "error" to "Native QUIC library not loaded")
        }
        return try {
            @Suppress("UNCHECKED_CAST")
            nativeRequestBytes(url, method, headersJson, body, timeoutSecs, insecure, alpn) as? Map<String, Any?>
        } catch (t: Throwable) {
            Log.e(TAG, "Request (bytes) failed", t)
            mapOf("ok" to false, "status" to 0, "error" to t.message)
        }
    }

    /**
     * Cancel all active requests
     */
    fun cancelAll(): Boolean {
        return try {
            nativeCancelAll()
        } catch (t: Throwable) {
            Log.e(TAG, "Cancel all failed", t)
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
        } catch (t: Throwable) {
            Log.e(TAG, "Shutdown failed", t)
        }
    }

    /**
     * Initialize the Quinn UHP layer (installs crypto provider)
     */
    fun initUhpQuinn(): Boolean {
        if (!isLibraryLoaded) {
            Log.e(TAG, "Native QUIC library not loaded")
            return false
        }
        return try {
            nativeUhpQuinnInit()
        } catch (t: Throwable) {
            Log.e(TAG, "Failed to initialize UHP Quinn", t)
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
        if (!ensureInitialized()) {
            return mapOf("ok" to false, "error" to "Native QUIC library not loaded")
        }
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
        } catch (t: Throwable) {
            Log.e(TAG, "UHP handshake failed", t)
            mapOf("ok" to false, "error" to t.message)
        }
    }

    /**
     * Send framed ZHTP request on an existing handle
     */
    fun uhpQuicRequest(handle: Long, requestBytes: ByteArray): Map<String, Any?>? {
        if (!ensureInitialized()) {
            return mapOf("ok" to false, "error" to "Native QUIC library not loaded")
        }
        return try {
            @Suppress("UNCHECKED_CAST")
            nativeUhpQuicRequest(handle, requestBytes) as? Map<String, Any?>
        } catch (t: Throwable) {
            Log.e(TAG, "UHP request failed", t)
            mapOf("ok" to false, "error" to t.message)
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
        if (!ensureInitialized()) {
            return mapOf("ok" to false, "error" to "Native QUIC library not loaded")
        }
        return try {
            @Suppress("UNCHECKED_CAST")
            nativeUhpQuicAuthenticatedRequest(handle, method, path, headersJson, body) as? Map<String, Any?>
        } catch (t: Throwable) {
            Log.e(TAG, "UHP authenticated request failed", t)
            mapOf("ok" to false, "error" to t.message)
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
        if (!ensureInitialized()) {
            return mapOf("ok" to false, "error" to "Native QUIC library not loaded")
        }
        return try {
            @Suppress("UNCHECKED_CAST")
            nativeUhpQuicAuthenticatedRequestBytes(handle, method, path, headersJson, body) as? Map<String, Any?>
        } catch (t: Throwable) {
            Log.e(TAG, "UHP authenticated request (bytes) failed", t)
            mapOf("ok" to false, "error" to t.message)
        }
    }

    /**
     * Close an existing handle
     */
    fun uhpQuicClose(handle: Long) {
        try {
            nativeUhpQuicClose(handle)
        } catch (t: Throwable) {
            Log.e(TAG, "UHP close failed", t)
        }
    }

    // ── lib-client HandshakeState API (3-leg UHP, keys stay in Rust) ──

    /**
     * Feature flag for new lib-client handshake path.
     * Set to true once quinn-ffi exposes ALPN-aware connect.
     */
    var useLibClientHandshake: Boolean = false

    /**
     * Create a HandshakeState. Returns opaque handle (Long), or 0 on error.
     * Takes an opaque Identity handle (from Identity.getHandle()).
     * Channel binding: Blake3(sorted(local_addr || peer_addr)), 32 bytes.
     */
    fun handshakeNew(identityHandle: Long, channelBinding: ByteArray): Long {
        if (!ensureInitialized()) return 0L
        return try {
            nativeHandshakeNew(identityHandle, channelBinding)
        } catch (t: Throwable) {
            Log.e(TAG, "HandshakeState creation failed", t)
            0L
        }
    }

    /**
     * Produce ClientHello bytes from a HandshakeState handle.
     */
    fun handshakeCreateClientHello(hsHandle: Long): ByteArray? {
        return try {
            nativeHandshakeCreateClientHello(hsHandle)
        } catch (t: Throwable) {
            Log.e(TAG, "HandshakeState createClientHello failed", t)
            null
        }
    }

    /**
     * Feed ServerHello bytes, get ClientFinish bytes back.
     */
    fun handshakeProcessServerHello(hsHandle: Long, serverHello: ByteArray): ByteArray? {
        return try {
            nativeHandshakeProcessServerHello(hsHandle, serverHello)
        } catch (t: Throwable) {
            Log.e(TAG, "HandshakeState processServerHello failed", t)
            null
        }
    }

    /**
     * Finalize handshake → extract session data.
     * Returns map: { ok: Boolean, session_key: ByteArray, session_id: ByteArray,
     *                peer_did: String, peer_public_key: ByteArray }
     * Consumes the HandshakeState (do not call handshakeFree after this).
     */
    fun handshakeFinalize(hsHandle: Long): Map<String, Any?>? {
        return try {
            @Suppress("UNCHECKED_CAST")
            nativeHandshakeFinalize(hsHandle) as? Map<String, Any?>
        } catch (t: Throwable) {
            Log.e(TAG, "HandshakeState finalize failed", t)
            mapOf("ok" to false, "error" to t.message)
        }
    }

    /**
     * Free a HandshakeState that was NOT finalized (e.g. on error path).
     */
    fun handshakeFree(hsHandle: Long) {
        try {
            nativeHandshakeFree(hsHandle)
        } catch (t: Throwable) {
            Log.e(TAG, "HandshakeState free failed", t)
        }
    }

    /**
     * Perform full 3-leg UHP handshake via lib-client HandshakeState.
     * Secret keys never leave Rust.
     *
     * @return Map with ok, handle (QUIC connection), session_key, session_id, peer_did
     *
     * NOTE: Currently blocked on quinn-ffi needing ALPN-aware connect (zhtp-uhp/2).
     * uhp_quic_connect_public uses zhtp-public/1 ALPN which is wrong for UHP.
     */
    fun handshakeViaLibClient(
        host: String,
        port: Int,
        serverName: String,
        spkiPinHex: String,
        identityHandle: Long
    ): Map<String, Any?> {
        if (!ensureInitialized()) {
            return mapOf("ok" to false, "error" to "Native QUIC library not loaded")
        }

        // Step 1: Open QUIC connection (public ALPN)
        // TODO: Needs ALPN-aware connect for zhtp-uhp/2.
        //       Currently uses uhp_quic_connect_public which negotiates zhtp-public/1.
        val connectResult = try {
            @Suppress("UNCHECKED_CAST")
            nativeUhpQuicConnectPublic(host, port, serverName, spkiPinHex) as? Map<String, Any?>
        } catch (t: Throwable) {
            return mapOf("ok" to false, "error" to "QUIC connect failed: ${t.message}")
        }

        val quicOk = connectResult?.get("ok") as? Boolean ?: false
        if (!quicOk) {
            val err = connectResult?.get("error") as? String ?: "QUIC connect failed"
            return mapOf("ok" to false, "error" to err)
        }
        val quicHandle = (connectResult?.get("handle") as? Number)?.toLong() ?: 0L

        // Step 2: Compute channel binding — Blake3(sorted(local_addr || peer_addr))
        // For now, use a placeholder. Real implementation needs local/peer socket addresses.
        val channelBinding = computeChannelBinding(host, port)

        // Step 3: Create HandshakeState (identity handle — keys stay in Rust)
        val hsHandle = handshakeNew(identityHandle, channelBinding)
        if (hsHandle == 0L) {
            uhpQuicClose(quicHandle)
            return mapOf("ok" to false, "error" to "Failed to create HandshakeState")
        }

        try {
            // Step 4: Leg 1 — ClientHello
            val clientHello = handshakeCreateClientHello(hsHandle)
                ?: run {
                    handshakeFree(hsHandle)
                    uhpQuicClose(quicHandle)
                    return mapOf("ok" to false, "error" to "Failed to create ClientHello")
                }

            // Send ClientHello via QUIC, receive ServerHello
            val leg1Result = uhpQuicRequest(quicHandle, clientHello)
            val leg1Ok = leg1Result?.get("ok") as? Boolean ?: false
            if (!leg1Ok) {
                handshakeFree(hsHandle)
                uhpQuicClose(quicHandle)
                return mapOf("ok" to false, "error" to "Leg 1 send/receive failed: ${leg1Result?.get("error")}")
            }
            val serverHello = leg1Result?.get("response") as? ByteArray
                ?: run {
                    handshakeFree(hsHandle)
                    uhpQuicClose(quicHandle)
                    return mapOf("ok" to false, "error" to "No ServerHello received")
                }

            // Step 5: Leg 2 — process ServerHello → ClientFinish
            val clientFinish = handshakeProcessServerHello(hsHandle, serverHello)
                ?: run {
                    handshakeFree(hsHandle)
                    uhpQuicClose(quicHandle)
                    return mapOf("ok" to false, "error" to "Failed to process ServerHello")
                }

            // Send ClientFinish
            val leg2Result = uhpQuicRequest(quicHandle, clientFinish)
            val leg2Ok = leg2Result?.get("ok") as? Boolean ?: false
            if (!leg2Ok) {
                handshakeFree(hsHandle)
                uhpQuicClose(quicHandle)
                return mapOf("ok" to false, "error" to "Leg 2 send failed: ${leg2Result?.get("error")}")
            }

            // Step 6: Finalize — derive session (consumes hsHandle)
            val sessionResult = handshakeFinalize(hsHandle)
            val sessionOk = sessionResult?.get("ok") as? Boolean ?: false
            if (!sessionOk) {
                uhpQuicClose(quicHandle)
                return mapOf("ok" to false, "error" to "Handshake finalization failed: ${sessionResult?.get("error")}")
            }

            return mapOf(
                "ok" to true,
                "handle" to quicHandle,
                "session_key" to sessionResult?.get("session_key"),
                "session_id" to sessionResult?.get("session_id"),
                "peer_did" to sessionResult?.get("peer_did"),
                "peer_public_key" to sessionResult?.get("peer_public_key")
            )
        } catch (t: Throwable) {
            Log.e(TAG, "lib-client handshake failed", t)
            uhpQuicClose(quicHandle)
            return mapOf("ok" to false, "error" to "Handshake error: ${t.message}")
        }
    }

    /**
     * Compute channel binding for UHP: Blake3(sorted(local_addr || peer_addr)).
     * Simplified: uses "0.0.0.0:0" as local (real impl needs actual socket addresses).
     */
    private fun computeChannelBinding(host: String, port: Int): ByteArray {
        val local = "0.0.0.0:0"
        val peer = "$host:$port"
        val sorted = if (local <= peer) "$local$peer" else "$peer$local"
        // Blake3 hash — delegate to JNI
        return try {
            nativeBlake3(sorted.toByteArray(Charsets.UTF_8)) ?: ByteArray(32)
        } catch (t: Throwable) {
            Log.e(TAG, "Blake3 computation failed", t)
            ByteArray(32)
        }
    }

    private fun ensureInitialized(): Boolean {
        if (!isLibraryLoaded) {
            Log.e(TAG, "Native QUIC library not loaded")
            return false
        }
        if (!isInitialized) {
            return init()
        }
        return true
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
    private external fun nativeUhpQuicConnectPublic(
        host: String,
        port: Int,
        serverName: String,
        spkiPinHex: String
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

    // HandshakeState JNI — 3-leg UHP, keys stay in Rust
    private external fun nativeHandshakeNew(identityHandle: Long, channelBinding: ByteArray): Long
    private external fun nativeHandshakeCreateClientHello(hsHandle: Long): ByteArray?
    private external fun nativeHandshakeProcessServerHello(hsHandle: Long, serverHello: ByteArray): ByteArray?
    private external fun nativeHandshakeFinalize(hsHandle: Long): Any?
    private external fun nativeHandshakeFree(hsHandle: Long)

    // Utility
    private external fun nativeBlake3(data: ByteArray): ByteArray?
}
