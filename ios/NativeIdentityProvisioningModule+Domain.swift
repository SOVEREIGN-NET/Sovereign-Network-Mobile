/**
 * NativeIdentityProvisioning Module - Domain Operations Extension
 *
 * iOS implementation of domain registration and update transaction signing
 * Private keys remain in device Keychain - never reach JavaScript
 * Follows identical pattern to token transaction signing
 *
 * Pattern: Extract params → Get identity from IdentityHandleStore → Call ZhtpClient.build* → Return hex
 */

import Foundation

extension NativeIdentityProvisioning {

  /**
   * Sign a domain registration transaction with Dilithium keypair
   * Private key remains in Keychain - never reaches JavaScript
   * Returns hex-encoded signed transaction ready for API
   */
  @objc
  func signDomainRegisterTransaction(
    _ params: NSDictionary,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async { [weak self] in
      do {
        guard let domain = params["domain"] as? String,
              let durationDays = params["durationDays"] as? NSNumber else {
          reject("INVALID_PARAMS", "Missing required domain parameters", nil)
          return
        }

        print("[NativeIdentityProvisioning] Building signed domain register transaction")
        print("[NativeIdentityProvisioning]   Domain: \(domain)")
        print("[NativeIdentityProvisioning]   Duration: \(durationDays) days")

        // Get the current identity from handle store
        guard let identityAny = IdentityHandleStore.shared.getLatestIdentity(),
              let identity = identityAny as? Identity else {
          reject("NO_IDENTITY", "No active identity for signing", nil)
          return
        }

        // Use lib-client FFI to build and sign the full transaction
        // FFI handles: bincode serialization, signing, Transaction wrapping, hex encoding
        let hexSignedTx = try ZhtpClient.buildDomainRegister(
          domain: domain,
          durationDays: UInt32(durationDays.uint32Value),
          using: identity,
          chainId: 0x02  // testnet
        )

        print("[NativeIdentityProvisioning] Domain register transaction built and signed")
        print("[NativeIdentityProvisioning] Hex tx length: \(hexSignedTx.count)")

        // Print full hex in chunks for debugging
        let chunkSize = 1000
        var offset = 0
        while offset < hexSignedTx.count {
          let startIndex = hexSignedTx.index(hexSignedTx.startIndex, offsetBy: offset)
          let endIndex = hexSignedTx.index(startIndex, offsetBy: min(chunkSize, hexSignedTx.count - offset), limitedBy: hexSignedTx.endIndex) ?? hexSignedTx.endIndex
          let chunk = String(hexSignedTx[startIndex..<endIndex])
          print(chunk)
          offset += chunkSize
        }

        resolve(["signed_tx": hexSignedTx])

      } catch {
        print("[NativeIdentityProvisioning] ❌ Domain register signing failed: \(error)")
        reject("SIGNING_ERROR", "Failed to sign domain registration: \(error)", nil)
      }
    }
  }

  /**
   * Sign a domain update transaction with Dilithium keypair
   * Private key remains in Keychain - never reaches JavaScript
   * Returns hex-encoded signed transaction ready for API
   */
  @objc
  func signDomainUpdateTransaction(
    _ params: NSDictionary,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async { [weak self] in
      do {
        guard let domain = params["domain"] as? String,
              let contentCid = params["contentCid"] as? String else {
          reject("INVALID_PARAMS", "Missing required domain parameters", nil)
          return
        }

        print("[NativeIdentityProvisioning] Building signed domain update transaction")
        print("[NativeIdentityProvisioning]   Domain: \(domain)")
        print("[NativeIdentityProvisioning]   Content CID: \(contentCid)")

        // Get the current identity from handle store
        guard let identityAny = IdentityHandleStore.shared.getLatestIdentity(),
              let identity = identityAny as? Identity else {
          reject("NO_IDENTITY", "No active identity for signing", nil)
          return
        }

        // Use lib-client FFI to build and sign the full transaction
        let hexSignedTx = try ZhtpClient.buildDomainUpdate(
          domain: domain,
          contentCid: contentCid,
          using: identity,
          chainId: 0x02  // testnet
        )

        print("[NativeIdentityProvisioning] Domain update transaction built and signed")
        print("[NativeIdentityProvisioning] Hex tx length: \(hexSignedTx.count)")

        // Print full hex in chunks for debugging
        let chunkSize = 1000
        var offset = 0
        while offset < hexSignedTx.count {
          let startIndex = hexSignedTx.index(hexSignedTx.startIndex, offsetBy: offset)
          let endIndex = hexSignedTx.index(startIndex, offsetBy: min(chunkSize, hexSignedTx.count - offset), limitedBy: hexSignedTx.endIndex) ?? hexSignedTx.endIndex
          let chunk = String(hexSignedTx[startIndex..<endIndex])
          print(chunk)
          offset += chunkSize
        }

        resolve(["signed_tx": hexSignedTx])

      } catch {
        print("[NativeIdentityProvisioning] ❌ Domain update signing failed: \(error)")
        reject("SIGNING_ERROR", "Failed to sign domain update: \(error)", nil)
      }
    }
  }
}

/**
 * Integration Notes:
 *
 * 1. Add these methods to the existing NativeIdentityProvisioningModule.swift
 *
 * 2. Required dependencies:
 *    - lib-client (Rust lib compiled for iOS)
 *    - React Native Bridge for promise handling
 *    - Security framework for Keychain access
 *
 * 3. Library integration with Rust lib-client:
 *    - Build lib-client as iOS framework
 *    - Use rust-bindgen or similar for FFI bindings
 *    - Or use existing Swift-Rust bridge if available
 *
 * 4. Error handling:
 *    - Always reject with descriptive error codes
 *    - Log errors but never expose private key info
 *    - Handle network timeouts gracefully
 *
 * 5. Security considerations:
 *    - Use DispatchQueue.global for signing (don't block main thread)
 *    - Clear sensitive data after use
 *    - Use SecureEnclave for key storage if available
 *    - Never expose raw key bytes to JavaScript
 *
 * 6. Testing:
 *    - Test with invalid parameters
 *    - Test with missing Keychain entries
 *    - Test signing performance
 *    - Test error propagation to TypeScript
 */
