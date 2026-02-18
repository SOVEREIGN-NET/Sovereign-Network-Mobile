// PoUWController.swift
// Proof-of-Useful-Work Main Controller
// Sovereign Network Mobile

import Foundation
import CryptoKit

/// Protocol for PoUW controller operations
protocol PoUWControllerProtocol {
    /// Verify content and create a receipt
    func verifyAndRecord(contentId: Data, bytes: Data, providerId: Data?) async throws
    
    /// Flush pending receipts to server
    func flushReceipts() async throws
    
    /// Get count of pending receipts
    func getPendingCount() async -> Int
    
    /// Check if controller has valid identity
    var isReady: Bool { get }
}

/// Main PoUW controller that orchestrates verification, signing, storage, and submission
final class PoUWController: PoUWControllerProtocol {
    
    // MARK: - Singleton
    
    static let shared = PoUWController()
    
    // MARK: - Properties
    
    private let verifier: VerifierEngineProtocol
    private let signer: IdentitySignerProtocol
    private let store: ReceiptStoreProtocol
    private let submissionClient: SubmissionClientProtocol
    
    private let queue = DispatchQueue(label: "com.sovereignnetwork.pouw.controller", qos: .userInitiated)
    private let maxBatchSize = 100
    
    /// Whether controller has valid identity
    var isReady: Bool {
        signer.hasIdentity
    }
    
    // MARK: - Initialization
    
    init(
        verifier: VerifierEngineProtocol = VerifierEngine.shared,
        signer: IdentitySignerProtocol = IdentitySigner.shared,
        store: ReceiptStoreProtocol = ReceiptStore.shared,
        submissionClient: SubmissionClientProtocol? = nil
    ) {
        self.verifier = verifier
        self.signer = signer
        self.store = store
        
        // Use provided client or create default
        if let client = submissionClient {
            self.submissionClient = client
        } else {
            self.submissionClient = SubmissionClient(
                config: SubmissionClient.Configuration(
                    nodeUrl: "",
                    challengeEndpoint: "/pouw/challenge",
                    submitEndpoint: "/pouw/submit",
                    timeout: 30.0
                ),
                signer: signer
            )
        }
    }
    
    // MARK: - PoUWControllerProtocol
    
    /// Verify content integrity and create a signed receipt
    /// - Parameters:
    ///   - contentId: The content identifier (CID digest)
    ///   - bytes: The content bytes
    ///   - providerId: Optional provider that served the content
    func verifyAndRecord(contentId: Data, bytes: Data, providerId: Data? = nil) async throws {
        // Check identity
        guard isReady else {
            throw PoUWError.identityNotFound
        }
        
        guard let did = signer.getDid() else {
            throw PoUWError.identityNotFound
        }
        
        guard let clientNodeId = signer.getNodeId() else {
            throw PoUWError.identityNotFound
        }
        
        // Record start time
        let startedAt = UInt64(Date().timeIntervalSince1970)
        
        // 1. Compute task ID (Blake3 hash of content)
        let taskId = computeBlake3(bytes)
        
        // 2. Verify content hash matches CID
        guard verifier.verifyHash(bytes: bytes, cidDigest: contentId) else {
            print("[PoUWController] Content hash verification failed")
            throw PoUWError.verificationFailed
        }
        
        // Record finish time
        let finishedAt = UInt64(Date().timeIntervalSince1970)
        
        // 3. Generate receipt nonce (16 bytes random)
        let nonce = generateSecureRandomBytes(count: 16)
        
        // 4. Sign the receipt
        let signature = try signer.signReceipt(
            taskId: taskId,
            nonce: nonce,
            timestamp: startedAt,
            providerId: providerId
        )
        
        // 5. Build signed receipt data (protobuf format placeholder)
        // In Phase 3 with swift-protobuf, this will be proper protobuf serialization
        let signedReceipt = buildSignedReceipt(
            taskId: taskId,
            nonce: nonce,
            timestamp: startedAt,
            providerId: providerId,
            signature: signature
        )
        
        // 6. Create and save receipt with all required fields per API spec
        let receipt = Receipt(
            receiptNonce: nonce,
            taskId: taskId,
            signedReceiptData: signedReceipt,
            providerId: providerId,
            contentId: contentId,
            clientNodeId: clientNodeId,
            clientDid: did,
            proofType: "hash",
            bytesVerified: bytes.count,
            resultOk: true,
            startedAt: startedAt,
            finishedAt: finishedAt,
            sigScheme: signer.getSignatureScheme(),
            signature: signature,
            state: .queued
        )
        
        try await store.save(receipt: receipt)
        
        print("[PoUWController] Receipt created and queued: \(nonce.hexString)")
    }
    
