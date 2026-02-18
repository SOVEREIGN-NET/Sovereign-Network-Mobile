package com.sovereignnetworkmobile.pouw.mock

import com.sovereignnetworkmobile.pouw.VerifierEngine
import com.sovereignnetworkmobile.pouw.util.TestDataFactory

/**
 * Mock wrapper for VerifierEngine that allows injecting custom behavior.
 * Since VerifierEngine is an object (singleton), this provides a mockable wrapper.
 */
class MockVerifierEngine {

    private var mockHashResult: ByteArray? = null
    private var mockVerifyResult: Boolean? = null
    private var shouldFailComputeHash = false
    private var delayMs: Long = 0

    private val computeHistory = mutableListOf<ComputeCall>()
    private val verifyHistory = mutableListOf<VerifyCall>()

    /**
     * Records compute hash calls.
     */
    data class ComputeCall(
        val data: ByteArray,
        val timestamp: Long
    )

    /**
     * Records verify calls.
     */
    data class VerifyCall(
        val data: ByteArray,
        val hash: ByteArray,
        val result: Boolean,
        val timestamp: Long
    )

    /**
     * Computes hash, optionally using mock behavior.
     */
    fun computeHash(data: ByteArray): ByteArray {
        computeHistory.add(ComputeCall(data, System.currentTimeMillis()))

        if (delayMs > 0) {
            Thread.sleep(delayMs)
        }

        if (shouldFailComputeHash) {
            throw RuntimeException("Mock hash computation failure")
        }

        return mockHashResult ?: VerifierEngine.computeHash(data)
    }

    /**
     * Computes double hash.
     */
    fun computeDoubleHash(data: ByteArray): ByteArray {
        return computeHash(computeHash(data))
    }

    /**
     * Verifies data hash.
     */
    fun verifyDataHash(data: ByteArray, expectedHash: ByteArray): Boolean {
        val result = mockVerifyResult ?: computeHash(data).contentEquals(expectedHash)
        verifyHistory.add(VerifyCall(data, expectedHash, result, System.currentTimeMillis()))
        return result
    }

    /**
     * Verifies hash difficulty.
     */
    fun verifyHashDifficulty(hash: ByteArray, difficulty: Int): Boolean {
        return mockVerifyResult ?: VerifierEngine.verifyHashDifficulty(hash, difficulty)
    }

    /**
     * Verifies challenge.
     */
    fun verifyChallenge(
        challengeNonce: ByteArray,
        workerNonce: ByteArray,
        difficulty: Int
    ): Boolean {
        val combined = challengeNonce + workerNonce
        val hash = computeHash(combined)
        return verifyHashDifficulty(hash, difficulty)
    }

    /**
     * Solves a challenge.
     */
    fun solveChallenge(
        challengeNonce: ByteArray,
        difficulty: Int,
        maxAttempts: Long = 0
    ): ByteArray? {
        return TestDataFactory.solveChallenge(challengeNonce, difficulty, maxAttempts)
    }

    /**
     * Generates random nonce.
     */
    fun generateRandomNonce(length: Int): ByteArray {
        return TestDataFactory.randomBytes(length)
    }

    /**
     * Sets mock hash result.
     */
    fun setMockHashResult(result: ByteArray?) {
        mockHashResult = result
    }

    /**
     * Sets mock verify result.
     */
    fun setMockVerifyResult(result: Boolean?) {
        mockVerifyResult = result
    }

    /**
     * Sets whether compute hash should fail.
     */
    fun setShouldFailComputeHash(fail: Boolean) {
        shouldFailComputeHash = fail
    }

    /**
     * Sets delay for operations.
     */
    fun setDelay(delayMs: Long) {
        this.delayMs = delayMs
    }

    /**
     * Returns compute history.
     */
    fun getComputeHistory(): List<ComputeCall> = computeHistory.toList()

    /**
     * Returns verify history.
     */
    fun getVerifyHistory(): List<VerifyCall> = verifyHistory.toList()

    /**
     * Clears all history.
     */
    fun clearHistory() {
        computeHistory.clear()
        verifyHistory.clear()
    }

    /**
     * Clears all mocks.
     */
    fun clearMocks() {
        mockHashResult = null
        mockVerifyResult = null
        shouldFailComputeHash = false
        delayMs = 0
    }
}
