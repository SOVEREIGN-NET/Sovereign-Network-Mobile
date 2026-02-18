package com.sovereignnetworkmobile.pouw.mock

import com.sovereignnetworkmobile.pouw.dao.ReceiptDao
import com.sovereignnetworkmobile.pouw.model.ReceiptEntity
import com.sovereignnetworkmobile.pouw.model.ReceiptState
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import java.util.concurrent.ConcurrentHashMap

/**
 * Mock implementation of ReceiptDao for testing.
 * Uses in-memory storage with concurrent hash map for thread safety.
 */
class MockReceiptDao : ReceiptDao {

    private val receipts = ConcurrentHashMap<ByteArray, ReceiptEntity>(
        compareBy { it.contentHashCode() }
    )
    private val pendingCountFlow = MutableStateFlow(0)

    override suspend fun insert(receipt: ReceiptEntity) {
        receipts[receipt.receiptNonce] = receipt
        updatePendingCount()
    }

    override suspend fun getPending(limit: Int): List<ReceiptEntity> {
        return receipts.values
            .filter { it.state in listOf(ReceiptState.CREATED, ReceiptState.QUEUED, ReceiptState.RETRY_WAIT) }
            .sortedBy { it.createdAt }
            .take(limit)
    }

    override suspend fun markAccepted(nonces: List<ByteArray>) {
        nonces.forEach { nonce ->
            receipts[nonce]?.let { receipt ->
                receipts[nonce] = receipt.copy(state = ReceiptState.ACCEPTED)
            }
        }
        updatePendingCount()
    }

    override suspend fun markRejected(nonce: ByteArray, reason: String) {
        receipts[nonce]?.let { receipt ->
            receipts[nonce] = receipt.copy(
                state = ReceiptState.REJECTED,
                lastError = reason
            )
        }
        updatePendingCount()
    }

    override suspend fun markRetry(nonce: ByteArray) {
        receipts[nonce]?.let { receipt ->
            receipts[nonce] = receipt.copy(
                state = ReceiptState.RETRY_WAIT,
                retryCount = receipt.retryCount + 1
            )
        }
    }

    override fun getPendingCount(): Flow<Int> {
        return pendingCountFlow
    }

    override suspend fun deleteOldAccepted(before: Long) {
        receipts.entries.removeIf { (_, receipt) ->
            receipt.state == ReceiptState.ACCEPTED && receipt.createdAt < before
        }
        updatePendingCount()
    }

    /**
     * Clears all receipts from the mock.
     */
    fun clear() {
        receipts.clear()
        updatePendingCount()
    }

    /**
     * Gets all stored receipts.
     */
    fun getAll(): List<ReceiptEntity> {
        return receipts.values.toList()
    }

    /**
     * Gets a receipt by its nonce.
     */
    fun getByNonce(nonce: ByteArray): ReceiptEntity? {
        return receipts[nonce]
    }

    /**
     * Gets the count of pending receipts.
     */
    fun getPendingCountValue(): Int {
        return receipts.values.count {
            it.state in listOf(ReceiptState.CREATED, ReceiptState.QUEUED, ReceiptState.RETRY_WAIT)
        }
    }

    private fun updatePendingCount() {
        pendingCountFlow.value = getPendingCountValue()
    }
}
