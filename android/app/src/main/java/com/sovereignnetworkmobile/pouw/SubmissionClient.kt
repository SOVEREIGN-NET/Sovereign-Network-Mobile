package com.sovereignnetworkmobile.pouw

import android.util.Base64
import android.util.Log
import com.sovereignnetworkmobile.NativeQuicBridge
import com.sovereignnetworkmobile.pouw.model.PoUWError
import com.sovereignnetworkmobile.pouw.model.ReceiptEntity
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.nio.charset.StandardCharsets
import java.util.concurrent.atomic.AtomicLong

/**
 * SubmissionClient handles submitting PoUW receipts to the network via QUIC.
 * Uses NativeQuicBridge for all network communication.
 * 
 * Rate limits:
 * - Max 50 requests per 60 seconds for challenge and submit
 * - Max 100 receipts per batch
 */
class SubmissionClient(
    private var nodeHost: String,
    private var nodePort: Int = 443,
    private val identitySigner: IdentitySigner,
    private val insecure: Boolean = true
) {
    fun setNodeUrl(url: String) {
        val withoutScheme = url.removePrefix("https://").removePrefix("http://").removePrefix("quic://").trimEnd('/')
        val parts = withoutScheme.split(":")
        nodeHost = parts[0]
        nodePort = if (parts.size > 1) parts[1].toIntOrNull() ?: 443 else 443
    }
    
    companion object {
        private const val TAG = "PoUWSubmissionClient"
        private const val MAX_REQUESTS_PER_MINUTE = 50
        private const val RATE_LIMIT_WINDOW_MS = 60_000L
        private const val MAX_BATCH_SIZE = 100
        private const val DEFAULT_TIMEOUT_SECS = 30
        private const val CHALLENGE_PATH = "/api/v1/pouw/challenge"
        private const val SUBMIT_PATH = "/api/v1/pouw/submit"
        private const val BATCH_SUBMIT_PATH = "/api/v1/pouw/submit"
        private const val LEGACY_CHALLENGE_PATH = "/pouw/challenge"
        private const val LEGACY_SUBMIT_PATH = "/pouw/submit"
        private const val LEGACY_BATCH_SUBMIT_PATH = "/pouw/batch"
    }
    
    private val requestTimestamps = mutableListOf<Long>()
    private val rateLimitLock = Any()
    
    // Track challenge expiration
    private var currentChallengeNonce: ByteArray? = null
    private var challengeExpirationTime: Long = 0
    private var currentTaskId: ByteArray? = null
    private var currentPolicy: ChallengePolicy? = null
    private val CHALLENGE_VALIDITY_MS = 5 * 60 * 1000 // 5 minutes
    
    /**
     * Request a new PoUW challenge from the network.
     * 
     * @return Challenge response containing nonce and difficulty
     * @throws PoUWError.NetworkError if request fails
     * @throws PoUWError.ChallengeExpired if challenge request times out
     * @throws PoUWError.SerializationError if response parsing fails
     */
    @Throws(PoUWError::class)
    suspend fun requestChallenge(
        cap: String? = null,
        maxBytes: Long = 0,
        maxReceipts: Int = 0
    ): ChallengeResponse {
        checkRateLimit()

        val queryParams = mutableListOf<String>()
        if (!cap.isNullOrBlank()) {
            queryParams.add("cap=$cap")
        }
        if (maxBytes > 0) {
            queryParams.add("max_bytes=$maxBytes")
        }
        if (maxReceipts > 0) {
            queryParams.add("max_receipts=$maxReceipts")
        }
        val suffix = if (queryParams.isNotEmpty()) {
            "?" + queryParams.joinToString("&")
        } else {
            ""
        }
        val primaryUrl = buildQuicUrl(CHALLENGE_PATH + suffix)
        val legacyUrl = buildQuicUrl(LEGACY_CHALLENGE_PATH + suffix)
        
        return try {
            val result = executeRequestWithPathFallback(
                primaryUrl = primaryUrl,
                legacyUrl = legacyUrl,
                method = "GET",
                headersJson = "{}",
                body = "",
                timeoutSecs = DEFAULT_TIMEOUT_SECS,
                alpn = "public"
            )
            
            recordRequest()
            
            val status = result?.get("status") as? Int ?: 0
            val body = result?.get("body") as? String
            val error = result?.get("error") as? String
            
            when (status) {
                200 -> parseChallengeResponse(body ?: "")
                429 -> throw PoUWError.NetworkError(Exception("Rate limited by server"))
                in 500..599 -> throw PoUWError.NetworkError(Exception("Server error: $status"))
                0 -> throw PoUWError.NetworkError(Exception("QUIC error: $error"))
                else -> throw PoUWError.NetworkError(Exception("Response status $status"))
            }
        } catch (e: PoUWError) {
            throw e
        } catch (e: Exception) {
            Log.e(TAG, "Challenge request failed: ${e.message}", e)
            throw PoUWError.NetworkError(e)
        }
    }
    
    /**
     * Submits a single receipt to the network.
     * 
     * @param receipt The receipt to submit
     * @return Submission response from the network
     * @throws PoUWError.NetworkError if submission fails
     */
    @Throws(PoUWError::class)
    suspend fun submitReceipt(receipt: ReceiptEntity): SubmitResponse {
        return submitBatch(listOf(receipt))
    }
    
    /**
     * Submits multiple receipts in a batch.
     * 
     * @param receipts List of receipts to submit (max 100)
     * @return Submission response from the network
     * @throws PoUWError.NetworkError if submission fails
     * @throws IllegalArgumentException if batch size exceeds MAX_BATCH_SIZE
     */
    @Throws(PoUWError::class)
    suspend fun submitBatch(receipts: List<ReceiptEntity>): SubmitResponse {
        if (receipts.isEmpty()) {
            return SubmitResponse(success = true, acceptedCount = 0, rejectedNonces = emptyList())
        }
        
        if (receipts.size > MAX_BATCH_SIZE) {
            throw IllegalArgumentException("Batch size exceeds maximum of $MAX_BATCH_SIZE")
        }
        
        checkRateLimit()
        
        val primaryPath = if (receipts.size == 1) SUBMIT_PATH else BATCH_SUBMIT_PATH
        val legacyPath = if (receipts.size == 1) LEGACY_SUBMIT_PATH else LEGACY_BATCH_SUBMIT_PATH
        val primaryUrl = buildQuicUrl(primaryPath)
        val legacyUrl = buildQuicUrl(legacyPath)
        val body = buildBatchPayload(receipts)
        
        return try {
            val result = executeRequestWithPathFallback(
                primaryUrl = primaryUrl,
                legacyUrl = legacyUrl,
                method = "POST",
                headersJson = JSONObject().apply {
                    put("content-type", "application/json")
                }.toString(),
                body = body,
                timeoutSecs = DEFAULT_TIMEOUT_SECS,
                alpn = "public"
            )
            
            recordRequest()
            
            val status = result?.get("status") as? Int ?: 0
            val responseBody = result?.get("body") as? String
            val error = result?.get("error") as? String
            
            when (status) {
                200, 201, 202 -> parseSubmitResponse(responseBody ?: "", receipts)
                400 -> throw PoUWError.VerificationFailed()
                429 -> throw PoUWError.NetworkError(Exception("Rate limited by server"))
                in 500..599 -> throw PoUWError.NetworkError(Exception("Server error: $status"))
                0 -> throw PoUWError.NetworkError(Exception("QUIC error: $error"))
                else -> throw PoUWError.NetworkError(Exception("Response status $status"))
            }
        } catch (e: PoUWError) {
            throw e
        } catch (e: Exception) {
            Log.e(TAG, "Submit failed: ${e.message}", e)
            throw PoUWError.NetworkError(e)
        }
    }
    
    /**
     * Verifies that a challenge is still valid (not expired).
     * 
     * @return true if the current challenge is valid
     */
    fun isChallengeValid(): Boolean {
        return currentChallengeNonce != null && 
               System.currentTimeMillis() < challengeExpirationTime
    }
    
    /**
     * Gets the current challenge nonce if valid.
     * 
     * @return The challenge nonce or null if expired/not available
     */
    fun getCurrentChallenge(): ByteArray? {
        return if (isChallengeValid()) currentChallengeNonce else null
    }
    
    /**
     * Gets the current task ID if challenge is valid.
     * 
     * @return The task ID or null if expired/not available
     */
    fun getCurrentTaskId(): ByteArray? {
        return if (isChallengeValid()) currentTaskId else null
    }
    
    /**
     * Gets the current challenge policy if valid.
     * 
     * @return The policy or null if expired/not available
     */
    fun getCurrentPolicy(): ChallengePolicy? {
        return if (isChallengeValid()) currentPolicy else null
    }
    
    /**
     * Clears the current challenge, forcing a new challenge request.
     */
    fun clearChallenge() {
        currentChallengeNonce = null
        challengeExpirationTime = 0
        currentTaskId = null
        currentPolicy = null
    }
    
    /**
     * Builds the QUIC URL for the given path.
     */
    private fun buildQuicUrl(path: String): String {
        return "quic://$nodeHost:$nodePort$path"
    }

    private suspend fun executeRequestWithPathFallback(
        primaryUrl: String,
        legacyUrl: String,
        method: String,
        headersJson: String,
        body: String,
        timeoutSecs: Int,
        alpn: String
    ): Map<*, *>? {
        val primary = withContext(Dispatchers.IO) {
            NativeQuicBridge.request(
                url = primaryUrl,
                method = method,
                headersJson = headersJson,
                body = body,
                timeoutSecs = timeoutSecs,
                insecure = insecure,
                alpn = alpn
            )
        }
        val primaryStatus = (primary?.get("status") as? Int) ?: 0
        if (primaryStatus != 404) {
            return primary
        }

        Log.w(TAG, "Primary PoUW path returned 404, retrying legacy path")
        return withContext(Dispatchers.IO) {
            NativeQuicBridge.request(
                url = legacyUrl,
                method = method,
                headersJson = headersJson,
                body = body,
                timeoutSecs = timeoutSecs,
                insecure = insecure,
                alpn = alpn
            )
        }
    }
    
    /**
     * Parses the challenge response from the network.
     * The response contains a base64-encoded ChallengeToken protobuf.
     * 
     * Spec response format:
     * {
     *   "token": "base64-encoded-protobuf",
     *   "expires_at": 1760000030
     * }
     */
    private fun parseChallengeResponse(body: String): ChallengeResponse {
        return try {
            val json = JSONObject(body)
            val tokenRaw = (when {
                json.has("token") -> json.optString("token", "")
                json.has("challenge") -> json.optString("challenge", "")
                json.has("data") && json.opt("data") is JSONObject ->
                    (json.optJSONObject("data")?.optString("token", "")
                        ?: json.optJSONObject("data")?.optString("challenge", ""))
                json.has("result") && json.opt("result") is JSONObject ->
                    (json.optJSONObject("result")?.optString("token", "")
                        ?: json.optJSONObject("result")?.optString("challenge", ""))
                else -> ""
            })?.trim() ?: ""
            val expiresAt = json.optLong("expires_at", System.currentTimeMillis() / 1000 + 300)

            if (tokenRaw.isEmpty()) {
                throw IllegalStateException("Challenge response missing token/challenge field")
            }

            val token = parseChallengeTokenFlexible(tokenRaw)
            if (token.challengeNonce.isEmpty()) {
                throw IllegalStateException("Challenge token contained empty challenge_nonce")
            }
            
            currentChallengeNonce = token.challengeNonce
            challengeExpirationTime = expiresAt * 1000 // Convert seconds to milliseconds
            currentTaskId = token.taskId
            currentPolicy = token.policy
            
            ChallengeResponse(
                nonce = token.challengeNonce,
                difficulty = token.policy?.difficulty ?: 20,
                expiresAt = expiresAt * 1000,
                taskId = token.taskId,
                policy = token.policy
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse challenge response: ${e.message}", e)
            throw PoUWError.SerializationError()
        }
    }

    private fun parseChallengeTokenFlexible(token: String): ChallengeToken {
        val trimmed = token.trim()
        require(trimmed.isNotEmpty()) { "Empty challenge token" }

        // 1) Raw JSON payload.
        parseChallengeTokenJson(trimmed)?.let { return it }

        // 2) Decode as base64/base64url and parse JSON/protobuf.
        decodeBase64Maybe(trimmed)?.let { decoded ->
            parseDecodedTokenPayload(decoded, 0)?.let { return it }
        }

        // 2b) Decode as hex payload and parse JSON/protobuf.
        decodeHexMaybe(trimmed)?.let { decoded ->
            parseDecodedTokenPayload(decoded, 0)?.let { return it }
        }

        // 3) JWT-like payload: try segment[1] then segment[0].
        if (trimmed.contains('.')) {
            val segments = trimmed.split('.')
            val indexes = intArrayOf(1, 0)
            for (idx in indexes) {
                if (idx >= segments.size) continue
                decodeBase64Maybe(segments[idx])?.let { decoded ->
                    parseDecodedTokenPayload(decoded, 0)?.let { return it }
                }
            }
        }

        throw IllegalStateException("Unsupported challenge token format")
    }

    private fun parseDecodedTokenPayload(payload: ByteArray, depth: Int): ChallengeToken? {
        parseChallengeTokenJson(payload.toString(StandardCharsets.UTF_8))?.let { return it }
        parseChallengeToken(payload)?.let { return it }

        if (depth < 2) {
            val innerText = payload.toString(StandardCharsets.UTF_8).trim()
            if (innerText.isNotEmpty()) {
                decodeBase64Maybe(innerText)?.let { innerDecoded ->
                    parseDecodedTokenPayload(innerDecoded, depth + 1)?.let { return it }
                }
                decodeHexMaybe(innerText)?.let { innerHex ->
                    parseDecodedTokenPayload(innerHex, depth + 1)?.let { return it }
                }
            }
        }
        return null
    }

    private fun parseChallengeTokenJson(raw: String): ChallengeToken? {
        return try {
            val root = JSONObject(raw)
            val taskRaw = findStringValue(root, setOf("task_id", "taskId"))
            val nonceRaw = findStringValue(root, setOf("challenge_nonce", "challengeNonce"))
            val taskId = normalizeIdentifierToBytes(taskRaw ?: return null) ?: return null
            val challengeNonce = normalizeIdentifierToBytes(nonceRaw ?: return null) ?: return null
            if (taskId.isEmpty() || challengeNonce.isEmpty()) return null

            val expiresAt = root.optLong("expires_at", 0L)
            ChallengeToken(
                taskId = taskId,
                challengeNonce = challengeNonce,
                expiresAt = expiresAt,
                policy = null
            )
        } catch (_: Exception) {
            null
        }
    }

    private fun findStringValue(value: Any?, keys: Set<String>): String? {
        when (value) {
            is JSONObject -> {
                val iter = value.keys()
                while (iter.hasNext()) {
                    val key = iter.next()
                    val candidate = value.opt(key)
                    if (keys.contains(key) && candidate is String) {
                        return candidate
                    }
                }
                val iter2 = value.keys()
                while (iter2.hasNext()) {
                    val key = iter2.next()
                    val found = findStringValue(value.opt(key), keys)
                    if (found != null) return found
                }
            }
            is JSONArray -> {
                for (i in 0 until value.length()) {
                    val found = findStringValue(value.opt(i), keys)
                    if (found != null) return found
                }
            }
        }
        return null
    }

    private fun normalizeIdentifierToBytes(value: String): ByteArray? {
        val trimmed = value.trim()
        if (trimmed.isEmpty()) return null
        val noPrefix = if (trimmed.startsWith("0x", true)) trimmed.substring(2) else trimmed

        decodeHexMaybe(noPrefix)?.let { return it }
        decodeBase64Maybe(noPrefix)?.let {
            if (it.isNotEmpty()) return it
        }
        return null
    }

    private fun decodeBase64Maybe(value: String): ByteArray? {
        val normalized = normalizeBase64(value.trim())
        return try {
            Base64.decode(normalized, Base64.DEFAULT)
        } catch (_: IllegalArgumentException) {
            null
        }
    }

    private fun decodeHexMaybe(value: String): ByteArray? {
        val trimmed = value.trim()
        if (trimmed.isEmpty()) return null
        val noPrefix = if (trimmed.startsWith("0x", true)) trimmed.substring(2) else trimmed
        if (noPrefix.length % 2 != 0) return null
        if (!noPrefix.matches(Regex("^[0-9a-fA-F]+$"))) return null
        return noPrefix.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
    }

    private fun normalizeBase64(value: String): String {
        var normalized = value.replace('-', '+').replace('_', '/')
        val remainder = normalized.length % 4
        if (remainder != 0) {
            normalized += "=".repeat(4 - remainder)
        }
        return normalized
    }
    
    /**
     * Parses a ChallengeToken protobuf from bytes.
     * This is a simple protobuf parser for the ChallengeToken message.
     * 
     * ChallengeToken protobuf structure:
     * - task_id: bytes (field 1)
     * - challenge_nonce: bytes (field 2)
     * - expires_at: uint64 (field 3)
     * - policy: Policy message (field 4)
     */
    private fun parseChallengeToken(bytes: ByteArray): ChallengeToken? {
        val input = ByteArrayInputStream(bytes)
        var taskId: ByteArray? = null
        var challengeNonce: ByteArray? = null
        var expiresAt: Long = 0
        var policy: ChallengePolicy? = null
        
        while (input.available() > 0) {
            val tag = input.read()
            if (tag == -1) break
            
            val fieldNumber = (tag shr 3)
            val wireType = tag and 0x07
            
            when (fieldNumber) {
                3 -> { // task_id: bytes (current server schema)
                    if (wireType == 2) {
                        taskId = readLengthDelimited(input)
                    }
                }
                4 -> { // challenge_nonce: bytes (current server schema)
                    if (wireType == 2) {
                        challengeNonce = readLengthDelimited(input)
                    }
                }
                5 -> { // expires_at: varint (current server schema)
                    if (wireType == 0) {
                        expiresAt = readVarint(input)
                    }
                }
                6 -> { // policy: embedded message (current server schema)
                    if (wireType == 2) {
                        val policyBytes = readLengthDelimited(input)
                        policy = parsePolicy(policyBytes)
                    }
                }
                // Backward compatibility for earlier parser assumptions
                1 -> if (wireType == 2) taskId = readLengthDelimited(input)
                2 -> if (wireType == 2) challengeNonce = readLengthDelimited(input)
                else -> {
                    // Skip unknown field
                    skipField(input, wireType)
                }
            }
        }

        if (taskId == null || challengeNonce == null || taskId.isEmpty() || challengeNonce.isEmpty()) {
            return null
        }

        return ChallengeToken(
            taskId = taskId,
            challengeNonce = challengeNonce,
            expiresAt = expiresAt,
            policy = policy
        )
    }
    
    /**
     * Parses a Policy protobuf message.
     */
    private fun parsePolicy(bytes: ByteArray): ChallengePolicy {
        val input = ByteArrayInputStream(bytes)
        var maxReceipts: Int = 100
        var difficulty: Int = 20
        
        while (input.available() > 0) {
            val tag = input.read()
            if (tag == -1) break
            
            val fieldNumber = (tag shr 3)
            val wireType = tag and 0x07
            
            when (fieldNumber) {
                1 -> { // max_receipts: varint
                    if (wireType == 0) {
                        maxReceipts = readVarint(input).toInt()
                    }
                }
                2 -> { // difficulty: varint
                    if (wireType == 0) {
                        difficulty = readVarint(input).toInt()
                    }
                }
                else -> {
                    skipField(input, wireType)
                }
            }
        }
        
        return ChallengePolicy(maxReceipts = maxReceipts, difficulty = difficulty)
    }
    
    /**
     * Reads a length-delimited field from the input stream.
     */
    private fun readLengthDelimited(input: ByteArrayInputStream): ByteArray {
        val length = readVarint(input).toInt()
        val bytes = ByteArray(length)
        input.read(bytes)
        return bytes
    }
    
    /**
     * Reads a varint from the input stream.
     */
    private fun readVarint(input: ByteArrayInputStream): Long {
        var result: Long = 0
        var shift = 0
        while (true) {
            val b = input.read()
            if (b == -1) throw IllegalStateException("Unexpected end of stream")
            result = result or ((b and 0x7F).toLong() shl shift)
            if ((b and 0x80) == 0) break
            shift += 7
        }
        return result
    }
    
    /**
     * Skips an unknown field based on its wire type.
     */
    private fun skipField(input: ByteArrayInputStream, wireType: Int) {
        when (wireType) {
            0 -> { // Varint
                while (input.read() and 0x80 != 0) {}
            }
            2 -> { // Length-delimited
                val length = readVarint(input).toInt()
                input.skip(length.toLong())
            }
            5 -> { // Fixed32
                input.skip(4)
            }
            1 -> { // Fixed64
                input.skip(8)
            }
        }
    }
    
    /**
     * Parses the submission response from the network.
     * 
     * Spec response format:
     * {
     *   "accepted": 1,
     *   "rejected": 0
     * }
     */
    private fun parseSubmitResponse(body: String, submittedReceipts: List<ReceiptEntity>): SubmitResponse {
        return try {
            val json = JSONObject(body)

            // Explicit success path: numeric accepted/rejected counters.
            if (json.has("accepted") || json.has("rejected")) {
                val accepted = json.optInt("accepted", 0).coerceIn(0, submittedReceipts.size)
                val rejectedDefault = (submittedReceipts.size - accepted).coerceAtLeast(0)
                val rejected = json.optInt("rejected", rejectedDefault).coerceIn(0, submittedReceipts.size - accepted)

                val acceptedNonces = submittedReceipts.take(accepted).map { it.receiptNonce }
                val rejectedNonces = submittedReceipts.drop(accepted).take(rejected).map { it.receiptNonce }

                return SubmitResponse(
                    success = true,
                    acceptedCount = accepted,
                    acceptedNonces = acceptedNonces,
                    rejectedNonces = rejectedNonces
                )
            }

            // Common rejection shapes from server (e.g., BadSig / Invalid request).
            val hasError = json.has("error") || json.has("message") || json.has("code")
            if (hasError) {
                return SubmitResponse(
                    success = false,
                    acceptedCount = 0,
                    acceptedNonces = emptyList(),
                    rejectedNonces = submittedReceipts.map { it.receiptNonce }
                )
            }

            // Unknown body shape - do not treat as accepted.
            SubmitResponse(
                success = false,
                acceptedCount = 0,
                acceptedNonces = emptyList(),
                rejectedNonces = submittedReceipts.map { it.receiptNonce }
            )
        } catch (e: Exception) {
            // Parse failure should not be treated as acceptance.
            SubmitResponse(
                success = false,
                acceptedCount = 0,
                acceptedNonces = emptyList(),
                rejectedNonces = submittedReceipts.map { it.receiptNonce }
            )
        }
    }
    
    /**
     * Builds the JSON payload for batch submission.
     * 
     * Spec request format:
     * {
     *   "version": 1,
     *   "client_did": "did:zhtp:alice",
     *   "receipts": [
     *     {
     *       "receipt": {
     *         "version": 1,
     *         "task_id": "hex",
     *         "client_did": "did:zhtp:alice",
     *         "client_node_id": "hex-32-bytes",
     *         "provider_id": "hex",
     *         "content_id": "hex",
     *         "proof_type": "hash",
     *         "bytes_verified": 1024,
     *         "result_ok": true,
     *         "started_at": 1760000010,
     *         "finished_at": 1760000020,
     *         "receipt_nonce": "hex-16-bytes",
     *         "challenge_nonce": "hex"
     *       },
     *       "sig_scheme": "dilithium5",
     *       "signature": "hex"
     *     }
     *   ]
     * }
     */
    private fun buildBatchPayload(receipts: List<ReceiptEntity>): String {
        val receiptsArray = JSONArray()
        
        receipts.forEach { receipt ->
            val receiptInner = JSONObject().apply {
                put("version", 1)
                put("task_id", receipt.taskId.toHex())
                put("client_did", receipt.clientDid ?: "")
                put("client_node_id", receipt.clientNodeId.toHex())
                // Server deserializer requires provider_id field presence.
                // Use empty string when provider is unknown to preserve schema shape.
                put("provider_id", receipt.providerId?.toHex() ?: "")
                put("content_id", receipt.contentId.toHex())
                put("proof_type", receipt.proofType)
                put("bytes_verified", receipt.bytesVerified)
                put("result_ok", receipt.resultOk)
                put("started_at", receipt.startedAt)
                put("finished_at", receipt.finishedAt)
                put("receipt_nonce", receipt.receiptNonce.toHex())
                put("challenge_nonce", receipt.challengeNonce.toHex())
                // iOS parity: include aux in receipt payload and signature input.
                put("aux", "{}")
            }
            
            val receiptObj = JSONObject().apply {
                put("receipt", receiptInner)
                put("sig_scheme", "dilithium5")
                put("signature", signReceiptJson(receiptInner))
            }
            receiptsArray.put(receiptObj)
        }
        
        return JSONObject().apply {
            put("version", 1)
            put("client_did", receipts.firstOrNull()?.clientDid ?: "")
            put("receipts", receiptsArray)
        }.toString()
    }

    /**
     * Sign the exact receipt JSON that will be sent to the server.
     * This mirrors iOS behavior and avoids signature mismatch from custom byte encodings.
     */
    private fun signReceiptJson(receiptJson: JSONObject): String {
        val signature = identitySigner.signPoUWReceiptJson(receiptJson.toString())
        return signature.toHex()
    }
    
    /**
     * Checks if we're within rate limits.
     * Throws NetworkError if rate limit would be exceeded.
     */
    private fun checkRateLimit() {
        synchronized(rateLimitLock) {
            val now = System.currentTimeMillis()
            // Remove timestamps outside the window
            requestTimestamps.removeAll { now - it > RATE_LIMIT_WINDOW_MS }
            
            if (requestTimestamps.size >= MAX_REQUESTS_PER_MINUTE) {
                val oldestRequest = requestTimestamps.firstOrNull() ?: now
                val waitTime = RATE_LIMIT_WINDOW_MS - (now - oldestRequest)
                throw PoUWError.NetworkError(
                    Exception("Rate limit exceeded. Try again in ${waitTime / 1000} seconds.")
                )
            }
        }
    }
    
    /**
     * Records a request timestamp for rate limiting.
     */
    private fun recordRequest() {
        synchronized(rateLimitLock) {
            requestTimestamps.add(System.currentTimeMillis())
        }
    }
    
    /**
     * Converts ByteArray to hex string.
     */
    private fun ByteArray.toHex(): String {
        return joinToString("") { "%02x".format(it) }
    }
    
    /**
     * Converts hex string to ByteArray.
     */
    private fun String.decodeHex(): ByteArray {
        check(length % 2 == 0) { "Hex string must have even length" }
        return chunked(2).map { it.toInt(16).toByte() }.toByteArray()
    }
    
    /**
     * Converts ByteArray to Base64 string.
     */
    private fun ByteArray.toBase64(): String {
        return android.util.Base64.encodeToString(this, android.util.Base64.NO_WRAP)
    }
    
    /**
     * ChallengeToken parsed from base64 protobuf.
     */
    data class ChallengeToken(
        val taskId: ByteArray,
        val challengeNonce: ByteArray,
        val expiresAt: Long,
        val policy: ChallengePolicy?
    ) {
        override fun equals(other: Any?): Boolean {
            if (this === other) return true
            if (other !is ChallengeToken) return false
            return taskId.contentEquals(other.taskId) &&
                   challengeNonce.contentEquals(other.challengeNonce) &&
                   expiresAt == other.expiresAt
        }
        
        override fun hashCode(): Int {
            var result = taskId.contentHashCode()
            result = 31 * result + challengeNonce.contentHashCode()
            result = 31 * result + expiresAt.hashCode()
            return result
        }
    }
    
    /**
     * Policy embedded in ChallengeToken.
     */
    data class ChallengePolicy(
        val maxReceipts: Int,
        val difficulty: Int
    )
    
    /**
     * Response from challenge request.
     */
    data class ChallengeResponse(
        val nonce: ByteArray,
        val difficulty: Int,
        val expiresAt: Long,
        val taskId: ByteArray? = null,
        val policy: ChallengePolicy? = null
    ) {
        override fun equals(other: Any?): Boolean {
            if (this === other) return true
            if (other !is ChallengeResponse) return false
            return nonce.contentEquals(other.nonce) && 
                   difficulty == other.difficulty &&
                   expiresAt == other.expiresAt
        }
        
        override fun hashCode(): Int {
            var result = nonce.contentHashCode()
            result = 31 * result + difficulty
            result = 31 * result + expiresAt.hashCode()
            return result
        }
    }
    
    /**
     * Response from receipt submission.
     */
    data class SubmitResponse(
        val success: Boolean,
        val acceptedCount: Int,
        val acceptedNonces: List<ByteArray> = emptyList(),
        val rejectedNonces: List<ByteArray> = emptyList()
    )
}
