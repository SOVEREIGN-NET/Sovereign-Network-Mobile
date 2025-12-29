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
        val response = NativeQuicBridge.request(
            url = url,
            method = "POST",
            headersJson = """{"content-type":"application/json"}""",
            body = payload.toString(),
            timeoutSecs = timeoutSecs,
            insecure = insecure
        ) ?: throw IllegalStateException("No response")

        val status = (response["status"] as? Number)?.toInt() ?: 0
        if (status !in 200..299) {
            val error = response["body"] as? String ?: "resolve_failed"
            throw IllegalStateException("Resolve failed ($status): $error")
        }

        val body = response["body"] as? String ?: throw IllegalStateException("Empty resolve body")
        val json = JSONObject(body)

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
        val response = NativeQuicBridge.request(
            url = url,
            method = "POST",
            headersJson = """{"content-type":"application/json"}""",
            body = payload.toString(),
            timeoutSecs = timeoutSecs,
            insecure = insecure
        ) ?: throw IllegalStateException("No response")

        val status = (response["status"] as? Number)?.toInt() ?: 0
        if (status !in 200..299) {
            val error = response["body"] as? String ?: "manifest_failed"
            throw IllegalStateException("Manifest fetch failed ($status): $error")
        }

        val body = response["body"] as? String ?: throw IllegalStateException("Empty manifest body")
        val json = JSONObject(body)

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
        val response = NativeQuicBridge.requestBytes(
            url = url,
            method = "POST",
            headersJson = """{"content-type":"application/json"}""",
            body = payload.toString().toByteArray(),
            timeoutSecs = timeoutSecs,
            insecure = insecure
        ) ?: throw IllegalStateException("No response")

        val status = (response["status"] as? Number)?.toInt() ?: 0
        if (status !in 200..299) {
            val error = response["error"] as? String ?: "blob_failed"
            throw IllegalStateException("Blob fetch failed ($status): $error")
        }

        val body = response["body"] as? ByteArray ?: throw IllegalStateException("Empty blob body")
        return body
    }
}
