package com.sovereignnetworkmobile

import android.util.Log
import java.nio.ByteBuffer

/**
 * Kotlin wrapper over the lib-client Lobby Auth OPAQUE FFI
 * (`zhtp_opaque_*` / `zhtp_lobby_mac_compute`). Mirrors
 * `ios/LobbyAuth.swift`.
 *
 * The Rust OPAQUE state pointers cross the JNI boundary as raw `Long`
 * handles — the caller holds one between a `start` call and the
 * matching `finish`/`cancel`. `finish` CONSUMES the handle (the Rust
 * side frees it); `cancel` frees it explicitly. Each handle must be
 * disposed exactly once via exactly one of those two paths.
 *
 * The `native*` JNI functions return packed `byte[]`s; this object
 * unpacks them into typed result classes. See `lobby_auth_jni.rs` for
 * the authoritative packing layouts.
 */
object LobbyAuth {

    private const val TAG = "LobbyAuth"

    init {
        try {
            System.loadLibrary("quic_jni")
        } catch (e: UnsatisfiedLinkError) {
            Log.e(TAG, "Failed to load native library", e)
        }
    }

    // ── Result types ─────────────────────────────────────────────────

    /** Result of `opaqueRegisterStart` / `opaqueLoginStart`. */
    data class StartResult(val stateHandle: Long, val request: ByteArray) {
        override fun equals(other: Any?): Boolean =
            other is StartResult && stateHandle == other.stateHandle &&
                request.contentEquals(other.request)
        override fun hashCode(): Int =
            stateHandle.hashCode() * 31 + request.contentHashCode()
    }

    /** Result of `opaqueRegisterFinish`. */
    data class RegisterFinishResult(val record: ByteArray, val exportKey: ByteArray) {
        override fun equals(other: Any?): Boolean =
            other is RegisterFinishResult && record.contentEquals(other.record) &&
                exportKey.contentEquals(other.exportKey)
        override fun hashCode(): Int =
            record.contentHashCode() * 31 + exportKey.contentHashCode()
    }

    /** Result of `opaqueLoginFinish`. */
    data class LoginFinishResult(
        val msg3: ByteArray,
        val sessionKey: ByteArray,
        val exportKey: ByteArray,
    ) {
        override fun equals(other: Any?): Boolean =
            other is LoginFinishResult && msg3.contentEquals(other.msg3) &&
                sessionKey.contentEquals(other.sessionKey) &&
                exportKey.contentEquals(other.exportKey)
        override fun hashCode(): Int {
            var h = msg3.contentHashCode()
            h = h * 31 + sessionKey.contentHashCode()
            h = h * 31 + exportKey.contentHashCode()
            return h
        }
    }

    /**
     * A `*_finish` failed. `rc` is the FFI return code:
     * -1 INVALID_ARGS, -2 DESERIALIZE, -3 OPAQUE_FINISH (wrong
     * password on the login path).
     */
    class OpaqueFinishException(val rc: Int) : Exception("OPAQUE finish failed (rc=$rc)")

    // ── OPAQUE registration ──────────────────────────────────────────

    /**
     * Step 1 of registration. Returns the in-flight state handle plus
     * the request blob to POST to the server, or null on FFI failure.
     */
    fun opaqueRegisterStart(password: String): StartResult? =
        unpackStart(nativeOpaqueRegisterStart(password))

    /**
     * Step 2 of registration. CONSUMES `stateHandle`. Throws
     * [OpaqueFinishException] on a non-zero FFI return code.
     */
    @Throws(OpaqueFinishException::class)
    fun opaqueRegisterFinish(
        stateHandle: Long,
        password: String,
        serverMsg: ByteArray,
    ): RegisterFinishResult {
        val packed = nativeOpaqueRegisterFinish(stateHandle, password, serverMsg)
        val rc = packed[0].toInt()
        if (rc != 0) throw OpaqueFinishException(rc)

        val buf = ByteBuffer.wrap(packed)
        buf.position(1)
        val recordLen = buf.int
        val record = ByteArray(recordLen)
        buf.get(record)
        val exportKey = ByteArray(buf.remaining())
        buf.get(exportKey)
        return RegisterFinishResult(record, exportKey)
    }

