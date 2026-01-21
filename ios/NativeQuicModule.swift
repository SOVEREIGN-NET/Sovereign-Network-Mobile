import Foundation
import Network
import Security
import React
import Dispatch
import CryptoKit

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
  private var activeChannelBindings: [String: Data] = [:]
  private let connectionLock = NSLock()
  private var quinnRequestQueue: [String: [QuinnQueuedRequest]] = [:]
  private var quinnHandshakeInProgress: Set<String> = []
  private final class AuthSessionBox {
    var session: AuthSession

    init(_ session: AuthSession) {
      self.session = session
    }
  }

  // Default configuration
  private let defaultTimeout: TimeInterval = 30.0
  private let quinnControlPlaneHost = "77.42.37.161"
  private let quinnControlPlanePort: UInt16 = 9334
  private let quinnControlPlaneServerName = "zhtp-mesh"
  private let quinnSpkiPinHex = "d21aa1f13cea799f96588a274c210c6de46786f098dc321477d8e04b7d87e058"

  // ALPN profiles
  enum QuicAlpnProfile {
    case publicContent   // zhtp-public/1
    case controlPlane    // zhtp-uhp/2
  }
  private typealias SafeComplete = (Bool, Any?, String?, Error?) -> Void
  private struct QuinnQueuedRequest {
    let parsedUrl: (host: String, port: Int, path: String)
    let method: String
    let headers: [String: String]
    let body: String?
    let resolve: RCTPromiseResolveBlock
    let reject: RCTPromiseRejectBlock
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

    print("[NativeQuic] 🔍 QUIC Connection Debug:")
    print("[NativeQuic]   Host: \(host)")
    print("[NativeQuic]   Port: \(port)")
    print("[NativeQuic]   Endpoint: \(endpoint)")

    // Monitor network path changes
    connection.pathUpdateHandler = { path in
      print("[NativeQuic] 📡 Path Update:")
      print("[NativeQuic]    Status: \(path.status)")
      print("[NativeQuic]    IsExpensive: \(path.isExpensive)")
      print("[NativeQuic]    IsConstrained: \(path.isConstrained)")
      print("[NativeQuic]    SupportsIPv4: \(path.supportsIPv4)")
      print("[NativeQuic]    SupportsIPv6: \(path.supportsIPv6)")
      print("[NativeQuic]    AvailableInterfaces: \(path.availableInterfaces)")
    }

    connection.stateUpdateHandler = { state in
      print("[NativeQuic] ➡️  State: \(state)")

      switch state {
      case .setup:
        print("[NativeQuic]    └─ Preparing connection setup...")

      case .preparing:
        print("[NativeQuic]    └─ Starting TLS 1.3 + QUIC handshake...")
        print("[NativeQuic]       This is where QUIC Initial packets should be sent")

      case .ready:
        let latency = Date().timeIntervalSince(startTime) * 1000
        print("[NativeQuic]    └─ ✅ Connection READY after \(latency)ms")
        safeComplete(success: true, result: [
          "success": true,
          "latencyMs": latency,
          "protocol": "QUIC",
          "host": host,
          "port": port
        ])

      case .waiting(let error):
        print("[NativeQuic]    └─ ⏳ Waiting: \(error.localizedDescription)")
        print("[NativeQuic]       (Connection temporarily blocked, will retry)")

      case .failed(let error):
        print("[NativeQuic]    └─ ❌ FAILED: \(error.localizedDescription)")
        safeComplete(success: false, result: nil, error: "QUIC handshake failed: \(error.localizedDescription)", nativeError: error)

      case .cancelled:
        print("[NativeQuic]    └─ Connection was cancelled")

      @unknown default:
        print("[NativeQuic]    └─ Unknown state: \(state)")
      }
    }

    print("[NativeQuic] 🚀 Starting connection on queue: \(self.queue)")
    connection.start(queue: self.queue)
    print("[NativeQuic] ⏱️  Timeout set to \(defaultTimeout)s - waiting for handshake...")

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

    if profile == .controlPlane {
      print("[NativeQuic] ✅ Quinn control-plane path selected (bypassing Network.framework)")
      handleQuinnControlPlaneRequest(
        parsedUrl: parsedUrl,
        method: method,
        headers: headers,
        body: body,
        resolve: resolve,
        reject: reject
      )
      return
    }

    // Determine server name for TLS
    // TLS SNI requires a hostname, not an IP address
    var serverNameForTls: String? = headers["Host"]

    // If no explicit Host header, check if parsedUrl.host is a hostname or IP
    if serverNameForTls == nil {
      let hostValue = parsedUrl.host
      // Check if it looks like an IP address (simplified check)
      let isIPAddress = hostValue.contains(".") && hostValue.allSatisfy { $0.isNumber || $0 == "." }
      if !isIPAddress {
        serverNameForTls = hostValue
      }
      // If it IS an IP address, leave serverNameForTls as nil (no SNI for IPs)
    }

    print("[NativeQuic] TLS Server Name for SNI: \(serverNameForTls ?? "(no SNI - IP-based connection)")")

    let parameters = createQuicParameters(
      insecure: insecure,
      serverName: serverNameForTls,
      profile: profile
    )

    let endpoint = NWEndpoint.hostPort(
      host: NWEndpoint.Host(parsedUrl.host),
      port: NWEndpoint.Port(integerLiteral: UInt16(parsedUrl.port))
    )

    print("[NativeQuic] 🔗 Creating NWConnectionGroup for RFC 9000 bidirectional streams...")

    // Create multiplexed group - this creates the QUIC connection
    let descriptor = NWMultiplexGroup(to: endpoint)
    let group = NWConnectionGroup(with: descriptor, using: parameters)
    let connectionId = UUID().uuidString

    var hasResolved = false
    let resolveLock = NSLock()
    var groupReady = false

    let doSafeComplete: SafeComplete = { success, result, error, nativeError in
      resolveLock.lock()
      defer { resolveLock.unlock() }
      guard !hasResolved else { return }
      hasResolved = true

      self.cleanupConnection(connectionId)

      if success, let res = result {
        resolve(res)
      } else {
        reject("QUIC_ERROR", error ?? "Unknown error", nativeError)
      }
    }

    // Handle group state - wait for ready, then create explicit stream
    group.stateUpdateHandler = { [weak self] state in
      print("[NativeQuic] 🔗 Group State: \(state)")
      switch state {
      case .ready:
        resolveLock.lock()
        if groupReady {
          resolveLock.unlock()
          return
        }
        groupReady = true
        resolveLock.unlock()

        print("[NativeQuic] 📱 Group ready, creating explicit bidirectional stream...")

        // Create explicit stream from group - this matches Quinn's accept_bi() expectation
        guard let streamConnection = NWConnection(from: group) else {
          doSafeComplete(false, nil, "Failed to create stream from group", nil)
          return
        }

        if let binding = self?.exportQuicChannelBinding(from: group) {
          self?.connectionLock.lock()
          self?.activeChannelBindings[connectionId] = binding
          self?.connectionLock.unlock()
          let digest = SHA256.hash(data: binding)
          let hashPrefix = digest.prefix(8).map { String(format: "%02x", $0) }.joined()
          let hexPrefix = binding.prefix(8).map { String(format: "%02x", $0) }.joined()
          print("[NativeQuic] 🔐 Stored QUIC channel binding: sha256[0..8]=\(hashPrefix), hex[0..8]=\(hexPrefix)")
        } else {
          doSafeComplete(false, nil, "Failed to export QUIC channel binding", nil)
          return
        }

        // Store stream connection
        self?.connectionLock.lock()
        self?.activeConnections[connectionId] = streamConnection
        self?.connectionLock.unlock()

        print("[NativeQuic] 📡 Stream created, waiting for stream ready state...")

        // Handle stream state
        streamConnection.stateUpdateHandler = { [weak self] streamState in
          print("[NativeQuic] 📡 Stream State: \(streamState)")
          self?.handleRequestState(
            streamState,
            connection: streamConnection,
            connectionId: connectionId,
            profile: profile,
            parsedUrl: parsedUrl,
            method: method,
            headers: headers,
            body: body,
            doSafeComplete: doSafeComplete
          )
        }

        // Start the stream
        let streamQueue = self?.queue ?? DispatchQueue.global(qos: .userInitiated)
        streamConnection.start(queue: streamQueue)

      case .failed(let error):
        resolveLock.lock()
        defer { resolveLock.unlock() }
        guard !hasResolved else { return }
        hasResolved = true
        doSafeComplete(false, nil, "Group failed: \(error.localizedDescription)", error)

      case .cancelled:
        resolveLock.lock()
        defer { resolveLock.unlock() }
        guard !hasResolved else { return }
        hasResolved = true
        doSafeComplete(false, nil, "Group cancelled", nil)

      @unknown default:
        break
      }
    }

    // Set receive handler (required for group to start)
    group.setReceiveHandler(handler: { message, content, isComplete in
      print("[NativeQuic] 📥 Group received: \(content?.count ?? 0) bytes, complete=\(isComplete)")
    })

    print("[NativeQuic] 🚀 Starting group on queue...")
    group.start(queue: queue)

    // Timeout handler
    queue.asyncAfter(deadline: .now() + timeout) {
      doSafeComplete(false, nil, "Request timed out after \(timeout) seconds", nil)
    }
  }

  private func handleQuinnControlPlaneRequest(
    parsedUrl: (host: String, port: Int, path: String),
    method: String,
    headers: [String: String],
    body: String?,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    uhp_quinn_init()
    if let versionPtr = uhp_quinn_version() {
      let version = String(cString: versionPtr)
      print("[NativeQuic] ✅ Quinn FFI version: \(version)")
    }

    guard let identityId = extractIdentityId(path: parsedUrl.path, body: body, headers: headers) else {
      reject("QUIC_ERROR", "Missing identity_id for authenticated request", nil)
      return
    }

    guard let spkiPin = dataFromHex(quinnSpkiPinHex), spkiPin.count == 32 else {
      reject("QUIC_ERROR", "Invalid SPKI pin configuration", nil)
      return
    }

    enqueueQuinnRequest(
      identityId: identityId,
      parsedUrl: parsedUrl,
      method: method,
      headers: headers,
      body: body,
      spkiPin: spkiPin,
      resolve: resolve,
      reject: reject
    )
  }

  private func enqueueQuinnRequest(
    identityId: String,
    parsedUrl: (host: String, port: Int, path: String),
    method: String,
    headers: [String: String],
    body: String?,
    spkiPin: Data,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let request = QuinnQueuedRequest(
      parsedUrl: parsedUrl,
      method: method,
      headers: headers,
      body: body,
      resolve: resolve,
      reject: reject
    )

    var shouldStart = false
    connectionLock.lock()
    quinnRequestQueue[identityId, default: []].append(request)
    if !quinnHandshakeInProgress.contains(identityId) {
      quinnHandshakeInProgress.insert(identityId)
      shouldStart = true
    }
    connectionLock.unlock()

    guard shouldStart else { return }

    DispatchQueue.global(qos: .userInitiated).async {
      let handshakeResult = performUhpHandshakeQuinnFfiWithHandle(
        host: self.quinnControlPlaneHost,
        port: self.quinnControlPlanePort,
        serverName: self.quinnControlPlaneServerName,
        spkiPin: spkiPin,
        identityId: identityId,
        identity: nil,
        chainId: 0
      )

      switch handshakeResult {
      case .failure(let error):
        self.failQuinnQueue(identityId: identityId, error: error)
      case .success(let result):
        do {
          let macKey = try deriveMacKey(sessionKey: result.session.sessionKey, handshakeHash: result.session.handshakeHash)
          let session = AuthSession(
            sessionId: result.session.sessionId,
            macKey: macKey,
            sequence: 0,
            clientDid: result.session.clientDid,
            serverDid: result.session.peerDid,
            createdAt: Date(),
            lastActivity: Date()
          )
          let sessionBox = AuthSessionBox(session)
          self.drainQuinnQueue(identityId: identityId, quinnHandle: result.handle, sessionBox: sessionBox)
        } catch {
          uhp_quic_close(result.handle)
          self.failQuinnQueue(identityId: identityId, error: error)
        }
      }
    }
  }

  private func drainQuinnQueue(identityId: String, quinnHandle: UInt64, sessionBox: AuthSessionBox) {
    let nextRequest: QuinnQueuedRequest? = {
      connectionLock.lock()
      defer { connectionLock.unlock() }
      guard var queue = quinnRequestQueue[identityId], !queue.isEmpty else {
        quinnRequestQueue.removeValue(forKey: identityId)
        quinnHandshakeInProgress.remove(identityId)
        return nil
      }
      let request = queue.removeFirst()
      if queue.isEmpty {
        quinnRequestQueue.removeValue(forKey: identityId)
      } else {
        quinnRequestQueue[identityId] = queue
      }
      return request
    }()

    guard let request = nextRequest else {
      uhp_quic_close(quinnHandle)
      return
    }

    let requestBody = request.body?.data(using: .utf8) ?? Data()
    let zhtpMethod = httpMethodToZhtpMethod(request.method)
    var currentSession = sessionBox.session

    let requestResult = sendAuthenticatedZhtpRequestViaQuinn(
      quinnHandle: quinnHandle,
      session: &currentSession,
      method: zhtpMethod,
      path: request.parsedUrl.path,
      headers: request.headers,
      body: requestBody,
      requester: currentSession.clientDid
    )

    switch requestResult {
    case .success(let (status, responseBody)):
      let bodyString = String(data: responseBody, encoding: .utf8) ?? ""
      let response: [String: Any] = [
        "status": Int(status),
        "statusText": status >= 200 && status < 300 ? "OK" : "Error",
        "headers": [:],
        "body": bodyString,
        "ok": status >= 200 && status < 300
      ]
      request.resolve(response)
    case .failure(let error):
      request.reject("QUIC_ERROR", error.localizedDescription, error)
    }

    sessionBox.session = currentSession
    self.drainQuinnQueue(identityId: identityId, quinnHandle: quinnHandle, sessionBox: sessionBox)
  }

  private func failQuinnQueue(identityId: String, error: Error) {
    let queued: [QuinnQueuedRequest] = {
      connectionLock.lock()
      defer { connectionLock.unlock() }
      let queue = quinnRequestQueue.removeValue(forKey: identityId) ?? []
      quinnHandshakeInProgress.remove(identityId)
      return queue
    }()

    for request in queued {
      request.reject("QUIC_ERROR", "UHP handshake failed: \(error.localizedDescription)", error)
    }
  }

  private func dataFromHex(_ hex: String) -> Data? {
    var data = Data()
    var buffer = ""
    buffer.reserveCapacity(2)

    for char in hex {
      buffer.append(char)
      if buffer.count == 2 {
        guard let byte = UInt8(buffer, radix: 16) else {
          return nil
        }
        data.append(byte)
        buffer.removeAll(keepingCapacity: true)
      }
    }

    return buffer.isEmpty ? data : nil
  }

  private func handleRequestState(
    _ state: NWConnection.State,
    connection: NWConnection,
    connectionId: String,
    profile: QuicAlpnProfile,
    parsedUrl: (host: String, port: Int, path: String),
    method: String,
    headers: [String: String],
    body: String?,
    doSafeComplete: @escaping SafeComplete
  ) {
    // Placeholder - state handler
    switch state {
    case .setup:
      print("[NativeQuic] Request: Connection setup...")

    case .preparing:
      print("[NativeQuic] Request: Connection preparing (QUIC/TLS handshake)...")

    case .waiting(let error):
      print("[NativeQuic] Request: Connection waiting - \(error.localizedDescription)")
      // Check for specific QUIC errors
      print("[NativeQuic] Request: NWError details - \(error)")

    case .ready:
      if profile == .controlPlane {
        guard let identityId = extractIdentityId(path: parsedUrl.path, body: body, headers: headers) else {
          doSafeComplete(false, nil, "Missing identity_id for authenticated request", nil)
          return
        }

        // CRITICAL: Run handshake on background queue to avoid deadlock
        // Connection callbacks must fire on the queue the connection was started on
        // If we block that queue here, callbacks will never fire and semaphores will deadlock
        print("[NativeQuic] 🔄 Dispatching UHP handshake to background queue...")
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
          guard let self else { return }
          print("[NativeQuic] 🤝 Starting UHP handshake on background queue...")
          var channelBinding: Data?
          self.connectionLock.lock()
          channelBinding = self.activeChannelBindings[connectionId]
          self.connectionLock.unlock()
          switch performUhpHandshake(connection: connection, identityId: identityId, channelBindingOverride: channelBinding) {
          case .failure(let error):
            doSafeComplete(false, nil, "UHP handshake failed: \(error.localizedDescription)", error)
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
                doSafeComplete(true, response, nil, nil)
              case .failure(let error):
                doSafeComplete(false, nil, error.localizedDescription, error)
              }
            }
          } catch {
            doSafeComplete(false, nil, "MAC key derivation failed: \(error.localizedDescription)", error)
          }
          }
        }
      } else {
        // Public mode: use native ZHTP format
        let requestBody = body?.data(using: .utf8)
        sendZhtpRequest(
          connection: connection,
          method: method,
          path: parsedUrl.path,
          headers: headers,
          body: requestBody
        ) { result in
          switch result {
          case .success(let (status, body)):
            let bodyString = String(data: body, encoding: .utf8) ?? ""
            let response: [String: Any] = [
              "status": Int(status),
              "statusText": status >= 200 && status < 300 ? "OK" : "Error",
              "headers": [:],
              "body": bodyString,
              "ok": status >= 200 && status < 300
            ]
            doSafeComplete(true, response, nil, nil)
          case .failure(let error):
            doSafeComplete(false, nil, error.localizedDescription, error)
          }
        }
      }

    case .failed(let error):
      doSafeComplete(false, nil, "Connection failed: \(error.localizedDescription)", error)

    case .cancelled:
      doSafeComplete(false, nil, "Connection was cancelled", nil)

    @unknown default:
      break
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
    print("[NativeQuic] 🔧 QUIC Config:")
    print("[NativeQuic]    ALPN: \(alpnList.joined(separator: ", "))")

    let quicOptions = NWProtocolQUIC.Options(alpn: alpnList)

    // Bidirectional stream configuration for explicit stream creation
    // This ensures streams created from groups are properly opened
    quicOptions.direction = .bidirectional
    print("[NativeQuic]    Direction: Bidirectional")

    // Allow multiple concurrent streams
    quicOptions.initialMaxStreamsBidirectional = 10
    print("[NativeQuic]    Initial Max Bi Streams: 10")

    // Flow control for large payloads (UHP identity JSON is ~24KB)
    // Set to 2MB per stream to safely handle large handshake payloads
    quicOptions.initialMaxStreamDataBidirectionalLocal = 2_000_000
    quicOptions.initialMaxStreamDataBidirectionalRemote = 2_000_000
    print("[NativeQuic]    Stream Flow Control: 2MB local / 2MB remote")

    // Connection-level flow control (10MB total)
    quicOptions.initialMaxData = 10_000_000
    print("[NativeQuic]    Connection Flow Control: 10MB")

    // QUIC idle timeout in milliseconds (60 seconds)
    quicOptions.idleTimeout = 60_000
    print("[NativeQuic]    Idle Timeout: 60000ms (60 seconds)")

    // Try to enable multipath quic if available (iOS 16+)
    if #available(iOS 16.0, *) {
      quicOptions.maxDatagramFrameSize = 1200
      print("[NativeQuic]    Max Datagram Size: 1200 bytes")
    }

    // Create parameters with QUIC
    let parameters = NWParameters(quic: quicOptions)

    // Set TLS server name if provided (hostname only, not IP)
    if let serverName = serverName, !serverName.isEmpty {
      print("[NativeQuic]    TLS SNI: \(serverName)")
      sec_protocol_options_set_tls_server_name(
        quicOptions.securityProtocolOptions,
        serverName
      )
    } else {
      print("[NativeQuic]    TLS SNI: disabled (IP-based connection)")
    }

    // Configure TLS for self-signed certificates
    print("[NativeQuic]    TLS Mode: Self-signed certificates enabled")

    // Set verify block to accept all certs (security is via ZHTP layer, not TLS)
    sec_protocol_options_set_verify_block(
      quicOptions.securityProtocolOptions,
      { (metadata, trust, completion) in
        print("[NativeQuic]    📋 TLS Verify Block called")
        print("[NativeQuic]       → Accepting certificate (ZHTP layer handles auth)")
        completion(true)
      },
      self.queue
    )

    // Require TLS 1.3 (mandatory for QUIC)
    sec_protocol_options_set_min_tls_protocol_version(
      quicOptions.securityProtocolOptions,
      .TLSv13
    )
    print("[NativeQuic]    TLS Version: 1.3+ required")

    // Set challenge block for client auth (if needed)
    sec_protocol_options_set_challenge_block(
      quicOptions.securityProtocolOptions,
      { (metadata, completion) in
        print("[NativeQuic]    📋 TLS Challenge Block called")
        print("[NativeQuic]       → No client authentication required")
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
    print("[NativeQuic] 🔍 Extracting identity_id from authenticated request:")
    print("[NativeQuic]    Path: \(path)")
    print("[NativeQuic]    Body: \(body?.prefix(100) ?? "nil")")
    print("[NativeQuic]    Headers: \(headers.keys.joined(separator: ", "))")

    // Try X-Zhtp-Identity header first
    if let headerValue = headers["X-Zhtp-Identity"] ?? headers["x-zhtp-identity"] {
      let normalized = normalizeIdentityId(headerValue)
      print("[NativeQuic]    ✓ Found in X-Zhtp-Identity header: \(headerValue)")
      print("[NativeQuic]    ✓ Normalized: \(normalized)")
      return normalized.isEmpty ? nil : normalized
    }

    // Try request body
    if let body = body,
       let bodyData = body.data(using: .utf8),
       let json = try? JSONSerialization.jsonObject(with: bodyData) as? [String: Any],
       let identityId = json["identity_id"] as? String {
      let normalized = normalizeIdentityId(identityId)
      print("[NativeQuic]    ✓ Found in request body identity_id: \(identityId)")
      print("[NativeQuic]    ✓ Normalized: \(normalized)")
      return normalized.isEmpty ? nil : normalized
    }

    // Try URL path patterns
    let components = path.split(separator: "/").map(String.init)
    print("[NativeQuic]    Path components: \(components)")

    if components.count >= 5,
       components[0] == "api",
       components[1] == "v1",
       components[2] == "wallet",
       components[3] == "list" {
      let normalized = normalizeIdentityId(components[4])
      print("[NativeQuic]    ✓ Found in path /api/v1/wallet/list/{id}: \(components[4])")
      print("[NativeQuic]    ✓ Normalized: \(normalized)")
      return normalized.isEmpty ? nil : normalized
    }

    if components.count >= 6,
       components[0] == "api",
       components[1] == "v1",
       components[2] == "wallet",
       components[3] == "balance" {
      let normalized = normalizeIdentityId(components[5])
      print("[NativeQuic]    ✓ Found in path /api/v1/wallet/balance/{id}: \(components[5])")
      print("[NativeQuic]    ✓ Normalized: \(normalized)")
      return normalized.isEmpty ? nil : normalized
    }

    print("[NativeQuic]    ❌ No identity_id found in request")
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
    // First, try to parse as CBOR ZHTP response
    do {
      print("[NativeQuic] Attempting to parse response as CBOR ZHTP...")
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

      print("[NativeQuic] ✅ Parsed as CBOR ZHTP response: status=\(zhtpResponse.status)")
      completion(.success(response))
    } catch {
      // Fall back to parsing as plain HTTP response
      print("[NativeQuic] ⚠️ CBOR parsing failed, attempting HTTP fallback...")
      if let httpText = String(data: data, encoding: .utf8), httpText.contains("HTTP/1.1") {
        print("[NativeQuic] Parsed as HTTP response")
        // Parse HTTP response
        let lines = httpText.components(separatedBy: "\r\n")
        if let statusLine = lines.first {
          let statusParts = statusLine.split(separator: " ", maxSplits: 2)
          if statusParts.count >= 2, let statusCode = Int(statusParts[1]) {
            var responseHeaders: [String: String] = [:]
            var bodyStartIndex = 0
            for (index, line) in lines.enumerated() {
              if line.isEmpty {
                bodyStartIndex = index + 1
                break
              }
              let headerParts = line.split(separator: ":", maxSplits: 1)
              if headerParts.count == 2 {
                let key = String(headerParts[0]).trimmingCharacters(in: .whitespaces)
                let value = String(headerParts[1]).trimmingCharacters(in: .whitespaces)
                responseHeaders[key] = value
              }
            }
            let body = lines[bodyStartIndex...].joined(separator: "\r\n")
            let response: [String: Any] = [
              "status": statusCode,
              "statusText": String(statusParts[statusParts.count - 1]),
              "headers": responseHeaders,
              "body": body,
              "ok": statusCode >= 200 && statusCode < 300
            ]
            completion(.success(response))
            return
          }
        }
      }

      print("[NativeQuic] ❌ Failed to decode response: \(error)")
      completion(.failure(NSError(domain: "NativeQuic", code: -2, userInfo: [NSLocalizedDescriptionKey: "Failed to decode response: \(error.localizedDescription)"])))
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

      func finish(_ result: Result<(status: Int, headers: [String: String], body: Data, statusText: String), Error>) {
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

      connection.stateUpdateHandler = { state in
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
      connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { content, context, isComplete, error in
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
    activeChannelBindings.removeValue(forKey: connectionId)
    connectionLock.unlock()
  }

  @available(iOS 15.0, *)
  private func exportQuicChannelBinding(from group: NWConnectionGroup) -> Data? {
    guard let quicMetadata = group.metadata(definition: NWProtocolQUIC.definition) as? NWProtocolQUIC.Metadata else {
      print("[NativeQuic] ⚠️ QUIC metadata unavailable for channel binding")
      return nil
    }

    let secMetadata = quicMetadata.securityProtocolMetadata
    let label = "zhtp-uhp-channel-binding"
    guard let secret = sec_protocol_metadata_create_secret(
      secMetadata,
      label.utf8.count,
      label,
      32
    ) else {
      print("[NativeQuic] ⚠️ Failed to export QUIC channel binding")
      return nil
    }

    let secretData = secret as DispatchData
    var data = Data()
    secretData.enumerateBytes { buffer, _, _ in
      data.append(buffer)
    }

    guard data.count == 32 else {
      print("[NativeQuic] ⚠️ Invalid channel binding length: \(data.count) bytes")
      return nil
    }

    let digest = SHA256.hash(data: data)
    let hashPrefix = digest.prefix(8).map { String(format: "%02x", $0) }.joined()
    print("[NativeQuic] 🔐 Channel binding via group QUIC metadata: sha256[0..8]=\(hashPrefix)")
    return data
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
