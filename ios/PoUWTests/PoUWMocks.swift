// PoUWMocks.swift
// Mock classes for PoUW testing
// Sovereign Network Mobile

import Foundation
import CryptoKit
@testable import SovereignNetworkMobile

// MARK: - Mock VerifierEngine

/// Mock implementation of VerifierEngine for testing
final class MockVerifierEngine: VerifierEngineProtocol {
    
    var verifyHashResult: Bool = true
    var verifyMerkleResult: Bool = true
    var verifySignatureResult: Bool = true
    
    var verifyHashCallCount = 0
    var verifyMerkleCallCount = 0
    var verifySignatureCallCount = 0
    
    var lastVerifyHashBytes: Data?
    var lastVerifyHashCidDigest: Data?
    var lastVerifyMerkleLeaf: Data?
    var lastVerifyMerkleRoot: Data?
    var lastVerifyMerkleProof: Data?
    var lastVerifySignatureMessage: Data?
    var lastVerifySignatureSignature: Data?
    var lastVerifySignaturePublicKey: Data?
    
    func verifyHash(bytes: Data, cidDigest: Data) -> Bool {
        verifyHashCallCount += 1
        lastVerifyHashBytes = bytes
        lastVerifyHashCidDigest = cidDigest
        return verifyHashResult
    }
    
    func verifyMerkle(leaf: Data, root: Data, proofDigest: Data) -> Bool {
        verifyMerkleCallCount += 1
        lastVerifyMerkleLeaf = leaf
        lastVerifyMerkleRoot = root
        lastVerifyMerkleProof = proofDigest
        return verifyMerkleResult
    }
    
    func verifySignature(message: Data, signature: Data, publicKey: Data) -> Bool {
        verifySignatureCallCount += 1
        lastVerifySignatureMessage = message
        lastVerifySignatureSignature = signature
        lastVerifySignaturePublicKey = publicKey
        return verifySignatureResult
    }
    
    func reset() {
        verifyHashResult = true
        verifyMerkleResult = true
        verifySignatureResult = true
        verifyHashCallCount = 0
        verifyMerkleCallCount = 0
        verifySignatureCallCount = 0
        lastVerifyHashBytes = nil
        lastVerifyHashCidDigest = nil
        lastVerifyMerkleLeaf = nil
        lastVerifyMerkleRoot = nil
        lastVerifyMerkleProof = nil
        lastVerifySignatureMessage = nil
        lastVerifySignatureSignature = nil
        lastVerifySignaturePublicKey = nil
    }
}

// MARK: - Mock IdentitySigner

/// Mock implementation of IdentitySigner for testing
final class MockIdentitySigner: IdentitySignerProtocol {
    
    var mockDid: String? = "did:sov:test123"
    var mockNodeId: Data? = Data(repeating: 0xAB, count: 32)
    var mockPublicKey: Data? = Data(repeating: 0xCD, count: 2592) // Dilithium5 public key size
    var mockSignature: Data = Data(repeating: 0xEF, count: 4595) // Dilithium5 signature size
    
    var shouldThrowOnSign = false
    var signCallCount = 0
    var lastSignBytes: Data?
    
    var hasIdentity: Bool {
        mockDid != nil
    }
    
    func getDid() -> String? {
        mockDid
    }
    
    func getNodeId() -> Data? {
        mockNodeId
    }
    
    func getPublicKey() -> Data? {
        mockPublicKey
    }
    
    func sign(bytes: Data) throws -> Data {
        signCallCount += 1
        lastSignBytes = bytes
        if shouldThrowOnSign {
            throw PoUWError.signatureError
        }
        return mockSignature
    }
    
    func signReceipt(
        taskId: Data,
        nonce: Data,
        timestamp: UInt64,
        providerId: Data? = nil
    ) throws -> Data {
        var message = Data()
        message.append(taskId)
        message.append(nonce)
        message.append(contentsOf: timestamp.bigEndian.bytes)
        if let provider = providerId {
            message.append(provider)
        }
        return try sign(bytes: message)
    }
    
    func reset() {
        mockDid = "did:sov:test123"
        mockNodeId = Data(repeating: 0xAB, count: 32)
        mockPublicKey = Data(repeating: 0xCD, count: 2592)
        mockSignature = Data(repeating: 0xEF, count: 4595)
        shouldThrowOnSign = false
        signCallCount = 0
        lastSignBytes = nil
    }
}

// MARK: - Mock ReceiptStore

/// Mock implementation of ReceiptStore for testing
final class MockReceiptStore: ReceiptStoreProtocol {
    
    private var receipts: [Data: Receipt] = [:] // Keyed by receiptNonce
    private var accessQueue = DispatchQueue(label: "com.test.mockReceiptStore")
    
