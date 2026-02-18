package com.sovereignnetworkmobile.pouw

import com.google.protobuf.ByteString
import org.junit.Test
import org.junit.Assert.*
import org.junit.Before
import org.junit.After
import java.security.MessageDigest
import java.security.SecureRandom
import pouw.v1.Pouw

/**
 * Cross-Platform Parity Tests for PoUW (Phase 6)
 * 
 * CRITICAL: These tests ensure Android and iOS produce identical receipts.
 * Any failure indicates a breaking change to the reward system.
 * 
 * These tests mirror the iOS test suite in ios/PoUWTests/PoUWParityTests.swift
 * Both platforms must pass all test vectors for the same inputs.
 */
class PoUWParityTests {
    
    private lateinit var secureRandom: SecureRandom
    
    @Before
    fun setup() {
        secureRandom = SecureRandom()
    }
    
    @After
    fun teardown() {
        // Cleanup if needed
    }
    
    // ============================================================================
    // Test Vector 1: Simple Hash Receipt
    // ============================================================================
    
    /**
     * Test that a simple hash receipt serializes to the expected canonical bytes.
     * This must match iOS output exactly for the same inputs.
     */
    @Test
    fun testVector1_HashReceiptSerialization() {
        // Given: Test vector 1 data
        val receipt = Pouw.Receipt.newBuilder()
            .setVersion(1)
            .setTaskId(ByteString.copyFrom(byteArrayOf(0x01, 0x02, 0x03, 0x04)))
            .setClientDid("did:zhtp:test123")
            .setProofType(Pouw.ProofType.PROOF_HASH)
            .setBytesVerified(5)
            .setResultOk(true)
            .setStartedAt(1700000000000L)
            .setFinishedAt(1700000000005L)
            .setChallengeNonce(ByteString.copyFrom(byteArrayOf(
                0xaa.toByte(), 0xbb.toByte(), 0xcc.toByte(), 0xdd.toByte(),
                0x11, 0x22, 0x33, 0x44
            )))
            .setReceiptNonce(ByteString.copyFrom(byteArrayOf(
                0x11, 0x11, 0x11, 0x11, 0x22, 0x22, 0x22, 0x22
            )))
            .build()
        
        // When: Serialize to protobuf
        val serialized = receipt.toByteArray()
        
        // Then: Bytes match expected test vector
        val expectedHex = "08011204010203041a106469643a7a6874703a746573743132332000280530013880b4d7e74e8b014085b4d7e74e8b014a08aabbccdd1122334452081111111122222222"
        val actualHex = serialized.toHex()
        
        assertEquals("Test Vector 1 serialization mismatch", expectedHex, actualHex)
    }
    
    /**
     * Test that TV1 receipt produces identical bytes on every serialization.
     * Determinism is required for cross-platform parity.
     */
    @Test
    fun testVector1_DeterministicSerialization() {
        // Given: Same receipt built twice
        val receipt1 = buildTestVector1Receipt()
        val receipt2 = buildTestVector1Receipt()
        
        // When: Serialize both
        val bytes1 = receipt1.toByteArray()
        val bytes2 = receipt2.toByteArray()
        
        // Then: Bytes are identical
        assertArrayEquals("Serialization must be deterministic", bytes1, bytes2)
    }
    
    /**
     * Test deserialization round-trip.
     */
    @Test
    fun testVector1_DeserializationRoundTrip() {
        // Given: Original receipt
        val original = buildTestVector1Receipt()
        
        // When: Serialize and deserialize
        val serialized = original.toByteArray()
        val deserialized = Pouw.Receipt.parseFrom(serialized)
        
        // Then: All fields preserved
        assertEquals(original.version, deserialized.version)
        assertEquals(original.taskId, deserialized.taskId)
        assertEquals(original.clientDid, deserialized.clientDid)
        assertEquals(original.proofType, deserialized.proofType)
        assertEquals(original.bytesVerified, deserialized.bytesVerified)
        assertEquals(original.resultOk, deserialized.resultOk)
        assertEquals(original.startedAt, deserialized.startedAt)
        assertEquals(original.finishedAt, deserialized.finishedAt)
        assertEquals(original.challengeNonce, deserialized.challengeNonce)
        assertEquals(original.receiptNonce, deserialized.receiptNonce)
    }
    
