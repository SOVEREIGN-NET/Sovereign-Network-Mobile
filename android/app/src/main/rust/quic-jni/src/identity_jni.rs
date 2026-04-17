//! Handle-based JNI bindings for Identity.kt companion object.
//!
//! Each Identity on the Kotlin side holds a `handle: Long` which is a raw pointer
//! to a heap-allocated `zhtp_client::identity::Identity`. Field access, signing,
//! and serialization all operate on the handle without copying secret keys to Kotlin.

use jni::objects::{JByteArray, JClass, JString};
use jni::sys::{jint, jlong};
use jni::JNIEnv;
use serde::{Deserialize, Serialize};

use zhtp_client::identity::{
    deserialize_identity, get_seed_phrase, restore_identity_from_phrase, serialize_identity,
    sign_message, sign_registration_proof, Identity,
};
use zhtp_client::{generate_identity, get_public_identity};

use crate::identity_bridge::identity_to_handshake_json;

// ─── Helpers ───────────────────────────────────────────────────────────────────

/// Convert a jlong handle back to an Identity reference.
/// SAFETY: Caller must ensure handle is a valid pointer from Box::into_raw.
unsafe fn handle_ref(handle: jlong) -> &'static Identity {
    &*(handle as *const Identity)
}

fn jstring_to_string(env: &mut JNIEnv, s: &JString) -> Option<String> {
    env.get_string(s).ok().map(|s| s.into())
}

