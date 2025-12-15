package com.sovereignnetworkmobile.web4

import java.util.LinkedHashMap

class Web4ManifestCache(private val maxEntries: Int = 64) {
    private val cache: LinkedHashMap<String, Pair<String, Web4Manifest>> =
        object : LinkedHashMap<String, Pair<String, Web4Manifest>>(16, 0.75f, true) {
            override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Pair<String, Web4Manifest>>?): Boolean {
                return size > maxEntries
            }
        }

    @Synchronized
    fun put(domain: String, manifestCid: String, manifest: Web4Manifest) {
        cache[domain] = manifestCid to manifest
    }

    @Synchronized
    fun get(domain: String): Pair<String, Web4Manifest>? {
        return cache[domain]
    }
}
