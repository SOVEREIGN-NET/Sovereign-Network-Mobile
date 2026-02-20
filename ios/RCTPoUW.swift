// RCTPoUW.swift
// React Native Bridge for PoUW (Proof-of-Useful-Work)

import Foundation
import CommonCrypto

@objc(RCTPoUW)
class RCTPoUW: NSObject {
  
  @objc static func moduleName() -> String! {
    return "PoUW"
  }
  
  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }
  
  private var nodeUrl: String = "https://localhost:9334"
  private var challengeToken: String?
  private var challengeExpiresAt: Int64 = 0
  private var pendingReceipts: [PoUWReceipt] = []
  private var clientDid: String?
  private var clientNodeId: Data?
  
  override init() {
    super.init()
    loadFromStorage()
  }
  
  private func loadFromStorage() {
    if let did = UserDefaults.standard.string(forKey: "identity_did") {
      self.clientDid = did
    }
    if let data = UserDefaults.standard.data(forKey: "pouw_pending_receipts"),
       let receipts = try? JSONDecoder().decode([PoUWReceipt].self, from: data) {
      self.pendingReceipts = receipts
    }
  }
  
  private func savePendingReceipts() {
    if let data = try? JSONEncoder().encode(pendingReceipts) {
      UserDefaults.standard.set(data, forKey: "pouw_pending_receipts")
    }
  }
  
  // MARK: - API Methods
  
  @objc func setNodeUrl(_ nodeUrl: String, resolver resolve: Any?, rejecter reject: Any?) {
    self.nodeUrl = nodeUrl
    self.challengeToken = nil
    self.challengeExpiresAt = 0
    (resolve as? (Any?) -> Void)?(nodeUrl)
  }
  
  @objc func getChallenge(_ cap: String?, maxBytes: Double, maxReceipts: Double, resolver resolve: Any?, rejecter reject: Any?) {
    guard let url = URL(string: "\(nodeUrl)/pouw/challenge") else {
      (reject as? (String?, String?, Error?) -> Void)?("INVALID_URL", "Invalid node URL", nil)
      return
    }
    
    var components = URLComponents(url: url, resolvingAgainstBaseURL: false)
    var queryItems: [URLQueryItem] = []
    if let cap = cap { queryItems.append(URLQueryItem(name: "cap", value: cap)) }
    if maxBytes > 0 { queryItems.append(URLQueryItem(name: "max_bytes", value: String(Int(maxBytes)))) }
    if maxReceipts > 0 { queryItems.append(URLQueryItem(name: "max_receipts", value: String(Int(maxReceipts)))) }
    components?.queryItems = queryItems
    
    guard let finalUrl = components?.url else {
      (reject as? (String?, String?, Error?) -> Void)?("INVALID_URL", "Failed to build URL", nil)
      return
    }
    
    var request = URLRequest(url: finalUrl)
    request.httpMethod = "GET"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    if let did = clientDid { request.setValue(did, forHTTPHeaderField: "X-Client-DID") }
    
    URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
      if let error = error {
        (reject as? (String?, String?, Error?) -> Void)?("NETWORK_ERROR", error.localizedDescription, error)
        return
      }
      
      guard let httpResponse = response as? HTTPURLResponse, (200...299).contains(httpResponse.statusCode) else {
        (reject as? (String?, String?, Error?) -> Void)?("HTTP_ERROR", "HTTP failed", nil)
        return
      }
      
      guard let data = data,
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let token = json["token"] as? String,
            let expiresAt = json["expires_at"] as? Int64 else {
        (reject as? (String?, String?, Error?) -> Void)?("PARSE_ERROR", "Invalid response", nil)
        return
      }
      
      self?.challengeToken = token
      self?.challengeExpiresAt = expiresAt
      
      (resolve as? (Any?) -> Void)?(["token": token, "expires_at": expiresAt])
    }.resume()
  }
  
  @objc func verifyContent(_ contentId: String, bytes: String, providerId: String?, resolver resolve: Any?, rejecter reject: Any?) {
    guard let contentIdData = Data(base64Encoded: contentId),
          let bytesData = Data(base64Encoded: bytes) else {
      (reject as? (String?, String?, Error?) -> Void)?("INVALID_INPUT", "Failed to decode base64", nil)
      return
    }
    
    let hash = sha256Hash(bytesData)
    guard hash == contentIdData else {
      (reject as? (String?, String?, Error?) -> Void)?("VERIFICATION_FAILED", "Hash mismatch", nil)
      return
    }
    
    var receiptNonce = [UInt8](repeating: 0, count: 16)
    _ = SecRandomCopyBytes(kSecRandomDefault, 16, &receiptNonce)
    
    let receipt = PoUWReceipt(
      taskId: contentIdData.map { String(format: "%02x", $0) }.joined(),
      clientDid: clientDid ?? "",
      clientNodeId: clientNodeId?.map { String(format: "%02x", $0) }.joined() ?? "",
      providerId: providerId ?? "",
      contentId: contentIdData.map { String(format: "%02x", $0) }.joined(),
      proofType: "hash",
      bytesVerified: bytesData.count,
      resultOk: true,
      startedAt: Int64(Date().timeIntervalSince1970 - 100),
      finishedAt: Int64(Date().timeIntervalSince1970),
      receiptNonce: Data(receiptNonce).map { String(format: "%02x", $0) }.joined(),
      challengeNonce: challengeToken ?? "",
      aux: "{}"
    )
    
    pendingReceipts.append(receipt)
    savePendingReceipts()
    
    (resolve as? (Any?) -> Void)?(["receipt_id": receipt.receiptNonce, "bytes_verified": bytesData.count, "proof_type": "hash"])
  }
  
  @objc func flush(_ resolve: Any?, rejecter reject: Any?) {
    guard !pendingReceipts.isEmpty else {
      (reject as? (String?, String?, Error?) -> Void)?("NO_PENDING", "No pending receipts", nil)
      return
    }
    
    guard let url = URL(string: "\(nodeUrl)/pouw/submit") else {
      (reject as? (String?, String?, Error?) -> Void)?("INVALID_URL", "Invalid URL", nil)
      return
    }
    
    let body: [String: Any] = [
      "version": 1,
      "client_did": clientDid ?? "",
      "receipts": pendingReceipts.map { r in
        ["receipt": ["version": 1, "task_id": r.taskId, "client_did": r.clientDid, "client_node_id": r.clientNodeId, "provider_id": r.providerId, "content_id": r.contentId, "proof_type": r.proofType, "bytes_verified": r.bytesVerified, "result_ok": r.resultOk, "started_at": r.startedAt, "finished_at": r.finishedAt, "receipt_nonce": r.receiptNonce, "challenge_nonce": r.challengeNonce, "aux": r.aux], "sig_scheme": "ed25519", "signature": "TODO"]
      }
    ]
    
    guard let jsonData = try? JSONSerialization.data(withJSONObject: body) else {
      (reject as? (String?, String?, Error?) -> Void)?("SERIALIZATION_ERROR", "Failed to serialize", nil)
      return
    }
    
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = jsonData
    if let did = clientDid { request.setValue(did, forHTTPHeaderField: "X-Client-DID") }
    
    URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
      if let error = error {
        (reject as? (String?, String?, Error?) -> Void)?("NETWORK_ERROR", error.localizedDescription, error)
        return
      }
      
      guard let httpResponse = response as? HTTPURLResponse, (200...299).contains(httpResponse.statusCode) else {
        (reject as? (String?, String?, Error?) -> Void)?("HTTP_ERROR", "HTTP failed", nil)
        return
      }
      
      self?.pendingReceipts.removeAll()
      self?.savePendingReceipts()
      
      (resolve as? (Any?) -> Void)?(["accepted": self?.pendingReceipts.count ?? 0, "rejected": 0])
    }.resume()
  }
  
  @objc func getPendingCount(_ resolve: Any?, rejecter reject: Any?) {
    (resolve as? (Any?) -> Void)?(pendingReceipts.count)
  }
  
  private func sha256Hash(_ data: Data) -> Data {
    var hash = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
    data.withUnsafeBytes { bytes in
      _ = CC_SHA256(bytes.baseAddress, CC_LONG(data.count), &hash)
    }
    return Data(hash)
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
