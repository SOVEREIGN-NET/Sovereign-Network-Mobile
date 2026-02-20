// PoUWErrorTests.swift
// Unit tests for PoUWError enum
// Sovereign Network Mobile

import XCTest
@testable import SovereignNetworkMobile

final class PoUWErrorTests: XCTestCase {
    
    // MARK: - Error Description Tests
    
    func testInvalidContentDescription() {
        let error = PoUWError.invalidContent
        XCTAssertEqual(error.errorDescription, "Invalid content data provided")
    }
    
    func testVerificationFailedDescription() {
        let error = PoUWError.verificationFailed
        XCTAssertEqual(error.errorDescription, "Verification failed - hash, merkle proof, or signature invalid")
    }
    
    func testChallengeExpiredDescription() {
        let error = PoUWError.challengeExpired
        XCTAssertEqual(error.errorDescription, "Challenge token has expired")
    }
    
    func testNetworkErrorDescription() {
        let nsError = NSError(domain: "Test", code: 404, userInfo: [NSLocalizedDescriptionKey: "Not found"])
        let error = PoUWError.networkError(nsError)
        XCTAssertEqual(error.errorDescription, "Network error: Not found")
    }
    
    func testSerializationErrorDescription() {
        let error = PoUWError.serializationError
        XCTAssertEqual(error.errorDescription, "Failed to serialize or deserialize data")
    }
    
    func testStorageErrorDescription() {
        let nsError = NSError(domain: "Test", code: -1, userInfo: [NSLocalizedDescriptionKey: "Disk full"])
        let error = PoUWError.storageError(nsError)
        XCTAssertEqual(error.errorDescription, "Storage error: Disk full")
    }
    
    func testSignatureErrorDescription() {
        let error = PoUWError.signatureError
        XCTAssertEqual(error.errorDescription, "Failed to generate signature")
    }
    
    func testIdentityNotFoundDescription() {
        let error = PoUWError.identityNotFound
        XCTAssertEqual(error.errorDescription, "Identity not found or unavailable")
    }
    
    func testRateLimitExceededDescription() {
        let error = PoUWError.rateLimitExceeded("Too many requests")
        XCTAssertEqual(error.errorDescription, "Rate limit exceeded: Too many requests")
    }
    
    func testBatchTooLargeDescription() {
        let error = PoUWError.batchTooLarge(500)
        XCTAssertEqual(error.errorDescription, "Batch size 500 exceeds maximum allowed")
    }
    
    func testNoPendingReceiptsDescription() {
        let error = PoUWError.noPendingReceipts
        XCTAssertEqual(error.errorDescription, "No pending receipts to submit")
    }
    
    func testServerRejectionDescription() {
        let error = PoUWError.serverRejection("Invalid batch format")
        XCTAssertEqual(error.errorDescription, "Server rejected submission: Invalid batch format")
    }
    
    // MARK: - Recovery Suggestion Tests
    
    func testInvalidContentRecoverySuggestion() {
        let error = PoUWError.invalidContent
        XCTAssertEqual(error.recoverySuggestion, "Ensure content bytes and CID are valid")
    }
    
    func testVerificationFailedRecoverySuggestion() {
        let error = PoUWError.verificationFailed
        XCTAssertEqual(error.recoverySuggestion, "Content may have been tampered with or corrupted")
    }
    
    func testChallengeExpiredRecoverySuggestion() {
        let error = PoUWError.challengeExpired
        XCTAssertEqual(error.recoverySuggestion, "Request a new challenge and retry")
    }
    
    func testNetworkErrorRecoverySuggestion() {
        let error = PoUWError.networkError(NSError(domain: "Test", code: -1))
        XCTAssertEqual(error.recoverySuggestion, "Check network connectivity and retry")
    }
    
    func testSerializationErrorRecoverySuggestion() {
        let error = PoUWError.serializationError
        XCTAssertEqual(error.recoverySuggestion, "Verify data format matches expected protobuf schema")
    }
    
    func testStorageErrorRecoverySuggestion() {
        let error = PoUWError.storageError(NSError(domain: "Test", code: -1))
        XCTAssertEqual(error.recoverySuggestion, "Check device storage availability")
    }
    
    func testSignatureErrorRecoverySuggestion() {
        let error = PoUWError.signatureError
        XCTAssertEqual(error.recoverySuggestion, "Ensure identity is provisioned and accessible")
    }
    
    func testIdentityNotFoundRecoverySuggestion() {
        let error = PoUWError.identityNotFound
        XCTAssertEqual(error.recoverySuggestion, "Provision or restore identity before submitting receipts")
    }
    
    func testRateLimitExceededRecoverySuggestion() {
        let error = PoUWError.rateLimitExceeded("Test")
        XCTAssertEqual(error.recoverySuggestion, "Wait before making additional requests")
    }
    
    func testBatchTooLargeRecoverySuggestion() {
        let error = PoUWError.batchTooLarge(100)
        XCTAssertEqual(error.recoverySuggestion, "Split receipts into smaller batches")
    }
    
    func testNoPendingReceiptsRecoverySuggestion() {
        let error = PoUWError.noPendingReceipts
        XCTAssertEqual(error.recoverySuggestion, "Process content to generate receipts before flushing")
    }
    
    func testServerRejectionRecoverySuggestion() {
        let error = PoUWError.serverRejection("Test")
        XCTAssertEqual(error.recoverySuggestion, "Check receipt validity and retry with corrected data")
    }
    
    // MARK: - LocalizedError Conformance
    
    func testLocalizedErrorConformance() {
        // Given: An array of all error types
        let errors: [PoUWError] = [
            .invalidContent,
            .verificationFailed,
            .challengeExpired,
            .networkError(NSError(domain: "Test", code: -1)),
            .serializationError,
            .storageError(NSError(domain: "Test", code: -1)),
            .signatureError,
            .identityNotFound,
            .rateLimitExceeded("Test"),
            .batchTooLarge(100),
            .noPendingReceipts,
            .serverRejection("Test")
        ]
        
        // Then: All should have non-nil descriptions
        for error in errors {
            XCTAssertNotNil(error.errorDescription, "Error \(error) should have description")
            XCTAssertNotNil(error.recoverySuggestion, "Error \(error) should have recovery suggestion")
        }
    }
    
    // MARK: - Error Equality
    
    func testErrorIdentity() {
        // Given: Same error type
        let error1 = PoUWError.invalidContent
        let error2 = PoUWError.invalidContent
        
        // Then: Should be equal (by case)
        // Note: Swift enums with associated values don't have automatic Equatable
        // unless explicitly declared, so we compare descriptions
        XCTAssertEqual(error1.errorDescription, error2.errorDescription)
    }
    
    func testErrorInequality() {
        // Given: Different error types
        let error1 = PoUWError.invalidContent
        let error2 = PoUWError.verificationFailed
        
        // Then: Descriptions should differ
        XCTAssertNotEqual(error1.errorDescription, error2.errorDescription)
    }
    
    // MARK: - NSError Bridging
    
    func testNSErrorBridging() {
        // Given: A PoUWError
        let originalError = NSError(domain: "Original", code: 123, userInfo: [NSLocalizedDescriptionKey: "Original error"])
        let pouwError = PoUWError.networkError(originalError)
        
        // When: Convert to NSError
        let nsError = pouwError as Error
        
        // Then: Should have proper properties
        XCTAssertNotNil(nsError.localizedDescription)
    }
}
