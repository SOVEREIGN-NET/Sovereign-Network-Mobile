// ReceiptStoreTests.swift
// Unit tests for ReceiptStore
// Sovereign Network Mobile

import XCTest
import CoreData
@testable import SovereignNetworkMobile

final class ReceiptStoreTests: XCTestCase {
    
    var store: MockReceiptStore!
    
    override func setUp() {
        super.setUp()
        // Use mock store for protocol testing
        store = MockReceiptStore()
    }
    
    override func tearDown() {
        store.reset()
        store = nil
        super.tearDown()
    }
    
    // MARK: - Initialization Tests
    
    func testInitialization() {
        // Then: Store should be created successfully
        XCTAssertNotNil(store)
    }
    
    // MARK: - Save and Retrieve Tests
    
    func testEnqueueAndRetrieve() async throws {
        // Given: A receipt
        let receipt = TestReceiptBuilder.makeReceipt(
            nonce: Data([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]),
            taskId: Data((0..<32).map { UInt8($0) }),
            state: .queued
        )
        
        // When: Save receipt
        try await store.save(receipt: receipt)
        
        // Then: Retrieve pending receipts
        let pending = try await store.getPendingReceipts(limit: 10)
        XCTAssertEqual(pending.count, 1)
        XCTAssertEqual(pending.first?.receiptNonce, receipt.receiptNonce)
        XCTAssertEqual(pending.first?.taskId, receipt.taskId)
    }
    
    func testSaveAndGetByState() async throws {
        // Given: Receipts in different states
        let queuedReceipt = TestReceiptBuilder.makeReceipt(state: .queued)
        let acceptedReceipt = TestReceiptBuilder.makeReceipt(
            nonce: Data((16..<32).map { UInt8($0) }),
            state: .accepted
        )
        
        // When: Save both
        try await store.save(receipt: queuedReceipt)
        try await store.save(receipt: acceptedReceipt)
        
        // Then: Get by state
        let queued = try await store.getReceipts(state: .queued)
        let accepted = try await store.getReceipts(state: .accepted)
        
        XCTAssertEqual(queued.count, 1)
        XCTAssertEqual(accepted.count, 1)
        XCTAssertEqual(queued.first?.receiptNonce, queuedReceipt.receiptNonce)
        XCTAssertEqual(accepted.first?.receiptNonce, acceptedReceipt.receiptNonce)
    }
    
    // MARK: - FIFO Ordering Tests
    
