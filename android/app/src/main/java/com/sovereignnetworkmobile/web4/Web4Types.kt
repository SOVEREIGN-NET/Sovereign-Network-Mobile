package com.sovereignnetworkmobile.web4

data class Web4ManifestFile(
    val path: String,
    val cid: String,
    val mime: String,
    val size: Long
)

data class Web4Manifest(
    val domain: String? = null,
    val version: String? = null,
    val previous_manifest: String? = null,
    val spa: Boolean = false,
    val spa_fallback: String? = null,
    val files: List<Web4ManifestFile>
)

data class Web4ResolveResponse(
    val domain: String,
    val manifest_cid: String,
    val version: Long? = null,
    val spa: Boolean = false,
    val spa_fallback: String? = null
)