/// Parse a Java String holding a decimal u128 amount (atoms) into u128.
/// Logs loudly and returns None on any error — callers propagate via
/// `JString::default()`. This is the single amount parser for every JNI
/// builder; don't inline `string.parse::<u128>()` elsewhere.
fn parse_amount_atoms(env: &mut JNIEnv, amount: &JString, site: &str) -> Option<u128> {
    let raw: String = match env.get_string(amount) {
        Ok(s) => s.into(),
        Err(e) => {
            log::error!("[Identity JNI] {}: invalid amount JString: {}", site, e);
            return None;
        }
    };
    match raw.trim().parse::<u128>() {
        Ok(v) => Some(v),
        Err(e) => {
            log::error!(
                "[Identity JNI] {}: amount \"{}\" is not a non-negative u128: {}",
                site, raw, e
            );
            None
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum PouwProofType {
    Hash,
    Merkle,
    Signature,
    Web4ManifestRoute,
    Web4ContentServed,
}

#[derive(Serialize, Deserialize)]
struct PouwReceipt {
    pub version: u32,
    #[serde(with = "pouw_hex")]
    pub task_id: Vec<u8>,
    pub client_did: String,
    #[serde(with = "pouw_hex")]
    pub client_node_id: Vec<u8>,
    #[serde(with = "pouw_hex")]
    pub provider_id: Vec<u8>,
    #[serde(with = "pouw_hex")]
    pub content_id: Vec<u8>,
    pub proof_type: PouwProofType,
    pub bytes_verified: u64,
    pub result_ok: bool,
    pub started_at: u64,
    pub finished_at: u64,
    #[serde(with = "pouw_hex")]
    pub receipt_nonce: Vec<u8>,
    #[serde(with = "pouw_hex")]
    pub challenge_nonce: Vec<u8>,
    #[serde(default)]
    pub aux: Option<String>,
}

mod pouw_hex {
    use serde::{Deserialize, Deserializer, Serializer};

    pub fn serialize<S: Serializer>(bytes: &Vec<u8>, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&hex::encode(bytes))
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<Vec<u8>, D::Error> {
        let s = String::deserialize(d)?;
        hex::decode(&s).map_err(serde::de::Error::custom)
    }
}

// ─── Lifecycle ─────────────────────────────────────────────────────────────────

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Identity_nativeGenerateIdentity<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    device_id: JString<'local>,
) -> jlong {
    let device_id_str = match jstring_to_string(&mut env, &device_id) {
        Some(s) => s,
        None => {
            log::error!("[Identity JNI] Failed to get deviceId string");
            return 0;
        }
    };

    match generate_identity(device_id_str) {
        Ok(identity) => Box::into_raw(Box::new(identity)) as jlong,
        Err(e) => {
            log::error!("[Identity JNI] generate_identity failed: {}", e);
            0
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Identity_nativeRestoreIdentityFromPhrase<
    'local,
>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    phrase: JString<'local>,
    device_id: JString<'local>,
) -> jlong {
    let phrase_str = match jstring_to_string(&mut env, &phrase) {
        Some(s) => s,
        None => return 0,
    };
    let device_id_str = match jstring_to_string(&mut env, &device_id) {
        Some(s) => s,
        None => return 0,
    };

    match restore_identity_from_phrase(&phrase_str, device_id_str) {
        Ok(identity) => Box::into_raw(Box::new(identity)) as jlong,
        Err(e) => {
            log::error!("[Identity JNI] restore_identity_from_phrase failed: {}", e);
            0
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Identity_nativeDeserializeIdentity<
    'local,
>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    json: JString<'local>,
) -> jlong {
    let json_str = match jstring_to_string(&mut env, &json) {
        Some(s) => s,
        None => return 0,
    };

    match deserialize_identity(&json_str) {
        Ok(identity) => Box::into_raw(Box::new(identity)) as jlong,
        Err(e) => {
            log::error!("[Identity JNI] deserialize_identity failed: {}", e);
            0
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Identity_nativeIdentityFree(
    _env: JNIEnv,
    _class: JClass,
    handle: jlong,
) {
    if handle != 0 {
        unsafe {
            drop(Box::from_raw(handle as *mut Identity));
        }
    }
}

// ─── Field access ──────────────────────────────────────────────────────────────

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Identity_nativeIdentityGetDid<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
) -> JString<'local> {
    if handle == 0 {
        return JString::default();
    }
    let identity = unsafe { handle_ref(handle) };
    env.new_string(&identity.did).unwrap_or_default()
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Identity_nativeIdentityGetDeviceId<
    'local,
>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
) -> JString<'local> {
    if handle == 0 {
        return JString::default();
    }
    let identity = unsafe { handle_ref(handle) };
    env.new_string(&identity.device_id).unwrap_or_default()
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Identity_nativeIdentityGetPublicKey<
    'local,
>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
) -> JByteArray<'local> {
    if handle == 0 {
        return JByteArray::default();
    }
    let identity = unsafe { handle_ref(handle) };
    env.byte_array_from_slice(&identity.public_key)
        .unwrap_or_else(|_| JByteArray::default())
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Identity_nativeIdentityGetKyberPublicKey<
    'local,
>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
) -> JByteArray<'local> {
    if handle == 0 {
        return JByteArray::default();
    }
    let identity = unsafe { handle_ref(handle) };
    env.byte_array_from_slice(&identity.kyber_public_key)
        .unwrap_or_else(|_| JByteArray::default())
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Identity_nativeIdentityGetNodeId<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
) -> JByteArray<'local> {
    if handle == 0 {
        return JByteArray::default();
    }
    let identity = unsafe { handle_ref(handle) };
    env.byte_array_from_slice(&identity.node_id)
        .unwrap_or_else(|_| JByteArray::default())
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Identity_nativeIdentityGetCreatedAt(
    _env: JNIEnv,
    _class: JClass,
    handle: jlong,
) -> jlong {
    if handle == 0 {
        return 0;
    }
    let identity = unsafe { handle_ref(handle) };
    identity.created_at as jlong
}

/// Get wallet ID = blake3(dilithium_pk || kyber_pk) — 32 bytes
#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Identity_nativeIdentityGetWalletId<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
) -> JByteArray<'local> {
    if handle == 0 {
        return JByteArray::default();
    }
    let identity = unsafe { handle_ref(handle) };
    let mut combined = Vec::with_capacity(identity.public_key.len() + identity.kyber_public_key.len());
    combined.extend_from_slice(&identity.public_key);
    combined.extend_from_slice(&identity.kyber_public_key);
    let wallet_id = zhtp_client::crypto::Blake3::hash(&combined);
    env.byte_array_from_slice(&wallet_id)
        .unwrap_or_else(|_| JByteArray::default())
}

// ─── Serialization ─────────────────────────────────────────────────────────────

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Identity_nativeIdentitySerialize<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
) -> JString<'local> {
    if handle == 0 {
        return JString::default();
    }
    let identity = unsafe { handle_ref(handle) };
    match serialize_identity(identity) {
        Ok(json) => env.new_string(&json).unwrap_or_default(),
        Err(e) => {
            log::error!("[Identity JNI] serialize failed: {}", e);
            JString::default()
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Identity_nativeIdentityToHandshakeJson<
    'local,
>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
) -> JString<'local> {
    if handle == 0 {
        return JString::default();
    }
    let identity = unsafe { handle_ref(handle) };
    match identity_to_handshake_json(identity) {
        Ok(json) => env.new_string(&json).unwrap_or_default(),
        Err(e) => {
            log::error!("[Identity JNI] toHandshakeJson failed: {}", e);
            JString::default()
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Identity_nativeIdentityGetSeedPhrase<
    'local,
>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
) -> JString<'local> {
    if handle == 0 {
        return JString::default();
    }
    let identity = unsafe { handle_ref(handle) };
    match get_seed_phrase(identity) {
        Ok(phrase) => env.new_string(&phrase).unwrap_or_default(),
        Err(e) => {
            log::error!("[Identity JNI] getSeedPhrase failed: {}", e);
            JString::default()
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Identity_nativeExportKeystoreBase64<
    'local,
>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
) -> JString<'local> {
    if handle == 0 {
        return JString::default();
    }
    let identity = unsafe { handle_ref(handle) };
    match serialize_identity(identity) {
        Ok(json) => {
            use base64::Engine;
            let b64 = base64::engine::general_purpose::STANDARD.encode(json.as_bytes());
            env.new_string(&b64).unwrap_or_default()
        }
        Err(e) => {
            log::error!("[Identity JNI] exportKeystoreBase64 failed: {}", e);
            JString::default()
        }
    }
}

// ─── Signing ───────────────────────────────────────────────────────────────────

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Identity_nativeSignMessage<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
    message: JByteArray<'local>,
) -> JByteArray<'local> {
    if handle == 0 {
        return JByteArray::default();
    }
    let identity = unsafe { handle_ref(handle) };
    let msg_bytes = match env.convert_byte_array(&message) {
        Ok(b) => b,
        Err(_) => return JByteArray::default(),
    };
    match sign_message(identity, &msg_bytes) {
        Ok(sig) => env
            .byte_array_from_slice(&sig)
            .unwrap_or_else(|_| JByteArray::default()),
        Err(e) => {
            log::error!("[Identity JNI] signMessage failed: {}", e);
            JByteArray::default()
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Identity_nativeSignPoUWReceiptJson<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
    receipt_json: JString<'local>,
) -> JByteArray<'local> {
    if handle == 0 {
        return JByteArray::default();
    }

    let receipt_json_str = match jstring_to_string(&mut env, &receipt_json) {
        Some(s) => s,
        None => return JByteArray::default(),
    };

    let receipt: PouwReceipt = match serde_json::from_str(&receipt_json_str) {
        Ok(r) => r,
        Err(e) => {
            log::error!("[Identity JNI] signPoUWReceiptJson parse failed: {}", e);
            return JByteArray::default();
        }
    };

    let canonical_bytes = match bincode::serialize(&receipt) {
        Ok(b) => b,
        Err(e) => {
            log::error!("[Identity JNI] signPoUWReceiptJson bincode failed: {}", e);
            return JByteArray::default();
        }
    };

    let identity = unsafe { handle_ref(handle) };
    match sign_message(identity, &canonical_bytes) {
        Ok(sig) => env
            .byte_array_from_slice(&sig)
            .unwrap_or_else(|_| JByteArray::default()),
        Err(e) => {
            log::error!("[Identity JNI] signPoUWReceiptJson signing failed: {}", e);
            JByteArray::default()
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Identity_nativeSignRegistrationProof<
    'local,
>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
    timestamp: jlong,
) -> JByteArray<'local> {
    if handle == 0 {
        return JByteArray::default();
    }
    let identity = unsafe { handle_ref(handle) };
    match sign_registration_proof(identity, timestamp as u64) {
        Ok(sig) => env
            .byte_array_from_slice(&sig)
            .unwrap_or_else(|_| JByteArray::default()),
        Err(e) => {
            log::error!("[Identity JNI] signRegistrationProof failed: {}", e);
            JByteArray::default()
        }
    }
}

// ─── Token transactions ────────────────────────────────────────────────────────

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Identity_nativeBuildTokenCreate<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
    name: JString<'local>,
    symbol: JString<'local>,
    initial_supply_atoms: JString<'local>,
    decimals: jint,
    treasury_recipient: JByteArray<'local>,
    chain_id: jint,
) -> JString<'local> {
    if handle == 0 {
        return JString::default();
    }
    let identity = unsafe { handle_ref(handle) };
    let name_str = match jstring_to_string(&mut env, &name) {
        Some(s) => s,
        None => return JString::default(),
    };
    let symbol_str = match jstring_to_string(&mut env, &symbol) {
        Some(s) => s,
        None => return JString::default(),
    };
    let initial_supply: u128 =
        match parse_amount_atoms(&mut env, &initial_supply_atoms, "buildTokenCreate") {
            Some(v) => v,
            None => return JString::default(),
        };

    let treasury_arr: Vec<u8> = env
        .convert_byte_array(treasury_recipient)
        .unwrap_or_default();
    let mut treasury_arr_32 = [0u8; 32];
    if treasury_arr.len() >= 32 {
        treasury_arr_32.copy_from_slice(&treasury_arr[..32]);
    }

    match zhtp_client::build_create_token_tx(
        identity,
        &name_str,
        &symbol_str,
        initial_supply,
        decimals as u8,
        treasury_arr_32,
        chain_id as u8,
    ) {
        Ok(hex) => env.new_string(&hex).unwrap_or_default(),
        Err(e) => {
            log::error!("[Identity JNI] buildTokenCreate failed: {}", e);
            JString::default()
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Identity_nativeBuildTokenMint<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
    token_id: JByteArray<'local>,
    to_pubkey: JByteArray<'local>,
    amount_atoms: JString<'local>,
    chain_id: jint,
) -> JString<'local> {
    if handle == 0 {
        return JString::default();
    }
    let identity = unsafe { handle_ref(handle) };
    let amount: u128 = match parse_amount_atoms(&mut env, &amount_atoms, "buildTokenMint") {
        Some(v) => v,
        None => return JString::default(),
    };
    let tid = env.convert_byte_array(&token_id).unwrap_or_default();
    let to = env.convert_byte_array(&to_pubkey).unwrap_or_default();

    let mut tid_arr = [0u8; 32];
    let len = std::cmp::min(tid.len(), 32);
    tid_arr[..len].copy_from_slice(&tid[..len]);

    let mut to_arr = [0u8; 32];
    let len = std::cmp::min(to.len(), 32);
    to_arr[..len].copy_from_slice(&to[..len]);

    match zhtp_client::build_mint_tx(identity, &tid_arr, &to_arr, amount, chain_id as u8) {
        Ok(hex) => env.new_string(&hex).unwrap_or_default(),
        Err(e) => {
            log::error!("[Identity JNI] buildTokenMint failed: {}", e);
            JString::default()
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Identity_nativeBuildTokenTransfer<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
    token_id: JByteArray<'local>,
    to_pubkey: JByteArray<'local>,
    amount_atoms: JString<'local>,
    chain_id: jint,
    nonce: jlong,
) -> JString<'local> {
    if handle == 0 {
        return JString::default();
    }
    let identity = unsafe { handle_ref(handle) };
    let amount: u128 = match parse_amount_atoms(&mut env, &amount_atoms, "buildTokenTransfer") {
        Some(v) => v,
        None => return JString::default(),
    };
    let tid = env.convert_byte_array(&token_id).unwrap_or_default();
    let to = env.convert_byte_array(&to_pubkey).unwrap_or_default();

    let mut tid_arr = [0u8; 32];
    let len = std::cmp::min(tid.len(), 32);
    tid_arr[..len].copy_from_slice(&tid[..len]);

    let mut to_arr = [0u8; 32];
    let len = std::cmp::min(to.len(), 32);
    to_arr[..len].copy_from_slice(&to[..len]);

    match zhtp_client::build_transfer_tx(
        identity,
        &tid_arr,
        &to_arr,
        amount,
        chain_id as u8,
        nonce as u64,
    ) {
        Ok(hex) => env.new_string(&hex).unwrap_or_default(),
        Err(e) => {
            log::error!("[Identity JNI] buildTokenTransfer failed: {}", e);
            JString::default()
        }
    }
}

/// Build a signed SOV wallet-to-wallet transfer.
///
/// IMPORTANT: `amount` is passed as a DECIMAL STRING, not a jlong. Previously
/// this took `jlong` which silently truncated u128 atoms to u64 — 1000 SOV at
/// 18 decimals is 1e21 atoms, ~54× larger than u64::MAX, and the old path
/// wrapped around so users saw 3.87 SOV arrive on-chain instead. Accepting a
/// string here is the single source of truth on the JNI boundary and matches
/// the iOS FFI which takes `(amount_lo, amount_hi)`.
#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Identity_nativeBuildSovWalletTransfer<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
    from_wallet_id: JByteArray<'local>,
    to_wallet_id: JByteArray<'local>,
    amount_atoms: JString<'local>,
    chain_id: jint,
    nonce: jlong,
) -> JString<'local> {
    if handle == 0 {
        return JString::default();
    }
    let identity = unsafe { handle_ref(handle) };

    let amount: u128 = match parse_amount_atoms(&mut env, &amount_atoms, "buildSovWalletTransfer") {
        Some(v) => v,
        None => return JString::default(),
    };

    let from = env.convert_byte_array(&from_wallet_id).unwrap_or_default();
    let to = env.convert_byte_array(&to_wallet_id).unwrap_or_default();

    let mut from_arr = [0u8; 32];
    let len = std::cmp::min(from.len(), 32);
    from_arr[..len].copy_from_slice(&from[..len]);

    let mut to_arr = [0u8; 32];
    let len = std::cmp::min(to.len(), 32);
    to_arr[..len].copy_from_slice(&to[..len]);

    match zhtp_client::build_sov_wallet_transfer_tx(
        identity,
        &from_arr,
        &to_arr,
        amount,
        chain_id as u8,
        nonce as u64,
    ) {
        Ok(hex) => env.new_string(&hex).unwrap_or_default(),
        Err(e) => {
            log::error!("[Identity JNI] buildSovWalletTransfer failed: {}", e);
            JString::default()
        }
    }
}

/// Build a signed token transfer where the sender is identified by an explicit
/// wallet_id. Used for CBE and any token whose sender lives at wallet_id rather
/// than the identity key. Mirrors `zhtp_client_build_token_wallet_transfer` in
/// the C FFI layer used by iOS.
#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Identity_nativeBuildTokenWalletTransfer<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
    token_id: JByteArray<'local>,
    from_wallet_id: JByteArray<'local>,
    to_wallet_id: JByteArray<'local>,
    amount_atoms: JString<'local>,
    chain_id: jint,
    nonce: jlong,
) -> JString<'local> {
    if handle == 0 {
        return JString::default();
    }
    let identity = unsafe { handle_ref(handle) };
    let amount: u128 =
        match parse_amount_atoms(&mut env, &amount_atoms, "buildTokenWalletTransfer") {
            Some(v) => v,
            None => return JString::default(),
        };
    let tid = env.convert_byte_array(&token_id).unwrap_or_default();
    let from = env.convert_byte_array(&from_wallet_id).unwrap_or_default();
    let to = env.convert_byte_array(&to_wallet_id).unwrap_or_default();

    let mut tid_arr = [0u8; 32];
    let len = std::cmp::min(tid.len(), 32);
    tid_arr[..len].copy_from_slice(&tid[..len]);

    let mut from_arr = [0u8; 32];
    let len = std::cmp::min(from.len(), 32);
    from_arr[..len].copy_from_slice(&from[..len]);

    let mut to_arr = [0u8; 32];
    let len = std::cmp::min(to.len(), 32);
    to_arr[..len].copy_from_slice(&to[..len]);

    match zhtp_client::build_token_wallet_transfer_tx(
        identity,
        &tid_arr,
        &from_arr,
        &to_arr,
        amount,
        chain_id as u8,
        nonce as u64,
    ) {
        Ok(hex) => env.new_string(&hex).unwrap_or_default(),
        Err(e) => {
            log::error!("[Identity JNI] buildTokenWalletTransfer failed: {}", e);
            JString::default()
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Identity_nativeBuildTokenBurn<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
    token_id: JByteArray<'local>,
    amount_atoms: JString<'local>,
    chain_id: jint,
) -> JString<'local> {
    if handle == 0 {
        return JString::default();
    }
    let identity = unsafe { handle_ref(handle) };
    let amount: u128 = match parse_amount_atoms(&mut env, &amount_atoms, "buildTokenBurn") {
        Some(v) => v,
        None => return JString::default(),
    };
    let tid = env.convert_byte_array(&token_id).unwrap_or_default();

    let mut tid_arr = [0u8; 32];
    let len = std::cmp::min(tid.len(), 32);
    tid_arr[..len].copy_from_slice(&tid[..len]);

    match zhtp_client::build_burn_tx(identity, &tid_arr, amount, chain_id as u8) {
        Ok(hex) => env.new_string(&hex).unwrap_or_default(),
        Err(e) => {
            log::error!("[Identity JNI] buildTokenBurn failed: {}", e);
            JString::default()
        }
    }
}