    var saveCallCount = 0
    var getReceiptsCallCount = 0
    var updateStateCallCount = 0
    var deleteAllCallCount = 0
    
    var shouldThrowOnSave = false
    var shouldThrowOnGet = false
    var lastSavedReceipt: Receipt?
    
    func save(receipt: Receipt) async throws {
        saveCallCount += 1
        lastSavedReceipt = receipt
        
        if shouldThrowOnSave {
            throw PoUWError.storageError(NSError(domain: "Mock", code: -1))
        }
        
        accessQueue.sync {
            receipts[receipt.receiptNonce] = receipt
        }
    }
    
    func getReceipts(state: ReceiptState) async throws -> [Receipt] {
        getReceiptsCallCount += 1
        
        if shouldThrowOnGet {
            throw PoUWError.storageError(NSError(domain: "Mock", code: -1))
        }
        
        return accessQueue.sync {
            receipts.values.filter { $0.state == state }
                .sorted { $0.createdAt < $1.createdAt }
        }
    }
    
    func getPendingReceipts(limit: Int = 100) async throws -> [Receipt] {
        getReceiptsCallCount += 1
        
        if shouldThrowOnGet {
            throw PoUWError.storageError(NSError(domain: "Mock", code: -1))
        }
        
        return accessQueue.sync {
            receipts.values
                .filter { $0.state == .queued || $0.state == .retryWait }
                .sorted { ($0.retryCount, $0.createdAt) < ($1.retryCount, $1.createdAt) }
                .prefix(limit)
                .map { $0 }
        }
    }
    
    func updateState(receiptNonce: Data, state: ReceiptState, error: String?) async throws {
        updateStateCallCount += 1
        
        accessQueue.sync {
            if var receipt = receipts[receiptNonce] {
                receipt.state = state
                receipt.lastError = error
                if state == .submitted {
                    receipt.retryCount += 1
                }
                receipts[receiptNonce] = receipt
            }
        }
    }
    
    func updateStates(receiptNonces: [Data], state: ReceiptState) async throws {
        for nonce in receiptNonces {
            try await updateState(receiptNonce: nonce, state: state, error: nil)
        }
    }
    
    func count(state: ReceiptState) async throws -> Int {
        accessQueue.sync {
            receipts.values.filter { $0.state == state }.count
        }
    }
    
    func getPendingCount() async throws -> Int {
        accessQueue.sync {
            receipts.values.filter { $0.state == .queued || $0.state == .retryWait }.count
        }
    }
    
    func cleanup(olderThan: Date) async throws -> Int {
        accessQueue.sync {
            let toDelete = receipts.filter { _, receipt in
                (receipt.state == .accepted || receipt.state == .rejected) && receipt.createdAt < olderThan
            }
            toDelete.keys.forEach { receipts.removeValue(forKey: $0) }
            return toDelete.count
        }
    }
    
    func deleteAll() async throws {
        deleteAllCallCount += 1
        accessQueue.sync {
            receipts.removeAll()
        }
    }
    
    // Test helpers
    func getReceipt(nonce: Data) -> Receipt? {
        accessQueue.sync {
            receipts[nonce]
        }
    }
    
    func getAllReceipts() -> [Receipt] {
        accessQueue.sync {
            Array(receipts.values)
        }
    }
    
    func reset() {
        accessQueue.sync {
            receipts.removeAll()
        }
        saveCallCount = 0
        getReceiptsCallCount = 0
        updateStateCallCount = 0
        deleteAllCallCount = 0
        shouldThrowOnSave = false
        shouldThrowOnGet = false
        lastSavedReceipt = nil
    }
}

// MARK: - Mock SubmissionClient

/// Mock implementation of SubmissionClient for testing
final class MockSubmissionClient: SubmissionClientProtocol {
    
    var fetchChallengeResult: ChallengeToken?
    var fetchChallengeError: Error?
    var fetchChallengeCallCount = 0
    var lastFetchChallengeCapabilities: [String]?
    
    var submitBatchResult: SubmissionResponse?
    var submitBatchError: Error?
    var submitBatchCallCount = 0
    var lastSubmitBatch: ReceiptBatch?
    
    var rateLimitEnabled = false
    private var challengeRequestCount = 0
    private var submitRequestCount = 0
    private let maxRequests = 50
    
    func fetchChallenge(capabilities: [String]) async throws -> ChallengeToken {
        fetchChallengeCallCount += 1
        lastFetchChallengeCapabilities = capabilities
        
        if rateLimitEnabled {
            challengeRequestCount += 1
            if challengeRequestCount > maxRequests {
                throw PoUWError.rateLimitExceeded("Challenge requests limited to 50 per 60 seconds")
            }
        }
        
        if let error = fetchChallengeError {
            throw error
        }
        
        guard let result = fetchChallengeResult else {
            throw PoUWError.networkError(NSError(domain: "Mock", code: -1))
        }
        
        return result
    }
    