    /// Flush pending receipts to the server
    /// This will batch receipts and submit them with proper rate limiting
    func flushReceipts() async throws {
        // Check identity
        guard isReady else {
            throw PoUWError.identityNotFound
        }
        
        // Get pending receipts
        let pendingReceipts = try await store.getPendingReceipts(limit: maxBatchSize)
        
        guard !pendingReceipts.isEmpty else {
            print("[PoUWController] No pending receipts to flush")
            throw PoUWError.noPendingReceipts
        }
        
        print("[PoUWController] Flushing \(pendingReceipts.count) receipts")
        
        // Fetch challenge token
        let challenge = try await submissionClient.fetchChallenge(capabilities: ["pouw_v1"])
        
        print("[PoUWController] Challenge acquired, expires at \(challenge.expiresAt)")
        
        // Create batch
        let batch = ReceiptBatch(receipts: pendingReceipts, challengeToken: challenge)
        
        // Mark receipts as submitted
        for receipt in batch.receipts {
            try await store.updateState(receiptNonce: receipt.receiptNonce, state: .submitted, error: nil)
        }
        
        // Submit batch
        let response: SubmissionResponse
        do {
            response = try await submissionClient.submitBatch(batch)
        } catch {
            // Mark receipts for retry on failure
            for receipt in batch.receipts {
                try await store.updateState(
                    receiptNonce: receipt.receiptNonce,
                    state: .retryWait,
                    error: error.localizedDescription
                )
            }
            throw error
        }
        
        // Process response
        print("[PoUWController] Batch submission result: \(response.message)")
        
        // Mark accepted receipts
        for nonce in response.acceptedReceipts {
            try await store.updateState(receiptNonce: nonce, state: .accepted, error: nil)
        }
        
        // Mark rejected receipts with reason
        for nonce in response.rejectedReceipts {
            let reason = response.rejectionReasons[nonce.base64EncodedString()] ?? "Unknown"
            try await store.updateState(receiptNonce: nonce, state: .rejected, error: reason)
        }
        
        print("[PoUWController] Flush complete: \(response.acceptedReceipts.count) accepted, \(response.rejectedReceipts.count) rejected")
    }
    
    /// Get count of pending receipts (queued + retryWait)
    func getPendingCount() async -> Int {
        do {
            return try await store.getPendingCount()
        } catch {
            print("[PoUWController] Failed to get pending count: \(error)")
            return 0
        }
    }
    
    // MARK: - Batch Operations
    
    /// Process multiple content items and create receipts
    func verifyAndRecordBatch(items: [(contentId: Data, bytes: Data, providerId: Data?)]) async throws -> [Result<Void, Error>] {
        return await withTaskGroup(of: (Int, Result<Void, Error>).self) { group in
            for (index, item) in items.enumerated() {
                group.addTask {
                    do {
                        try await self.verifyAndRecord(
                            contentId: item.contentId,
                            bytes: item.bytes,
                            providerId: item.providerId
                        )
                        return (index, .success(()))
                    } catch {
                        return (index, .failure(error))
                    }
                }
            }
            
            var results: [Result<Void, Error>] = Array(repeating: .success(()), count: items.count)
            for await (index, result) in group {
                results[index] = result
            }
            return results
        }
    }
    
