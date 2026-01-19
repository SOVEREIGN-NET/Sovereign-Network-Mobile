import Foundation
import Network
import React

/**
 * Native QUIC Module for iOS
 * Implements pure QUIC transport using Apple's Network.framework (iOS 15+)
 * Provides HTTP-like request/response semantics over QUIC streams
 */
@objc(NativeQuic)
class NativeQuic: NSObject {

  // MARK: - Properties

  private let queue = DispatchQueue(label: "com.sovereignnetwork.quic", qos: .userInitiated)
  private var activeConnections: [String: NWConnection] = [:]
  private let connectionLock = NSLock()

  // Default configuration
  private let defaultTimeout: TimeInterval = 30.0

  // ALPN profiles
  enum QuicAlpnProfile {
    case publicContent   // zhtp-public/1
    case controlPlane    // zhtp-uhp/2
  }

  // MARK: - React Native Bridge Methods

  /**
   * Check if QUIC is supported on this device
   */
  @objc
  func isSupported(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    if #available(iOS 15.0, *) {
      resolve(true)
    } else {
      resolve(false)
    }
  }

  /**
   * Simple UDP reachability check - verifies the node port is open
   * This doesn't do a full QUIC handshake, just checks if UDP port is reachable
   * Useful for showing node status without PQC handshake
   */
  @objc
  func checkReachability(_ host: String, port: Int, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    let startTime = Date()

    // Create UDP parameters (QUIC runs over UDP)
    let parameters = NWParameters.udp

    // Create endpoint
    let endpoint = NWEndpoint.hostPort(
      host: NWEndpoint.Host(host),
      port: NWEndpoint.Port(integerLiteral: UInt16(port))
    )

    // Create UDP connection
    let connection = NWConnection(to: endpoint, using: parameters)
    var hasResolved = false
    let resolveLock = NSLock()

    // Helper to safely resolve only once and cleanup
    func safeResolve(_ result: [String: Any]) {
      resolveLock.lock()
      defer { resolveLock.unlock() }
      guard !hasResolved else { return }
      hasResolved = true
      connection.stateUpdateHandler = nil
      connection.cancel()
      resolve(result)
    }

    connection.stateUpdateHandler = { [weak connection] state in
      guard let conn = connection else { return }

      resolveLock.lock()
      let alreadyResolved = hasResolved
      resolveLock.unlock()
      guard !alreadyResolved else { return }

      print("[NativeQuic] UDP Reachability state: \(state)")

      switch state {
      case .ready:
        let latency = Date().timeIntervalSince(startTime) * 1000
        print("[NativeQuic] UDP port reachable in \(latency)ms")

        // Send a small probe packet to verify bidirectional connectivity
        let probeData = Data([0x00])
        conn.send(content: probeData, completion: .contentProcessed { error in
          if error != nil {
            safeResolve([
              "reachable": true,
              "latencyMs": latency,
              "host": host,
              "port": port,
              "note": "Port open, send probe had error"
            ])
          } else {
            safeResolve([
              "reachable": true,
              "latencyMs": latency,
              "host": host,
              "port": port
            ])
          }
        })

      case .failed(let error):
        print("[NativeQuic] UDP FAILED: \(error.localizedDescription)")
        safeResolve([
          "reachable": false,
          "error": error.localizedDescription,
          "host": host,
          "port": port
        ])

      case .cancelled:
        safeResolve([
          "reachable": false,
          "error": "Cancelled",
          "host": host,
          "port": port
        ])

      default:
        break
      }
    }

    connection.start(queue: queue)

    // Short timeout for reachability check (5 seconds)
    queue.asyncAfter(deadline: .now() + 5.0) {
      safeResolve([
        "reachable": false,
        "error": "Timeout",
        "host": host,
        "port": port
      ])
    }
  }

  /**
   * Test connection to a QUIC server
   */
  @objc
  func testConnection(_ host: String, port: Int, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    guard #available(iOS 15.0, *) else {
      reject("QUIC_UNSUPPORTED", "QUIC requires iOS 15 or later", nil)
      return
    }

    let startTime = Date()
    let parameters = createQuicParameters(insecure: true, serverName: nil, profile: .controlPlane)

    let endpoint = NWEndpoint.hostPort(
      host: NWEndpoint.Host(host),
      port: NWEndpoint.Port(integerLiteral: UInt16(port))
    )

    let connection = NWConnection(to: endpoint, using: parameters)
    var hasResolved = false
    let resolveLock = NSLock()

    // Helper to safely resolve/reject only once and cleanup
    func safeComplete(success: Bool, result: Any?, error: String? = nil, nativeError: Error? = nil) {
      resolveLock.lock()
      defer { resolveLock.unlock() }
      guard !hasResolved else { return }
      hasResolved = true
      connection.stateUpdateHandler = nil
      connection.cancel()

      if success, let res = result {
        resolve(res)
      } else {
        reject("QUIC_ERROR", error ?? "Unknown error", nativeError)
      }
    }

    connection.stateUpdateHandler = { state in
      print("[NativeQuic] Connection state: \(state)")

      switch state {
      case .setup:
        print("[NativeQuic] Connection setup...")

      case .preparing:
        print("[NativeQuic] Connection preparing (TLS handshake)...")

      case .ready:
        let latency = Date().timeIntervalSince(startTime) * 1000
        print("[NativeQuic] Connection READY in \(latency)ms")
        safeComplete(success: true, result: [
          "success": true,
          "latencyMs": latency,
          "protocol": "QUIC",
          "host": host,
          "port": port
        ])

      case .waiting(let error):
        print("[NativeQuic] Connection waiting: \(error.localizedDescription)")

      case .failed(let error):
        print("[NativeQuic] Connection FAILED: \(error.localizedDescription)")
        safeComplete(success: false, result: nil, error: "Failed to connect: \(error.localizedDescription)", nativeError: error)

      case .cancelled:
        print("[NativeQuic] Connection cancelled")

      @unknown default:
        print("[NativeQuic] Unknown state")
      }
    }

    connection.start(queue: self.queue)

    // Timeout after 30 seconds
    self.queue.asyncAfter(deadline: .now() + defaultTimeout) {
      safeComplete(success: false, result: nil, error: "Connection timed out after \(self.defaultTimeout) seconds")
    }
  }

  /**
   * Make an HTTP-like request over QUIC
   *
   * @param url Full URL (quic://host:port/path or https://host:port/path)
   * @param options Request options (method, headers, body, timeout, insecure)
   */
  @objc
  func request(_ url: String, options: NSDictionary, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    guard #available(iOS 15.0, *) else {
      reject("QUIC_UNSUPPORTED", "QUIC requires iOS 15 or later", nil)
      return
    }

    guard let parsedUrl = parseQuicUrl(url) else {
      reject("INVALID_URL", "Invalid QUIC URL: \(url)", nil)
      return
    }

    let method = options["method"] as? String ?? "GET"
    let headers = options["headers"] as? [String: String] ?? [:]
    let body = options["body"] as? String
    let timeout = options["timeout"] as? Double ?? defaultTimeout
    let insecure = options["insecure"] as? Bool ?? true
    let alpnOption = options["alpn"] as? String ?? "authenticated"

    // Select ALPN profile based on option from JS
    let profile: QuicAlpnProfile = alpnOption == "public" ? .publicContent : .controlPlane
    print("[NativeQuic] 🔑 ALPN: '\(alpnOption)' -> \(profile == .publicContent ? "zhtp-public/1" : "zhtp-uhp/2")")

    let parameters = createQuicParameters(
      insecure: insecure,
      serverName: headers["Host"] ?? parsedUrl.host,
      profile: profile
    )

    let endpoint = NWEndpoint.hostPort(
      host: NWEndpoint.Host(parsedUrl.host),
      port: NWEndpoint.Port(integerLiteral: UInt16(parsedUrl.port))
    )

    let connection = NWConnection(to: endpoint, using: parameters)
    let connectionId = UUID().uuidString

    // Store connection
    connectionLock.lock()
    activeConnections[connectionId] = connection
    connectionLock.unlock()

    var hasResolved = false
    let resolveLock = NSLock()

    // Helper to safely resolve/reject only once and cleanup
    func safeComplete(success: Bool, result: Any?, error: String? = nil, nativeError: Error? = nil) {
      resolveLock.lock()
      defer { resolveLock.unlock() }
      guard !hasResolved else { return }
      hasResolved = true

      // Clear state handler before cleanup to prevent callbacks
      connection.stateUpdateHandler = nil
      self.cleanupConnection(connectionId)

      if success, let res = result {
        resolve(res)
      } else {
        reject("QUIC_ERROR", error ?? "Unknown error", nativeError)
      }
    }

    connection.stateUpdateHandler = { [weak self] state in
      guard let self = self else {
        safeComplete(success: false, result: nil, error: "Module deallocated")
        return
      }

      print("[NativeQuic] Request connection state: \(state)")

      switch state {
      case .setup:
        print("[NativeQuic] Request: Connection setup...")

      case .preparing:
        print("[NativeQuic] Request: Connection preparing (QUIC/TLS handshake)...")

      case .waiting(let error):
        print("[NativeQuic] Request: Connection waiting - \(error.localizedDescription)")
        // Check for specific QUIC errors
        if let nwError = error as? NWError {
          print("[NativeQuic] Request: NWError details - \(nwError)")
        }

      case .ready:
        if profile == .controlPlane {
          guard let identityId = self.extractIdentityId(path: parsedUrl.path, body: body, headers: headers) else {
            safeComplete(success: false, result: nil, error: "Missing identity_id for authenticated request")
            return
          }

          switch performUhpHandshake(connection: connection, identityId: identityId) {
          case .failure(let error):
            safeComplete(success: false, result: nil, error: "UHP handshake failed: \(error.localizedDescription)", nativeError: error)
          case .success(let sessionInfo):
            do {
              // Session ID is now enforced to be exactly 32 bytes in UhpHandshake.swift
              print("[NativeQuic] ✓ Session ID: \(sessionInfo.sessionId.count) bytes (UHP v2 compliant)")
              let macKey = try deriveMacKey(sessionKey: sessionInfo.sessionKey, handshakeHash: sessionInfo.handshakeHash)
              var session = AuthSession(
                sessionId: sessionInfo.sessionId,
                macKey: macKey,
                sequence: 0,
                clientDid: sessionInfo.clientDid,
                serverDid: sessionInfo.peerDid,
                createdAt: Date(),
                lastActivity: Date()
              )

              let requestBody = body?.data(using: .utf8) ?? Data()
              let zhtpMethod = self.httpMethodToZhtpMethod(method)

              sendAuthenticatedZhtpRequest(
                connection: connection,
                session: &session,
                method: zhtpMethod,
                path: parsedUrl.path,
                headers: headers,
                body: requestBody,
                requester: sessionInfo.clientDid
              ) { result in
                switch result {
                case .success(let (status, responseBody)):
                  let bodyString = String(data: responseBody, encoding: .utf8) ?? ""
                  let response: [String: Any] = [
                    "status": Int(status),
                    "statusText": status >= 200 && status < 300 ? "OK" : "Error",
                    "headers": [:],
                    "body": bodyString,
                    "ok": status >= 200 && status < 300
                  ]
                  safeComplete(success: true, result: response)
                case .failure(let error):
                  safeComplete(success: false, result: nil, error: error.localizedDescription, nativeError: error)
                }
              }
            } catch {
              safeComplete(success: false, result: nil, error: "MAC key derivation failed: \(error.localizedDescription)", nativeError: error)
            }
          }
        } else {
          self.sendHttpRequest(
            connection: connection,
            method: method,
            path: parsedUrl.path,
            host: parsedUrl.host,
            port: parsedUrl.port,
            headers: headers,
            body: body
          ) { result in
            switch result {
            case .success(let response):
              safeComplete(success: true, result: response)
            case .failure(let error):
              safeComplete(success: false, result: nil, error: error.localizedDescription, nativeError: error)
            }
          }
        }

      case .failed(let error):
        safeComplete(success: false, result: nil, error: "Connection failed: \(error.localizedDescription)", nativeError: error)

      case .cancelled:
        safeComplete(success: false, result: nil, error: "Connection was cancelled")

      default:
        break
      }
    }

    connection.start(queue: queue)

    // Timeout handler
    queue.asyncAfter(deadline: .now() + timeout) {
      safeComplete(success: false, result: nil, error: "Request timed out after \(timeout) seconds")
    }
  }

  /**
   * Raw-bytes request for internal use (not exported to JS)
   */
  @objc
  func requestBytesBridge(
    _ url: String,
    method: String = "GET",
    headers: NSDictionary = [:],
    body: Data? = nil,
    timeout: NSNumber? = nil,
    insecure: NSNumber? = nil,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    Task {
      do {
        let headersDict = headers as? [String: String] ?? [:]
        let result = try await requestBytes(
          url: url,
          method: method,
          headers: headersDict,
          body: body,
          timeout: timeout?.doubleValue ?? defaultTimeout,
          insecure: insecure?.boolValue ?? true
        )
        resolve([
          "status": result.status,
          "statusText": result.statusText,
          "headers": result.headers,
          "body": result.body
        ])
      } catch {
        reject("QUIC_ERROR", error.localizedDescription, error)
      }
    }
  }

  /**
   * Cancel all active connections
   */
  @objc
  func cancelAll(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    connectionLock.lock()
    let connections = activeConnections
    activeConnections.removeAll()
    connectionLock.unlock()

    for (_, connection) in connections {
      connection.stateUpdateHandler = nil
      connection.cancel()
    }

    resolve(true)
  }

  // MARK: - Private Helpers

  private func httpMethodToZhtpMethod(_ method: String) -> ZhtpMethod {
    switch method.uppercased() {
    case "GET": return .get
    case "POST": return .post
    case "PUT": return .put
    case "DELETE": return .delete
    case "OPTIONS": return .options
    case "HEAD": return .head
    case "PATCH": return .patch
    case "VERIFY": return .verify
    case "CONNECT": return .connect
    case "TRACE": return .trace
    default: return .get
    }
  }

  @available(iOS 15.0, *)
  private func createQuicParameters(
    insecure: Bool,
    serverName: String?,
    profile: QuicAlpnProfile
  ) -> NWParameters {
    let alpnList: [String]
    switch profile {
    case .publicContent:
      alpnList = ["zhtp-public/1"]
    case .controlPlane:
      alpnList = ["zhtp-uhp/2"]
    }
    print("[NativeQuic] Creating QUIC parameters with ALPNs: \(alpnList)")

    let quicOptions = NWProtocolQUIC.Options(alpn: alpnList)
    quicOptions.idleTimeout = 30_000

    // Create parameters with QUIC
    let parameters = NWParameters(quic: quicOptions)

    if let serverName = serverName, !serverName.isEmpty {
      sec_protocol_options_set_tls_server_name(
        quicOptions.securityProtocolOptions,
        serverName
      )
    }

    // Always disable certificate verification for now (self-signed certs / TOFU)
    print("[NativeQuic] Configuring TLS for self-signed certificates")

    // Set verify block to accept all certs
    sec_protocol_options_set_verify_block(
      quicOptions.securityProtocolOptions,
      { (metadata, trust, completion) in
        print("[NativeQuic] TLS verify callback triggered")
        // Always accept - security is handled by ZHTP layer
        completion(true)
      },
      self.queue
    )

    // TLS 1.3 required for QUIC
    sec_protocol_options_set_min_tls_protocol_version(
      quicOptions.securityProtocolOptions,
      .TLSv13
    )

    // Add challenge block to handle any TLS challenges
    sec_protocol_options_set_challenge_block(
      quicOptions.securityProtocolOptions,
      { (metadata, completion) in
        print("[NativeQuic] TLS challenge callback triggered")
        completion(nil)
      },
      self.queue
    )

    return parameters
  }

  private func parseQuicUrl(_ urlString: String) -> (host: String, port: Int, path: String)? {
    var normalizedUrl = urlString
    if normalizedUrl.hasPrefix("quic://") {
      normalizedUrl = normalizedUrl.replacingOccurrences(of: "quic://", with: "https://")
    }

    guard let url = URL(string: normalizedUrl) else { return nil }

    let host = url.host ?? ""
    let port = url.port ?? 443
    var path = url.path
    if path.isEmpty { path = "/" }
    if let query = url.query {
      path += "?\(query)"
    }

    return (host: host, port: port, path: path)
  }

  private func normalizeIdentityId(_ identityId: String) -> String {
    let trimmed = identityId.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.hasPrefix("did:zhtp:") {
      return String(trimmed.dropFirst("did:zhtp:".count))
    }
    return trimmed
  }

  private func extractIdentityId(path: String, body: String?, headers: [String: String]) -> String? {
    if let headerValue = headers["X-Zhtp-Identity"] ?? headers["x-zhtp-identity"] {
      let normalized = normalizeIdentityId(headerValue)
      return normalized.isEmpty ? nil : normalized
    }

    if let body = body,
       let bodyData = body.data(using: .utf8),
       let json = try? JSONSerialization.jsonObject(with: bodyData) as? [String: Any],
       let identityId = json["identity_id"] as? String {
      let normalized = normalizeIdentityId(identityId)
      return normalized.isEmpty ? nil : normalized
    }

    let components = path.split(separator: "/").map(String.init)
    if components.count >= 5,
       components[0] == "api",
       components[1] == "v1",
       components[2] == "wallet",
       components[3] == "list" {
      let normalized = normalizeIdentityId(components[4])
      return normalized.isEmpty ? nil : normalized
    }

    if components.count >= 6,
       components[0] == "api",
       components[1] == "v1",
       components[2] == "wallet",
       components[3] == "balance" {
      let normalized = normalizeIdentityId(components[5])
      return normalized.isEmpty ? nil : normalized
    }

    return nil
  }

  @available(iOS 15.0, *)
  private func sendHttpRequest(
    connection: NWConnection,
    method: String,
    path: String,
    host: String,
    port: Int,
    headers: [String: String],
    body: String?,
    completion: @escaping (Result<[String: Any], Error>) -> Void
  ) {
    do {
      // Encode body as Data
      let bodyData = body?.data(using: .utf8) ?? Data()
      let timestamp = UInt64(Date().timeIntervalSince1970)

      // Build SDK CBOR request (public mode - no authentication, no length prefix)
      let requestData = try zhtp_encode_sdk_request(
        method: method,
        path: path,
        timestamp: timestamp,
        body: bodyData
      )

      print("[NativeQuic] Sending \(method) \(path) (\(requestData.count) bytes CBOR)")
      let hexPreview = requestData.prefix(100).map({ String(format: "%02x", $0) }).joined(separator: " ")
      print("[NativeQuic] Request hex (first 100 bytes): \(hexPreview)")

      // Send CBOR-encoded ZHTP request over QUIC
      connection.send(content: requestData, contentContext: .finalMessage, isComplete: true, completion: .contentProcessed { [weak self] error in
        if let error = error {
          print("[NativeQuic] Send failed: \(error.localizedDescription)")
          completion(.failure(error))
          return
        }
        print("[NativeQuic] Send succeeded (stream write closed), waiting for response...")
        self?.receiveHttpResponse(connection: connection, completion: completion)
      })
    } catch {
      print("[NativeQuic] Failed to encode ZHTP request: \(error)")
      completion(.failure(error))
    }
  }

  @available(iOS 15.0, *)
  private func receiveHttpResponse(
    connection: NWConnection,
    completion: @escaping (Result<[String: Any], Error>) -> Void
  ) {
    var responseData = Data()
    var hasCompleted = false
    let completionLock = NSLock()

    func safeComplete(_ result: Result<[String: Any], Error>) {
      completionLock.lock()
      defer { completionLock.unlock() }
      guard !hasCompleted else { return }
      hasCompleted = true
      print("[NativeQuic] Receive completing with \(responseData.count) total bytes")
      completion(result)
    }

    func receiveMore() {
      print("[NativeQuic] Calling receive() on connection...")
      connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] content, context, isComplete, error in
        print("[NativeQuic] Receive callback: content=\(content?.count ?? 0) bytes, isComplete=\(isComplete), error=\(error?.localizedDescription ?? "nil")")

        if let error = error {
          print("[NativeQuic] Receive error: \(error)")
          safeComplete(.failure(error))
          return
        }

        if let content = content {
          responseData.append(content)
          print("[NativeQuic] Received \(content.count) bytes, total: \(responseData.count)")
          if let preview = String(data: content.prefix(200), encoding: .utf8) {
            print("[NativeQuic] Data preview: \(preview)")
          }
        }

        if isComplete {
          print("[NativeQuic] Stream complete, parsing response...")
          self?.parseHttpResponse(data: responseData) { result in
            safeComplete(result)
          }
        } else if content == nil && !isComplete {
          // No data and not complete - might be waiting
          print("[NativeQuic] No data received yet, continuing to wait...")
          receiveMore()
        } else {
          receiveMore()
        }
      }
    }

    receiveMore()
  }

  private func parseHttpResponse(
    data: Data,
    completion: @escaping (Result<[String: Any], Error>) -> Void
  ) {
    do {
      // Decode CBOR response to ZhtpResponseWire
      let zhtpResponse = try zhtp_decode_response(data)

      // Extract body as string
      let bodyString = String(data: zhtpResponse.response.body, encoding: .utf8) ?? ""

      // Extract headers as [String: String]
      var responseHeaders: [String: String] = [:]
      // Headers are in the ZHTP response structure (if available)
      responseHeaders["content-type"] = zhtpResponse.response.headers.content_type

      let response: [String: Any] = [
        "status": zhtpResponse.status,
        "statusText": zhtpResponse.error_message ?? "OK",
        "headers": responseHeaders,
        "body": bodyString,
        "ok": zhtpResponse.status >= 200 && zhtpResponse.status < 300
      ]

      print("[NativeQuic] Parsed ZHTP response: status=\(zhtpResponse.status)")
      completion(.success(response))
    } catch {
      print("[NativeQuic] Failed to decode ZHTP response: \(error)")
      completion(.failure(NSError(domain: "NativeQuic", code: -2, userInfo: [NSLocalizedDescriptionKey: "Failed to decode CBOR response: \(error.localizedDescription)"])))
    }
  }

  // MARK: - Internal helpers for raw bytes (for Web4 runtime)

  @available(iOS 15.0, *)
  func requestBytes(
    url: String,
    method: String = "GET",
    headers: [String: String] = [:],
    body: Data? = nil,
    timeout: TimeInterval = 30,
    insecure: Bool = true,
    alpn: QuicAlpnProfile = .publicContent
  ) async throws -> (status: Int, headers: [String: String], body: Data, statusText: String) {
    guard let parsedUrl = parseQuicUrl(url) else {
      throw NSError(domain: "NativeQuic", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid URL"])
    }

    print("[NativeQuic] requestBytes: \(method) \(url) with ALPN: \(alpn == .publicContent ? "zhtp-public/1" : "zhtp-uhp/2")")

    let parameters = createQuicParameters(
      insecure: insecure,
      serverName: headers["Host"] ?? parsedUrl.host,
      profile: alpn
    )
    let endpoint = NWEndpoint.hostPort(
      host: NWEndpoint.Host(parsedUrl.host),
      port: NWEndpoint.Port(integerLiteral: UInt16(parsedUrl.port))
    )

    return try await withCheckedThrowingContinuation { continuation in
      var didFinish = false
      let finishLock = NSLock()

      let connection = NWConnection(to: endpoint, using: parameters)
      let connectionId = UUID().uuidString

      connectionLock.lock()
      activeConnections[connectionId] = connection
      connectionLock.unlock()

      @Sendable func finish(_ result: Result<(status: Int, headers: [String: String], body: Data, statusText: String), Error>) {
        finishLock.lock()
        if didFinish {
          finishLock.unlock()
          return
        }
        didFinish = true
        finishLock.unlock()
        connectionLock.lock()
        activeConnections.removeValue(forKey: connectionId)
        connectionLock.unlock()
        connection.stateUpdateHandler = nil
        connection.cancel()
        continuation.resume(with: result)
      }

      connection.stateUpdateHandler = { [weak self] state in
        guard let self = self else { return }
        print("[NativeQuic] requestBytes connection state: \(state)")
        switch state {
        case .ready:
          print("[NativeQuic] requestBytes: connection READY, sending ZHTP request...")
          // Convert HTTP method string to ZhtpMethod
          sendZhtpRequest(
            connection: connection,
            method: method,
            path: parsedUrl.path,
            headers: headers,
            body: body
          ) { result in
            switch result {
            case .success(let (status, body)):
              finish(.success((status: Int(status), headers: [:], body: body, statusText: "")))
            case .failure(let error):
              finish(.failure(error))
            }
          }
        case .waiting(let error):
          print("[NativeQuic] requestBytes: connection WAITING - \(error.localizedDescription)")
        case .failed(let error):
          print("[NativeQuic] requestBytes: connection FAILED - \(error.localizedDescription)")
          finish(.failure(error))
        case .cancelled:
          print("[NativeQuic] requestBytes: connection CANCELLED")
          finish(.failure(NSError(domain: "NativeQuic", code: -2, userInfo: [NSLocalizedDescriptionKey: "Cancelled"])))
        default:
          break
        }
      }

      connection.start(queue: queue)

      queue.asyncAfter(deadline: .now() + timeout) {
        finish(.failure(NSError(domain: "NativeQuic", code: -3, userInfo: [NSLocalizedDescriptionKey: "Timeout"])))
      }
    }
  }

  @available(iOS 15.0, *)
  private func sendHttpRequestBytes(
    connection: NWConnection,
    method: String,
    path: String,
    host: String,
    port: Int,
    headers: [String: String],
    body: Data?,
    completion: @escaping (Result<Data, Error>) -> Void
  ) {
    var httpRequest = "\(method) \(path) HTTP/1.1\r\n"
    httpRequest += "Host: \(host):\(port)\r\n"
    httpRequest += "Connection: close\r\n"
    httpRequest += "User-Agent: SovereignNetwork-iOS/1.0 QUIC\r\n"

    for (key, value) in headers {
      httpRequest += "\(key): \(value)\r\n"
    }

    if let body = body {
      httpRequest += "Content-Length: \(body.count)\r\n"
      httpRequest += "Content-Type: application/octet-stream\r\n"
      httpRequest += "\r\n"
      // Combine headers and body into single data for atomic send
      var requestData = httpRequest.data(using: .utf8) ?? Data()
      requestData.append(body)
      // Use .finalMessage and isComplete: true to signal end of request
      connection.send(content: requestData, contentContext: .finalMessage, isComplete: true, completion: .contentProcessed { [weak self] error in
        if let error = error {
          print("[NativeQuic] sendHttpRequestBytes: send failed - \(error)")
          completion(.failure(error))
          return
        }
        print("[NativeQuic] sendHttpRequestBytes: send succeeded, waiting for response...")
        self?.receiveHttpResponseBytes(connection: connection, completion: completion)
      })
    } else {
      httpRequest += "\r\n"
      // Use .finalMessage and isComplete: true to signal end of request
      connection.send(content: httpRequest.data(using: .utf8), contentContext: .finalMessage, isComplete: true, completion: .contentProcessed { [weak self] error in
        if let error = error {
          print("[NativeQuic] sendHttpRequestBytes: send failed - \(error)")
          completion(.failure(error))
          return
        }
        print("[NativeQuic] sendHttpRequestBytes: send succeeded, waiting for response...")
        self?.receiveHttpResponseBytes(connection: connection, completion: completion)
      })
    }
  }

  @available(iOS 15.0, *)
  private func receiveHttpResponseBytes(
    connection: NWConnection,
    completion: @escaping (Result<Data, Error>) -> Void
  ) {
    var responseData = Data()
    var hasCompleted = false
    let completionLock = NSLock()

    func safeComplete(_ result: Result<Data, Error>) {
      completionLock.lock()
      defer { completionLock.unlock() }
      guard !hasCompleted else { return }
      hasCompleted = true
      print("[NativeQuic] receiveHttpResponseBytes completing with \(responseData.count) bytes")
      completion(result)
    }

    func receiveMore() {
      print("[NativeQuic] receiveHttpResponseBytes: calling receive(), connection state=\(connection.state)")
      connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] content, context, isComplete, error in
        print("[NativeQuic] receiveHttpResponseBytes callback: content=\(content?.count ?? 0) bytes, isComplete=\(isComplete), error=\(error?.localizedDescription ?? "nil")")

        if let error = error {
          print("[NativeQuic] receiveHttpResponseBytes: ERROR - \(error)")
          safeComplete(.failure(error))
          return
        }

        if let content = content {
          responseData.append(content)
          print("[NativeQuic] receiveHttpResponseBytes: received \(content.count) bytes, total=\(responseData.count)")
        }

        if isComplete {
          print("[NativeQuic] receiveHttpResponseBytes: stream complete")
          safeComplete(.success(responseData))
        } else {
          receiveMore()
        }
      }
    }

    receiveMore()
  }

  private func parseHttpResponseBytes(data: Data) throws -> (status: Int, headers: [String: String], body: Data, statusText: String) {
    guard let separatorRange = data.range(of: Data([13, 10, 13, 10])) else { // \r\n\r\n
      throw NSError(domain: "NativeQuic", code: -4, userInfo: [NSLocalizedDescriptionKey: "Invalid HTTP response"])
    }

    let headerData = data[..<separatorRange.lowerBound]
    let body = data[separatorRange.upperBound...]

    guard let headerString = String(data: headerData, encoding: .utf8) else {
      throw NSError(domain: "NativeQuic", code: -5, userInfo: [NSLocalizedDescriptionKey: "Invalid header encoding"])
      }

    let headerLines = headerString.components(separatedBy: "\r\n")
    guard let statusLine = headerLines.first else {
      throw NSError(domain: "NativeQuic", code: -6, userInfo: [NSLocalizedDescriptionKey: "Missing status line"])
    }

    let statusParts = statusLine.split(separator: " ", maxSplits: 2)
    let statusCode = statusParts.count > 1 ? Int(statusParts[1]) ?? 0 : 0
    let statusText = statusParts.count > 2 ? String(statusParts[2]) : ""

    var responseHeaders: [String: String] = [:]
    for line in headerLines.dropFirst() {
      let headerParts = line.split(separator: ":", maxSplits: 1)
      if headerParts.count == 2 {
        let key = String(headerParts[0]).trimmingCharacters(in: .whitespaces)
        let value = String(headerParts[1]).trimmingCharacters(in: .whitespaces)
        responseHeaders[key] = value
      }
    }

    return (
      status: statusCode,
      headers: responseHeaders,
      body: Data(body),
      statusText: statusText
    )
  }

  private func cleanupConnection(_ connectionId: String) {
    connectionLock.lock()
    if let connection = activeConnections.removeValue(forKey: connectionId) {
      connection.stateUpdateHandler = nil
      connection.cancel()
    }
    connectionLock.unlock()
  }

  // MARK: - React Native Setup

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc
  func constantsToExport() -> [AnyHashable: Any]! {
    return [
      "ALPN_PROTOCOL": "zhtp-uhp/2",
      "DEFAULT_TIMEOUT": defaultTimeout,
      "MIN_IOS_VERSION": 15.0
    ]
  }
}
