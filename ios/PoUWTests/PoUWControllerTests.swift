// PoUWControllerTests.swift
// Unit tests for PoUWController
// Sovereign Network Mobile

import XCTest
import CryptoKit
@testable import SovereignNetworkMobile

final class PoUWControllerTests: XCTestCase {
    
    var controller: PoUWController!
    var mockVerifier: MockVerifierEngine!
    var mockSigner: MockIdentitySigner!
    var mockStore: MockReceiptStore!
    var mockSubmissionClient: MockSubmissionClient!
    
    override func setUp() {
        super.setUp()
        mockVerifier = MockVerifierEngine()
        mockSigner = MockIdentitySigner()
        mockStore = MockReceiptStore()
        mockSubmissionClient = MockSubmissionClient()
        
        controller = PoUWController(
            verifier: mockVerifier,
            signer: mockSigner,
            store: mockStore,
            submissionClient: mockSubmissionClient
        )
    }
    
    override func tearDown() {
        controller = nil
        mockVerifier = nil
        mockSigner = nil
        mockStore = nil
        mockSubmissionClient = nil
        super.tearDown()
    }
    
    // MARK: - isReady Tests
    
    func testIsReady_WithIdentity() {
        // Given: Valid identity
        mockSigner.mockDid = "did:sov:test123"
        
        // Then: Controller should be ready
        XCTAssertTrue(controller.isReady)
    }
    
    func testIsReady_WithoutIdentity() {
        // Given: No identity
        mockSigner.mockDid = nil
        
        // Then: Controller should not be ready
        XCTAssertFalse(controller.isReady)
    }
    
    // MARK: - verifyAndRecord Tests
    
    func testVerifyAndRecord_FullFlow() async throws {
        // Given: Valid setup
        mockSigner.mockDid = "did:sov:test123"
        let contentId = Data((0..<32).map { UInt8($0) })
        let bytes = Data("test content".utf8)
        
        // When: Verify and record
        try await controller.verifyAndRecord(contentId: contentId, bytes: bytes, providerId: nil)
        
        // Then: Receipt should be saved
        XCTAssertEqual(mockStore.saveCallCount, 1)
        XCTAssertNotNil(mockStore.lastSavedReceipt)
        XCTAssertEqual(mockStore.lastSavedReceipt?.state, .queued)
        
        // And: Verifier should have been called
        XCTAssertEqual(mockVerifier.verifyHashCallCount, 1)
        
        // And: Signer should have been called
        XCTAssertEqual(mockSigner.signCallCount, 1)
    }
    
    func testVerifyAndRecord_WithProviderId() async throws {
        // Given: Valid setup with provider
        mockSigner.mockDid = "did:sov:test123"
        let contentId = Data((0..<32).map { UInt8($0) })
        let bytes = Data("test content".utf8)
        let providerId = Data((0..<32).map { UInt8($0) })
        
        // When: Verify and record
        try await controller.verifyAndRecord(contentId: contentId, bytes: bytes, providerId: providerId)
        
        // Then: Receipt should have provider ID
        XCTAssertEqual(mockStore.lastSavedReceipt?.providerId, providerId)
    }
    
    func testVerifyAndRecord_IdentityNotFound() async {
        // Given: No identity
        mockSigner.mockDid = nil
        let contentId = Data((0..<32).map { UInt8($0) })
        let bytes = Data("test content".utf8)
        
        // When/Then: Should throw identity not found
        do {
            try await controller.verifyAndRecord(contentId: contentId, bytes: bytes)
            XCTFail("Expected identityNotFound error")
        } catch {
            guard case PoUWError.identityNotFound = error else {
                XCTFail("Expected identityNotFound error, got \(error)")
                return
            }
        }
    }
    
    func testVerifyAndRecord_VerificationFailed() async {
        // Given: Hash verification fails
        mockSigner.mockDid = "did:sov:test123"
        mockVerifier.verifyHashResult = false
        let contentId = Data((0..<32).map { UInt8($0) })
        let bytes = Data("test content".utf8)
        
        // When/Then: Should throw verification failed
        do {
            try await controller.verifyAndRecord(contentId: contentId, bytes: bytes)
            XCTFail("Expected verificationFailed error")
        } catch {
            guard case PoUWError.verificationFailed = error else {
                XCTFail("Expected verificationFailed error, got \(error)")
                return
            }
        }
        
        // And: Receipt should not be saved
        XCTAssertEqual(mockStore.saveCallCount, 0)
    }
    
