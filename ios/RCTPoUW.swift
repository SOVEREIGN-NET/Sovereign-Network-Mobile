// RCTPoUW.swift
// React Native Bridge for PoUW (Proof-of-Useful-Work)
// Phase 4: React Native Bridge
//
// STRICT BOUNDARY ENFORCEMENT:
// - RN never passes URLs
// - RN never sees keys
// - RN never sees receipts or signatures
// - RN never serializes protobuf
// - RN never performs cryptography

import Foundation
import React

/// React Native bridge module for PoUW
/// Exposes a strictly bounded interface to JavaScript
@objc(RCTPoUW)
class RCTPoUW: NSObject, RCTBridgeModule {
  
  // MARK: - RCTBridgeModule
  
  static func moduleName() -> String! {
    return "PoUW"
  }
  
  static func requiresMainQueueSetup() -> Bool {
    return false
  }
  
  // MARK: - Properties
  
  /// The PoUW controller instance
  private let controller: PoUWController
  
  // MARK: - Initialization
  
  override init() {
    // Use the shared controller instance
    self.controller = PoUWController.shared
    super.init()
  }
  
  // MARK: - JavaScript Exported Methods
  
  /**
   Verify content integrity and create a receipt
   
   - Parameters:
     - contentId: Base64-encoded content identifier (CID digest)
     - bytes: Base64-encoded content bytes
     - providerId: Optional base64-encoded provider identifier
     - resolver: Promise resolve block
     - rejecter: Promise reject block
   */
  @objc
  func verifyContent(
    _ contentId: String,
    bytes: String,
    providerId: String?,
    resolver: @escaping RCTPromiseResolveBlock,
    rejecter: @escaping RCTPromiseRejectBlock
  ) {
    // Decode base64 inputs
    guard let contentIdData = Data(base64Encoded: contentId) else {
      rejecter("INVALID_CONTENT_ID", "Failed to decode contentId from base64", nil)
      return
    }
    
    guard let bytesData = Data(base64Encoded: bytes) else {
      rejecter("INVALID_BYTES", "Failed to decode bytes from base64", nil)
      return
    }
    
    let providerIdData = providerId.flatMap { Data(base64Encoded: $0) }
    
    // Check controller readiness (identity must be provisioned)
    guard controller.isReady else {
      rejecter("IDENTITY_NOT_FOUND", "Identity not provisioned. Please provision identity before verifying content.", nil)
      return
    }
    
    // Perform verification on background queue
    DispatchQueue.global(qos: .userInitiated).async {
      Task {
        do {
          try await self.controller.verifyAndRecord(
            contentId: contentIdData,
            bytes: bytesData,
            providerId: providerIdData
          )
          resolver(NSNull())
        } catch let error as PoUWError {
          let (code, message) = self.mapPoUWError(error)
          rejecter(code, message, error)
        } catch {
          rejecter("VERIFICATION_ERROR", error.localizedDescription, error)
        }
      }
    }
  }
  
  /**
   Flush pending receipts to the server
   
   - Parameters:
     - resolver: Promise resolve block
     - rejecter: Promise reject block
   */
  @objc
  func flush(
    _ resolver: @escaping RCTPromiseResolveBlock,
    rejecter: @escaping RCTPromiseRejectBlock
  ) {
    // Check controller readiness
    guard controller.isReady else {
      rejecter("IDENTITY_NOT_FOUND", "Identity not provisioned. Please provision identity before flushing.", nil)
      return
    }
    
    // Perform flush on background queue
    DispatchQueue.global(qos: .userInitiated).async {
      Task {
        do {
          try await self.controller.flushReceipts()
          resolver(NSNull())
        } catch let error as PoUWError {
          let (code, message) = self.mapPoUWError(error)
          rejecter(code, message, error)
        } catch {
          rejecter("FLUSH_ERROR", error.localizedDescription, error)
        }
      }
    }
  }
  
  /**
   Get the count of pending receipts
   
   - Parameters:
     - resolver: Promise resolve block (returns Int)
     - rejecter: Promise reject block
   */
  @objc
  func getPendingCount(
    _ resolver: @escaping RCTPromiseResolveBlock,
    rejecter: @escaping RCTPromiseRejectBlock
  ) {
    // Get count on background queue
    DispatchQueue.global(qos: .utility).async {
      Task {
        let count = await self.controller.getPendingCount()
        resolver(count)
      }
    }
  }
  
  // MARK: - Error Mapping
  
  /**
   Map PoUWError to React Native error codes
   
   - Parameter error: The PoUWError to map
   - Returns: Tuple of (errorCode, errorMessage)
   */
  private func mapPoUWError(_ error: PoUWError) -> (String, String) {
    switch error {
    case .invalidContent:
      return ("INVALID_CONTENT", "Invalid content data provided")
    case .verificationFailed:
      return ("VERIFICATION_FAILED", "Content hash verification failed")
    case .challengeExpired:
      return ("CHALLENGE_EXPIRED", "Challenge token has expired")
    case .networkError(let underlying):
      return ("NETWORK_ERROR", "Network error: \(underlying.localizedDescription)")
    case .serializationError:
      return ("SERIALIZATION_ERROR", "Failed to serialize receipt data")
    case .storageError(let underlying):
      return ("STORAGE_ERROR", "Storage error: \(underlying.localizedDescription)")
    case .signatureError:
      return ("SIGNATURE_ERROR", "Failed to generate signature")
    case .identityNotFound:
      return ("IDENTITY_NOT_FOUND", "Identity not found or unavailable")
    case .rateLimitExceeded(let detail):
      return ("RATE_LIMIT_EXCEEDED", "Rate limit exceeded: \(detail)")
    case .batchTooLarge(let size):
      return ("BATCH_TOO_LARGE", "Batch size \(size) exceeds maximum allowed")
    case .noPendingReceipts:
      return ("NO_PENDING_RECEIPTS", "No pending receipts to submit")
    case .serverRejection(let reason):
      return ("SERVER_REJECTION", "Server rejected submission: \(reason)")
    }
  }
}
