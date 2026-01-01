# Web4 Client Architecture

This document details how the iOS and Android native clients fetch and render content from `zhtp://` URLs in the Sovereign Network Mobile app.

## Overview

The Web4 runtime enables the app to load decentralized websites hosted on the Sovereign Network. Content is addressed by CID (Content Identifier) and fetched via QUIC protocol from SOV nodes.

```
┌─────────────────────────────────────────────────────────────────┐
│                        React Native App                          │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    Web4View Component                        │ │
│  │         (src/components/Web4View.tsx)                       │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              │                                    │
│              ┌───────────────┴───────────────┐                   │
│              ▼                               ▼                   │
│  ┌─────────────────────┐         ┌─────────────────────┐        │
│  │   iOS Native View   │         │ Android Native View │        │
│  │   (Web4View.swift)  │         │(Web4ReactWebView.kt)│        │
│  └─────────────────────┘         └─────────────────────┘        │
│              │                               │                   │
│              ▼                               ▼                   │
│  ┌─────────────────────┐         ┌─────────────────────┐        │
│  │   WKWebView with    │         │   WebView with      │        │
│  │  URL Scheme Handler │         │ shouldIntercept     │        │
│  └─────────────────────┘         └─────────────────────┘        │
│              │                               │                   │
│              └───────────────┬───────────────┘                   │
│                              ▼                                    │
│                    ┌─────────────────┐                           │
│                    │   Web4Runtime   │                           │
│                    │ (resolves URLs) │                           │
│                    └─────────────────┘                           │
│                              │                                    │
│              ┌───────────────┼───────────────┐                   │
│              ▼               ▼               ▼                   │
│     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │
│     │ Web4Client  │  │ManifestCache│  │  BlobCache  │           │
│     │(QUIC fetch) │  │  (in-mem)   │  │  (on-disk)  │           │
│     └─────────────┘  └─────────────┘  └─────────────┘           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   SOV Node      │
                    │ (QUIC Server)   │
                    │  Port 9334      │
                    └─────────────────┘
```

## Content Resolution Flow

When a user navigates to `zhtp://centralhub.sov/`, the following sequence occurs:

### Step 1: Domain Resolution

```
POST /api/v1/web4/domains/resolve
Body: {"domain": "centralhub.sov", "version": null}
ALPN: zhtp-public/1

Response: {
  "domain": "centralhub.sov",
  "manifest_cid": "bafk843db2bbf40ff4280d084ec7c1dc0253",
  "version": 1,
  "spa": false,
  "spa_fallback": "/index.html"
}
```

### Step 2: Manifest Fetch

```
POST /api/v1/web4/content/manifest
Body: {"cid": "bafk843db2bbf40ff4280d084ec7c1dc0253"}
ALPN: zhtp-public/1

Response: {
  "domain": "centralhub.sov",
  "version": "1.0",
  "files": [
    {"path": "/index.html", "cid": "bafk...", "mime": "text/html", "size": 26827},
    {"path": "/styles.css", "cid": "bafk...", "mime": "text/css", "size": 4521},
    ...
  ],
  "spa_fallback": "/index.html"
}
```

### Step 3: File Resolution

```
1. Normalize requested path ("/" → "/index.html")
2. Find file entry in manifest by path
3. If not found and SPA, fallback to /index.html
4. Check blob cache for CID
5. If not cached, fetch blob from node
```

### Step 4: Blob Fetch

```
POST /api/v1/web4/content/blob
Body: {"cid": "bafk..."}
ALPN: zhtp-public/1

Response: <raw file bytes>
```

---

## iOS Implementation

### Files

| File | Purpose |
|------|---------|
| `ios/Web4View.swift` | React Native view wrapper with WKWebView |
| `ios/Web4ViewManager.swift` | React Native view manager |
| `ios/Web4SchemeHandler.swift` | WKURLSchemeHandler for zhtp:// |
| `ios/Web4Runtime.swift` | Orchestrates manifest/blob resolution |
| `ios/Web4Client.swift` | QUIC network requests via NativeQuic |
| `ios/Web4Types.swift` | Data models (Manifest, File, Response) |
| `ios/Web4ManifestCache.swift` | In-memory manifest cache |
| `ios/Web4BlobCache.swift` | On-disk blob cache with LRU eviction |

### WKURLSchemeHandler

iOS uses `WKURLSchemeHandler` to intercept `zhtp://` URLs:

