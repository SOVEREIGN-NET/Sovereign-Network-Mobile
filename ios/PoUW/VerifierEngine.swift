// VerifierEngine.swift
// Proof-of-Useful-Work Verification Engine
// Sovereign Network Mobile

import Foundation
import CryptoKit

/// Protocol for verification operations
protocol VerifierEngineProtocol {
    /// Verify that content bytes match the CID digest
    func verifyHash(bytes: Data, cidDigest: Data) -> Bool
    
    /// Verify a Merkle proof
    func verifyMerkle(leaf: Data, root: Data, proofDigest: Data) -> Bool
    
    /// Verify a signature using Dilithium
    func verifySignature(message: Data, signature: Data, publicKey: Data) -> Bool
}

/// Default implementation of verification operations
final class VerifierEngine: VerifierEngineProtocol {
    
    // MARK: - Singleton
    
    static let shared = VerifierEngine()
    
    // MARK: - Properties
    
    private let queue = DispatchQueue(label: "com.sovereignnetwork.pouw.verifier", qos: .userInitiated)
    
    // Blake3 hasher (using FFI if available, otherwise fallback)
    // For now we use CryptoKit's SHA-256 with a note to migrate to Blake3
    
    // MARK: - Initialization
    
    private init() {}
    
    // MARK: - Hash Verification
    
    /// Verify that content bytes match the expected CID digest
    /// Uses Blake3 hash computation
    func verifyHash(bytes: Data, cidDigest: Data) -> Bool {
        queue.sync {
            guard !bytes.isEmpty, !cidDigest.isEmpty else {
                return false
            }
            
            // Compute Blake3 hash of content
            let computedHash = computeBlake3(bytes)
            
            // Compare with expected CID digest
            // CID format: [version][codec][hash_type][hash_size][hash_bytes]
            // We compare the hash portion
            return computedHash == cidDigest
        }
    }
    
    // MARK: - Merkle Proof Verification
    
    /// Verify a Merkle proof
    /// - Parameters:
    ///   - leaf: The leaf node data
    ///   - root: The expected Merkle root
    ///   - proofDigest: The proof path digest
    /// - Returns: True if proof is valid
    func verifyMerkle(leaf: Data, root: Data, proofDigest: Data) -> Bool {
        queue.sync {
            guard !leaf.isEmpty, !root.isEmpty else {
                return false
            }
            
            // Compute leaf hash
            var currentHash = computeBlake3(leaf)
            
            // Parse and traverse proof path
            // Proof format: [[is_right_sibling: 1 byte][sibling_hash: 32 bytes]...]
            var proofOffset = 0
            let hashSize = 32
            
            while proofOffset < proofDigest.count {
                guard proofOffset + 1 + hashSize <= proofDigest.count else {
                    return false
                }
                
                let isRightSibling = proofDigest[proofOffset] == 1
                let siblingHash = proofDigest.subdata(in: (proofOffset + 1)..<(proofOffset + 1 + hashSize))
                
                // Concatenate hashes in correct order
                var combined: Data
                if isRightSibling {
                    combined = currentHash + siblingHash
                } else {
                    combined = siblingHash + currentHash
                }
                
                // Compute parent hash
                currentHash = computeBlake3(combined)
                proofOffset += 1 + hashSize
            }
            
            // Verify computed root matches expected root
            return currentHash == root
        }
    }
    
    // MARK: - Signature Verification
    
    /// Verify a Dilithium signature
    /// - Parameters:
    ///   - message: The original message
    ///   - signature: The signature bytes
    ///   - publicKey: The Dilithium public key
    /// - Returns: True if signature is valid
    func verifySignature(message: Data, signature: Data, publicKey: Data) -> Bool {
        queue.sync {
            guard !message.isEmpty, !signature.isEmpty, !publicKey.isEmpty else {
                return false
            }
            
            do {
                // Use LibOQS for Dilithium5 signature verification
                let verifier = try LibOQSSIG(algorithm: .dilithium5)
                return try verifier.verify(message: message, signature: signature, publicKey: publicKey)
            } catch {
                print("[VerifierEngine] Signature verification failed: \(error)")
                return false
            }
        }
    }
    
    // MARK: - Helper Methods
    
    /// Compute Blake3 hash using FFI
    private func computeBlake3(_ input: Data) -> Data {
        var output = Data(count: 32)
        let rc = input.withUnsafeBytes { inBuf -> Int32 in
            output.withUnsafeMutableBytes { outBuf -> Int32 in
                guard let inPtr = inBuf.baseAddress?.assumingMemoryBound(to: UInt8.self),
                      let outPtr = outBuf.baseAddress?.assumingMemoryBound(to: UInt8.self) else {
                    return -1
                }
                return uhp_blake3(inPtr, input.count, outPtr, 32)
            }
        }
        guard rc == 0 else {
            // Fallback to SHA-256 if Blake3 FFI fails
            return Data(SHA256.hash(data: input))
        }
        return output
    }
    
    /// Verify all three proofs for content
    func verifyContent(
        bytes: Data,
        cidDigest: Data,
        merkleRoot: Data? = nil,
        merkleProof: Data? = nil,
        signature: Data? = nil,
        publicKey: Data? = nil
    ) -> Bool {
        queue.sync {
            // 1. Verify content hash
            guard verifyHash(bytes: bytes, cidDigest: cidDigest) else {
                print("[VerifierEngine] Hash verification failed")
                return false
            }
            
            // 2. Verify Merkle proof if provided
            if let root = merkleRoot, let proof = merkleProof {
                guard verifyMerkle(leaf: cidDigest, root: root, proofDigest: proof) else {
                    print("[VerifierEngine] Merkle verification failed")
                    return false
                }
            }
            
            // 3. Verify signature if provided
            if let sig = signature, let pk = publicKey {
                guard verifySignature(message: bytes, signature: sig, publicKey: pk) else {
                    print("[VerifierEngine] Signature verification failed")
                    return false
                }
            }
            
            return true
        }
    }
}

// MARK: - Blake3 FFI Declaration

@_silgen_name("uhp_blake3")
private func uhp_blake3(
    _ input: UnsafePointer<UInt8>,
    _ inputLen: Int,
    _ output: UnsafeMutablePointer<UInt8>,
    _ outputLen: Int
) -> Int32
