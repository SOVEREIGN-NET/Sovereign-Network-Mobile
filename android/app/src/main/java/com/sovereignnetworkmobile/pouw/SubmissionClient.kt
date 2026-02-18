package com.sovereignnetworkmobile.pouw

import android.util.Log
import com.sovereignnetworkmobile.NativeQuicBridge
import com.sovereignnetworkmobile.pouw.model.PoUWError
import com.sovereignnetworkmobile.pouw.model.ReceiptEntity
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicLong

/**
 * SubmissionClient handles submitting PoUW receipts to the network via QUIC.
 * Uses NativeQuicBridge for all network communication.
 * 
 * Rate limits:
 * - Max 50 requests per 60 seconds for challenge and submit
 * - Max 100 receipts per batch
 */
class SubmissionClient(
    private val nodeHost: String,
    private val nodePort: Int = 443,
    private val insecure: Boolean = true
) {
    
    companion object {
        private const val TAG = "PoUWSubmissionClient"
        private const val MAX_REQUESTS_PER_MINUTE = 50
        private const val RATE_LIMIT_WINDOW_MS = 60_000L
        private const val MAX_BATCH_SIZE = 100
        private const val DEFAULT_TIMEOUT_SECS = 30
        private const val CHALLENGE_PATH = "/api/v1/pouw/challenge"
        private const val SUBMIT_PATH = "/api/v1/pouw/submit"
        private const val BATCH_SUBMIT_PATH = "/api/v1/pouw/batch"
    }
    
    private val requestTimestamps = mutableListOf<Long>()
    private val rateLimitLock = Any()
    
    // Track challenge expiration
    private var currentChallengeNonce: ByteArray? = null
    private var challengeExpirationTime: Long = 0
    private val CHALLENGE_VALIDITY_MS = 5 * 60 * 1000 // 5 minutes
    
    /**
     * Request a new PoUW challenge from the network.
     * 
     * @return Challenge response containing nonce and difficulty
     * @throws PoUWError.NetworkError if request fails
     * @throws PoUWError.ChallengeExpired if challenge request times out
     * @throws PoUWError.SerializationError if response parsing fails
     */
    @Throws(PoUWError::class)
    suspend fun requestChallenge(): ChallengeResponse {
        checkRateLimit()
        
        val url = buildQuicUrl(CHALLENGE_PATH)
        
        return try {
            val result = withContext(Dispatchers.IO) {
                NativeQuicBridge.request(
                    url = url,
                    method = "GET",
                    headersJson = "{}",
                    body = "",
                    timeoutSecs = DEFAULT_TIMEOUT_SECS,
                    insecure = insecure,
                    alpn = "public" // Public ALPN for challenge requests
                )
            }
            
            recordRequest()
            
            val status = result?.get("status") as? Int ?: 0
            val body = result?.get("body") as? String
            val error = result?.get("error") as? String
            
            when (status) {
                200 -> parseChallengeResponse(body ?: "")
                429 -> throw PoUWError.NetworkError(Exception("Rate limited by server"))
                in 500..599 -> throw PoUWError.NetworkError(Exception("Server error: $status"))
                0 -> throw PoUWError.NetworkError(Exception("QUIC error: $error"))
                else -> throw PoUWError.NetworkError(Exception("HTTP $status"))
            }
        } catch (e: PoUWError) {
            throw e
        } catch (e: Exception) {
            Log.e(TAG, "Challenge request failed: ${e.message}", e)
            throw PoUWError.NetworkError(e)
        }
    }
    
    /**
     * Submits a single receipt to the network.
     * 
     * @param receipt The receipt to submit
     * @return Submission response from the network
     * @throws PoUWError.NetworkError if submission fails
     */
    @Throws(PoUWError::class)
    suspend fun submitReceipt(receipt: ReceiptEntity): SubmitResponse {
        return submitBatch(listOf(receipt))
    }
    
    /**
     * Submits multiple receipts in a batch.
     * 
     * @param receipts List of receipts to submit (max 100)
     * @return Submission response from the network
     * @throws PoUWError.NetworkError if submission fails
     * @throws IllegalArgumentException if batch size exceeds MAX_BATCH_SIZE
     */
    @Throws(PoUWError::class)
    suspend fun submitBatch(receipts: List<ReceiptEntity>): SubmitResponse {
        if (receipts.isEmpty()) {
            return SubmitResponse(success = true, acceptedCount = 0, rejectedNonces = emptyList())
        }
        
        if (receipts.size > MAX_BATCH_SIZE) {
            throw IllegalArgumentException("Batch size exceeds maximum of $MAX_BATCH_SIZE")
        }
        
        checkRateLimit()
        
        val url = buildQuicUrl(if (receipts.size == 1) SUBMIT_PATH else BATCH_SUBMIT_PATH)
        val body = buildBatchPayload(receipts)
        
        return try {
            val result = withContext(Dispatchers.IO) {
                NativeQuicBridge.request(
                    url = url,
                    method = "POST",
                    headersJson = JSONObject().apply {
                        put("content-type", "application/json")
                    }.toString(),
                    body = body,
                    timeoutSecs = DEFAULT_TIMEOUT_SECS,
                    insecure = insecure,
                    alpn = "public" // Public ALPN for submission
                )
            }
            
            recordRequest()
            
            val status = result?.get("status") as? Int ?: 0
            val responseBody = result?.get("body") as? String
            val error = result?.get("error") as? String
            
            when (status) {
                200, 201, 202 -> parseSubmitResponse(responseBody ?: "", receipts)
                400 -> throw PoUWError.VerificationFailed()
                429 -> throw PoUWError.NetworkError(Exception("Rate limited by server"))
                in 500..599 -> throw PoUWError.NetworkError(Exception("Server error: $status"))
                0 -> throw PoUWError.NetworkError(Exception("QUIC error: $error"))
                else -> throw PoUWError.NetworkError(Exception("HTTP $status"))
            }
        } catch (e: PoUWError) {
            throw e
        } catch (e: Exception) {
            Log.e(TAG, "Submit failed: ${e.message}", e)
            throw PoUWError.NetworkError(e)
        }
    }
    
    /**
     * Verifies that a challenge is still valid (not expired).
     * 
     * @return true if the current challenge is valid
     */
    fun isChallengeValid(): Boolean {
        return currentChallengeNonce != null && 
               System.currentTimeMillis() < challengeExpirationTime
    }
    
    /**
     * Gets the current challenge nonce if valid.
     * 
     * @return The challenge nonce or null if expired/not available
     */
    fun getCurrentChallenge(): ByteArray? {
        return if (isChallengeValid()) currentChallengeNonce else null
    }
    
    /**
     * Clears the current challenge, forcing a new challenge request.
     */
    fun clearChallenge() {
        currentChallengeNonce = null
        challengeExpirationTime = 0
    }
    
    /**
     * Builds the QUIC URL for the given path.
     */
    private fun buildQuicUrl(path: String): String {
        return "quic://$nodeHost:$nodePort$path"
    }
    
    /**
     * Parses the challenge response from the network.
     */
    private fun parseChallengeResponse(body: String): ChallengeResponse {
        return try {
            val json = JSONObject(body)
            val nonce = json.getString("nonce").decodeHex()
            val difficulty = json.getInt("difficulty")
            val expiresAt = json.optLong("expires_at", System.currentTimeMillis() + CHALLENGE_VALIDITY_MS)
            
            currentChallengeNonce = nonce
            challengeExpirationTime = expiresAt
            
            ChallengeResponse(
                nonce = nonce,
                difficulty = difficulty,
                expiresAt = expiresAt
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse challenge response: ${e.message}")
            throw PoUWError.SerializationError()
        }
    }
    
    /**
     * Parses the submission response from the network.
     */
    private fun parseSubmitResponse(body: String, submittedReceipts: List<ReceiptEntity>): SubmitResponse {
        return try {
            val json = JSONObject(body)
            val success = json.optBoolean("success", true)
            val acceptedCount = json.optInt("accepted_count", submittedReceipts.size)
            
            val rejectedArray = json.optJSONArray("rejected")
            val rejectedNonces = mutableListOf<ByteArray>()
            if (rejectedArray != null) {
                for (i in 0 until rejectedArray.length()) {
                    rejectedNonces.add(rejectedArray.getString(i).decodeHex())
                }
            }
            
            val acceptedNonces = submittedReceipts.map { it.receiptNonce } - rejectedNonces.toSet()
            
            SubmitResponse(
                success = success,
                acceptedCount = acceptedCount,
                acceptedNonces = acceptedNonces,
                rejectedNonces = rejectedNonces
            )
        } catch (e: Exception) {
            // If parsing fails but HTTP was 200, assume success
            SubmitResponse(
                success = true,
                acceptedCount = submittedReceipts.size,
                acceptedNonces = submittedReceipts.map { it.receiptNonce },
                rejectedNonces = emptyList()
            )
        }
    }
    
    /**
     * Builds the JSON payload for batch submission.
     */
    private fun buildBatchPayload(receipts: List<ReceiptEntity>): String {
        val receiptsArray = JSONArray()
        
        receipts.forEach { receipt ->
            val receiptObj = JSONObject().apply {
                put("task_id", receipt.taskId.toHex())
                put("receipt_nonce", receipt.receiptNonce.toHex())
                put("signed_data", receipt.signedReceiptData.toBase64())
            }
            receiptsArray.put(receiptObj)
        }
        
        return JSONObject().apply {
            put("receipts", receiptsArray)
            put("count", receipts.size)
        }.toString()
    }
    
    /**
     * Checks if we're within rate limits.
     * Throws NetworkError if rate limit would be exceeded.
     */
    private fun checkRateLimit() {
        synchronized(rateLimitLock) {
            val now = System.currentTimeMillis()
            // Remove timestamps outside the window
            requestTimestamps.removeAll { now - it > RATE_LIMIT_WINDOW_MS }
            
            if (requestTimestamps.size >= MAX_REQUESTS_PER_MINUTE) {
                val oldestRequest = requestTimestamps.firstOrNull() ?: now
                val waitTime = RATE_LIMIT_WINDOW_MS - (now - oldestRequest)
                throw PoUWError.NetworkError(
                    Exception("Rate limit exceeded. Try again in ${waitTime / 1000} seconds.")
                )
            }
        }
    }
    
    /**
     * Records a request timestamp for rate limiting.
     */
    private fun recordRequest() {
        synchronized(rateLimitLock) {
            requestTimestamps.add(System.currentTimeMillis())
        }
    }
    
    /**
     * Converts ByteArray to hex string.
     */
    private fun ByteArray.toHex(): String {
        return joinToString("") { "%02x".format(it) }
    }
    
    /**
     * Converts hex string to ByteArray.
     */
    private fun String.decodeHex(): ByteArray {
        check(length % 2 == 0) { "Hex string must have even length" }
        return chunked(2).map { it.toInt(16).toByte() }.toByteArray()
    }
    
    /**
     * Converts ByteArray to Base64 string.
     */
    private fun ByteArray.toBase64(): String {
        return android.util.Base64.encodeToString(this, android.util.Base64.NO_WRAP)
    }
    
    /**
     * Response from challenge request.
     */
    data class ChallengeResponse(
        val nonce: ByteArray,
        val difficulty: Int,
        val expiresAt: Long
    ) {
        override fun equals(other: Any?): Boolean {
            if (this === other) return true
            if (other !is ChallengeResponse) return false
            return nonce.contentEquals(other.nonce) && 
                   difficulty == other.difficulty &&
                   expiresAt == other.expiresAt
        }
        
        override fun hashCode(): Int {
            var result = nonce.contentHashCode()
            result = 31 * result + difficulty
            result = 31 * result + expiresAt.hashCode()
            return result
        }
    }
    
    /**
     * Response from receipt submission.
     */
    data class SubmitResponse(
        val success: Boolean,
        val acceptedCount: Int,
        val acceptedNonces: List<ByteArray> = emptyList(),
        val rejectedNonces: List<ByteArray> = emptyList()
    )
}
