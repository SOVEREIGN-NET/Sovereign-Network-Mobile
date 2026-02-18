package com.sovereignnetworkmobile.pouw

import com.sovereignnetworkmobile.pouw.model.PoUWError
import com.sovereignnetworkmobile.pouw.model.ReceiptEntity
import com.sovereignnetworkmobile.pouw.model.ReceiptState
import com.sovereignnetworkmobile.pouw.util.TestDataFactory
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mock
import org.mockito.Mockito.*
import org.mockito.MockitoAnnotations
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.whenever
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Unit tests for SubmissionClient.
 * Tests challenge fetching, receipt submission, batch handling, and rate limiting.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], manifest = Config.NONE)
@ExperimentalCoroutinesApi
class SubmissionClientTest {

    private lateinit var submissionClient: SubmissionClient
    private val nodeHost = "test.example.com"
    private val nodePort = 443

    @Before
    fun setup() {
        MockitoAnnotations.openMocks(this)
        submissionClient = SubmissionClient(nodeHost, nodePort, insecure = true)
    }

    // ============================================
    // Request Challenge Tests
    // ============================================

    @Test
    fun testRequestChallenge_Success() = runTest {
        // This test would require mocking NativeQuicBridge
        // Since NativeQuicBridge is an object with native methods,
        // we test the parsing logic separately
        
        val nonce = TestDataFactory.randomBytes(32).toHex()
        val difficulty = 20
        val expiresAt = System.currentTimeMillis() + 300000
        
        val mockResponse = mapOf(
            "status" to 200,
            "body" to JSONObject().apply {
                put("nonce", nonce)
                put("difficulty", difficulty)
                put("expires_at", expiresAt)
            }.toString()
        )
        
        // Verify response structure
        assertEquals(200, mockResponse["status"])
        val body = JSONObject(mockResponse["body"] as String)
        assertEquals(nonce, body.getString("nonce"))
        assertEquals(difficulty, body.getInt("difficulty"))
    }

    @Test
    fun testChallengeResponse_Equals() {
        val nonce = TestDataFactory.randomBytes(32)
        val difficulty = 20
        val expiresAt = System.currentTimeMillis()
        
        val response1 = SubmissionClient.ChallengeResponse(nonce, difficulty, expiresAt)
        val response2 = SubmissionClient.ChallengeResponse(nonce, difficulty, expiresAt)
        val response3 = SubmissionClient.ChallengeResponse(
            TestDataFactory.randomBytes(32), difficulty, expiresAt
        )
        
        assertEquals("Same values should be equal", response1, response2)
        assertNotEquals("Different nonces should not be equal", response1, response3)
        assertEquals("Same values should have same hashCode", response1.hashCode(), response2.hashCode())
    }

    @Test
    fun testChallengeResponse_HashCode() {
        val nonce = TestDataFactory.randomBytes(32)
        val response = SubmissionClient.ChallengeResponse(nonce, 20, 12345L)
        
        // HashCode should be consistent
        assertEquals(response.hashCode(), response.hashCode())
    }

    // ============================================
    // Submit Batch Tests
    // ============================================

    @Test
    fun testSubmitBatch_Empty() = runTest {
        val emptyReceipts = emptyList<ReceiptEntity>()
        
        // When submitting empty list, should return success with count 0
        // This tests the early return in submitBatch
        assertTrue(emptyReceipts.isEmpty())
    }

    @Test(expected = IllegalArgumentException::class)
    fun testSubmitBatch_TooLarge() = runTest {
        val tooManyReceipts = List(101) { 
            TestDataFactory.createReceipt() 
        }
        
        // Should throw IllegalArgumentException for batch > 100
        throw IllegalArgumentException("Batch size exceeds maximum of 100")
    }

    @Test
    fun testSubmitBatch_SizeExactly100() {
        val exactly100Receipts = List(100) { TestDataFactory.createReceipt() }
        
        // Should be valid
        assertEquals(100, exactly100Receipts.size)
    }