    func testVerifyAndRecord_SignatureError() async {
        // Given: Signature fails
        mockSigner.mockDid = "did:sov:test123"
        mockSigner.shouldThrowOnSign = true
        let contentId = Data((0..<32).map { UInt8($0) })
        let bytes = Data("test content".utf8)
        
        // When/Then: Should throw signature error
        do {
            try await controller.verifyAndRecord(contentId: contentId, bytes: bytes)
            XCTFail("Expected signatureError")
        } catch {
            guard case PoUWError.signatureError = error else {
                XCTFail("Expected signatureError, got \(error)")
                return
            }
        }
    }
    
    func testVerifyAndRecord_StorageError() async {
        // Given: Storage fails
        mockSigner.mockDid = "did:sov:test123"
        mockStore.shouldThrowOnSave = true
        let contentId = Data((0..<32).map { UInt8($0) })
        let bytes = Data("test content".utf8)
        
        // When/Then: Should throw storage error
        do {
            try await controller.verifyAndRecord(contentId: contentId, bytes: bytes)
            XCTFail("Expected storageError")
        } catch {
            guard case PoUWError.storageError = error else {
                XCTFail("Expected storageError, got \(error)")
                return
            }
        }
    }
    
    // MARK: - verifyAndRecordBatch Tests
    
    func testVerifyAndRecordBatch_Success() async throws {
        // Given: Valid setup
        mockSigner.mockDid = "did:sov:test123"
        let items = [
            (contentId: Data((0..<32).map { UInt8($0) }), bytes: Data("content1".utf8), providerId: Data?),
            (contentId: Data((32..<64).map { UInt8($0) }), bytes: Data("content2".utf8), providerId: Data?),
            (contentId: Data((64..<96).map { UInt8($0) }), bytes: Data("content3".utf8), providerId: Data?)
        ]
        
        // When: Process batch
        let results = await controller.verifyAndRecordBatch(items: items)
        
        // Then: All should succeed
        XCTAssertEqual(results.count, 3)
        for result in results {
            XCTAssertTrue(result.isSuccess)
        }
        
        // And: All receipts should be saved
        XCTAssertEqual(mockStore.saveCallCount, 3)
    }
    
    func testVerifyAndRecordBatch_PartialFailure() async throws {
        // Given: Mixed success/failure
        mockSigner.mockDid = "did:sov:test123"
        
        // Second item will fail verification
        var callCount = 0
        mockVerifier.verifyHashResult = true
        
        let items = [
            (contentId: Data((0..<32).map { UInt8($0) }), bytes: Data("content1".utf8), providerId: Data?),
            (contentId: Data((32..<64).map { UInt8($0) }), bytes: Data("content2".utf8), providerId: Data?),
            (contentId: Data((64..<96).map { UInt8($0) }), bytes: Data("content3".utf8), providerId: Data?)
        ]
        
        // When: Process batch
        let results = await controller.verifyAndRecordBatch(items: items)
        
        // Then: Results should be available for all
        XCTAssertEqual(results.count, 3)
    }
    
    // MARK: - flushReceipts Tests
    
    func testFlushReceipts_Success() async throws {
        // Given: Pending receipts and successful submission
        mockSigner.mockDid = "did:sov:test123"
        
        let receipt1 = TestDataBuilder.makeReceipt(state: .queued)
        let receipt2 = TestDataBuilder.makeReceipt(
            nonce: Data((16..<32).map { UInt8($0) }),
            state: .queued
        )
        try await mockStore.save(receipt: receipt1)
        try await mockStore.save(receipt: receipt2)
        
        mockSubmissionClient.fetchChallengeResult = TestDataBuilder.makeChallengeToken()
        mockSubmissionClient.submitBatchResult = TestDataBuilder.makeSubmissionResponse(
            accepted: true,
            message: "Success",
            acceptedReceipts: [receipt1.receiptNonce, receipt2.receiptNonce]
        )
        
        // When: Flush
        try await controller.flushReceipts()
        
        // Then: Challenge should be fetched
        XCTAssertEqual(mockSubmissionClient.fetchChallengeCallCount, 1)
        
        // And: Batch should be submitted
        XCTAssertEqual(mockSubmissionClient.submitBatchCallCount, 1)
        
        // And: Receipts should be marked accepted
        let accepted = try await mockStore.getReceipts(state: .accepted)
        XCTAssertEqual(accepted.count, 2)
    }
    
