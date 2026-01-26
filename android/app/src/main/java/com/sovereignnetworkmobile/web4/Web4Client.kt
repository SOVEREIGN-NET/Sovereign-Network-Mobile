package com.sovereignnetworkmobile.web4

import android.util.Log
import com.sovereignnetworkmobile.NativeQuicBridge
import org.json.JSONArray
import org.json.JSONObject

class Web4Client(
    private val baseUrl: String,
    private val timeoutSecs: Int,
    private val insecure: Boolean
) {
    private val tag = "Web4Client"

    private fun makeUrl(path: String): String {
        return if (path.startsWith("quic://") || path.startsWith("https://")) {
            path
        } else {
            baseUrl.trimEnd('/') + path
        }
    }

    fun resolveDomain(domain: String): Web4ResolveResponse {
        val payload = JSONObject().apply {
            put("domain", domain)
            put("version", JSONObject.NULL)
        }
        val url = makeUrl("/api/v1/web4/domains/resolve")
        Log.i(tag, "Resolving domain: $domain with alpn=public")

        val response = NativeQuicBridge.request(
            url = url,
            method = "POST",
            headersJson = """{"content-type":"application/json"}""",
            body = payload.toString(),
            timeoutSecs = timeoutSecs,
            insecure = insecure,
            alpn = "public"
        ) ?: throw IllegalStateException("No response from resolver")

        val status = (response["status"] as? Number)?.toInt() ?: 0
        val responseBody = response["body"] as? String ?: ""

        Log.d(tag, "Resolver response: status=$status")
        if (status !in 200..299) {
            Log.e(tag, "Resolve failed ($status): $responseBody")
            throw IllegalStateException("Resolve failed ($status): $responseBody")
        }

        if (responseBody.isEmpty()) {
            Log.e(tag, "Empty resolve response body")
            throw IllegalStateException("Empty resolve body")
        }

        val json = JSONObject(responseBody)
        Log.d(tag, "Domain resolved successfully: ${json.optString("domain")}")


        val version = if (json.has("version") && !json.isNull("version")) {
            json.optLong("version")
        } else {
            null
        }

        val resolveSpaFallback: String? = if (json.has("spa_fallback") && !json.isNull("spa_fallback")) {
            json.getString("spa_fallback")
        } else {
            null
        }

        return Web4ResolveResponse(
            domain = json.getString("domain"),
            manifest_cid = json.getString("manifest_cid"),
            version = version,
            spa = json.optBoolean("spa", false),
            spa_fallback = resolveSpaFallback
        )
    }

    fun fetchManifest(manifestCid: String): Web4Manifest {
        val payload = JSONObject().apply {
            put("cid", manifestCid)
        }
        val url = makeUrl("/api/v1/web4/content/manifest")
        Log.i(tag, "Fetching manifest: $manifestCid")

        val response = NativeQuicBridge.request(
            url = url,
            method = "POST",
            headersJson = """{"content-type":"application/json"}""",
            body = payload.toString(),
            timeoutSecs = timeoutSecs,
            insecure = insecure,
            alpn = "public"
        ) ?: throw IllegalStateException("No response from manifest server")

        val status = (response["status"] as? Number)?.toInt() ?: 0
        val responseBody = response["body"] as? String ?: ""

        Log.d(tag, "Manifest response: status=$status")
        if (status !in 200..299) {
            Log.e(tag, "Manifest fetch failed ($status): $responseBody")
            throw IllegalStateException("Manifest fetch failed ($status): $responseBody")
        }

        if (responseBody.isEmpty()) {
            Log.e(tag, "Empty manifest response body")
            throw IllegalStateException("Empty manifest body")
        }

        val json = JSONObject(responseBody)
        Log.d(tag, "Manifest fetched successfully")

        val files = mutableListOf<Web4ManifestFile>()
        val filesNode = json.opt("files")
        when (filesNode) {
            is JSONArray -> {
                for (i in 0 until filesNode.length()) {
                    val f = filesNode.getJSONObject(i)
                    files.add(
                        Web4ManifestFile(
                            path = f.getString("path"),
                            cid = f.getString("cid"),
                            mime = f.optString("mime", f.optString("content_type", "application/octet-stream")),
                            size = f.optLong("size", 0)
                        )
                    )
                }
            }
            is JSONObject -> {
                val keys = filesNode.keys()
                while (keys.hasNext()) {
                    val path = keys.next()
                    val f = filesNode.getJSONObject(path)
                    files.add(
                        Web4ManifestFile(
                            path = path,
                            cid = f.getString("cid"),
                            mime = f.optString("mime", f.optString("content_type", "application/octet-stream")),
                            size = f.optLong("size", 0)
                        )
                    )
                }
            }
            else -> {
                // No files node or unsupported shape; leave empty to allow upstream handling
            }
        }

        val version: String? = if (json.has("version") && !json.isNull("version")) {
            json.getString("version")
        } else {
            null
        }

        val domain: String? = if (json.has("domain") && !json.isNull("domain")) {
            json.getString("domain")
        } else {
            null
        }

        val previousManifest: String? = if (json.has("previous_manifest") && !json.isNull("previous_manifest")) {
            json.getString("previous_manifest")
        } else {
            null
        }

        val spaFallback: String? = if (json.has("spa_fallback") && !json.isNull("spa_fallback")) {
            json.getString("spa_fallback")
        } else {
            null
        }

        return Web4Manifest(
            domain = domain,
            version = version,
            previous_manifest = previousManifest,
            spa = json.optBoolean("spa", false),
            spa_fallback = spaFallback,
            files = files
        )
    }

    fun fetchBlob(cid: String): ByteArray {
        val payload = JSONObject().apply {
            put("cid", cid)
        }
        val url = makeUrl("/api/v1/web4/content/blob")
        Log.i(tag, "Fetching blob: $cid")

        val response = NativeQuicBridge.requestBytes(
            url = url,
            method = "POST",
            headersJson = """{"content-type":"application/json"}""",
            body = payload.toString().toByteArray(),
            timeoutSecs = timeoutSecs,
            insecure = insecure,
            alpn = "public"
        ) ?: throw IllegalStateException("No response from blob server")

        val status = (response["status"] as? Number)?.toInt() ?: 0
        val error = response["error"] as? String ?: ""

        Log.d(tag, "Blob response: status=$status, size=${(response["body"] as? ByteArray)?.size ?: 0}")
        if (status !in 200..299) {
            Log.e(tag, "Blob fetch failed ($status): $error")
            throw IllegalStateException("Blob fetch failed ($status): $error")
        }

        val body = response["body"] as? ByteArray
        if (body == null || body.isEmpty()) {
            Log.e(tag, "Empty blob response body")
            throw IllegalStateException("Empty blob body")
        }

        Log.d(tag, "Blob fetched successfully: ${body.size} bytes")
        return body
    }
}
