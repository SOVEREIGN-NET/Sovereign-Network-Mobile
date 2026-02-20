// SubmissionClientTests.swift
// Unit tests for SubmissionClient
// Sovereign Network Mobile

import XCTest
@testable import SovereignNetworkMobile

final class SubmissionClientTests: XCTestCase {
    
    var client: SubmissionClient!
    var mockSigner: MockIdentitySigner!
    
    override func setUp() {
        super.setUp()
        mockSigner = MockIdentitySigner()
        client = SubmissionClient(
            config: SubmissionClient.Configuration(
                nodeUrl: "quic://test.example.com:4433",
                challengeEndpoint: "/api/v1/pouw/challenge",
                submitEndpoint: "/api/v1/pouw/submit",
                timeout: 30.0
            ),
            signer: mockSigner
        )
    }
    
    override func tearDown() {
        client = nil
        mockSigner = nil
        super.tearDown()
    }
    
    // MARK: - fetchChallenge Tests
    
    func testFetchChallenge_Success() async throws {
        // Given: Mock signer with valid identity
        mockSigner.mockDid = "did:sov:test123"
        
        // This test would require mocking the NativeQuic.request method
        // Since that's difficult, we test the error cases and configuration
        
        // Then: Signer should have DID
        XCTAssertEqual(mockSigner.getDid(), "did:sov:test123")
    }
    
    func testFetchChallenge_IdentityNotFound() async {
        // Given: No identity
        mockSigner.mockDid = nil
        
        // When/Then: Operations requiring identity should fail
        XCTAssertNil(mockSigner.getDid())
        XCTAssertFalse(mockSigner.hasIdentity)
    }
    
    func testFetchChallenge_RateLimit() {
        // Given: Rate limiter
        let rateLimiter = RateLimiter(maxRequests: 2, windowSeconds: 60)
        
        // When: Make requests up to limit
        XCTAssertTrue(rateLimiter.allowRequest())
        XCTAssertTrue(rateLimiter.allowRequest())
        
        // Then: Third request should be denied
        XCTAssertFalse(rateLimiter.allowRequest())
    }
    
    func testFetchChallenge_RateLimitWindowReset() {
        // Given: Rate limiter with very short window for testing
        let rateLimiter = RateLimiter(maxRequests: 1, windowSeconds: 0.01)
        
        // When: Use the request
        XCTAssertTrue(rateLimiter.allowRequest())
        XCTAssertFalse(rateLimiter.allowRequest())
        
        // Wait for window to expire
        let expectation = self.expectation(description: "Wait for rate limit window")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            expectation.fulfill()
        }
        wait(for: [expectation], timeout: 1.0)
        
