import Foundation
import WebKit

@available(iOS 15.0, *)
final class Web4SchemeHandler: NSObject, WKURLSchemeHandler {
  private let runtime: Web4Runtime?
  private let domain: String
  private let embeddedApp: String?
  private let proxyBaseUrl: String?
  private let proxyHostHeader: String?
  private let chunkSize = 64 * 1024 // 64KB chunks for streaming
  private var activeTasks = Set<Int>()
  private let lock = NSLock()

  init(
    runtime: Web4Runtime?,
    domain: String,
    embeddedApp: String? = nil,
    proxyBaseUrl: String? = nil,
    proxyHostHeader: String? = nil
  ) {
    self.runtime = runtime
    self.domain = domain.lowercased()
    self.embeddedApp = embeddedApp?.lowercased()
    self.proxyBaseUrl = proxyBaseUrl
    self.proxyHostHeader = proxyHostHeader?.lowercased()
  }

  private func embeddedMime(forPath path: String) -> String {
    let lower = path.lowercased()
    if lower.hasSuffix(".html") { return "text/html" }
    if lower.hasSuffix(".css") { return "text/css" }
    if lower.hasSuffix(".js") { return "application/javascript" }
    if lower.hasSuffix(".wasm") { return "application/wasm" }
    return "application/octet-stream"
  }

  private func resolveEmbeddedUrl(path: String) -> (url: URL, mime: String)? {
    guard let app = embeddedApp, !app.isEmpty else { return nil }

    var rel = path
    if rel.isEmpty || rel == "/" { rel = "/index.html" }
    if rel.contains("..") { return nil }

    let trimmed = rel.hasPrefix("/") ? String(rel.dropFirst()) : rel
    guard let base = Bundle.main.resourceURL else { return nil }

    let appDir = base
      .appendingPathComponent("web4apps", isDirectory: true)
      .appendingPathComponent(app, isDirectory: true)

    let fileUrl = appDir.appendingPathComponent(trimmed, isDirectory: false)

    if FileManager.default.fileExists(atPath: fileUrl.path) {
      return (fileUrl, embeddedMime(forPath: trimmed))
    }

    // Don't SPA-fallback for API paths — let them fall through to the proxy handler
    if rel.hasPrefix("/api/") || rel == "/api" { return nil }

    // SPA fallback: serve index.html for routes that don't match a file
    let indexUrl = appDir.appendingPathComponent("index.html", isDirectory: false)
    if FileManager.default.fileExists(atPath: indexUrl.path) {
      return (indexUrl, "text/html")
    }

    return nil
  }

  private func shouldProxyToNode(path: String) -> Bool {
    // Explorer (WASM) is expected to call into node APIs via same-origin /api/...
    // Keep this narrow to avoid turning the WebView into a generic proxy.
    return path == "/api" || path.hasPrefix("/api/")
  }

  private func errorPage(code: Int, title: String, message: String, url: String) -> Data {
    let html = """
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>\(title)</title>
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
        <div class="code">\(code)</div>
        <div class="title">\(title)</div>
        <div class="message">\(message)</div>
        <div class="url">\(url)</div>
      </div>
    </body>
    </html>
    """
    return html.data(using: .utf8) ?? Data()
  }