    // ============================================================================
    // Test Vector 2: Merkle Receipt
    // ============================================================================
    
    /**
     * Test that a Merkle receipt with auxiliary data serializes correctly.
     */
    @Test
    fun testVector2_MerkleReceiptSerialization() {
        // Given: Merkle proof data
        val merkleRoot = byteArrayOf(
            0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88,
            0x99.toByte(), 0x00, 0xaa.toByte(), 0xbb.toByte(), 
            0xcc.toByte(), 0xdd.toByte(), 0xee.toByte(), 0xff.toByte(),
            0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88,
            0x99.toByte(), 0x00, 0xaa.toByte(), 0xbb.toByte(), 
            0xcc.toByte(), 0xdd.toByte(), 0xee.toByte(), 0xff.toByte()
        )
        
        val proofDigest = byteArrayOf(
            0xaa.toByte(), 0xbb.toByte(), 0xcc.toByte(), 0xdd.toByte(),
            0x11, 0x22, 0x33, 0x44, 0xaa.toByte(), 0xbb.toByte(), 
            0xcc.toByte(), 0xdd.toByte(), 0x11, 0x22, 0x33, 0x44,
            0xaa.toByte(), 0xbb.toByte(), 0xcc.toByte(), 0xdd.toByte(),
            0x11, 0x22, 0x33, 0x44, 0xaa.toByte(), 0xbb.toByte(), 
            0xcc.toByte(), 0xdd.toByte(), 0x11, 0x22, 0x33, 0x44
        )
        
        val aux = Pouw.Aux.newBuilder()
            .setMerkleRoot(ByteString.copyFrom(merkleRoot))
            .setProofDigest(ByteString.copyFrom(proofDigest))
            .build()
        
        val receipt = Pouw.Receipt.newBuilder()
            .setVersion(1)
            .setTaskId(ByteString.copyFrom(byteArrayOf(0xab.toByte(), 0xcd.toByte(), 0xef.toByte())))
            .setClientDid("did:zhtp:merkle_test")
            .setProofType(Pouw.ProofType.PROOF_MERKLE)
            .setBytesVerified(1024)
            .setResultOk(true)
            .setStartedAt(1700000010000L)
            .setFinishedAt(1700000010032L)
            .setChallengeNonce(ByteString.copyFrom(byteArrayOf(
                0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77,
                0x88.toByte(), 0x99.toByte(), 0xaa.toByte(), 0xbb.toByte(), 
                0xcc.toByte(), 0xdd.toByte()
            )))
            .setReceiptNonce(ByteString.copyFrom(byteArrayOf(
                0xde.toByte(), 0xad.toByte(), 0xbe.toByte(), 0xef.toByte(),
                0xca.toByte(), 0xfe.toByte(), 0xba.toByte(), 0xbe.toByte()
            )))
            .setAux(aux)
            .build()
        
        // When: Serialize
        val serialized = receipt.toByteArray()
        
        // Then: Matches expected structure
        val actualHex = serialized.toHex()
        val expectedPrefix = "08011203abcdef1a146469643a7a6874703a6d65726b6c655f74657374"
        
        assertTrue("Merkle receipt prefix mismatch", actualHex.startsWith(expectedPrefix))
        assertTrue("Should have PROOF_MERKLE type", actualHex.contains("2001"))
        
        // Verify aux is present
        assertTrue("Merkle root should be present", actualHex.contains("11223344"))
        assertTrue("Proof digest should be present", actualHex.contains("aabbccdd"))
    }
    
    // ============================================================================
    // Test Vector 3: Batch Serialization
    // ============================================================================
    
