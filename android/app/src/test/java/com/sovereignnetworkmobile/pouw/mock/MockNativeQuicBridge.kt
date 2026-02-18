package com.sovereignnetworkmobile.pouw.mock

import com.sovereignnetworkmobile.NativeQuicBridge
import org.json.JSONObject

/**
 * Mock implementation of NativeQuicBridge for testing.
 * Simulates QUIC network responses without actual network calls.
 */
class MockNativeQuicBridge {

    private var challengeResponse: Map<String, Any?>? = null
    private var submitResponse: Map<String, Any?>? = null
    private var shouldFail = false
    private var failureError: String = "Network error"
    private var delayMs: Long = 0
    private val requestHistory = mutableListOf<RequestRecord>()

    /**
     * Records details of each request made.
     */
    data class RequestRecord(
        val url: String,
        val method: String,
        val body: String,
        val timestamp: Long
    )

    /**
     * Simulates the NativeQuicBridge.request method.
     */
    fun request(
        url: String,
        method: String = "GET",
        headersJson: String = "{}",
        body: String = "",
        timeoutSecs: Int = 30,
        insecure: Boolean = true,
        alpn: String = "public"
    ): Map<String, Any?>? {
        requestHistory.add(RequestRecord(url, method, body, System.currentTimeMillis()))

        if (delayMs > 0) {
            Thread.sleep(delayMs)
        }

        if (shouldFail) {
            return mapOf(
                "ok" to false,
                "status" to 0,
                "error" to failureError
            )
        }

        return when {
            url.contains("/challenge") -> challengeResponse ?: createDefaultChallengeResponse()
            url.contains("/submit") || url.contains("/batch") -> submitResponse ?: createDefaultSubmitResponse()
            else -> mapOf(
                "ok" to false,
                "status" to 404,
                "error" to "Unknown endpoint"
            )
        }
    }

    /**
     * Sets the mock challenge response.
     */
    fun setChallengeResponse(nonce: String, difficulty: Int, expiresAt: Long = System.currentTimeMillis() + 300000) {
        challengeResponse = mapOf(
            "ok" to true,
            "status" to 200,
            "body" to JSONObject().apply {
                put("nonce", nonce)
                put("difficulty", difficulty)
                put("expires_at", expiresAt)
            }.toString()
        )
    }

    /**
     * Sets the mock submit response.
     */
    fun setSubmitResponse(success: Boolean, acceptedCount: Int, rejected: List<String> = emptyList()) {
        submitResponse = mapOf(
            "ok" to true,
            "status" to if (success) 200 else 400,
            "body" to JSONObject().apply {
                put("success", success)
                put("accepted_count", acceptedCount)
                put("rejected", org.json.JSONArray(rejected))
            }.toString()
        )
    }

    /**
     * Sets the mock to fail with the given error.
     */
    fun setShouldFail(error: String = "Network error") {
        shouldFail = true
        failureError = error
    }

    /**
     * Clears the failure state.
     */
    fun clearFailure() {
        shouldFail = false
    }

    /**
     * Sets a delay for all requests.
     */
    fun setDelay(delayMs: Long) {
        this.delayMs = delayMs
    }

    /**
     * Returns the request history.
     */
    fun getRequestHistory(): List<RequestRecord> = requestHistory.toList()

    /**
     * Clears the request history.
     */
    fun clearHistory() {
        requestHistory.clear()
    }

    /**
     * Returns the number of requests made.
     */
    fun getRequestCount(): Int = requestHistory.size

    private fun createDefaultChallengeResponse(): Map<String, Any?> {
        return mapOf(
            "ok" to true,
            "status" to 200,
            "body" to JSONObject().apply {
                put("nonce", "abcd1234".repeat(8)) // 64 hex chars = 32 bytes
                put("difficulty", 20)
                put("expires_at", System.currentTimeMillis() + 300000)
            }.toString()
        )
    }

    private fun createDefaultSubmitResponse(): Map<String, Any?> {
        return mapOf(
            "ok" to true,
            "status" to 200,
            "body" to JSONObject().apply {
                put("success", true)
                put("accepted_count", 1)
                put("rejected", org.json.JSONArray())
            }.toString()
        )
    }
}