// ─── DAO stake transaction ─────────────────────────────────────────────────────

/// Build a signed DAO stake transaction. Moves SOV from the caller's key_id
/// wallet into a sector welfare DAO wallet, locked for `lock_blocks`.
/// Returns hex-encoded bincode tx string, or an empty string on failure.
#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Identity_nativeBuildDaoStake<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
    sector_dao_key_id: JByteArray<'local>,
    amount_atoms: JString<'local>,
    nonce: jlong,
    lock_blocks: jlong,
    chain_id: jint,
) -> JString<'local> {
    if handle == 0 {
        return JString::default();
    }
    let identity = unsafe { handle_ref(handle) };
    let amount: u128 = match parse_amount_atoms(&mut env, &amount_atoms, "buildDaoStake") {
        Some(v) => v,
        None => return JString::default(),
    };
    let dao = env.convert_byte_array(&sector_dao_key_id).unwrap_or_default();

    let mut dao_arr = [0u8; 32];
    let len = std::cmp::min(dao.len(), 32);
    dao_arr[..len].copy_from_slice(&dao[..len]);

    match zhtp_client::dao_tx::build_dao_stake_tx(
        identity,
        dao_arr,
        amount,
        nonce as u64,
        lock_blocks as u64,
        chain_id as u8,
    ) {
        Ok(hex) => env.new_string(&hex).unwrap_or_default(),
        Err(e) => {
            log::error!("[Identity JNI] buildDaoStake failed: {}", e);
            JString::default()
        }
    }
}

