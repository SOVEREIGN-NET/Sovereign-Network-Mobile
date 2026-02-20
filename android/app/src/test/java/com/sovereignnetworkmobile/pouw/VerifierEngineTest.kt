package com.sovereignnetworkmobile.pouw

import com.sovereignnetworkmobile.pouw.model.PoUWError
import com.sovereignnetworkmobile.pouw.util.TestDataFactory
import org.junit.Test
import org.junit.Assert.*

/**
 * Unit tests for VerifierEngine.
 * Tests hash computation, difficulty verification, challenge solving, and performance.
 */
class VerifierEngineTest {

    // ============================================
    // Hash Computation Tests
    // ============================================

    @Test
    fun testComputeHash_KnownInput() {
        // Test with known input and expected SHA-256 output
        val input = "Hello, World!".toByteArray(Charsets.UTF_8)
        val expectedHashHex = "dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f"
        
        val result = VerifierEngine.computeHash(input)
        
        assertEquals("Hash should be 32 bytes", 32, result.size)
        assertEquals("Hash should match expected", expectedHashHex, result.toHex())
    }

    @Test
    fun testComputeHash_EmptyInput() {
        val input = ByteArray(0)
        val expectedHashHex = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        
        val result = VerifierEngine.computeHash(input)
        
        assertEquals("Hash should be 32 bytes", 32, result.size)
        assertEquals("Hash should match expected", expectedHashHex, result.toHex())
    }

    @Test
    fun testComputeHash_Consistency() {
        val input = TestDataFactory.randomBytes(100)
        
        val hash1 = VerifierEngine.computeHash(input)
        val hash2 = VerifierEngine.computeHash(input)
        
        assertArrayEquals("Same input should produce same hash", hash1, hash2)
    }

    @Test
    fun testComputeHash_DifferentInputs() {
        val input1 = "input1".toByteArray(Charsets.UTF_8)
        val input2 = "input2".toByteArray(Charsets.UTF_8)
        
        val hash1 = VerifierEngine.computeHash(input1)
        val hash2 = VerifierEngine.computeHash(input2)
        
        assertFalse("Different inputs should produce different hashes", 
            hash1.contentEquals(hash2))
    }

    // ============================================
    // Double Hash Tests
    // ============================================

    @Test
    fun testComputeDoubleHash() {
        val input = "test".toByteArray(Charsets.UTF_8)
        
        val doubleHash = VerifierEngine.computeDoubleHash(input)
        val singleHash = VerifierEngine.computeHash(input)
        val hashOfHash = VerifierEngine.computeHash(singleHash)
        
        assertArrayEquals("Double hash should be hash of hash", doubleHash, hashOfHash)
        assertEquals("Double hash should be 32 bytes", 32, doubleHash.size)
    }

    // ============================================
    // Verify Data Hash Tests
    // ============================================

    @Test
    fun testVerifyDataHash_Valid() {
        val data = "test data".toByteArray(Charsets.UTF_8)
        val hash = VerifierEngine.computeHash(data)
        
        val result = VerifierEngine.verifyDataHash(data, hash)
        
        assertTrue("Valid hash should verify", result)
    }

    @Test
    fun testVerifyDataHash_Invalid() {
        val data = "test data".toByteArray(Charsets.UTF_8)
        val wrongHash = VerifierEngine.computeHash("wrong data".toByteArray(Charsets.UTF_8))
        
        val result = VerifierEngine.verifyDataHash(data, wrongHash)
        
        assertFalse("Invalid hash should not verify", result)
    }

    @Test
    fun testVerifyDataHash_WrongLength() {
        val data = "test".toByteArray(Charsets.UTF_8)
        val shortHash = ByteArray(16) // Wrong length
        
        val result = VerifierEngine.verifyDataHash(data, shortHash)
        
        assertFalse("Hash with wrong length should not verify", result)
    }

    // ============================================
    // Hash Difficulty Tests
    // ============================================

    @Test
    fun testVerifyHashDifficulty_ZeroBits() {
        val hash = ByteArray(32) { 0xFF.toByte() } // All 1s
        
        val result = VerifierEngine.verifyHashDifficulty(hash, 0)
        
        assertTrue("Zero difficulty should always pass", result)
    }

    @Test
    fun testVerifyHashDifficulty_AllZeroHash() {
        val hash = ByteArray(32) { 0x00.toByte() } // All zeros
        
        // Should pass for any difficulty up to 256
        for (difficulty in 1..256) {
            assertTrue("All-zero hash should pass difficulty $difficulty",
                VerifierEngine.verifyHashDifficulty(hash, difficulty))
        }
    }

