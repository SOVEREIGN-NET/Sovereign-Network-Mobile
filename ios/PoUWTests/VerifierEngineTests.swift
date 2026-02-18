// VerifierEngineTests.swift
// Unit tests for VerifierEngine
// Sovereign Network Mobile

import XCTest
import CryptoKit
@testable import SovereignNetworkMobile

final class VerifierEngineTests: XCTestCase {
    
    var engine: VerifierEngine!
    
    override func setUp() {
        super.setUp()
        engine = VerifierEngine()
    }
    
    override func tearDown() {
        engine = nil
        super.tearDown()
    }
    
    // MARK: - verifyHash Tests
    
    func testVerifyHash_Valid() {
        // Given: Known content
        let content = "Hello, Sovereign Network!".data(using: .utf8)!
        
        // When: Compute hash and verify
        let computedHash = computeBlake3OrFallback(content)
        let result = engine.verifyHash(bytes: content, cidDigest: computedHash)
        
        // Then: Verification should succeed
        XCTAssertTrue(result, "Hash verification should succeed for valid content")
    }
    
    func testVerifyHash_Invalid() {
        // Given: Content and mismatched hash
        let content = "Hello, Sovereign Network!".data(using: .utf8)!
        let wrongHash = Data(repeating: 0xFF, count: 32)
        
        // When: Verify with wrong hash
        let result = engine.verifyHash(bytes: content, cidDigest: wrongHash)
        
        // Then: Verification should fail
        XCTAssertFalse(result, "Hash verification should fail for mismatched hash")
    }
    
    func testVerifyHash_EmptyContent() {
        // Given: Empty content
        let emptyContent = Data()
        let hash = Data(repeating: 0x00, count: 32)
        
        // When: Verify empty content
        let result = engine.verifyHash(bytes: emptyContent, cidDigest: hash)
        
        // Then: Should return false
        XCTAssertFalse(result, "Empty content should fail verification")
    }
    
    func testVerifyHash_EmptyDigest() {
        // Given: Empty digest
        let content = "Some content".data(using: .utf8)!
        let emptyDigest = Data()
        
        // When: Verify with empty digest
        let result = engine.verifyHash(bytes: content, cidDigest: emptyDigest)
        
        // Then: Should return false
        XCTAssertFalse(result, "Empty digest should fail verification")
    }
    
    func testVerifyHash_LargeContent() {
        // Given: Large content (1MB)
        let largeContent = Data((0..<1024*1024).map { UInt8($0 % 256) })
        let computedHash = computeBlake3OrFallback(largeContent)
        
        // When: Verify large content
        let result = engine.verifyHash(bytes: largeContent, cidDigest: computedHash)
        
        // Then: Should succeed
        XCTAssertTrue(result, "Large content verification should succeed")
    }
    
    // MARK: - verifyMerkle Tests
    
    func testVerifyMerkle_Valid() {
        // Given: A simple 2-leaf merkle tree
        // Leaf1 hash and Leaf2 hash combined -> Root
        let leaf1 = Data("leaf1".utf8)
        let leaf2 = Data("leaf2".utf8)
        
        let hash1 = computeBlake3OrFallback(leaf1)
        let hash2 = computeBlake3OrFallback(leaf2)
        
        // Create proof: [is_right_sibling=1][sibling_hash=hash2]
        var proof = Data()
        proof.append(1) // is_right_sibling = true
        proof.append(hash2)
        
        // Root = hash(hash1 + hash2)
        let root = computeBlake3OrFallback(hash1 + hash2)
        
        // When: Verify merkle proof for leaf1
        let result = engine.verifyMerkle(leaf: leaf1, root: root, proofDigest: proof)
        
        // Then: Should succeed
        XCTAssertTrue(result, "Valid merkle proof should verify")
    }
    
    func testVerifyMerkle_InvalidWrongRoot() {
        // Given: Valid proof but wrong root
        let leaf = Data("leaf".utf8)
        let siblingHash = Data(repeating: 0xAB, count: 32)
        let wrongRoot = Data(repeating: 0xFF, count: 32)
        
        var proof = Data()
        proof.append(0)
        proof.append(siblingHash)
        
        // When: Verify with wrong root
        let result = engine.verifyMerkle(leaf: leaf, root: wrongRoot, proofDigest: proof)
        
        // Then: Should fail
        XCTAssertFalse(result, "Merkle verification should fail with wrong root")
    }
    
    func testVerifyMerkle_InvalidProofFormat() {
        // Given: Malformed proof (incomplete sibling hash)
        let leaf = Data("leaf".utf8)
        let root = Data(repeating: 0xAB, count: 32)
        let incompleteProof = Data([1, 2, 3]) // Too short
        
        // When: Verify with malformed proof
        let result = engine.verifyMerkle(leaf: leaf, root: root, proofDigest: incompleteProof)
        
        // Then: Should fail
        XCTAssertFalse(result, "Merkle verification should fail with malformed proof")
    }
    
