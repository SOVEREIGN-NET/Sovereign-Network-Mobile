package com.sovereignnetworkmobile

import java.io.Closeable

/**
 * Persistent UHP-authenticated QUIC session bound to a single
 * `Identity`. Opens once, lives for the signed-in lifetime, and
 * multiplexes RPCs + an inbound server-push stream over the same
 * connection.
 *
 * Mirrors `ios/QuicSession.swift`. Native handles cross the JNI as
 * opaque `Long` values; raw FFI pointers never leak to JS.
 */
class QuicSession private constructor(
    private var handle: Long,
) : Closeable {

    private var closed = false

    /**
     * Issue one RPC over the live session. Each call opens a new
     * bidi stream and runs concurrently with other RPCs / inbound
     * streams. Returns null on transport-fatal errors; otherwise
     * the response status + body.
     */
    fun rpc(method: String, path: String, body: ByteArray): RpcResult? {
        check(!closed) { "session is closed" }
        val raw = nativeSessionRpc(handle, method, path, body) ?: return null
        if (raw.size < 2) return null
        val status = ((raw[0].toInt() and 0xff) shl 8) or (raw[1].toInt() and 0xff)
        val bodyBytes = if (raw.size > 2) raw.copyOfRange(2, raw.size) else ByteArray(0)
        return RpcResult(status, bodyBytes)
    }

    /**
     * Open a long-lived server-push stream at `path`. The returned
     * `InboundStream` owns the native handle and exposes a blocking
     * reader the bridge layer drives in a dedicated thread.
     */
    fun openInbound(path: String): InboundStream? {
        check(!closed) { "session is closed" }
        val streamHandle = nativeInboundOpen(handle, path)
        if (streamHandle == 0L) return null
        return InboundStream(streamHandle)
    }

    override fun close() {
        if (closed) return
        closed = true
        if (handle != 0L) {
            nativeSessionClose(handle)
            handle = 0
        }
    }

    companion object {
        init {
            // The quic-jni .so is already loaded by Identity.kt /
            // Messaging.kt earlier in the lifecycle, so this is a
            // no-op safety net.
            try {
                System.loadLibrary("quicjni")
            } catch (_: UnsatisfiedLinkError) {
                /* already loaded */
            }
        }

        /**
         * Open a new session. `alpn`: 0 = zhtp-public/1, 1 = zhtp-uhp/2
         * (authenticated — requires a live `Identity`).
         */
        fun open(
            host: String,
            port: Int,
            alpn: Int,
            identity: Identity?,
        ): QuicSession? {
            val identityHandle = identity?.nativeHandle() ?: 0L
            if (alpn == 1 && identityHandle == 0L) return null
            val handle = nativeSessionOpen(host, port, alpn, identityHandle)
            if (handle == 0L) return null
            return QuicSession(handle)
        }

        @JvmStatic
        private external fun nativeSessionOpen(
            host: String,
            port: Int,
            alpn: Int,
            identityHandle: Long,
        ): Long

        @JvmStatic
        private external fun nativeSessionClose(session: Long)

        @JvmStatic
        private external fun nativeSessionRpc(
            session: Long,
            method: String,
            path: String,
            body: ByteArray,
        ): ByteArray?

        // NOTE: do NOT mark these `internal` — Kotlin mangles
        // internal functions to `<name>$<module>_<config>` (e.g.
        // `nativeInboundOpen$app_debug`) for module-visibility
        // enforcement at the JVM level. JNI looks for the
        // unmangled `Java_..._nativeInboundOpen` symbol in the
        // .so and crashes with "No implementation found".
        // Public is the right visibility here; the InboundStream
        // wrapper is the only legitimate consumer anyway.
        @JvmStatic
        external fun nativeInboundOpen(session: Long, path: String): Long

        @JvmStatic
        external fun nativeInboundRead(stream: Long, timeoutMs: Int): ByteArray?

        @JvmStatic
        external fun nativeInboundClose(stream: Long)
    }
}

data class RpcResult(val status: Int, val body: ByteArray) {
    // Generated equals/hashCode would be wrong for ByteArray, but
    // we don't compare RpcResult values across calls.
}

/**
 * One inbound server-push stream. Reader thread on the bridge side
 * drains frames via `read(timeoutMs)`. Closes free the native
 * handle exactly once.
 */
class InboundStream internal constructor(
    private var handle: Long,
) : Closeable {

    private var closed = false

    /**
     * Read one frame. Semantics mirror the FFI:
     *   - null         → stream closed (peer or transport error)
     *   - empty array  → timeout (no frame within `timeoutMs`)
     *   - non-empty    → one decoded envelope frame
     */
    fun read(timeoutMs: Int): ByteArray? {
        if (closed || handle == 0L) return null
        return QuicSession.nativeInboundRead(handle, timeoutMs)
    }

    override fun close() {
        if (closed) return
        closed = true
        if (handle != 0L) {
            QuicSession.nativeInboundClose(handle)
            handle = 0
        }
    }
}
