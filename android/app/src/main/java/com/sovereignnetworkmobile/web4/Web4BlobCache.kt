package com.sovereignnetworkmobile.web4

import android.content.Context
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.Collections

class Web4BlobCache(
    context: Context,
    private val maxBytes: Long
) {
    private val cacheDir: File = File(context.cacheDir, "web4_blobs").apply { mkdirs() }
    private val lock = Any()

    fun get(cid: String): File? {
        val file = fileForCid(cid)
        return if (file.exists()) {
            file.setLastModified(System.currentTimeMillis())
            file
        } else {
            null
        }
    }

    fun put(cid: String, bytes: ByteArray): File {
        synchronized(lock) {
          val file = fileForCid(cid)
          FileOutputStream(file).use { it.write(bytes) }
          file.setLastModified(System.currentTimeMillis())
          enforceLimit()
          return file
        }
    }

    private fun enforceLimit() {
        var total = cacheDir.listFiles()?.sumOf { it.length() } ?: 0L
        if (total <= maxBytes) return

        val files = cacheDir.listFiles()?.toList() ?: emptyList()
        val sorted = files.sortedBy { it.lastModified() }
        val iterator = sorted.iterator()
        while (total > maxBytes && iterator.hasNext()) {
            val f = iterator.next()
            val len = f.length()
            if (f.delete()) {
                total -= len
            }
        }
    }

    private fun fileForCid(cid: String): File {
        // Avoid path traversal by hashing cid into filename
        val safe = cidToFileName(cid)
        return File(cacheDir, safe)
    }

    private fun cidToFileName(cid: String): String {
        return sha1(cid) + ".blob"
    }

    private fun sha1(input: String): String {
        val digest = MessageDigest.getInstance("SHA-1").digest(input.toByteArray())
        return digest.joinToString("") { "%02x".format(it) }
    }
}
