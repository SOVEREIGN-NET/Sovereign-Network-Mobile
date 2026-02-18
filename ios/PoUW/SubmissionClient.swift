// SubmissionClient.swift
// Proof-of-Useful-Work Submission Client
// Sovereign Network Mobile

import Foundation

/// Protocol for submission operations
protocol SubmissionClientProtocol {
    /// Fetch a challenge token from the server
    func fetchChallenge(capabilities: [String]) async throws -> ChallengeToken
    
    /// Submit a batch of receipts
    func submitBatch(_ batch: ReceiptBatch) async throws -> SubmissionResponse
}

/// QUIC-based implementation of SubmissionClient using NativeZhtpApi
final class SubmissionClient: SubmissionClientProtocol {
    
    // MARK: - Configuration
    
    struct Configuration {
        let nodeUrl: String
        let challengeEndpoint: String
        let submitEndpoint: String
        let timeout: Double
        
        static let `default` = Configuration(
            nodeUrl: "",
            challengeEndpoint: "/pouw/challenge",
            submitEndpoint: "/pouw/submit",
            timeout: 30.0
        )
    }
    
    // MARK: - Properties
    
    private let config: Configuration
    private let signer: IdentitySignerProtocol
    
    /// Rate limiter for challenge requests
    private let challengeRateLimiter: RateLimiter
    
    /// Rate limiter for submit requests
    private let submitRateLimiter: RateLimiter
    
    // MARK: - Initialization
    
    init(
        config: Configuration = .default,
        signer: IdentitySignerProtocol = IdentitySigner.shared
    ) {
        self.config = config
        self.signer = signer
        
        // Rate limits: max 50 requests per 60 seconds
        self.challengeRateLimiter = RateLimiter(maxRequests: 50, windowSeconds: 60)
        self.submitRateLimiter = RateLimiter(maxRequests: 50, windowSeconds: 60)
    }
    
    // MARK: - SubmissionClientProtocol
    
    /// Fetch a challenge token from the server
    func fetchChallenge(capabilities: [String]) async throws -> ChallengeToken {
        // Check rate limit
        guard challengeRateLimiter.allowRequest() else {
            throw PoUWError.rateLimitExceeded("Challenge requests limited to 50 per 60 seconds")
        }
        
        guard let did = signer.getDid() else {
            throw PoUWError.identityNotFound
        }
        
        // Build query parameters for GET request
        let capsParam = capabilities.joined(separator: ",")
        let queryPath = "\(config.challengeEndpoint)?cap=\(capsParam.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? capsParam)"
        
        // Make QUIC GET request (no body for GET)
        let response = try await makeQuicRequest(
            path: queryPath,
            method: "GET",
            body: nil
        )
        
        // Parse response
        guard response.status == 200 else {
            throw PoUWError.serverRejection("Challenge request failed: HTTP \(response.status)")
        }
        
        // Parse challenge token from response
        // Expected format: { "token": "base64-encoded-protobuf", "expires_at": timestamp }
        guard let json = try? JSONSerialization.jsonObject(with: response.body) as? [String: Any],
              let tokenB64 = json["token"] as? String,
              let tokenData = Data(base64Encoded: tokenB64),
              let expiresAtSec = json["expires_at"] as? UInt64 else {
            throw PoUWError.serializationError
        }
        
        // Parse protobuf ChallengeToken from token data
        // Format: challenge (varint length + bytes) + nonce (varint length + bytes) + serverSignature (varint length + bytes)
        let expiresAt = Date(timeIntervalSince1970: Double(expiresAtSec))
        let parsedToken = try parseChallengeTokenProto(tokenData)
        
        return ChallengeToken(
            challenge: parsedToken.challenge,
            expiresAt: expiresAt,
            nonce: parsedToken.nonce,
            serverSignature: parsedToken.serverSignature
        )
    }
    
