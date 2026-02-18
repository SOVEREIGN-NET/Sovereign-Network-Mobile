package com.sovereignnetworkmobile.web4

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter
import com.sovereignnetworkmobile.NativeQuicBridge
import java.io.FileInputStream
import java.io.InputStream
import java.io.ByteArrayInputStream
import java.util.concurrent.Executors

@SuppressLint("SetJavaScriptEnabled")
class Web4ReactWebView(context: Context) : WebView(context) {
    private var domain: String? = null
    private var embeddedApp: String? = null
    private var hostHeader: String? = null
    private var allowHttpsExternal: Boolean = false
    private var nodeHost: String? = null
    private var nodePort: Int = 0
    private var cacheLimitMb: Int = 150
    private var runtime: Web4Runtime? = null
    private var configured = false
    private var lastConfiguredDomain: String? = null
    private var lastConfiguredHost: String? = null
    private var lastConfiguredPort: Int? = null
    private var lastConfiguredEmbeddedApp: String? = null
    private var lastConfiguredHostHeader: String? = null
    private val fetchExecutor = Executors.newCachedThreadPool()

    init {
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        settings.setSupportMultipleWindows(false)
        settings.javaScriptCanOpenWindowsAutomatically = false
        // Match the app's dark theme — prevents white flash before content loads
        setBackgroundColor(android.graphics.Color.parseColor("#0b1016"))
        addJavascriptInterface(ZhtpFetchBridge(), "ZhtpBridge")
        setWebViewClient(object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                injectFetchPolyfill()
                sendEvent("onLoadStart", url ?: "")
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                injectFetchPolyfill()
                sendEvent("onLoadEnd", url ?: "")
            }

            override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? {
                val uri = request?.url ?: return super.shouldInterceptRequest(view, request)
                return intercept(uri)
            }
        })
    }

    private fun injectFetchPolyfill() {
        val script = """
            (function() {
                'use strict';
                if (!window.__web4Runtime) {
                    // Web4 runtime context - explicit marker for Web4 environment
                    window.__web4Runtime = Object.freeze({
                        version: '1.0',
                        schemes: ['zhtp'],
                        installed: Date.now()
                    });
                }

                const originalFetch = window.fetch;
                if (typeof originalFetch !== 'function') {
                    console.error('[Web4] Native fetch not available');
                    return;
                }

                // Extract URL from various fetch input types
                function extractUrl(input) {
                    if (typeof input === 'string') return input;
                    if (input instanceof URL) return input.href;
                    if (input instanceof Request) return input.url;
                    if (input && typeof input.url === 'string') return input.url;
                    return null;
                }

                // Resolve any URL (relative or absolute) to a fully-qualified URL
                function resolveUrl(url) {
                    if (typeof url !== 'string') return url;
                    try { return new URL(url, document.baseURI).href; } catch(e) { return url; }
                }

                // Check if URL is a Web4 zhtp:// URL
                function isZhtpUrl(url) {
                    return typeof url === 'string' && url.startsWith('zhtp://');
                }

                // Dedicated Web4 fetch function - explicit API for zhtp:// requests
                function web4FetchInternal(url) {
                    if (!isZhtpUrl(url)) {
                        return Promise.reject(new Error('web4Fetch only supports zhtp:// URLs'));
                    }
                    return new Promise((resolve, reject) => {
                        const callbackId = '__web4_' + Math.random().toString(36).substr(2, 12);
                        const timeoutId = setTimeout(() => {
                            delete window[callbackId];
                            reject(new Error('Web4 fetch timeout'));
                        }, 30000);

                        window[callbackId] = function(success, status, contentType, bodyBase64, error) {
                            clearTimeout(timeoutId);
                            delete window[callbackId];
                            if (success) {
                                try {
                                    const binary = atob(bodyBase64);
                                    const bytes = new Uint8Array(binary.length);
                                    for (let i = 0; i < binary.length; i++) {
                                        bytes[i] = binary.charCodeAt(i);
                                    }
                                    const blob = new Blob([bytes], { type: contentType || 'application/octet-stream' });
                                    resolve(new Response(blob, {
                                        status: status,
                                        statusText: status === 200 ? 'OK' : 'Error',
                                        headers: { 'Content-Type': contentType || 'application/octet-stream' }
                                    }));
                                } catch (e) {
                                    reject(new Error('Failed to decode response: ' + e.message));
                                }
                            } else {
                                reject(new Error(error || 'Web4 fetch failed'));
                            }
                        };
                        ZhtpBridge.fetch(url, callbackId);
                    });
                }

                // Expose explicit Web4 fetch API
                window.web4Fetch = web4FetchInternal;

                // Minimal fetch override - resolves relative URLs and intercepts zhtp://
                window.fetch = function(input, init) {
                    const raw = extractUrl(input);
                    const url = resolveUrl(raw);
                    if (isZhtpUrl(url)) {
                        return web4FetchInternal(url);
                    }
                    // Pass through to original fetch unchanged for all non-zhtp URLs
                    return originalFetch.apply(this, arguments);
                };

                // Patch history for custom scheme on Android WebView
                function normalizeHistoryUrl(url) {
                    if (typeof url !== 'string') return url;
                    if (url.startsWith('zhtp://')) {
                        try {
                            const parsed = new URL(url);
                            return (parsed.pathname || '/') + (parsed.search || '') + (parsed.hash || '');
                        } catch (e) {
                            const withoutScheme = url.replace(/^zhtp:\/\//, '');
                            const slashIndex = withoutScheme.indexOf('/');
                            if (slashIndex >= 0) {
                                return withoutScheme.slice(slashIndex) || '/';
                            }
                            return '/';
                        }
                    }
                    return url;
                }

                if (!window.__web4HistoryPatched) {
                    const originalPushState = history.pushState;
                    history.pushState = function(state, title, url) {
                        const normalized = normalizeHistoryUrl(url);
                        try {
                            return originalPushState.call(this, state, title, normalized);
                        } catch (e) {
                            return originalPushState.call(this, state, title);
                        }
                    };

                    const originalReplaceState = history.replaceState;
                    history.replaceState = function(state, title, url) {
                        const normalized = normalizeHistoryUrl(url);
                        try {
                            return originalReplaceState.call(this, state, title, normalized);
                        } catch (e) {
                            return originalReplaceState.call(this, state, title);
                        }
                    };
                    window.__web4HistoryPatched = true;
                }

                // Storage shim for opaque/custom scheme origins (avoid DOMException)
                function makeStorage() {
                    const store = {};
                    return {
                        getItem: (k) => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
                        setItem: (k, v) => { store[k] = String(v); },
                        removeItem: (k) => { delete store[k]; },
                        clear: () => { Object.keys(store).forEach(k => delete store[k]); }
                    };
                }

                try {
                    window.localStorage.setItem('__web4_test__', '1');
                    window.localStorage.removeItem('__web4_test__');
                } catch (e) {
                    Object.defineProperty(window, 'localStorage', { value: makeStorage() });
                }

                try {
                    window.sessionStorage.setItem('__web4_test__', '1');
                    window.sessionStorage.removeItem('__web4_test__');
                } catch (e) {
                    Object.defineProperty(window, 'sessionStorage', { value: makeStorage() });
                }

                console.log('[Web4] Runtime initialized (v1.0)');
            })();
        """.trimIndent()
        evaluateJavascript(script, null)
    }

    inner class ZhtpFetchBridge {
        // Max size for fetch polyfill (1MB) - larger files should use streaming
        private val maxFetchSize = 1024 * 1024L

        @JavascriptInterface
        fun fetch(url: String, callbackId: String) {
            fetchExecutor.execute {
                try {
                    val uri = Uri.parse(url)
                    val path = uri.path?.ifEmpty { "/" } ?: "/"
                    val currentDomain = domain ?: throw Exception("No domain configured")
                    val embedded = embeddedApp

                    val (mime, data) = if (embedded != null) {
                        // Try embedded asset first
                        val res = resolveEmbeddedAsset(embedded, path)
                        if (res != null) {
                            res.mime to res.readAllBytes(maxFetchSize)
                        } else if (path == "/api" || path.startsWith("/api/")) {
                            // Proxy API calls to node
                            val host = nodeHost ?: throw Exception("No node host configured")
                            if (nodePort == 0) throw Exception("No node port configured")
                            val base = "quic://${host}:${nodePort}"
                            val hh = (hostHeader ?: currentDomain).lowercase()
                            val query = uri.query?.let { "?$it" } ?: ""
                            val response = NativeQuicBridge.requestBytes(
                                url = base + path + query,
                                method = "GET",
                                headersJson = """{"content-type":"application/json","Host":"$hh"}""",
                                body = null,
                                timeoutSecs = 30,
                                insecure = true,
                                alpn = "public"
                            ) ?: throw Exception("Node request failed")
                            val status = (response["status"] as? Number)?.toInt() ?: 200
                            val bodyBytes = response["body"] as? ByteArray ?: ByteArray(0)
                            val respBase64 = Base64.encodeToString(bodyBytes, Base64.NO_WRAP)
                            val respMime = "application/json"
                            post {
                                evaluateJavascript("window['$callbackId'](true, $status, '$respMime', '$respBase64', null)", null)
                            }
                            return@execute
                        } else {
                            throw Exception("Not found: $path")
                        }
                    } else {
                        val currentRuntime = runtime ?: throw Exception("Runtime not ready")
                        val resolved = currentRuntime.resolveFile(currentDomain, path)
                            ?: throw Exception("Not found: $path")
                        val fileSize = resolved.file.length()
                        if (fileSize > maxFetchSize) {
                            throw Exception("File too large for fetch ($fileSize bytes). Max: $maxFetchSize")
                        }
                        resolved.mime to resolved.file.readBytes()
                    }

                    val fileSize = data.size.toLong()
                    if (fileSize > maxFetchSize) {
                        throw Exception("File too large for fetch ($fileSize bytes). Max: $maxFetchSize")
                    }

                    val base64 = Base64.encodeToString(data, Base64.NO_WRAP)

                    post {
                        evaluateJavascript("window['$callbackId'](true, 200, '$mime', '$base64', null)", null)
                    }
                } catch (e: Exception) {
                    val errorMsg = e.message?.replace("'", "\\'") ?: "Unknown error"
                    post {
                        evaluateJavascript("window['$callbackId'](false, 500, '', '', '$errorMsg')", null)
                    }
                }
            }
        }
    }

    private fun sendEvent(eventName: String, url: String) {
        val reactContext = context as? ReactContext ?: return
        val event = Arguments.createMap().apply {
            putString("url", url)
            putString("navigationType", "load")
        }
        reactContext.getJSModule(RCTEventEmitter::class.java)
            .receiveEvent(id, eventName, event)
    }

    fun setDomain(value: String?) {
        this.domain = value?.lowercase()
        applyConfigIfReady()
    }

    fun setEmbeddedApp(value: String?) {
        this.embeddedApp = value?.lowercase()
        applyConfigIfReady()
    }

    fun setHostHeader(value: String?) {
        this.hostHeader = value?.lowercase()
        applyConfigIfReady()
    }

    fun setNodeHost(value: String?) {
        this.nodeHost = value
        applyConfigIfReady()
    }

    fun setNodePort(value: Int) {
        this.nodePort = value
        applyConfigIfReady()
    }

    fun setCacheLimitMb(value: Int) {
        this.cacheLimitMb = value
        applyConfigIfReady()
    }

    fun setAllowHttpsExternal(value: Boolean) {
        this.allowHttpsExternal = value
    }

    private fun applyConfigIfReady() {
        val domain = this.domain ?: return

        val embedded = this.embeddedApp
        if (embedded != null && embedded.isNotEmpty()) {
            val host = this.nodeHost ?: return
            if (nodePort == 0) return

            val isSameConfig = (configured &&
                lastConfiguredDomain == domain &&
                lastConfiguredEmbeddedApp == embedded &&
                lastConfiguredHost == host &&
                lastConfiguredPort == nodePort &&
                lastConfiguredHostHeader == hostHeader)
            if (isSameConfig) return

            if (configured && !isSameConfig) {
                teardownRuntime()
            }

            configured = true
            runtime = null
            loadUrl("zhtp://${domain}/")
            lastConfiguredDomain = domain
            lastConfiguredHost = host
            lastConfiguredPort = nodePort
            lastConfiguredEmbeddedApp = embedded
            lastConfiguredHostHeader = hostHeader
            return
        }

        val host = this.nodeHost ?: return
        if (nodePort == 0) return
        val isSameConfig = (configured &&
            lastConfiguredDomain == domain &&
            lastConfiguredHost == host &&
            lastConfiguredPort == nodePort &&
            lastConfiguredEmbeddedApp == null &&
            lastConfiguredHostHeader == hostHeader)
        if (isSameConfig) return

        if (configured && !isSameConfig) {
            teardownRuntime()
        }

        configured = true
        val baseUrl = "quic://$host:$nodePort"
        val client = Web4Client(baseUrl, timeoutSecs = 30, insecure = true)
        runtime = Web4Runtime(context, cacheLimitMb.toLong() * 1024 * 1024, client)
        loadUrl("zhtp://${domain}/")
        lastConfiguredDomain = domain
        lastConfiguredHost = host
        lastConfiguredPort = nodePort
        lastConfiguredEmbeddedApp = null
        lastConfiguredHostHeader = hostHeader
    }

    private data class EmbeddedResolved(val mime: String, val stream: InputStream) {
        fun readAllBytes(max: Long): ByteArray {
            val bytes = stream.readBytes()
            if (bytes.size.toLong() > max) throw Exception("File too large for fetch (${bytes.size} bytes). Max: $max")
            return bytes
        }
    }

    private fun resolveEmbeddedAsset(app: String, path: String): EmbeddedResolved? {
        var rel = path
        if (rel.isEmpty() || rel == "/") rel = "/index.html"
        if (rel.contains("..")) return null
        val trimmed = if (rel.startsWith("/")) rel.substring(1) else rel
        val assetPath = "web4apps/$app/$trimmed"
        return try {
            val stream = context.assets.open(assetPath)
            val mime = when {
                trimmed.endsWith(".html", true) -> "text/html"
                trimmed.endsWith(".css", true) -> "text/css"
                trimmed.endsWith(".js", true) -> "application/javascript"
                trimmed.endsWith(".wasm", true) -> "application/wasm"
                else -> "application/octet-stream"
            }
            EmbeddedResolved(mime, stream)
        } catch (_: Exception) {
            // Don't SPA-fallback for API paths — let them fall through to the proxy handler
            if (rel == "/api" || rel.startsWith("/api/")) return null

            // SPA fallback: serve index.html for routes that don't match a file
            try {
                val stream = context.assets.open("web4apps/$app/index.html")
                EmbeddedResolved("text/html", stream)
            } catch (_: Exception) {
                null
            }
        }
    }

    private fun intercept(uri: Uri): WebResourceResponse? {
        val scheme = uri.scheme ?: return null
        if (scheme != "zhtp") {
            return handleExternal(uri)
        }

        val domain = this.domain ?: return null
        val path = uri.path?.ifEmpty { "/" } ?: "/"

        val embedded = this.embeddedApp
        if (embedded != null && embedded.isNotEmpty()) {
            // Serve embedded assets first.
            val resolved = resolveEmbeddedAsset(embedded, path)
            if (resolved != null) {
                val (mime, encoding) = parseMime(resolved.mime)
                val contentTypeHeader = if (encoding != null) "$mime; charset=$encoding" else mime
                return WebResourceResponse(mime, encoding, resolved.stream).apply {
                    setStatusCodeAndReasonPhrase(200, "OK")
                    responseHeaders = mapOf(
                        "Content-Type" to contentTypeHeader,
                        "Access-Control-Allow-Origin" to "*",
                        "Access-Control-Allow-Methods" to "GET, POST, OPTIONS",
                        "Access-Control-Allow-Headers" to "*",
                        "Cache-Control" to "public, max-age=31536000"
                    )
                }
            }

            // Proxy node API calls (Explorer expects /api/...).
            if (path == "/api" || path.startsWith("/api/")) {
                val host = this.nodeHost ?: return errorResponse("Not Found", 404)
                if (nodePort == 0) return errorResponse("Not Found", 404)

                val base = "quic://${host}:${nodePort}"
                val hh = (this.hostHeader ?: domain).lowercase()
                val query = uri.query?.let { "?$it" } ?: ""
                return try {
                    val response = NativeQuicBridge.requestBytes(
                        url = base + path + query,
                        method = "GET",
                        headersJson = """{"content-type":"application/json","Host":"$hh"}""",
                        body = null,
                        timeoutSecs = 30,
                        insecure = true,
                        alpn = "public"
                    ) ?: return errorResponse("Error", 500)

                    val status = (response["status"] as? Number)?.toInt() ?: 0
                    val bodyBytes = response["body"] as? ByteArray ?: ByteArray(0)
                    val mime = "application/json"
                    val stream = ByteArrayInputStream(bodyBytes)
                    WebResourceResponse(mime, "utf-8", stream).apply {
                        setStatusCodeAndReasonPhrase(if (status == 0) 500 else status, "OK")
                        responseHeaders = mapOf(
                            "Content-Type" to mime,
                            "Access-Control-Allow-Origin" to "*",
                            "Access-Control-Allow-Methods" to "GET, POST, OPTIONS",
                            "Access-Control-Allow-Headers" to "*"
                        )
                    }
                } catch (e: Exception) {
                    errorResponse("Error: ${e.message}", 500)
                }
            }

            return errorResponse("Not Found", 404)
        }

        val runtime = this.runtime ?: return null

        return try {
            val resolved = runtime.resolveFile(domain, path) ?: return errorResponse("Not Found", 404)
            val stream = FileInputStream(resolved.file)
            val (mime, encoding) = parseMime(resolved.mime)
            val contentTypeHeader = if (encoding != null) "$mime; charset=$encoding" else mime
            WebResourceResponse(mime, encoding, stream).apply {
                setStatusCodeAndReasonPhrase(200, "OK")
                responseHeaders = mapOf(
                    "Content-Type" to contentTypeHeader,
                    "Access-Control-Allow-Origin" to "*",
                    "Access-Control-Allow-Methods" to "GET, POST, OPTIONS",
                    "Access-Control-Allow-Headers" to "*",
                    "Cache-Control" to "public, max-age=31536000"
                )
            }
        } catch (e: Exception) {
            android.util.Log.e("Web4ReactWebView", "Failed to load $path: ${e.message}")
            errorResponse("Error: ${e.message}", 500)
        }
    }

    private fun parseMime(rawMime: String): Pair<String, String?> {
        val parts = rawMime.split(";").map { it.trim() }.filter { it.isNotEmpty() }
        if (parts.isEmpty()) {
            return "application/octet-stream" to null
        }
        val mime = parts.first()
        val charset = parts.drop(1)
            .firstOrNull { it.startsWith("charset=", ignoreCase = true) }
            ?.substringAfter("=")
            ?.trim()
            ?.ifEmpty { null }
        return mime to charset
    }

    private fun handleExternal(uri: Uri): WebResourceResponse? {
        val scheme = uri.scheme ?: return errorResponse("Blocked", 403)
        return when (scheme) {
            "mailto", "tel" -> null // allow system handling
            "intent" -> null // Android intents
            "https" -> if (allowHttpsExternal) null else errorResponse("Blocked", 403)
            else -> errorResponse("Blocked", 403)
        }
    }

    private fun errorResponse(message: String, code: Int): WebResourceResponse {
        val title = when (code) {
            404 -> "Not Found"
            403 -> "Blocked"
            else -> "Error"
        }
        val description = when (code) {
            404 -> "The requested page could not be found on this domain."
            403 -> "This request has been blocked by the Web4 runtime."
            else -> "Something went wrong while loading this page."
        }
        val html = errorPageHtml(code, title, description, message)
        return WebResourceResponse("text/html", "utf-8", html.byteInputStream()).apply {
            setStatusCodeAndReasonPhrase(code, title)
        }
    }

    private fun errorPageHtml(code: Int, title: String, message: String, url: String): String {
        return """
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <title>$title</title>
              <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  background: #1a1a1a;
                  color: #fff;
                  min-height: 100vh;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  padding: 20px;
                }
                .container {
                  text-align: center;
                  max-width: 400px;
                }
                .code {
                  font-size: 72px;
                  font-weight: 700;
                  color: #00d4ff;
                  line-height: 1;
                  margin-bottom: 16px;
                }
                .title {
                  font-size: 24px;
                  font-weight: 600;
                  margin-bottom: 12px;
                }
                .message {
                  color: #888;
                  font-size: 14px;
                  line-height: 1.5;
                  margin-bottom: 24px;
                }
                .url {
                  background: #2a2a2a;
                  border-radius: 8px;
                  padding: 12px 16px;
                  font-family: monospace;
                  font-size: 12px;
                  color: #666;
                  word-break: break-all;
                }
                .logo {
                  width: 48px;
                  height: 48px;
                  margin: 0 auto 24px;
                  opacity: 0.5;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <svg class="logo" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M50 5L90 25V75L50 95L10 75V25L50 5Z" stroke="#00d4ff" stroke-width="2" fill="none"/>
                  <path d="M50 20L75 35V65L50 80L25 65V35L50 20Z" stroke="#00d4ff" stroke-width="2" fill="none"/>
                </svg>
                <div class="code">$code</div>
                <div class="title">$title</div>
                <div class="message">$message</div>
                <div class="url">$url</div>
              </div>
            </body>
            </html>
        """.trimIndent()
    }

    private fun teardownRuntime() {
        runtime = null
        configured = false
        lastConfiguredDomain = null
        lastConfiguredHost = null
        lastConfiguredPort = null
        lastConfiguredEmbeddedApp = null
        lastConfiguredHostHeader = null
        stopLoading()
        loadUrl("about:blank")
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        teardownRuntime()
        fetchExecutor.shutdownNow()
        destroy()
    }
}
