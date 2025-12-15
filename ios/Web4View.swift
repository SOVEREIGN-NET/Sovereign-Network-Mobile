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
            window.webkit.messageHandlers.zhtpFetch.postMessage({ url: url, callbackId: callbackId });
          });
        }
        return originalFetch.apply(this, arguments);
      };
      console.log('[Web4] Fetch polyfill installed');
    })();
  """
}

@available(iOS 15.0, *)
private class ZhtpFetchHandler: NSObject, WKScriptMessageHandler {
  private let runtime: Web4Runtime
  private let domain: String

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
        let data = try Data(contentsOf: resolved.url)
        let base64 = data.base64EncodedString()
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