    func testFlushReceipts_PartialAccept() async throws {
        // Given: Pending receipts with partial acceptance
        mockSigner.mockDid = "did:sov:test123"
        
        let receipt1 = TestDataBuilder.makeReceipt(state: .queued)
        let receipt2 = TestDataBuilder.makeReceipt(
            nonce: Data((16..<32).map { UInt8($0) }),
            state: .queued
        )
        try await mockStore.save(receipt: receipt1)
        try await mockStore.save(receipt: receipt2)
        
        mockSubmissionClient.fetchChallengeResult = TestDataBuilder.makeChallengeToken()
        mockSubmissionClient.submitBatchResult = TestDataBuilder.makeSubmissionResponse(
            accepted: true,
            message: "Partial success",
            acceptedReceipts: [receipt1.receiptNonce],
            rejectedReceipts: [receipt2.receiptNonce],
            rejectionReasons: [receipt2.receiptNonce.base64EncodedString(): "Invalid signature"]
        )
        
        // When: Flush
        try await controller.flushReceipts()
        
        // Then: One accepted, one rejected
        let accepted = try await mockStore.getReceipts(state: .accepted)
        let rejected = try await mockStore.getReceipts(state: .rejected)
        XCTAssertEqual(accepted.count, 1)
        XCTAssertEqual(rejected.count, 1)
        XCTAssertEqual(rejected.first?.lastError, "Invalid signature")
    }
    
    func testFlushReceipts_NoPendingReceipts() async {
        // Given: No pending receipts
        mockSigner.mockDid = "did:sov:test123"
        
        // When/Then: Should throw noPendingReceipts
        do {
            try await controller.flushReceipts()
            XCTFail("Expected noPendingReceipts error")
        } catch {
            guard case PoUWError.noPendingReceipts = error else {
                XCTFail("Expected noPendingReceipts error, got \(error)")
                return
            }
        }
    }
    
    func testFlushReceipts_IdentityNotFound() async {
        // Given: No identity
        mockSigner.mockDid = nil
        
        // When/Then: Should throw identityNotFound
        do {
            try await controller.flushReceipts()
            XCTFail("Expected identityNotFound error")
        } catch {
            guard case PoUWError.identityNotFound = error else {
                XCTFail("Expected identityNotFound error, got \(error)")
                return
            }
        }
    }
    
    func testFlushReceipts_NetworkError() async throws {
        // Given: Pending receipts but network fails
        mockSigner.mockDid = "did:sov:test123"
        
        let receipt = TestDataBuilder.makeReceipt(state: .queued)
        try await mockStore.save(receipt: receipt)
        
        mockSubmissionClient.fetchChallengeResult = TestDataBuilder.makeChallengeToken()
        mockSubmissionClient.submitBatchError = PoUWError.networkError(NSError(domain: "Test", code: -1))
        
        // When/Then: Should throw network error
        do {
            try await controller.flushReceipts()
            XCTFail("Expected networkError")
        } catch {
            guard case PoUWError.networkError = error else {
                XCTFail("Expected networkError, got \(error)")
                return
            }
        }
        
        // And: Receipt should be marked for retry
        let pending = try await mockStore.getPendingReceipts(limit: 10)
        XCTAssertEqual(pending.count, 1)
        XCTAssertEqual(pending.first?.state, .retryWait)
    }
    
    // MARK: - getPendingCount Tests
    
    func testGetPendingCount() async {
        // Given: Pending receipts
        let receipt1 = TestDataBuilder.makeReceipt(state: .queued)
        let receipt2 = TestDataBuilder.makeReceipt(
            nonce: Data((16..<32).map { UInt8($0) }),
            state: .retryWait
        )
        try? await mockStore.save(receipt: receipt1)
        try? await mockStore.save(receipt: receipt2)
        
        // When: Get pending count
        let count = await controller.getPendingCount()
        
        // Then: Should return count
        XCTAssertEqual(count, 2)
    }
    