    /// Parse protobuf-encoded ChallengeToken
    /// Simple protobuf parser for ChallengeToken message
    private func parseChallengeTokenProto(_ data: Data) throws -> (challenge: Data, nonce: Data, serverSignature: Data) {
        var offset = 0
        
        func readLengthDelimited() throws -> Data {
            guard offset < data.count else {
                throw PoUWError.serializationError
            }
            
            // Read varint length
            var length: UInt64 = 0
            var shift: UInt64 = 0
            while offset < data.count {
                let byte = data[offset]
                offset += 1
                length |= UInt64(byte & 0x7F) << shift
                if (byte & 0x80) == 0 {
                    break
                }
                shift += 7
            }
            
            guard offset + Int(length) <= data.count else {
                throw PoUWError.serializationError
            }
            
            let result = data.subdata(in: offset..<offset+Int(length))
            offset += Int(length)
            return result
        }
        
        // Parse fields (field 1 = challenge, field 2 = nonce, field 3 = serverSignature)
        var challenge: Data?
        var nonce: Data?
        var serverSignature: Data?
        
        while offset < data.count {
            let tag = data[offset]
            offset += 1
            
            let fieldNumber = (tag >> 3)
            let wireType = tag & 0x07
            
            // Length-delimited fields (wire type 2)
            if wireType == 2 {
                let value = try readLengthDelimited()
                switch fieldNumber {
                case 1: challenge = value
                case 2: nonce = value
                case 3: serverSignature = value
                default: break // Skip unknown fields
                }
            } else {
                // Skip other wire types
                throw PoUWError.serializationError
            }
        }
        
        guard let chal = challenge, let non = nonce, let sig = serverSignature else {
            throw PoUWError.serializationError
        }
        
        return (challenge: chal, nonce: non, serverSignature: sig)
    }
    
    /// Submit a batch of receipts
    func submitBatch(_ batch: ReceiptBatch) async throws -> SubmissionResponse {
        // Check rate limit
        guard submitRateLimiter.allowRequest() else {
            throw PoUWError.rateLimitExceeded("Submit requests limited to 50 per 60 seconds")
        }
        
        // Validate batch
        try batch.validate(maxSize: 100)
        
        // Validate challenge
        try batch.challengeToken.validate()
        
        guard let did = signer.getDid() else {
            throw PoUWError.identityNotFound
        }
        
        // Build submit request per API spec
        // Format: { "version": 1, "client_did": "...", "receipts": [...] }
        let receiptData = batch.receipts.map { receipt -> [String: Any] in
            [
                "receipt": [
                    "version": 1,
                    "task_id": receipt.taskId.hexEncodedString(),
                    "client_did": did,
                    "client_node_id": receipt.clientNodeId?.hexEncodedString() ?? "",
                    "provider_id": receipt.providerId?.hexEncodedString() ?? "",
                    "content_id": receipt.contentId?.hexEncodedString() ?? "",
                    "proof_type": receipt.proofType,
                    "bytes_verified": receipt.bytesVerified,
                    "result_ok": receipt.resultOk,
                    "started_at": receipt.startedAt,
                    "finished_at": receipt.finishedAt,
                    "receipt_nonce": receipt.receiptNonce.hexEncodedString(),
                    "challenge_nonce": batch.challengeToken.nonce.hexEncodedString()
                ],
                "sig_scheme": receipt.sigScheme,
                "signature": receipt.signature.hexEncodedString()
            ]
        }
        
        let requestBody: [String: Any] = [
            "version": 1,
            "client_did": did,
            "receipts": receiptData
        ]
        
        let bodyData = try JSONSerialization.data(withJSONObject: requestBody)
        
        // Make QUIC request
        let response = try await makeQuicRequest(
            path: config.submitEndpoint,
            method: "POST",
            body: bodyData
        )
        
        // Parse response
        // Expected format: { "accepted": 1, "rejected": 0 }
        guard let json = try? JSONSerialization.jsonObject(with: response.body) as? [String: Any] else {
            throw PoUWError.serializationError
        }
        
        let acceptedCount = json["accepted"] as? Int ?? 0
        let rejectedCount = json["rejected"] as? Int ?? 0
        
        // Since API only returns counts, we map based on batch order
        // First 'accepted' receipts are considered accepted, rest rejected
        var acceptedReceipts: [Data] = []
        var rejectedReceipts: [Data] = []
        
        for (index, receipt) in batch.receipts.enumerated() {
            if index < acceptedCount {
                acceptedReceipts.append(receipt.receiptNonce)
            } else {
                rejectedReceipts.append(receipt.receiptNonce)
            }
        }
        
        let message = "Accepted: \(acceptedCount), Rejected: \(rejectedCount)"
        
        return SubmissionResponse(
            accepted: acceptedCount > 0,
            message: message,
            acceptedCount: acceptedCount,
            rejectedCount: rejectedCount,
            acceptedReceipts: acceptedReceipts,
            rejectedReceipts: rejectedReceipts,
            rejectionReasons: [:]
        )
    }
    
