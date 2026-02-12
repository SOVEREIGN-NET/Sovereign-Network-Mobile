import Foundation
import React
import Dispatch

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
  private let quinnControlPlaneHost = GeneratedConfig.quinnControlPlaneHost
  private let quinnControlPlanePort = GeneratedConfig.quinnControlPlanePort
  private let quinnControlPlaneServerName = GeneratedConfig.quinnControlPlaneServerName
  private let quinnSpkiPinHex = GeneratedConfig.quinnSpkiPinHex
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

    guard let spkiPin = dataFromHex(quinnSpkiPinHex), spkiPin.count == 32 else {
      reject("QUIC_ERROR", "Invalid SPKI pin configuration", nil)
      return
    }

    let serverName = quinnControlPlaneServerName.isEmpty ? host : quinnControlPlaneServerName
    var handle: UInt64 = 0

    let rc = host.withCString { hostPtr in
      serverName.withCString { serverNamePtr in
        spkiPin.withUnsafeBytes { spkiBuf -> Int32 in
          guard let spkiPtr = spkiBuf.baseAddress?.assumingMemoryBound(to: UInt8.self) else {
            return -1
          }
          return uhp_quic_connect_public(hostPtr, UInt16(port), serverNamePtr, spkiPtr, &handle)
        }
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

    DispatchQueue.global(qos: .userInitiated).async {
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

      guard sessionKey.count == 32 else {
        uhp_quic_close(quinnHandle)
        return .failure(NSError(domain: "NativeQuic", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid session key length from lib-client handshake"]))
      }
      guard sessionId.count == 32 else {
        uhp_quic_close(quinnHandle)
        return .failure(NSError(domain: "NativeQuic", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid session ID length from lib-client handshake"]))
      }

      // handshakeHash: use Blake3 of (sessionKey || sessionId) as substitute
      // The new HandshakeResult doesn't expose handshakeHash directly;
      // MAC key derivation uses HKDF(sessionKey, salt=handshakeHash).
      // TODO: Either add handshake_hash getter to lib-client, or change
      //       deriveMacKey to use sessionId as salt for new handshakes.
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
    guard spkiPin.count == 32 else {
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

    let rc = host.withCString { hostPtr in
      serverName.withCString { serverNamePtr in
        spkiPin.withUnsafeBytes { spkiBuf -> Int32 in
          guard let spkiPtr = spkiBuf.baseAddress?.assumingMemoryBound(to: UInt8.self) else {
            return -1
          }
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
    if let hostHeader = headers["Host"], !hostHeader.isEmpty {
      return hostHeader
    }
    if !quinnControlPlaneServerName.isEmpty {
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

    guard let spkiPin = dataFromHex(quinnSpkiPinHex), spkiPin.count == 32 else {
      throw NSError(domain: "NativeQuic", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid SPKI pin configuration"])
    }

    let serverName = resolveServerName(host: parsedUrl.host, headers: headers)
    var handle: UInt64 = 0

    let connectRc = parsedUrl.host.withCString { hostPtr in
      serverName.withCString { serverNamePtr in
        spkiPin.withUnsafeBytes { spkiBuf -> Int32 in
          guard let spkiPtr = spkiBuf.baseAddress?.assumingMemoryBound(to: UInt8.self) else {
            return -1
          }
          return uhp_quic_connect_public(hostPtr, UInt16(parsedUrl.port), serverNamePtr, spkiPtr, &handle)
        }
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