```swift
// Web4SchemeHandler.swift
func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
    let url = urlSchemeTask.request.url  // zhtp://centralhub.sov/page
    let path = url.path                   // /page

    Task {
        let resolved = try await runtime.resolveFile(domain: domain, path: path)
        let data = try Data(contentsOf: resolved.url)

        let response = URLResponse(url: url, mimeType: resolved.mime, ...)
        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }
}
```

### Fetch Polyfill (iOS)

JavaScript `fetch()` calls don't go through `WKURLSchemeHandler`. We inject a polyfill:

```swift
// Web4View.swift
let fetchPolyfill = WKUserScript(source: """
    (function() {
        const originalFetch = window.fetch;
        window.fetch = function(input, init) {
            const url = (typeof input === 'string') ? input : input.url;
            if (url && url.startsWith('zhtp://')) {
                return new Promise((resolve, reject) => {
                    const callbackId = 'cb_' + Math.random().toString(36).substr(2, 9);
                    window[callbackId] = function(success, status, contentType, bodyBase64, error) {
                        delete window[callbackId];
                        if (success) {
                            const bytes = Uint8Array.from(atob(bodyBase64), c => c.charCodeAt(0));
                            resolve(new Response(new Blob([bytes], {type: contentType}), {status}));
                        } else {
                            reject(new Error(error));
                        }
                    };
                    window.webkit.messageHandlers.zhtpFetch.postMessage({url, callbackId});
                });
            }
            return originalFetch.apply(this, arguments);
        };
    })();
""", injectionTime: .atDocumentStart, forMainFrameOnly: false)
```

The `WKScriptMessageHandler` receives messages and fetches via native runtime:

```swift
// ZhtpFetchHandler
func userContentController(_ userContentController: WKUserContentController,
                          didReceive message: WKScriptMessage) {
    let url = body["url"] as String
    let callbackId = body["callbackId"] as String

    Task {
        let resolved = try await runtime.resolveFile(domain: domain, path: url.path)
        let data = try Data(contentsOf: resolved.url)
        let base64 = data.base64EncodedString()

        webView.evaluateJavaScript(
            "window['\(callbackId)'](true, 200, '\(resolved.mime)', '\(base64)', null)"
        )
    }
}
```

---

## Android Implementation

### Files

| File | Purpose |
|------|---------|
| `android/.../web4/Web4ReactWebView.kt` | WebView with request interception |
| `android/.../web4/Web4ViewManager.kt` | React Native view manager |
| `android/.../web4/Web4Runtime.kt` | Orchestrates manifest/blob resolution |
| `android/.../web4/Web4Client.kt` | QUIC network requests via NativeQuicBridge |
| `android/.../web4/Web4Types.kt` | Data models (Manifest, File, Response) |
| `android/.../web4/Web4ManifestCache.kt` | In-memory manifest cache |
| `android/.../web4/Web4BlobCache.kt` | On-disk blob cache with LRU eviction |

### WebViewClient Interception

Android uses `WebViewClient.shouldInterceptRequest()`:

```kotlin
// Web4ReactWebView.kt
setWebViewClient(object : WebViewClient() {
    override fun shouldInterceptRequest(
        view: WebView?,
        request: WebResourceRequest?
    ): WebResourceResponse? {
        val uri = request?.url ?: return null
        if (uri.scheme != "zhtp") return handleExternal(uri)

        return try {
            val resolved = runtime.resolveFile(domain, uri.path ?: "/")
                ?: return errorResponse("Not Found", 404)

            WebResourceResponse(resolved.mime, "utf-8", FileInputStream(resolved.file))
                .apply { setStatusCodeAndReasonPhrase(200, "OK") }
        } catch (e: Exception) {
            errorResponse("Error: ${e.message}", 500)
        }
    }
})
```

### Fetch Polyfill (Android)

Similar to iOS, we inject a polyfill and use `@JavascriptInterface`:

```kotlin
// Web4ReactWebView.kt
addJavascriptInterface(ZhtpFetchBridge(), "ZhtpBridge")

inner class ZhtpFetchBridge {
    @JavascriptInterface
    fun fetch(url: String, callbackId: String) {
        fetchExecutor.execute {
            try {
                val resolved = runtime.resolveFile(domain, Uri.parse(url).path ?: "/")
                    ?: throw Exception("Not found")

                val base64 = Base64.encodeToString(resolved.file.readBytes(), Base64.NO_WRAP)

                post {
                    evaluateJavascript(
                        "window['$callbackId'](true, 200, '${resolved.mime}', '$base64', null)",
                        null
                    )
                }
            } catch (e: Exception) {
                post {
                    evaluateJavascript(
                        "window['$callbackId'](false, 500, '', '', '${e.message}')",
                        null
                    )
                }
            }
        }
    }
}
```

