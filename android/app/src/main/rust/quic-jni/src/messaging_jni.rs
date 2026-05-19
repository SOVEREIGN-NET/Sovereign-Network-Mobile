//! JNI bindings for post-quantum messaging — mirrors the iOS C FFI in
//! `lib-client/src/lib.rs` (zhtp_msg_*). Sessions cross the boundary as
//! `jlong` handles wrapping `Box::into_raw(Box::new(MessagingSession))`.
//! Envelopes flow as bincode-serialised `byte[]`.
//!
//! Kotlin side: see `Messaging.kt`. Wire format helpers + envelope
//! inspection produce strings; the Kotlin wrapper parses the JSON and
//! re-exposes a typed `EnvelopeMetadata`.

use jni::objects::{JByteArray, JClass, JString};
use jni::sys::{jbyteArray, jint, jlong, jobject};
use jni::JNIEnv;

use zhtp_client::messaging::{
    accept_rekey, accept_session, decode_envelope, encode_envelope, initiate_session,
    open_envelope, rekey_session, seal_binary_message, seal_key_exchange, seal_text_message,
    sign_envelope, verify_envelope, ContentType, MessageEnvelope, MessagingSession,
};

// ── Helpers ──────────────────────────────────────────────────────────

unsafe fn session_ref(handle: jlong) -> Option<&'static MessagingSession> {
    if handle == 0 {
        None
    } else {
        Some(&*(handle as *const MessagingSession))
    }
}

unsafe fn session_mut(handle: jlong) -> Option<&'static mut MessagingSession> {
    if handle == 0 {
        None
    } else {
        Some(&mut *(handle as *mut MessagingSession))
    }
}

fn jstring_to_string(env: &mut JNIEnv, s: &JString) -> Option<String> {
    env.get_string(s).ok().map(|s| s.into())
}

fn jbytes_to_vec(env: &mut JNIEnv, arr: &JByteArray) -> Option<Vec<u8>> {
    env.convert_byte_array(arr).ok()
}

fn vec_to_jbytes<'local>(env: &mut JNIEnv<'local>, v: &[u8]) -> JByteArray<'local> {
    env.byte_array_from_slice(v)
        .unwrap_or_else(|_| JByteArray::default())
}

fn empty_bytes<'local>(env: &mut JNIEnv<'local>) -> JByteArray<'local> {
    env.byte_array_from_slice(&[])
        .unwrap_or_else(|_| JByteArray::default())
}

fn content_type_tag(ct: &ContentType) -> u8 {
    match ct {
        ContentType::Text => 0,
        ContentType::Image => 1,
        ContentType::File => 2,
        ContentType::Voice => 3,
        ContentType::KeyExchange => 4,
        ContentType::KeyRatchet => 5,
        ContentType::ReadReceipt => 6,
        ContentType::GroupInvite => 7,
    }
}

fn content_type_from_tag(tag: u8) -> Option<ContentType> {
    Some(match tag {
        0 => ContentType::Text,
        1 => ContentType::Image,
        2 => ContentType::File,
        3 => ContentType::Voice,
        4 => ContentType::KeyExchange,
        5 => ContentType::KeyRatchet,
        6 => ContentType::ReadReceipt,
        7 => ContentType::GroupInvite,
        _ => return None,
    })
}

// ── Session lifecycle ────────────────────────────────────────────────
//
// The pair `(handle, kyberCiphertext)` from `initiate` would be awkward
// to return as a single JNI value, so we split it across two calls:
// `nativeInitiate` returns the handle, and `nativeTakeInitCiphertext`
// returns the most recent ciphertext keyed off the same handle. The
// ciphertext is held in a per-handle `OnceCell` populated during init —
// realistically the Kotlin wrapper makes both calls back-to-back inside
// the same `initiate(...)` method, so the cell is always read once and
// dropped.

use std::collections::HashMap;
use std::sync::Mutex;

