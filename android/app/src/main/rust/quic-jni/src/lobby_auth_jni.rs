//! JNI bindings for the Lobby Auth OPAQUE FFI in lib-client
//! (`zhtp_opaque_*` / `zhtp_lobby_mac_compute`). Mirrors
//! `ios/LobbyAuth.swift` — the client half of the network-locked
//! OPAQUE flow (Ristretto255 + TripleDh + Argon2id).
//!
//! The lib-client OPAQUE state handles (`*mut OpaqueRegisterState` /
//! `*mut OpaqueLoginState`) cross the JNI boundary as raw `jlong`
//! values, exactly as `quic_session_jni.rs` does with session
//! pointers — no HashMap indirection. The Kotlin side holds the
//! `jlong` between the `start` and `finish`/`cancel` calls.
//!
//! ## Packed `byte[]` return layouts
//!
//! JNI can only return a single value, so the `_start` calls that
//! must surface both a handle and a request blob pack them into one
//! `byte[]`:
//!
//!   nativeOpaqueRegisterStart / nativeOpaqueLoginStart
//!     [0..8)   handle  : i64 big-endian (the OPAQUE state pointer)
//!     [8..)    request : OPAQUE protocol message bytes
//!   → null `byte[]` means the FFI returned a null state handle.
//!
//!   nativeOpaqueRegisterFinish
//!     [0]      rc      : i8 (0 ok; -1/-2/-3 error codes)
//!     on rc == 0 only:
//!     [1..5)   recordLen   : u32 big-endian
//!     [5..5+L) record      : registration record bytes
//!     [..]     exportKey   : 64-byte export key (remainder)
//!
//!   nativeOpaqueLoginFinish
//!     [0]      rc      : i8 (0 ok; -1/-2/-3; -3 == wrong password)
//!     on rc == 0 only:
//!     [1..5)   msg3Len     : u32 big-endian
//!     [5..5+L) msg3        : third login message bytes
//!     [..64)   sessionKey  : next 64 bytes
//!     [..64)   exportKey   : final 64 bytes
//!
//! The `rc`-prefixed layout lets the Kotlin wrapper branch on the
//! first byte before unpacking the success payload. On error only the
//! single rc byte is present.

use jni::objects::{JByteArray, JClass, JString};
use jni::sys::{jbyteArray, jint, jlong};
use jni::JNIEnv;
use std::ffi::{c_char, CString};
use std::ptr;

// ── lib-client OPAQUE FFI, re-declared as extern "C" ─────────────────
//
// These symbols are new in lib-client (`src/opaque.rs`) and not yet in
// the shipped `.so`; the library is rebuilt separately. Re-declaring
// them here (instead of importing the Rust items) keeps the call sites
// pinned to the exact C ABI and sidesteps the opaque state types being
// private to the lib-client crate.

/// Matches lib-client's `#[repr(C)] ByteBuffer`. Out-param buffers are
/// populated by the callee; copy the bytes out then free with
/// `zhtp_client_buffer_free`.
#[repr(C)]
struct ByteBuffer {
    data: *mut u8,
    len: usize,
}

impl ByteBuffer {
    fn empty() -> Self {
        ByteBuffer {
            data: ptr::null_mut(),
            len: 0,
        }
    }
}

// Opaque state types — only ever held behind a pointer.
enum OpaqueRegisterState {}
enum OpaqueLoginState {}

extern "C" {
    fn zhtp_opaque_register_start(
        password: *const c_char,
        out_request: *mut ByteBuffer,
    ) -> *mut OpaqueRegisterState;

    fn zhtp_opaque_register_finish(
        state: *mut OpaqueRegisterState,
        password: *const c_char,
        server_response: *const u8,
        server_response_len: usize,
        out_record: *mut ByteBuffer,
        out_export_key: *mut ByteBuffer,
    ) -> i32;

    fn zhtp_opaque_register_state_free(state: *mut OpaqueRegisterState);

    fn zhtp_opaque_login_start(
        password: *const c_char,
        out_request: *mut ByteBuffer,
    ) -> *mut OpaqueLoginState;

    fn zhtp_opaque_login_finish(
        state: *mut OpaqueLoginState,
        password: *const c_char,
        server_response: *const u8,
        server_response_len: usize,
        out_msg3: *mut ByteBuffer,
        out_session_key: *mut ByteBuffer,
        out_export_key: *mut ByteBuffer,
    ) -> i32;

    fn zhtp_opaque_login_state_free(state: *mut OpaqueLoginState);

    fn zhtp_lobby_mac_compute(
        session_key_ptr: *const u8,
        session_key_len: usize,
        method: u8,
        uri: *const u8,
        uri_len: usize,
        body: *const u8,
        body_len: usize,
        seq: u64,
        out_mac: *mut u8,
    ) -> i32;

    fn zhtp_client_buffer_free(buf: ByteBuffer);
}