The JavaScript polyfill calls the native bridge:

```javascript
// Injected at page start
window.fetch = function(input, init) {
    const url = (typeof input === 'string') ? input : input.url;
    if (url && url.startsWith('zhtp://')) {
        return new Promise((resolve, reject) => {
            const callbackId = 'cb_' + Math.random().toString(36).substr(2, 9);
            window[callbackId] = function(success, status, contentType, bodyBase64, error) {
                // ... decode and resolve
            };
            ZhtpBridge.fetch(url, callbackId);  // Call native
        });
    }
    return originalFetch.apply(this, arguments);
};
```

---

## Manifest Parsing

The manifest can be in two formats:

### Array Format (preferred)
```json
{
  "files": [
    {"path": "/index.html", "cid": "bafk...", "mime": "text/html", "size": 1234},
    {"path": "/app.js", "cid": "bafk...", "mime": "application/javascript", "size": 5678}
  ]
}
```

### Dictionary Format (legacy)
```json
{
  "files": {
    "/index.html": {"cid": "bafk...", "content_type": "text/html", "size": 1234},
    "/app.js": {"cid": "bafk...", "content_type": "application/javascript", "size": 5678}
  }
}
```

Both parsers handle `mime` or `content_type` fields interchangeably.

---

## Blob Caching

### Cache Structure
```
<app-cache-dir>/web4_blobs/
├── bafk843db2bbf40ff4280d084ec7c1dc0253
├── bafk264231d1f2963674c23e914d657c6d92
└── ...
```

### LRU Eviction

When cache exceeds `cacheLimitMb`:
1. Sort blobs by last access time
2. Delete oldest until under limit
3. Keep most recently used files

---

## SPA (Single Page Application) Handling

For SPAs, any path that doesn't match a file falls back to `/index.html`:

```swift
// Web4Runtime.swift
func resolveFile(domain: String, path: String) async throws -> (mime: String, url: URL) {
    let normalizedPath = (path == "/" || path.isEmpty) ? "/index.html" : path

    // Try exact match first
    let fileEntry = manifest.files.first { $0.path == normalizedPath }
        ?? manifest.files.first { $0.path == "/index.html" }  // SPA fallback

    // ...
}
```

This allows client-side routing to work without server configuration.

---

## QUIC Transport

All network requests use the native QUIC implementation:

- **ALPN**: `zhtp-public/1` for public content endpoints
- **TLS**: Self-signed certificates accepted (development)
- **Timeout**: 30 seconds default
- **Port**: 9334 (standard SOV port)

### Request Flow
```
NativeQuic.requestBytes(
    url: "quic://77.42.37.161:9334/api/v1/web4/content/blob",
    method: "POST",
    headers: {"content-type": "application/json"},
    body: {"cid": "bafk..."},
    alpn: "zhtp-public/1"
)
```

---

## Error Handling

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Domain not found | 404 | Show error page |
| Manifest not found | 404 | Show error page |
| Blob not found | 404 | Return 404 response, page continues loading |
| Network timeout | 500 | Show error, allow retry |
| Parse error | 500 | Log error, return empty response |

All errors in `shouldInterceptRequest` (Android) are caught to prevent app crashes:

```kotlin
return try {
    // ... resolve file
} catch (e: Exception) {
    Log.e("Web4", "Failed to load $path: ${e.message}")
    errorResponse("Error: ${e.message}", 500)
}
```

---

## React Native Integration

### Component Usage

```tsx
import { Web4View, isWeb4ViewAvailable } from '../components';

<Web4View
  domain="centralhub.sov"
  nodeHost="77.42.37.161"
  nodePort={9334}
  cacheLimitMb={150}
  allowHttpsExternal={false}
  onLoadStart={() => setLoading(true)}
  onLoadEnd={() => setLoading(false)}
  onError={(e) => console.error(e.nativeEvent.message)}
/>
```

### Props