    func testVerifyMerkle_EmptyLeaf() {
        // Given: Empty leaf
        let emptyLeaf = Data()
        let root = Data(repeating: 0xAB, count: 32)
        let proof = Data([0] + Array(repeating: 0xCD, count: 32))
        
        // When: Verify with empty leaf
        let result = engine.verifyMerkle(leaf: emptyLeaf, root: root, proofDigest: proof)
        
        // Then: Should fail
        XCTAssertFalse(result, "Empty leaf should fail merkle verification")
    }
    
    func testVerifyMerkle_EmptyRoot() {
        // Given: Empty root
        let leaf = Data("leaf".utf8)
        let emptyRoot = Data()
        let proof = Data([0] + Array(repeating: 0xCD, count: 32))
        
        // When: Verify with empty root
        let result = engine.verifyMerkle(leaf: leaf, root: emptyRoot, proofDigest: proof)
        
        // Then: Should fail
        XCTAssertFalse(result, "Empty root should fail merkle verification")
    }
    
    func testVerifyMerkle_MultiLevelProof() {
        // Given: A 3-level merkle tree (8 leaves)
        // Build tree bottom-up
        let leaves = (0..<8).map { Data("leaf\($0)".utf8) }
        let leafHashes = leaves.map { computeBlake3OrFallback($0) }
        
        // Level 2: Pair up leaf hashes
        var level2: [Data] = []
        for i in stride(from: 0, to: leafHashes.count, by: 2) {
            let combined = leafHashes[i] + leafHashes[i+1]
            level2.append(computeBlake3OrFallback(combined))
        }
        
        // Level 1: Pair up level 2 hashes
        var level1: [Data] = []
        for i in stride(from: 0, to: level2.count, by: 2) {
            let combined = level2[i] + level2[i+1]
            level1.append(computeBlake3OrFallback(combined))
        }
        
        // Root
        let root = computeBlake3OrFallback(level1[0] + level1[1])
        
        // Build proof for leaf 0
        // Path: leaf0 -> hash with leaf1 -> hash with [leaf2,leaf3] -> hash with [leaf4-7]
        var proof = Data()
        // Level 0: sibling is leaf1 hash (right sibling)
        proof.append(1)
        proof.append(leafHashes[1])
        // Level 1: sibling is [leaf2,leaf3] combined hash (right sibling)
        proof.append(1)
        proof.append(level2[1])
        // Level 2: sibling is [leaf4-7] combined hash (right sibling)
        proof.append(1)
        proof.append(level1[1])
        
        // When: Verify proof for leaf 0
        let result = engine.verifyMerkle(leaf: leaves[0], root: root, proofDigest: proof)
        
        // Then: Should succeed
        XCTAssertTrue(result, "Multi-level merkle proof should verify")
    }
    
    func testVerifyMerkle_LeftSibling() {
        // Given: A proof where sibling is on the left
        let leaf1 = Data("leaf1".utf8)
        let leaf2 = Data("leaf2".utf8)
        
        let hash1 = computeBlake3OrFallback(leaf1)
        let hash2 = computeBlake3OrFallback(leaf2)
        
        // Proof for leaf2: sibling hash1 is on the left
        var proof = Data()
        proof.append(0) // is_right_sibling = false (sibling is on left)
        proof.append(hash1)
        
        let root = computeBlake3OrFallback(hash1 + hash2)
        
        // When: Verify proof for leaf2
        let result = engine.verifyMerkle(leaf: leaf2, root: root, proofDigest: proof)
        
        // Then: Should succeed
        XCTAssertTrue(result, "Left sibling merkle proof should verify")
    }
    
    // MARK: - verifySignature Tests
    
    func testVerifySignature_InvalidEmptyMessage() {
        // Given: Empty message (Dilithium requires non-empty in some implementations)
        let emptyMessage = Data()
        let signature = Data(repeating: 0xAA, count: 4595)
        let publicKey = Data(repeating: 0xBB, count: 2592)
        
        // When: Verify with empty message
        let result = engine.verifySignature(message: emptyMessage, signature: signature, publicKey: publicKey)
        
        // Then: Should return false (guard clause in implementation)
        XCTAssertFalse(result, "Empty message should fail signature verification")
    }
    
    func testVerifySignature_InvalidEmptySignature() {
        // Given: Empty signature
        let message = Data("message".utf8)
        let emptySignature = Data()
        let publicKey = Data(repeating: 0xBB, count: 2592)
        
        // When: Verify with empty signature
        let result = engine.verifySignature(message: message, signature: emptySignature, publicKey: publicKey)
        
        // Then: Should return false
        XCTAssertFalse(result, "Empty signature should fail verification")
    }
    
