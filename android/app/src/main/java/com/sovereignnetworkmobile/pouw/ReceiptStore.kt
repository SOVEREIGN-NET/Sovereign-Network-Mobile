package com.sovereignnetworkmobile.pouw

import android.content.Context
import androidx.room.*
import com.sovereignnetworkmobile.pouw.dao.ReceiptDao
import com.sovereignnetworkmobile.pouw.model.PoUWError
import com.sovereignnetworkmobile.pouw.model.ReceiptEntity
import com.sovereignnetworkmobile.pouw.model.ReceiptState
import kotlinx.coroutines.flow.Flow

/**
 * Room database for storing PoUW receipts.
 */
@Database(entities = [ReceiptEntity::class], version = 2, exportSchema = false)
@TypeConverters(ReceiptStateConverter::class, ByteArrayConverter::class)
abstract class ReceiptDatabase : RoomDatabase() {
    abstract fun receiptDao(): ReceiptDao
}

/**
 * Type converter for ByteArray (stored as BLOB).
 */
class ByteArrayConverter {
    @TypeConverter
    fun fromByteArray(bytes: ByteArray): ByteArray = bytes
    
    @TypeConverter
    fun toByteArray(bytes: ByteArray): ByteArray = bytes
}

/**
 * Type converter for ReceiptState enum.
 */
class ReceiptStateConverter {
    @TypeConverter
    fun fromString(value: String): ReceiptState {
        return ReceiptState.valueOf(value)
    }
    
    @TypeConverter
    fun toString(state: ReceiptState): String {
        return state.name
    }
}

/**
 * ReceiptStore provides a high-level wrapper around the Room database
 * for managing PoUW receipt persistence.
 */
class ReceiptStore(context: Context) {
    
    companion object {
        private const val DATABASE_NAME = "pouw_receipts.db"
        private const val MAX_RETRY_COUNT = 3
        private const val OLD_RECEIPT_CUTOFF_DAYS = 7L
        
        @Volatile
        private var instance: ReceiptStore? = null
        
        fun getInstance(context: Context): ReceiptStore {
            return instance ?: synchronized(this) {
                instance ?: ReceiptStore(context.applicationContext).also {
                    instance = it
                }
            }
        }
    }
    
    private val database: ReceiptDatabase = Room.databaseBuilder(
        context,
        ReceiptDatabase::class.java,
        DATABASE_NAME
    )
    .fallbackToDestructiveMigration() // Allow destructive migration for development
    .build()
    
    private val dao: ReceiptDao = database.receiptDao()
    
    /**
     * Saves a new receipt to the store.
     * 
     * @param receipt The receipt entity to save
     * @throws PoUWError.StorageError if save fails
     */
    @Throws(PoUWError::class)
    suspend fun save(receipt: ReceiptEntity) {
        try {
            dao.insert(receipt)
        } catch (e: Exception) {
            throw PoUWError.StorageError(e)
        }
    }
    
    /**
     * Creates and saves a new receipt with initial CREATED state.
     * 
     * @param taskId The task identifier
     * @param receiptNonce Unique nonce for this receipt
     * @param signedReceiptData The signed receipt data
     * @param clientDid The client's DID (e.g., "did:zhtp:alice")
     * @param clientNodeId The client's node ID (32 bytes)
     * @param providerId Optional provider ID
     * @param contentId The content identifier
     * @param challengeNonce The challenge nonce from the network
     * @param sigScheme The signature scheme ("ed25519" or "dilithium5")
     * @param signature The signature over the receipt data
     * @param proofType The proof type (e.g., "hash")
     * @param bytesVerified Number of bytes verified
     * @param resultOk Whether the verification result was successful
     * @param startedAt Start timestamp (seconds)
     * @param finishedAt Finish timestamp (seconds)
     * @return The created ReceiptEntity
     */
    suspend fun createReceipt(
        taskId: ByteArray,
        receiptNonce: ByteArray,
        signedReceiptData: ByteArray,
        clientDid: String? = null,
        clientNodeId: ByteArray = ByteArray(32),
        providerId: ByteArray? = null,
        contentId: ByteArray = ByteArray(0),
        challengeNonce: ByteArray = ByteArray(0),
        sigScheme: String = "ed25519",
        signature: ByteArray = ByteArray(0),
        proofType: String = "hash",
        bytesVerified: Long = 0,
        resultOk: Boolean = true,
        startedAt: Long = 0,
        finishedAt: Long = 0
    ): ReceiptEntity {
        val receipt = ReceiptEntity(
            receiptNonce = receiptNonce,
            taskId = taskId,
            state = ReceiptState.CREATED,
            signedReceiptData = signedReceiptData,
            clientDid = clientDid,
            clientNodeId = clientNodeId,
            providerId = providerId,
            contentId = contentId,
            challengeNonce = challengeNonce,
            sigScheme = sigScheme,
            signature = signature,
            proofType = proofType,
            bytesVerified = bytesVerified,
            resultOk = resultOk,
            startedAt = startedAt,
            finishedAt = finishedAt
        )
        save(receipt)
        return receipt
    }
    