    func testFIFOOrdering() async throws {
        // Given: Three receipts created at different times
        let receipt1 = TestReceiptBuilder.makeReceipt(
            nonce: Data([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
            state: .queued,
            createdAt: Date(timeIntervalSince1970: 1000)
        )
        let receipt2 = TestReceiptBuilder.makeReceipt(
            nonce: Data([2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]),
            state: .queued,
            createdAt: Date(timeIntervalSince1970: 2000)
        )
        let receipt3 = TestReceiptBuilder.makeReceipt(
            nonce: Data([3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3]),
            state: .queued,
            createdAt: Date(timeIntervalSince1970: 3000)
        )
        
        // When: Save in reverse order
        try await store.save(receipt: receipt3)
        try await store.save(receipt: receipt2)
        try await store.save(receipt: receipt1)
        
        // Then: Retrieve with limit 2 should respect FIFO
        let pending = try await store.getPendingReceipts(limit: 2)
        XCTAssertEqual(pending.count, 2)
        XCTAssertEqual(pending[0].receiptNonce, receipt1.receiptNonce)
        XCTAssertEqual(pending[1].receiptNonce, receipt2.receiptNonce)
    }
    
    func testFIFOOrderingWithRetryCount() async throws {
        // Given: Receipts with different retry counts
        let highRetry = TestReceiptBuilder.makeReceipt(
            nonce: Data([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
            state: .retryWait,
            createdAt: Date(timeIntervalSince1970: 3000),
            retryCount: 5
        )
        let lowRetry = TestReceiptBuilder.makeReceipt(
            nonce: Data([2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]),
            state: .queued,
            createdAt: Date(timeIntervalSince1970: 1000),
            retryCount: 1
        )
        
        // When: Save receipts
        try await store.save(receipt: highRetry)
        try await store.save(receipt: lowRetry)
        
        // Then: Lower retry count should come first
        let pending = try await store.getPendingReceipts(limit: 10)
        XCTAssertEqual(pending.count, 2)
        XCTAssertEqual(pending[0].receiptNonce, lowRetry.receiptNonce)
        XCTAssertEqual(pending[1].receiptNonce, highRetry.receiptNonce)
    }
    
    // MARK: - State Update Tests
    
    func testMarkAccepted() async throws {
        // Given: A queued receipt
        let receipt = TestReceiptBuilder.makeReceipt(state: .queued)
        try await store.save(receipt: receipt)
        
        // When: Mark as accepted
        try await store.updateState(receiptNonce: receipt.receiptNonce, state: .accepted, error: nil)
        
        // Then: Should not be in pending
        let pending = try await store.getPendingReceipts(limit: 10)
        XCTAssertEqual(pending.count, 0)
        
        // And: Should be in accepted
        let accepted = try await store.getReceipts(state: .accepted)
        XCTAssertEqual(accepted.count, 1)
        XCTAssertEqual(accepted.first?.receiptNonce, receipt.receiptNonce)
    }
    
    func testMarkRejected() async throws {
        // Given: A queued receipt
        let receipt = TestReceiptBuilder.makeReceipt(state: .queued)
        try await store.save(receipt: receipt)
        let rejectionReason = "Invalid signature"
        
        // When: Mark as rejected
        try await store.updateState(receiptNonce: receipt.receiptNonce, state: .rejected, error: rejectionReason)
        
        // Then: Should not be in pending
        let pending = try await store.getPendingReceipts(limit: 10)
        XCTAssertEqual(pending.count, 0)
        
        // And: Should be in rejected with reason
        let rejected = try await store.getReceipts(state: .rejected)
        XCTAssertEqual(rejected.count, 1)
        XCTAssertEqual(rejected.first?.lastError, rejectionReason)
    }
    
    func testMarkSubmittedIncrementsRetryCount() async throws {
        // Given: A queued receipt
        let receipt = TestReceiptBuilder.makeReceipt(state: .queued, retryCount: 0)
        try await store.save(receipt: receipt)
        
        // When: Mark as submitted
        try await store.updateState(receiptNonce: receipt.receiptNonce, state: .submitted, error: nil)
        
        // Then: Retry count should increment
        let submitted = try await store.getReceipts(state: .submitted)
        XCTAssertEqual(submitted.first?.retryCount, 1)
    }
    
    func testUpdateMultipleStates() async throws {
        // Given: Multiple receipts
        let receipt1 = TestReceiptBuilder.makeReceipt(
            nonce: Data([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
            state: .queued
        )
        let receipt2 = TestReceiptBuilder.makeReceipt(
            nonce: Data([2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]),
            state: .queued
        )
        try await store.save(receipt: receipt1)
        try await store.save(receipt: receipt2)
        
        // When: Update both to accepted
        try await store.updateStates(receiptNonces: [receipt1.receiptNonce, receipt2.receiptNonce], state: .accepted)
        
        // Then: Both should be accepted
        let accepted = try await store.getReceipts(state: .accepted)
        XCTAssertEqual(accepted.count, 2)
    }
    
    // MARK: - Deduplication Tests
    
    func testDeduplication() async throws {
        // Given: Two receipts with same nonce but different content
        let nonce = Data([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])
        let receipt1 = TestReceiptBuilder.makeReceipt(
            nonce: nonce,
            taskId: Data((0..<32).map { UInt8($0) }),
            state: .queued
        )
        let receipt2 = TestReceiptBuilder.makeReceipt(
            nonce: nonce,
            taskId: Data((32..<64).map { UInt8($0) }), // Different taskId
            state: .queued
        )
        
        // When: Save both (mock overwrites with same nonce)
        try await store.save(receipt: receipt1)
        try await store.save(receipt: receipt2)
        
        // Then: Only one should be stored (second overwrites first)
        let queued = try await store.getReceipts(state: .queued)
        XCTAssertEqual(queued.count, 1)
        // The second save should have overwritten
        XCTAssertEqual(queued.first?.taskId, receipt2.taskId)
    }
    
    // MARK: - Count Tests
    
    func testCountByState() async throws {
        // Given: Multiple receipts in different states
        for i in 0..<5 {
            let receipt = TestReceiptBuilder.makeReceipt(
                nonce: Data([UInt8(i), 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]),
                state: .queued
            )
            try await store.save(receipt: receipt)
        }
        for i in 5..<10 {
            let receipt = TestReceiptBuilder.makeReceipt(
                nonce: Data([UInt8(i), 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]),
                state: .accepted
            )
            try await store.save(receipt: receipt)
        }
        
        // When: Get counts
        let queuedCount = try await store.count(state: .queued)
        let acceptedCount = try await store.count(state: .accepted)
        
        // Then: Counts should match
        XCTAssertEqual(queuedCount, 5)
        XCTAssertEqual(acceptedCount, 5)
    }
    
    func testGetPendingCount() async throws {
        // Given: Mixed state receipts
        let queued = TestReceiptBuilder.makeReceipt(
            nonce: Data([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
            state: .queued
        )
        let retryWait = TestReceiptBuilder.makeReceipt(
            nonce: Data([2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]),
            state: .retryWait
        )
        let submitted = TestReceiptBuilder.makeReceipt(
            nonce: Data([3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3]),
            state: .submitted
        )
        
        try await store.save(receipt: queued)
        try await store.save(receipt: retryWait)
        try await store.save(receipt: submitted)
        
        // When: Get pending count
        let pendingCount = try await store.getPendingCount()
        
        // Then: Should count queued and retryWait only
        XCTAssertEqual(pendingCount, 2)
    }
    
    // MARK: - Limit Tests
    
    func testGetPendingReceiptsLimit() async throws {
        // Given: More receipts than limit
        for i in 0..<10 {
            let receipt = TestReceiptBuilder.makeReceipt(
                nonce: Data([UInt8(i), 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]),
                state: .queued,
                createdAt: Date(timeIntervalSince1970: TimeInterval(1000 + i))
            )
            try await store.save(receipt: receipt)
        }
        
        // When: Get with limit 3
        let pending = try await store.getPendingReceipts(limit: 3)
        
        // Then: Should respect limit
        XCTAssertEqual(pending.count, 3)
        // And: Should get oldest first
        XCTAssertEqual(pending[0].receiptNonce[0], 0)
        XCTAssertEqual(pending[1].receiptNonce[0], 1)
        XCTAssertEqual(pending[2].receiptNonce[0], 2)
    }
    
    // MARK: - Cleanup Tests
    
    func testCleanupOldReceipts() async throws {
        // Given: Old and new receipts
        let oldDate = Date(timeIntervalSince1970: 1000)
        let newDate = Date()
        
        let oldReceipt = TestReceiptBuilder.makeReceipt(
            nonce: Data([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
            state: .accepted,
            createdAt: oldDate
        )
        let newReceipt = TestReceiptBuilder.makeReceipt(
            nonce: Data([2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]),
            state: .accepted,
            createdAt: newDate
        )
        
        try await store.save(receipt: oldReceipt)
        try await store.save(receipt: newReceipt)
        
        // When: Cleanup older than 1 hour ago
        let cutoffDate = Date().addingTimeInterval(-3600)
        let deletedCount = try await store.cleanup(olderThan: cutoffDate)
        
        // Then: Old receipt should be deleted
        XCTAssertEqual(deletedCount, 1)
        let remaining = try await store.getReceipts(state: .accepted)
        XCTAssertEqual(remaining.count, 1)
        XCTAssertEqual(remaining.first?.receiptNonce, newReceipt.receiptNonce)
    }
    
    func testCleanupOnlyTerminalStates() async throws {
        // Given: Receipts in different states
        let oldDate = Date(timeIntervalSince1970: 1000)
        
        let oldAccepted = TestReceiptBuilder.makeReceipt(
            nonce: Data([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
            state: .accepted,
            createdAt: oldDate
        )
        let oldQueued = TestReceiptBuilder.makeReceipt(
            nonce: Data([2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]),
            state: .queued,
            createdAt: oldDate
        )
        
        try await store.save(receipt: oldAccepted)
        try await store.save(receipt: oldQueued)
        
        // When: Cleanup
        let cutoffDate = Date().addingTimeInterval(-3600)
        let deletedCount = try await store.cleanup(olderThan: cutoffDate)
        
        // Then: Only accepted should be deleted
        XCTAssertEqual(deletedCount, 1)
        let queued = try await store.getReceipts(state: .queued)
        XCTAssertEqual(queued.count, 1) // queued receipt remains
    }
    
    // MARK: - Delete All Tests
    
    func testDeleteAll() async throws {
        // Given: Multiple receipts
        for i in 0..<5 {
            let receipt = TestReceiptBuilder.makeReceipt(
                nonce: Data([UInt8(i), 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]),
                state: .queued
            )
            try await store.save(receipt: receipt)
        }
        
        // When: Delete all
        try await store.deleteAll()
        
        // Then: All should be gone
        let queued = try await store.getReceipts(state: .queued)
        let accepted = try await store.getReceipts(state: .accepted)
        XCTAssertEqual(queued.count, 0)
        XCTAssertEqual(accepted.count, 0)
    }
    
    // MARK: - Error Handling Tests
    
    func testSaveThrowsError() async {
        // Given: Store configured to throw
        store.shouldThrowOnSave = true
        let receipt = TestReceiptBuilder.makeReceipt()
        
        // When/Then: Save should throw
        do {
            try await store.save(receipt: receipt)
            XCTFail("Expected error to be thrown")
        } catch {
            XCTAssertTrue(error is PoUWError)
        }
    }
    
    func testGetReceiptsThrowsError() async {
        // Given: Store configured to throw
        store.shouldThrowOnGet = true
        
        // When/Then: Get should throw
        do {
            _ = try await store.getReceipts(state: .queued)
            XCTFail("Expected error to be thrown")
        } catch {
            XCTAssertTrue(error is PoUWError)
        }
    }
    
    // MARK: - Persistence Tests
    
    func testPersistence() async throws {
        // Given: A receipt with all fields
        let receipt = TestReceiptBuilder.makeReceipt(
            nonce: Data([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]),
            taskId: Data((0..<32).map { UInt8($0) }),
            state: .queued,
            providerId: Data((0..<32).map { UInt8($0) }),
            retryCount: 3,
            lastError: "Previous error"
        )
        
        // When: Save
        try await store.save(receipt: receipt)
        
        // Then: Retrieve and verify all fields
        let retrieved = try await store.getPendingReceipts(limit: 1)
        XCTAssertEqual(retrieved.count, 1)
        XCTAssertEqual(retrieved[0].receiptNonce, receipt.receiptNonce)
        XCTAssertEqual(retrieved[0].taskId, receipt.taskId)
        XCTAssertEqual(retrieved[0].state, receipt.state)
        XCTAssertEqual(retrieved[0].retryCount, receipt.retryCount)
        XCTAssertEqual(retrieved[0].lastError, receipt.lastError)
        XCTAssertEqual(retrieved[0].providerId, receipt.providerId)
    }
    
    // MARK: - Receipt Properties Tests
    
    func testReceiptProperties() {
        // Given: A receipt with all properties
        let nonce = Data((0..<16).map { UInt8($0) })
        let taskId = Data((0..<32).map { UInt8($0) })
        let providerId = Data((0..<32).map { UInt8($0) })
        let signedData = Data("signed".utf8)
        let createdAt = Date(timeIntervalSince1970: 1000)
        
        let receipt = Receipt(
            receiptNonce: nonce,
            taskId: taskId,
            signedReceiptData: signedData,
            providerId: providerId,
            state: .accepted,
            createdAt: createdAt,
            retryCount: 5,
            lastError: "Test error"
        )
        
        // Then: Verify properties
        XCTAssertEqual(receipt.id, nonce) // Identifiable conformance
        XCTAssertEqual(receipt.receiptNonce, nonce)
        XCTAssertEqual(receipt.taskId, taskId)
        XCTAssertEqual(receipt.signedReceiptData, signedData)
        XCTAssertEqual(receipt.providerId, providerId)
        XCTAssertEqual(receipt.state, .accepted)
        XCTAssertEqual(receipt.createdAt, createdAt)
        XCTAssertEqual(receipt.retryCount, 5)
        XCTAssertEqual(receipt.lastError, "Test error")
    }
}

// MARK: - Test Helpers

enum TestReceiptBuilder {
    static func makeReceipt(
        nonce: Data = Data((0..<16).map { UInt8($0) }),
        taskId: Data = Data((0..<32).map { UInt8($0) }),
        state: ReceiptState = .queued,
        providerId: Data? = nil,
        createdAt: Date = Date(),
        retryCount: Int = 0,
        lastError: String? = nil
    ) -> Receipt {
        let signedData: [String: Any] = [
            "task_id": taskId.base64EncodedString(),
            "nonce": nonce.base64EncodedString(),
            "timestamp": UInt64(createdAt.timeIntervalSince1970 * 1000),
            "signature": Data(repeating: 0xAA, count: 100).base64EncodedString()
        ]
        let signedReceiptData = (try? JSONSerialization.data(withJSONObject: signedData)) ?? Data()
        
        return Receipt(
            receiptNonce: nonce,
            taskId: taskId,
            signedReceiptData: signedReceiptData,
            providerId: providerId,
            state: state,
            createdAt: createdAt,
            retryCount: retryCount,
            lastError: lastError
        )
    }
}