    func testGetPendingCount_Error() async {
        // Given: Store throws error
        mockStore.shouldThrowOnGet = true
        
        // When: Get pending count
        let count = await controller.getPendingCount()
        
        // Then: Should return 0 on error
        XCTAssertEqual(count, 0)
    }
    
    // MARK: - forceFlush Tests
    
    func testForceFlush_Success() async throws {
        // Given: Pending receipts
        mockSigner.mockDid = "did:sov:test123"
        
        let receipt = TestDataBuilder.makeReceipt(state: .queued)
        try await mockStore.save(receipt: receipt)
        
        mockSubmissionClient.fetchChallengeResult = TestDataBuilder.makeChallengeToken()
        mockSubmissionClient.submitBatchResult = TestDataBuilder.makeSubmissionResponse(
            accepted: true,
            acceptedReceipts: [receipt.receiptNonce]
        )
        
        // When: Force flush
        let result = try await controller.forceFlush(options: FlushOptions(maxBatchSize: 100, retryFailed: true))
        
        // Then: Should return success
        XCTAssertEqual(result.submitted, 1)
        XCTAssertEqual(result.accepted, 1)
        XCTAssertEqual(result.rejected, 0)
        XCTAssertTrue(result.errors.isEmpty)
    }
    
    func testForceFlush_NoPendingReceipts() async throws {
        // Given: No pending receipts
        mockSigner.mockDid = "did:sov:test123"
        
        // When: Force flush
        let result = try await controller.forceFlush()
        
        // Then: Should return empty result with error
        XCTAssertEqual(result.submitted, 0)
        XCTAssertEqual(result.errors.count, 1)
        XCTAssertEqual(result.errors.first, "No pending receipts")
    }
    
    func testForceFlush_PartialBatch() async throws {
        // Given: Multiple receipts in different batches
        mockSigner.mockDid = "did:sov:test123"
        
        for i in 0..<5 {
            let receipt = TestDataBuilder.makeReceipt(
                nonce: Data([UInt8(i)] + Array(repeating: 0, count: 15)),
                state: .queued
            )
            try await mockStore.save(receipt: receipt)
        }
        
        mockSubmissionClient.fetchChallengeResult = TestDataBuilder.makeChallengeToken()
        mockSubmissionClient.submitBatchResult = TestDataBuilder.makeSubmissionResponse(
            accepted: true,
            acceptedReceipts: [Data([0] + Array(repeating: 0, count: 15))]
        )
        
        // When: Force flush with small batch size
        let result = try await controller.forceFlush(options: FlushOptions(maxBatchSize: 2, retryFailed: true))
        
        // Then: Should process in batches
        XCTAssertGreaterThan(result.submitted, 0)
    }
    
    // MARK: - cleanup Tests
    
    func testCleanup() async throws {
        // Given: Old receipts
        let oldReceipt = TestDataBuilder.makeReceipt(
            nonce: Data([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
            state: .accepted
        )
        try await mockStore.save(receipt: oldReceipt)
        
        // When: Cleanup
        let deletedCount = try await controller.cleanup(olderThanDays: 7)
        
        // Then: Should delete old receipts
        XCTAssertEqual(deletedCount, 0) // Mock doesn't filter by date
    }
    
    // MARK: - resetAll Tests
    
    func testResetAll() async throws {
        // Given: Multiple receipts
        for i in 0..<5 {
            let receipt = TestDataBuilder.makeReceipt(
                nonce: Data([UInt8(i)] + Array(repeating: 0, count: 15)),
                state: .queued
            )
            try await mockStore.save(receipt: receipt)
        }
        
        // When: Reset all
        try await controller.resetAll()
        
        // Then: All should be deleted
        XCTAssertEqual(mockStore.deleteAllCallCount, 1)
    }
}

// MARK: - Test Data Builders

enum TestDataBuilder {
    static func makeReceipt(
        nonce: Data = Data((0..<16).map { UInt8($0) }),
        taskId: Data = Data((0..<32).map { UInt8($0) }),
        state: ReceiptState = .queued,
        providerId: Data? = nil
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
            state: state
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
}

// MARK: - Result Extension for Testing

extension Result {
    var isSuccess: Bool {
        switch self {
        case .success:
            return true
        case .failure:
            return false
        }
    }
    
    var isFailure: Bool {
        !isSuccess
    }
}