    // MARK: - QUIC Transport
    
    /// Make a QUIC request using NativeZhtpApi
    private func makeQuicRequest(
        path: String,
        method: String,
        body: Data?
    ) async throws -> QuicResponse {
        let url = buildQuicUrl(path: path)
        
        let headers: [String: String] = [
            "content-type": "application/json",
            "X-Zhtp-Identity": signer.getDid() ?? ""
        ]
        
        return try await withCheckedThrowingContinuation { continuation in
            var optionsDict: [String: Any] = [
                "method": method,
                "headers": headers,
                "timeout": config.timeout,
                "insecure": false,
                "alpn": "authenticated"
            ]
            
            // Only add body if provided (GET requests don't have body)
            if let bodyData = body {
                optionsDict["body"] = String(data: bodyData, encoding: .utf8) ?? ""
            }
            
            let options: NSDictionary = optionsDict as NSDictionary
            
            NativeQuic().request(url, options: options, resolve: { result in
                guard let dict = result as? [String: Any] else {
                    continuation.resume(throwing: PoUWError.networkError(NSError(domain: "SubmissionClient", code: -1)))
                    return
                }
                
                let status = dict["status"] as? Int ?? 0
                let bodyData = (dict["body"] as? String)?.data(using: .utf8) ?? Data()
                
                continuation.resume(returning: QuicResponse(
                    status: status,
                    body: bodyData
                ))
            }, reject: { code, message, error in
                let err = error ?? NSError(
                    domain: "SubmissionClient",
                    code: -1,
                    userInfo: [NSLocalizedDescriptionKey: message ?? "QUIC request failed"]
                )
                continuation.resume(throwing: PoUWError.networkError(err))
            })
        }
    }
    
    /// Build full QUIC URL from path
    private func buildQuicUrl(path: String) -> String {
        var baseUrl = config.nodeUrl
        if baseUrl.isEmpty {
            // Use default from GeneratedConfig
            baseUrl = "quic://\(GeneratedConfig.quinnControlPlaneHost):\(GeneratedConfig.quinnControlPlanePort)"
        }
        
        // Ensure proper format
        if !baseUrl.hasPrefix("quic://") {
            baseUrl = "quic://" + baseUrl
        }
        
        return baseUrl + path
    }
}

// MARK: - Data Extensions

private extension Data {
    /// Convert Data to hex-encoded string
    func hexEncodedString() -> String {
        return map { String(format: "%02x", $0) }.joined()
    }
}

// MARK: - QuicResponse

private struct QuicResponse {
    let status: Int
    let body: Data
}

// MARK: - RateLimiter

/// Simple sliding window rate limiter
final class RateLimiter {
    private let maxRequests: Int
    private let windowSeconds: TimeInterval
    private var timestamps: [Date] = []
    private let queue = DispatchQueue(label: "com.sovereignnetwork.pouw.ratelimiter")
    
    init(maxRequests: Int, windowSeconds: TimeInterval) {
        self.maxRequests = maxRequests
        self.windowSeconds = windowSeconds
    }
    
    /// Check if request is allowed and record it
    func allowRequest() -> Bool {
        queue.sync {
            let now = Date()
            
            // Remove timestamps outside window
            timestamps.removeAll { now.timeIntervalSince($0) > windowSeconds }
            
            // Check if under limit
            guard timestamps.count < maxRequests else {
                return false
            }
            
            // Record this request
            timestamps.append(now)
            return true
        }
    }
    
    /// Get current request count in window
    var currentCount: Int {
        queue.sync {
            let now = Date()
            timestamps.removeAll { now.timeIntervalSince($0) > windowSeconds }
            return timestamps.count
        }
    }
    
    /// Reset limiter
    func reset() {
        queue.sync {
            timestamps.removeAll()
        }
    }
}
