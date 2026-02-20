package com.sovereignnetworkmobile.pouw.model

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * ReceiptEntity represents a PoUW (Proof of Useful Work) receipt stored in the local database.
 *
 * Spec receipt format:
 * {
 *   "version": 1,
 *   "task_id": "hex",
 *   "client_did": "did:zhtp:alice",
 *   "client_node_id": "hex-32-bytes",
 *   "provider_id": "hex",
 *   "content_id": "hex",
 *   "proof_type": "hash",
 *   "bytes_verified": 1024,
 *   "result_ok": true,
 *   "started_at": 1760000010,
 *   "finished_at": 1760000020,
 *   "receipt_nonce": "hex-16-bytes",
 *   "challenge_nonce": "hex"
 * }
 */
@Entity(tableName = "receipts")
data class ReceiptEntity(
    @PrimaryKey
    val receiptNonce: ByteArray,
    val taskId: ByteArray,
    val state: ReceiptState,
    val signedReceiptData: ByteArray,
    val createdAt: Long = System.currentTimeMillis(),
    val retryCount: Int = 0,
    val lastError: String? = null,
    
    // New fields for API compliance
    val clientDid: String? = null,
    val clientNodeId: ByteArray = ByteArray(32),
    val providerId: ByteArray? = null,
    val contentId: ByteArray = ByteArray(0),
    val challengeNonce: ByteArray = ByteArray(0),
    val sigScheme: String = "ed25519", // or "dilithium5"
    val signature: ByteArray = ByteArray(0),
    val proofType: String = "hash",
    val bytesVerified: Long = 0,
    val resultOk: Boolean = true,
    val startedAt: Long = 0,
    val finishedAt: Long = 0
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is ReceiptEntity) return false
        return receiptNonce.contentEquals(other.receiptNonce)
    }
    override fun hashCode(): Int = receiptNonce.contentHashCode()
}
