import Foundation
import WebKit

@available(iOS 15.0, *)
final class Web4SchemeHandler: NSObject, WKURLSchemeHandler {
  private let runtime: Web4Runtime
  private let domain: String

  init(runtime: Web4Runtime, domain: String) {
    self.runtime = runtime
    self.domain = domain.lowercased()
  }

  func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
    guard let url = urlSchemeTask.request.url, url.scheme == "zhtp" else {
      urlSchemeTask.didFailWithError(NSError(domain: "Web4", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid scheme"]))
      return
    }

    let path = url.path.isEmpty ? "/" : url.path

    Task {
      do {
        let resolved = try await runtime.resolveFile(domain: domain, path: path)
        let data = try Data(contentsOf: resolved.url)
        let response = URLResponse(
          url: url,
          mimeType: resolved.mime,
          expectedContentLength: data.count,
          textEncodingName: resolved.mime.contains("text") ? "utf-8" : nil
        )
        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
      } catch {
        print("[Web4SchemeHandler] Failed to load \(url.absoluteString): \(error)")
        urlSchemeTask.didFailWithError(error)
      }
    }
  }

  func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
    // Nothing to cancel yet; Task will exit
  }
}
