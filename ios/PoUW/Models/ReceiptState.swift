// ReceiptState.swift
// Proof-of-Useful-Work Receipt States
// Sovereign Network Mobile

import Foundation

/// Represents the lifecycle state of a PoUW receipt
enum ReceiptState: String, CaseIterable {
    /// Receipt created but not yet persisted
    case created = "created"
    
    /// Receipt persisted to local queue
    case queued = "queued"
    
    /// Receipt submitted to server
    case submitted = "submitted"
    
    /// Server accepted the receipt
    case accepted = "accepted"
    
    /// Server rejected the receipt
    case rejected = "rejected"
    
    /// Waiting for retry after error
    case retryWait = "retryWait"
}

// MARK: - State Properties

extension ReceiptState {
    /// Whether this state represents a terminal state (no further action needed)
    var isTerminal: Bool {
        switch self {
        case .accepted, .rejected:
            return true
        case .created, .queued, .submitted, .retryWait:
            return false
        }
    }
    
    /// Whether this state allows retry
    var canRetry: Bool {
        switch self {
        case .rejected, .retryWait:
            return true
        case .created, .queued, .submitted, .accepted:
            return false
        }
    }
    
    /// Whether the receipt should be included in submission batches
    var isPendingSubmission: Bool {
        switch self {
        case .queued, .retryWait:
            return true
        case .created, .submitted, .accepted, .rejected:
            return false
        }
    }
    
    /// Human-readable description
    var description: String {
        switch self {
        case .created:
            return "Created"
        case .queued:
            return "Queued for submission"
        case .submitted:
            return "Submitted to server"
        case .accepted:
            return "Accepted by server"
        case .rejected:
            return "Rejected by server"
        case .retryWait:
            return "Waiting for retry"
        }
    }
}
