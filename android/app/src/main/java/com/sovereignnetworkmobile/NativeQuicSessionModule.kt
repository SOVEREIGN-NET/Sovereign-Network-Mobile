package com.sovereignnetworkmobile

import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.net.InetAddress
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * React Native bridge for the persistent QUIC session FFI.
 * Mirrors `ios/NativeQuicSession.swift`: openSession / rpc /
 * openInbound / closeInbound / closeSession, plus three
 * device-emitted events for inbound stream lifecycle
 * (`QuicInboundFrame`, `QuicInboundClosed`, `QuicInboundError`).
 *
 * JS-side `NativeEventEmitter` listens to those events globally —
 * the `nativeModule` arg passed on iOS is ignored on Android, which
 * relies on `DeviceEventManagerModule.RCTDeviceEventEmitter` as the
 * canonical event bus.
 */
class NativeQuicSessionModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "NativeQuicSession"

    private val sessions = ConcurrentHashMap<String, QuicSession>()
    private val inboundStreams = ConcurrentHashMap<String, InboundStreamRunner>()

    // One reader thread per inbound stream. We size the pool to
    // grow as needed — there's only ever a handful of inbound
    // streams (typically one: /msg/inbound) and they live as long
    // as the session.
    private val readerPool = Executors.newCachedThreadPool { r ->
        Thread(r, "QuicInboundReader").apply { isDaemon = true }
    }

    private val rpcPool = Executors.newCachedThreadPool { r ->
        Thread(r, "QuicSessionRpc").apply { isDaemon = true }
    }

    private fun emit(event: String, body: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(event, body)
    }

    private fun loadIdentityForDid(did: String): Identity? {
        val ctx = reactApplicationContext
        val currentId = IdentityStore.getCurrentIdentityId(ctx) ?: return null
        val storedDid = IdentityStore.getStoredDid(ctx, currentId) ?: return null
        if (storedDid != did) return null
        return IdentityStore.loadIdentity(ctx, currentId)
    }

    // ── openSession ─────────────────────────────────────────────

    @ReactMethod
    fun openSession(
        identityDid: String,
        host: String,
        port: Int,
        alpn: Int,
        sni: String?,
        spkiPinHex: String?,
        promise: Promise,
    ) {
        val identity: Identity? = if (alpn == 1) {
            loadIdentityForDid(identityDid)
                ?: return promise.reject(
                    "NO_IDENTITY",
                    "No live Identity for did $identityDid",
                )
        } else {
            null
        }

        // lib-client's connect path uses `SocketAddr::from_str` which
        // only accepts literal IPs — hostnames are rejected at parse
        // time and the FFI returns null with no detail. Resolve here.
        val resolvedHost = try {
            if (host.matches(Regex("\\d+\\.\\d+\\.\\d+\\.\\d+"))) {
                host
            } else {
                InetAddress.getByName(host).hostAddress ?: host
            }
        } catch (_: Throwable) {
            host
        }
        if (resolvedHost != host) {
            android.util.Log.i(
                "NativeQuicSession",
                "resolved $host -> $resolvedHost",
            )
        }

        rpcPool.execute {
            try {
                val session = QuicSession.open(resolvedHost, port, alpn, identity)
                    ?: return@execute promise.reject(
                        "OPEN_FAILED",
                        "QuicSession.open returned null",
                    )
                val id = UUID.randomUUID().toString()
                sessions[id] = session
                promise.resolve(id)
            } catch (e: Throwable) {
                promise.reject("OPEN_FAILED", e.message ?: "openSession failed", e)
            }
        }
    }

    @ReactMethod
    fun closeSession(sessionId: String) {
        // Any inbound readers attached to this session are blocked
        // in `nativeInboundRead` (1 s polling timeout). Freeing the
        // session while a read is in-flight crashes the process —
        // cancel-and-join readers first, then close the session.
        // Hop off the bridge thread because the join can take up
        // to ~2.5 s if a reader is mid-blocking-call.
        rpcPool.execute {
            val attached = inboundStreams.values
                .filter { it.sessionId == sessionId }
            for (r in attached) r.cancelled.set(true)
            for (r in attached) {
                try {
                    r.exited.await(2_500, TimeUnit.MILLISECONDS)
                } catch (_: InterruptedException) { /* shutting down */ }
            }
            val s = sessions.remove(sessionId) ?: return@execute
            try {
                s.close()
            } catch (_: Throwable) { /* best-effort */ }
        }
    }

    // ── rpc ─────────────────────────────────────────────────────

    @ReactMethod
    fun rpc(
        sessionId: String,
        method: String,
        path: String,
        headersJson: String?,
        bodyB64: String?,
        promise: Promise,
    ) {
        val session = sessions[sessionId]
            ?: return promise.reject("NO_SESSION", "session $sessionId not found")
        val body: ByteArray = try {
            if (bodyB64.isNullOrEmpty()) ByteArray(0)
            else Base64.decode(bodyB64, Base64.NO_WRAP)
        } catch (_: IllegalArgumentException) {
            return promise.reject("INVALID_ARG", "bodyB64 not base64")
        }

        rpcPool.execute {
            try {
                val r = session.rpc(method, path, body)
                    ?: return@execute promise.reject("RPC_FAILED", "transport error")
                val map = Arguments.createMap().apply {
                    putInt("status", r.status)
                    putString(
                        "statusText",
                        if (r.status in 200..299) "OK" else "Error",
                    )
                    putMap("headers", Arguments.createMap())
                    putString("body", String(r.body, Charsets.UTF_8))
                    putBoolean("ok", r.status in 200..299)
                }
                promise.resolve(map)
            } catch (e: Throwable) {
                promise.reject("RPC_FAILED", e.message ?: "rpc failed", e)
            }
        }
    }

    // ── inbound subscribe ───────────────────────────────────────

    @ReactMethod
    fun openInbound(sessionId: String, path: String, promise: Promise) {
        val session = sessions[sessionId]
            ?: return promise.reject("NO_SESSION", "session $sessionId not found")

        rpcPool.execute {
            try {
                val stream = session.openInbound(path)
                    ?: return@execute promise.reject(
                        "INBOUND_OPEN_FAILED",
                        "openInbound returned null",
                    )
                val streamId = UUID.randomUUID().toString()
                val cancelled = AtomicBoolean(false)
                val exited = CountDownLatch(1)
                val runner = InboundStreamRunner(
                    stream = stream,
                    sessionId = sessionId,
                    cancelled = cancelled,
                    exited = exited,
                )
                inboundStreams[streamId] = runner

                readerPool.execute {
                    runReaderLoop(streamId, stream, cancelled, exited)
                }
                promise.resolve(streamId)
            } catch (e: Throwable) {
                promise.reject(
                    "INBOUND_OPEN_FAILED",
                    e.message ?: "openInbound failed",
                    e,
                )
            }
        }
    }

    @ReactMethod
    fun closeInbound(streamId: String) {
        // Only signal cancellation. The reader thread is blocked
        // in `nativeInboundRead` for up to 1 s; calling
        // `stream.close()` from here while that's in-flight is a
        // UAF on the lib-client side. The reader closes the stream
        // itself when its loop exits.
        val runner = inboundStreams[streamId] ?: return
        runner.cancelled.set(true)
    }

    private fun runReaderLoop(
        streamId: String,
        stream: InboundStream,
        cancelled: AtomicBoolean,
        exited: CountDownLatch,
    ) {
        try {
            while (!cancelled.get()) {
                val frame = try {
                    stream.read(1000)
                } catch (e: Throwable) {
                    emit(
                        "QuicInboundError",
                        Arguments.createMap().apply {
                            putString("streamId", streamId)
                            putString("error", e.message ?: e.toString())
                        },
                    )
                    return
                }

                when {
                    frame == null -> {
                        emit(
                            "QuicInboundClosed",
                            Arguments.createMap().apply {
                                putString("streamId", streamId)
                            },
                        )
                        return
                    }
                    frame.isEmpty() -> {
                        // timeout — loop again, letting the cancelled
                        // check fire promptly.
                    }
                    else -> {
                        val b64 = Base64.encodeToString(frame, Base64.NO_WRAP)
                        emit(
                            "QuicInboundFrame",
                            Arguments.createMap().apply {
                                putString("streamId", streamId)
                                putString("frameB64", b64)
                            },
                        )
                    }
                }
            }
        } finally {
            // Close the stream from the same thread that was driving
            // the blocking read. This is the only safe sequencing —
            // freeing the native handle while another thread is in
            // `nativeInboundRead` is a UAF. After this returns, the
            // session-close path is free to drop the parent session.
            try {
                stream.close()
            } catch (_: Throwable) { /* best-effort */ }
            inboundStreams.remove(streamId)
            exited.countDown()
        }
    }

    // ── NativeEventEmitter contract on Android ─────────────────
    //
    // RN warns if the JS side instantiates NativeEventEmitter
    // against a module that doesn't declare these. Implementations
    // are no-ops since DeviceEventManagerModule already does the
    // routing.

    @ReactMethod
    fun addListener(eventName: String) { /* no-op */ }

    @ReactMethod
    fun removeListeners(count: Int) { /* no-op */ }
}

/**
 * Per-inbound-stream state. The reader thread closes the stream
 * itself on exit (after its blocking `nativeInboundRead` returns
 * or sees cancellation) and counts down `exited`. External
 * callers must NOT call `stream.close()` while the reader could
 * be mid-read — concurrent close while a read is in flight is a
 * UAF on the lib-client side.
 */
internal data class InboundStreamRunner(
    val stream: InboundStream,
    val sessionId: String,
    val cancelled: AtomicBoolean,
    val exited: CountDownLatch,
)