static INIT_CT_CACHE: once_cell::sync::Lazy<Mutex<HashMap<jlong, Vec<u8>>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(HashMap::new()));

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Messaging_nativeInitiateSession<
    'local,
>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    local_did: JString<'local>,
    remote_did: JString<'local>,
    remote_kyber_pk: JByteArray<'local>,
) -> jlong {
    let local = match jstring_to_string(&mut env, &local_did) {
        Some(s) => s,
        None => return 0,
    };
    let remote = match jstring_to_string(&mut env, &remote_did) {
        Some(s) => s,
        None => return 0,
    };
    let pk = match jbytes_to_vec(&mut env, &remote_kyber_pk) {
        Some(b) => b,
        None => return 0,
    };
    match initiate_session(&local, &remote, &pk) {
        Ok((ct, session)) => {
            let handle = Box::into_raw(Box::new(session)) as jlong;
            INIT_CT_CACHE.lock().unwrap().insert(handle, ct);
            handle
        }
        Err(e) => {
            log::error!("[Messaging JNI] initiate failed: {}", e);
            0
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Messaging_nativeTakeInitCiphertext<
    'local,
>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
) -> JByteArray<'local> {
    let mut cache = INIT_CT_CACHE.lock().unwrap();
    match cache.remove(&handle) {
        Some(ct) => vec_to_jbytes(&mut env, &ct),
        None => empty_bytes(&mut env),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Messaging_nativeAcceptSession<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    local_did: JString<'local>,
    remote_did: JString<'local>,
    kyber_ciphertext: JByteArray<'local>,
    local_kyber_sk: JByteArray<'local>,
) -> jlong {
    let local = match jstring_to_string(&mut env, &local_did) {
        Some(s) => s,
        None => return 0,
    };
    let remote = match jstring_to_string(&mut env, &remote_did) {
        Some(s) => s,
        None => return 0,
    };
    let ct = match jbytes_to_vec(&mut env, &kyber_ciphertext) {
        Some(b) => b,
        None => return 0,
    };
    let sk = match jbytes_to_vec(&mut env, &local_kyber_sk) {
        Some(b) => b,
        None => return 0,
    };
    match accept_session(&local, &remote, &ct, &sk) {
        Ok(session) => Box::into_raw(Box::new(session)) as jlong,
        Err(e) => {
            log::error!("[Messaging JNI] accept failed: {}", e);
            0
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Messaging_nativeRekeySession<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
    remote_kyber_pk: JByteArray<'local>,
) -> JByteArray<'local> {
    let session = match unsafe { session_mut(handle) } {
        Some(s) => s,
        None => return empty_bytes(&mut env),
    };
    let pk = match jbytes_to_vec(&mut env, &remote_kyber_pk) {
        Some(b) => b,
        None => return empty_bytes(&mut env),
    };
    match rekey_session(session, &pk) {
        Ok(ct) => vec_to_jbytes(&mut env, &ct),
        Err(e) => {
            log::error!("[Messaging JNI] rekey failed: {}", e);
            empty_bytes(&mut env)
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Messaging_nativeAcceptRekey(
    mut env: JNIEnv,
    _class: JClass,
    handle: jlong,
    kyber_ciphertext: JByteArray,
    local_kyber_sk: JByteArray,
) -> jint {
    let session = match unsafe { session_mut(handle) } {
        Some(s) => s,
        None => return -1,
    };
    let ct = match jbytes_to_vec(&mut env, &kyber_ciphertext) {
        Some(b) => b,
        None => return -1,
    };
    let sk = match jbytes_to_vec(&mut env, &local_kyber_sk) {
        Some(b) => b,
        None => return -1,
    };
    match accept_rekey(session, &ct, &sk) {
        Ok(()) => 0,
        Err(_) => -1,
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Messaging_nativeSessionFree(
    _env: JNIEnv,
    _class: JClass,
    handle: jlong,
) {
    if handle != 0 {
        // Drop any leftover ciphertext for this handle so the cache
        // doesn't leak when callers free without taking it.
        INIT_CT_CACHE.lock().unwrap().remove(&handle);
        unsafe { drop(Box::from_raw(handle as *mut MessagingSession)) };
    }
}

// ── Session field access ─────────────────────────────────────────────

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Messaging_nativeSessionLocalDid<
    'local,
>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
) -> JString<'local> {
    match unsafe { session_ref(handle) } {
        Some(s) => env
            .new_string(&s.local_did)
            .unwrap_or_else(|_| JString::default()),
        None => JString::default(),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Messaging_nativeSessionRemoteDid<
    'local,
>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
) -> JString<'local> {
    match unsafe { session_ref(handle) } {
        Some(s) => env
            .new_string(&s.remote_did)
            .unwrap_or_else(|_| JString::default()),
        None => JString::default(),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Messaging_nativeSessionCounter(
    _env: JNIEnv,
    _class: JClass,
    handle: jlong,
) -> jlong {
    match unsafe { session_ref(handle) } {
        Some(s) => s.counter as jlong,
        None => 0,
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Messaging_nativeSessionEpoch(
    _env: JNIEnv,
    _class: JClass,
    handle: jlong,
) -> jint {
    match unsafe { session_ref(handle) } {
        Some(s) => s.epoch as jint,
        None => 0,
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Messaging_nativeSessionChainKey<
    'local,
>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
) -> JByteArray<'local> {
    match unsafe { session_ref(handle) } {
        Some(s) => vec_to_jbytes(&mut env, &s.chain_key),
        None => empty_bytes(&mut env),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Messaging_nativeSessionSerialize<
    'local,
>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
) -> JByteArray<'local> {
    let session = match unsafe { session_ref(handle) } {
        Some(s) => s,
        None => return empty_bytes(&mut env),
    };
    match bincode::serialize(session) {
        Ok(b) => vec_to_jbytes(&mut env, &b),
        Err(_) => empty_bytes(&mut env),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Messaging_nativeSessionDeserialize<
    'local,
>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    bytes: JByteArray<'local>,
) -> jlong {
    let buf = match jbytes_to_vec(&mut env, &bytes) {
        Some(b) => b,
        None => return 0,
    };
    match bincode::deserialize::<MessagingSession>(&buf) {
        Ok(s) => Box::into_raw(Box::new(s)) as jlong,
        Err(_) => 0,
    }
}

// ── Sealing ──────────────────────────────────────────────────────────

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Messaging_nativeSealText<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
    text: JString<'local>,
) -> JByteArray<'local> {
    let session = match unsafe { session_mut(handle) } {
        Some(s) => s,
        None => return empty_bytes(&mut env),
    };
    let s = match jstring_to_string(&mut env, &text) {
        Some(s) => s,
        None => return empty_bytes(&mut env),
    };
    match seal_text_message(session, &s) {
        Ok(env_out) => match bincode::serialize(&env_out) {
            Ok(b) => vec_to_jbytes(&mut env, &b),
            Err(_) => empty_bytes(&mut env),
        },
        Err(_) => empty_bytes(&mut env),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Messaging_nativeSealBinary<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
    content_type_tag: jint,
    data: JByteArray<'local>,
) -> JByteArray<'local> {
    let session = match unsafe { session_mut(handle) } {
        Some(s) => s,
        None => return empty_bytes(&mut env),
    };
    let ct = match content_type_from_tag(content_type_tag as u8) {
        Some(c) => c,
        None => return empty_bytes(&mut env),
    };
    let bytes = match jbytes_to_vec(&mut env, &data) {
        Some(b) => b,
        None => return empty_bytes(&mut env),
    };
    match seal_binary_message(session, ct, bytes) {
        Ok(env_out) => match bincode::serialize(&env_out) {
            Ok(b) => vec_to_jbytes(&mut env, &b),
            Err(_) => empty_bytes(&mut env),
        },
        Err(_) => empty_bytes(&mut env),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Messaging_nativeSealKeyExchange<
    'local,
>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    sender_did: JString<'local>,
    recipient_did: JString<'local>,
    kyber_ciphertext: JByteArray<'local>,
) -> JByteArray<'local> {
    let sender = match jstring_to_string(&mut env, &sender_did) {
        Some(s) => s,
        None => return empty_bytes(&mut env),
    };
    let recipient = match jstring_to_string(&mut env, &recipient_did) {
        Some(s) => s,
        None => return empty_bytes(&mut env),
    };
    let ct = match jbytes_to_vec(&mut env, &kyber_ciphertext) {
        Some(b) => b,
        None => return empty_bytes(&mut env),
    };
    match seal_key_exchange(&sender, &recipient, ct) {
        Ok(env_out) => match bincode::serialize(&env_out) {
            Ok(b) => vec_to_jbytes(&mut env, &b),
            Err(_) => empty_bytes(&mut env),
        },
        Err(_) => empty_bytes(&mut env),
    }
}

// ── Open / Sign / Verify ─────────────────────────────────────────────

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Messaging_nativeEnvelopeOpen<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    envelope_bytes: JByteArray<'local>,
    chain_key: JByteArray<'local>,
) -> JByteArray<'local> {
    let env_bytes = match jbytes_to_vec(&mut env, &envelope_bytes) {
        Some(b) => b,
        None => return empty_bytes(&mut env),
    };
    let envelope: MessageEnvelope = match bincode::deserialize(&env_bytes) {
        Ok(e) => e,
        Err(_) => return empty_bytes(&mut env),
    };
    let key_bytes = match jbytes_to_vec(&mut env, &chain_key) {
        Some(b) => b,
        None => return empty_bytes(&mut env),
    };
    if key_bytes.len() != 32 {
        return empty_bytes(&mut env);
    }
    let mut key_arr = [0u8; 32];
    key_arr.copy_from_slice(&key_bytes);
    match open_envelope(&envelope, &key_arr) {
        Ok(body) => vec_to_jbytes(&mut env, &body),
        Err(_) => empty_bytes(&mut env),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Messaging_nativeEnvelopeSign<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    envelope_bytes: JByteArray<'local>,
    dilithium_sk: JByteArray<'local>,
) -> JByteArray<'local> {
    let env_bytes = match jbytes_to_vec(&mut env, &envelope_bytes) {
        Some(b) => b,
        None => return empty_bytes(&mut env),
    };
    let envelope: MessageEnvelope = match bincode::deserialize(&env_bytes) {
        Ok(e) => e,
        Err(_) => return empty_bytes(&mut env),
    };
    let sk = match jbytes_to_vec(&mut env, &dilithium_sk) {
        Some(b) => b,
        None => return empty_bytes(&mut env),
    };
    match sign_envelope(envelope, &sk) {
        Ok(signed) => match bincode::serialize(&signed) {
            Ok(b) => vec_to_jbytes(&mut env, &b),
            Err(_) => empty_bytes(&mut env),
        },
        Err(_) => empty_bytes(&mut env),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Messaging_nativeEnvelopeVerify(
    mut env: JNIEnv,
    _class: JClass,
    envelope_bytes: JByteArray,
    dilithium_pk: JByteArray,
) -> jint {
    let env_bytes = match jbytes_to_vec(&mut env, &envelope_bytes) {
        Some(b) => b,
        None => return -1,
    };
    let envelope: MessageEnvelope = match bincode::deserialize(&env_bytes) {
        Ok(e) => e,
        Err(_) => return -1,
    };
    let pk = match jbytes_to_vec(&mut env, &dilithium_pk) {
        Some(b) => b,
        None => return -1,
    };
    match verify_envelope(&envelope, &pk) {
        Ok(true) => 1,
        Ok(false) => 0,
        Err(_) => -1,
    }
}

// ── Wire format / inspection ─────────────────────────────────────────

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Messaging_nativeEnvelopeToHex<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    envelope_bytes: JByteArray<'local>,
) -> JString<'local> {
    let env_bytes = match jbytes_to_vec(&mut env, &envelope_bytes) {
        Some(b) => b,
        None => return JString::default(),
    };
    env.new_string(hex::encode(&env_bytes))
        .unwrap_or_else(|_| JString::default())
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Messaging_nativeEnvelopeFromHex<
    'local,
>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    hex_str: JString<'local>,
) -> JByteArray<'local> {
    let s = match jstring_to_string(&mut env, &hex_str) {
        Some(s) => s,
        None => return empty_bytes(&mut env),
    };
    match hex::decode(&s) {
        Ok(b) => vec_to_jbytes(&mut env, &b),
        Err(_) => empty_bytes(&mut env),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Messaging_nativeEnvelopeToJson<
    'local,
>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    envelope_bytes: JByteArray<'local>,
) -> JString<'local> {
    let env_bytes = match jbytes_to_vec(&mut env, &envelope_bytes) {
        Some(b) => b,
        None => return JString::default(),
    };
    let envelope: MessageEnvelope = match bincode::deserialize(&env_bytes) {
        Ok(e) => e,
        Err(_) => return JString::default(),
    };
    let view = serde_json::json!({
        "version": envelope.version,
        "sender_did": envelope.sender_did,
        "recipient_did": envelope.recipient_did,
        "timestamp": envelope.timestamp,
        "epoch": envelope.epoch,
        "sequence": envelope.sequence,
        "content_type": content_type_tag(&envelope.content_type),
        "ciphertext_len": envelope.ciphertext.len(),
        "signature_len": envelope.signature.len(),
    });
    env.new_string(view.to_string())
        .unwrap_or_else(|_| JString::default())
}

// ── Identity-aware variants (secret keys stay in Rust) ──────────────
//
// These reach into the `Identity` struct (loaded by identity_jni) for
// the Dilithium / Kyber secret keys and produce wire-ready hex output
// in one call, so the keys never cross to Kotlin / JS.

use zhtp_client::identity::Identity as ZhtpIdentity;

unsafe fn identity_ref(handle: jlong) -> Option<&'static ZhtpIdentity> {
    if handle == 0 {
        None
    } else {
        Some(&*(handle as *const ZhtpIdentity))
    }
}

fn empty_jstring<'local>() -> JString<'local> {
    JString::default()
}

fn seal_to_hex_jstring<'local>(
    env: &mut JNIEnv<'local>,
    envelope: MessageEnvelope,
    identity: &ZhtpIdentity,
) -> JString<'local> {
    match sign_envelope(envelope, &identity.private_key) {
        Ok(signed) => match encode_envelope(&signed) {
            Ok(hex) => env
                .new_string(hex)
                .unwrap_or_else(|_| JString::default()),
            Err(_) => empty_jstring(),
        },
        Err(_) => empty_jstring(),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Messaging_nativeSealTextSigned<
    'local,
>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    session_handle: jlong,
    text: JString<'local>,
    identity_handle: jlong,
) -> JString<'local> {
    let session = match unsafe { session_mut(session_handle) } {
        Some(s) => s,
        None => return empty_jstring(),
    };
    let identity = match unsafe { identity_ref(identity_handle) } {
        Some(i) => i,
        None => return empty_jstring(),
    };
    let text_str = match jstring_to_string(&mut env, &text) {
        Some(s) => s,
        None => return empty_jstring(),
    };
    match seal_text_message(session, &text_str) {
        Ok(envelope) => seal_to_hex_jstring(&mut env, envelope, identity),
        Err(_) => empty_jstring(),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Messaging_nativeSealBinarySigned<
    'local,
>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    session_handle: jlong,
    content_type_tag: jint,
    data: JByteArray<'local>,
    identity_handle: jlong,
) -> JString<'local> {
    let session = match unsafe { session_mut(session_handle) } {
        Some(s) => s,
        None => return empty_jstring(),
    };
    let identity = match unsafe { identity_ref(identity_handle) } {
        Some(i) => i,
        None => return empty_jstring(),
    };
    let ct = match content_type_from_tag(content_type_tag as u8) {
        Some(c) => c,
        None => return empty_jstring(),
    };
    let bytes = match jbytes_to_vec(&mut env, &data) {
        Some(b) => b,
        None => return empty_jstring(),
    };
    match seal_binary_message(session, ct, bytes) {
        Ok(envelope) => seal_to_hex_jstring(&mut env, envelope, identity),
        Err(_) => empty_jstring(),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Messaging_nativeSealKeyExchangeSigned<
    'local,
>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    sender_did: JString<'local>,
    recipient_did: JString<'local>,
    kyber_ciphertext: JByteArray<'local>,
    identity_handle: jlong,
) -> JString<'local> {
    let identity = match unsafe { identity_ref(identity_handle) } {
        Some(i) => i,
        None => return empty_jstring(),
    };
    let sender = match jstring_to_string(&mut env, &sender_did) {
        Some(s) => s,
        None => return empty_jstring(),
    };
    let recipient = match jstring_to_string(&mut env, &recipient_did) {
        Some(s) => s,
        None => return empty_jstring(),
    };
    let ct = match jbytes_to_vec(&mut env, &kyber_ciphertext) {
        Some(b) => b,
        None => return empty_jstring(),
    };
    match seal_key_exchange(&sender, &recipient, ct) {
        Ok(envelope) => seal_to_hex_jstring(&mut env, envelope, identity),
        Err(_) => empty_jstring(),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Messaging_nativeAcceptSessionWithIdentity<
    'local,
>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    local_did: JString<'local>,
    remote_did: JString<'local>,
    kyber_ciphertext: JByteArray<'local>,
    identity_handle: jlong,
) -> jlong {
    let identity = match unsafe { identity_ref(identity_handle) } {
        Some(i) => i,
        None => return 0,
    };
    let local = match jstring_to_string(&mut env, &local_did) {
        Some(s) => s,
        None => return 0,
    };
    let remote = match jstring_to_string(&mut env, &remote_did) {
        Some(s) => s,
        None => return 0,
    };
    let ct = match jbytes_to_vec(&mut env, &kyber_ciphertext) {
        Some(b) => b,
        None => return 0,
    };
    match accept_session(&local, &remote, &ct, &identity.kyber_secret_key) {
        Ok(session) => Box::into_raw(Box::new(session)) as jlong,
        Err(e) => {
            log::error!("[Messaging JNI] acceptSessionWithIdentity failed: {}", e);
            0
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Messaging_nativeAcceptRekeyWithIdentity(
    mut env: JNIEnv,
    _class: JClass,
    session_handle: jlong,
    kyber_ciphertext: JByteArray,
    identity_handle: jlong,
) -> jint {
    let session = match unsafe { session_mut(session_handle) } {
        Some(s) => s,
        None => return -1,
    };
    let identity = match unsafe { identity_ref(identity_handle) } {
        Some(i) => i,
        None => return -1,
    };
    let ct = match jbytes_to_vec(&mut env, &kyber_ciphertext) {
        Some(b) => b,
        None => return -1,
    };
    match accept_rekey(session, &ct, &identity.kyber_secret_key) {
        Ok(()) => 0,
        Err(_) => -1,
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Messaging_nativeEnvelopeOpenVerified<
    'local,
>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    envelope_bytes: JByteArray<'local>,
    chain_key: JByteArray<'local>,
    peer_dilithium_pk: JByteArray<'local>,
) -> JByteArray<'local> {
    let env_bytes = match jbytes_to_vec(&mut env, &envelope_bytes) {
        Some(b) => b,
        None => return empty_bytes(&mut env),
    };
    let envelope: MessageEnvelope = match bincode::deserialize(&env_bytes) {
        Ok(e) => e,
        Err(_) => return empty_bytes(&mut env),
    };
    let pk = match jbytes_to_vec(&mut env, &peer_dilithium_pk) {
        Some(b) => b,
        None => return empty_bytes(&mut env),
    };
    // Verify first; collapse any non-`true` to a hard reject.
    match verify_envelope(&envelope, &pk) {
        Ok(true) => {}
        _ => return empty_bytes(&mut env),
    }
    let key_bytes = match jbytes_to_vec(&mut env, &chain_key) {
        Some(b) => b,
        None => return empty_bytes(&mut env),
    };
    if key_bytes.len() != 32 {
        return empty_bytes(&mut env);
    }
    let mut key_arr = [0u8; 32];
    key_arr.copy_from_slice(&key_bytes);
    match open_envelope(&envelope, &key_arr) {
        Ok(body) => vec_to_jbytes(&mut env, &body),
        Err(_) => empty_bytes(&mut env),
    }
}

// ── Envelope-shaped accept variants ─────────────────────────────────
//
// Symmetric to `seal_key_exchange_signed` on the send side: the JS
// layer hands us the bincode envelope, we extract the Kyber ciphertext
// internally so the bridge never has to traffic in raw cryptographic
// payloads.

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Messaging_nativeAcceptEnvelopeWithIdentity<
    'local,
>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    local_did: JString<'local>,
    remote_did: JString<'local>,
    envelope_bytes: JByteArray<'local>,
    identity_handle: jlong,
) -> jlong {
    let identity = match unsafe { identity_ref(identity_handle) } {
        Some(i) => i,
        None => return 0,
    };
    let local = match jstring_to_string(&mut env, &local_did) {
        Some(s) => s,
        None => return 0,
    };
    let remote = match jstring_to_string(&mut env, &remote_did) {
        Some(s) => s,
        None => return 0,
    };
    let env_bytes = match jbytes_to_vec(&mut env, &envelope_bytes) {
        Some(b) => b,
        None => return 0,
    };
    let envelope: MessageEnvelope = match bincode::deserialize(&env_bytes) {
        Ok(e) => e,
        Err(_) => return 0,
    };
    if !matches!(envelope.content_type, ContentType::KeyExchange) {
        return 0;
    }
    if envelope.sender_did != remote || envelope.recipient_did != local {
        return 0;
    }
    match accept_session(&local, &remote, &envelope.ciphertext, &identity.kyber_secret_key) {
        Ok(session) => Box::into_raw(Box::new(session)) as jlong,
        Err(e) => {
            log::error!("[Messaging JNI] acceptEnvelopeWithIdentity failed: {}", e);
            0
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_Messaging_nativeAcceptRekeyEnvelopeWithIdentity(
    mut env: JNIEnv,
    _class: JClass,
    session_handle: jlong,
    envelope_bytes: JByteArray,
    identity_handle: jlong,
) -> jint {
    let session = match unsafe { session_mut(session_handle) } {
        Some(s) => s,
        None => return -1,
    };
    let identity = match unsafe { identity_ref(identity_handle) } {
        Some(i) => i,
        None => return -1,
    };
    let env_bytes = match jbytes_to_vec(&mut env, &envelope_bytes) {
        Some(b) => b,
        None => return -1,
    };
    let envelope: MessageEnvelope = match bincode::deserialize(&env_bytes) {
        Ok(e) => e,
        Err(_) => return -1,
    };
    if !matches!(envelope.content_type, ContentType::KeyRatchet) {
        return -1;
    }
    match accept_rekey(session, &envelope.ciphertext, &identity.kyber_secret_key) {
        Ok(()) => 0,
        Err(_) => -1,
    }
}

// Suppress unused-import warning for `decode_envelope` / `encode_envelope` —
// we don't expose them as JNI symbols (callers use `nativeEnvelopeToHex`
// /`FromHex` which round-trip through bincode bytes), but we keep the
// import documenting the underlying API surface this module mirrors.
#[allow(dead_code)]
fn _api_surface_tracker() {
    let _ = decode_envelope;
    let _ = encode_envelope;
}
