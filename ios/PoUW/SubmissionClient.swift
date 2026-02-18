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
            challengeEndpoint: "/api/v1/pouw/challenge",
            submitEndpoint: "/api/v1/pouw/submit",
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
        
        // Build challenge request
        let requestBody: [String: Any] = [
            "did": did,
            "capabilities": capabilities,
            "timestamp": UInt64(Date().timeIntervalSince1970)
        ]
        
        let bodyData = try JSONSerialization.data(withJSONObject: requestBody)
        
        // Make QUIC request
        let response = try await makeQuicRequest(
            path: config.challengeEndpoint,
            method: "POST",
            body: bodyData
        )
        
        // Parse response
        guard response.status == 200 else {
            throw PoUWError.serverRejection("Challenge request failed: HTTP \(response.status)")
        }
        
        // Parse challenge token from response
        // Expected format: { "challenge": "base64", "expires_at": timestamp, "nonce": "base64", "signature": "base64" }
        guard let json = try? JSONSerialization.jsonObject(with: response.body) as? [String: Any],
              let challengeB64 = json["challenge"] as? String,
              let challenge = Data(base64Encoded: challengeB64),
              let expiresAtMs = json["expires_at"] as? UInt64,
              let nonceB64 = json["nonce"] as? String,
              let nonce = Data(base64Encoded: nonceB64),
              let signatureB64 = json["signature"] as? String,
              let serverSignature = Data(base64Encoded: signatureB64) else {
            throw PoUWError.serializationError
        }
        
        let expiresAt = Date(timeIntervalSince1970: Double(expiresAtMs) / 1000)
        
        return ChallengeToken(
            challenge: challenge,
            expiresAt: expiresAt,
            nonce: nonce,
            serverSignature: serverSignature
        )
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
        
        // Build submit request
        let receiptData = batch.receipts.map { receipt in
            [
                "nonce": receipt.receiptNonce.base64EncodedString(),
                "task_id": receipt.taskId.base64EncodedString(),
                "signed_data": receipt.signedReceiptData.base64EncodedString()
            ]
        }
        
        let requestBody: [String: Any] = [
            "did": did,
            "challenge": batch.challengeToken.challenge.base64EncodedString(),
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
        // Expected format: { "accepted": true/false, "message": "...", "accepted_receipts": [...], "rejected_receipts": [...] }
        guard let json = try? JSONSerialization.jsonObject(with: response.body) as? [String: Any] else {
            throw PoUWError.serializationError
        }
        
        let accepted = json["accepted"] as? Bool ?? false
        let message = json["message"] as? String ?? ""
        
        // Parse accepted receipt nonces
        let acceptedReceipts: [Data] = (json["accepted_receipts"] as? [String])?.compactMap {
            Data(base64Encoded: $0)
        } ?? []
        
        // Parse rejected receipt nonces
        let rejectedReceipts: [Data] = (json["rejected_receipts"] as? [String])?.compactMap {
            Data(base64Encoded: $0)
        } ?? []
        
        // Parse rejection reasons
        var rejectionReasons: [String: String] = [:]
        if let reasons = json["rejection_reasons"] as? [String: String] {
            rejectionReasons = reasons
        }
        
        return SubmissionResponse(
            accepted: accepted,
            message: message,
            acceptedReceipts: acceptedReceipts,
            rejectedReceipts: rejectedReceipts,
            rejectionReasons: rejectionReasons
        )
    }
    
    // MARK: - QUIC Transport
    
    /// Make a QUIC request using NativeZhtpApi
    private func makeQuicRequest(
        path: String,
        method: String,
        body: Data
    ) async throws -> QuicResponse {
        let url = buildQuicUrl(path: path)
        
        let headers: [String: String] = [
            "content-type": "application/json",
            "X-Zhtp-Identity": signer.getDid() ?? ""
        ]
        
        return try await withCheckedThrowingContinuation { continuation in
            let options: NSDictionary = [
                "method": method,
                "headers": headers,
                "body": String(data: body, encoding: .utf8) ?? "",
                "timeout": config.timeout,
                "insecure": false,
                "alpn": "authenticated"
            ]
            
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