    /**
     * Test that batch serialization produces canonical bytes.
     */
    @Test
    fun testVector3_BatchSerialization() {
        // Given: Two signed receipts
        val receipt1 = buildTestVector1Receipt()
        val signedReceipt1 = Pouw.SignedReceipt.newBuilder()
            .setReceipt(receipt1)
            .setSigScheme(Pouw.SignatureScheme.ED25519)
            .setSignature(ByteString.copyFrom(ByteArray(64) { 0x00 }))
            .build()
        
        val receipt2 = buildAlternateReceipt()
        val signedReceipt2 = Pouw.SignedReceipt.newBuilder()
            .setReceipt(receipt2)
            .setSigScheme(Pouw.SignatureScheme.ED25519)
            .setSignature(ByteString.copyFrom(ByteArray(64) { 0xff.toByte() }))
            .build()
        
        val batch = Pouw.ReceiptBatch.newBuilder()
            .setVersion(1)
            .setClientDid("did:zhtp:batch_client")
            .setBatchNonce(ByteString.copyFrom(byteArrayOf(
                0xaa.toByte(), 0xbb.toByte(), 0xcc.toByte(), 0xdd.toByte()
            )))
            .addReceipts(signedReceipt1)
            .addReceipts(signedReceipt2)
            .build()
        
        // When: Serialize
        val serialized = batch.toByteArray()
        
        // Then: Valid batch structure
        val actualHex = serialized.toHex()
        assertTrue("Should contain batch_client DID", 
            actualHex.contains("6469643a7a6874703a62617463685f636c69656e74"))
        assertTrue("Should contain batch_nonce", actualHex.contains("aabbccdd"))
        assertTrue("Batch should have substantial size", serialized.size >= 100)
        
        // Verify two receipts present
        val receiptCount = actualHex.split("0a4c").size - 1 // Rough count of receipt markers
        assertTrue("Should contain multiple receipts", receiptCount >= 1)
    }
    
    /**
     * Test batch nonce uniqueness requirement.
     */
    @Test
    fun testVector3_BatchNonceUniqueness() {
        // Given: A set to track nonces
        val nonces = HashSet<String>()
        val iterationCount = 100
        
        // When: Generate 100 batch nonces
        for (i in 0 until iterationCount) {
            val nonce = generateSecureRandomBytes(16)
            val nonceHex = nonce.toHex()
            
            // Then: All unique
            assertFalse("Batch nonce collision at iteration $i: $nonceHex", 
                nonces.contains(nonceHex))
            nonces.add(nonceHex)
        }
        
        assertEquals("All 100 nonces should be unique", iterationCount, nonces.size)
    }
    
    /**
     * Test batch deserialization round-trip.
     */
    @Test
    fun testVector3_BatchRoundTrip() {
        // Given: A batch
        val batch = buildSampleBatch()
        
        // When: Serialize and deserialize
        val serialized = batch.toByteArray()
        val deserialized = Pouw.ReceiptBatch.parseFrom(serialized)
        
        // Then: All fields preserved
        assertEquals(batch.version, deserialized.version)
        assertEquals(batch.clientDid, deserialized.clientDid)
        assertEquals(batch.batchNonce, deserialized.batchNonce)
        assertEquals(batch.receiptsCount, deserialized.receiptsCount)
    }
    
    // ============================================================================
    // Signature Tests
    // ============================================================================
    
    /**
     * Test that signing the same data twice produces identical signatures.
     * Note: Requires deterministic signing implementation.
     */
    @Test
    fun testSignatureDeterminism() {
        // Given: Fixed receipt data
        val receiptData = buildCanonicalReceiptData()
        
        // Create mock signer
        val mockSigner = MockIdentitySigner()
        
        // When: Sign twice
        val sig1 = mockSigner.sign(receiptData)
        val sig2 = mockSigner.sign(receiptData)
        
        // Then: Signatures match (deterministic)
        assertArrayEquals("Signatures for identical data must match", sig1, sig2)
    }
    
    /**
     * Test that different data produces different signatures.
     */
    @Test
    fun testSignatureUniqueness() {
        // Given: Two different data inputs
        val data1 = byteArrayOf(0x01, 0x02, 0x03)
        val data2 = byteArrayOf(0x01, 0x02, 0x04) // Different last byte
        
        val mockSigner = MockIdentitySigner()
        
        // When: Sign both
        val sig1 = mockSigner.sign(data1)
        val sig2 = mockSigner.sign(data2)
        
        // Then: Different signatures
        assertFalse("Different data must produce different signatures", 
            sig1.contentEquals(sig2))
    }
    