  func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
    guard let url = urlSchemeTask.request.url, url.scheme == "zhtp" else {
      urlSchemeTask.didFailWithError(NSError(domain: "Web4", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid scheme"]))
      return
    }

    let taskId = urlSchemeTask.hash
    lock.lock()
    activeTasks.insert(taskId)
    lock.unlock()

    let path = url.path.isEmpty ? "/" : url.path

    Task {
      do {
        // Prefer embedded assets when configured.
        if let embedded = resolveEmbeddedUrl(path: path) {
          let fileAttributes = try FileManager.default.attributesOfItem(atPath: embedded.url.path)
          let fileSize = fileAttributes[.size] as? Int ?? -1

          guard isTaskActive(taskId) else { return }

          let headers = [
            "Content-Type": embedded.mime,
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Cache-Control": "public, max-age=31536000",
          ]
          let response = HTTPURLResponse(
            url: url,
            statusCode: 200,
            httpVersion: "HTTP/1.1",
            headerFields: headers
          ) ?? URLResponse(
            url: url,
            mimeType: embedded.mime,
            expectedContentLength: fileSize,
            textEncodingName: embedded.mime.contains("text") ? "utf-8" : nil
          )
          urlSchemeTask.didReceive(response)

          let fileHandle = try FileHandle(forReadingFrom: embedded.url)
          defer { try? fileHandle.close() }

          while isTaskActive(taskId) {
            let chunk = fileHandle.readData(ofLength: chunkSize)
            if chunk.isEmpty { break }
            urlSchemeTask.didReceive(chunk)
          }

          if isTaskActive(taskId) {
            urlSchemeTask.didFinish()
          }

          lock.lock()
          activeTasks.remove(taskId)
          lock.unlock()
          return
        }

        // If not an embedded asset, optionally proxy node API calls over QUIC.
        if let base = proxyBaseUrl, shouldProxyToNode(path: path) {
          let method = (urlSchemeTask.request.httpMethod ?? "GET").uppercased()
          let body = urlSchemeTask.request.httpBody
          let query = url.query.map { "?\($0)" } ?? ""
          let fullUrl = base.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + (url.path.isEmpty ? "/" : url.path) + query

          let contentType = urlSchemeTask.request.value(forHTTPHeaderField: "content-type")
            ?? urlSchemeTask.request.value(forHTTPHeaderField: "Content-Type")
            ?? "application/json"

          let response = try await NativeQuic().requestBytes(
            url: fullUrl,
            method: method,
            headers: [
              "content-type": contentType,
              // Important: use the Web4 domain as SNI/Host to match the node certificate.
              "Host": proxyHostHeader ?? domain
            ],
            body: body,
            timeout: 30,
            insecure: true,
            alpn: NativeQuic.QuicAlpnProfile.publicContent
          )

          guard isTaskActive(taskId) else { return }

          let mime = response.headers["content-type"] ?? "application/json"
          let bodyBytes = response.body

          let headers = [
            "Content-Type": mime,
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Cache-Control": "no-store",
          ]
          let urlResponse = HTTPURLResponse(
            url: url,
            statusCode: response.status,
            httpVersion: "HTTP/1.1",
            headerFields: headers
          ) ?? URLResponse(
            url: url,
            mimeType: mime,
            expectedContentLength: bodyBytes.count,
            textEncodingName: mime.contains("text") || mime.contains("json") ? "utf-8" : nil
          )
          urlSchemeTask.didReceive(urlResponse)
          urlSchemeTask.didReceive(bodyBytes)
          urlSchemeTask.didFinish()

          lock.lock()
          activeTasks.remove(taskId)
          lock.unlock()
          return
        }

        guard let runtime = runtime else {
          throw NSError(domain: "Web4", code: 404, userInfo: [NSLocalizedDescriptionKey: "Not found: \(path)"])
        }

        let resolved = try await runtime.resolveFile(domain: domain, path: path)

        // Get file size for Content-Length header
        let fileAttributes = try FileManager.default.attributesOfItem(atPath: resolved.url.path)
        let fileSize = fileAttributes[.size] as? Int ?? -1

        // Check if task was cancelled
        guard isTaskActive(taskId) else { return }

        let headers = [
          "Content-Type": resolved.mime,
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "*",
          "Cache-Control": "public, max-age=31536000",
        ]
        let response = HTTPURLResponse(
          url: url,
          statusCode: 200,
          httpVersion: "HTTP/1.1",
          headerFields: headers
        ) ?? URLResponse(
          url: url,
          mimeType: resolved.mime,
          expectedContentLength: fileSize,
          textEncodingName: resolved.mime.contains("text") ? "utf-8" : nil
        )
        urlSchemeTask.didReceive(response)

        // Stream file in chunks to avoid loading entire file into memory
        let fileHandle = try FileHandle(forReadingFrom: resolved.url)
        defer { try? fileHandle.close() }

        while isTaskActive(taskId) {
          let chunk = fileHandle.readData(ofLength: chunkSize)
          if chunk.isEmpty { break }
          urlSchemeTask.didReceive(chunk)
        }

        if isTaskActive(taskId) {
          urlSchemeTask.didFinish()
        }
      } catch {
        print("[Web4SchemeHandler] Failed to load \(url.absoluteString): \(error)")
        if isTaskActive(taskId) {
          // Serve error page instead of failing
          let errorMessage = error.localizedDescription
          let isNotFound = errorMessage.lowercased().contains("not found") ||
                          errorMessage.lowercased().contains("404")
          let code = isNotFound ? 404 : 500
          let title = isNotFound ? "Not Found" : "Error"
          let message = isNotFound
            ? "The requested page could not be found on this domain."
            : "Something went wrong while loading this page."

          let errorData = errorPage(code: code, title: title, message: message, url: url.absoluteString)
          let response = URLResponse(
            url: url,
            mimeType: "text/html",
            expectedContentLength: errorData.count,
            textEncodingName: "utf-8"
          )
          urlSchemeTask.didReceive(response)
          urlSchemeTask.didReceive(errorData)
          urlSchemeTask.didFinish()
        }
      }

      lock.lock()
      activeTasks.remove(taskId)
      lock.unlock()
    }
  }

  func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
    lock.lock()
    activeTasks.remove(urlSchemeTask.hash)
    lock.unlock()
  }

  private func isTaskActive(_ taskId: Int) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    return activeTasks.contains(taskId)
  }
}