// ─── Domain requests (returns JSON for REST API) ────────────────────────────────

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Identity_nativeBuildDomainRegisterRequest<
    'local,
>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
    domain: JString<'local>,
    content_mappings_json: JString<'local>,
) -> JString<'local> {
    if handle == 0 {
        return JString::default();
    }
    let identity = unsafe { handle_ref(handle) };
    let domain_str = match jstring_to_string(&mut env, &domain) {
        Some(s) => s,
        None => return JString::default(),
    };
    // content_mappings_json may be null — parse as HashMap<String, ContentMapping> if present
    let mappings = jstring_to_string(&mut env, &content_mappings_json).and_then(|json| {
        serde_json::from_str::<std::collections::HashMap<String, zhtp_client::ContentMapping>>(
            &json,
        )
        .ok()
    });

    match zhtp_client::build_domain_register_request(identity, &domain_str, mappings) {
        Ok(json) => env.new_string(&json).unwrap_or_default(),
        Err(e) => {
            log::error!("[Identity JNI] buildDomainRegisterRequest failed: {}", e);
            JString::default()
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Identity_nativeBuildDomainUpdateRequest<
    'local,
>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
    domain: JString<'local>,
    new_manifest_cid: JString<'local>,
    expected_previous_manifest_cid: JString<'local>,
) -> JString<'local> {
    if handle == 0 {
        return JString::default();
    }
    let identity = unsafe { handle_ref(handle) };
    let domain_str = match jstring_to_string(&mut env, &domain) {
        Some(s) => s,
        None => return JString::default(),
    };
    let new_cid = match jstring_to_string(&mut env, &new_manifest_cid) {
        Some(s) => s,
        None => return JString::default(),
    };
    let expected_cid = match jstring_to_string(&mut env, &expected_previous_manifest_cid) {
        Some(s) => s,
        None => return JString::default(),
    };

    match zhtp_client::build_domain_update_request(identity, &domain_str, &new_cid, &expected_cid) {
        Ok(json) => env.new_string(&json).unwrap_or_default(),
        Err(e) => {
            log::error!("[Identity JNI] buildDomainUpdateRequest failed: {}", e);
            JString::default()
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Identity_nativeBuildDomainTransferRequest<
    'local,
>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
    domain: JString<'local>,
    to_owner_did: JString<'local>,
) -> JString<'local> {
    if handle == 0 {
        return JString::default();
    }
    let identity = unsafe { handle_ref(handle) };
    let domain_str = match jstring_to_string(&mut env, &domain) {
        Some(s) => s,
        None => return JString::default(),
    };
    let to_did = match jstring_to_string(&mut env, &to_owner_did) {
        Some(s) => s,
        None => return JString::default(),
    };

    match zhtp_client::build_domain_transfer_request(identity, &domain_str, &to_did) {
        Ok(json) => env.new_string(&json).unwrap_or_default(),
        Err(e) => {
            log::error!("[Identity JNI] buildDomainTransferRequest failed: {}", e);
            JString::default()
        }
    }
}

// ─── Deprecated secret key getters (legacy handshake path only) ────────────────

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Identity_nativeIdentityGetDilithiumSk<
    'local,
>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
) -> JByteArray<'local> {
    if handle == 0 {
        return JByteArray::default();
    }
    let identity = unsafe { handle_ref(handle) };
    env.byte_array_from_slice(&identity.private_key)
        .unwrap_or_else(|_| JByteArray::default())
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Identity_nativeIdentityGetKyberSk<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
) -> JByteArray<'local> {
    if handle == 0 {
        return JByteArray::default();
    }
    let identity = unsafe { handle_ref(handle) };
    env.byte_array_from_slice(&identity.kyber_secret_key)
        .unwrap_or_else(|_| JByteArray::default())
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Identity_nativeIdentityGetMasterSeed<
    'local,
>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
) -> JByteArray<'local> {
    if handle == 0 {
        return JByteArray::default();
    }
    let identity = unsafe { handle_ref(handle) };
    env.byte_array_from_slice(&identity.recovery_entropy)
        .unwrap_or_else(|_| JByteArray::default())
}