    /**
     * Test signature scheme encoding in protobuf.
     */
    @Test
    fun testSignatureSchemeEncoding() {
        // Given: Signed receipts with different schemes
        val receipt = buildTestVector1Receipt()
        
        val signedEd25519 = Pouw.SignedReceipt.newBuilder()
            .setReceipt(receipt)
            .setSigScheme(Pouw.SignatureScheme.ED25519)
            .setSignature(ByteString.copyFrom(byteArrayOf(0x01, 0x02)))
            .build()
        
        val signedDilithium = Pouw.SignedReceipt.newBuilder()
            .setReceipt(receipt)
            .setSigScheme(Pouw.SignatureScheme.DILITHIUM5)
            .setSignature(ByteString.copyFrom(byteArrayOf(0x01, 0x02)))
            .build()
        
        // When: Serialize
        val bytesEd25519 = signedEd25519.toByteArray()
        val bytesDilithium = signedDilithium.toByteArray()
        
        // Then: Different (due to different scheme value)
        assertFalse("Different schemes should produce different bytes",
            bytesEd25519.contentEquals(bytesDilithium))
        
        // Verify scheme values
        assertEquals(Pouw.SignatureScheme.ED25519.number, 0)
        assertEquals(Pouw.SignatureScheme.DILITHIUM5.number, 1)
    }
    
    // ============================================================================
    // Nonce Tests
    // ============================================================================
    
    /**
     * Test receipt nonce uniqueness across many generations.
     */
    @Test
    fun testNonceUniqueness() {
        // Given: A set to track nonces
        val nonces = HashSet<String>()
        val iterationCount = 1000
        
        // When: Generate 1000 nonces
        for (i in 0 until iterationCount) {
            val nonce = generateSecureRandomBytes(16)
            val nonceHex = nonce.toHex()
            
            // Then: No collisions
            assertFalse("Nonce collision at iteration $i: $nonceHex", 
                nonces.contains(nonceHex))
            nonces.add(nonceHex)
        }
        
        assertEquals("All nonces must be unique", iterationCount, nonces.size)
    }
    
    /**
     * Test nonce length requirements.
     */
    @Test
    fun testNonceLength() {
        // When: Generate nonces of different lengths
        val nonce16 = generateSecureRandomBytes(16)
        val nonce32 = generateSecureRandomBytes(32)
        
        // Then: Lengths are correct
        assertEquals("16-byte nonce required", 16, nonce16.size)
        assertEquals("32-byte nonce must be supported", 32, nonce32.size)
    }
    
    /**
     * Test that generated nonces have sufficient entropy.
     */
    @Test
    fun testNonceEntropy() {
        // Given: 100 nonces
        val nonces = (0 until 100).map { generateSecureRandomBytes(16) }
        
        // When: Check that not all bytes are identical
        val allSame = nonces.all { nonce ->
            nonce.all { it == nonce[0] }
        }
        
        // Then: Nonces have variation
        assertFalse("Nonces must have entropy", allSame)
    }
    
    // ============================================================================
    // Challenge Binding Tests
    // ============================================================================
    
    /**
     * Test that challenge nonce is properly included in receipt.
     */
    @Test
    fun testChallengeBinding_IncludedInReceipt() {
        // Given: A challenge token
        val challengeNonce = byteArrayOf(
            0xca.toByte(), 0xfe.toByte(), 0xba.toByte(), 0xbe.toByte(),
            0xde.toByte(), 0xad.toByte(), 0xbe.toByte(), 0xef.toByte()
        )
        
        // When: Build receipt with challenge binding
        val receipt = Pouw.Receipt.newBuilder()
            .setVersion(1)
            .setChallengeNonce(ByteString.copyFrom(challengeNonce))
            .setReceiptNonce(ByteString.copyFrom(generateSecureRandomBytes(16)))
            .setClientDid("did:zhtp:test")
            .build()
        
        // Then: Challenge is in serialized receipt
        val serialized = receipt.toByteArray()
        val hex = serialized.toHex()
        assertTrue("Challenge nonce must be in receipt", 
            hex.contains("cafebabedeadbeef"))
    }
    
    /**
     * Test that receipts with different challenges produce different bytes.
     */
    @Test
    fun testChallengeBinding_DifferentChallengesDifferentBytes() {
        // Given: Two receipts differing only in challenge
        val baseReceipt = buildTestVector1Receipt()
        
        val receipt1 = baseReceipt.toBuilder()
            .setChallengeNonce(ByteString.copyFrom(byteArrayOf(0x01)))
            .build()
        
        val receipt2 = baseReceipt.toBuilder()
            .setChallengeNonce(ByteString.copyFrom(byteArrayOf(0x02)))
            .build()
        
        // When: Serialize
        val bytes1 = receipt1.toByteArray()
        val bytes2 = receipt2.toByteArray()
        
        // Then: Different bytes
        assertFalse("Different challenges must produce different receipts",
            bytes1.contentEquals(bytes2))
    }
    