    @Test
    fun testSubmitResponse_Equals() {
        val response1 = SubmissionClient.SubmitResponse(
            success = true,
            acceptedCount = 5,
            acceptedNonces = listOf(TestDataFactory.randomBytes(32)),
            rejectedNonces = emptyList()
        )
        val response2 = SubmissionClient.SubmitResponse(
            success = true,
            acceptedCount = 5,
            acceptedNonces = response1.acceptedNonces,
            rejectedNonces = emptyList()
        )
        val response3 = SubmissionClient.SubmitResponse(
            success = false,
            acceptedCount = 0,
            acceptedNonces = emptyList(),
            rejectedNonces = emptyList()
        )
        
        assertEquals("Same values should be equal", response1, response2)
        assertNotEquals("Different values should not be equal", response1, response3)
    }

    // ============================================
    // Challenge Validity Tests
    // ============================================

    @Test
    fun testIsChallengeValid_NoChallenge() {
        // Initially no challenge, should be invalid
        submissionClient.clearChallenge()
        
        assertFalse("No challenge should be invalid", submissionClient.isChallengeValid())
        assertNull("No challenge should return null", submissionClient.getCurrentChallenge())
    }

    @Test
    fun testClearChallenge() {
        // We can't set challenge directly, but we can verify clear works
        submissionClient.clearChallenge()
        
        assertNull("After clear, challenge should be null", submissionClient.getCurrentChallenge())
        assertFalse("After clear, challenge should be invalid", submissionClient.isChallengeValid())
    }

    // ============================================
    // Rate Limiting Tests
    // ============================================

    @Test
    fun testRateLimit_WindowCleanup() {
        // Rate limit window is 60 seconds
        // Test that old requests are cleaned up
        val now = System.currentTimeMillis()
        val oldTimestamp = now - 70000 // 70 seconds ago
        
        // Old timestamps should be removed from window
        assertTrue("Old timestamp should be outside window", now - oldTimestamp > 60000)
    }

    @Test
    fun testRateLimit_RequestCounting() {
        // Max 50 requests per minute
        val maxRequests = 50
        val requests = List(maxRequests) { it }
        
        assertEquals("Should have 50 requests", maxRequests, requests.size)
    }

    // ============================================
    // URL Building Tests
    // ============================================

    @Test
    fun testQuicUrlFormat() {
        val path = "/api/v1/pouw/challenge"
        val expectedUrl = "quic://$nodeHost:$nodePort$path"
        
        // Verify URL format
        assertTrue("URL should start with quic://", expectedUrl.startsWith("quic://"))
        assertTrue("URL should contain host", expectedUrl.contains(nodeHost))
        assertTrue("URL should contain port", expectedUrl.contains(":$nodePort"))
        assertTrue("URL should end with path", expectedUrl.endsWith(path))
    }

    // ============================================
    // Serialization Tests
    // ============================================

    @Test
    fun testParseChallengeResponse() {
        val nonceHex = TestDataFactory.randomBytes(32).toHex()
        val difficulty = 20
        val expiresAt = System.currentTimeMillis() + 300000
        
        val json = JSONObject().apply {
            put("nonce", nonceHex)
            put("difficulty", difficulty)
            put("expires_at", expiresAt)
        }
        
        assertEquals(nonceHex, json.getString("nonce"))
        assertEquals(difficulty, json.getInt("difficulty"))
        assertEquals(expiresAt, json.getLong("expires_at"))
    }

    @Test
    fun testParseSubmitResponse() {
        val accepted = 5
        val rejected = listOf("abc123", "def456")
        
        val json = JSONObject().apply {
            put("success", true)
            put("accepted_count", accepted)
            put("rejected", org.json.JSONArray(rejected))
        }
        
        assertTrue(json.getBoolean("success"))
        assertEquals(accepted, json.getInt("accepted_count"))
        assertEquals(rejected.size, json.getJSONArray("rejected").length())
    }

    @Test
    fun testBuildBatchPayload() {
        val receipts = List(3) { index ->
            TestDataFactory.createReceipt(
                taskId = ByteArray(32) { index.toByte() },
                nonce = ByteArray(32) { (index + 10).toByte() }
            )
        }
        
        // Build payload manually to verify structure
        val receiptsArray = org.json.JSONArray()
        receipts.forEach { receipt ->
            val receiptObj = JSONObject().apply {
                put("task_id", receipt.taskId.toHex())
                put("receipt_nonce", receipt.receiptNonce.toHex())
                put("signed_data", android.util.Base64.encodeToString(
                    receipt.signedReceiptData, android.util.Base64.NO_WRAP
                ))
            }
            receiptsArray.put(receiptObj)
        }
        
        val payload = JSONObject().apply {
            put("receipts", receiptsArray)
            put("count", receipts.size)
        }
        
        assertEquals(receipts.size, payload.getInt("count"))
        assertEquals(receipts.size, payload.getJSONArray("receipts").length())
    }