// ── Helpers ──────────────────────────────────────────────────────────

fn jstring_to_cstring(env: &mut JNIEnv, s: &JString) -> Option<CString> {
    let s: String = env.get_string(s).ok()?.into();
    CString::new(s).ok()
}

fn jbytes_to_vec(env: &mut JNIEnv, arr: &JByteArray) -> Option<Vec<u8>> {
    env.convert_byte_array(arr).ok()
}

fn vec_to_jbytes(env: &mut JNIEnv, v: &[u8]) -> jbyteArray {
    env.byte_array_from_slice(v)
        .map(|j| j.into_raw())
        .unwrap_or(ptr::null_mut())
}

/// Copy an out-param `ByteBuffer` into an owned `Vec`, then free the
/// FFI-allocated buffer. Safe for a zeroed (`empty()`) buffer.
unsafe fn take_buffer(buf: ByteBuffer) -> Vec<u8> {
    let out = if buf.data.is_null() || buf.len == 0 {
        Vec::new()
    } else {
        std::slice::from_raw_parts(buf.data, buf.len).to_vec()
    };
    zhtp_client_buffer_free(buf);
    out
}

// ── nativeOpaqueRegisterStart ────────────────────────────────────────
//
// Returns packed [handle:8 BE][requestBytes...], or null on failure.

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_LobbyAuth_nativeOpaqueRegisterStart<'l>(
    mut env: JNIEnv<'l>,
    _class: JClass<'l>,
    password: JString<'l>,
) -> jbyteArray {
    let pw = match jstring_to_cstring(&mut env, &password) {
        Some(s) => s,
        None => return ptr::null_mut(),
    };

    let mut req_buf = ByteBuffer::empty();
    let state = unsafe { zhtp_opaque_register_start(pw.as_ptr(), &mut req_buf) };
    if state.is_null() {
        return ptr::null_mut();
    }
    let request = unsafe { take_buffer(req_buf) };

    let mut out = Vec::with_capacity(8 + request.len());
    out.extend_from_slice(&(state as i64).to_be_bytes());
    out.extend_from_slice(&request);
    vec_to_jbytes(&mut env, &out)
}

// ── nativeOpaqueRegisterFinish ───────────────────────────────────────
//
// CONSUMES the state handle. Returns packed:
//   [rc:1] on error, or
//   [rc:1][recordLen:4 BE][record...][exportKey:64] on success.

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_LobbyAuth_nativeOpaqueRegisterFinish<'l>(
    mut env: JNIEnv<'l>,
    _class: JClass<'l>,
    state_handle: jlong,
    password: JString<'l>,
    server_msg: JByteArray<'l>,
) -> jbyteArray {
    let pw = match jstring_to_cstring(&mut env, &password) {
        Some(s) => s,
        None => return vec_to_jbytes(&mut env, &[(-1i32) as u8]),
    };
    let server = match jbytes_to_vec(&mut env, &server_msg) {
        Some(b) => b,
        None => return vec_to_jbytes(&mut env, &[(-1i32) as u8]),
    };

    let mut record_buf = ByteBuffer::empty();
    let mut export_buf = ByteBuffer::empty();
    let rc = unsafe {
        zhtp_opaque_register_finish(
            state_handle as *mut OpaqueRegisterState,
            pw.as_ptr(),
            if server.is_empty() {
                ptr::null()
            } else {
                server.as_ptr()
            },
            server.len(),
            &mut record_buf,
            &mut export_buf,
        )
    };

    if rc != 0 {
        return vec_to_jbytes(&mut env, &[rc as u8]);
    }

    let record = unsafe { take_buffer(record_buf) };
    let export_key = unsafe { take_buffer(export_buf) };

    let mut out = Vec::with_capacity(1 + 4 + record.len() + export_key.len());
    out.push(0u8);
    out.extend_from_slice(&(record.len() as u32).to_be_bytes());
    out.extend_from_slice(&record);
    out.extend_from_slice(&export_key);
    vec_to_jbytes(&mut env, &out)
}

// ── nativeOpaqueRegisterCancel ───────────────────────────────────────

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_LobbyAuth_nativeOpaqueRegisterCancel(
    _env: JNIEnv,
    _class: JClass,
    state_handle: jlong,
) {
    if state_handle != 0 {
        unsafe { zhtp_opaque_register_state_free(state_handle as *mut OpaqueRegisterState) };
    }
}