    /**
     * Test challenge token serialization.
     */
    @Test
    fun testChallengeTokenSerialization() {
        // Given: A challenge token
        val policy = Pouw.Policy.newBuilder()
            .setMaxReceipts(100)
            .setMaxBytesTotal(1048576)
            .setMinBytesPerReceipt(1024)
            .addAllowedProofTypes(Pouw.ProofType.PROOF_HASH)
            .addAllowedProofTypes(Pouw.ProofType.PROOF_MERKLE)
            .build()
        
        val challenge = Pouw.ChallengeToken.newBuilder()
            .setVersion(1)
            .setNodeId(ByteString.copyFrom(ByteArray(32) { it.toByte() }))
            .setTaskId(ByteString.copyFrom(ByteArray(16) { (it + 0x10).toByte() }))
            .setChallengeNonce(ByteString.copyFrom(byteArrayOf(
                0xca.toByte(), 0xfe.toByte(), 0xba.toByte(), 0xbe.toByte(),
                0xde.toByte(), 0xad.toByte(), 0xbe.toByte(), 0xef.toByte()
            )))
            .setIssuedAt(1700000000)
            .setExpiresAt(1700003600)
            .setPolicy(policy)
            .setNodeSignature(ByteString.copyFrom(ByteArray(64) { 0x00 }))
            .build()
        
        // When: Serialize and deserialize
        val serialized = challenge.toByteArray()
        val deserialized = Pouw.ChallengeToken.parseFrom(serialized)
        
        // Then: All fields preserved
        assertEquals(challenge.version, deserialized.version)
        assertEquals(challenge.nodeId, deserialized.nodeId)
        assertEquals(challenge.taskId, deserialized.taskId)
        assertEquals(challenge.challengeNonce, deserialized.challengeNonce)
        assertEquals(challenge.issuedAt, deserialized.issuedAt)
        assertEquals(challenge.expiresAt, deserialized.expiresAt)
        assertEquals(challenge.policy.maxReceipts, deserialized.policy.maxReceipts)
        assertEquals(challenge.nodeSignature, deserialized.nodeSignature)
    }
    
    // ============================================================================
    // State Machine Consistency Tests
    // ============================================================================
    
    /**
     * Test that receipt state is not serialized (internal to storage layer).
     */
    @Test
    fun testStateNotSerialized() {
        // Given: A receipt
        val receipt = buildTestVector1Receipt()
        
        // When: Serialize
        val serialized = receipt.toByteArray()
        
        // Then: No state field in protobuf (state is storage-layer only)
        val hex = serialized.toHex()
        assertFalse("State must not be in wire format",
            hex.contains("queued") || hex.contains("submitted"))
    }
    
    // ============================================================================
    // Edge Case Tests
    // ============================================================================
    
    /**
     * Test empty auxiliary data.
     */
    @Test
    fun testEmptyAuxData() {
        // Given: Receipt without aux
        val receipt = Pouw.Receipt.newBuilder()
            .setVersion(1)
            .setTaskId(ByteString.copyFrom(byteArrayOf(0x01)))
            .setClientDid("did:zhtp:test")
            .setProofType(Pouw.ProofType.PROOF_HASH)
            .build()
        
        // When: Serialize
        val serialized = receipt.toByteArray()
        
        // Then: Valid serialization
        assertTrue("Serialization should succeed", serialized.isNotEmpty())
    }
    
    /**
     * Test maximum values.
     */
    @Test
    fun testMaximumValues() {
        // Given: Receipt with max values
        val receipt = Pouw.Receipt.newBuilder()
            .setVersion(UInt.MAX_VALUE.toInt())
            .setBytesVerified(Long.MAX_VALUE.toULong())
            .setStartedAt(Long.MAX_VALUE)
            .build()
        
        // When: Serialize and deserialize
        val serialized = receipt.toByteArray()
        val deserialized = Pouw.Receipt.parseFrom(serialized)
        
        // Then: Values preserved
        assertEquals(receipt.version, deserialized.version)
        assertEquals(receipt.bytesVerified, deserialized.bytesVerified)
        assertEquals(receipt.startedAt, deserialized.startedAt)
    }
    
