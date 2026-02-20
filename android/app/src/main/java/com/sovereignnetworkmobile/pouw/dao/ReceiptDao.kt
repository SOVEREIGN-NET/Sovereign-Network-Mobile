package com.sovereignnetworkmobile.pouw.dao

import androidx.room.*
import com.sovereignnetworkmobile.pouw.model.ReceiptEntity
import com.sovereignnetworkmobile.pouw.model.ReceiptState
import kotlinx.coroutines.flow.Flow

@Dao
interface ReceiptDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(receipt: ReceiptEntity)
    
    @Query("SELECT * FROM receipts WHERE state IN ('CREATED', 'QUEUED', 'RETRY_WAIT') ORDER BY createdAt ASC LIMIT :limit")
    suspend fun getPending(limit: Int): List<ReceiptEntity>
    
    @Query("UPDATE receipts SET state = 'ACCEPTED' WHERE receiptNonce IN (:nonces)")
    suspend fun markAccepted(nonces: List<ByteArray>)
    
    @Query("UPDATE receipts SET state = 'REJECTED', lastError = :reason WHERE receiptNonce = :nonce")
    suspend fun markRejected(nonce: ByteArray, reason: String)
    
    @Query("UPDATE receipts SET state = 'RETRY_WAIT', retryCount = retryCount + 1 WHERE receiptNonce = :nonce")
    suspend fun markRetry(nonce: ByteArray)
    
    @Query("SELECT COUNT(*) FROM receipts WHERE state IN ('CREATED', 'QUEUED', 'RETRY_WAIT')")
    fun getPendingCount(): Flow<Int>
    
    @Query("DELETE FROM receipts WHERE state = 'ACCEPTED' AND createdAt < :before")
    suspend fun deleteOldAccepted(before: Long)
}
