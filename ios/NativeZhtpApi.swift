import Foundation
import React

// MARK: - Error Codes
enum ZhtpApiError: String {
  case INVALID_CREDENTIALS = "INVALID_CREDENTIALS"
  case NETWORK_TIMEOUT = "NETWORK_TIMEOUT"
  case NOT_FOUND = "NOT_FOUND"
  case INVALID_INPUT = "INVALID_INPUT"
  case UNAUTHORIZED = "UNAUTHORIZED"
  case SERVER_ERROR = "SERVER_ERROR"
  case UNKNOWN = "UNKNOWN"
}

// MARK: - Data Models
struct ZhtpIdentity: Codable {
  let identityId: String
  let did: String
  let displayName: String
  let identityType: String
  let deviceId: String?
  let createdAt: UInt64?

  enum CodingKeys: String, CodingKey {
    case identityId = "identity_id"
    case did
    case displayName = "display_name"
    case identityType = "identity_type"
    case deviceId = "device_id"
    case createdAt = "created_at"
  }
}

struct ZhtpProtocolInfo: Codable {
  let success: Bool?
  let protocolVersion: String?
  let features: [String: Bool]?
  let network: NetworkInfo?
  let node: NodeInfo?
  let error: String?

  enum CodingKeys: String, CodingKey {
    case success
    case protocolVersion = "protocol_version"
    case features
    case network
    case node
    case error
  }
}

struct NetworkInfo: Codable {
  let networkId: String?
  let consensus: String?
  let blockHeight: UInt64?
  let peerCount: Int?

  enum CodingKeys: String, CodingKey {
    case networkId = "network_id"
    case consensus
    case blockHeight = "block_height"
    case peerCount = "peer_count"
  }
}

struct NodeInfo: Codable {
  let status: String?
  let uptime: UInt64?
  let latency: Int?
  let synced: Bool?
}

