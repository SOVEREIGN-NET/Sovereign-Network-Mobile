package com.sovereignnetworkmobile.pouw

import android.content.Context
import android.util.Log
import com.sovereignnetworkmobile.Identity
import com.sovereignnetworkmobile.pouw.model.PoUWError
import com.sovereignnetworkmobile.pouw.model.ReceiptEntity
import com.sovereignnetworkmobile.pouw.model.ReceiptState
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.util.concurrent.atomic.AtomicBoolean

/**
 * PoUWController is the main orchestrator for Proof of Useful Work operations.
 * 
 * It coordinates:
 * - Challenge fetching from the network
 * - Work computation (hash solving)
 * - Receipt signing via Dilithium5
 * - Receipt storage via Room
 * - Submission to network via QUIC
 * 
 * Usage:
 * ```
 * val controller = PoUWController(context, identity, "node.example.com")
 * controller.start()
 * 
 * // Submit content for PoUW
 * controller.submitContent(contentBytes, contentHash)
 * 
 * // Observe stats
 * controller.stats.collect { stats -> 
 *     println("Pending: ${stats.pendingCount}")
 * }
 * ```
 */
class PoUWController(
    context: Context,
    private val identity: Identity,
    private val nodeHost: String,
    private val nodePort: Int = 443,
    private val coroutineScope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
) {
    
    companion object {
        private const val TAG = "PoUWController"
        private const val DEFAULT_DIFFICULTY = 20 // 20 leading zero bits
        private const val MAX_WORK_TIME_MS = 30_000L // 30 seconds max per work unit
        private const val SUBMISSION_INTERVAL_MS = 5_000L // Submit every 5 seconds
        private const val CLEANUP_INTERVAL_MS = 60 * 60 * 1000L // Cleanup every hour
        private const val MAX_BATCH_SIZE = 100
        
        // Singleton instance for app-wide access
        @Volatile
        private var instance: PoUWController? = null
        
        fun getInstance(): PoUWController? = instance
        
        internal fun setInstance(controller: PoUWController?) {
            instance = controller
        }
    }
    
    // Core components
    private val verifierEngine = VerifierEngine
    private val identitySigner: IdentitySigner = IdentitySigner(identity)
    private val receiptStore: ReceiptStore = ReceiptStore.getInstance(context)
    private val submissionClient: SubmissionClient = SubmissionClient(nodeHost, nodePort)
    
    // State
    private val _isRunning = AtomicBoolean(false)
    val isRunning: Boolean get() = _isRunning.get()
    
    private val _isComputing = MutableStateFlow(false)
    val isComputing: StateFlow<Boolean> = _isComputing
    
    // Stats
    data class PoUWStats(
        val pendingCount: Int = 0,
        val totalSubmitted: Long = 0,
        val totalAccepted: Long = 0,
        val totalRejected: Long = 0,
        val currentDifficulty: Int = DEFAULT_DIFFICULTY
    )
    
    private val _stats = MutableStateFlow(PoUWStats())
    val stats: StateFlow<PoUWStats> = _stats
    
    // Job handles
    private var submissionJob: Job? = null
    private var cleanupJob: Job? = null
    private var computeJob: Job? = null
    
    // Counters
    private var totalSubmitted: Long = 0
    private var totalAccepted: Long = 0
    private var totalRejected: Long = 0
    
    /**
     * Starts the PoUW controller.
     * Begins background jobs for submission and cleanup.
     */
    fun start() {
        if (_isRunning.compareAndSet(false, true)) {
            Log.i(TAG, "Starting PoUW controller")
            setInstance(this)
            
            // Start submission loop
            submissionJob = coroutineScope.launch {
                while (isActive && _isRunning.get()) {
                    try {
                        processPendingSubmissions()
                    } catch (e: Exception) {
                        Log.e(TAG, "Submission loop error: ${e.message}", e)
                    }
                    delay(SUBMISSION_INTERVAL_MS)
                }
            }
            
            // Start cleanup loop
            cleanupJob = coroutineScope.launch {
                while (isActive && _isRunning.get()) {
                    delay(CLEANUP_INTERVAL_MS)
                    try {
                        receiptStore.cleanup()
                    } catch (e: Exception) {
                        Log.e(TAG, "Cleanup error: ${e.message}", e)
                    }
                }
            }
            
            // Start stats update loop
            coroutineScope.launch {
                while (isActive && _isRunning.get()) {
                    updateStats()
                    delay(1000)
                }
            }
        }
    }
    
    /**
     * Stops the PoUW controller.
     * Cancels all background jobs.
     */
    fun stop() {
        if (_isRunning.compareAndSet(true, false)) {
            Log.i(TAG, "Stopping PoUW controller")
            submissionJob?.cancel()
            cleanupJob?.cancel()
            computeJob?.cancel()
            setInstance(null)
        }
    }
    
    /**
     * Submits content to be processed with PoUW.
     * Creates a new receipt with solved challenge and queues it for submission.
     * 
     * @param content The content bytes to process
     * @param contentHash The hash of the content (for verification)
     * @param providerId Optional provider ID for the content
     * @return The created receipt entity
     * @throws PoUWError if processing fails
     */
    @Throws(PoUWError::class)
    suspend fun submitContent(
        content: ByteArray, 
        contentHash: ByteArray,
        providerId: ByteArray? = null
    ): ReceiptEntity {
        if (content.isEmpty()) {
            throw PoUWError.InvalidContent()
        }
        
        // Verify content hash
        if (!verifierEngine.verifyContentHash(content, contentHash)) {
            throw PoUWError.VerificationFailed()
        }
        
        // Get or request challenge
        val challenge = getOrRequestChallenge()
        
        // Record start time
        val startedAt = System.currentTimeMillis() / 1000 // Convert to seconds
        
        // Solve the challenge (do work)
        val workerNonce = solveChallenge(challenge) 
            ?: throw PoUWError.VerificationFailed()
        
        // Record finish time
        val finishedAt = System.currentTimeMillis() / 1000 // Convert to seconds
        
        // Create and sign receipt
        val receiptNonce = verifierEngine.generateRandomNonce(32)
        val taskId = contentHash.copyOf(32) // Use content hash as task ID
        val timestamp = System.currentTimeMillis()
        
        val signature = identitySigner.signReceipt(
            taskId = taskId,
            receiptNonce = receiptNonce,
            challengeNonce = challenge.nonce,
            workerNonce = workerNonce,
            contentHash = contentHash,
            timestamp = timestamp
        )
        
        // Build signed receipt data
        val signedReceiptData = buildSignedReceiptData(
            taskId = taskId,
            receiptNonce = receiptNonce,
            challengeNonce = challenge.nonce,
            workerNonce = workerNonce,
            contentHash = contentHash,
            timestamp = timestamp,
            signature = signature,
            publicKey = identitySigner.getPublicKey()
        )
        
        // Save to store with all new fields
        val receipt = receiptStore.createReceipt(
            taskId = taskId,
            receiptNonce = receiptNonce,
            signedReceiptData = signedReceiptData,
            clientDid = identitySigner.getDid(),
            clientNodeId = identitySigner.getNodeId(),
            providerId = providerId,
            contentId = contentHash,
            challengeNonce = challenge.nonce,
            sigScheme = "dilithium5", // IdentitySigner uses Dilithium5
            signature = signature,
            proofType = "hash",
            bytesVerified = content.size.toLong(),
            resultOk = true,
            startedAt = startedAt,
            finishedAt = finishedAt
        )
        
        Log.d(TAG, "Created receipt with nonce: ${receiptNonce.toHex()}")
        updateStats()
        
        return receipt
    }
    
    /**
     * Creates a receipt without solving a challenge.
     * Useful when the challenge has already been solved externally.
     */
    suspend fun createReceipt(
        taskId: ByteArray,
        receiptNonce: ByteArray,
        challengeNonce: ByteArray,
        workerNonce: ByteArray,
        contentHash: ByteArray,
        providerId: ByteArray? = null,
        bytesVerified: Long = 0,
        resultOk: Boolean = true,
        startedAt: Long = 0,
        finishedAt: Long = 0
    ): ReceiptEntity {
        val timestamp = System.currentTimeMillis()
        
        val signature = identitySigner.signReceipt(
            taskId = taskId,
            receiptNonce = receiptNonce,
            challengeNonce = challengeNonce,
            workerNonce = workerNonce,
            contentHash = contentHash,
            timestamp = timestamp
        )
        
        val signedReceiptData = buildSignedReceiptData(
            taskId = taskId,
            receiptNonce = receiptNonce,
            challengeNonce = challengeNonce,
            workerNonce = workerNonce,
            contentHash = contentHash,
            timestamp = timestamp,
            signature = signature,
            publicKey = identitySigner.getPublicKey()
        )
        
        return receiptStore.createReceipt(
            taskId = taskId,
            receiptNonce = receiptNonce,
            signedReceiptData = signedReceiptData,
            clientDid = identitySigner.getDid(),
            clientNodeId = identitySigner.getNodeId(),
            providerId = providerId,
            contentId = contentHash,
            challengeNonce = challengeNonce,
            sigScheme = "dilithium5",
            signature = signature,
            proofType = "hash",
            bytesVerified = bytesVerified,
            resultOk = resultOk,
            startedAt = startedAt,
            finishedAt = finishedAt
        )
    }
    
    /**
     * Forces immediate submission of pending receipts.
     * Normally submissions happen automatically in the background.
     */
    suspend fun flushPending() {
        processPendingSubmissions()
    }
    
    /**
     * Gets the flow of pending receipt count.
     */
    fun getPendingCountFlow(): Flow<Int> = receiptStore.getPendingCount()
    
    /**
     * Gets the current pending receipt count (suspending).
     */
    suspend fun getPendingCount(): Int = receiptStore.pendingCount()
    
    /**
     * Cleans up old accepted receipts.
     */
    suspend fun cleanup() {
        receiptStore.cleanup()
    }
    
    /**
     * Gets a receipt by its nonce.
     */
    suspend fun getReceipt(nonce: ByteArray): ReceiptEntity? {
        return receiptStore.getPending(1000).find { 
            it.receiptNonce.contentEquals(nonce) 
        }
    }
    
    /**
     * Gets or requests a challenge from the network.
     */
    private suspend fun getOrRequestChallenge(): SubmissionClient.ChallengeResponse {
        submissionClient.getCurrentChallenge()?.let { nonce ->
            // Use cached challenge if valid
            return SubmissionClient.ChallengeResponse(
                nonce = nonce,
                difficulty = DEFAULT_DIFFICULTY,
                expiresAt = System.currentTimeMillis() + 5 * 60 * 1000
            )
        }
        return submissionClient.requestChallenge()
    }
    
    /**
     * Solves the challenge by finding a valid worker nonce.
     */
    private suspend fun solveChallenge(
        challenge: SubmissionClient.ChallengeResponse
    ): ByteArray? = withContext(Dispatchers.Default) {
        _isComputing.value = true
        try {
            withTimeout(MAX_WORK_TIME_MS) {
                var nonce: ByteArray? = null
                var attempts = 0L
                
                while (nonce == null && isActive) {
                    // Generate random nonce
                    val candidate = verifierEngine.generateRandomNonce(32)
                    attempts++
                    
                    // Check if it solves the challenge
                    if (verifierEngine.verifyChallenge(
                            challengeNonce = challenge.nonce,
                            workerNonce = candidate,
                            difficulty = challenge.difficulty
                        )) {
                        nonce = candidate
                        Log.d(TAG, "Solved challenge after $attempts attempts")
                    }
                    
                    // Yield periodically
                    if (attempts % 10000 == 0L) {
                        yield()
                    }
                }
                nonce
            }
        } catch (e: TimeoutCancellationException) {
            Log.w(TAG, "Challenge solving timed out")
            null
        } finally {
            _isComputing.value = false
        }
    }
    
    /**
     * Processes pending receipts and submits them to the network.
     */
    private suspend fun processPendingSubmissions() {
        val pending = receiptStore.getPending(MAX_BATCH_SIZE)
        if (pending.isEmpty()) return
        
        Log.d(TAG, "Submitting ${pending.size} pending receipts")
        
        // Mark as queued
        pending.forEach { receipt ->
            receiptStore.update(receipt.copy(state = ReceiptState.QUEUED))
        }
        
        try {
            val response = submissionClient.submitBatch(pending)
            
            totalSubmitted += pending.size
            
            if (response.success) {
                // Mark accepted nonces
                receiptStore.markAccepted(response.acceptedNonces)
                totalAccepted += response.acceptedCount
                
                // Mark rejected nonces
                response.rejectedNonces.forEach { nonce ->
                    receiptStore.markRejected(nonce, "Rejected by network")
                    totalRejected++
                }
                
                Log.d(TAG, "Submitted: ${response.acceptedCount} accepted, ${response.rejectedNonces.size} rejected")
            } else {
                // Mark all as retry
                pending.forEach { receipt ->
                    receiptStore.markRetry(receipt.receiptNonce, "Submission failed")
                }
            }
        } catch (e: PoUWError.NetworkError) {
            // Mark all as retry on network error
            pending.forEach { receipt ->
                receiptStore.markRetry(receipt.receiptNonce, e.message)
            }
            Log.e(TAG, "Network error during submission: ${e.message}")
        } catch (e: Exception) {
            pending.forEach { receipt ->
                receiptStore.markRetry(receipt.receiptNonce, e.message)
            }
            Log.e(TAG, "Submission error: ${e.message}", e)
        }
        
        updateStats()
    }
    
    /**
     * Updates the stats flow with current values.
     */
    private suspend fun updateStats() {
        val pending = receiptStore.pendingCount()
        _stats.value = PoUWStats(
            pendingCount = pending,
            totalSubmitted = totalSubmitted,
            totalAccepted = totalAccepted,
            totalRejected = totalRejected,
            currentDifficulty = DEFAULT_DIFFICULTY
        )
    }
    
    /**
     * Builds the signed receipt data structure.
     */
    private fun buildSignedReceiptData(
        taskId: ByteArray,
        receiptNonce: ByteArray,
        challengeNonce: ByteArray,
        workerNonce: ByteArray,
        contentHash: ByteArray,
        timestamp: Long,
        signature: ByteArray,
        publicKey: ByteArray
    ): ByteArray {
        // Simple binary format: version(1) || timestamp(8) || taskId(32) || 
        //                       receiptNonce(32) || challengeNonce(32) || 
        //                       workerNonce(32) || contentHash(32) || 
        //                       publicKeyLen(2) || publicKey || signatureLen(2) || signature
        
        val version = byteArrayOf(0x01)
        val tsBytes = timestamp.toBigEndianBytes()
        val pkLen = publicKey.size.toShort().toBigEndianBytes()
        val sigLen = signature.size.toShort().toBigEndianBytes()
        
        return version + tsBytes + taskId + receiptNonce + challengeNonce + 
               workerNonce + contentHash + pkLen + publicKey + sigLen + signature
    }
    
    /**
     * Converts Long to 8-byte big-endian.
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
     * Converts Short to 2-byte big-endian.
     */
    private fun Short.toBigEndianBytes(): ByteArray {
        return byteArrayOf(
            (this.toInt() shr 8).toByte(),
            this.toByte()
        )
    }
    
    /**
     * Converts ByteArray to hex string.
     */
    private fun ByteArray.toHex(): String {
        return joinToString("") { "%02x".format(it) }
    }
    
    /**
     * Cleanup resources.
     */
    fun destroy() {
        stop()
        receiptStore.close()
    }
}
