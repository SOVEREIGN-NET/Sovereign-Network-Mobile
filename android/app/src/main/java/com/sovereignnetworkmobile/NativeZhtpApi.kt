package com.sovereignnetworkmobile

import android.util.Log
import com.facebook.react.bridge.*
import kotlinx.coroutines.*
import org.json.JSONObject
import java.net.URL

class NativeZhtpApi(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

  companion object {
    private const val TAG = "NativeZhtpApi"
  }

  override fun getName(): String = "NativeZhtpApi"

  @ReactMethod
  fun signIn(
    identityId: String,
    password: String,
    nodeUrl: String,
    promise: Promise
  ) {
    GlobalScope.launch(Dispatchers.Default) {
      try {
        Log.d(TAG, "signIn: identityId=$identityId")

        if (identityId.trim().isEmpty()) {
          promise.reject(
            "INVALID_INPUT",
            "Identity ID cannot be empty"
          )
          return@launch
        }

        if (password.length < 8) {
          promise.reject(
            "INVALID_INPUT",
            "Password must be at least 8 characters"
          )
          return@launch
        }

        val loginUrl = buildQuicUrl(nodeUrl, "/api/v1/identity/login")
        Log.d(TAG, "Sending login request to: $loginUrl")

        val loginPayload = JSONObject().apply {
          put("identity_id", identityId.trim())
          put("password", password)
        }

        val response = makeQuicRequest(loginUrl, "POST", loginPayload.toString(), 30, "authenticated")
        val statusCode = response.first
        val responseBody = response.second

        Log.d(TAG, "signIn response status: $statusCode")

        when (statusCode) {
          200 -> {
            val identity = JSONObject(responseBody)
            val resultMap = Arguments.createMap().apply {
              putString("identityId", identity.optString("identity_id"))
              putString("did", identity.optString("did"))
              putString("displayName", identity.optString("display_name"))
              putString("identityType", identity.optString("identity_type"))
              putString("deviceId", identity.optString("device_id", null))
              putDouble("createdAt", identity.optDouble("created_at", 0.0))

            }
            Log.d(TAG, "✅ signIn successful: ${identity.optString("did")}")
            promise.resolve(resultMap)
          }

          401, 403 -> {
            promise.reject("INVALID_CREDENTIALS", "Invalid credentials")
          }

          404 -> {
            promise.reject("NOT_FOUND", "Identity not found")
          }

          in 500..599 -> {
            promise.reject("SERVER_ERROR", "Server error: $statusCode")
          }

          else -> {
            promise.reject("UNKNOWN", "HTTP $statusCode")
          }
        }
      } catch (e: Exception) {
        Log.e(TAG, "signIn error: ${e.message}", e)
        promise.reject("UNKNOWN", e.message ?: "Unknown error")
      }
    }
  }

  @ReactMethod
  fun createIdentity(
    displayName: String,
    password: String,
    identityType: String,
    nodeUrl: String,
    promise: Promise
  ) {
    Log.d(TAG, "createIdentity delegating to NativeIdentityProvisioning")
    // Delegate to NativeIdentityProvisioning
    promise.reject("NOT_IMPLEMENTED", "Use NativeIdentityProvisioning for createIdentity")
  }

  @ReactMethod
  fun testConnection(
    nodeUrl: String,
    promise: Promise
  ) {
    GlobalScope.launch(Dispatchers.Default) {
      try {
        Log.d(TAG, "testConnection: $nodeUrl")

        val healthUrl = buildQuicUrl(nodeUrl, "/api/v1/protocol/health")
        val response = makeQuicRequest(healthUrl, "GET", null, 5, "public")
        val statusCode = response.first

        Log.d(TAG, "testConnection: Status $statusCode")

        // 200, 401, 403 means node is reachable
        val connected = statusCode in listOf(200, 401, 403)
        promise.resolve(connected)
      } catch (e: Exception) {
        Log.e(TAG, "testConnection error: ${e.message}")
        promise.resolve(false)
      }
    }
  }

  @ReactMethod
  fun getProtocolInfo(
    nodeUrl: String,
    promise: Promise
  ) {
    GlobalScope.launch(Dispatchers.Default) {
      try {
        Log.d(TAG, "getProtocolInfo: $nodeUrl")

        val healthUrl = buildQuicUrl(nodeUrl, "/api/v1/protocol/health")
        val response = makeQuicRequest(healthUrl, "GET", null, 10, "public")
        val statusCode = response.first
        val responseBody = response.second

        if (statusCode == 200) {
          val protocolInfo = JSONObject(responseBody)
          val resultMap = Arguments.createMap().apply {
            putBoolean("success", protocolInfo.optBoolean("success", true))
            putString("protocolVersion", protocolInfo.optString("protocol_version"))

            val network = protocolInfo.optJSONObject("network")
            val networkMap = Arguments.createMap().apply {
              putString("networkId", network?.optString("network_id"))
              putString("consensus", network?.optString("consensus"))
              putDouble("blockHeight", network?.optDouble("block_height", 0.0) ?: 0.0)
              putInt("peerCount", network?.optInt("peer_count", 0) ?: 0)
            }
            putMap("network", networkMap)

            val node = protocolInfo.optJSONObject("node")
            val nodeMap = Arguments.createMap().apply {
              putString("status", node?.optString("status"))
              putDouble("uptime", node?.optDouble("uptime", 0.0) ?: 0.0)
              putInt("latency", node?.optInt("latency", 0) ?: 0)
              putBoolean("synced", node?.optBoolean("synced", false) ?: false)
            }
            putMap("node", nodeMap)
          }
          Log.d(TAG, "✅ getProtocolInfo successful")
          promise.resolve(resultMap)
        } else {
          promise.reject("SERVER_ERROR", "HTTP $statusCode")
        }
      } catch (e: Exception) {
        Log.e(TAG, "getProtocolInfo error: ${e.message}", e)
        promise.reject("UNKNOWN", e.message ?: "Unknown error")
      }
    }
  }

  @ReactMethod
  fun recoverWithSeed(
    seedPhrase: String,
    nodeUrl: String,
    promise: Promise
  ) {
    promise.reject(
      "NOT_FOUND",
      "Recovery endpoint not implemented on node"
    )
  }

  @ReactMethod
  fun recoverWithBackup(
    backupData: String,
    password: String,
    nodeUrl: String,
    promise: Promise
  ) {
    promise.reject(
      "NOT_FOUND",
      "Backup recovery endpoint not implemented on node"
    )
  }

  @ReactMethod
  fun recoverWithSocial(
    guardianIds: ReadableArray,
    nodeUrl: String,
    promise: Promise
  ) {
    promise.reject(
      "NOT_FOUND",
      "Social recovery endpoint not implemented on node"
    )
  }

  private suspend fun makeQuicRequest(
    urlString: String,
    method: String,
    body: String?,
    timeoutSeconds: Int,
    alpn: String
  ): Pair<Int, String> = withContext(Dispatchers.IO) {
    try {
      val headersJson = if (method == "POST") {
        JSONObject().apply { put("content-type", "application/json") }.toString()
      } else {
        "{}"
      }

      val result = NativeQuicBridge.request(
        url = urlString,
        method = method,
        headersJson = headersJson,
        body = body ?: "",
        timeoutSecs = timeoutSeconds,
        insecure = true,
        alpn = alpn
      )

      val statusCode = (result?.get("status") as? Number)?.toInt() ?: 0
      val responseBody = result?.get("body") as? String ?: ""
      Pair(statusCode, responseBody)
    } catch (e: Exception) {
      Log.e(TAG, "QUIC request error: ${e.message}", e)
      throw e
    }
  }

  private fun buildQuicUrl(nodeUrl: String, path: String): String {
    val normalized = nodeUrl.replaceFirst(Regex("^quic://"), "https://")
    val url = URL(normalized)
    val port = if (url.port != -1) url.port else 443
    return "quic://${url.host}:$port$path"
  }
}
