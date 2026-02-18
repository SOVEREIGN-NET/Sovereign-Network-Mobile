// PoUWError.swift
// Proof-of-Useful-Work Error Types
// Sovereign Network Mobile

import Foundation

/// Errors that can occur during PoUW operations
enum PoUWError: Error {
    /// Invalid content data provided
    case invalidContent
    
    /// Verification of hash, merkle proof, or signature failed
    case verificationFailed
    
    /// Challenge token has expired
    case challengeExpired
    
    /// Network error during QUIC communication
    case networkError(Error)
    
    /// Serialization/deserialization error
    case serializationError
    
    /// Core Data storage operation failed
    case storageError(Error)
    
    /// Signature generation failed
    case signatureError
    
    /// Identity not found or unavailable
    case identityNotFound
    
    /// Rate limit exceeded
    case rateLimitExceeded(String)
    
    /// Batch size exceeds maximum
    case batchTooLarge(Int)
    
    /// No pending receipts to submit
    case noPendingReceipts
    
    /// Server rejected the submission
    case serverRejection(String)
}

// MARK: - LocalizedError Conformance

extension PoUWError: LocalizedError {
    var errorDescription: String? {
        switch self {
        case .invalidContent:
            return "Invalid content data provided"
        case .verificationFailed:
            return "Verification failed - hash, merkle proof, or signature invalid"
        case .challengeExpired:
            return "Challenge token has expired"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .serializationError:
            return "Failed to serialize or deserialize data"
        case .storageError(let error):
            return "Storage error: \(error.localizedDescription)"
        case .signatureError:
            return "Failed to generate signature"
        case .identityNotFound:
            return "Identity not found or unavailable"
        case .rateLimitExceeded(let detail):
            return "Rate limit exceeded: \(detail)"
        case .batchTooLarge(let size):
            return "Batch size \(size) exceeds maximum allowed"
        case .noPendingReceipts:
            return "No pending receipts to submit"
        case .serverRejection(let reason):
            return "Server rejected submission: \(reason)"
        }
    }
    
    var recoverySuggestion: String? {
        switch self {
        case .invalidContent:
            return "Ensure content bytes and CID are valid"
        case .verificationFailed:
            return "Content may have been tampered with or corrupted"
        case .challengeExpired:
            return "Request a new challenge and retry"
        case .networkError:
            return "Check network connectivity and retry"
        case .serializationError:
            return "Verify data format matches expected protobuf schema"
        case .storageError:
            return "Check device storage availability"
        case .signatureError:
            return "Ensure identity is provisioned and accessible"
        case .identityNotFound:
            return "Provision or restore identity before submitting receipts"
        case .rateLimitExceeded:
            return "Wait before making additional requests"
        case .batchTooLarge:
            return "Split receipts into smaller batches"
        case .noPendingReceipts:
            return "Process content to generate receipts before flushing"
        case .serverRejection:
            return "Check receipt validity and retry with corrected data"
        }
    }
}
