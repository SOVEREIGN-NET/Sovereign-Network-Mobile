package com.sovereignnetworkmobile

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Persists identity JSON to EncryptedSharedPreferences.
 * Secret keys never leave Rust — only the serialized identity JSON is stored.
 * On load, deserializes to an opaque Identity handle via Rust FFI.
 *
 * Backward compatible: reads old-format entries (which also have identity_json),
 * and cleans up deprecated raw key fields on re-save.
 */
object IdentityStore {
    private const val PREFS_NAME = "zhtp_identity_store"
    private const val KEY_PREFIX = "identity_"

    private fun prefs(context: Context): SharedPreferences {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        return EncryptedSharedPreferences.create(
            context,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    /**
     * Store identity. Only persists serialized JSON — secret keys stay in Rust.
     * Cleans up any deprecated raw key fields from old-format entries.
     */
    fun storeIdentity(context: Context, identityId: String, identity: Identity) {
        val json = identity.serialize()
            ?: throw IllegalStateException("Failed to serialize identity for storage")
        val p = prefs(context)
        p.edit()
            .putString(key(identityId, "did"), identity.did)
            .putString(key(identityId, "device_id"), identity.deviceId)
            .putString(key(identityId, "identity_json"), json)
            .putString(CURRENT_IDENTITY_ID_KEY, identityId)
            // Clean up deprecated raw key fields (migration from old format)
            .remove(key(identityId, "handshake_json"))
            .remove(key(identityId, "dilithium_sk"))
            .remove(key(identityId, "kyber_sk"))
            .remove(key(identityId, "master_seed"))
            .apply()
    }

    /**
     * Load identity from storage. Creates a new opaque Rust handle.
     * Caller is responsible for closing the returned Identity when done.
     * Returns null if identity not found or deserialization fails.
     *
     * Backward compatible: old-format entries have identity_json alongside raw keys.
     * We only need identity_json — the raw keys are ignored.
     */
    fun loadIdentity(context: Context, identityId: String): Identity? {
        val p = prefs(context)
        val identityJson = p.getString(key(identityId, "identity_json"), null) ?: return null
        return Identity.deserialize(identityJson)
    }

    /** Get the stored DID for an identity without creating a Rust handle. */
    fun getStoredDid(context: Context, identityId: String): String? {
        val p = prefs(context)
        return p.getString(key(identityId, "did"), null)
    }

    fun hasIdentity(context: Context, identityId: String): Boolean {
        val p = prefs(context)
        return p.contains(key(identityId, "identity_json"))
    }

    fun clearIdentity(context: Context, identityId: String) {
        val p = prefs(context)
        p.edit()
            .remove(key(identityId, "did"))
            .remove(key(identityId, "device_id"))
            .remove(key(identityId, "identity_json"))
            // Also remove deprecated fields (backward compat cleanup)
            .remove(key(identityId, "handshake_json"))
            .remove(key(identityId, "dilithium_sk"))
            .remove(key(identityId, "kyber_sk"))
            .remove(key(identityId, "master_seed"))
            .apply()
    }

    fun clearAll(context: Context) {
        prefs(context).edit().clear().apply()
    }

    // ─── Current identity tracking ───

    private const val CURRENT_IDENTITY_ID_KEY = "current_identity_id"

    /** Persist which identity is currently active (survives process death). */
    fun setCurrentIdentityId(context: Context, identityId: String) {
        prefs(context).edit().putString(CURRENT_IDENTITY_ID_KEY, identityId).apply()
    }

    /** Get the current identity ID, or null if none set. */
    fun getCurrentIdentityId(context: Context): String? {
        return prefs(context).getString(CURRENT_IDENTITY_ID_KEY, null)
    }

    fun clearCurrentIdentityId(context: Context) {
        prefs(context).edit().remove(CURRENT_IDENTITY_ID_KEY).apply()
    }

    private fun key(identityId: String, suffix: String): String {
        return "$KEY_PREFIX$identityId-$suffix"
    }
}
