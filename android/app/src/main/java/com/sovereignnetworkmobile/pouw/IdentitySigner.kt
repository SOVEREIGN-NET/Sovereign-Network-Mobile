package com.sovereignnetworkmobile.pouw

import android.util.Log
import com.sovereignnetworkmobile.Identity
import com.sovereignnetworkmobile.pouw.model.PoUWError

/**
 * IdentitySigner provides Dilithium5 signing via the Rust FFI Identity class.
 * Secret keys never leave Rust memory - signing is delegated to the native layer.
 */
class IdentitySigner(private val identity: Identity) {
    
    companion object {
        private const val TAG = "PoUWIdentitySigner"
        private const val SIGNATURE_LENGTH = 4595 // Dilithium5 signature size
    }
    
    /**
     * Signs arbitrary message bytes using Dilithium5.
     * Delegates to Identity.signMessage which uses native Rust FFI.
     * 
     * @param message The message bytes to sign
     * @return The detached Dilithium5 signature
     * @throws PoUWError.SignatureError if signing fails
     */
    @Throws(PoUWError::class)
    fun sign(message: ByteArray): ByteArray {
        if (message.isEmpty()) {
            throw PoUWError.SignatureError()
        }
        
        return try {
            val signature = identity.signMessage(message)
            if (signature == null || signature.isEmpty()) {
                Log.e(TAG, "Identity.signMessage returned null or empty signature")
                throw PoUWError.SignatureError()
            }
            signature
        } catch (e: Exception) {
            Log.e(TAG, "Signing failed: ${e.message}", e)
            throw PoUWError.SignatureError()
        }
    }

    /**
     * Signs a PoUW receipt JSON payload using the canonical Rust path:
     * JSON -> Receipt struct -> bincode -> Dilithium5 signature.
     */
    @Throws(PoUWError::class)
    fun signPoUWReceiptJson(receiptJson: String): ByteArray {
        if (receiptJson.isBlank()) {
            throw PoUWError.SignatureError()
        }

        return try {
            val signature = identity.signPoUWReceiptJson(receiptJson)
            if (signature == null || signature.isEmpty()) {
                Log.e(TAG, "Identity.signPoUWReceiptJson returned null or empty signature")
                throw PoUWError.SignatureError()
            }
            signature
        } catch (e: Exception) {
            Log.e(TAG, "PoUW JSON signing failed: ${e.message}", e)
            throw PoUWError.SignatureError()
        }
    }
    
    /**
     * Signs a PoUW receipt with the required fields.
     * 
     * @param taskId The task identifier
     * @param receiptNonce Unique nonce for this receipt
     * @param challengeNonce The challenge nonce from the network
     * @param workerNonce The worker's computed nonce that solved the challenge
     * @param contentHash Hash of the task content
     * @param timestamp Unix timestamp of receipt creation
     * @return The Dilithium5 signature over the receipt data
     */
    fun signReceipt(
        taskId: ByteArray,
        receiptNonce: ByteArray,
        challengeNonce: ByteArray,
        workerNonce: ByteArray,
        contentHash: ByteArray,
        timestamp: Long
    ): ByteArray {
        // Build canonical receipt data for signing
        val receiptData = buildReceiptData(
            taskId = taskId,
            receiptNonce = receiptNonce,
            challengeNonce = challengeNonce,
            workerNonce = workerNonce,
            contentHash = contentHash,
            timestamp = timestamp
        )
        
        return sign(receiptData)
    }
    
    /**
     * Signs a batch of receipts for efficient submission.
     * 
     * @param receipts List of receipt data tuples
     * @return The Dilithium5 signature over the batch merkle root
     */
    fun signBatch(receipts: List<ReceiptData>): ByteArray {
        val batchData = buildBatchData(receipts)
        return sign(batchData)
    }
    
    /**
     * Gets the signer's DID (Decentralized Identifier).
     */
    fun getDid(): String = identity.did
    
    /**
     * Gets the signer's public key.
     */
    fun getPublicKey(): ByteArray = identity.publicKey
    
    /**
     * Gets the signer's node ID.
     */
    fun getNodeId(): ByteArray = identity.nodeId
    
    /**
     * Builds canonical receipt data for signing.
     * Format: taskId || receiptNonce || challengeNonce || workerNonce || contentHash || timestamp
     */
    private fun buildReceiptData(
        taskId: ByteArray,
        receiptNonce: ByteArray,
        challengeNonce: ByteArray,
        workerNonce: ByteArray,
        contentHash: ByteArray,
        timestamp: Long
    ): ByteArray {
        return taskId + 
               receiptNonce + 
               challengeNonce + 
               workerNonce + 
               contentHash + 
               timestamp.toBigEndianBytes()
    }
    
    /**
     * Builds canonical batch data for signing.
     * Uses a simple concatenation approach - in production, use a proper Merkle tree.
     */
    private fun buildBatchData(receipts: List<ReceiptData>): ByteArray {
        if (receipts.isEmpty()) {
            throw PoUWError.SignatureError()
        }
        
        // Concatenate all receipt hashes with a batch header
        val header = "BATCH".toByteArray(Charsets.UTF_8) + 
                     receipts.size.toBigEndianBytes()
        
        val body = receipts.map { it.toSignableBytes() }
                          .reduce { acc, bytes -> acc + bytes }
        
        return header + body
    }
    
    /**
     * Converts a Long to 8-byte big-endian byte array.
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
     * Converts an Int to 4-byte big-endian byte array.
     */
    private fun Int.toBigEndianBytes(): ByteArray {
        return byteArrayOf(
            (this shr 24).toByte(),
            (this shr 16).toByte(),
            (this shr 8).toByte(),
            this.toByte()
        )
    }
    
    /**
     * Data class representing receipt signing data.
     */
    data class ReceiptData(
        val taskId: ByteArray,
        val receiptNonce: ByteArray,
        val challengeNonce: ByteArray,
        val workerNonce: ByteArray,
        val contentHash: ByteArray,
        val timestamp: Long
    ) {
        fun toSignableBytes(): ByteArray {
            return taskId + receiptNonce + challengeNonce + workerNonce + contentHash + 
                   timestamp.toBigEndianBytes()
        }
        
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
    }
}