// ── nativeOpaqueLoginStart ───────────────────────────────────────────
//
// Returns packed [handle:8 BE][requestBytes...], or null on failure.

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_LobbyAuth_nativeOpaqueLoginStart<'l>(
    mut env: JNIEnv<'l>,
    _class: JClass<'l>,
    password: JString<'l>,
) -> jbyteArray {
    let pw = match jstring_to_cstring(&mut env, &password) {
        Some(s) => s,
        None => return ptr::null_mut(),
    };

    let mut req_buf = ByteBuffer::empty();
    let state = unsafe { zhtp_opaque_login_start(pw.as_ptr(), &mut req_buf) };
    if state.is_null() {
        return ptr::null_mut();
    }
    let request = unsafe { take_buffer(req_buf) };

    let mut out = Vec::with_capacity(8 + request.len());
    out.extend_from_slice(&(state as i64).to_be_bytes());
    out.extend_from_slice(&request);
    vec_to_jbytes(&mut env, &out)
}

// ── nativeOpaqueLoginFinish ──────────────────────────────────────────
//
// CONSUMES the state handle. Returns packed:
//   [rc:1] on error (rc -3 == wrong password), or
//   [rc:1][msg3Len:4 BE][msg3...][sessionKey:64][exportKey:64] on success.

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_LobbyAuth_nativeOpaqueLoginFinish<'l>(
    mut env: JNIEnv<'l>,
    _class: JClass<'l>,
    state_handle: jlong,
    password: JString<'l>,
    server_msg: JByteArray<'l>,
) -> jbyteArray {
    let pw = match jstring_to_cstring(&mut env, &password) {
        Some(s) => s,
        None => return vec_to_jbytes(&mut env, &[(-1i32) as u8]),
    };
    let server = match jbytes_to_vec(&mut env, &server_msg) {
        Some(b) => b,
        None => return vec_to_jbytes(&mut env, &[(-1i32) as u8]),
    };

    let mut msg3_buf = ByteBuffer::empty();
    let mut sk_buf = ByteBuffer::empty();
    let mut ek_buf = ByteBuffer::empty();
    let rc = unsafe {
        zhtp_opaque_login_finish(
            state_handle as *mut OpaqueLoginState,
            pw.as_ptr(),
            if server.is_empty() {
                ptr::null()
            } else {
                server.as_ptr()
            },
            server.len(),
            &mut msg3_buf,
            &mut sk_buf,
            &mut ek_buf,
        )
    };

    if rc != 0 {
        return vec_to_jbytes(&mut env, &[rc as u8]);
    }

    let msg3 = unsafe { take_buffer(msg3_buf) };
    let session_key = unsafe { take_buffer(sk_buf) };
    let export_key = unsafe { take_buffer(ek_buf) };

    let mut out =
        Vec::with_capacity(1 + 4 + msg3.len() + session_key.len() + export_key.len());
    out.push(0u8);
    out.extend_from_slice(&(msg3.len() as u32).to_be_bytes());
    out.extend_from_slice(&msg3);
    out.extend_from_slice(&session_key);
    out.extend_from_slice(&export_key);
    vec_to_jbytes(&mut env, &out)
}

// ── nativeOpaqueLoginCancel ──────────────────────────────────────────

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_LobbyAuth_nativeOpaqueLoginCancel(
    _env: JNIEnv,
    _class: JClass,
    state_handle: jlong,
) {
    if state_handle != 0 {
        unsafe { zhtp_opaque_login_state_free(state_handle as *mut OpaqueLoginState) };
    }
}

// ── nativeLobbyMacCompute ────────────────────────────────────────────
//
// Returns the 32-byte MAC, or null on failure (FFI rc != 0).

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_LobbyAuth_nativeLobbyMacCompute<'l>(
    mut env: JNIEnv<'l>,
    _class: JClass<'l>,
    session_key: JByteArray<'l>,
    method: jint,
    uri: JString<'l>,
    body: JByteArray<'l>,
    seq: jlong,
) -> jbyteArray {
    let key = match jbytes_to_vec(&mut env, &session_key) {
        Some(b) => b,
        None => return ptr::null_mut(),
    };
    if key.len() != 64 {
        return ptr::null_mut();
    }
    let uri_str: String = match env.get_string(&uri) {
        Ok(s) => s.into(),
        Err(_) => return ptr::null_mut(),
    };
    let uri_bytes = uri_str.as_bytes();
    let body_bytes = match jbytes_to_vec(&mut env, &body) {
        Some(b) => b,
        None => return ptr::null_mut(),
    };

    let mut mac = [0u8; 32];
    let rc = unsafe {
        zhtp_lobby_mac_compute(
            key.as_ptr(),
            key.len(),
            method as u8,
            if uri_bytes.is_empty() {
                ptr::null()
            } else {
                uri_bytes.as_ptr()
            },
            uri_bytes.len(),
            if body_bytes.is_empty() {
                ptr::null()
            } else {
                body_bytes.as_ptr()
            },
            body_bytes.len(),
            seq as u64,
            mac.as_mut_ptr(),
        )
    };
    if rc != 0 {
        return ptr::null_mut();
    }
    vec_to_jbytes(&mut env, &mac)
}
