// RCTPoUW.swift
// React Native Bridge for PoUW (Proof-of-Useful-Work)

import Foundation
import CommonCrypto
import React

@objc(RCTPoUW)
class RCTPoUW: NSObject {
  private static let minVerifiedBytes = 1024

  private enum ReceiptVerifyError: Error {
    case typed(code: String, message: String)
  }
  
  @objc static func moduleName() -> String! {
    return "PoUW"
  }
  
  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }
  
  private var nodeUrl: String = GeneratedConfig.nodeUrl
  private var identityId: String?
  private var challengeToken: String?
  private var challengeExpiresAt: Int64 = 0
  private var challengeTaskId: String?
  private var challengeNonce: String?
  private var pendingReceipts: [PoUWReceipt] = []
  private var clientDid: String?
  private var clientNodeId: Data?
  
  override init() {
    super.init()
    loadFromStorage()
    loadIdentityFromProvisioning()
  }
  
  private func loadFromStorage() {
    if let id = UserDefaults.standard.string(forKey: "com.sovereign.zhtp.current_identity_id") {
      self.identityId = id
    }
    if let data = UserDefaults.standard.data(forKey: "pouw_pending_receipts"),
       let receipts = try? JSONDecoder().decode([PoUWReceipt].self, from: data) {
      self.pendingReceipts = receipts
    }
  }
  
  private func loadIdentityFromProvisioning() {
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      if let identity = IdentityHandleStore.shared.getLatestIdentity() as? Identity {
        DispatchQueue.main.async {
          self?.clientDid = identity.did
        }
      }
    }
  }
  
  private func savePendingReceipts() {
    if let data = try? JSONEncoder().encode(pendingReceipts) {
      UserDefaults.standard.set(data, forKey: "pouw_pending_receipts")
    }
  }
  
  private func buildQuicUrl(path: String) -> String {
    let host = GeneratedConfig.nodeHost
    let port = GeneratedConfig.nodePort
    return "quic://\(host):\(port)\(path)"
  }
  
  // MARK: - API Methods
  
  @objc
  func setNodeUrl(_ nodeUrl: Any?, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    if let nodeUrlString = nodeUrl as? String, !nodeUrlString.isEmpty {
      self.nodeUrl = nodeUrlString
    }
    self.challengeToken = nil
    self.challengeExpiresAt = 0
    self.challengeTaskId = nil
    self.challengeNonce = nil
    resolve(self.nodeUrl)
  }
  
  @objc
  func getChallenge(_ cap: Any?, maxBytes: Double, maxReceipts: Double, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    let capString = (cap as? String)
    var path = "/api/v1/pouw/challenge"
    var queryParams: [String] = []
    if let c = capString { queryParams.append("cap=\(c)") }
    if maxBytes > 0 { queryParams.append("max_bytes=\(Int(maxBytes))") }
    if maxReceipts > 0 { queryParams.append("max_receipts=\(Int(maxReceipts))") }
    if !queryParams.isEmpty { path += "?" + queryParams.joined(separator: "&") }
    
    let url = buildQuicUrl(path: path)
    
    let options: NSDictionary = [
      "method": "GET",
      "headers": [:],
      "body": "",
      "timeout": 10.0,
      "insecure": true,
      "alpn": "public"
    ]
    
    NativeQuic().request(url, options: options, resolve: { [weak self] result in
      guard let json = result as? [String: Any] else {
        reject("PARSE_ERROR", "Invalid response", nil)
        return
      }
      
      let status = json["status"] as? Int ?? 0
      let bodyStr = json["body"] as? String ?? ""
      
      print("[PoUW] getChallenge: received status=" + String(status) + " body_len=" + String(bodyStr.count))
      
      guard status == 200 else {
        reject("CHALLENGE_ERROR", "Challenge request failed", nil)
        return
      }
      
      // Parse the JSON body
      guard let bodyData = bodyStr.data(using: .utf8),
            let bodyJson = try? JSONSerialization.jsonObject(with: bodyData) as? [String: Any] else {
        print("[PoUW] getChallenge: failed to parse body or no token. body_len=" + String(bodyStr.count))
        reject("PARSE_ERROR", "Invalid challenge response body", nil)
        return
      }
      
      let token =
        (bodyJson["token"] as? String)
        ?? (bodyJson["challenge"] as? String)
        ?? ((bodyJson["data"] as? [String: Any])?["token"] as? String)
        ?? ((bodyJson["result"] as? [String: Any])?["token"] as? String)
      
      guard let tokenString = token, !tokenString.isEmpty else {
        print("[PoUW] getChallenge: no token field. keys=" + bodyJson.keys.sorted().joined(separator: ","))
        reject("PARSE_ERROR", "No token in response", nil)
        return
      }
      
      print("[PoUW] getChallenge: token length=" + String(tokenString.count))
      
      guard let parsed = self?.parseChallengeToken(tokenString) else {
        let details = self?.describeTokenShape(tokenString) ?? "unknown"
        print("[PoUW] getChallenge: token parse failed. details=" + details)
        reject("PARSE_ERROR", "Invalid token format (\(details))", nil)
        return
      }
      
      self?.challengeTaskId = parsed.taskId
      self?.challengeNonce = parsed.challengeNonce
      self?.challengeToken = parsed.taskId + ":" + parsed.challengeNonce
      self?.challengeExpiresAt = self?.parseExpiresAt(bodyJson["expires_at"]) ?? 0
      
      resolve(["token": self?.challengeToken ?? "", "expires_at": self?.challengeExpiresAt ?? 0])
    }, reject: { _, message, error in
      reject("QUIC_ERROR", message ?? "QUIC request failed", error)
    })
  }
  
  @objc
  func verifyContent(_ contentId: Any?, bytes: Any?, providerId: Any?, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    let contentIdStr = (contentId as? String) ?? ""
    let bytesStr = (bytes as? String) ?? ""
    let providerIdStr = (providerId as? String) ?? ""
    
    guard let bytesData = Data(base64Encoded: bytesStr) else {
      reject("INVALID_INPUT", "Failed to decode base64 bytes", nil)
      return
    }

    switch verifyAndQueueReceipt(contentIdB64: contentIdStr, bytesData: bytesData, providerIdRaw: providerIdStr) {
    case .success(let payload):
      resolve(payload)
    case .failure(let error):
      if case let .typed(code, message) = error {
        reject(code, message, nil)
      } else {
        reject("VERIFY_ERROR", "Failed to verify content", error)
      }
    }
  }

  @objc
  func verifyDomainContent(_ domain: Any?, path: Any?, providerId: Any?, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    guard #available(iOS 15.0, *) else {
      reject("UNSUPPORTED", "verifyDomainContent requires iOS 15+", nil)
      return
    }

    let domainRaw = ((domain as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    let pathRaw = ((path as? String) ?? "/").trimmingCharacters(in: .whitespacesAndNewlines)
    let providerIdStr = (providerId as? String) ?? ""

    guard !domainRaw.isEmpty else {
      reject("INVALID_INPUT", "Domain is required", nil)
      return
    }

    Task {
      do {
        let client = Web4Client(
          baseUrl: buildQuicUrl(path: ""),
          hostHeader: domainRaw,
          timeout: 30,
          insecure: true
        )

        let resolved = try await client.resolveDomain(domain: domainRaw)
        guard let manifestCid = resolved.manifest_cid, !manifestCid.isEmpty else {
          reject("WEB4_ERROR", "Missing manifest CID for domain \(domainRaw)", nil)
          return
        }

        let manifest = try await client.fetchManifest(manifestCid: manifestCid)
        guard let target = selectManifestFile(manifest.files, preferredPath: pathRaw) else {
          reject("WEB4_ERROR", "No file entry found for \(domainRaw)\(pathRaw)", nil)
          return
        }

        let blob = try await client.fetchBlob(cid: target.cid)
        switch verifyAndQueueReceipt(contentIdB64: "", bytesData: blob, providerIdRaw: providerIdStr) {
        case .success(let payload):
          var enriched = payload
          enriched["domain"] = domainRaw
          enriched["path"] = target.path
          enriched["cid"] = target.cid
          resolve(enriched)
        case .failure(let error):
          if case let .typed(code, message) = error {
            reject(code, message, nil)
          } else {
            reject("VERIFY_ERROR", "Failed to verify domain content", error)
          }
        }
      } catch {
        reject("WEB4_ERROR", "Failed to verify domain content: \(error.localizedDescription)", error)
      }
    }
  }

  private func verifyAndQueueReceipt(contentIdB64: String, bytesData: Data, providerIdRaw: String) -> Result<[String: Any], ReceiptVerifyError> {
    let computedHash = sha256Hash(bytesData)
    let contentIdHash: Data

    if contentIdB64.isEmpty {
      contentIdHash = computedHash
    } else if let decoded = Data(base64Encoded: contentIdB64) {
      contentIdHash = decoded
    } else {
      return .failure(.typed(code: "INVALID_INPUT", message: "Failed to decode base64 contentId"))
    }

    guard computedHash == contentIdHash else {
      return .failure(.typed(code: "VERIFICATION_FAILED", message: "Hash mismatch"))
    }

    guard bytesData.count >= Self.minVerifiedBytes else {
      return .success([
        "eligible": false,
        "reason": "min_bytes",
        "min_bytes_required": Self.minVerifiedBytes,
        "bytes_verified": bytesData.count,
        "proof_type": "hash"
      ])
    }

    var receiptNonce = [UInt8](repeating: 0, count: 16)
    _ = SecRandomCopyBytes(kSecRandomDefault, 16, &receiptNonce)

    let contentIdHex = computedHash.map { String(format: "%02x", $0) }.joined()

    guard let taskId = challengeTaskId, let challengeNonceValue = challengeNonce else {
      return .failure(.typed(code: "NO_CHALLENGE", message: "Challenge not loaded. Call getChallenge() first."))
    }

    let receipt = PoUWReceipt(
      taskId: taskId,
      clientDid: clientDid ?? "",
      clientNodeId: clientNodeId?.map { String(format: "%02x", $0) }.joined() ?? "",
      providerId: providerIdRaw,
      contentId: contentIdHex,
      proofType: "hash",
      bytesVerified: bytesData.count,
      resultOk: true,
      startedAt: Int64(Date().timeIntervalSince1970 - 100),
      finishedAt: Int64(Date().timeIntervalSince1970),
      receiptNonce: Data(receiptNonce).map { String(format: "%02x", $0) }.joined(),
      challengeNonce: challengeNonceValue,
      aux: "{}"
    )

    pendingReceipts.append(receipt)
    savePendingReceipts()

    return .success([
      "eligible": true,
      "receipt_id": receipt.receiptNonce,
      "bytes_verified": bytesData.count,
      "proof_type": "hash"
    ])
  }

  private func selectManifestFile(_ files: [Web4ManifestFile], preferredPath: String) -> Web4ManifestFile? {
    guard !files.isEmpty else { return nil }

    let normalized = normalizeManifestPath(preferredPath)
    let normalizedNoSlash = normalized.hasPrefix("/") ? String(normalized.dropFirst()) : normalized

    if let exact = files.first(where: { normalizeManifestPath($0.path) == normalized }) {
      return exact
    }
    if let exactNoSlash = files.first(where: { normalizeManifestPath($0.path) == normalizedNoSlash }) {
      return exactNoSlash
    }

    if let index = files.first(where: { normalizeManifestPath($0.path) == "/index.html" })
      ?? files.first(where: { normalizeManifestPath($0.path) == "index.html" }) {
      return index
    }

    if let biggestEligible = files
      .filter({ $0.size >= Int64(Self.minVerifiedBytes) })
      .max(by: { $0.size < $1.size }) {
      return biggestEligible
    }

    return files.max(by: { $0.size < $1.size })
  }

  private func normalizeManifestPath(_ path: String) -> String {
    let trimmed = path.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return "/index.html" }
    if trimmed == "/" { return "/index.html" }
    return trimmed
  }
  
  private func signReceipt(_ receipt: PoUWReceipt) -> String? {
    guard receipt.proofType.lowercased() == "hash",
          receipt.bytesVerified >= Self.minVerifiedBytes else {
      return nil
    }

    guard let identity = IdentityHandleStore.shared.getLatestIdentity() as? Identity else {
      return nil
    }

    var receiptForSigning: [String: Any] = [
      "version": 1,
      "task_id": receipt.taskId,
      "client_did": receipt.clientDid,
      "client_node_id": receipt.clientNodeId,
      "provider_id": receipt.providerId,
      "content_id": receipt.contentId,
      "proof_type": receipt.proofType,
      "bytes_verified": receipt.bytesVerified,
      "result_ok": receipt.resultOk,
      "started_at": receipt.startedAt,
      "finished_at": receipt.finishedAt,
      "receipt_nonce": receipt.receiptNonce,
      "challenge_nonce": receipt.challengeNonce
    ]

    if !receipt.aux.isEmpty {
      receiptForSigning["aux"] = receipt.aux
    }

    guard let jsonData = try? JSONSerialization.data(withJSONObject: receiptForSigning),
          let receiptJson = String(data: jsonData, encoding: .utf8) else {
      return nil
    }

    do {
      let signature = try ZhtpClient.signPoUWReceiptJson(receiptJson, using: identity)
      return signature.map { String(format: "%02x", $0) }.joined()
    } catch {
      return nil
    }
  }
  
  @objc
  func flush(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    guard !pendingReceipts.isEmpty else {
      reject("NO_PENDING", "No pending receipts", nil)
      return
    }

    let eligible = pendingReceipts.filter {
      $0.proofType.lowercased() == "hash" && $0.bytesVerified >= Self.minVerifiedBytes
    }
    if eligible.count != pendingReceipts.count {
      pendingReceipts = eligible
      savePendingReceipts()
    }
    guard !pendingReceipts.isEmpty else {
      reject("NO_ELIGIBLE_RECEIPTS", "No policy-eligible receipts to submit", nil)
      return
    }
    
    guard identityId != nil else {
      reject("NO_IDENTITY", "No identity found. Please sign in first.", nil)
      return
    }
    
    let signedReceipts = pendingReceipts.compactMap { r -> [String: Any]? in
      guard let signature = signReceipt(r), !signature.isEmpty else {
        return nil
      }
      return [
        "receipt": [
          "version": 1,
          "task_id": r.taskId,
          "client_did": r.clientDid,
          "client_node_id": r.clientNodeId,
          "provider_id": r.providerId,
          "content_id": r.contentId,
          "proof_type": r.proofType,
          "bytes_verified": r.bytesVerified,
          "result_ok": r.resultOk,
          "started_at": r.startedAt,
          "finished_at": r.finishedAt,
          "receipt_nonce": r.receiptNonce,
          "challenge_nonce": r.challengeNonce,
          "aux": r.aux
        ],
        "sig_scheme": "dilithium5",
        "signature": signature
      ]
    }
    guard signedReceipts.count == pendingReceipts.count else {
      reject("SIGN_ERROR", "Failed to sign one or more receipts", nil)
      return
    }
    
    let body: [String: Any] = [
      "version": 1,
      "client_did": clientDid ?? "",
      "receipts": signedReceipts
    ]
    
    guard let jsonData = try? JSONSerialization.data(withJSONObject: body),
          let jsonString = String(data: jsonData, encoding: .utf8) else {
      reject("SERIALIZATION_ERROR", "Failed to serialize", nil)
      return
    }
    
    let url = buildQuicUrl(path: "/api/v1/pouw/submit")
    
    let headers: [String: String] = [
      "Content-Type": "application/json",
      "X-Zhtp-Identity": identityId ?? ""
    ]
    
    let options: NSDictionary = [
      "method": "POST",
      "headers": headers,
      "body": jsonString,
      "timeout": 30.0,
      "insecure": true,
      "alpn": "authenticated"
    ]
    
    NativeQuic().request(url, options: options, resolve: { [weak self] result in
      guard let json = result as? [String: Any] else {
        reject("PARSE_ERROR", "Invalid response", nil)
        return
      }
      
      let accepted = json["accepted"] as? Int ?? 0
      let rejected = json["rejected"] as? Int ?? 0
      
      self?.pendingReceipts.removeAll()
      self?.savePendingReceipts()
      
      resolve(["accepted": accepted, "rejected": rejected])
    }, reject: { _, message, error in
      reject("QUIC_ERROR", message ?? "QUIC request failed", error)
    })
  }
  
  @objc
  func getPendingCount(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    resolve(pendingReceipts.count)
  }
  
  private func sha256Hash(_ data: Data) -> Data {
    var hash = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
    data.withUnsafeBytes { bytes in
      _ = CC_SHA256(bytes.baseAddress, CC_LONG(data.count), &hash)
    }
    return Data(hash)
  }
  
  private func parseChallengeToken(_ token: String) -> (taskId: String, challengeNonce: String)? {
    let trimmed = token.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }
    
    // 1) Raw JSON token.
    if let rawJsonData = trimmed.data(using: .utf8),
       let parsed = parseDecodedTokenPayload(rawJsonData, depth: 0) {
      return parsed
    }
    
    // 2) Single base64/base64url payload.
    if let decoded = decodeBase64Maybe(trimmed),
       let parsed = parseDecodedTokenPayload(decoded, depth: 0) {
      return parsed
    }
    
    // 2b) Hex-encoded payload.
    if let hexDecoded = decodeHexMaybe(trimmed),
       let parsed = parseDecodedTokenPayload(hexDecoded, depth: 0) {
      return parsed
    }
    
    // 3) JWT-like token: usually payload is the 2nd segment.
    if trimmed.contains(".") {
      let segments = trimmed.split(separator: ".")
      let candidateIndexes = [1, 0]
      for idx in candidateIndexes where idx < segments.count {
        if let decoded = decodeBase64Maybe(String(segments[idx])),
           let parsed = parseDecodedTokenPayload(decoded, depth: 0) {
          return parsed
        }
      }
    }
    
    return nil
  }
  
  private func parseDecodedTokenPayload(_ payload: Data, depth: Int) -> (taskId: String, challengeNonce: String)? {
    if let parsed = parseChallengeTokenJSON(from: payload) {
      return parsed
    }
    if let parsed = parseChallengeTokenProtobuf(from: payload) {
      return parsed
    }
    
    // Some nodes return token as base64(base64url(JSON)).
    if depth < 2,
       let innerText = String(data: payload, encoding: .utf8)?
        .trimmingCharacters(in: .whitespacesAndNewlines),
       !innerText.isEmpty {
      if let innerDecoded = decodeBase64Maybe(innerText),
         let parsed = parseDecodedTokenPayload(innerDecoded, depth: depth + 1) {
        return parsed
      }
      if let innerHex = decodeHexMaybe(innerText),
         let parsed = parseDecodedTokenPayload(innerHex, depth: depth + 1) {
        return parsed
      }
    }
    
    return nil
  }
  
  private func parseChallengeTokenJSON(from data: Data) -> (taskId: String, challengeNonce: String)? {
    guard let json = try? JSONSerialization.jsonObject(with: data) else {
      return nil
    }
    
    let taskKeys: Set<String> = ["task_id", "taskId"]
    let nonceKeys: Set<String> = ["challenge_nonce", "challengeNonce"]
    
    guard let rawTask = findStringValue(in: json, keys: taskKeys),
          let rawNonce = findStringValue(in: json, keys: nonceKeys),
          let taskId = normalizeIdentifier(rawTask),
          let challengeNonce = normalizeIdentifier(rawNonce) else {
      return nil
    }
    
    return (taskId, challengeNonce)
  }
  
  private func parseChallengeTokenProtobuf(from data: Data) -> (taskId: String, challengeNonce: String)? {
    var index = 0
    var taskIdBytes: Data?
    var challengeNonceBytes: Data?
    
    while index < data.count {
      guard let key = readVarint(from: data, index: &index) else { return nil }
      
      let fieldNumber = Int(key >> 3)
      let wireType = Int(key & 0x07)
      
      switch wireType {
      case 0:
        guard readVarint(from: data, index: &index) != nil else { return nil }
      case 1:
        guard index + 8 <= data.count else { return nil }
        index += 8
      case 2:
        guard let length = readVarint(from: data, index: &index) else { return nil }
        let len = Int(length)
        guard len >= 0, index + len <= data.count else { return nil }
        let value = data.subdata(in: index..<(index + len))
        index += len
        
        if fieldNumber == 3 {
          taskIdBytes = value
        } else if fieldNumber == 4 {
          challengeNonceBytes = value
        }
      case 5:
        guard index + 4 <= data.count else { return nil }
        index += 4
      default:
        return nil
      }
    }
    
    guard let task = taskIdBytes,
          let nonce = challengeNonceBytes,
          !task.isEmpty,
          !nonce.isEmpty else {
      return nil
    }
    
    return (toHex(task), toHex(nonce))
  }
  
  private func readVarint(from data: Data, index: inout Int) -> UInt64? {
    var value: UInt64 = 0
    var shift: UInt64 = 0
    
    while index < data.count, shift <= 63 {
      let byte = data[index]
      index += 1
      
      value |= UInt64(byte & 0x7F) << shift
      if (byte & 0x80) == 0 {
        return value
      }
      shift += 7
    }
    
    return nil
  }
  
  private func findStringValue(in value: Any, keys: Set<String>) -> String? {
    if let dict = value as? [String: Any] {
      for (key, candidate) in dict {
        if keys.contains(key), let str = candidate as? String {
          return str
        }
      }
      for (_, candidate) in dict {
        if let found = findStringValue(in: candidate, keys: keys) {
          return found
        }
      }
    } else if let array = value as? [Any] {
      for item in array {
        if let found = findStringValue(in: item, keys: keys) {
          return found
        }
      }
    }
    return nil
  }
  
  private func normalizeIdentifier(_ value: String) -> String? {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }
    let noPrefix = trimmed.hasPrefix("0x") || trimmed.hasPrefix("0X") ? String(trimmed.dropFirst(2)) : trimmed
    
    if isHexString(noPrefix) {
      return noPrefix.lowercased()
    }
    
    if let decoded = decodeBase64Maybe(noPrefix), !decoded.isEmpty {
      return toHex(decoded)
    }
    
    return nil
  }
  
  private func isHexString(_ value: String) -> Bool {
    guard value.count % 2 == 0 else { return false }
    return value.range(of: "^[0-9a-fA-F]+$", options: .regularExpression) != nil
  }
  
  private func decodeBase64Maybe(_ value: String) -> Data? {
    let normalized = normalizeBase64(value.trimmingCharacters(in: .whitespacesAndNewlines))
    return Data(base64Encoded: normalized, options: [.ignoreUnknownCharacters])
  }
  
  private func decodeHexMaybe(_ value: String) -> Data? {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    let hex = (trimmed.hasPrefix("0x") || trimmed.hasPrefix("0X")) ? String(trimmed.dropFirst(2)) : trimmed
    guard isHexString(hex) else { return nil }
    
    var out = Data(capacity: hex.count / 2)
    var idx = hex.startIndex
    while idx < hex.endIndex {
      let next = hex.index(idx, offsetBy: 2)
      guard let byte = UInt8(hex[idx..<next], radix: 16) else { return nil }
      out.append(byte)
      idx = next
    }
    return out
  }
  
  private func describeTokenShape(_ token: String) -> String {
    let trimmed = token.trimmingCharacters(in: .whitespacesAndNewlines)
    var tags: [String] = []
    tags.append("len=\(trimmed.count)")
    if trimmed.hasPrefix("{") { tags.append("json_text") }
    if trimmed.contains(".") { tags.append("dot_segments=\(trimmed.split(separator: ".").count)") }
    if decodeBase64Maybe(trimmed) != nil { tags.append("b64") }
    if decodeHexMaybe(trimmed) != nil { tags.append("hex") }
    tags.append("prefix=\(String(trimmed.prefix(24)))")
    return tags.joined(separator: ",")
  }
  
  private func toHex(_ data: Data) -> String {
    data.map { String(format: "%02x", $0) }.joined()
  }
  
  private func normalizeBase64(_ value: String) -> String {
    var normalized = value.replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")
    let remainder = normalized.count % 4
    if remainder != 0 {
      normalized += String(repeating: "=", count: 4 - remainder)
    }
    return normalized
  }
  
  private func parseExpiresAt(_ raw: Any?) -> Int64 {
    if let intVal = raw as? Int64 { return intVal }
    if let intVal = raw as? Int { return Int64(intVal) }
    if let number = raw as? NSNumber { return number.int64Value }
    if let text = raw as? String, let intVal = Int64(text) { return intVal }
    return 0
  }
}

struct PoUWReceipt: Codable {
  let taskId: String
  let clientDid: String
  let clientNodeId: String
  let providerId: String
  let contentId: String
  let proofType: String
  let bytesVerified: Int
  let resultOk: Bool
  let startedAt: Int64
  let finishedAt: Int64
  let receiptNonce: String
  let challengeNonce: String
  let aux: String
}
