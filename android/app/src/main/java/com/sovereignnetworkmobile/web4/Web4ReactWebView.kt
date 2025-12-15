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
import java.io.FileInputStream
import java.util.concurrent.Executors

@SuppressLint("SetJavaScriptEnabled")
class Web4ReactWebView(context: Context) : WebView(context) {
    private var domain: String? = null
    private var allowHttpsExternal: Boolean = false
    private var nodeHost: String? = null
    private var nodePort: Int = 0
    private var cacheLimitMb: Int = 150
    private var runtime: Web4Runtime? = null
    private var configured = false
    private val fetchExecutor = Executors.newCachedThreadPool()

    init {
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        settings.setSupportMultipleWindows(false)
        settings.javaScriptCanOpenWindowsAutomatically = false
        addJavascriptInterface(ZhtpFetchBridge(), "ZhtpBridge")
        setWebViewClient(object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                injectFetchPolyfill()
                sendEvent("onLoadStart", url ?: "")
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
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
                if (window.__zhtpFetchInstalled) return;
                window.__zhtpFetchInstalled = true;
                const originalFetch = window.fetch;
                window.fetch = function(input, init) {
                    const url = (typeof input === 'string') ? input : input.url;
                    if (url && url.startsWith('zhtp://')) {
                        return new Promise((resolve, reject) => {
                            const callbackId = 'cb_' + Math.random().toString(36).substr(2, 9);
                            window[callbackId] = function(success, status, contentType, bodyBase64, error) {
                                delete window[callbackId];
                                if (success) {
                                    const binary = atob(bodyBase64);
                                    const bytes = new Uint8Array(binary.length);
                                    for (let i = 0; i < binary.length; i++) {
                                        bytes[i] = binary.charCodeAt(i);
                                    }
                                    const blob = new Blob([bytes], { type: contentType });
                                    resolve(new Response(blob, { status: status, headers: { 'Content-Type': contentType } }));
                                } else {
                                    reject(new Error(error || 'Fetch failed'));
                                }
                            };
                            ZhtpBridge.fetch(url, callbackId);
                        });
                    }
                    return originalFetch.apply(this, arguments);
                };
                console.log('[Web4] Fetch polyfill installed');
            })();
        """.trimIndent()
        evaluateJavascript(script, null)
    }

    inner class ZhtpFetchBridge {
        @JavascriptInterface
        fun fetch(url: String, callbackId: String) {
            fetchExecutor.execute {
                try {
                    val uri = Uri.parse(url)
                    val path = uri.path?.ifEmpty { "/" } ?: "/"
                    val currentDomain = domain ?: throw Exception("No domain configured")
                    val currentRuntime = runtime ?: throw Exception("Runtime not ready")

                    val resolved = currentRuntime.resolveFile(currentDomain, path)
                        ?: throw Exception("Not found: $path")

                    val bytes = resolved.file.readBytes()
                    val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)

                    post {
                        evaluateJavascript("window['$callbackId'](true, 200, '${resolved.mime}', '$base64', null)", null)
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
        if (configured) return
        val domain = this.domain ?: return
        val host = this.nodeHost ?: return
        if (nodePort == 0) return
        configured = true
        val baseUrl = "quic://$host:$nodePort"
        val client = Web4Client(baseUrl, timeoutSecs = 30, insecure = true)
        runtime = Web4Runtime(context, cacheLimitMb.toLong() * 1024 * 1024, client)
        loadUrl("zhtp://${domain}/")
    }

    private fun intercept(uri: Uri): WebResourceResponse? {
        val scheme = uri.scheme ?: return null
        if (scheme != "zhtp") {
            return handleExternal(uri)
        }

        val domain = this.domain ?: return null
        val path = uri.path?.ifEmpty { "/" } ?: "/"

        val runtime = this.runtime ?: return null

        return try {
            val resolved = runtime.resolveFile(domain, path) ?: return errorResponse("Not Found", 404)
            val stream = FileInputStream(resolved.file)
            WebResourceResponse(resolved.mime, "utf-8", stream).apply {
                setStatusCodeAndReasonPhrase(200, "OK")
            }
        } catch (e: Exception) {
            android.util.Log.e("Web4ReactWebView", "Failed to load $path: ${e.message}")
            errorResponse("Error: ${e.message}", 500)
        }
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
        return WebResourceResponse("text/plain", "utf-8", null).apply {
            setStatusCodeAndReasonPhrase(code, message)
        }
    }
}