    /** Free a register-state handle without finishing the flow. */
    fun opaqueRegisterCancel(stateHandle: Long) {
        nativeOpaqueRegisterCancel(stateHandle)
    }

    // ── OPAQUE login ─────────────────────────────────────────────────

    /**
     * Step 1 of login. Returns the in-flight state handle plus the
     * request blob to POST to the server, or null on FFI failure.
     */
    fun opaqueLoginStart(password: String): StartResult? =
        unpackStart(nativeOpaqueLoginStart(password))

    /**
     * Step 2 of login. CONSUMES `stateHandle`. Throws
     * [OpaqueFinishException] on a non-zero FFI return code — rc -3 is
     * the "wrong password" signal.
     */
    @Throws(OpaqueFinishException::class)
    fun opaqueLoginFinish(
        stateHandle: Long,
        password: String,
        serverMsg: ByteArray,
    ): LoginFinishResult {
        val packed = nativeOpaqueLoginFinish(stateHandle, password, serverMsg)
        val rc = packed[0].toInt()
        if (rc != 0) throw OpaqueFinishException(rc)

        val buf = ByteBuffer.wrap(packed)
        buf.position(1)
        val msg3Len = buf.int
        val msg3 = ByteArray(msg3Len)
        buf.get(msg3)
        val sessionKey = ByteArray(64)
        buf.get(sessionKey)
        val exportKey = ByteArray(64)
        buf.get(exportKey)
        return LoginFinishResult(msg3, sessionKey, exportKey)
    }

    /** Free a login-state handle without finishing the flow. */
    fun opaqueLoginCancel(stateHandle: Long) {
        nativeOpaqueLoginCancel(stateHandle)
    }

    // ── Channel-binding MAC ──────────────────────────────────────────

    /**
     * Compute the per-request HMAC for a lobby request. `sessionKey`
     * must be exactly 64 bytes (the key from [opaqueLoginFinish]).
     * `method` is the method byte (GET=0 … OPTIONS=6). Returns the
     * 32-byte MAC, or null on FFI failure.
     */
    fun lobbyMacCompute(
        sessionKey: ByteArray,
        method: Int,
        uri: String,
        body: ByteArray,
        seq: Long,
    ): ByteArray? = nativeLobbyMacCompute(sessionKey, method, uri, body, seq)

    // ── Packing helpers ──────────────────────────────────────────────

    private fun unpackStart(packed: ByteArray?): StartResult? {
        if (packed == null || packed.size < 8) return null
        val buf = ByteBuffer.wrap(packed)
        val handle = buf.long
        val request = ByteArray(buf.remaining())
        buf.get(request)
        return StartResult(handle, request)
    }

    // ── JNI declarations ─────────────────────────────────────────────
    //
    // NOTE: do NOT mark these `internal` — Kotlin name-mangles
    // internal functions, which breaks the unmangled
    // `Java_..._native*` symbol lookup the JNI does in the .so.

    @JvmStatic
    external fun nativeOpaqueRegisterStart(password: String): ByteArray?

    @JvmStatic
    external fun nativeOpaqueRegisterFinish(
        stateHandle: Long,
        password: String,
        serverMsg: ByteArray,
    ): ByteArray

    @JvmStatic
    external fun nativeOpaqueRegisterCancel(stateHandle: Long)

    @JvmStatic
    external fun nativeOpaqueLoginStart(password: String): ByteArray?

    @JvmStatic
    external fun nativeOpaqueLoginFinish(
        stateHandle: Long,
        password: String,
        serverMsg: ByteArray,
    ): ByteArray

    @JvmStatic
    external fun nativeOpaqueLoginCancel(stateHandle: Long)

    @JvmStatic
    external fun nativeLobbyMacCompute(
        sessionKey: ByteArray,
        method: Int,
        uri: String,
        body: ByteArray,
        seq: Long,
    ): ByteArray?

    /** Method byte encoding matching `lib-client::opaque::method`. */
    object Method {
        const val GET = 0
        const val POST = 1
        const val PUT = 2
        const val DELETE = 3
        const val PATCH = 4
        const val HEAD = 5
        const val OPTIONS = 6
    }
}
