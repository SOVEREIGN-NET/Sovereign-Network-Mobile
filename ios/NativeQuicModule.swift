import Foundation
import React
import Dispatch
import Network

/**
 * Native QUIC Module for iOS
 * Implements pure QUIC transport using Rust Quinn FFI (no Network.framework)
 * Provides HTTP-like request/response semantics over QUIC streams
 *
 * ALPN ROUTING (DO NOT DRIFT):
 * - PUBLIC (read-only, no auth) → zhtp-public/1 (no UHP handshake)
 *   Examples:
 *     GET /api/v1/web4/domains/status/{domain}
 *     GET /api/v1/blockchain/balance/{address}
 *     GET /api/v1/protocol/info
 *     GET /health
 * - AUTHENTICATED (write / identity / proof) → zhtp-uhp/2 (UHP handshake required)
 *   Examples:
 *     POST /api/v1/identity/register
 *     POST /api/v1/web4/domains/register
 *     POST /api/v1/blockchain/transaction
 *     POST /api/v1/wallet/\\*
 *
 * Rule of thumb:
 * - Reading public data → zhtp-public/1
 * - Writing anything or proving identity → zhtp-uhp/2
 */
@objc(NativeQuic)
class NativeQuic: NSObject {

  // MARK: - Properties

  private let queue = DispatchQueue(label: "com.sovereignnetwork.quic", qos: .userInitiated)
  private let connectionLock = NSLock()
  private var quinnRequestQueue: [String: [QuinnQueuedRequest]] = [:]
  private var quinnHandshakeInProgress: Set<String> = []
  private var quinnSessionIdPrefixByIdentity: [String: String] = [:]
  private final class AuthSessionBox {
    var session: AuthSession

    init(_ session: AuthSession) {
      self.session = session
    }
  }
  private struct QuinnHandshakeSession {
    let sessionKey: Data
    let sessionId: Data
    let handshakeHash: Data
    let peerDid: String
    let clientDid: String
  }
  private struct QuinnHandshakeResult {
    let handle: UInt64
    let session: QuinnHandshakeSession
  }

  // When true, use new lib-client HandshakeState (3-leg, keys stay in Rust).
  // Requires quinn-ffi to expose ALPN-aware connect (uhp_quic_connect_for_handshake).
  // Set to true once quinn-ffi is updated.
  private let useLibClientHandshake = false

  // Default configuration
  // These values are loaded from GeneratedConfig.swift which is generated from .env file
  // GeneratedConfig.swift is the single source of truth - updated at build time
  private let defaultTimeout: TimeInterval = 30.0
  // Active validator target — initialized from the primary bootstrap
  // gateway. Identity is the on-chain DID (`activeExpectedDid`); TLS is
  // accept-any. The dial target is the gateway's IP (skips DNS so a
  // single DNS-record typo can't black-hole us); SNI is its hostname.
  // `setActiveValidator(host, port, expectedDid)` swaps all three once
  // the directory has been fetched.
  private static func defaultBootstrap() -> (host: String, port: UInt16, sni: String, did: String) {
    if let primary = GeneratedConfig.bootstrapGateways.first {
      let dialHost = primary.ip.isEmpty ? primary.host : primary.ip
      return (dialHost, GeneratedConfig.nodePort, primary.host, primary.did)
    }
    return (GeneratedConfig.nodeHost, GeneratedConfig.nodePort, GeneratedConfig.nodeHost, "")
  }
  private var quinnControlPlaneHost = NativeQuic.defaultBootstrap().host
  private var quinnControlPlanePort = NativeQuic.defaultBootstrap().port
  private var quinnControlPlaneServerName = NativeQuic.defaultBootstrap().sni
  // Expected on-chain DID for the active validator. After every UHP-v2
  // handshake we compare `result.session.peerDid` against this. Mismatch
  // is treated as MITM and the connection is rejected before any request
  // is routed over it. Empty string disables the check (debug only).
  private var activeExpectedDid: String = NativeQuic.defaultBootstrap().did
  private let alpnPublic = "zhtp-public/1"
  private let alpnAuthenticated = "zhtp-uhp/2"

  // ALPN profiles
  enum QuicAlpnProfile {
    case publicContent   // zhtp-public/1
    case controlPlane    // zhtp-uhp/2
  }
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
   * Test connection to a QUIC server
   */
  @objc
  func testConnection(_ host: String, port: Int, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    guard #available(iOS 15.0, *) else {
      reject("QUIC_UNSUPPORTED", "QUIC requires iOS 15 or later", nil)
      return
    }

    let startTime = Date()

    uhp_quinn_init()

    let serverName = quinnControlPlaneServerName.isEmpty ? host : quinnControlPlaneServerName
    var handle: UInt64 = 0

    // Public ALPN: TLS is accept-any (cluster ships self-signed certs;
    // chain validation cannot work). Authenticity is provided at a
    // higher layer (UHP-v2 handshake + DID compare) for any path that
    // makes trust decisions on this response — see NetworkBootstrap.
    let rc: Int32 = host.withCString { hostPtr in
      serverName.withCString { serverNamePtr in
        uhp_quic_connect_public(hostPtr, UInt16(port), serverNamePtr, nil, &handle)
      }
    }

