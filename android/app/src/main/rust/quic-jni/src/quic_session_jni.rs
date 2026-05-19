//! JNI bindings for the persistent-session QUIC FFI in lib-client
//! (`zhtp_quic_session_*`). Mirrors `ios/QuicSession.swift` —
//! one session per identity, multiplexed RPCs, server-push inbound
//! stream. Handles cross the JNI boundary as `jlong` raw pointers,
//! frames as `byte[]`.
//!
//! Identity wrapping note: the iOS side stores `*mut IdentityHandle`
//! handles directly. The Android side stores `*mut Identity` (per
//! `identity_jni.rs`). The lib-client `zhtp_quic_session_open`
//! signature wants `*const IdentityHandle`. Since `IdentityHandle`'s
//! inner field is private, we round-trip the identity via the
//! existing `zhtp_client_identity_deserialize` FFI (which already
//! produces a `*mut IdentityHandle`). One serde hit per session open,
//! which is amortized over the whole session lifetime.

use jni::objects::{JByteArray, JClass, JString};
use jni::sys::{jbyteArray, jint, jlong};
use jni::JNIEnv;
use std::ffi::{c_char, CString};
use std::ptr;

use zhtp_client::identity::Identity as ZhtpIdentity;

// Re-declared as extern "C" so the Rust call sites match the FFI
// signature exactly, even though these functions are also reachable
// as Rust symbols. Using the extern shape sidesteps any cross-crate
// visibility quirks around the opaque `IdentityHandle` type.
extern "C" {
    fn zhtp_quic_session_open(
        host: *const c_char,
        port: u16,
        sni: *const c_char,
        spki_pin_hex: *const c_char,
        alpn: u8,
        identity: *const std::ffi::c_void,
    ) -> *mut std::ffi::c_void;

    fn zhtp_quic_session_rpc(
        session: *mut std::ffi::c_void,
        method: *const c_char,
        path: *const c_char,
        headers_json: *const c_char,
        body_ptr: *const u8,
        body_len: usize,
    ) -> *mut std::ffi::c_void;

    fn zhtp_quic_session_rpc_status(response: *const std::ffi::c_void) -> u16;
    fn zhtp_quic_session_rpc_body(
        response: *const std::ffi::c_void,
        out_len: *mut usize,
    ) -> *const u8;
    fn zhtp_quic_session_rpc_free(response: *mut std::ffi::c_void);

    fn zhtp_quic_session_inbound_open(
        session: *mut std::ffi::c_void,
        path: *const c_char,
    ) -> *mut std::ffi::c_void;

    fn zhtp_quic_session_inbound_read(
        stream: *mut std::ffi::c_void,
        timeout_ms: u32,
        out_ptr: *mut *const u8,
        out_len: *mut usize,
    ) -> i32;

    fn zhtp_quic_session_inbound_frame_free(ptr: *const u8, len: usize);
    fn zhtp_quic_session_inbound_close(stream: *mut std::ffi::c_void);
    fn zhtp_quic_session_close(session: *mut std::ffi::c_void);

    fn zhtp_client_identity_deserialize(json: *const c_char) -> *mut std::ffi::c_void;
    fn zhtp_client_identity_free(handle: *mut std::ffi::c_void);
}

// ── Helpers ─────────────────────────────────────────────────────────

unsafe fn identity_ref(handle: jlong) -> Option<&'static ZhtpIdentity> {
    if handle == 0 {
        None
    } else {
        Some(&*(handle as *const ZhtpIdentity))
    }
}

fn jstring_to_cstring(env: &mut JNIEnv, s: &JString) -> Option<CString> {
    let s: String = env.get_string(s).ok()?.into();
    CString::new(s).ok()
}

fn empty_byte_array<'l>(env: &mut JNIEnv<'l>) -> JByteArray<'l> {
    env.byte_array_from_slice(&[])
        .unwrap_or_else(|_| JByteArray::default())
}