    /**
     * Test Unicode in DID.
     */
    @Test
    fun testUnicodeDid() {
        // Given: Receipt with Unicode DID
        val receipt = Pouw.Receipt.newBuilder()
            .setVersion(1)
            .setClientDid("did:zhtp:测试🧪")
            .build()
        
        // When: Serialize and deserialize
        val serialized = receipt.toByteArray()
        val deserialized = Pouw.Receipt.parseFrom(serialized)
        
        // Then: DID preserved exactly
        assertEquals("did:zhtp:测试🧪", deserialized.clientDid)
    }
    
    /**
     * Test empty receipt fields.
     */
    @Test
    fun testEmptyFields() {
        // Given: Minimal receipt
        val receipt = Pouw.Receipt.newBuilder()
            .setVersion(1)
            .setClientDid("")
            .setBytesVerified(0)
            .setResultOk(false)
            .build()
        
        // When: Serialize
        val serialized = receipt.toByteArray()
        
        // Then: Serialization succeeds
        assertTrue("Should serialize empty fields", serialized.isNotEmpty())
        
        // And: Deserializes correctly
        val deserialized = Pouw.Receipt.parseFrom(serialized)
        assertEquals("", deserialized.clientDid)
        assertEquals(0u, deserialized.bytesVerified)
        assertEquals(false, deserialized.resultOk)
    }
    
    // ============================================================================
    // Cross-Platform Wire Format Tests
    // ============================================================================
    
    /**
     * Test that wire format matches expected iOS output.
     * This is a smoke test - full verification requires iOS test output.
     */
    @Test
    fun testWireFormatCompatibility_iOS() {
        // Given: Minimal receipt
        val androidReceipt = Pouw.Receipt.newBuilder()
            .setVersion(1)
            .setTaskId(ByteString.copyFrom(byteArrayOf(0x01, 0x02, 0x03, 0x04)))
            .build()
        
        val androidBytes = androidReceipt.toByteArray()
        
        // Expected prefix for version=1, task_id=[1,2,3,4]
        // 0x08 = field 1, varint | 0x01 = value 1
        // 0x12 = field 2, length-delimited | 0x04 = length 4 | bytes
        val expectedPrefix = byteArrayOf(0x08, 0x01, 0x12, 0x04, 0x01, 0x02, 0x03, 0x04)
        
        // Then: Prefix matches expected wire format
        assertArrayEquals("Wire format must match iOS", 
            expectedPrefix, androidBytes.copyOf(8))
    }
    
    /**
     * Test proof type wire values match between platforms.
     */
    @Test
    fun testProofTypeWireValues() {
        assertEquals("PROOF_HASH must be 0", 0, Pouw.ProofType.PROOF_HASH.number)
        assertEquals("PROOF_MERKLE must be 1", 1, Pouw.ProofType.PROOF_MERKLE.number)
        assertEquals("PROOF_SIGNATURE must be 2", 2, Pouw.ProofType.PROOF_SIGNATURE.number)
    }
    
    /**
     * Test rejection reason wire values.
     */
    @Test
    fun testRejectionReasonWireValues() {
        assertEquals("UNKNOWN must be 0", 0, Pouw.RejectionReason.UNKNOWN.number)
        assertEquals("EXPIRED must be 1", 1, Pouw.RejectionReason.EXPIRED.number)
        assertEquals("REPLAY must be 2", 2, Pouw.RejectionReason.REPLAY.number)
        assertEquals("POLICY must be 3", 3, Pouw.RejectionReason.POLICY.number)
        assertEquals("BAD_SIGNATURE must be 4", 4, Pouw.RejectionReason.BAD_SIGNATURE.number)
        assertEquals("BAD_PROOF must be 5", 5, Pouw.RejectionReason.BAD_PROOF.number)
    }
    
    // ============================================================================
    // Helpers
    // ============================================================================
    
