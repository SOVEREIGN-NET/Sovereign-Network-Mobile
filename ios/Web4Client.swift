import Foundation

@available(iOS 15.0, *)
final class Web4Client {
  private let baseUrl: String
  private let timeout: TimeInterval
  private let insecure: Bool
  private let hostHeader: String?

  init(baseUrl: String, hostHeader: String? = nil, timeout: TimeInterval = 30, insecure: Bool = true) {
    self.baseUrl = baseUrl
    self.timeout = timeout
    self.insecure = insecure
    self.hostHeader = hostHeader
  }

  private func makeUrl(path: String) -> String {
    if path.hasPrefix("quic://") || path.hasPrefix("https://") {
      return path
    }
    return baseUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + path
  }

  func resolveDomain(domain: String) async throws -> Web4ResolveResponse {
    let payload: [String: Any] = [
      "domain": domain,
      "version": NSNull()
    ]
    let body = try JSONSerialization.data(withJSONObject: payload, options: [])
    let url = makeUrl(path: "/api/v1/web4/domains/resolve")
    // Web4 content endpoints whitelisted on public ALPN (zhtp-public/1)
    let response = try await NativeQuic().requestBytes(
      url: url,
      method: "POST",
      headers: [
        "content-type": "application/json",
        "Host": hostHeader ?? domain,
      ],
      body: body,
      timeout: timeout,
      insecure: insecure,
      alpn: NativeQuic.QuicAlpnProfile.publicContent
    )
    guard (200..<300).contains(response.status) else {
      let message = String(data: response.body, encoding: .utf8) ?? "resolve_failed"
      throw NSError(domain: "Web4Client", code: Int(response.status), userInfo: [NSLocalizedDescriptionKey: message])
    }
    let decoded = try JSONDecoder().decode(Web4ResolveResponse.self, from: response.body)
    return decoded
  }

  func fetchManifest(manifestCid: String) async throws -> Web4Manifest {
    let payload: [String: Any] = [
      "cid": manifestCid
    ]
    let body = try JSONSerialization.data(withJSONObject: payload, options: [])
    let url = makeUrl(path: "/api/v1/web4/content/manifest")
    // Web4 content endpoints whitelisted on public ALPN (zhtp-public/1)
    let response = try await NativeQuic().requestBytes(
      url: url,
      method: "POST",
      headers: [
        "content-type": "application/json",
        "Host": hostHeader ?? "",
      ].filter { !$0.value.isEmpty },
      body: body,
      timeout: timeout,
      insecure: insecure,
      alpn: NativeQuic.QuicAlpnProfile.publicContent
    )
    guard (200..<300).contains(response.status) else {
      let message = String(data: response.body, encoding: .utf8) ?? "manifest_failed"
      throw NSError(domain: "Web4Client", code: Int(response.status), userInfo: [NSLocalizedDescriptionKey: message])
    }

    let decoded = try JSONDecoder().decode(Web4Manifest.self, from: response.body)
    return decoded
  }

  func fetchBlob(cid: String) async throws -> Data {
    let payload: [String: Any] = [
      "cid": cid
    ]
    let body = try JSONSerialization.data(withJSONObject: payload, options: [])
    let url = makeUrl(path: "/api/v1/web4/content/blob")
    // Web4 content endpoints whitelisted on public ALPN (zhtp-public/1)
    let response = try await NativeQuic().requestBytes(
      url: url,
      method: "POST",
      headers: [
        "content-type": "application/json",
        "Host": hostHeader ?? "",
      ].filter { !$0.value.isEmpty },
      body: body,
      timeout: timeout,
      insecure: insecure,
      alpn: NativeQuic.QuicAlpnProfile.publicContent
    )
    guard (200..<300).contains(response.status) else {
      let message = String(data: response.body, encoding: .utf8) ?? "blob_failed"
      throw NSError(domain: "Web4Client", code: Int(response.status), userInfo: [NSLocalizedDescriptionKey: message])
    }
    return response.body
  }
}
