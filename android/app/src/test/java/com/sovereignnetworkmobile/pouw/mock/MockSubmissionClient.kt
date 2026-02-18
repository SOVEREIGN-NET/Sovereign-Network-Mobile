package com.sovereignnetworkmobile.pouw.mock

import com.sovereignnetworkmobile.pouw.SubmissionClient
import com.sovereignnetworkmobile.pouw.model.PoUWError
import com.sovereignnetworkmobile.pouw.model.ReceiptEntity
import com.sovereignnetworkmobile.pouw.util.TestDataFactory

/**
 * Mock implementation of SubmissionClient for testing.
 * Simulates network submission without actual QUIC calls.
 */
class MockSubmissionClient(
    private val nodeHost: String = "test.example.com",
    private val nodePort: Int = 443
) {

    private var challengeResponse: SubmissionClient.ChallengeResponse? = null
    private var submitResponse: SubmissionClient.SubmitResponse? = null
    private var shouldFailChallenge = false
    private var shouldFailSubmit = false
    private val challengeHistory = mutableListOf<Long>()
    private val submitHistory = mutableListOf<SubmitCall>()
    private var retryDelays = mutableListOf<Long>()

    /**
     * Records details of submit calls.
     */
    data class SubmitCall(
        val receipts: List<ReceiptEntity>,
        val timestamp: Long
    )

    /**
     * Mocks requestChallenge behavior.
     */
    suspend fun requestChallenge(): SubmissionClient.ChallengeResponse {
        challengeHistory.add(System.currentTimeMillis())

        if (shouldFailChallenge) {
            throw PoUWError.NetworkError(Exception("Mock challenge failure"))
        }

        return challengeResponse ?: TestDataFactory.createChallengeResponse()
    }

    /**
     * Mocks submitReceipt behavior.
     */
    suspend fun submitReceipt(receipt: ReceiptEntity): SubmissionClient.SubmitResponse {
        return submitBatch(listOf(receipt))
    }

    /**
     * Mocks submitBatch behavior.
     */
    suspend fun submitBatch(receipts: List<ReceiptEntity>): SubmissionClient.SubmitResponse {
        submitHistory.add(SubmitCall(receipts, System.currentTimeMillis()))

        if (shouldFailSubmit) {
            throw PoUWError.NetworkError(Exception("Mock submit failure"))
        }

        if (receipts.isEmpty()) {
            return SubmissionClient.SubmitResponse(
                success = true,
                acceptedCount = 0,
                acceptedNonces = emptyList(),
                rejectedNonces = emptyList()
            )
        }

        return submitResponse ?: SubmissionClient.SubmitResponse(
            success = true,
            acceptedCount = receipts.size,
            acceptedNonces = receipts.map { it.receiptNonce },
            rejectedNonces = emptyList()
        )
    }

    /**
     * Checks if challenge is valid (mock implementation).
     */
    fun isChallengeValid(): Boolean {
        return challengeResponse != null &&
               System.currentTimeMillis() < challengeResponse!!.expiresAt
    }

    /**
     * Gets current challenge nonce if valid.
     */
    fun getCurrentChallenge(): ByteArray? {
        return if (isChallengeValid()) challengeResponse?.nonce else null
    }

    /**
     * Clears the current challenge.
     */
    fun clearChallenge() {
        challengeResponse = null
    }

    /**
     * Sets the mock challenge response.
     */
    fun setChallengeResponse(response: SubmissionClient.ChallengeResponse) {
        challengeResponse = response
    }

    /**
     * Sets the mock submit response.
     */
    fun setSubmitResponse(response: SubmissionClient.SubmitResponse) {
        submitResponse = response
    }

    /**
     * Sets whether challenge requests should fail.
     */
    fun setShouldFailChallenge(fail: Boolean) {
        shouldFailChallenge = fail
    }

    /**
     * Sets whether submit requests should fail.
     */
    fun setShouldFailSubmit(fail: Boolean) {
        shouldFailSubmit = fail
    }

    /**
     * Returns challenge request history.
     */
    fun getChallengeHistory(): List<Long> = challengeHistory.toList()

    /**
     * Returns submit request history.
     */
    fun getSubmitHistory(): List<SubmitCall> = submitHistory.toList()

    /**
     * Clears all history.
     */
    fun clearHistory() {
        challengeHistory.clear()
        submitHistory.clear()
    }

    /**
     * Records a retry delay for testing backoff behavior.
     */
    fun recordRetryDelay(delayMs: Long) {
        retryDelays.add(delayMs)
    }

    /**
     * Gets recorded retry delays.
     */
    fun getRetryDelays(): List<Long> = retryDelays.toList()

    /**
     * Simulates exponential backoff calculation.
     */
    fun calculateBackoff(attempt: Int, baseDelayMs: Long = 1000): Long {
        val delay = baseDelayMs * (1 shl attempt) // 2^attempt
        val jitter = (Math.random() * 100).toLong()
        return delay + jitter
    }
}