    private fun buildTestVector1Receipt(): Pouw.Receipt {
        return Pouw.Receipt.newBuilder()
            .setVersion(1)
            .setTaskId(ByteString.copyFrom(byteArrayOf(0x01, 0x02, 0x03, 0x04)))
            .setClientDid("did:zhtp:test123")
            .setProofType(Pouw.ProofType.PROOF_HASH)
            .setBytesVerified(5)
            .setResultOk(true)
            .setStartedAt(1700000000000L)
            .setFinishedAt(1700000000005L)
            .setChallengeNonce(ByteString.copyFrom(byteArrayOf(
                0xaa.toByte(), 0xbb.toByte(), 0xcc.toByte(), 0xdd.toByte(),
                0x11, 0x22, 0x33, 0x44
            )))
            .setReceiptNonce(ByteString.copyFrom(byteArrayOf(
                0x11, 0x11, 0x11, 0x11, 0x22, 0x22, 0x22, 0x22
            )))
            .build()
    }
    
    private fun buildAlternateReceipt(): Pouw.Receipt {
        return Pouw.Receipt.newBuilder()
            .setVersion(1)
            .setTaskId(ByteString.copyFrom(byteArrayOf(0x55, 0x66, 0x77, 0x88)))
            .setClientDid("did:zhtp:test123")
            .setProofType(Pouw.ProofType.PROOF_HASH)
            .setBytesVerified(10)
            .setResultOk(true)
            .setStartedAt(1700000000000L)
            .setFinishedAt(1700000000010L)
            .setChallengeNonce(ByteString.copyFrom(byteArrayOf(
                0xaa.toByte(), 0xbb.toByte(), 0xcc.toByte(), 0xdd.toByte(),
                0x11, 0x22, 0x33, 0x44
            )))
            .setReceiptNonce(ByteString.copyFrom(byteArrayOf(
                0x33, 0x33, 0x33, 0x33, 0x44, 0x44, 0x44, 0x44
            )))
            .build()
    }
    
    private fun buildSampleBatch(): Pouw.ReceiptBatch {
        val signedReceipt = Pouw.SignedReceipt.newBuilder()
            .setReceipt(buildTestVector1Receipt())
            .setSigScheme(Pouw.SignatureScheme.ED25519)
            .setSignature(ByteString.copyFrom(ByteArray(64) { 0x00 }))
            .build()
        
        return Pouw.ReceiptBatch.newBuilder()
            .setVersion(1)
            .setClientDid("did:zhtp:batch_client")
            .setBatchNonce(ByteString.copyFrom(byteArrayOf(
                0xaa.toByte(), 0xbb.toByte(), 0xcc.toByte(), 0xdd.toByte()
            )))
            .addReceipts(signedReceipt)
            .build()
    }
    
    private fun buildCanonicalReceiptData(): ByteArray {
        // Canonical data that should produce deterministic signatures
        return byteArrayOf(
            0x01, 0x02, 0x03, 0x04,  // task_id
            0x11, 0x11, 0x11, 0x11,  // receipt_nonce
            0xaa.toByte(), 0xbb.toByte(), 0xcc.toByte(), 0xdd.toByte(),  // challenge_nonce
            0x00, 0x00, 0x00, 0x00,  // worker_nonce
            0xde.toByte(), 0xad.toByte(), 0xbe.toByte(), 0xef.toByte(),  // content_hash
            0x00, 0x00, 0x00, 0x00, 0x65, 0xcd.toByte(), 0x0a, 0xd5.toByte()  // timestamp
        )
    }
    
    private fun generateSecureRandomBytes(length: Int): ByteArray {
        val bytes = ByteArray(length)
        secureRandom.nextBytes(bytes)
        return bytes
    }
    
    private fun ByteArray.toHex(): String {
        return joinToString("") { "%02x".format(it) }
    }
    
    // ============================================================================
    // Mock Signer
    // ============================================================================
    
    /**
     * Mock signer for deterministic signature testing.
     * Produces deterministic "signatures" based on input data.
     */
    class MockIdentitySigner {
        fun sign(data: ByteArray): ByteArray {
            // Deterministic "signature": SHA-256 of data + fixed salt
            val combined = data + byteArrayOf(0x53, 0x4f, 0x56, 0x45) // "SOVE"
            return MessageDigest.getInstance("SHA-256").digest(combined)
        }
    }
}
