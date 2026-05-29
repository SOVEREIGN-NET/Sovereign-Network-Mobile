package com.sovereignnetworkmobile

import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.concurrent.Executors

/**
 * React Native bridge for the Lobby Auth OPAQUE flow. Mirrors
 * `ios/NativeLobbyAuth.swift`.
 *
 * All binary values cross the JS bridge as standard-alphabet,
 * padded base64 strings. The OPAQUE state pointer is exposed to JS as
 * `stateId` — the decimal string of the native `Long` handle.
 *
 * `opaqueRegisterFinish` / `opaqueLoginFinish` run Argon2id
 * (~200ms, 64MiB), so all FFI work is dispatched onto a background
 * executor — never the JS thread.
 */
class NativeLobbyAuthModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "NativeLobbyAuth"

    // OPAQUE / Argon2id is CPU-bound and runs ~200ms per finish; a
    // cached pool keeps the JS thread free without holding idle threads.
    private val workPool = Executors.newCachedThreadPool { r ->
        Thread(r, "LobbyAuthWorker").apply { isDaemon = true }
    }

    private fun b64(bytes: ByteArray): String =
        Base64.encodeToString(bytes, Base64.NO_WRAP)

    private fun decodeB64(value: String): ByteArray =
        Base64.decode(value, Base64.NO_WRAP)

    /** Map an OPAQUE finish return code to the JS-facing reject pair. */
    private fun finishRejectCode(rc: Int, loginPath: Boolean): Pair<String, String> = when (rc) {
        -1 -> "INVALID_ARGS" to "invalid arguments"
        -2 -> "DESERIALIZE" to "failed to deserialize server response"
        -3 -> if (loginPath) {
            "WRONG_PASSWORD" to "incorrect username or password"
        } else {
            "OPAQUE_FINISH_FAILED" to "OPAQUE registration finish failed"
        }
        else -> "OPAQUE_FINISH_FAILED" to "OPAQUE finish failed (rc=$rc)"
    }

    // ── Registration ─────────────────────────────────────────────────

    @ReactMethod
    fun opaqueRegisterStart(password: String, promise: Promise) {
        workPool.execute {
            try {
                val result = LobbyAuth.opaqueRegisterStart(password)
                    ?: return@execute promise.reject(
                        "START_FAILED",
                        "OPAQUE register start returned null",
                    )
                val map = Arguments.createMap().apply {
                    putString("stateId", result.stateHandle.toString())
                    putString("requestB64", b64(result.request))
                }
                promise.resolve(map)
            } catch (e: Throwable) {
                promise.reject("START_FAILED", e.message ?: "register start failed", e)
            }
        }
    }

    @ReactMethod
    fun opaqueRegisterFinish(
        stateId: String,
        password: String,
        serverMsgB64: String,
        promise: Promise,
    ) {
        val handle = stateId.toLongOrNull()
            ?: return promise.reject("INVALID_ARGS", "stateId is not a valid handle")
        val serverMsg = try {
            decodeB64(serverMsgB64)
        } catch (_: IllegalArgumentException) {
            return promise.reject("INVALID_ARGS", "serverMsgB64 is not valid base64")
        }

        workPool.execute {
            try {
                val result = LobbyAuth.opaqueRegisterFinish(handle, password, serverMsg)
                val map = Arguments.createMap().apply {
                    putString("recordB64", b64(result.record))
                    putString("exportKeyB64", b64(result.exportKey))
                }
                promise.resolve(map)
            } catch (e: LobbyAuth.OpaqueFinishException) {
                val (code, message) = finishRejectCode(e.rc, loginPath = false)
                promise.reject(code, message)
            } catch (e: Throwable) {
                promise.reject("OPAQUE_FINISH_FAILED", e.message ?: "register finish failed", e)
            }
        }
    }

    @ReactMethod
    fun opaqueRegisterCancel(stateId: String, promise: Promise) {
        val handle = stateId.toLongOrNull()
            ?: return promise.reject("INVALID_ARGS", "stateId is not a valid handle")
        try {
            LobbyAuth.opaqueRegisterCancel(handle)
            promise.resolve(null)
        } catch (e: Throwable) {
            promise.reject("CANCEL_FAILED", e.message ?: "register cancel failed", e)
        }
    }

    // ── Login ────────────────────────────────────────────────────────

    @ReactMethod
    fun opaqueLoginStart(password: String, promise: Promise) {
        workPool.execute {
            try {
                val result = LobbyAuth.opaqueLoginStart(password)
                    ?: return@execute promise.reject(
                        "START_FAILED",
                        "OPAQUE login start returned null",
                    )
                val map = Arguments.createMap().apply {
                    putString("stateId", result.stateHandle.toString())
                    putString("requestB64", b64(result.request))
                }
                promise.resolve(map)
            } catch (e: Throwable) {
                promise.reject("START_FAILED", e.message ?: "login start failed", e)
            }
        }
    }

    @ReactMethod
    fun opaqueLoginFinish(
        stateId: String,
        password: String,
        serverMsgB64: String,
        promise: Promise,
    ) {
        val handle = stateId.toLongOrNull()
            ?: return promise.reject("INVALID_ARGS", "stateId is not a valid handle")
        val serverMsg = try {
            decodeB64(serverMsgB64)
        } catch (_: IllegalArgumentException) {
            return promise.reject("INVALID_ARGS", "serverMsgB64 is not valid base64")
        }

        workPool.execute {
            try {
                val result = LobbyAuth.opaqueLoginFinish(handle, password, serverMsg)
                val map = Arguments.createMap().apply {
                    putString("msg3B64", b64(result.msg3))
                    putString("sessionKeyB64", b64(result.sessionKey))
                    putString("exportKeyB64", b64(result.exportKey))
                }
                promise.resolve(map)
            } catch (e: LobbyAuth.OpaqueFinishException) {
                val (code, message) = finishRejectCode(e.rc, loginPath = true)
                promise.reject(code, message)
            } catch (e: Throwable) {
                promise.reject("OPAQUE_FINISH_FAILED", e.message ?: "login finish failed", e)
            }
        }
    }

    @ReactMethod
    fun opaqueLoginCancel(stateId: String, promise: Promise) {
        val handle = stateId.toLongOrNull()
            ?: return promise.reject("INVALID_ARGS", "stateId is not a valid handle")
        try {
            LobbyAuth.opaqueLoginCancel(handle)
            promise.resolve(null)
        } catch (e: Throwable) {
            promise.reject("CANCEL_FAILED", e.message ?: "login cancel failed", e)
        }
    }

    // ── Channel-binding MAC ──────────────────────────────────────────

    @ReactMethod
    fun lobbyMacCompute(
        sessionKeyB64: String,
        method: Double,
        uri: String,
        bodyB64: String,
        seq: Double,
        promise: Promise,
    ) {
        val sessionKey = try {
            decodeB64(sessionKeyB64)
        } catch (_: IllegalArgumentException) {
            return promise.reject("INVALID_ARGS", "sessionKeyB64 is not valid base64")
        }
        if (sessionKey.size != 64) {
            return promise.reject("INVALID_ARGS", "sessionKey must be 64 bytes")
        }
        val body = try {
            decodeB64(bodyB64)
        } catch (_: IllegalArgumentException) {
            return promise.reject("INVALID_ARGS", "bodyB64 is not valid base64")
        }
        val methodByte = method.toInt()
        if (methodByte < 0 || methodByte > 6) {
            return promise.reject("INVALID_ARGS", "method must be 0..6")
        }
        // seq is a u64 carried as a JS number; `toLong()` preserves the
        // bit pattern the Rust side reads back as u64.
        val seqLong = seq.toLong()

        workPool.execute {
            try {
                val mac = LobbyAuth.lobbyMacCompute(sessionKey, methodByte, uri, body, seqLong)
                    ?: return@execute promise.reject(
                        "MAC_FAILED",
                        "lobby MAC compute returned null",
                    )
                val map = Arguments.createMap().apply {
                    putString("macHex", toHex(mac))
                }
                promise.resolve(map)
            } catch (e: Throwable) {
                promise.reject("MAC_FAILED", e.message ?: "MAC compute failed", e)
            }
        }
    }

    private fun toHex(bytes: ByteArray): String {
        val sb = StringBuilder(bytes.size * 2)
        for (b in bytes) {
            val v = b.toInt() and 0xff
            sb.append(HEX_CHARS[v ushr 4])
            sb.append(HEX_CHARS[v and 0x0f])
        }
        return sb.toString()
    }

    companion object {
        private val HEX_CHARS = "0123456789abcdef".toCharArray()
    }
}