    if rc != 0 {
      let message = uhp_quinn_last_error_message().flatMap { String(cString: $0) } ?? "unknown error"
      reject("QUIC_ERROR", "Public QUIC connect failed: \(message)", nil)
      return
    }

    uhp_quic_close(handle)

    let latency = Date().timeIntervalSince(startTime) * 1000
    resolve([
      "success": true,
      "latencyMs": latency,
      "protocol": "QUIC",
      "host": host,
      "port": port
    ])
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
      print("[NativeQuic] ✅ Quinn control-plane path selected")
      handleQuinnControlPlaneRequest(
        parsedUrl: parsedUrl,
        method: method,
        headers: headers,
        body: body,
        resolve: resolve,
        reject: reject
      )
    } else {
      print("[NativeQuic] ✅ Quinn public path selected")
      handleQuinnPublicRequest(
        parsedUrl: parsedUrl,
        method: method,
        headers: headers,
        body: body,
        resolve: resolve,
        reject: reject
      )
    }
  }

  @objc
  func getCurrentSessionIdPrefix(_ identityId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    // `reject` is part of the React Native bridge contract (see .m extern);
    // we never fail this lookup — missing session just resolves `null` —
    // but the parameter must stay for the signature to match.
    _ = reject
    let normalized = normalizeIdentityId(identityId)
    connectionLock.lock()
    let value = quinnSessionIdPrefixByIdentity[normalized] ?? quinnSessionIdPrefixByIdentity[identityId]
    connectionLock.unlock()
    resolve(value)
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

    // No SPKI pin: TLS is accept-any (see quinn-ffi AcceptAnyVerifier).
    // Authenticity is checked after the UHP-v2 handshake by comparing
    // `result.session.peerDid` against `activeExpectedDid`.
    enqueueQuinnRequest(
      identityId: identityId,
      parsedUrl: parsedUrl,
      method: method,
      headers: headers,
      body: body,
      spkiPin: Data(),
      resolve: resolve,
      reject: reject
    )
  }

  private func handleQuinnPublicRequest(
    parsedUrl: (host: String, port: Int, path: String),
    method: String,
    headers: [String: String],
    body: String?,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    do {
      let requestBody = body?.data(using: .utf8)
      let response = try quinnPublicRequest(
        parsedUrl: parsedUrl,
        method: method,
        headers: headers,
        body: requestBody
      )

      let bodyString = String(data: response.body, encoding: .utf8) ?? ""
      resolve([
        "status": response.status,
        "statusText": response.statusText,
        "headers": response.headers,
        "body": bodyString,
        "ok": response.status >= 200 && response.status < 300
      ])
    } catch {
      reject("QUIC_ERROR", error.localizedDescription, error)
    }
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

    // Dilithium5 signing requires ~1MB+ stack space; GCD threads only get 512KB.
    // Use a dedicated Thread with 2MB stack to avoid EXC_BAD_ACCESS stack overflow.
    let handshakeThread = Thread {
      let handshakeResult: Result<QuinnHandshakeResult, Error>

      if self.useLibClientHandshake {
        handshakeResult = self.performHandshakeViaLibClient(
          host: self.quinnControlPlaneHost,
          port: Int(self.quinnControlPlanePort),
          serverName: self.quinnControlPlaneServerName,
          spkiPin: spkiPin,
          identityId: identityId
        )
      } else {
        handshakeResult = self.performLegacyHandshake(
          host: self.quinnControlPlaneHost,
          port: Int(self.quinnControlPlanePort),
          serverName: self.quinnControlPlaneServerName,
          spkiPin: spkiPin,
          identityId: identityId,
          chainId: 0
        )
      }

      switch handshakeResult {
      case .failure(let error):
        self.failQuinnQueue(identityId: identityId, error: error)
      case .success(let result):
        do {
          let macKey = try deriveMacKey(sessionKey: result.session.sessionKey, handshakeHash: result.session.handshakeHash)
          let sessionPrefix = result.session.sessionId.prefix(8).map { String(format: "%02x", $0) }.joined()
          self.connectionLock.lock()
          self.quinnSessionIdPrefixByIdentity[identityId] = sessionPrefix
          self.connectionLock.unlock()
          let session = AuthSession(
            sessionId: result.session.sessionId,
            macKey: macKey,
            sequence: 1,
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
    handshakeThread.stackSize = 2 * 1024 * 1024  // 2MB for Dilithium5
    handshakeThread.qualityOfService = .userInitiated
    handshakeThread.start()
  }

  private func drainQuinnQueue(identityId: String, quinnHandle: UInt64, sessionBox: AuthSessionBox) {
    while true {
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
        connectionLock.lock()
        let sessionPrefix = quinnSessionIdPrefixByIdentity[identityId] ?? ""
        connectionLock.unlock()
        let response: [String: Any] = [
          "status": Int(status),
          "statusText": status >= 200 && status < 300 ? "OK" : "Error",
          "headers": [:],
          "body": bodyString,
          "ok": status >= 200 && status < 300,
          "sessionIdPrefix": sessionPrefix
        ]
        request.resolve(response)
      case .failure(let error):
        request.reject("QUIC_ERROR", error.localizedDescription, error)
      }

      sessionBox.session = currentSession
    }
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

  // MARK: - New lib-client HandshakeState (3-leg UHP, keys stay in Rust)

  /// Perform UHP handshake using lib-client HandshakeState.
  /// Secret keys never leave Rust. Requires quinn-ffi ALPN-aware connect.
  ///
  /// Flow:
  ///   1. Resolve Identity handle from IdentityHandleStore
  ///   2. Open QUIC connection to control plane (needs zhtp-uhp/2 ALPN)
  ///   3. Create HandshakeState → ClientHello → send over QUIC
  ///   4. Receive ServerHello → process → ClientFinish → send over QUIC
  ///   5. Finalize → extract session (sessionKey, sessionId, peerDid)
  ///
  /// TODO: Blocked on quinn-ffi exposing uhp_quic_connect_for_handshake()
  ///       that connects with zhtp-uhp/2 ALPN without running the old handshake.
  ///       Until then, uhp_quic_connect_public uses zhtp-public/1 ALPN which
  ///       the server will reject for handshake messages.
  private func performHandshakeViaLibClient(
    host: String,
    port: Int,
    serverName: String,
    spkiPin: Data,
    identityId: String
  ) -> Result<QuinnHandshakeResult, Error> {
    guard spkiPin.count == 32 else {
      return .failure(NSError(domain: "NativeQuic", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid SPKI pin length"]))
    }

    // 1. Resolve Identity handle
    let didCandidates = identityId.hasPrefix("did:zhtp:")
      ? [identityId]
      : [identityId, "did:zhtp:\(identityId)"]
    var identityHandle: Identity? = nil
    for candidate in didCandidates {
      if let found = IdentityHandleStore.shared.retrieve(by: candidate) as? Identity {
        identityHandle = found
        break
      }
    }
    guard let identityHandle else {
      return .failure(NSError(domain: "NativeQuic", code: -1, userInfo: [NSLocalizedDescriptionKey: "Identity not found in handle store for handshake"]))
    }

    // 2. Open QUIC connection to control plane
    // TODO: Replace uhp_quic_connect_public with uhp_quic_connect_for_handshake
    //       once quinn-ffi exposes ALPN-aware connect (zhtp-uhp/2)
    var quinnHandle: UInt64 = 0
    let connectRc = host.withCString { hostPtr in
      serverName.withCString { serverNamePtr in
        spkiPin.withUnsafeBytes { spkiBuf -> Int32 in
          guard let spkiPtr = spkiBuf.baseAddress?.assumingMemoryBound(to: UInt8.self) else {
            return -1
          }
          return uhp_quic_connect_public(hostPtr, UInt16(port), serverNamePtr, spkiPtr, &quinnHandle)
        }
      }
    }
    if connectRc != 0 {
      let message = uhp_quinn_last_error_message().flatMap { String(cString: $0) } ?? "unknown error"
      return .failure(NSError(domain: "NativeQuic", code: -1, userInfo: [NSLocalizedDescriptionKey: "QUIC connect failed: \(message)"]))
    }

    do {
      // 3. Compute channel binding: Blake3(sorted(local_addr || peer_addr))
      let peerAddr = "\(host):\(port)"
      let localAddr = "0.0.0.0:0"  // Local address unknown at this point
      let sorted = [localAddr, peerAddr].sorted()
      let bindingInput = (sorted[0] + sorted[1]).data(using: .utf8)!
      let channelBinding = try computeBlake3(bindingInput)

      // 4. Create HandshakeState (keys stay in Rust)
      let handshake = try HandshakeState(identity: identityHandle, channelBinding: channelBinding)

      // 5. Leg 1: ClientHello → send to server, receive ServerHello
      let clientHello = try handshake.createClientHello()
      let serverHello = try quinnRequest(handle: quinnHandle, requestData: clientHello)

      // 6. Leg 2: Process ServerHello → get ClientFinish → send to server
      let clientFinish = try handshake.processServerHello(serverHello)
      _ = try quinnRequest(handle: quinnHandle, requestData: clientFinish)

      // 7. Finalize → derive session
      let result = try handshake.finalize()

      let sessionKey = result.sessionKey
      let sessionId = result.sessionId
      let peerDid = result.peerDid

      // UHP-v2 identity check (same policy as the legacy path — fail
      // closed in release on empty expectedDid; bypass only under DEBUG).
      let expectedDid = self.activeExpectedDid
      if expectedDid.isEmpty {
        #if DEBUG
        print("[NativeQuic] ⚠️ DID check skipped (lib-client) — empty expectedDid (DEBUG build only)")
        #else
        uhp_quic_close(quinnHandle)
        return .failure(NSError(
          domain: "NativeQuic",
          code: -1,
          userInfo: [NSLocalizedDescriptionKey: "No expected DID configured — refusing handshake (set BOOTSTRAP_GATEWAY_DID in .env)"]
        ))
        #endif
      } else if peerDid != expectedDid {
        uhp_quic_close(quinnHandle)
        let masked = peerDid.count > 24 ? String(peerDid.prefix(24)) + "…" : peerDid
        let expectedMasked = expectedDid.count > 24 ? String(expectedDid.prefix(24)) + "…" : expectedDid
        print("[NativeQuic] ❌ DID mismatch (lib-client): expected=\(expectedMasked) got=\(masked) host=\(host):\(port)")
        return .failure(NSError(
          domain: "NativeQuic",
          code: -1,
          userInfo: [NSLocalizedDescriptionKey: "Peer DID mismatch — expected \(expectedDid), got \(peerDid)"]
        ))
      }

      guard sessionKey.count == 32 else {
        uhp_quic_close(quinnHandle)
        return .failure(NSError(domain: "NativeQuic", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid session key length from lib-client handshake"]))
      }
      guard sessionId.count == 32 else {
        uhp_quic_close(quinnHandle)
        return .failure(NSError(domain: "NativeQuic", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid session ID length from lib-client handshake"]))
      }

      // handshakeHash: Blake3(sessionKey || sessionId) — deterministic
      // substitute used as the HKDF salt for MAC-key derivation. lib-client
      // doesn't expose the real handshake_hash through its FFI, so both
      // ends agree on this Blake3 construction instead. See the matching
      // derivation inside lib-client's `make_handshake_ctx`.
      let handshakeHash = try computeBlake3(sessionKey + sessionId)

      let sessionInfo = QuinnHandshakeSession(
        sessionKey: sessionKey,
        sessionId: sessionId,
        handshakeHash: handshakeHash,
        peerDid: peerDid,
        clientDid: identityHandle.did
      )

      return .success(QuinnHandshakeResult(handle: quinnHandle, session: sessionInfo))
    } catch {
      uhp_quic_close(quinnHandle)
      return .failure(error)
    }
  }

  /// Compute Blake3 hash (32 bytes) using uhp-ffi
  private func computeBlake3(_ input: Data) throws -> Data {
    var output = Data(count: 32)
    let rc = input.withUnsafeBytes { inBuf -> Int32 in
      output.withUnsafeMutableBytes { outBuf -> Int32 in
        guard let inPtr = inBuf.baseAddress?.assumingMemoryBound(to: UInt8.self),
              let outPtr = outBuf.baseAddress?.assumingMemoryBound(to: UInt8.self) else {
          return -1
        }
        return uhp_blake3(inPtr, input.count, outPtr, 32)
      }
    }
    guard rc == 0 else {
      throw NSError(domain: "NativeQuic", code: -1, userInfo: [NSLocalizedDescriptionKey: "Blake3 hash computation failed"])
    }
    return output
  }

  // MARK: - Legacy handshake (deprecated — uses raw secret key extraction)

  /// Legacy UHP handshake that extracts raw secret keys across FFI.
  /// Deprecated: Migrate to performHandshakeViaLibClient once quinn-ffi
  /// exposes ALPN-aware QUIC connect.
  private func performLegacyHandshake(
    host: String,
    port: Int,
    serverName: String,
    spkiPin: Data,
    identityId: String,
    chainId: UInt8
  ) -> Result<QuinnHandshakeResult, Error> {
    // spkiPin may be empty (system CA trust) or 32 bytes (SPKI pinned)
    guard spkiPin.isEmpty || spkiPin.count == 32 else {
      return .failure(NSError(domain: "NativeQuic", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid SPKI pin length"]))
    }

    let materials: (identityJson: Data, identityDid: String, dilithiumSk: Data, kyberSk: Data, masterSeed: Data)
    if let stored = UhpKeystore.loadIdentityForHandshake(identityId: identityId) {
      materials = (
        identityJson: stored.identityJson,
        identityDid: stored.identityDid,
        dilithiumSk: stored.privateKey.dilithiumSk,
        kyberSk: stored.privateKey.kyberSk,
        masterSeed: stored.privateKey.masterSeed
      )
    } else {
      let didCandidates = identityId.hasPrefix("did:zhtp:")
        ? [identityId]
        : [identityId, "did:zhtp:\(identityId)"]
      var identityHandle: Identity? = nil
      for candidate in didCandidates {
        if let found = IdentityHandleStore.shared.retrieve(by: candidate) as? Identity {
          identityHandle = found
          break
        }
      }
      guard let identityHandle else {
        return .failure(NSError(domain: "NativeQuic", code: -1, userInfo: [NSLocalizedDescriptionKey: "Failed to load identity materials"]))
      }
      do {
        let identityJson = try ZhtpClient.serializeIdentityToHandshakeJson(identityHandle)
        let dilithiumSk = try ZhtpClient.getDilithiumSecretKey(identityHandle)
        let kyberSk = try ZhtpClient.getKyberSecretKey(identityHandle)
        let masterSeed = try ZhtpClient.getMasterSeed(identityHandle)
        materials = (
          identityJson: Data(identityJson.utf8),
          identityDid: identityHandle.did,
          dilithiumSk: Data(dilithiumSk),
          kyberSk: Data(kyberSk),
          masterSeed: Data(masterSeed)
        )
      } catch {
        return .failure(error)
      }
    }

    var session = UhpSession()
    var handle: UInt64 = 0

    func callHandshake(hostPtr: UnsafePointer<CChar>, serverNamePtr: UnsafePointer<CChar>, spkiPtr: UnsafePointer<UInt8>?) -> Int32 {
      return materials.identityJson.withUnsafeBytes { identityBuf -> Int32 in
        guard let identityPtr = identityBuf.baseAddress?.assumingMemoryBound(to: UInt8.self) else {
          return -1
        }
        return materials.dilithiumSk.withUnsafeBytes { dilBuf -> Int32 in
          guard let dilPtr = dilBuf.baseAddress?.assumingMemoryBound(to: UInt8.self) else {
            return -1
          }
          return materials.kyberSk.withUnsafeBytes { kybBuf -> Int32 in
            guard let kybPtr = kybBuf.baseAddress?.assumingMemoryBound(to: UInt8.self) else {
              return -1
            }
            return materials.masterSeed.withUnsafeBytes { seedBuf -> Int32 in
              guard let seedPtr = seedBuf.baseAddress?.assumingMemoryBound(to: UInt8.self) else {
                return -1
              }

              let keyBytes = UhpPrivateKeyBytes(
                dilithium_sk_ptr: dilPtr,
                dilithium_sk_len: materials.dilithiumSk.count,
                kyber_sk_ptr: kybPtr,
                kyber_sk_len: materials.kyberSk.count,
                master_seed_ptr: seedPtr,
                master_seed_len: materials.masterSeed.count
              )

              return uhp_quic_connect_and_handshake(
                hostPtr,
                UInt16(port),
                serverNamePtr,
                spkiPtr,
                identityPtr,
                materials.identityJson.count,
                keyBytes,
                chainId,
                &handle,
                &session
              )
            }
          }
        }
      }
    }

    let rc: Int32
    if spkiPin.isEmpty {
      rc = host.withCString { hostPtr in
        serverName.withCString { serverNamePtr in
          callHandshake(hostPtr: hostPtr, serverNamePtr: serverNamePtr, spkiPtr: nil)
        }
      }
    } else {
      rc = host.withCString { hostPtr in
        serverName.withCString { serverNamePtr in
          spkiPin.withUnsafeBytes { spkiBuf -> Int32 in
            guard let spkiPtr = spkiBuf.baseAddress?.assumingMemoryBound(to: UInt8.self) else {
              return -1
            }
            return callHandshake(hostPtr: hostPtr, serverNamePtr: serverNamePtr, spkiPtr: spkiPtr)
          }
        }
      }
    }

    if rc != 0 {
      let message = uhp_quinn_last_error_message().flatMap { String(cString: $0) } ?? "unknown error"
      return .failure(NSError(domain: "NativeQuic", code: -1, userInfo: [NSLocalizedDescriptionKey: message]))
    }

    guard let peerDidPtr = session.peer_did else {
      return .failure(NSError(domain: "NativeQuic", code: -1, userInfo: [NSLocalizedDescriptionKey: "Server DID missing"]))
    }

    let peerDid = String(cString: peerDidPtr)
    uhp_quinn_free_string(peerDidPtr)

    // UHP-v2 identity check. In release builds an empty expectedDid is a
    // hard failure (means bootstrap config is missing — refuse to route
    // any request over a connection of unknown identity). Debug builds
    // allow the bypass so dev nodes without a published on-chain DID
    // can still be reached during local iteration.
    let expectedDid = self.activeExpectedDid
    if expectedDid.isEmpty {
      #if DEBUG
      print("[NativeQuic] ⚠️ DID check skipped — empty expectedDid (DEBUG build only)")
      #else
      uhp_quic_close(handle)
      return .failure(NSError(
        domain: "NativeQuic",
        code: -1,
        userInfo: [NSLocalizedDescriptionKey: "No expected DID configured — refusing handshake (set BOOTSTRAP_GATEWAY_DID in .env)"]
      ))
      #endif
    } else if peerDid != expectedDid {
      uhp_quic_close(handle)
      let masked = peerDid.count > 24 ? String(peerDid.prefix(24)) + "…" : peerDid
      let expectedMasked = expectedDid.count > 24 ? String(expectedDid.prefix(24)) + "…" : expectedDid
      print("[NativeQuic] ❌ DID mismatch: expected=\(expectedMasked) got=\(masked) host=\(host):\(port)")
      return .failure(NSError(
        domain: "NativeQuic",
        code: -1,
        userInfo: [NSLocalizedDescriptionKey: "Peer DID mismatch — expected \(expectedDid), got \(peerDid)"]
      ))
    }

    let sessionIdFull = withUnsafeBytes(of: session.session_id) { Data($0) }
    let sessionId = Data(sessionIdFull.prefix(32))
    guard sessionId.count == 32 else {
      return .failure(NSError(domain: "NativeQuic", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid session ID length"]))
    }

    let sessionKey = withUnsafeBytes(of: session.session_key) { Data($0) }
    guard sessionKey.count == 32 else {
      return .failure(NSError(domain: "NativeQuic", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid session key length"]))
    }

    let handshakeHash = withUnsafeBytes(of: session.handshake_hash) { Data($0) }
    guard handshakeHash.count == 32 else {
      return .failure(NSError(domain: "NativeQuic", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid handshake hash length"]))
    }

    guard session.pqc_hybrid_enabled == 1 else {
      return .failure(NSError(domain: "NativeQuic", code: -1, userInfo: [NSLocalizedDescriptionKey: "Server did not enable PQC hybrid key exchange"]))
    }

    let sessionInfo = QuinnHandshakeSession(
      sessionKey: sessionKey,
      sessionId: sessionId,
      handshakeHash: handshakeHash,
      peerDid: peerDid,
      clientDid: materials.identityDid
    )

    return .success(QuinnHandshakeResult(handle: handle, session: sessionInfo))
  }

  private func resolveServerName(host: String, headers: [String: String]) -> String {
    // SNI precedence (most explicit wins, no caching across hosts):
    //   1. Per-request `x-zhtp-sni` header — caller knows the cert hostname
    //      for this specific dial (e.g. dialing by IP, SNI = hostname).
    //   2. `quinnControlPlaneServerName` ONLY when the URL host matches the
    //      currently-active control-plane target. Otherwise the global SNI
    //      bleeds onto unrelated hosts — the exact race that produced
    //      `host=gw-1 sni=gw-2` after a bootstrap fallback to gateway 2.
    //   3. The URL host itself.
    // The HTTP `Host` header is intentionally NOT consulted — it's an
    // application-layer routing hint and letting it drive SNI broke Web4
    // (`Host: central.sov` while dialing the gateway's IP).
    if let explicit = headers["x-zhtp-sni"], !explicit.isEmpty {
      return explicit
    }
    if let explicit = headers["X-Zhtp-Sni"], !explicit.isEmpty {
      return explicit
    }
    if !quinnControlPlaneServerName.isEmpty
        && host == quinnControlPlaneHost {
      return quinnControlPlaneServerName
    }
    return host
  }

  private func quinnRequest(handle: UInt64, requestData: Data) throws -> Data {
    var responsePtr: UnsafeMutablePointer<UInt8>?
    var responseLen: Int = 0

    let rc = requestData.withUnsafeBytes { reqBuf -> Int32 in
      guard let reqPtr = reqBuf.baseAddress?.assumingMemoryBound(to: UInt8.self) else {
        return -1
      }
      return uhp_quic_request(handle, reqPtr, requestData.count, &responsePtr, &responseLen)
    }

    if rc != 0 {
      let message = uhp_quinn_last_error_message().flatMap { String(cString: $0) } ?? "unknown error"
      throw NSError(domain: "NativeQuic", code: -1, userInfo: [NSLocalizedDescriptionKey: message])
    }

    guard let ptr = responsePtr, responseLen > 0 else {
      return Data()
    }

    let data = Data(bytes: ptr, count: responseLen)
    uhp_quic_free_buffer(ptr, responseLen)
    return data
  }

  private func quinnPublicRequest(
    parsedUrl: (host: String, port: Int, path: String),
    method: String,
    headers: [String: String],
    body: Data?
  ) throws -> (status: Int, headers: [String: String], body: Data, statusText: String) {
    uhp_quinn_init()

    let serverName = resolveServerName(host: parsedUrl.host, headers: headers)
    var handle: UInt64 = 0

    // Public ALPN: TLS uses AcceptAnyVerifier (cluster certs are
    // self-signed — webpki-roots can never validate). Authenticity is
    // the caller's job: the bootstrap path matches `peer_did` against
    // `BOOTSTRAP_GATEWAY_DID` after the UHP-v2 handshake; downstream
    // connects match against the directory entry's `did`. Skip those
    // checks and the connection is unauthenticated.
    let connectRc: Int32 = parsedUrl.host.withCString { hostPtr in
      serverName.withCString { serverNamePtr in
        uhp_quic_connect_public(hostPtr, UInt16(parsedUrl.port), serverNamePtr, nil, &handle)
      }
    }

    if connectRc != 0 {
      let message = uhp_quinn_last_error_message().flatMap { String(cString: $0) } ?? "unknown error"
      throw NSError(domain: "NativeQuic", code: -1, userInfo: [NSLocalizedDescriptionKey: "Public QUIC connect failed: \(message)"])
    }

    defer { uhp_quic_close(handle) }

    let requestBody = body ?? Data()
    let timestamp = UInt64(Date().timeIntervalSince1970)

    // Build ZhtpRequest (public mode expects this, not SDK wire format)
    let contentType = headers["content-type"] ?? "application/json"
    let contentLength = UInt64(requestBody.count)
    let zhtpHeaders = ZhtpHeaders(
      content_type: contentType,
      content_length: contentLength,
      dao_fee: 0,
      total_fees: 0
    )
    let zhtpRequest = ZhtpRequest(
      method: ZhtpMethod.from(string: method),
      uri: parsedUrl.path,
      version: "1.0",
      headers: zhtpHeaders,
      body: requestBody,
      timestamp: timestamp,
      requester: nil,
      auth_proof: nil
    )

    // Encode ZhtpRequest directly, then wrap with ZHTP wire header
    let cborData = try encodeRequest(zhtpRequest)
    var wireData = Data()
    wireData.append(contentsOf: [0x5A, 0x48, 0x54, 0x50]) // "ZHTP"
    wireData.append(0x01) // version 1
    var length = UInt32(cborData.count).bigEndian
    withUnsafeBytes(of: &length) { buffer in
      wireData.append(contentsOf: buffer)
    }
    wireData.append(cborData)
    let requestData = wireData

    let responseData = try quinnRequest(handle: handle, requestData: requestData)
    let zhtpResponse = try zhtp_decode_response(responseData)
    let responseHeaders: [String: String] = [
      "content-type": zhtpResponse.response.headers.content_type
    ]

    return (
      status: Int(zhtpResponse.status),
      headers: responseHeaders,
      body: zhtpResponse.response.body,
      statusText: zhtpResponse.error_message ?? "OK"
    )
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
    quinnRequestQueue.removeAll()
    quinnHandshakeInProgress.removeAll()
    connectionLock.unlock()

    resolve(true)
  }

  /**
   * Resolve DNS A records for `name` against an explicit server over UDP.
   * Used for ZDNS discovery: `resolveDirectory("91.98.113.188", 53, "directory.sov")`
   * returns `["77.42.37.161", "77.42.74.80", "178.105.9.247"]`.
   *
   * No system resolver override, no third-party dep — builds the DNS query
   * packet inline and parses the A-record answer section.
   */
  @objc
  func resolveDirectory(
    _ zdnsHost: String,
    port: Int,
    name: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard !zdnsHost.isEmpty, port > 0, port < 65536, !name.isEmpty else {
      reject("INVALID_PARAMS", "zdnsHost, port, name required", nil)
      return
    }
    guard let query = DnsUdp.buildQuery(name: name) else {
      reject("DNS_ERROR", "Failed to build DNS query for \(name)", nil)
      return
    }

    let queue = DispatchQueue(label: "zhtp.dns.resolve", qos: .userInitiated)
    let endpoint = NWEndpoint.hostPort(
      host: NWEndpoint.Host(zdnsHost),
      port: NWEndpoint.Port(integerLiteral: UInt16(port))
    )
    let conn = NWConnection(to: endpoint, using: .udp)
    var settled = false
    let settleOnce: (Result<[String], Error>) -> Void = { outcome in
      queue.async {
        if settled { return }
        settled = true
        conn.cancel()
        switch outcome {
        case .success(let ips): resolve(ips)
        case .failure(let err): reject("DNS_ERROR", err.localizedDescription, err)
        }
      }
    }

    conn.stateUpdateHandler = { state in
      switch state {
      case .ready:
        conn.send(content: query, completion: .contentProcessed { err in
          if let err = err {
            settleOnce(.failure(err))
            return
          }
          conn.receiveMessage { data, _, _, recvErr in
            if let recvErr = recvErr {
              settleOnce(.failure(recvErr))
              return
            }
            guard let data = data else {
              settleOnce(.failure(NSError(
                domain: "DNS", code: -1,
                userInfo: [NSLocalizedDescriptionKey: "Empty DNS response"]
              )))
              return
            }
            let ips = DnsUdp.parseAnswers(data)
            settleOnce(.success(ips))
          }
        })
      case .failed(let err):
        settleOnce(.failure(err))
      case .cancelled:
        break
      default:
        break
      }
    }
    conn.start(queue: queue)

    // 3-second timeout
    queue.asyncAfter(deadline: .now() + 3.0) {
      if !settled {
        settleOnce(.failure(NSError(
          domain: "DNS", code: -1,
          userInfo: [NSLocalizedDescriptionKey: "DNS query timed out"]
        )))
      }
    }
  }

  /**
   * Swap the active validator (control-plane endpoint + expected DID) at runtime.
   * Called by the TS bootstrap after `GET /api/v1/network/directory` resolves
   * a better validator than the one we connected to. Drops all cached handshake
   * state so the next request rehandshakes against the new target.
   *
   * - Parameters:
   *   - host: new validator host or IP (used as the dial target — IP recommended)
   *   - port: new validator port
   *   - expectedDid: on-chain DID the UHP-v2 handshake must produce
   *   - sni:  TLS SNI hostname. Optional — defaults to `host` when empty.
   *           Useful when dialing by IP but SNI must carry the cert hostname.
   *
   * There is no SPKI pin: the TLS verifier accepts any cert; the DID check
   * after handshake is what authenticates the peer.
   */
  @objc
  func setActiveValidator(
    _ host: String,
    port: Int,
    expectedDid: String,
    sni: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard !host.isEmpty else {
      reject("INVALID_PARAMS", "host is required", nil)
      return
    }
    guard port > 0, port < 65536 else {
      reject("INVALID_PARAMS", "port must be 1..65535", nil)
      return
    }
    guard !expectedDid.isEmpty else {
      reject("INVALID_PARAMS", "expectedDid is required (no SPKI pinning — identity is the DID)", nil)
      return
    }

    let serverName = sni.isEmpty ? host : sni

    connectionLock.lock()
    let oldTarget = "\(quinnControlPlaneHost):\(quinnControlPlanePort)"
    quinnControlPlaneHost = host
    quinnControlPlanePort = UInt16(port)
    quinnControlPlaneServerName = serverName
    activeExpectedDid = expectedDid
    // Drop cached session state — old session ticket is bound to the old host.
    quinnRequestQueue.removeAll()
    quinnHandshakeInProgress.removeAll()
    quinnSessionIdPrefixByIdentity.removeAll()
    connectionLock.unlock()

    let didMasked = expectedDid.count > 24 ? String(expectedDid.prefix(24)) + "…" : expectedDid
    print("[NativeQuic] 🔀 Active validator switched: \(oldTarget) → \(host):\(port) (sni=\(serverName), did=\(didMasked))")
    resolve([
      "host": host,
      "port": port,
      "expectedDid": expectedDid,
      "sni": serverName,
    ])
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

    // Allow identity/register to use DID for handshake lookup before identity_id exists
    if path == "/api/v1/identity/register",
       let body = body,
       let bodyData = body.data(using: .utf8),
       let json = try? JSONSerialization.jsonObject(with: bodyData) as? [String: Any],
       let did = json["did"] as? String {
      print("[NativeQuic]    ✓ Found in request body did for register: \(did)")
      return did.isEmpty ? nil : did
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

    print("[NativeQuic] requestBytes: \(method) \(url) with ALPN: \(alpn == .publicContent ? alpnPublic : alpnAuthenticated)")

    if alpn != .publicContent {
      throw NSError(domain: "NativeQuic", code: -1, userInfo: [NSLocalizedDescriptionKey: "requestBytes only supports public ALPN"])
    }

    let response = try quinnPublicRequest(
      parsedUrl: parsedUrl,
      method: method,
      headers: headers,
      body: body
    )

    return response
  }

  // MARK: - React Native Setup

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc
  func constantsToExport() -> [AnyHashable: Any]! {
    return [
      "ALPN_PROTOCOL": alpnAuthenticated,
      "DEFAULT_TIMEOUT": defaultTimeout,
      "MIN_IOS_VERSION": 15.0
    ]
  }
}

/// Minimal RFC 1035 DNS-over-UDP: build A-record query, parse A-record answers.
/// Just enough for ZDNS discovery — no support for compression pointers in the
/// question section (we never emit them), but DOES handle them in answers.
private enum DnsUdp {
  static func buildQuery(name: String) -> Data? {
    var data = Data(capacity: 64)
    let id = UInt16.random(in: 0..<UInt16.max)
    data.append(UInt8(id >> 8))
    data.append(UInt8(id & 0xFF))
    data.append(contentsOf: [0x01, 0x00]) // flags: RD=1
    data.append(contentsOf: [0x00, 0x01]) // QDCOUNT=1
    data.append(contentsOf: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00]) // AN/NS/AR=0
    for label in name.split(separator: ".") {
      let bytes = Array(label.utf8)
      if bytes.count > 63 { return nil }
      data.append(UInt8(bytes.count))
      data.append(contentsOf: bytes)
    }
    data.append(0x00) // terminator
    data.append(contentsOf: [0x00, 0x01]) // QTYPE=A
    data.append(contentsOf: [0x00, 0x01]) // QCLASS=IN
    return data
  }

  static func parseAnswers(_ data: Data) -> [String] {
    guard data.count > 12 else { return [] }
    let bytes = [UInt8](data)
    let ancount = (Int(bytes[6]) << 8) | Int(bytes[7])
    if ancount == 0 { return [] }

    // Skip question section
    var idx = 12
    // Skip QNAME (length-prefixed labels, terminated by 0 byte)
    while idx < bytes.count {
      let len = Int(bytes[idx])
      if len == 0 { idx += 1; break }
      if (len & 0xC0) == 0xC0 { idx += 2; break } // pointer
      idx += 1 + len
    }
    idx += 4 // QTYPE + QCLASS

    var ips: [String] = []
    for _ in 0..<ancount {
      // Skip name (could be compressed pointer)
      if idx >= bytes.count { break }
      if (bytes[idx] & 0xC0) == 0xC0 {
        idx += 2
      } else {
        while idx < bytes.count {
          let len = Int(bytes[idx])
          if len == 0 { idx += 1; break }
          if (len & 0xC0) == 0xC0 { idx += 2; break }
          idx += 1 + len
        }
      }
      guard idx + 10 <= bytes.count else { break }
      let rtype = (Int(bytes[idx]) << 8) | Int(bytes[idx + 1])
      let rdlen = (Int(bytes[idx + 8]) << 8) | Int(bytes[idx + 9])
      idx += 10
      guard idx + rdlen <= bytes.count else { break }
      if rtype == 1 && rdlen == 4 {
        let a = bytes[idx], b = bytes[idx + 1], c = bytes[idx + 2], d = bytes[idx + 3]
        ips.append("\(a).\(b).\(c).\(d)")
      }
      idx += rdlen
    }
    return ips
  }
}
