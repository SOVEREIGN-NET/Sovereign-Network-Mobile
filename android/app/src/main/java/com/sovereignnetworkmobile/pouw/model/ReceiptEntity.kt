package com.sovereignnetworkmobile.pouw.model

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "receipts")
data class ReceiptEntity(
    @PrimaryKey
    val receiptNonce: ByteArray,
    val taskId: ByteArray,
    val state: ReceiptState,
    val signedReceiptData: ByteArray,
    val createdAt: Long = System.currentTimeMillis(),
    val retryCount: Int = 0,
    val lastError: String? = null
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is ReceiptEntity) return false
        return receiptNonce.contentEquals(other.receiptNonce)
    }
    override fun hashCode(): Int = receiptNonce.contentHashCode()
}