    /// Force flush with specific options
    func forceFlush(options: FlushOptions = .default) async throws -> FlushResult {
        let pendingReceipts = try await store.getPendingReceipts(limit: options.maxBatchSize)
        
        guard !pendingReceipts.isEmpty else {
            return FlushResult(submitted: 0, accepted: 0, rejected: 0, errors: ["No pending receipts"])
        }
        
        var result = FlushResult(submitted: 0, accepted: 0, rejected: 0, errors: [])
        
        // Process in batches
        let batches = pendingReceipts.chunked(into: options.maxBatchSize)
        
        for batchReceipts in batches {
            do {
                let challenge = try await submissionClient.fetchChallenge(capabilities: ["pouw_v1"])
                let batch = ReceiptBatch(receipts: batchReceipts, challengeToken: challenge)
                
                // Mark as submitted
                for receipt in batch.receipts {
                    try await store.updateState(receiptNonce: receipt.receiptNonce, state: .submitted, error: nil)
                }
                
                let response = try await submissionClient.submitBatch(batch)
                result.submitted += batchReceipts.count
                result.accepted += response.acceptedReceipts.count
                result.rejected += response.rejectedReceipts.count
                
                // Update states
                for nonce in response.acceptedReceipts {
                    try await store.updateState(receiptNonce: nonce, state: .accepted, error: nil)
                }
                for nonce in response.rejectedReceipts {
                    let reason = response.rejectionReasons[nonce.base64EncodedString()]
                    try await store.updateState(receiptNonce: nonce, state: .rejected, error: reason)
                }
                
            } catch {
                result.errors.append(error.localizedDescription)
                // Mark for retry
                for receipt in batchReceipts {
                    try await store.updateState(
                        receiptNonce: receipt.receiptNonce,
                        state: .retryWait,
                        error: error.localizedDescription
                    )
                }
            }
        }
        
        return result
    }
    
    // MARK: - Maintenance
    
    /// Cleanup old receipts
    func cleanup(olderThanDays: Int = 7) async throws -> Int {
        let cutoffDate = Calendar.current.date(byAdding: .day, value: -olderThanDays, to: Date())!
        return try await store.cleanup(olderThan: cutoffDate)
    }
    
    /// Reset all receipts (for testing)
    func resetAll() async throws {
        try await store.deleteAll()
    }
    
    // MARK: - Private Helpers
    
    /// Compute Blake3 hash
    private func computeBlake3(_ input: Data) -> Data {
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
            // Fallback to SHA-256
            return Data(SHA256.hash(data: input))
        }
        return output
    }
    
    /// Generate cryptographically secure random bytes
    private func generateSecureRandomBytes(count: Int) -> Data {
        var bytes = Data(count: count)
        _ = bytes.withUnsafeMutableBytes {
            SecRandomCopyBytes(kSecRandomDefault, count, $0.baseAddress!)
        }
        return bytes
    }
    
    /// Build signed receipt data
    /// This is a placeholder for protobuf serialization in Phase 3
    private func buildSignedReceipt(
        taskId: Data,
        nonce: Data,
        timestamp: UInt64,
        providerId: Data?,
        signature: Data
    ) -> Data {
        // Current format: JSON with base64 encoded fields
        // Will be replaced with protobuf in Phase 3
        var dict: [String: Any] = [
            "task_id": taskId.base64EncodedString(),
            "nonce": nonce.base64EncodedString(),
            "timestamp": timestamp,
            "signature": signature.base64EncodedString()
        ]
        
        if let provider = providerId {
            dict["provider_id"] = provider.base64EncodedString()
        }
        
        return (try? JSONSerialization.data(withJSONObject: dict)) ?? Data()
    }
}

// MARK: - Flush Options

struct FlushOptions {
    let maxBatchSize: Int
    let retryFailed: Bool
    
    static let `default` = FlushOptions(maxBatchSize: 100, retryFailed: true)
}

// MARK: - Flush Result

struct FlushResult {
    var submitted: Int
    var accepted: Int
    var rejected: Int
    var errors: [String]
}

// MARK: - Extensions

private extension Array {
    func chunked(into size: Int) -> [[Element]] {
        return stride(from: 0, to: count, by: size).map {
            Array(self[$0..<Swift.min($0 + size, count)])
        }
    }
}

private extension Data {
    var hexString: String {
        map { String(format: "%02x", $0) }.joined()
    }
}

// MARK: - Blake3 FFI

@_silgen_name("uhp_blake3")
private func uhp_blake3(
    _ input: UnsafePointer<UInt8>,
    _ inputLen: Int,
    _ output: UnsafeMutablePointer<UInt8>,
    _ outputLen: Int
) -> Int32
