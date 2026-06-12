package com.sovereignnetworkmobile

import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableNativeArray
import com.facebook.react.bridge.WritableNativeMap
import com.sovereignnetworkmobile.BuildConfig
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.util.concurrent.Executor
import java.util.concurrent.Executors
import kotlin.random.Random

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
    }

    // Active validator target — initialized from the primary bootstrap
    // gateway. Identity is the on-chain DID (`activeExpectedDid`); TLS is
    // accept-any. The dial target is the gateway's IP (skips DNS so a
    // single DNS-record typo can't black-hole us); SNI is its hostname.
    // `setActiveValidator(host, port, expectedDid, sni)` swaps all four
    // once the directory has been fetched.
    private val bootstrapPrimary =
        com.sovereignnetworkmobile.config.GeneratedConfig.BOOTSTRAP_GATEWAYS.firstOrNull()
    private var quinnControlPlaneHost: String =
        bootstrapPrimary?.ip?.takeIf { it.isNotEmpty() }
            ?: bootstrapPrimary?.host
            ?: com.sovereignnetworkmobile.config.GeneratedConfig.NODE_HOST
    private var quinnControlPlanePort: Int =
        com.sovereignnetworkmobile.config.GeneratedConfig.NODE_PORT
    private var quinnControlPlaneServerName: String =
        bootstrapPrimary?.host
            ?: com.sovereignnetworkmobile.config.GeneratedConfig.NODE_HOST
    // Expected on-chain DID for the active validator. The UHP-v2 handshake's
    // `peer_did` is matched against this on every connect — mismatch is
    // treated as MITM and rejected before any request is routed. Empty
    // string disables the check (debug only).
    private var activeExpectedDid: String = bootstrapPrimary?.did ?: ""

    private val executor: Executor = Executors.newCachedThreadPool()
    private var isInitialized = false
    private val connectionLock = Any()
    private val quinnRequestQueue: MutableMap<String, MutableList<QuinnQueuedRequest>> = mutableMapOf()
    private val quinnHandshakeInProgress: MutableSet<String> = mutableSetOf()
    private val quinnSessionIdPrefixByIdentity: MutableMap<String, String> = mutableMapOf()

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
                val opts = parseRequestOptions(options)
                if (opts.alpn == "public") {
                    dispatchPublicRequest(url, opts, promise)
                } else {
                    dispatchAuthenticatedRequest(url, opts, promise)
                }
            } catch (e: Exception) {
                Log.e(TAG, "[🌐 Web4] Request error", e)
                promise.reject("QUIC_ERROR", "Request failed: ${e.message}", e)
            }
        }
    }

    /** Normalised bundle of the fields `request()` pulls off its `options` map. */
    private data class RequestOptions(
        val method: String,
        val timeout: Int,
        val body: String,
        val insecure: Boolean,
        val alpn: String,
        val headersJson: String,
    )

    private fun parseRequestOptions(options: ReadableMap): RequestOptions {
        val method = if (options.hasKey("method")) options.getString("method") ?: "GET" else "GET"
        val timeout = if (options.hasKey("timeout")) options.getInt("timeout") else DEFAULT_TIMEOUT
        val body = if (options.hasKey("body")) options.getString("body") ?: "" else ""
        // Default to accept-any TLS (`insecure = true`). The cluster
        // ships self-signed rcgen certs on every gateway — webpki-roots
        // can never validate them, so the previous SECURE default
        // produced `certificate not valid for name <IP>` on every
        // bootstrap-fallback dial. Authenticity is provided one layer
        // up by the UHP-v2 handshake's `peer_did` matched against the
        // configured gateway DID (PR #2697); TLS is just transport.
        // Mirrors the iOS path which has used AcceptAnyVerifier
        // unconditionally since the same PR landed.
        val insecure = if (options.hasKey("insecure")) options.getBoolean("insecure") else true
        val alpn = if (options.hasKey("alpn")) options.getString("alpn") ?: "authenticated" else "authenticated"
        val headersJson = if (options.hasKey("headers")) headersMapToJson(options.getMap("headers")) else "{}"
        return RequestOptions(method, timeout, body, insecure, alpn, headersJson)
    }

    private fun headersMapToJson(headers: ReadableMap?): String {
        val jsonObj = JSONObject()
        if (headers == null) return jsonObj.toString()
        val iterator = headers.keySetIterator()
        while (iterator.hasNextKey()) {
            val key = iterator.nextKey()
            jsonObj.put(key, headers.getString(key))
        }
        return jsonObj.toString()
    }

    private fun dispatchPublicRequest(url: String, opts: RequestOptions, promise: Promise) {
        val result = NativeQuicBridge.request(
            url = url,
            method = opts.method,
            headersJson = opts.headersJson,
            body = opts.body,
            timeoutSecs = opts.timeout,
            insecure = opts.insecure,
            alpn = opts.alpn,
        )
        handleStringResponse(result, promise)
    }

    private fun dispatchAuthenticatedRequest(url: String, opts: RequestOptions, promise: Promise) {
        val parsedUrl = parseQuicUrl(url)
        if (parsedUrl == null) {
            promise.reject("QUIC_ERROR", "Invalid URL", null)
            return
        }
        val identityId = extractIdentityId(parsedUrl.path, opts.body, opts.headersJson)
        if (identityId.isNullOrEmpty()) {
            promise.reject("QUIC_ERROR", "Missing identity_id for authenticated request", null)
            return
        }
        Log.d(TAG, "[🌐 Web4] Auth request identity_id=${maskIdentifier(identityId)} path=${parsedUrl.path}")
        Log.d(TAG, "[PoUW] Enqueueing authenticated request for identity=${maskIdentifier(identityId)}")
        enqueueAuthenticatedRequest(
            identityId = identityId,
            parsedUrl = parsedUrl,
            method = opts.method,
            headersJson = opts.headersJson,
            body = opts.body,
            promise = promise,
        )
    }

    @ReactMethod
    fun getCurrentSessionIdPrefix(identityId: String, promise: Promise) {
        val normalized = normalizeIdentityId(identityId)
        val value = synchronized(connectionLock) {
            quinnSessionIdPrefixByIdentity[normalized] ?: quinnSessionIdPrefixByIdentity[identityId]
        }
        promise.resolve(value)
    }

    /**
     * Cancel all active requests
     */
    @ReactMethod
    fun cancelAll(promise: Promise) {
        // Fail any queued authenticated requests and drop the "handshake in
        // progress" latches so the very next request triggers a fresh UHP
        // handshake. Without this, a stuck session keeps recycling itself.
        val abandoned: List<QuinnQueuedRequest> = synchronized(connectionLock) {
            val all = quinnRequestQueue.values.flatten()
            quinnRequestQueue.clear()
            quinnHandshakeInProgress.clear()
            quinnSessionIdPrefixByIdentity.clear()
            all
        }
        abandoned.forEach { req ->
            try {
                req.promise.reject("QUIC_CANCELLED", "Session reset", null)
            } catch (_: Exception) { /* ignore double-resolve */ }
        }

        try {
            val result = NativeQuicBridge.cancelAll()
            Log.d(TAG, "[🌐 Web4] Cancelled all requests: $result (abandoned=${abandoned.size})")
            promise.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "[🌐 Web4] Error cancelling native requests", e)
            promise.resolve(false)
        }
    }

    /**
     * Resolve DNS A records for `name` against an explicit server over UDP.
     * Used for ZDNS discovery: `resolveDirectory("91.98.113.188", 53, "directory.sov")`
     * returns `["77.42.37.161", "77.42.74.80", "178.105.9.247"]`.
     *
     * No system resolver override — builds the DNS packet inline and parses
     * the A-record answer section with `DatagramSocket`.
     */
    @ReactMethod
    fun resolveDirectory(zdnsHost: String, port: Int, name: String, promise: Promise) {
        if (zdnsHost.isEmpty() || port <= 0 || port >= 65536 || name.isEmpty()) {
            promise.reject("INVALID_PARAMS", "zdnsHost, port, name required")
            return
        }
        executor.execute {
            try {
                val query = DnsUdp.buildQuery(name)
                val socket = DatagramSocket()
                socket.soTimeout = 3000
                val addr = InetAddress.getByName(zdnsHost)
                socket.send(DatagramPacket(query, query.size, addr, port))

                val buf = ByteArray(1500)
                val resp = DatagramPacket(buf, buf.size)
                socket.receive(resp)
                socket.close()

                val ips = DnsUdp.parseAnswers(resp.data, resp.length)
                val result = WritableNativeArray()
                ips.forEach { result.pushString(it) }
                promise.resolve(result)
            } catch (e: Exception) {
                Log.w(TAG, "[🌐 Web4] resolveDirectory failed: ${e.message}")
                promise.reject("DNS_ERROR", e.message ?: "DNS query failed", e)
            }
        }
    }

    /**
     * Swap the active validator (control-plane endpoint + expected DID) at runtime.
     * Called by the TS bootstrap after `GET /api/v1/network/directory` resolves
     * a better validator than the one we connected to. Drops all cached handshake
     * state so the next request rehandshakes against the new target.
     *
     * - host: new validator host or IP (used as the dial target — IP recommended)
     * - port: new validator port
     * - expectedDid: on-chain DID the UHP-v2 handshake must produce
     * - sni: TLS SNI hostname. Empty → defaults to host. Useful when dialing
     *   by IP but SNI must carry the cert hostname.
     *
     * No SPKI pin: TLS is accept-any; identity is the DID.
     */
    @ReactMethod
    fun setActiveValidator(
        host: String,
        port: Int,
        expectedDid: String,
        sni: String,
        promise: Promise,
    ) {
        if (host.isEmpty()) {
            promise.reject("INVALID_PARAMS", "host is required")
            return
        }
        if (port <= 0 || port >= 65536) {
            promise.reject("INVALID_PARAMS", "port must be 1..65535")
            return
        }
        if (expectedDid.isEmpty()) {
            promise.reject(
                "INVALID_PARAMS",
                "expectedDid is required (no SPKI pinning — identity is the DID)",
            )
            return
        }

        val serverName = if (sni.isEmpty()) host else sni

        val oldTarget = "$quinnControlPlaneHost:$quinnControlPlanePort"
        synchronized(connectionLock) {
            quinnControlPlaneHost = host
            quinnControlPlanePort = port
            quinnControlPlaneServerName = serverName
            activeExpectedDid = expectedDid
            // Drop cached session state — old session is bound to the old host.
            quinnRequestQueue.clear()
            quinnHandshakeInProgress.clear()
            quinnSessionIdPrefixByIdentity.clear()
        }
        val didMasked = if (expectedDid.length > 24) expectedDid.take(24) + "…" else expectedDid
        Log.d(
            TAG,
            "[🌐 Web4] 🔀 Active validator switched: $oldTarget → $host:$port (sni=$serverName, did=$didMasked)",
        )

        val result = WritableNativeMap()
        result.putString("host", host)
        result.putInt("port", port)
        result.putString("expectedDid", expectedDid)
        result.putString("sni", serverName)
        promise.resolve(result)
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
        if (!addToQueueAndShouldStart(identityId, request)) return
        executor.execute { runHandshakeAndDrain(identityId) }
    }

    /** Returns true if this caller owns the handshake slot and should start one. */
    private fun addToQueueAndShouldStart(
        identityId: String,
        request: QuinnQueuedRequest,
    ): Boolean {
        synchronized(connectionLock) {
            val queue = quinnRequestQueue.getOrPut(identityId) { mutableListOf() }
            queue.add(request)
            if (quinnHandshakeInProgress.contains(identityId)) return false
            quinnHandshakeInProgress.add(identityId)
            return true
        }
    }

    /** Perform the UHP handshake for this identity, cache the session id,
     *  and then drain any queued authenticated requests through it. */
    private fun runHandshakeAndDrain(identityId: String) {
        val identity = IdentityStore.loadIdentity(reactApplicationContext, identityId)
        if (identity == null) {
            failQuinnQueue(identityId, "Identity not found for $identityId")
            return
        }
        NativeQuicBridge.initUhpQuinn()
        val handshake = performHandshake(identity)
        identity.close()

        val ok = handshake?.get("ok") as? Boolean ?: false
        if (!ok) {
            val error = handshake?.get("error") as? String ?: "Handshake failed"
            failQuinnQueue(identityId, error)
            return
        }
        val handle = (handshake?.get("handle") as? Number)?.toLong() ?: 0L

        // UHP-v2 identity check. In release builds an empty expectedDid is
        // a hard failure (means bootstrap config is missing — refuse to
        // route any request over a connection of unknown identity). Debug
        // builds allow the bypass for local dev against test nodes whose
        // DID isn't on chain yet.
        val expectedDid = activeExpectedDid
        if (expectedDid.isEmpty()) {
            if (BuildConfig.DEBUG) {
                Log.w(
                    TAG,
                    "[🌐 Web4] ⚠️ DID check skipped — empty expectedDid (DEBUG build only)",
                )
            } else {
                if (handle != 0L) NativeQuicBridge.uhpQuicClose(handle)
                failQuinnQueue(
                    identityId,
                    "No expected DID configured — refusing handshake (set BOOTSTRAP_GATEWAY_DID in .env)",
                )
                return
            }
        } else {
            val peerDid = handshake?.get("peerDid") as? String ?: ""
            if (peerDid != expectedDid) {
                val didMaskedExpected =
                    if (expectedDid.length > 24) expectedDid.take(24) + "…" else expectedDid
                val didMaskedGot =
                    if (peerDid.length > 24) peerDid.take(24) + "…" else peerDid
                Log.e(
                    TAG,
                    "[🌐 Web4] ❌ DID mismatch: expected=$didMaskedExpected got=$didMaskedGot " +
                        "host=$quinnControlPlaneHost:$quinnControlPlanePort",
                )
                if (handle != 0L) NativeQuicBridge.uhpQuicClose(handle)
                failQuinnQueue(
                    identityId,
                    "Peer DID mismatch — expected $expectedDid, got $peerDid",
                )
                return
            }
        }

        cacheSessionPrefix(identityId, extractSessionPrefix(handshake))
        Log.d(TAG, "[🌐 Web4] Handshake ok handle=$handle identity_id=${maskIdentifier(identityId)}")
        drainQuinnQueue(identityId, handle)
    }

    /** Dispatch to the lib-client 3-leg path when enabled, otherwise the legacy path. */
    private fun performHandshake(identity: Identity): Map<String, Any?>? {
        // No SPKI pin: TLS is accept-any (JNI passes empty → AcceptAnyVerifier).
        // Identity is verified post-handshake against `activeExpectedDid` in
        // `runHandshakeAndDrain`. Cert rotation is a non-event for the app.
        val spkiPin = ""
        if (NativeQuicBridge.useLibClientHandshake) {
            // New path: keys stay in Rust.
            // NOTE: Blocked on quinn-ffi ALPN-aware connect (zhtp-uhp/2).
            return NativeQuicBridge.handshakeViaLibClient(
                host = quinnControlPlaneHost,
                port = quinnControlPlanePort,
                serverName = quinnControlPlaneServerName,
                spkiPinHex = spkiPin,
                identityHandle = identity.getHandle(),
            )
        }
        // Legacy path: extract keys via deprecated getters (briefly in JVM memory).
        val handshakeJson = identity.toHandshakeJson() ?: ""
        @Suppress("DEPRECATION")
        val dilithiumSk = identity.getDilithiumSecretKey() ?: ByteArray(0)
        @Suppress("DEPRECATION")
        val kyberSk = identity.getKyberSecretKey() ?: ByteArray(0)
        @Suppress("DEPRECATION")
        val masterSeed = identity.getMasterSeed() ?: ByteArray(0)
        return NativeQuicBridge.uhpQuicConnectAndHandshake(
            host = quinnControlPlaneHost,
            port = quinnControlPlanePort,
            serverName = quinnControlPlaneServerName,
            spkiPinHex = spkiPin,
            identityJson = handshakeJson,
            dilithiumSk = dilithiumSk,
            kyberSk = kyberSk,
            masterSeed = masterSeed,
            chainId = 0,
        )
    }

    /** Extract the first 8 bytes of the session id as a hex prefix, or null. */
    private fun extractSessionPrefix(handshake: Map<String, Any?>?): String? {
        val bytes = handshake?.get("sessionId") as? ByteArray ?: return null
        if (bytes.size < 8) return null
        return bytes.take(8).joinToString("") { b -> "%02x".format(b) }
    }

    /** Cache the session id prefix under both the raw and normalised identity keys. */
    private fun cacheSessionPrefix(identityId: String, prefix: String?) {
        if (prefix.isNullOrEmpty()) return
        val normalized = normalizeIdentityId(identityId)
        synchronized(connectionLock) {
            quinnSessionIdPrefixByIdentity[identityId] = prefix
            if (normalized != identityId) {
                quinnSessionIdPrefixByIdentity[normalized] = prefix
            }
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
        val sessionIdPrefix = synchronized(connectionLock) {
            quinnSessionIdPrefixByIdentity[identityId]
        }
        handleStringResponse(result, request.promise, sessionIdPrefix)

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

    private fun handleStringResponse(result: Map<String, Any?>?, promise: Promise, sessionIdPrefix: String? = null) {
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
            if (!sessionIdPrefix.isNullOrEmpty()) {
                putString("sessionIdPrefix", sessionIdPrefix)
            }
        }

        if (!ok) {
            Log.d(TAG, "[🌐 Web4] Response error status=$status body_len=${responseBody.length}")
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

/**
 * Minimal RFC 1035 DNS-over-UDP: build A-record query, parse A-record answers.
 * Just enough for ZDNS discovery — handles compression pointers in the answer
 * section (server may emit them).
 */
private object DnsUdp {
    fun buildQuery(name: String): ByteArray {
        val out = java.io.ByteArrayOutputStream(64)
        val id = Random.nextInt(0xFFFF)
        out.write((id shr 8) and 0xFF)
        out.write(id and 0xFF)
        out.write(byteArrayOf(0x01, 0x00)) // flags: RD=1
        out.write(byteArrayOf(0x00, 0x01)) // QDCOUNT=1
        out.write(byteArrayOf(0x00, 0x00, 0x00, 0x00, 0x00, 0x00)) // AN/NS/AR=0
        for (label in name.split('.')) {
            val bytes = label.toByteArray(Charsets.UTF_8)
            require(bytes.size <= 63) { "label too long: $label" }
            out.write(bytes.size)
            out.write(bytes)
        }
        out.write(0x00) // terminator
        out.write(byteArrayOf(0x00, 0x01)) // QTYPE=A
        out.write(byteArrayOf(0x00, 0x01)) // QCLASS=IN
        return out.toByteArray()
    }

    fun parseAnswers(data: ByteArray, length: Int): List<String> {
        if (length < 12) return emptyList()
        val ancount = ((data[6].toInt() and 0xFF) shl 8) or (data[7].toInt() and 0xFF)
        if (ancount == 0) return emptyList()

        var idx = 12
        // Skip QNAME
        while (idx < length) {
            val len = data[idx].toInt() and 0xFF
            if (len == 0) { idx += 1; break }
            if ((len and 0xC0) == 0xC0) { idx += 2; break }
            idx += 1 + len
        }
        idx += 4 // QTYPE + QCLASS

        val ips = mutableListOf<String>()
        var i = 0
        while (i < ancount && idx + 10 <= length) {
            // Skip name (compressed pointer or length-prefixed labels)
            if ((data[idx].toInt() and 0xC0) == 0xC0) {
                idx += 2
            } else {
                while (idx < length) {
                    val len = data[idx].toInt() and 0xFF
                    if (len == 0) { idx += 1; break }
                    if ((len and 0xC0) == 0xC0) { idx += 2; break }
                    idx += 1 + len
                }
            }
            if (idx + 10 > length) break
            val rtype = ((data[idx].toInt() and 0xFF) shl 8) or (data[idx + 1].toInt() and 0xFF)
            val rdlen = ((data[idx + 8].toInt() and 0xFF) shl 8) or (data[idx + 9].toInt() and 0xFF)
            idx += 10
            if (idx + rdlen > length) break
            if (rtype == 1 && rdlen == 4) {
                val a = data[idx].toInt() and 0xFF
                val b = data[idx + 1].toInt() and 0xFF
                val c = data[idx + 2].toInt() and 0xFF
                val d = data[idx + 3].toInt() and 0xFF
                ips.add("$a.$b.$c.$d")
            }
            idx += rdlen
            i++
        }
        return ips
    }
}