| Prop | Type | Description |
|------|------|-------------|
| `domain` | string | The zhtp domain to load |
| `nodeHost` | string | SOV node IP/hostname |
| `nodePort` | number | SOV node port (default 9334) |
| `cacheLimitMb` | number | Max blob cache size in MB |
| `allowHttpsExternal` | boolean | Allow external HTTPS requests |
| `onLoadStart` | function | Called when page starts loading |
| `onLoadEnd` | function | Called when page finishes loading |
| `onError` | function | Called on navigation/load errors |

---

## Web4 Runtime Constraints

> **Important**: The Web4 runtime is NOT a general-purpose browser. It is a specialized environment for loading decentralized content from the Sovereign Network.

### Differences from Standard WebView

| Feature | Standard WebView | Web4 Runtime |
|---------|------------------|--------------|
| HTTP/HTTPS requests | Full support | Blocked by default (`allowHttpsExternal` to enable HTTPS) |
| Custom URL schemes | Limited | `zhtp://` fully supported |
| Service Workers | Supported | **Not supported** |
| Streaming fetch | Supported | **Not supported** (responses buffered in memory) |
| WebSockets | Supported | **Not supported** for zhtp:// |
| IndexedDB | Supported | Supported (standard WebView behavior) |
| localStorage | Supported | Supported (standard WebView behavior) |
| Cookies | Supported | **Not persisted** across sessions |

### Fetch API Behavior

The `window.fetch` API is polyfilled to intercept `zhtp://` URLs:

```javascript
// Standard fetch behavior preserved for non-Web4 URLs
fetch('https://api.example.com/data')  // Uses native fetch (if allowHttpsExternal=true)

// Web4 fetch for zhtp:// URLs
fetch('zhtp://mysite.sov/api/data')    // Routed through native Web4 runtime

// Explicit Web4 fetch API (recommended for clarity)
window.web4Fetch('zhtp://mysite.sov/api/data')  // Direct Web4 fetch
```

**Limitations of Web4 fetch:**
- **No streaming**: Response body is fully buffered before returning
- **1MB size limit**: Fetch polyfill rejects files larger than 1MB (use navigation for large files)
- **GET-only semantics**: POST/PUT/DELETE not meaningful for CID-addressed content
- **No request headers**: Custom headers are not forwarded to the node
- **30-second timeout**: Requests timeout after 30 seconds

### Runtime Detection

Web4 pages can detect the runtime environment:

```javascript
if (window.__web4Runtime) {
  console.log('Running in Web4 runtime v' + window.__web4Runtime.version);
  console.log('Supported schemes:', window.__web4Runtime.schemes);  // ['zhtp']
}
```

### What Web4 Sites Should Avoid

1. **External API calls** - Unless `allowHttpsExternal` is enabled, HTTPS requests will fail
2. **Service Worker registration** - Will fail silently or throw
3. **Large fetch responses** - Use `<img>`, `<script>`, `<link>` tags for files >1MB
4. **WebSocket connections** - Not supported for zhtp:// protocol
5. **Authentication flows** - No cookie persistence, no OAuth redirects to external sites

### Recommended Patterns for Web4 Sites

```javascript
// Good: Use web4Fetch for explicit Web4 requests
const response = await window.web4Fetch('zhtp://mysite.sov/data.json');

// Good: Check runtime before using Web4 features
if (window.__web4Runtime) {
  // Web4-specific code
} else {
  // Fallback for standard browsers
}

// Good: Use standard tags for large assets
<img src="zhtp://mysite.sov/large-image.jpg" />
<script src="zhtp://mysite.sov/app.js"></script>

// Bad: Avoid large fetch requests
const bigFile = await fetch('zhtp://mysite.sov/video.mp4');  // May fail >1MB
```

---

## Security Considerations

1. **External Requests Blocked**: By default, `https://` requests are blocked unless `allowHttpsExternal` is enabled
2. **No File Access**: `allowFileAccess` and `allowContentAccess` are disabled
3. **No Popup Windows**: `setSupportMultipleWindows(false)`
4. **Self-Signed Certs**: Only accepted in development builds
5. **CID Verification**: Content is addressed by cryptographic hash (CID)

---

## Future Improvements

- [ ] Service Worker support for offline-first
- [ ] Streaming fetch support for large responses
- [ ] Content signing verification
- [ ] P2P content fetching from nearby nodes
- [ ] Preloading/prefetching of linked resources
- [ ] Background sync for content updates
- [ ] WebSocket support over QUIC