    /**
     * Retrieves pending receipts that need to be submitted.
     * 
     * @param limit Maximum number of receipts to retrieve
     * @return List of pending receipts ordered by creation time
     */
    suspend fun getPending(limit: Int = 100): List<ReceiptEntity> {
        return try {
            dao.getPending(limit)
        } catch (e: Exception) {
            emptyList()
        }
    }
    
    /**
     * Marks receipts as accepted by the network.
     * 
     * @param nonces List of receipt nonces to mark as accepted
     */
    suspend fun markAccepted(nonces: List<ByteArray>) {
        try {
            dao.markAccepted(nonces)
        } catch (e: Exception) {
            // Log but don't throw - this is a non-critical update
        }
    }
    
    /**
     * Marks a single receipt as accepted.
     * 
     * @param nonce The receipt nonce
     */
    suspend fun markAccepted(nonce: ByteArray) {
        markAccepted(listOf(nonce))
    }
    
    /**
     * Marks a receipt as rejected with an error reason.
     * 
     * @param nonce The receipt nonce
     * @param reason The rejection reason
     */
    suspend fun markRejected(nonce: ByteArray, reason: String) {
        try {
            dao.markRejected(nonce, reason)
        } catch (e: Exception) {
            // Log but don't throw
        }
    }
    
    /**
     * Marks a receipt for retry, incrementing the retry count.
     * If retry count exceeds MAX_RETRY_COUNT, marks as rejected.
     * 
     * @param nonce The receipt nonce
     * @param error The error message
     */
    suspend fun markRetry(nonce: ByteArray, error: String? = null) {
        try {
            val pending = getPending(1)
            val receipt = pending.find { it.receiptNonce.contentEquals(nonce) }
            
            if (receipt != null && receipt.retryCount >= MAX_RETRY_COUNT) {
                markRejected(nonce, error ?: "Max retries exceeded")
            } else {
                dao.markRetry(nonce)
                if (error != null) {
                    // Update with error message - need to use a workaround since
                    // we don't have a direct update method
                    val updated = receipt?.copy(
                        state = ReceiptState.RETRY_WAIT,
                        retryCount = receipt.retryCount + 1,
                        lastError = error
                    ) ?: ReceiptEntity(
                        receiptNonce = nonce,
                        taskId = ByteArray(0),
                        state = ReceiptState.RETRY_WAIT,
                        signedReceiptData = ByteArray(0),
                        createdAt = System.currentTimeMillis(),
                        retryCount = 1,
                        lastError = error
                    )
                    dao.insert(updated)
                }
            }
        } catch (e: Exception) {
            // Log but don't throw
        }
    }
    
    /**
     * Updates a receipt state.
     * 
     * @param receipt The updated receipt entity
     */
    suspend fun update(receipt: ReceiptEntity) {
        try {
            dao.insert(receipt)
        } catch (e: Exception) {
            throw PoUWError.StorageError(e)
        }
    }
    
    /**
     * Returns a Flow that emits the current count of pending receipts.
     */
    fun getPendingCount(): Flow<Int> = dao.getPendingCount()
    
    /**
     * Deletes old accepted receipts to free up storage.
     * Removes receipts accepted more than OLD_RECEIPT_CUTOFF_DAYS ago.
     */
    suspend fun cleanup() {
        try {
            val cutoff = System.currentTimeMillis() - (OLD_RECEIPT_CUTOFF_DAYS * 24 * 60 * 60 * 1000)
            dao.deleteOldAccepted(cutoff)
        } catch (e: Exception) {
            // Log but don't throw
        }
    }
    
    /**
     * Gets the number of pending receipts.
     * 
     * @return Count of pending receipts
     */
    suspend fun pendingCount(): Int {
        return getPending(1000).size
    }
    
    /**
     * Closes the database connection.
     */
    fun close() {
        database.close()
    }
}
