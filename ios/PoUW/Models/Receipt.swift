// Receipt.swift
// Proof-of-Useful-Work Receipt Model
// Sovereign Network Mobile

import Foundation

/// Represents a single PoUW receipt for content verification
struct Receipt: Identifiable, Codable {
    /// Unique nonce for this receipt (16 bytes random)
    let receiptNonce: Data
    
    /// Task/content identifier (32 bytes - Blake3 hash of content)
    let taskId: Data
    
    /// Current state of the receipt
    var state: ReceiptState
    
    /// The signed receipt data (protobuf serialized)
    var signedReceiptData: Data
    
    /// Timestamp when receipt was created
    let createdAt: Date
    
    /// Number of submission attempts
    var retryCount: Int
    
    /// Last error message (if any)
    var lastError: String?
    
    /// Provider ID that served the content (if available)
    var providerId: Data?
    
    /// Content ID (CID digest)
    var contentId: Data?
    
    /// Client node ID (32 bytes from identity)
    var clientNodeId: Data?
    
    /// Client DID
    var clientDid: String?
    
    /// Proof type (e.g., "hash", "merkle", "signature")
    var proofType: String
    
    /// Number of bytes verified
    var bytesVerified: Int
    
    /// Whether the verification result was OK
    var resultOk: Bool
    
    /// Start timestamp (Unix seconds)
    var startedAt: UInt64
    
    /// Finish timestamp (Unix seconds)
    var finishedAt: UInt64
    
    /// Signature scheme used (ed25519 or dilithium5)
    var sigScheme: String
    
    /// Signature bytes (separate from signedReceiptData for API format)
    var signature: Data
    
    /// Computed property for Identifiable conformance
    var id: Data { receiptNonce }
    
    /// Initialize a new receipt
    init(
        receiptNonce: Data,
        taskId: Data,
        signedReceiptData: Data,
        providerId: Data? = nil,
        contentId: Data? = nil,
        clientNodeId: Data? = nil,
        clientDid: String? = nil,
        proofType: String = "hash",
        bytesVerified: Int = 0,
        resultOk: Bool = true,
        startedAt: UInt64 = 0,
        finishedAt: UInt64 = 0,
        sigScheme: String = "dilithium5",
        signature: Data = Data(),
        state: ReceiptState = .created,
        createdAt: Date = Date(),
        retryCount: Int = 0,
        lastError: String? = nil
    ) {
        self.receiptNonce = receiptNonce
        self.taskId = taskId
        self.signedReceiptData = signedReceiptData
        self.providerId = providerId
        self.contentId = contentId
        self.clientNodeId = clientNodeId
        self.clientDid = clientDid
        self.proofType = proofType
        self.bytesVerified = bytesVerified
        self.resultOk = resultOk
        self.startedAt = startedAt
        self.finishedAt = finishedAt
        self.sigScheme = sigScheme
        self.signature = signature
        self.state = state
        self.createdAt = createdAt
        self.retryCount = retryCount
        self.lastError = lastError
    }
}

// MARK: - Receipt Batch

/// A batch of receipts for submission
struct ReceiptBatch {
    /// Receipts in this batch
    let receipts: [Receipt]
    
    /// Challenge token for this batch submission
    let challengeToken: ChallengeToken
    
    /// Total count of receipts
    var count: Int { receipts.count }
    
    /// Validate batch constraints
    func validate(maxSize: Int = 100) throws {
        guard receipts.count <= maxSize else {
            throw PoUWError.batchTooLarge(receipts.count)
        }
        
        guard !receipts.isEmpty else {
            throw PoUWError.noPendingReceipts
        }
        
        // Validate all receipts are in pending state
        let invalidReceipts = receipts.filter { !$0.state.isPendingSubmission }
        if !invalidReceipts.isEmpty {
            throw PoUWError.invalidContent
        }
    }
}

// MARK: - Challenge Token

/// Challenge token received from server for batch submission
struct ChallengeToken {
    /// The challenge bytes
    let challenge: Data
    
    /// Challenge expiration timestamp
    let expiresAt: Date
    
    /// Challenge nonce
    let nonce: Data
    
    /// Server signature on challenge
    let serverSignature: Data
    
    /// Verify challenge is still valid
    var isValid: Bool {
        Date() < expiresAt
    }
    
    /// Verify challenge expiration
    func validate() throws {
        guard isValid else {
            throw PoUWError.challengeExpired
        }
    }
}

// MARK: - Submission Response

/// Response from server after batch submission
struct SubmissionResponse {
    /// Whether the batch was accepted (at least one receipt)
    let accepted: Bool
    
    /// Server message
    let message: String
    
    /// Number of accepted receipts
    let acceptedCount: Int
    
    /// Number of rejected receipts
    let rejectedCount: Int
    
    /// Receipt nonces that were accepted
    let acceptedReceipts: [Data]
    
    /// Receipt nonces that were rejected
    let rejectedReceipts: [Data]
    
    /// Error details for rejected receipts
    let rejectionReasons: [String: String]
    
    init(
        accepted: Bool,
        message: String,
        acceptedCount: Int = 0,
        rejectedCount: Int = 0,
        acceptedReceipts: [Data],
        rejectedReceipts: [Data],
        rejectionReasons: [String: String]
    ) {
        self.accepted = accepted
        self.message = message
        self.acceptedCount = acceptedCount
        self.rejectedCount = rejectedCount
        self.acceptedReceipts = acceptedReceipts
        self.rejectedReceipts = rejectedReceipts
        self.rejectionReasons = rejectionReasons
    }
}