// MARK: - React Native Module
@objc(NativeZhtpApi)
class NativeZhtpApi: NSObject {
  private let queue = DispatchQueue(label: "com.sovereignnetwork.zhtp-api", qos: .userInitiated)

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  // MARK: - Sign In
  @objc(signIn:password:nodeUrl:resolve:reject:)
  func signIn(
    identityId: String,
    password: String,
    nodeUrl: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      if #available(iOS 15.0, *) {
        Task {
          await self.performSignInQuicAuthenticated(
            identityId: identityId,
            password: password,
            nodeUrl: nodeUrl,
            resolve: resolve,
            reject: reject
          )
        }
      } else {
        reject("QUIC_UNSUPPORTED", "QUIC requires iOS 15 or later", nil)
      }
    }
  }

  @available(iOS 15.0, *)
  private func performSignInQuicAuthenticated(
    identityId: String,
    password: String,
    nodeUrl: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) async {
    do {
      print("[NativeZhtpApi] signIn: identityId=\(maskIdentifier(identityId))")

      guard !identityId.trimmingCharacters(in: .whitespaces).isEmpty else {
        throw NSError(
          domain: "ZhtpApiError",
          code: -1,
          userInfo: [
            "code": ZhtpApiError.INVALID_INPUT.rawValue,
            "message": "Identity ID cannot be empty"
          ]
        )
      }

      guard password.count >= 8 else {
        throw NSError(
          domain: "ZhtpApiError",
          code: -1,
          userInfo: [
            "code": ZhtpApiError.INVALID_INPUT.rawValue,
            "message": "Password must be at least 8 characters"
          ]
        )
      }

      let trimmedIdentity = identityId.trimmingCharacters(in: .whitespaces)
      var loginPayload: [String: Any] = [
        "password": password
      ]
      if trimmedIdentity.lowercased().hasPrefix("did:") {
        loginPayload["did"] = trimmedIdentity
      } else {
        loginPayload["identity_id"] = trimmedIdentity
      }

      let loginUrl = try quicUrl(nodeUrl: nodeUrl, path: "/api/v1/identity/login")
      let bodyData = try JSONSerialization.data(withJSONObject: loginPayload)
      let bodyString = String(data: bodyData, encoding: .utf8) ?? "{}"

      print("[NativeZhtpApi] Sending QUIC login request (authenticated) to: \(loginUrl)")

      let response = try await quicRequest(
        url: loginUrl,
        method: "POST",
        headers: ["content-type": "application/json"],
        body: bodyString,
        timeout: 30,
        alpn: "authenticated"
      )

      let status = response["status"] as? Int ?? 0
      let responseBody = response["body"] as? String ?? ""
      let responseData = responseBody.data(using: .utf8) ?? Data()

      print("[NativeZhtpApi] signIn response status: \(status)")

      switch status {
      case 200:
        let decoder = JSONDecoder()
        let identity = try decoder.decode(ZhtpIdentity.self, from: responseData)
      print("[NativeZhtpApi] ✅ signIn successful: \(maskIdentifier(identity.did))")

        let resultMap: [String: Any] = [
          "identityId": identity.identityId,
          "did": identity.did,
          "displayName": identity.displayName,
          "identityType": identity.identityType,
          "deviceId": identity.deviceId as Any? ?? NSNull(),
          "createdAt": identity.createdAt as Any? ?? NSNull()
        ]
        resolve(resultMap)

      case 401, 403:
        throw NSError(
          domain: "ZhtpApiError",
          code: -1,
          userInfo: [
            "code": ZhtpApiError.INVALID_CREDENTIALS.rawValue,
            "message": "Invalid credentials"
          ]
        )

      case 404:
        throw NSError(
          domain: "ZhtpApiError",
          code: -1,
          userInfo: [
            "code": ZhtpApiError.NOT_FOUND.rawValue,
            "message": "Identity not found"
          ]
        )

      case 500...599:
        throw NSError(
          domain: "ZhtpApiError",
          code: -1,
          userInfo: [
            "code": ZhtpApiError.SERVER_ERROR.rawValue,
            "message": "Server error: \(status)"
          ]
        )

      default:
        throw NSError(
          domain: "ZhtpApiError",
          code: -1,
          userInfo: [
            "code": ZhtpApiError.UNKNOWN.rawValue,
            "message": "HTTP \(status)"
          ]
        )
      }
    } catch {
      let errorDict = (error as NSError).userInfo
      reject(
        errorDict["code"] as? String ?? ZhtpApiError.UNKNOWN.rawValue,
        errorDict["message"] as? String ?? error.localizedDescription,
        error
      )
    }
  }

  // MARK: - Test Connection
  @objc(testConnection:resolve:reject:)
  func testConnection(
    nodeUrl: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      if #available(iOS 15.0, *) {
        Task {
          do {
            print("[NativeZhtpApi] testConnection: \(nodeUrl)")
            let healthUrl = try self.quicUrl(nodeUrl: nodeUrl, path: "/api/v1/protocol/health")
            let response = try await NativeQuic().requestBytes(
              url: healthUrl,
              method: "GET",
              headers: [:],
              body: nil,
              timeout: 5,
              insecure: true,
              alpn: .publicContent
            )
            print("[NativeZhtpApi] testConnection: Status \(response.status)")
            let connected = [200, 401, 403].contains(response.status)
            resolve(connected)
          } catch {
            print("[NativeZhtpApi] testConnection: ERROR - \(error.localizedDescription)")
            resolve(false)
          }
        }
      } else {
        reject("QUIC_UNSUPPORTED", "QUIC requires iOS 15 or later", nil)
      }
    }
  }

  // MARK: - Get Protocol Info
  @objc(getProtocolInfo:resolve:reject:)
  func getProtocolInfo(
    nodeUrl: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      if #available(iOS 15.0, *) {
        Task {
          await self.performGetProtocolInfoQuic(
            nodeUrl: nodeUrl,
            resolve: resolve,
            reject: reject
          )
        }
      } else {
        reject("QUIC_UNSUPPORTED", "QUIC requires iOS 15 or later", nil)
      }
    }
  }

  @available(iOS 15.0, *)
  private func performGetProtocolInfoQuic(
    nodeUrl: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) async {
    print("[NativeZhtpApi] getProtocolInfo: \(nodeUrl)")
    do {
      let healthUrl = try quicUrl(nodeUrl: nodeUrl, path: "/api/v1/protocol/health")
      let response = try await NativeQuic().requestBytes(
        url: healthUrl,
        method: "GET",
        headers: [:],
        body: nil,
        timeout: 10,
        insecure: true,
        alpn: .publicContent
      )

      if response.status == 200 {
        let decoder = JSONDecoder()
        let protocolInfo = try decoder.decode(ZhtpProtocolInfo.self, from: response.body)
        print("[NativeZhtpApi] ✅ getProtocolInfo successful")

        var networkMap: [String: Any] = [
          "networkId": protocolInfo.network?.networkId as Any? ?? NSNull(),
          "consensus": protocolInfo.network?.consensus as Any? ?? NSNull(),
          "blockHeight": protocolInfo.network?.blockHeight as Any? ?? NSNull(),
          "peerCount": protocolInfo.network?.peerCount as Any? ?? NSNull()
        ]

        var nodeMap: [String: Any] = [
          "status": protocolInfo.node?.status as Any? ?? NSNull(),
          "uptime": protocolInfo.node?.uptime as Any? ?? NSNull(),
          "latency": protocolInfo.node?.latency as Any? ?? NSNull(),
          "synced": protocolInfo.node?.synced as Any? ?? NSNull()
        ]

        let resultMap: [String: Any] = [
          "success": protocolInfo.success ?? true,
          "protocolVersion": protocolInfo.protocolVersion as Any? ?? NSNull(),
          "features": protocolInfo.features as Any? ?? NSNull(),
          "network": networkMap,
          "node": nodeMap
        ]
        resolve(resultMap)
      } else {
        throw NSError(
          domain: "ZhtpApiError",
          code: -1,
          userInfo: [
            "code": ZhtpApiError.SERVER_ERROR.rawValue,
            "message": "HTTP \(response.status)"
          ]
        )
      }
    } catch {
      let errorDict = (error as NSError).userInfo
      reject(
        errorDict["code"] as? String ?? ZhtpApiError.UNKNOWN.rawValue,
        errorDict["message"] as? String ?? error.localizedDescription,
        error
      )
    }
  }

  // MARK: - Recover with Seed (stub - endpoint doesn't exist)
  @objc(recoverWithSeed:nodeUrl:resolve:reject:)
  func recoverWithSeed(
    seedPhrase: String,
    nodeUrl: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      reject(
        ZhtpApiError.NOT_FOUND.rawValue,
        "Recovery endpoint not implemented on node",
        nil
      )
    }
  }

  // MARK: - Recover with Backup (stub - endpoint doesn't exist)
  @objc(recoverWithBackup:password:nodeUrl:resolve:reject:)
  func recoverWithBackup(
    backupData: String,
    password: String,
    nodeUrl: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      reject(
        ZhtpApiError.NOT_FOUND.rawValue,
        "Backup recovery endpoint not implemented on node",
        nil
      )
    }
  }

  // MARK: - Recover with Social (stub - endpoint doesn't exist)
  @objc(recoverWithSocial:nodeUrl:resolve:reject:)
  func recoverWithSocial(
    guardianIds: [String],
    nodeUrl: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      reject(
        ZhtpApiError.NOT_FOUND.rawValue,
        "Social recovery endpoint not implemented on node",
        nil
      )
    }
  }

  // MARK: - Create Identity (NOT IMPLEMENTED - use NativeIdentityProvisioning directly)
  @objc(createIdentity:password:identityType:nodeUrl:resolve:reject:)
  func createIdentity(
    displayName: String,
    password: String,
    identityType: String,
    nodeUrl: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      print("[NativeZhtpApi] createIdentity stub - call NativeIdentityProvisioning.provisionIdentity directly from JavaScript")
      reject(
        ZhtpApiError.NOT_FOUND.rawValue,
        "createIdentity not available here - use NativeIdentityProvisioning.provisionIdentity from JavaScript",
        nil
      )
    }
  }

  private func quicUrl(nodeUrl: String, path: String) throws -> String {
    let normalized = nodeUrl.replacingOccurrences(of: "quic://", with: "https://")
    guard let components = URLComponents(string: normalized), let host = components.host else {
      throw NSError(domain: "ZhtpApiError", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid node URL"])
    }
    let port = components.port ?? 443
    return "quic://\(host):\(port)\(path)"
  }

  @available(iOS 15.0, *)
  private func quicRequest(
    url: String,
    method: String,
    headers: [String: String],
    body: String?,
    timeout: Double,
    alpn: String
  ) async throws -> [String: Any] {
    try await withCheckedThrowingContinuation { continuation in
      let options: NSDictionary = [
        "method": method,
        "headers": headers,
        "body": body ?? "",
        "timeout": timeout,
        "insecure": true,
        "alpn": alpn
      ]
      NativeQuic().request(url, options: options, resolve: { result in
        if let map = result as? [String: Any] {
          continuation.resume(returning: map)
        } else {
          continuation.resume(returning: [:])
        }
      }, reject: { _, message, error in
        let err = error ?? NSError(domain: "NativeQuic", code: -1, userInfo: [NSLocalizedDescriptionKey: message ?? "QUIC request failed"])
        continuation.resume(throwing: err)
      })
    }
  }

  private func maskIdentifier(_ value: String?) -> String {
    let trimmed = (value ?? "").trimmingCharacters(in: .whitespaces)
    if trimmed.isEmpty { return "<empty>" }
    let core = trimmed.replacingOccurrences(of: "^did:[^:]*:", with: "", options: .regularExpression)
    if core.count <= 8 { return core }
    let start = core.prefix(4)
    let end = core.suffix(4)
    return "\(start)…\(end)"
  }
}
