package com.sovereignnetworkmobile

import android.content.Context
import android.content.SharedPreferences
import android.util.Base64
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

data class CachedIdentity(
    val did: String,
    val deviceId: String,
    val publicKey: ByteArray,
    val kyberPublicKey: ByteArray,
    val nodeId: ByteArray,
    val createdAt: Long,
    val identityJson: String,
    val handshakeJson: String,
    val dilithiumSk: ByteArray,
    val kyberSk: ByteArray,
    val masterSeed: ByteArray
)

data class IdentityMaterials(
    val did: String,
    val deviceId: String,
    val identityJson: String,
    val handshakeJson: String,
    val dilithiumSk: ByteArray,
    val kyberSk: ByteArray,
    val masterSeed: ByteArray
)

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

    fun storeIdentity(context: Context, identityId: String, identity: CachedIdentity) {
        val p = prefs(context)
        p.edit()
            .putString(key(identityId, "did"), identity.did)
            .putString(key(identityId, "device_id"), identity.deviceId)
            .putString(key(identityId, "identity_json"), identity.identityJson)
            .putString(key(identityId, "handshake_json"), identity.handshakeJson)
            .putString(key(identityId, "dilithium_sk"), b64(identity.dilithiumSk))
            .putString(key(identityId, "kyber_sk"), b64(identity.kyberSk))
            .putString(key(identityId, "master_seed"), b64(identity.masterSeed))
            .apply()
    }

    fun loadIdentity(context: Context, identityId: String): IdentityMaterials? {
        val p = prefs(context)
        val did = p.getString(key(identityId, "did"), null) ?: return null
        val deviceId = p.getString(key(identityId, "device_id"), null) ?: return null
        val identityJson = p.getString(key(identityId, "identity_json"), null) ?: return null
        val handshakeJson = p.getString(key(identityId, "handshake_json"), null) ?: return null
        val dilithiumSk = p.getString(key(identityId, "dilithium_sk"), null) ?: return null
        val kyberSk = p.getString(key(identityId, "kyber_sk"), null) ?: return null
        val masterSeed = p.getString(key(identityId, "master_seed"), null) ?: return null

        return IdentityMaterials(
            did = did,
            deviceId = deviceId,
            identityJson = identityJson,
            handshakeJson = handshakeJson,
            dilithiumSk = b64decode(dilithiumSk),
            kyberSk = b64decode(kyberSk),
            masterSeed = b64decode(masterSeed)
        )
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
            .remove(key(identityId, "handshake_json"))
            .remove(key(identityId, "dilithium_sk"))
            .remove(key(identityId, "kyber_sk"))
            .remove(key(identityId, "master_seed"))
            .apply()
    }

    fun clearAll(context: Context) {
        prefs(context).edit().clear().apply()
    }

    private fun key(identityId: String, suffix: String): String {
        return "$KEY_PREFIX$identityId-$suffix"
    }

    private fun b64(data: ByteArray): String {
        return Base64.encodeToString(data, Base64.NO_WRAP)
    }

    private fun b64decode(encoded: String): ByteArray {
        return Base64.decode(encoded, Base64.NO_WRAP)
    }
}