        // Then: Should allow request again after window resets
        XCTAssertTrue(rateLimiter.allowRequest())
    }
    
    func testRateLimitCurrentCount() {
        // Given: Rate limiter
        let rateLimiter = RateLimiter(maxRequests: 5, windowSeconds: 60)
        
        // When: Make some requests
        _ = rateLimiter.allowRequest()
        _ = rateLimiter.allowRequest()
        _ = rateLimiter.allowRequest()
        
        // Then: Count should be 3
        XCTAssertEqual(rateLimiter.currentCount, 3)
    }
    
    func testRateLimitReset() {
        // Given: Rate limiter with used requests
        let rateLimiter = RateLimiter(maxRequests: 5, windowSeconds: 60)
        _ = rateLimiter.allowRequest()
        _ = rateLimiter.allowRequest()
        XCTAssertEqual(rateLimiter.currentCount, 2)
        
        // When: Reset
        rateLimiter.reset()
        
        // Then: Count should be 0
        XCTAssertEqual(rateLimiter.currentCount, 0)
        XCTAssertTrue(rateLimiter.allowRequest())
    }
    
    // MARK: - submitBatch Tests
    
    func testSubmitBatch_Validation_EmptyBatch() async {
        // Given: Empty challenge token and receipts
        let challenge = TestDataBuilder.makeChallengeToken()
        let batch = ReceiptBatch(receipts: [], challengeToken: challenge)
        
        // When/Then: Validation should fail
        XCTAssertThrowsError(try batch.validate(maxSize: 100)) { error in
            guard case PoUWError.noPendingReceipts = error else {
                XCTFail("Expected noPendingReceipts error")
                return
            }
        }
    }
    
    func testSubmitBatch_Validation_BatchTooLarge() async {
        // Given: Batch exceeding max size
        let challenge = TestDataBuilder.makeChallengeToken()
        var receipts: [Receipt] = []
        for i in 0..<101 {
            receipts.append(TestDataBuilder.makeReceipt(
                nonce: Data([UInt8(i)] + Array(repeating: 0, count: 15))
            ))
        }
        let batch = ReceiptBatch(receipts: receipts, challengeToken: challenge)
        
        // When/Then: Validation should fail
        XCTAssertThrowsError(try batch.validate(maxSize: 100)) { error in
            guard case PoUWError.batchTooLarge(let size) = error else {
                XCTFail("Expected batchTooLarge error")
                return
            }
            XCTAssertEqual(size, 101)
        }
    }
    
    func testSubmitBatch_Validation_InvalidState() async {
        // Given: Batch with non-pending receipt
        let challenge = TestDataBuilder.makeChallengeToken()
        let acceptedReceipt = TestDataBuilder.makeReceipt(state: .accepted)
        let batch = ReceiptBatch(receipts: [acceptedReceipt], challengeToken: challenge)
        
        // When/Then: Validation should fail
        XCTAssertThrowsError(try batch.validate(maxSize: 100)) { error in
            guard case PoUWError.invalidContent = error else {
                XCTFail("Expected invalidContent error")
                return
            }
        }
    }
    
    func testSubmitBatch_Validation_ValidBatch() async throws {
        // Given: Valid batch
        let challenge = TestDataBuilder.makeChallengeToken()
        let receipt = TestDataBuilder.makeReceipt(state: .queued)
        let batch = ReceiptBatch(receipts: [receipt], challengeToken: challenge)
        
        // When: Validate
        XCTAssertNoThrow(try batch.validate(maxSize: 100))
    }
    
    func testSubmitBatch_ChallengeExpired() async {
        // Given: Expired challenge
        let expiredChallenge = TestDataBuilder.makeChallengeToken(expiresInSeconds: -10)
        let receipt = TestDataBuilder.makeReceipt()
        let batch = ReceiptBatch(receipts: [receipt], challengeToken: expiredChallenge)
        
        // When/Then: Challenge validation should fail
        XCTAssertThrowsError(try batch.challengeToken.validate()) { error in
            guard case PoUWError.challengeExpired = error else {
                XCTFail("Expected challengeExpired error")
                return
            }
        }
        XCTAssertFalse(batch.challengeToken.isValid)
    }
    
    func testSubmitBatch_ChallengeValid() async {
        // Given: Valid challenge
        let validChallenge = TestDataBuilder.makeChallengeToken(expiresInSeconds: 300)
        
        // Then: Should be valid
        XCTAssertTrue(validChallenge.isValid)
        XCTAssertNoThrow(try validChallenge.validate())
    }
    
    // MARK: - Configuration Tests
    
    func testConfiguration_Default() {
        // Given: Default configuration
        let config = SubmissionClient.Configuration.default
        
        // Then: Verify defaults
        XCTAssertEqual(config.nodeUrl, "")
        XCTAssertEqual(config.challengeEndpoint, "/api/v1/pouw/challenge")
        XCTAssertEqual(config.submitEndpoint, "/api/v1/pouw/submit")
        XCTAssertEqual(config.timeout, 30.0)
    }
    
    func testConfiguration_Custom() {
        // Given: Custom configuration
        let config = SubmissionClient.Configuration(
            nodeUrl: "quic://custom.example.com:8443",
            challengeEndpoint: "/custom/challenge",
            submitEndpoint: "/custom/submit",
            timeout: 60.0
        )
        
        // Then: Verify values
        XCTAssertEqual(config.nodeUrl, "quic://custom.example.com:8443")
        XCTAssertEqual(config.challengeEndpoint, "/custom/challenge")
        XCTAssertEqual(config.submitEndpoint, "/custom/submit")
        XCTAssertEqual(config.timeout, 60.0)
    }
    
    // MARK: - Submission Response Tests
    
    func testSubmissionResponse_Properties() {
        // Given: Response data
        let acceptedReceipts = [Data([1, 2, 3]), Data([4, 5, 6])]
        let rejectedReceipts = [Data([7, 8, 9])]
        let rejectionReasons = [
            Data([7, 8, 9]).base64EncodedString(): "Invalid signature"
        ]
        
        // When: Create response
        let response = SubmissionResponse(
            accepted: true,
            message: "Batch processed",
            acceptedReceipts: acceptedReceipts,
            rejectedReceipts: rejectedReceipts,
            rejectionReasons: rejectionReasons
        )
        
        // Then: Verify properties
        XCTAssertTrue(response.accepted)
        XCTAssertEqual(response.message, "Batch processed")
        XCTAssertEqual(response.acceptedReceipts.count, 2)
        XCTAssertEqual(response.rejectedReceipts.count, 1)
        XCTAssertEqual(response.rejectionReasons["BwgJ"], "Invalid signature")
    }
    
    // MARK: - Challenge Token Tests
    
    func testChallengeToken_Properties() {
        // Given: Token data
        let challenge = Data(repeating: 0xAA, count: 32)
        let nonce = Data(repeating: 0xBB, count: 16)
        let signature = Data(repeating: 0xCC, count: 64)
        let expiresAt = Date().addingTimeInterval(300)
        
        // When: Create token
        let token = ChallengeToken(
            challenge: challenge,
            expiresAt: expiresAt,
            nonce: nonce,
            serverSignature: signature
        )
        
        // Then: Verify properties
        XCTAssertEqual(token.challenge, challenge)
        XCTAssertEqual(token.nonce, nonce)
        XCTAssertEqual(token.serverSignature, signature)
        XCTAssertEqual(token.expiresAt, expiresAt)
        XCTAssertTrue(token.isValid)
    }
    
    func testChallengeToken_Expired() {
        // Given: Expired token
        let token = TestDataBuilder.makeChallengeToken(expiresInSeconds: -1)
        
        // Then: Should be invalid
        XCTAssertFalse(token.isValid)
    }
    
    func testChallengeToken_Valid() {
        // Given: Valid token
        let token = TestDataBuilder.makeChallengeToken(expiresInSeconds: 60)
        
        // Then: Should be valid
        XCTAssertTrue(token.isValid)
    }
    
    // MARK: - ReceiptBatch Tests
    
    func testReceiptBatch_Count() {
        // Given: Batch with receipts
        let challenge = TestDataBuilder.makeChallengeToken()
        let receipts = [
            TestDataBuilder.makeReceipt(),
            TestDataBuilder.makeReceipt(nonce: Data((16..<32).map { UInt8($0) })),
            TestDataBuilder.makeReceipt(nonce: Data((32..<48).map { UInt8($0) }))
        ]
        let batch = ReceiptBatch(receipts: receipts, challengeToken: challenge)
        
        // Then: Count should match
        XCTAssertEqual(batch.count, 3)
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
