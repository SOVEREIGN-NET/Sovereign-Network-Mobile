package com.sovereignnetworkmobile.web4

import android.content.Context
import java.io.File

data class Web4ResolvedFile(
    val mime: String,
    val file: File
)

class Web4Runtime(
    context: Context,
    cacheLimitBytes: Long,
    private val client: Web4Client
) {
    private val manifestCache = Web4ManifestCache()
    private val blobCache = Web4BlobCache(context, cacheLimitBytes)

    @Synchronized
    fun resolveManifest(domain: String): Pair<String, Web4Manifest> {
        val cached = manifestCache.get(domain)
        if (cached != null) {
            return cached
        }

        val resolveResult = client.resolveDomain(domain)
        val manifest = client.fetchManifest(resolveResult.manifest_cid)

        // Overlay SPA flags from resolver (authoritative)
        val hydrated = manifest.copy(
            spa = resolveResult.spa,
            spa_fallback = resolveResult.spa_fallback
        )
        manifestCache.put(domain, resolveResult.manifest_cid, hydrated)
        return resolveResult.manifest_cid to hydrated
    }

    fun resolveFile(domain: String, path: String): Web4ResolvedFile? {
        val (_, manifest) = manifestCache.get(domain)
            ?: resolveManifest(domain)

        // Normalize path: "/" -> "/index.html"
        val normalizedPath = if (path == "/" || path.isEmpty()) "/index.html" else path

        // Try exact match first, then fallback to /index.html for SPA behavior
        val fileEntry = manifest.files.find { it.path == normalizedPath }
            ?: manifest.files.find { it.path == "/index.html" }

        fileEntry ?: return null

        val cachedFile = blobCache.get(fileEntry.cid)
        val file = cachedFile ?: run {
            val bytes = client.fetchBlob(fileEntry.cid)
            blobCache.put(fileEntry.cid, bytes)
        }

        return Web4ResolvedFile(mime = fileEntry.mime, file = file)
    }
}
