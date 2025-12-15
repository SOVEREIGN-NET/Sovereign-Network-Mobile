import Foundation
import WebKit
import React

@available(iOS 15.0, *)
final class Web4View: UIView {
  private var webView: WKWebView?
  private var domain: String?
  private var nodeHost: String?
  private var nodePort: Int?
  private var cacheLimitMb: Int = 150
  private var allowHttpsExternal: Bool = false
  private var runtime: Web4Runtime?
  @objc var onLoadStart: RCTDirectEventBlock?
  @objc var onLoadEnd: RCTDirectEventBlock?
  @objc var onNavigation: RCTDirectEventBlock?
  @objc var onError: RCTDirectEventBlock?

  @objc func setDomain(_ value: NSString?) {
    domain = value as String?
    configureIfReady()
  }

  @objc func setNodeHost(_ value: NSString?) {
    nodeHost = value as String?
    configureIfReady()
  }

  @objc func setNodePort(_ value: NSNumber?) {
    nodePort = value?.intValue
    configureIfReady()
  }

  @objc func setCacheLimitMb(_ value: NSNumber?) {
    if let v = value?.intValue { cacheLimitMb = v }
  }

  @objc func setAllowHttpsExternal(_ value: NSNumber?) {
    if let v = value?.boolValue { allowHttpsExternal = v }
  }

  private func configureIfReady() {
    guard webView == nil else { return }
    guard let domain = domain,
          let host = nodeHost,
          let port = nodePort,
          port > 0 else { return }

    let config = WKWebViewConfiguration()
    let cacheDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
    let rt = Web4Runtime(
      cacheDir: cacheDir.appendingPathComponent("web4_blobs"),
      cacheLimitBytes: Int64(cacheLimitMb) * 1024 * 1024,
      client: Web4Client(baseUrl: "quic://\(host):\(port)", hostHeader: domain)
    )
    self.runtime = rt
    let handler = Web4SchemeHandler(runtime: rt, domain: domain)
    config.setURLSchemeHandler(handler, forURLScheme: "zhtp")

    // Add message handler for fetch polyfill
    let contentController = config.userContentController
    contentController.add(ZhtpFetchHandler(runtime: rt, domain: domain), name: "zhtpFetch")

    // Inject fetch polyfill script
    let fetchPolyfill = WKUserScript(source: Self.fetchPolyfillScript, injectionTime: .atDocumentStart, forMainFrameOnly: false)
    contentController.addUserScript(fetchPolyfill)

    let wv = WKWebView(frame: bounds, configuration: config)
    wv.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    wv.navigationDelegate = self
    wv.uiDelegate = self
    let request = URLRequest(url: URL(string: "zhtp://\(domain)/")!)
    onLoadStart?(["url": request.url?.absoluteString ?? ""])
    wv.load(request)
    addSubview(wv)
    webView = wv
  }

  private static let fetchPolyfillScript = """
    (function() {
      'use strict';
      if (window.__web4Runtime) return;

      // Web4 runtime context - explicit marker for Web4 environment
      window.__web4Runtime = Object.freeze({
        version: '1.0',
        schemes: ['zhtp'],
        installed: Date.now()
      });

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
          window.webkit.messageHandlers.zhtpFetch.postMessage({ url: url, callbackId: callbackId });
        });
      }

      // Expose explicit Web4 fetch API
      window.web4Fetch = web4FetchInternal;

      // Minimal fetch override - only intercepts zhtp://, preserves all other behavior
      window.fetch = function(input, init) {
        const url = extractUrl(input);
        if (isZhtpUrl(url)) {
          return web4FetchInternal(url);
        }
        // Pass through to original fetch unchanged for all non-zhtp URLs
        return originalFetch.apply(this, arguments);
      };

      console.log('[Web4] Runtime initialized (v1.0)');
    })();
  """
}

@available(iOS 15.0, *)
private class ZhtpFetchHandler: NSObject, WKScriptMessageHandler {
  private let runtime: Web4Runtime
  private let domain: String
  private let maxFetchSize: Int64 = 1024 * 1024 // 1MB max for fetch polyfill

  init(runtime: Web4Runtime, domain: String) {
    self.runtime = runtime
    self.domain = domain
  }

  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let body = message.body as? [String: Any],
          let urlString = body["url"] as? String,
          let callbackId = body["callbackId"] as? String,
          let url = URL(string: urlString) else { return }

    let path = url.path.isEmpty ? "/" : url.path
    let webView = message.webView

    Task {
      do {
        let resolved = try await runtime.resolveFile(domain: domain, path: path)

        // Check file size before loading
        let fileAttributes = try FileManager.default.attributesOfItem(atPath: resolved.url.path)
        let fileSize = fileAttributes[.size] as? Int64 ?? 0

        if fileSize > maxFetchSize {
          throw NSError(
            domain: "ZhtpFetch",
            code: 413,
            userInfo: [NSLocalizedDescriptionKey: "File too large for fetch (\(fileSize) bytes). Max: \(maxFetchSize)"]
          )
        }

        // Stream read in chunks to avoid peak memory usage
        let fileHandle = try FileHandle(forReadingFrom: resolved.url)
        defer { try? fileHandle.close() }

        var base64Parts: [String] = []
        let chunkSize = 8192
        while true {
          let chunk = fileHandle.readData(ofLength: chunkSize)
          if chunk.isEmpty { break }
          base64Parts.append(chunk.base64EncodedString())
        }
        let base64 = base64Parts.joined()

        let js = "window['\(callbackId)'](true, 200, '\(resolved.mime)', '\(base64)', null)"
        await MainActor.run { webView?.evaluateJavaScript(js, completionHandler: nil) }
      } catch {
        let errorMsg = error.localizedDescription.replacingOccurrences(of: "'", with: "\\'")
        let js = "window['\(callbackId)'](false, 500, '', '', '\(errorMsg)')"
        await MainActor.run { webView?.evaluateJavaScript(js, completionHandler: nil) }
      }
    }
  }
}

extension Web4View: WKNavigationDelegate, WKUIDelegate {
  func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
    onLoadStart?(["url": webView.url?.absoluteString ?? ""])
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    onLoadEnd?(["url": webView.url?.absoluteString ?? ""])
    onNavigation?(["url": webView.url?.absoluteString ?? "", "navigationType": "load"])
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    onError?(["code": "navigation_failed", "message": error.localizedDescription])
    onLoadEnd?(["url": webView.url?.absoluteString ?? ""])
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    onError?(["code": "navigation_failed", "message": error.localizedDescription])
    onLoadEnd?(["url": webView.url?.absoluteString ?? ""])
  }

  func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    guard let url = navigationAction.request.url else {
      decisionHandler(.cancel); return
    }
    switch url.scheme {
    case "zhtp":
      decisionHandler(.allow)
    case "mailto", "tel":
      decisionHandler(.allow)
    case "https":
      decisionHandler(allowHttpsExternal ? .allow : .cancel)
    default:
      decisionHandler(.cancel)
    }
  }
}
