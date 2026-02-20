package com.sovereignnetworkmobile.pouw.mock

import com.sovereignnetworkmobile.pouw.IdentitySigner
import com.sovereignnetworkmobile.pouw.model.PoUWError
import com.sovereignnetworkmobile.pouw.util.TestDataFactory

/**
 * Mock implementation of IdentitySigner for testing.
 * Provides deterministic signing without requiring native Identity.
 */
class MockIdentitySigner(
    private val shouldFail: Boolean = false,
    private val signatureSize: Int = 4595 // Dilithium5 signature size
) {

    private val signHistory = mutableListOf<SignCall>()
    private var failNextCall = false

    /**
     * Data class to track sign calls for verification.
     */
    data class SignCall(
        val taskId: ByteArray,
        val receiptNonce: ByteArray,
        val challengeNonce: ByteArray,
        val workerNonce: ByteArray,
        val contentHash: ByteArray,
        val timestamp: Long
    )

    /**
     * Signs receipt data and records the call.
     */
    fun signReceipt(
        taskId: ByteArray,
        receiptNonce: ByteArray,
        challengeNonce: ByteArray,
        workerNonce: ByteArray,
        contentHash: ByteArray,
        timestamp: Long
    ): ByteArray {
        if (shouldFail || failNextCall) {
            failNextCall = false
            throw PoUWError.SignatureError()
        }

        signHistory.add(
            SignCall(
                taskId = taskId,
                receiptNonce = receiptNonce,
                challengeNonce = challengeNonce,
                workerNonce = workerNonce,
                contentHash = contentHash,
                timestamp = timestamp
            )
        )

        // Return deterministic "signature" based on input
        return generateMockSignature(taskId, receiptNonce)
    }

    /**
     * Signs a message.
     */
    fun sign(message: ByteArray): ByteArray {
        if (shouldFail || failNextCall) {
            failNextCall = false
            throw PoUWError.SignatureError()
        }

        if (message.isEmpty()) {
            throw PoUWError.SignatureError()
        }

        return generateMockSignature(message)
    }

    /**
     * Gets the mock public key.
     */
    fun getPublicKey(): ByteArray {
        return ByteArray(2592) { it.toByte() } // Dilithium5 public key size
    }

    /**
     * Gets the mock DID.
     */
    fun getDid(): String {
        return "did:sov:test:mock"
    }

    /**
     * Gets the mock node ID.
     */
    fun getNodeId(): ByteArray {
        return ByteArray(32) { 0x01 }
    }

    /**
     * Returns the history of sign calls.
     */
    fun getSignHistory(): List<SignCall> = signHistory.toList()

    /**
     * Clears the sign history.
     */
    fun clearHistory() {
        signHistory.clear()
    }

    /**
     * Sets the next call to fail.
     */
    fun setFailNextCall() {
        failNextCall = true
    }

    /**
     * Generates a deterministic mock signature.
     */
    private fun generateMockSignature(vararg inputs: ByteArray): ByteArray {
        // Create a deterministic signature based on inputs
        val combined = inputs.reduce { acc, bytes -> acc + bytes }
        val base = TestDataFactory.computeHash(combined)
        
        // Expand to signature size
        return ByteArray(signatureSize) { index ->
            base[index % base.size]
        }
    }
}