    @Test
    fun testVerifyHashDifficulty_EightLeadingZeros() {
        // Hash with exactly 8 leading zero bits (1 zero byte)
        val hash = ByteArray(32) { if (it == 0) 0x00 else 0xFF.toByte() }
        
        assertTrue("Should pass with 8 bits", 
            VerifierEngine.verifyHashDifficulty(hash, 8))
        assertFalse("Should fail with 9 bits", 
            VerifierEngine.verifyHashDifficulty(hash, 9))
    }

    @Test
    fun testVerifyHashDifficulty_SixteenLeadingZeros() {
        // Hash with exactly 16 leading zero bits (2 zero bytes)
        val hash = ByteArray(32) { if (it < 2) 0x00 else 0xFF.toByte() }
        
        assertTrue("Should pass with 16 bits", 
            VerifierEngine.verifyHashDifficulty(hash, 16))
        assertFalse("Should fail with 17 bits", 
            VerifierEngine.verifyHashDifficulty(hash, 17))
    }

    @Test
    fun testVerifyHashDifficulty_InvalidLength() {
        val shortHash = ByteArray(16) // Wrong length
        
        val result = VerifierEngine.verifyHashDifficulty(shortHash, 10)
        
        assertFalse("Invalid hash length should return false", result)
    }

    @Test
    fun testVerifyHashDifficulty_BoundaryBits() {
        // Test at bit boundaries (7, 8, 15, 16, etc.)
        val testCases = listOf(
            Pair(7, ByteArray(32) { if (it == 0) 0x01 else 0x00 }), // 0b00000001
            Pair(8, ByteArray(32) { if (it == 0) 0x00 else 0xFF.toByte() }),
            Pair(15, ByteArray(32) { if (it == 0) 0x00 else if (it == 1) 0x01 else 0x00 }),
            Pair(16, ByteArray(32) { if (it < 2) 0x00 else 0xFF.toByte() })
        )
        
        for ((difficulty, hash) in testCases) {
            assertFalse("Should fail with difficulty ${difficulty + 1}", 
                VerifierEngine.verifyHashDifficulty(hash, difficulty + 1))
        }
    }

    // ============================================
    // Challenge Verification Tests
    // ============================================

    @Test
    fun testVerifyChallenge_Valid() {
        val challengeNonce = TestDataFactory.randomBytes(32)
        val difficulty = 4 // Low difficulty for fast test
        
        // Find a valid worker nonce
        val workerNonce = TestDataFactory.solveChallenge(challengeNonce, difficulty, 100000)
        assertNotNull("Should find a valid nonce", workerNonce)
        
        val result = VerifierEngine.verifyChallenge(challengeNonce, workerNonce!!, difficulty)
        
        assertTrue("Valid challenge solution should verify", result)
    }

    @Test
    fun testVerifyChallenge_Invalid() {
        val challengeNonce = TestDataFactory.randomBytes(32)
        val workerNonce = TestDataFactory.randomBytes(32)
        val difficulty = 20 // High difficulty, random nonce unlikely to pass
        
        val result = VerifierEngine.verifyChallenge(challengeNonce, workerNonce, difficulty)
        
        assertFalse("Random nonce should not solve high difficulty challenge", result)
    }

    @Test
    fun testVerifyChallenge_DifferentDifficulty() {
        val challengeNonce = TestDataFactory.randomBytes(32)
        val difficulty = 4
        
        val workerNonce = TestDataFactory.solveChallenge(challengeNonce, difficulty, 100000)
        assertNotNull("Should find a valid nonce", workerNonce)
        
        // Should pass with correct difficulty
        assertTrue("Should pass with correct difficulty",
            VerifierEngine.verifyChallenge(challengeNonce, workerNonce!!, difficulty))
        
        // Should fail with higher difficulty
        assertFalse("Should fail with higher difficulty",
            VerifierEngine.verifyChallenge(challengeNonce, workerNonce, difficulty + 4))
    }

    // ============================================
    // Challenge Solving Tests
    // ============================================

    @Test
    fun testSolveChallenge_Success() {
        val challengeNonce = TestDataFactory.randomBytes(32)
        val difficulty = 4 // Low difficulty
        
        val workerNonce = VerifierEngine.solveChallenge(challengeNonce, difficulty, 1000000)
        
        assertNotNull("Should find a valid nonce", workerNonce)
        assertEquals("Nonce should be 32 bytes", 32, workerNonce!!.size)
        
        // Verify the solution
        assertTrue("Solution should verify",
            VerifierEngine.verifyChallenge(challengeNonce, workerNonce, difficulty))
    }

    @Test
    fun testSolveChallenge_MaxAttempts() {
        val challengeNonce = TestDataFactory.randomBytes(32)
        val difficulty = 30 // High difficulty
        
        // With very few attempts, should likely not find a solution
        val workerNonce = VerifierEngine.solveChallenge(challengeNonce, difficulty, 10)
        
        // May or may not find a solution with 10 attempts at difficulty 30
        // Just verify the method doesn't crash
    }