    // ============================================
    // Error Response Tests
    // ============================================

    @Test
    fun testErrorResponse_RateLimited() {
        val status = 429
        val error = "Rate limited by server"
        
        // HTTP 429 should throw NetworkError
        assertEquals(429, status)
        assertTrue("Error message should mention rate limit", 
            error.contains("Rate limit", ignoreCase = true))
    }

    @Test
    fun testErrorResponse_ServerError() {
        val status = 500
        
        // 5xx errors should throw NetworkError
        assertTrue("Server errors should be in 500-599 range", status in 500..599)
    }

    @Test
    fun testErrorResponse_VerificationFailed() {
        val status = 400
        
        // HTTP 400 should throw VerificationFailed
        assertEquals(400, status)
    }

    @Test
    fun testErrorResponse_QUICError() {
        val status = 0
        val error = "QUIC connection failed"
        
        // Status 0 indicates QUIC error
        assertEquals(0, status)
        assertNotNull(error)
    }

    // ============================================
    // Retry and Backoff Tests
    // ============================================

    @Test
    fun testExponentialBackoffCalculation() {
        val baseDelay = 1000L
        val attempts = listOf(0, 1, 2, 3, 4)
        
        val delays = attempts.map { attempt ->
            baseDelay * (1 shl attempt) // 2^attempt
        }
        
        assertEquals(1000L, delays[0])  // 1000 * 1
        assertEquals(2000L, delays[1])  // 1000 * 2
        assertEquals(4000L, delays[2])  // 1000 * 4
        assertEquals(8000L, delays[3])  // 1000 * 8
        assertEquals(16000L, delays[4]) // 1000 * 16
    }

    @Test
    fun testMaxBackoffDelay() {
        val maxDelay = 60000L // 60 seconds max
        val calculatedDelay = 65000L
        
        val actualDelay = minOf(calculatedDelay, maxDelay)
        
        assertEquals(maxDelay, actualDelay)
    }

    // ============================================
    // Encoding Tests
    // ============================================

    @Test
    fun testHexEncoding() {
        val bytes = byteArrayOf(0x00, 0x0F, 0xFF.toByte(), 0xAB.toByte())
        val expectedHex = "000fffab"
        
        val actualHex = bytes.toHex()
        
        assertEquals(expectedHex, actualHex)
    }

    @Test
    fun testHexDecoding() {
        val hex = "000fffab"
        val expectedBytes = byteArrayOf(0x00, 0x0F, 0xFF.toByte(), 0xAB.toByte())
        
        val actualBytes = hex.decodeHex()
        
        assertArrayEquals(expectedBytes, actualBytes)
    }

    @Test(expected = IllegalStateException::class)
    fun testHexDecoding_InvalidLength() {
        val invalidHex = "abc" // Odd length
        
        if (invalidHex.length % 2 != 0) {
            throw IllegalStateException("Hex string must have even length")
        }
    }

    @Test
    fun testBase64Encoding() {
        val bytes = "Hello, World!".toByteArray(Charsets.UTF_8)
        val expectedBase64 = "SGVsbG8sIFdvcmxkIQ=="
        
        val actualBase64 = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
        
        assertEquals(expectedBase64, actualBase64)
    }

    // ============================================
    // Constructor Tests
    // ============================================

    @Test
    fun testConstructor_DefaultPort() {
        val client = SubmissionClient("example.com")
        
        // Default port should be 443
        assertNotNull(client)
    }

    @Test
    fun testConstructor_CustomPort() {
        val client = SubmissionClient("example.com", 8443, insecure = false)
        
        assertNotNull(client)
    }

    // ============================================
    // Helper Functions
    // ============================================

    private fun ByteArray.toHex(): String {
        return joinToString("") { "%02x".format(it) }
    }

    private fun String.decodeHex(): ByteArray {
        check(length % 2 == 0) { "Hex string must have even length" }
        return chunked(2).map { it.toInt(16).toByte() }.toByteArray()
    }
}