// ── nativeSessionOpen ───────────────────────────────────────────────

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_QuicSession_nativeSessionOpen<'l>(
    mut env: JNIEnv<'l>,
    _class: JClass<'l>,
    host: JString<'l>,
    port: jint,
    alpn: jint,
    identity_handle: jlong,
) -> jlong {
    let host_c = match jstring_to_cstring(&mut env, &host) {
        Some(s) => s,
        None => return 0,
    };

    // Wrap the Android-side Identity into a lib-client IdentityHandle
    // by round-tripping through `zhtp_client_identity_deserialize`.
    // The temporary handle is freed as soon as `zhtp_quic_session_open`
    // returns since the FFI clones the inner identity.
    let temp_handle: *mut std::ffi::c_void = if alpn == 0 {
        ptr::null_mut()
    } else {
        let id = match unsafe { identity_ref(identity_handle) } {
            Some(i) => i,
            None => return 0,
        };
        let json = match serde_json::to_string(id) {
            Ok(s) => s,
            Err(_) => return 0,
        };
        let json_c = match CString::new(json) {
            Ok(c) => c,
            Err(_) => return 0,
        };
        let h = unsafe { zhtp_client_identity_deserialize(json_c.as_ptr()) };
        if h.is_null() {
            return 0;
        }
        h
    };

    let session = unsafe {
        zhtp_quic_session_open(
            host_c.as_ptr(),
            port as u16,
            ptr::null(),
            ptr::null(),
            alpn as u8,
            temp_handle as *const _,
        )
    };

    if !temp_handle.is_null() {
        unsafe { zhtp_client_identity_free(temp_handle) };
    }

    session as jlong
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_QuicSession_nativeSessionClose(
    _env: JNIEnv,
    _class: JClass,
    session: jlong,
) {
    if session == 0 {
        return;
    }
    unsafe { zhtp_quic_session_close(session as *mut _) };
}

// ── nativeSessionRpc ────────────────────────────────────────────────
//
// Returns ByteArray laid out as: [status_hi, status_lo, ...body].
// Null indicates a transport-fatal error.

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_QuicSession_nativeSessionRpc<'l>(
    mut env: JNIEnv<'l>,
    _class: JClass<'l>,
    session: jlong,
    method: JString<'l>,
    path: JString<'l>,
    body: JByteArray<'l>,
) -> jbyteArray {
    if session == 0 {
        return ptr::null_mut();
    }

    let method_c = match jstring_to_cstring(&mut env, &method) {
        Some(s) => s,
        None => return ptr::null_mut(),
    };
    let path_c = match jstring_to_cstring(&mut env, &path) {
        Some(s) => s,
        None => return ptr::null_mut(),
    };
    let body_bytes: Vec<u8> = env.convert_byte_array(&body).unwrap_or_default();

    let response = unsafe {
        zhtp_quic_session_rpc(
            session as *mut _,
            method_c.as_ptr(),
            path_c.as_ptr(),
            ptr::null(),
            if body_bytes.is_empty() {
                ptr::null()
            } else {
                body_bytes.as_ptr()
            },
            body_bytes.len(),
        )
    };
    if response.is_null() {
        return ptr::null_mut();
    }

    let status = unsafe { zhtp_quic_session_rpc_status(response) };
    let mut body_len: usize = 0;
    let body_ptr = unsafe { zhtp_quic_session_rpc_body(response, &mut body_len) };

    let mut out = Vec::with_capacity(2 + body_len);
    out.push((status >> 8) as u8);
    out.push((status & 0xff) as u8);
    if !body_ptr.is_null() && body_len > 0 {
        let slice = unsafe { std::slice::from_raw_parts(body_ptr, body_len) };
        out.extend_from_slice(slice);
    }

    unsafe { zhtp_quic_session_rpc_free(response) };

    env.byte_array_from_slice(&out)
        .map(|j| j.into_raw())
        .unwrap_or(ptr::null_mut())
}

// ── nativeInboundOpen ───────────────────────────────────────────────

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_QuicSession_nativeInboundOpen<'l>(
    mut env: JNIEnv<'l>,
    _class: JClass<'l>,
    session: jlong,
    path: JString<'l>,
) -> jlong {
    if session == 0 {
        return 0;
    }
    let path_c = match jstring_to_cstring(&mut env, &path) {
        Some(s) => s,
        None => return 0,
    };
    let stream = unsafe {
        zhtp_quic_session_inbound_open(session as *mut _, path_c.as_ptr())
    };
    stream as jlong
}

// ── nativeInboundRead ───────────────────────────────────────────────
//
// Returns:
//   - null      → stream closed by peer or transport error (terminal)
//   - empty[]   → timeout (no frame within timeoutMs)
//   - bytes     → one decoded envelope frame

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_QuicSession_nativeInboundRead<'l>(
    mut env: JNIEnv<'l>,
    _class: JClass<'l>,
    stream: jlong,
    timeout_ms: jint,
) -> jbyteArray {
    if stream == 0 {
        return ptr::null_mut();
    }

    let mut out_ptr: *const u8 = ptr::null();
    let mut out_len: usize = 0;
    let rc = unsafe {
        zhtp_quic_session_inbound_read(
            stream as *mut _,
            timeout_ms as u32,
            &mut out_ptr,
            &mut out_len,
        )
    };

    match rc {
        0 => {
            // success — copy the frame into a Java byte[] and free
            // the FFI-allocated buffer.
            let result = if !out_ptr.is_null() && out_len > 0 {
                let slice = unsafe { std::slice::from_raw_parts(out_ptr, out_len) };
                env.byte_array_from_slice(slice)
                    .map(|j| j.into_raw())
                    .unwrap_or(ptr::null_mut())
            } else {
                empty_byte_array(&mut env).into_raw()
            };
            unsafe { zhtp_quic_session_inbound_frame_free(out_ptr, out_len) };
            result
        }
        1 => empty_byte_array(&mut env).into_raw(),
        _ => ptr::null_mut(),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_QuicSession_nativeInboundClose(
    _env: JNIEnv,
    _class: JClass,
    stream: jlong,
) {
    if stream == 0 {
        return;
    }
    unsafe { zhtp_quic_session_inbound_close(stream as *mut _) };
}