    func submitBatch(_ batch: ReceiptBatch) async throws -> SubmissionResponse {
        submitBatchCallCount += 1
        lastSubmitBatch = batch
        
        if rateLimitEnabled {
            submitRequestCount += 1
            if submitRequestCount > maxRequests {
                throw PoUWError.rateLimitExceeded("Submit requests limited to 50 per 60 seconds")
            }
        }
        
        if let error = submitBatchError {
            throw error
        }
        
        guard let result = submitBatchResult else {
            throw PoUWError.networkError(NSError(domain: "Mock", code: -1))
        }
        
        return result
    }
    
    func reset() {
        fetchChallengeResult = nil
        fetchChallengeError = nil
        fetchChallengeCallCount = 0
        lastFetchChallengeCapabilities = nil
        submitBatchResult = nil
        submitBatchError = nil
        submitBatchCallCount = 0
        lastSubmitBatch = nil
        rateLimitEnabled = false
        challengeRequestCount = 0
        submitRequestCount = 0
    }
}

// MARK: - Mock Native QUIC

/// Mock for NativeQuic module
final class MockNativeQuic {
    
    var mockResponse: [String: Any]?
    var mockError: (code: String, message: String, error: Error?)?
    var requestCallCount = 0
    var lastRequestUrl: String?
    var lastRequestOptions: NSDictionary?
    
    func request(
        _ url: String,
        options: NSDictionary,
        resolve: @escaping (Any?) -> Void,
        reject: @escaping (String?, String?, Error?) -> Void
    ) {
        requestCallCount += 1
        lastRequestUrl = url
        lastRequestOptions = options
        
        if let errorInfo = mockError {
            reject(errorInfo.code, errorInfo.message, errorInfo.error)
        } else if let response = mockResponse {
            resolve(response)
        } else {
            reject("NO_MOCK", "No mock response configured", nil)
        }
    }
    
    func reset() {
        mockResponse = nil
        mockError = nil
        requestCallCount = 0
        lastRequestUrl = nil
        lastRequestOptions = nil
    }
}

// MARK: - Helper Extensions

private extension UInt64 {
    var bytes: [UInt8] {
        withUnsafeBytes(of: self.bigEndian, Array.init)
    }
}

// MARK: - Test Data Builders

enum TestDataBuilder {
    
    static func makeReceipt(
        nonce: Data = Data((0..<16).map { UInt8($0) }),
        taskId: Data = Data((0..<32).map { UInt8($0) }),
        state: ReceiptState = .queued,
        providerId: Data? = nil,
        retryCount: Int = 0,
        lastError: String? = nil
    ) -> Receipt {
        let signedData: [String: Any] = [
            "task_id": taskId.base64EncodedString(),
            "nonce": nonce.base64EncodedString(),
            "timestamp": UInt64(Date().timeIntervalSince1970 * 1000),
            "signature": Data(repeating: 0xAA, count: 100).base64EncodedString()
        ]
        let signedReceiptData = (try? JSONSerialization.data(withJSONObject: signedData)) ?? Data()
        
        return Receipt(
            receiptNonce: nonce,
            taskId: taskId,
            signedReceiptData: signedReceiptData,
            providerId: providerId,
            state: state,
            retryCount: retryCount,
            lastError: lastError
        )
    }
    
    static func makeChallengeToken(
        challenge: Data = Data(repeating: 0xBB, count: 32),
        expiresInSeconds: TimeInterval = 300,
        nonce: Data = Data(repeating: 0xCC, count: 16),
        serverSignature: Data = Data(repeating: 0xDD, count: 64)
    ) -> ChallengeToken {
        ChallengeToken(
            challenge: challenge,
            expiresAt: Date().addingTimeInterval(expiresInSeconds),
            nonce: nonce,
            serverSignature: serverSignature
        )
    }
    
    static func makeSubmissionResponse(
        accepted: Bool = true,
        message: String = "Success",
        acceptedReceipts: [Data] = [],
        rejectedReceipts: [Data] = [],
        rejectionReasons: [String: String] = [:]
    ) -> SubmissionResponse {
        SubmissionResponse(
            accepted: accepted,
            message: message,
            acceptedReceipts: acceptedReceipts,
            rejectedReceipts: rejectedReceipts,
            rejectionReasons: rejectionReasons
        )
    }
    
    /// Compute a deterministic hash for testing
    static func computeTestHash(_ data: Data) -> Data {
        // Use SHA-256 for test determinism (Blake3 requires FFI)
        return Data(SHA256.hash(data: data))
    }
}