    func testVerifySignature_InvalidEmptyPublicKey() {
        // Given: Empty public key
        let message = Data("message".utf8)
        let signature = Data(repeating: 0xAA, count: 4595)
        let emptyPublicKey = Data()
        
        // When: Verify with empty public key
        let result = engine.verifySignature(message: message, signature: signature, publicKey: emptyPublicKey)
        
        // Then: Should return false
        XCTAssertFalse(result, "Empty public key should fail verification")
    }
    
    // Note: Valid signature test requires proper Dilithium key generation
    // This is tested in LibOQSTests, here we focus on VerifierEngine logic
    
    // MARK: - verifyContent Integration Tests
    
    func testVerifyContent_FullVerification() {
        // Given: Content that passes all verifications
        let content = Data("test content".utf8)
        let cidDigest = computeBlake3OrFallback(content)
        
        // When: Verify content (hash only, no merkle/sig)
        let result = engine.verifyContent(bytes: content, cidDigest: cidDigest)
        
        // Then: Should succeed
        XCTAssertTrue(result, "Content with valid hash should verify")
    }
    
    func testVerifyContent_HashVerificationFails() {
        // Given: Content with wrong CID
        let content = Data("test content".utf8)
        let wrongCid = Data(repeating: 0xFF, count: 32)
        
        // When: Verify content
        let result = engine.verifyContent(bytes: content, cidDigest: wrongCid)
        
        // Then: Should fail
        XCTAssertFalse(result, "Content with invalid hash should fail verification")
    }
    
    func testVerifyContent_WithMerkle() {
        // Given: Content with merkle proof
        let content = Data("test content".utf8)
        let cidDigest = computeBlake3OrFallback(content)
        
        let siblingHash = Data(repeating: 0xAB, count: 32)
        var proof = Data()
        proof.append(1)
        proof.append(siblingHash)
        let root = computeBlake3OrFallback(cidDigest + siblingHash)
        
        // When: Verify content with merkle
        let result = engine.verifyContent(
            bytes: content,
            cidDigest: cidDigest,
            merkleRoot: root,
            merkleProof: proof
        )
        
        // Then: Should succeed
        XCTAssertTrue(result, "Content with valid merkle proof should verify")
    }
    
    func testVerifyContent_MerkleVerificationFails() {
        // Given: Content with invalid merkle proof
        let content = Data("test content".utf8)
        let cidDigest = computeBlake3OrFallback(content)
        let wrongRoot = Data(repeating: 0xFF, count: 32)
        let proof = Data([0] + Array(repeating: 0xAB, count: 32))
        
        // When: Verify content with bad merkle
        let result = engine.verifyContent(
            bytes: content,
            cidDigest: cidDigest,
            merkleRoot: wrongRoot,
            merkleProof: proof
        )
        
        // Then: Should fail
        XCTAssertFalse(result, "Content with invalid merkle proof should fail")
    }
    
    // MARK: - Performance Tests
    
    func testPerformance_10kHashes() {
        // Given: Test data
        let content = Data("performance test content".utf8)
        let hash = computeBlake3OrFallback(content)
        
        // When & Then: Measure 10k hash operations
        measure {
            for _ in 0..<10_000 {
                _ = engine.verifyHash(bytes: content, cidDigest: hash)
            }
        }
    }
    
    func testPerformance_1kMerkleProofs() {
        // Given: Merkle proof data
        let leaf = Data("leaf".utf8)
        let siblingHash = Data(repeating: 0xAB, count: 32)
        var proof = Data()
        proof.append(1)
        proof.append(siblingHash)
        let leafHash = computeBlake3OrFallback(leaf)
        let root = computeBlake3OrFallback(leafHash + siblingHash)
        
        // When & Then: Measure 1k merkle operations
        measure {
            for _ in 0..<1_000 {
                _ = engine.verifyMerkle(leaf: leaf, root: root, proofDigest: proof)
            }
        }
    }
    
    func testPerformance_10kHashComputations() {
        // Given: Multiple content pieces
        let contents = (0..<100).map { Data("content\($0)".utf8) }
        
        // When & Then: Measure computing 10k hashes
        measure {
            for _ in 0..<100 {
                for content in contents {
                    _ = computeBlake3OrFallback(content)
                }
            }
        }
    }
    
    // MARK: - Helper Methods
    
    /// Compute Blake3 hash or fallback to SHA-256
    private func computeBlake3OrFallback(_ input: Data) -> Data {
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
            return Data(SHA256.hash(data: input))
        }
        return output
    }
}

// Blake3 FFI Declaration for tests
@_silgen_name("uhp_blake3")
private func uhp_blake3(
    _ input: UnsafePointer<UInt8>,
    _ inputLen: Int,
    _ output: UnsafeMutablePointer<UInt8>,
    _ outputLen: Int
) -> Int32
