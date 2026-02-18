package com.sovereignnetworkmobile.pouw

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.sovereignnetworkmobile.pouw.model.ReceiptEntity
import com.sovereignnetworkmobile.pouw.model.ReceiptState
import com.sovereignnetworkmobile.pouw.util.TestDataFactory
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.IOException

/**
 * Unit tests for ReceiptStore using an in-memory Room database.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], manifest = Config.NONE)
class ReceiptStoreTest {

    private lateinit var db: ReceiptDatabase
    private lateinit var receiptStore: ReceiptStore

    @Before
    fun setup() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(
            context,
            ReceiptDatabase::class.java
        ).build()
        
        // Create ReceiptStore with reflection to use our test database
        receiptStore = ReceiptStore(context)
        
        // Replace the database with our test instance using reflection
        val databaseField = ReceiptStore::class.java.getDeclaredField("database")
        databaseField.isAccessible = true
        databaseField.set(receiptStore, db)
        
        val daoField = ReceiptStore::class.java.getDeclaredField("dao")
        daoField.isAccessible = true
        daoField.set(receiptStore, db.receiptDao())
    }

    @After
    @Throws(IOException::class)
    fun tearDown() {
        db.close()
    }

    // ============================================
    // Save and Retrieve Tests
    // ============================================

    @Test
    fun testEnqueueAndRetrieve() = runBlocking {
        val receipt = TestDataFactory.createReceipt(
            nonce = TestDataFactory.randomBytes(32),
            state = ReceiptState.CREATED
        )
        
        receiptStore.save(receipt)
        
        val pending = receiptStore.getPending(100)
        
        assertEquals("Should retrieve 1 pending receipt", 1, pending.size)
        assertArrayEquals("Nonce should match", receipt.receiptNonce, pending[0].receiptNonce)
        assertArrayEquals("Task ID should match", receipt.taskId, pending[0].taskId)
    }

    @Test
    fun testCreateReceipt() = runBlocking {
        val taskId = TestDataFactory.randomBytes(32)
        val receiptNonce = TestDataFactory.randomBytes(32)
        val signedData = TestDataFactory.randomBytes(200)
        
        val receipt = receiptStore.createReceipt(taskId, receiptNonce, signedData)
        
        assertArrayEquals("Task ID should match", taskId, receipt.taskId)
        assertArrayEquals("Nonce should match", receiptNonce, receipt.receiptNonce)
        assertArrayEquals("Signed data should match", signedData, receipt.signedReceiptData)
        assertEquals("State should be CREATED", ReceiptState.CREATED, receipt.state)
        assertEquals("Retry count should be 0", 0, receipt.retryCount)
    }

    @Test
    fun testGetPending_ExcludesNonPendingStates() = runBlocking {
        // Insert receipts in various states
        val createdReceipt = TestDataFactory.createReceipt(state = ReceiptState.CREATED)
        val queuedReceipt = TestDataFactory.createReceipt(state = ReceiptState.QUEUED)
        val retryReceipt = TestDataFactory.createReceipt(state = ReceiptState.RETRY_WAIT)
        val acceptedReceipt = TestDataFactory.createReceipt(state = ReceiptState.ACCEPTED)
        val rejectedReceipt = TestDataFactory.createReceipt(state = ReceiptState.REJECTED)
        
        receiptStore.save(createdReceipt)
        receiptStore.save(queuedReceipt)
        receiptStore.save(retryReceipt)
        receiptStore.save(acceptedReceipt)
        receiptStore.save(rejectedReceipt)
        
        val pending = receiptStore.getPending(100)
        
        assertEquals("Should retrieve only pending receipts", 3, pending.size)
    }

    // ============================================
    // FIFO Ordering Tests
    // ============================================

    @Test
    fun testFIFOOrdering() = runBlocking {
        val baseTime = System.currentTimeMillis()
        
        // Insert receipts with different timestamps
        val receipt1 = TestDataFactory.createReceipt(
            nonce = TestDataFactory.randomBytes(32),
            createdAt = baseTime
        )
        val receipt2 = TestDataFactory.createReceipt(
            nonce = TestDataFactory.randomBytes(32),
            createdAt = baseTime + 1000
        )
        val receipt3 = TestDataFactory.createReceipt(
            nonce = TestDataFactory.randomBytes(32),
            createdAt = baseTime + 2000
        )
        
        receiptStore.save(receipt2) // Insert out of order
        receiptStore.save(receipt1)
        receiptStore.save(receipt3)
        
        val pending = receiptStore.getPending(100)
        
        assertEquals("Should retrieve 3 receipts", 3, pending.size)
        assertArrayEquals("First should be oldest", receipt1.receiptNonce, pending[0].receiptNonce)
        assertArrayEquals("Second should be middle", receipt2.receiptNonce, pending[1].receiptNonce)
        assertArrayEquals("Third should be newest", receipt3.receiptNonce, pending[2].receiptNonce)
    }

    @Test
    fun testGetPending_WithLimit() = runBlocking {
        val receipts = TestDataFactory.createReceipts(10)
        receipts.forEach { receiptStore.save(it) }
        
        val pending5 = receiptStore.getPending(5)
        val pending10 = receiptStore.getPending(10)
        val pending20 = receiptStore.getPending(20)
        
        assertEquals("Should respect limit of 5", 5, pending5.size)
        assertEquals("Should respect limit of 10", 10, pending10.size)
        assertEquals("Should not exceed actual count", 10, pending20.size)
    }

    // ============================================
    // Mark Accepted Tests
    // ============================================

    @Test
    fun testMarkAccepted() = runBlocking {
        val receipt = TestDataFactory.createReceipt(state = ReceiptState.CREATED)
        receiptStore.save(receipt)
        
        receiptStore.markAccepted(receipt.receiptNonce)
        
        val pending = receiptStore.getPending(100)
        assertEquals("Receipt should not be pending", 0, pending.size)
    }

    @Test
    fun testMarkAccepted_Multiple() = runBlocking {
        val receipts = TestDataFactory.createReceipts(3)
        receipts.forEach { receiptStore.save(it) }
        
        receiptStore.markAccepted(listOf(receipts[0].receiptNonce, receipts[2].receiptNonce))
        
        val pending = receiptStore.getPending(100)
        assertEquals("Only 1 should remain pending", 1, pending.size)
        assertArrayEquals("Remaining should be receipt 1", 
            receipts[1].receiptNonce, pending[0].receiptNonce)
    }

    @Test
    fun testMarkAccepted_NonExistent() = runBlocking {
        // Should not throw
        receiptStore.markAccepted(TestDataFactory.randomBytes(32))
        
        val pending = receiptStore.getPending(100)
        assertEquals("Should still have empty pending", 0, pending.size)
    }

    // ============================================
    // Mark Rejected Tests
    // ============================================

    @Test
    fun testMarkRejected() = runBlocking {
        val receipt = TestDataFactory.createReceipt(state = ReceiptState.CREATED)
        receiptStore.save(receipt)
        val reason = "Invalid signature"
        
        receiptStore.markRejected(receipt.receiptNonce, reason)
        
        val pending = receiptStore.getPending(100)
        assertEquals("Receipt should not be pending", 0, pending.size)
    }

    // ============================================
    // Mark Retry Tests
    // ============================================

    @Test
    fun testMarkRetry() = runBlocking {
        val receipt = TestDataFactory.createReceipt(
            state = ReceiptState.CREATED,
            retryCount = 1
        )
        receiptStore.save(receipt)
        
        receiptStore.markRetry(receipt.receiptNonce, "Network error")
        
        val pending = receiptStore.getPending(100)
        assertEquals("Receipt should still be pending", 1, pending.size)
        assertEquals("State should be RETRY_WAIT", ReceiptState.RETRY_WAIT, pending[0].state)
    }

    @Test
    fun testMarkRetry_MaxRetriesExceeded() = runBlocking {
        val receipt = TestDataFactory.createReceipt(
            state = ReceiptState.CREATED,
            retryCount = 3 // At max retries
        )
        receiptStore.save(receipt)
        
        receiptStore.markRetry(receipt.receiptNonce, "Max retries exceeded")
        
        val pending = receiptStore.getPending(100)
        assertEquals("Receipt should not be pending after max retries", 0, pending.size)
    }

    // ============================================
    // Update Tests
    // ============================================

    @Test
    fun testUpdate() = runBlocking {
        val receipt = TestDataFactory.createReceipt(state = ReceiptState.CREATED)
        receiptStore.save(receipt)
        
        val updatedReceipt = receipt.copy(state = ReceiptState.QUEUED)
        receiptStore.update(updatedReceipt)
        
        val pending = receiptStore.getPending(100)
        assertEquals("Should still be pending (QUEUED)", 1, pending.size)
        assertEquals("State should be QUEUED", ReceiptState.QUEUED, pending[0].state)
    }

    // ============================================
    // Deduplication Tests
    // ============================================

    @Test
    fun testDeduplication_SameNonce() = runBlocking {
        val nonce = TestDataFactory.randomBytes(32)
        val receipt1 = TestDataFactory.createReceipt(
            nonce = nonce,
            state = ReceiptState.CREATED,
            signedData = TestDataFactory.randomBytes(100)
        )
        val receipt2 = TestDataFactory.createReceipt(
            nonce = nonce, // Same nonce
            state = ReceiptState.CREATED,
            signedData = TestDataFactory.randomBytes(200) // Different data
        )
        
        receiptStore.save(receipt1)
        receiptStore.save(receipt2) // Should replace due to OnConflictStrategy.REPLACE
        
        val pending = receiptStore.getPending(100)
        assertEquals("Should have only 1 receipt", 1, pending.size)
    }

    // ============================================
    // Pending Count Tests
    // ============================================

    @Test
    fun testGetPendingCount() = runBlocking {
        val receipts = TestDataFactory.createReceipts(5)
        receipts.forEach { receiptStore.save(it) }
        
        val count = receiptStore.pendingCount()
        
        assertEquals("Should count 5 pending receipts", 5, count)
    }

    @Test
    fun testGetPendingCountFlow() = runBlocking {
        val receipts = TestDataFactory.createReceipts(3)
        receipts.forEach { receiptStore.save(it) }
        
        val count = receiptStore.getPendingCount().first()
        
        assertEquals("Flow should emit 3 pending receipts", 3, count)
    }

    // ============================================
    // Cleanup Tests
    // ============================================

    @Test
    fun testCleanup() = runBlocking {
        val oldTime = System.currentTimeMillis() - (8 * 24 * 60 * 60 * 1000) // 8 days ago
        val recentTime = System.currentTimeMillis() - (1 * 24 * 60 * 60 * 1000) // 1 day ago
        
        val oldAcceptedReceipt = TestDataFactory.createReceipt(
            state = ReceiptState.ACCEPTED,
            createdAt = oldTime
        )
        val recentAcceptedReceipt = TestDataFactory.createReceipt(
            state = ReceiptState.ACCEPTED,
            createdAt = recentTime
        )
        val pendingReceipt = TestDataFactory.createReceipt(
            state = ReceiptState.CREATED,
            createdAt = oldTime
        )
        
        receiptStore.save(oldAcceptedReceipt)
        receiptStore.save(recentAcceptedReceipt)
        receiptStore.save(pendingReceipt)
        
        receiptStore.cleanup()
        
        val pending = receiptStore.getPending(100)
        assertEquals("Pending should remain", 1, pending.size)
    }

    // ============================================
    // Singleton Tests
    // ============================================

    @Test
    fun testSingleton() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val instance1 = ReceiptStore.getInstance(context)
        val instance2 = ReceiptStore.getInstance(context)
        
        assertSame("Should return same instance", instance1, instance2)
    }

    // ============================================
    // Error Handling Tests
    // ============================================

    @Test
    fun testGetPending_NoData() = runBlocking {
        val pending = receiptStore.getPending(100)
        
        assertTrue("Should return empty list", pending.isEmpty())
    }

    @Test
    fun testClose() = runBlocking {
        // Should not throw
        receiptStore.close()
    }
}
