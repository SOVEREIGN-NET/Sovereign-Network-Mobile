// ReceiptStateTests.swift
// Unit tests for ReceiptState enum
// Sovereign Network Mobile

import XCTest
@testable import SovereignNetworkMobile

final class ReceiptStateTests: XCTestCase {
    
    // MARK: - Raw Value Tests
    
    func testRawValues() {
        XCTAssertEqual(ReceiptState.created.rawValue, "created")
        XCTAssertEqual(ReceiptState.queued.rawValue, "queued")
        XCTAssertEqual(ReceiptState.submitted.rawValue, "submitted")
        XCTAssertEqual(ReceiptState.accepted.rawValue, "accepted")
        XCTAssertEqual(ReceiptState.rejected.rawValue, "rejected")
        XCTAssertEqual(ReceiptState.retryWait.rawValue, "retryWait")
    }
    
    func testCaseIterable() {
        // Given: All cases
        let allCases = ReceiptState.allCases
        
        // Then: Should have all 6 cases
        XCTAssertEqual(allCases.count, 6)
        XCTAssertTrue(allCases.contains(.created))
        XCTAssertTrue(allCases.contains(.queued))
        XCTAssertTrue(allCases.contains(.submitted))
        XCTAssertTrue(allCases.contains(.accepted))
        XCTAssertTrue(allCases.contains(.rejected))
        XCTAssertTrue(allCases.contains(.retryWait))
    }
    
    func testInitFromRawValue() {
        // When: Initialize from valid raw values
        let created = ReceiptState(rawValue: "created")
        let queued = ReceiptState(rawValue: "queued")
        let submitted = ReceiptState(rawValue: "submitted")
        let accepted = ReceiptState(rawValue: "accepted")
        let rejected = ReceiptState(rawValue: "rejected")
        let retryWait = ReceiptState(rawValue: "retryWait")
        
        // Then: Should succeed
        XCTAssertEqual(created, .created)
        XCTAssertEqual(queued, .queued)
        XCTAssertEqual(submitted, .submitted)
        XCTAssertEqual(accepted, .accepted)
        XCTAssertEqual(rejected, .rejected)
        XCTAssertEqual(retryWait, .retryWait)
    }
    
    func testInitFromInvalidRawValue() {
        // When: Initialize from invalid raw value
        let invalid = ReceiptState(rawValue: "invalid")
        
        // Then: Should return nil
        XCTAssertNil(invalid)
    }
    
    // MARK: - isTerminal Tests
    
    func testIsTerminal_True() {
        // Then: Terminal states
        XCTAssertTrue(ReceiptState.accepted.isTerminal)
        XCTAssertTrue(ReceiptState.rejected.isTerminal)
    }
    
    func testIsTerminal_False() {
        // Then: Non-terminal states
        XCTAssertFalse(ReceiptState.created.isTerminal)
        XCTAssertFalse(ReceiptState.queued.isTerminal)
        XCTAssertFalse(ReceiptState.submitted.isTerminal)
        XCTAssertFalse(ReceiptState.retryWait.isTerminal)
    }
    
    // MARK: - canRetry Tests
    
    func testCanRetry_True() {
        // Then: States that can retry
        XCTAssertTrue(ReceiptState.rejected.canRetry)
        XCTAssertTrue(ReceiptState.retryWait.canRetry)
    }
    
    func testCanRetry_False() {
        // Then: States that cannot retry
        XCTAssertFalse(ReceiptState.created.canRetry)
        XCTAssertFalse(ReceiptState.queued.canRetry)
        XCTAssertFalse(ReceiptState.submitted.canRetry)
        XCTAssertFalse(ReceiptState.accepted.canRetry)
    }
    
    // MARK: - isPendingSubmission Tests
    
    func testIsPendingSubmission_True() {
        // Then: States pending submission
        XCTAssertTrue(ReceiptState.queued.isPendingSubmission)
        XCTAssertTrue(ReceiptState.retryWait.isPendingSubmission)
    }
    
    func testIsPendingSubmission_False() {
        // Then: States not pending submission
        XCTAssertFalse(ReceiptState.created.isPendingSubmission)
        XCTAssertFalse(ReceiptState.submitted.isPendingSubmission)
        XCTAssertFalse(ReceiptState.accepted.isPendingSubmission)
        XCTAssertFalse(ReceiptState.rejected.isPendingSubmission)
    }
    
    // MARK: - Description Tests
    
    func testDescription() {
        // Then: Human-readable descriptions
        XCTAssertEqual(ReceiptState.created.description, "Created")
        XCTAssertEqual(ReceiptState.queued.description, "Queued for submission")
        XCTAssertEqual(ReceiptState.submitted.description, "Submitted to server")
        XCTAssertEqual(ReceiptState.accepted.description, "Accepted by server")
        XCTAssertEqual(ReceiptState.rejected.description, "Rejected by server")
        XCTAssertEqual(ReceiptState.retryWait.description, "Waiting for retry")
    }
    
    // MARK: - State Transitions
    
    func testValidStateTransitions() {
        // Test valid state transitions
        // created -> queued
        XCTAssertTrue(canTransition(from: .created, to: .queued))
        
        // queued -> submitted
        XCTAssertTrue(canTransition(from: .queued, to: .submitted))
        
        // submitted -> accepted
        XCTAssertTrue(canTransition(from: .submitted, to: .accepted))
        
        // submitted -> rejected
        XCTAssertTrue(canTransition(from: .submitted, to: .rejected))
        
        // submitted -> retryWait
        XCTAssertTrue(canTransition(from: .submitted, to: .retryWait))
        
        // retryWait -> submitted
        XCTAssertTrue(canTransition(from: .retryWait, to: .submitted))
        
        // rejected -> queued (for retry)
        XCTAssertTrue(canTransition(from: .rejected, to: .queued))
    }
    
    func testInvalidStateTransitions() {
        // Test invalid state transitions
        // accepted is terminal
        XCTAssertFalse(canTransition(from: .accepted, to: .queued))
        XCTAssertFalse(canTransition(from: .accepted, to: .submitted))
        
        // created can't go directly to submitted
        XCTAssertFalse(canTransition(from: .created, to: .submitted))
        
        // queued can't go directly to accepted
        XCTAssertFalse(canTransition(from: .queued, to: .accepted))
    }
    
    // MARK: - Helper
    
    private func canTransition(from: ReceiptState, to: ReceiptState) -> Bool {
        // Define valid state transitions
        let validTransitions: [ReceiptState: [ReceiptState]] = [
            .created: [.queued],
            .queued: [.submitted],
            .submitted: [.accepted, .rejected, .retryWait],
            .retryWait: [.submitted],
            .rejected: [.queued],
            .accepted: [] // Terminal state
        ]
        
        return validTransitions[from]?.contains(to) ?? false
    }
}
