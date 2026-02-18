// IdentitySigner.swift
// Proof-of-Useful-Work Identity Signer
// Sovereign Network Mobile

import Foundation

/// Protocol for identity-based signing operations
protocol IdentitySignerProtocol {
    /// Get the DID of the current identity
    func getDid() -> String?
    
    /// Get the node ID of the current identity
    func getNodeId() -> Data?
    
    /// Get the public key of the current identity
    func getPublicKey() -> Data?
    
    /// Sign arbitrary bytes using the identity's Dilithium key
    func sign(bytes: Data) throws -> Data
    
    /// Check if a valid identity is available
    var hasIdentity: Bool { get }
    
    /// Get the signature scheme used by this identity (ed25519 or dilithium5)
    func getSignatureScheme() -> String
}

/// Implementation of identity signing using Rust FFI via ZhtpClient
final class IdentitySigner: IdentitySignerProtocol {
    
    // MARK: - Singleton
    
    static let shared = IdentitySigner()
    
    // MARK: - Properties
    
    private let queue = DispatchQueue(label: "com.sovereignnetwork.pouw.signer", qos: .userInitiated)
    private var cachedIdentity: Identity?
    
    /// Whether a valid identity is available
    var hasIdentity: Bool {
        return getCurrentIdentity() != nil
    }
    
    // MARK: - Initialization
    
    private init() {
        // Try to load identity from handle store on init
        self.cachedIdentity = loadIdentityFromHandleStore()
    }
    
    // MARK: - Identity Access
    
    /// Get the DID of the current identity
    func getDid() -> String? {
        return queue.sync {
            return getCurrentIdentity()?.did
        }
    }
    
    /// Get the node ID of the current identity (32 bytes)
    func getNodeId() -> Data? {
        return queue.sync {
            guard let identity = getCurrentIdentity() else {
                return nil
            }
            return Data(identity.nodeId)
        }
    }
    
    /// Get the Dilithium public key of the current identity
    func getPublicKey() -> Data? {
        return queue.sync {
            guard let identity = getCurrentIdentity() else {
                return nil
            }
            return Data(identity.publicKey)
        }
    }
    
    /// Get the Kyber public key of the current identity
    func getKyberPublicKey() -> Data? {
        return queue.sync {
            guard let identity = getCurrentIdentity() else {
                return nil
            }
            return Data(identity.kyberPublicKey)
        }
    }
    
    // MARK: - Signing
    
    /// Sign arbitrary bytes using the identity's Dilithium5 key
    /// - Parameter bytes: Data to sign
    /// - Returns: Signature bytes
    /// - Throws: PoUWError.identityNotFound or PoUWError.signatureError
    func sign(bytes: Data) throws -> Data {
        try queue.sync {
            guard let identity = getCurrentIdentity() else {
                throw PoUWError.identityNotFound
            }
            
            do {
                let signature = try ZhtpClient.signData(bytes, using: identity)
                return Data(signature)
            } catch {
                print("[IdentitySigner] Signing failed: \(error)")
                throw PoUWError.signatureError
            }
        }
    }
    
    /// Sign a UHP challenge
    /// - Parameter challenge: Challenge bytes from server
    /// - Returns: Signature bytes
    /// - Throws: PoUWError.identityNotFound or PoUWError.signatureError
    func signUhpChallenge(_ challenge: Data) throws -> Data {
        try queue.sync {
            guard let identity = getCurrentIdentity() else {
                throw PoUWError.identityNotFound
            }
            
            do {
                let signature = try identity.signUhpChallenge(Array(challenge))
                return Data(signature)
            } catch {
                print("[IdentitySigner] UHP challenge signing failed: \(error)")
                throw PoUWError.signatureError
            }
        }
    }
    
    // MARK: - Identity Management
    
    /// Set the current identity (called after provisioning/restoration)
    func setIdentity(_ identity: Identity) {
        queue.sync {
            self.cachedIdentity = identity
        }
    }
    
    /// Clear the cached identity
    func clearIdentity() {
        queue.sync {
            self.cachedIdentity = nil
        }
    }
    
    /// Refresh identity from handle store
    func refreshIdentity() {
        queue.sync {
            self.cachedIdentity = loadIdentityFromHandleStore()
        }
    }
    
    /// Get the signature scheme used by this identity
    /// Currently always returns "dilithium5" as that's the scheme used for signing
    func getSignatureScheme() -> String {
        return "dilithium5"
    }
    
    // MARK: - Private Helpers
    
    /// Get current identity (from cache or handle store)
    private func getCurrentIdentity() -> Identity? {
        if let cached = cachedIdentity {
            return cached
        }
        
        // Try to load from handle store
        let identity = loadIdentityFromHandleStore()
        cachedIdentity = identity
        return identity
    }
    
    /// Load identity from IdentityHandleStore
    private func loadIdentityFromHandleStore() -> Identity? {
        guard let identityAny = IdentityHandleStore.shared.getLatestIdentity(),
              let identity = identityAny as? Identity else {
            return nil
        }
        return identity
    }
}

// MARK: - Receipt Signing

extension IdentitySigner {
    
    /// Sign a receipt with identity
    /// - Parameters:
    ///   - taskId: The task/content ID
    ///   - nonce: Receipt nonce
    ///   - timestamp: Receipt timestamp
    ///   - providerId: Optional provider ID
    /// - Returns: Signed receipt data
    /// - Throws: PoUWError if signing fails
    func signReceipt(
        taskId: Data,
        nonce: Data,
        timestamp: UInt64,
        providerId: Data? = nil
    ) throws -> Data {
        // Build receipt message to sign
        // Format: [taskId (32 bytes)][nonce (16 bytes)][timestamp (8 bytes BE)][providerId (optional 32 bytes)]
        var message = Data()
        message.append(taskId)
        message.append(nonce)
        message.append(contentsOf: timestamp.bigEndian.bytes)
        
        if let provider = providerId {
            message.append(provider)
        }
        
        return try sign(bytes: message)
    }
}

// MARK: - UInt64 Extensions

private extension UInt64 {
    var bytes: [UInt8] {
        withUnsafeBytes(of: self.bigEndian, Array.init)
    }
}