    @Test
    fun testSolveChallenge_UnlimitedAttempts() {
        val challengeNonce = TestDataFactory.randomBytes(32)
        val difficulty = 2 // Very low difficulty
        
        // 0 = unlimited attempts
        val workerNonce = VerifierEngine.solveChallenge(challengeNonce, difficulty, 0)
        
        assertNotNull("Should eventually find a solution", workerNonce)
        assertTrue("Solution should verify",
            VerifierEngine.verifyChallenge(challengeNonce, workerNonce!!, difficulty))
    }

    // ============================================
    // Random Nonce Generation Tests
    // ============================================

    @Test
    fun testGenerateRandomNonce_Length() {
        val lengths = listOf(16, 32, 64, 128)
        
        for (length in lengths) {
            val nonce = VerifierEngine.generateRandomNonce(length)
            assertEquals("Nonce should be $length bytes", length, nonce.size)
        }
    }

    @Test
    fun testGenerateRandomNonce_Uniqueness() {
        val nonces = List(100) { VerifierEngine.generateRandomNonce(32) }
        val uniqueNonces = nonces.map { it.contentHashCode() }.toSet()
        
        // All nonces should be unique (with very high probability)
        assertEquals("All nonces should be unique", nonces.size, uniqueNonces.size)
    }

    @Test
    fun testGenerateRandomNonce_NotAllZeros() {
        val nonces = List(10) { VerifierEngine.generateRandomNonce(32) }
        
        // It's extremely unlikely that any nonce is all zeros
        for (nonce in nonces) {
            assertFalse("Nonce should not be all zeros", nonce.all { it == 0x00.toByte() })
        }
    }

    // ============================================
    // Content Hash Verification Tests
    // ============================================

    @Test
    fun testVerifyContentHash_Valid() {
        val content = "test content".toByteArray(Charsets.UTF_8)
        val hash = VerifierEngine.computeHash(content)
        
        val result = VerifierEngine.verifyContentHash(content, hash)
        
        assertTrue("Valid content hash should verify", result)
    }

    @Test
    fun testVerifyContentHash_Invalid() {
        val content = "test content".toByteArray(Charsets.UTF_8)
        val wrongHash = VerifierEngine.computeHash("wrong content".toByteArray(Charsets.UTF_8))
        
        val result = VerifierEngine.verifyContentHash(content, wrongHash)
        
        assertFalse("Invalid content hash should not verify", result)
    }

    @Test(expected = PoUWError.InvalidContent::class)
    fun testVerifyContentHash_EmptyContent() {
        val emptyContent = ByteArray(0)
        val hash = VerifierEngine.computeHash(emptyContent)
        
        VerifierEngine.verifyContentHash(emptyContent, hash)
    }

    // ============================================
    // Performance Tests
    // ============================================

    @Test
    fun testPerformance_HashOperations() {
        val iterations = 10_000
        val data = TestDataFactory.randomBytes(100)
        
        val startTime = System.currentTimeMillis()
        
        repeat(iterations) {
            VerifierEngine.computeHash(data)
        }
        
        val endTime = System.currentTimeMillis()
        val duration = endTime - startTime
        
        println("Hash performance: $iterations operations in ${duration}ms (${duration.toDouble() / iterations}ms per operation)")
        
        // Should complete in reasonable time (adjust threshold as needed)
        assertTrue("10k hash operations should complete in under 5 seconds", duration < 5000)
    }

    @Test
    fun testPerformance_HashDifficulty() {
        val iterations = 10_000
        val hash = TestDataFactory.randomBytes(32)
        
        val startTime = System.currentTimeMillis()
        
        repeat(iterations) {
            VerifierEngine.verifyHashDifficulty(hash, 20)
        }
        
        val endTime = System.currentTimeMillis()
        val duration = endTime - startTime
        
        println("Difficulty check performance: $iterations operations in ${duration}ms")
        
        assertTrue("10k difficulty checks should complete quickly", duration < 1000)
    }

    @Test
    fun testPerformance_SolveChallenge() {
        val challengeNonce = TestDataFactory.randomBytes(32)
        val difficulty = 8 // Moderate difficulty
        
        val startTime = System.currentTimeMillis()
        
        val nonce = VerifierEngine.solveChallenge(challengeNonce, difficulty, 1_000_000)
        
        val endTime = System.currentTimeMillis()
        val duration = endTime - startTime
        
        assertNotNull("Should find a solution", nonce)
        println("Challenge solving at difficulty $difficulty took ${duration}ms")
        
        // At difficulty 8, should typically find solution quickly
        assertTrue("Should solve difficulty 8 challenge in reasonable time", duration < 30000)
    }

    // ============================================
    // Helper Functions
    // ============================================

    private fun ByteArray.toHex(): String {
        return joinToString("") { "%02x".format(it) }
    }
}
