package com.sovereignnetworkmobile.pouw.util

import com.sovereignnetworkmobile.pouw.model.ReceiptEntity
import com.sovereignnetworkmobile.pouw.model.ReceiptState
import com.sovereignnetworkmobile.pouw.SubmissionClient
import java.security.MessageDigest
import java.security.SecureRandom

/**
 * Factory for creating test data objects.
 * Provides consistent test data generation for unit tests.
 */
object TestDataFactory {

    private val secureRandom = SecureRandom()

    /**
     * Creates a test receipt entity with specified parameters.
     */
    fun createReceipt(
        nonce: ByteArray = randomBytes(32),
        taskId: ByteArray = randomBytes(32),
        state: ReceiptState = ReceiptState.CREATED,
        signedData: ByteArray = randomBytes(200),
        createdAt: Long = System.currentTimeMillis(),
        retryCount: Int = 0,
        lastError: String? = null
    ): ReceiptEntity {
        return ReceiptEntity(
            receiptNonce = nonce,
            taskId = taskId,
            state = state,
            signedReceiptData = signedData,
            createdAt = createdAt,
            retryCount = retryCount,
            lastError = lastError
        )
    }

    /**
     * Creates a list of test receipts with sequential timestamps.
     */
    fun createReceipts(count: Int, state: ReceiptState = ReceiptState.CREATED): List<ReceiptEntity> {
        val baseTime = System.currentTimeMillis()
        return (0 until count).map { index ->
            createReceipt(
                nonce = randomBytes(32),
                state = state,
                createdAt = baseTime + index * 1000
            )
        }
    }

    /**
     * Creates a challenge response for testing.
     */
    fun createChallengeResponse(
        nonce: ByteArray = randomBytes(32),
        difficulty: Int = 20,
        expiresAt: Long = System.currentTimeMillis() + 300_000
    ): SubmissionClient.ChallengeResponse {
        return SubmissionClient.ChallengeResponse(
            nonce = nonce,
            difficulty = difficulty,
            expiresAt = expiresAt
        )
    }

    /**
     * Creates a submit response for testing.
     */
    fun createSubmitResponse(
        success: Boolean = true,
        acceptedCount: Int = 1,
        acceptedNonces: List<ByteArray> = emptyList(),
        rejectedNonces: List<ByteArray> = emptyList()
    ): SubmissionClient.SubmitResponse {
        return SubmissionClient.SubmitResponse(
            success = success,
            acceptedCount = acceptedCount,
            acceptedNonces = acceptedNonces,
            rejectedNonces = rejectedNonces
        )
    }

    /**
     * Generates random bytes of specified length.
     */
    fun randomBytes(length: Int): ByteArray {
        return ByteArray(length).apply {
            secureRandom.nextBytes(this)
        }
    }

    /**
     * Generates a valid SHA-256 hash from data.
     */
    fun computeHash(data: ByteArray): ByteArray {
        return MessageDigest.getInstance("SHA-256").digest(data)
    }

    /**
     * Creates a hash with specific difficulty (leading zero bits).
     * Note: This may take a long time for high difficulties.
     */
    fun createHashWithDifficulty(difficulty: Int): ByteArray {
        var nonce = 0L
        while (true) {
            val data = nonce.toBigEndianBytes()
            val hash = computeHash(data)
            if (hasLeadingZeroBits(hash, difficulty)) {
                return hash
            }
            nonce++
            if (nonce % 100000 == 0L) {
                Thread.yield()
            }
        }
    }

    /**
     * Creates a worker nonce that solves a challenge.
     */
    fun solveChallenge(
        challengeNonce: ByteArray,
        difficulty: Int,
        maxAttempts: Long = 1_000_000
    ): ByteArray? {
        for (attempt in 0 until maxAttempts) {
            val workerNonce = randomBytes(32)
            val combined = challengeNonce + workerNonce
            val hash = computeHash(combined)
            if (hasLeadingZeroBits(hash, difficulty)) {
                return workerNonce
            }
        }
        return null
    }

    /**
     * Checks if a hash has the specified number of leading zero bits.
     */
    private fun hasLeadingZeroBits(hash: ByteArray, difficulty: Int): Boolean {
        var bitsChecked = 0
        for (byte in hash) {
            for (bit in 7 downTo 0) {
                if (bitsChecked >= difficulty) {
                    return true
                }
                val bitValue = (byte.toInt() shr bit) and 1
                if (bitValue != 0) {
                    return false
                }
                bitsChecked++
            }
        }
        return true
    }

    /**
     * Converts Long to 8-byte big-endian byte array.
     */
    private fun Long.toBigEndianBytes(): ByteArray {
        return byteArrayOf(
            (this shr 56).toByte(),
            (this shr 48).toByte(),
            (this shr 40).toByte(),
            (this shr 32).toByte(),
            (this shr 24).toByte(),
            (this shr 16).toByte(),
            (this shr 8).toByte(),
            this.toByte()
        )
    }

    /**
     * Converts ByteArray to hex string.
     */
    fun ByteArray.toHex(): String {
        return joinToString("") { "%02x".format(it) }
    }

    /**
     * Creates a merkle proof for testing.
     */
    fun createMerkleProof(
        leaf: ByteArray = randomBytes(32),
        siblings: List<ByteArray> = listOf(randomBytes(32), randomBytes(32)),
        indices: List<Int> = listOf(0, 1)
    ): MerkleProofData {
        return MerkleProofData(leaf, siblings, indices)
    }

    /**
     * Data class representing a merkle proof for testing.
     */
    data class MerkleProofData(
        val leaf: ByteArray,
        val siblings: List<ByteArray>,
        val indices: List<Int>
    )
}
