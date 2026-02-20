package com.sovereignnetworkmobile.pouw

import com.sovereignnetworkmobile.pouw.model.PoUWError
import java.security.MessageDigest
import java.security.NoSuchAlgorithmException

/**
 * VerifierEngine handles hash verification for PoUW tasks.
 * Uses SHA-256 via java.security.MessageDigest for challenge verification.
 */
object VerifierEngine {
    
    private const val ALGORITHM = "SHA-256"
    private const val HASH_LENGTH = 32 // SHA-256 produces 32 bytes
    
    /**
     * Verifies that the provided hash meets the difficulty requirement.
     * The hash is valid if its first [difficulty] bits are zero.
     * 
     * @param hash The SHA-256 hash to verify
     * @param difficulty Number of leading zero bits required (0-256)
     * @return true if the hash meets the difficulty requirement
     */
    fun verifyHashDifficulty(hash: ByteArray, difficulty: Int): Boolean {
        if (hash.size != HASH_LENGTH) {
            return false
        }
        
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
     * Computes SHA-256 hash of the input data.
     * 
     * @param data The data to hash
     * @return The 32-byte SHA-256 hash
     * @throws PoUWError.VerificationFailed if the algorithm is unavailable
     */
    fun computeHash(data: ByteArray): ByteArray {
        return try {
            MessageDigest.getInstance(ALGORITHM).apply {
                update(data)
            }.digest()
        } catch (e: NoSuchAlgorithmException) {
            throw PoUWError.VerificationFailed()
        }
    }
    
    /**
     * Computes double SHA-256 hash (hash of hash).
     * Used in some PoUW challenge formats for additional security.
     * 
     * @param data The data to hash
     * @return The 32-byte double SHA-256 hash
     */
    fun computeDoubleHash(data: ByteArray): ByteArray {
        return computeHash(computeHash(data))
    }
    
    /**
     * Verifies that the computed hash of [data] matches [expectedHash].
     * 
     * @param data The original data
     * @param expectedHash The expected hash
     * @return true if hashes match
     */
    fun verifyDataHash(data: ByteArray, expectedHash: ByteArray): Boolean {
        return computeHash(data).contentEquals(expectedHash)
    }
    
    /**
     * Verifies a PoUW challenge response.
     * The challenge is solved if hash(challengeNonce || workerNonce) meets difficulty.
     * 
     * @param challengeNonce The challenge nonce from the network
     * @param workerNonce The worker's computed nonce
     * @param difficulty The required difficulty in bits
     * @return true if the challenge is solved
     */
    fun verifyChallenge(challengeNonce: ByteArray, workerNonce: ByteArray, difficulty: Int): Boolean {
        val combined = challengeNonce + workerNonce
        val hash = computeHash(combined)
        return verifyHashDifficulty(hash, difficulty)
    }
    
    /**
     * Finds a valid worker nonce that solves the challenge.
     * This is the "work" part of Proof of Useful Work.
     * 
     * @param challengeNonce The challenge nonce from the network
     * @param difficulty The required difficulty in bits
     * @param maxAttempts Maximum number of attempts before giving up (0 = unlimited)
     * @return The worker nonce that solves the challenge, or null if not found
     */
    fun solveChallenge(challengeNonce: ByteArray, difficulty: Int, maxAttempts: Long = 0): ByteArray? {
        var attempt = 0L
        while (maxAttempts == 0L || attempt < maxAttempts) {
            val workerNonce = generateRandomNonce(32)
            if (verifyChallenge(challengeNonce, workerNonce, difficulty)) {
                return workerNonce
            }
            attempt++
            
            // Yield periodically to avoid blocking
            if (attempt % 10000 == 0L) {
                Thread.yield()
            }
        }
        return null
    }
    
    /**
     * Generates a cryptographically random nonce.
     * 
     * @param length Length of the nonce in bytes
     * @return Random bytes
     */
    fun generateRandomNonce(length: Int): ByteArray {
        val nonce = ByteArray(length)
        java.security.SecureRandom().nextBytes(nonce)
        return nonce
    }
    
    /**
     * Verifies task content hash matches expected hash.
     * 
     * @param content The task content bytes
     * @param expectedHash The expected content hash
     * @return true if content hash matches
     * @throws PoUWError.InvalidContent if content is empty or verification fails
     */
    @Throws(PoUWError::class)
    fun verifyContentHash(content: ByteArray, expectedHash: ByteArray): Boolean {
        if (content.isEmpty()) {
            throw PoUWError.InvalidContent()
        }
        val actualHash = computeHash(content)
        return actualHash.contentEquals(expectedHash)
    }
}
