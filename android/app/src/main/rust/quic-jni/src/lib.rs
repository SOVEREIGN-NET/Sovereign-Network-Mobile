//! Native QUIC JNI bindings for Android using Quinn
//!
//! This library provides QUIC connectivity with support for self-signed certificates
//! by disabling X.509 validation (appropriate for development/testing with self-signed certs)

use jni::objects::{JByteArray, JClass, JObject, JString, JValue};
use jni::sys::{jboolean, jint, jobject, JNI_FALSE, JNI_TRUE};
use jni::JNIEnv;
use std::collections::HashMap;
use std::future::IntoFuture;
use std::sync::Arc;
use std::time::Duration;
use tokio::runtime::Runtime;
use tokio::sync::Mutex;

mod quic_client;
use quic_client::{QuicBytesResponse, QuicClient, QuicResponse};

// ZHTP Protocol (Public + Authenticated Modes)
mod zhtp_types;
mod zhtp_framing;
mod zhtp_codec;
mod zhtp_request;
mod zhtp_auth;
mod zhtp_auth_request;
use zhtp_request::send_zhtp_request;
use zhtp_auth_request::send_authenticated_zhtp_request;

// Global state for the QUIC client
static mut RUNTIME: Option<Runtime> = None;
static mut CLIENT: Option<Arc<Mutex<QuicClient>>> = None;

/// Initialize the native library
#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_NativeQuicBridge_nativeInit(
    _env: JNIEnv,
    _class: JClass,
) -> jboolean {
    // Initialize Android logger
    android_logger::init_once(
        android_logger::Config::default()
            .with_max_level(log::LevelFilter::Debug)
            .with_tag("NativeQuicRust"),
    );

    log::info!("Initializing Quinn QUIC native library");

    unsafe {
        // Create tokio runtime
        match Runtime::new() {
            Ok(rt) => {
                RUNTIME = Some(rt);
                log::info!("Tokio runtime initialized");
            }
            Err(e) => {
                log::error!("Failed to create runtime: {}", e);
                return JNI_FALSE;
            }
        }

        // Create QUIC client
        CLIENT = Some(Arc::new(Mutex::new(QuicClient::new())));
        log::info!("QUIC client initialized");
    }

    JNI_TRUE
}

/// Check if QUIC is supported
#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_NativeQuicBridge_nativeIsSupported(
    _env: JNIEnv,
    _class: JClass,
) -> jboolean {
    JNI_TRUE
}

/// Check UDP reachability to a host:port
#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_NativeQuicBridge_nativeCheckReachability<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    host: JString<'local>,
    port: jint,
) -> jobject {
    let host_str: String = match env.get_string(&host) {
        Ok(s) => s.into(),
        Err(e) => {
            log::error!("Failed to get host string: {}", e);
            return std::ptr::null_mut();
        }
    };

    log::info!("Checking reachability to {}:{}", host_str, port);

    let result = unsafe {
        if let Some(ref rt) = RUNTIME {
            rt.block_on(async { quic_client::check_udp_reachability(&host_str, port as u16).await })
        } else {
            Err("Runtime not initialized".into())
        }
    };

    create_result_map(&mut env, result)
}

/// Test QUIC connection to a server
#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_NativeQuicBridge_nativeTestConnection<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    host: JString<'local>,
    port: jint,
) -> jobject {
    let host_str: String = match env.get_string(&host) {
        Ok(s) => s.into(),
        Err(e) => {
            log::error!("Failed to get host string: {}", e);
            return std::ptr::null_mut();
        }
    };

    log::info!("Testing QUIC connection to {}:{}", host_str, port);

    let result = unsafe {
        if let (Some(ref rt), Some(ref client)) = (&RUNTIME, &CLIENT) {
            rt.block_on(async {
                let client = client.lock().await;
                client.test_connection(&host_str, port as u16).await
            })
        } else {
            Err("Runtime or client not initialized".into())
        }
    };

    create_connection_result_map(&mut env, result)
}

/// Make an HTTP request over QUIC
#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_NativeQuicBridge_nativeRequest<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    url: JString<'local>,
    method: JString<'local>,
    headers_json: JString<'local>,
    body: JString<'local>,
    timeout_secs: jint,
    insecure: jboolean,
    alpn: JString<'local>,
) -> jobject {
    let url_str: String = match env.get_string(&url) {
        Ok(s) => s.into(),
        Err(e) => {
            log::error!("Failed to get URL string: {}", e);
            return std::ptr::null_mut();
        }
    };

    let method_str: String = match env.get_string(&method) {
        Ok(s) => s.into(),
        Err(_) => "GET".to_string(),
    };

    let headers_str: String = match env.get_string(&headers_json) {
        Ok(s) => s.into(),
        Err(_) => "{}".to_string(),
    };

    let body_str: Option<String> = match env.get_string(&body) {
        Ok(s) => {
            let s: String = s.into();
            if s.is_empty() {
                None
            } else {
                Some(s)
            }
        }
        Err(_) => None,
    };

    let headers: HashMap<String, String> = serde_json::from_str(&headers_str).unwrap_or_default();
    let insecure_bool = insecure == JNI_TRUE;

    let alpn_str: String = match env.get_string(&alpn) {
        Ok(s) => s.into(),
        Err(_) => "authenticated".to_string(),
    };

    log::info!(
        "QUIC request: {} {} (insecure={}, alpn={})",
        method_str,
        url_str,
        insecure_bool,
        alpn_str
    );

    let result = unsafe {
        if let Some(ref rt) = RUNTIME {
            rt.block_on(async {
                // Create QUIC connection and send ZHTP request
                use std::net::SocketAddr;
                let addr: SocketAddr = match format!("localhost:443").parse() {
                    Ok(a) => a,
                    Err(e) => return Err(format!("Invalid address: {}", e).into()),
                };

                // Parse URL to get host and port
                use crate::quic_client::parse_quic_url;
                let (host, port, path) = parse_quic_url(&url_str)?;
                let addr: SocketAddr = format!("{}:{}", host, port).parse()?;

                let client_config = if insecure_bool {
                    crate::quic_client::create_insecure_client_config()?
                } else {
                    crate::quic_client::create_default_client_config()?
                };

                let mut endpoint = quinn::Endpoint::client("0.0.0.0:0".parse()?)?;
                endpoint.set_default_client_config(client_config);

                let connection = tokio::time::timeout(
                    Duration::from_secs(timeout_secs as u64),
                    endpoint.connect(addr, &host)?.into_future(),
                )
                    .await
                    .map_err(|_| "Connection timeout")??;

                // Send ZHTP request (select handler based on ALPN mode)
                let (status, body) = match alpn_str.as_str() {
                    "public" => send_zhtp_request(&connection, &method_str, &path, headers, body_str.map(|s| s.into_bytes())).await?,
                    _ => send_authenticated_zhtp_request(&connection, &method_str, &path, headers, body_str.map(|s| s.into_bytes())).await?,
                };

                connection.close(0u32.into(), b"done");
                endpoint.wait_idle().await;

                Ok((status, body))
            })
        } else {
            Err("Runtime not initialized".into())
        }
    };

    // Convert result to response map
    let response_result = result.map(|(status, body)| {
        (
            status as i32,
            "",
            String::from_utf8_lossy(&body).to_string(),
            true,
        )
    });

    create_zhtp_response_map(&mut env, response_result)
}

/// Make an HTTP request over QUIC returning raw bytes
#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_NativeQuicBridge_nativeRequestBytes<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    url: JString<'local>,
    method: JString<'local>,
    headers_json: JString<'local>,
    body: JByteArray<'local>,
    timeout_secs: jint,
    insecure: jboolean,
    alpn: JString<'local>,
) -> jobject {
    let url_str: String = match env.get_string(&url) {
        Ok(s) => s.into(),
        Err(e) => {
            log::error!("Failed to get URL string: {}", e);
            return std::ptr::null_mut();
        }
    };

    let method_str: String = match env.get_string(&method) {
        Ok(s) => s.into(),
        Err(_) => "GET".to_string(),
    };

    let headers_str: String = match env.get_string(&headers_json) {
        Ok(s) => s.into(),
        Err(_) => "{}".to_string(),
    };

    let headers: HashMap<String, String> = serde_json::from_str(&headers_str).unwrap_or_default();

    let body_vec: Option<Vec<u8>> = match env.convert_byte_array(&body) {
        Ok(bytes) => {
            if bytes.is_empty() {
                None
            } else {
                Some(bytes)
            }
        }
        Err(_) => None,
    };

    let insecure_bool = insecure == JNI_TRUE;

    let alpn_str: String = match env.get_string(&alpn) {
        Ok(s) => s.into(),
        Err(_) => "authenticated".to_string(),
    };

    log::info!(
        "QUIC bytes request: {} {} (insecure={}, alpn={})",
        method_str,
        url_str,
        insecure_bool,
        alpn_str
    );

    let result = unsafe {
        if let Some(ref rt) = RUNTIME {
            rt.block_on(async {
                // Create QUIC connection and send ZHTP request
                use crate::quic_client::parse_quic_url;
                let (host, port, path) = parse_quic_url(&url_str)?;
                let addr: std::net::SocketAddr = format!("{}:{}", host, port).parse()?;

                let client_config = if insecure_bool {
                    crate::quic_client::create_insecure_client_config()?
                } else {
                    crate::quic_client::create_default_client_config()?
                };

                let mut endpoint = quinn::Endpoint::client("0.0.0.0:0".parse()?)?;
                endpoint.set_default_client_config(client_config);

                let connection = tokio::time::timeout(
                    Duration::from_secs(timeout_secs as u64),
                    endpoint.connect(addr, &host)?.into_future(),
                )
                    .await
                    .map_err(|_| "Connection timeout")??;

                // Send ZHTP request (select handler based on ALPN mode)
                let (status, body) = match alpn_str.as_str() {
                    "public" => send_zhtp_request(&connection, &method_str, &path, headers, body_vec).await?,
                    _ => send_authenticated_zhtp_request(&connection, &method_str, &path, headers, body_vec).await?,
                };

                connection.close(0u32.into(), b"done");
                endpoint.wait_idle().await;

                Ok((status, body))
            })
        } else {
            Err("Runtime not initialized".into())
        }
    };

    // Convert result to bytes response map
    let bytes_result = result.map(|(status, body)| {
        (status as i32, "", body, true)
    });

    create_zhtp_bytes_response_map(&mut env, bytes_result)
}

/// Cancel all active requests
#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_NativeQuicBridge_nativeCancelAll(
    _env: JNIEnv,
    _class: JClass,
) -> jboolean {
    log::info!("Cancelling all QUIC requests");

    unsafe {
        if let Some(ref client) = CLIENT {
            if let Some(ref rt) = RUNTIME {
                rt.block_on(async {
                    let mut client = client.lock().await;
                    client.cancel_all();
                });
            }
        }
    }

    JNI_TRUE
}

/// Cleanup and shutdown
#[no_mangle]
pub extern "system" fn Java_com_sovereignnetworkmobile_NativeQuicBridge_nativeShutdown(
    _env: JNIEnv,
    _class: JClass,
) {
    log::info!("Shutting down QUIC native library");

    unsafe {
        CLIENT = None;
        RUNTIME = None;
    }
}

// Helper to create a HashMap result for reachability
fn create_result_map<'local>(
    env: &mut JNIEnv<'local>,
    result: Result<(bool, f64), Box<dyn std::error::Error + Send + Sync>>,
) -> jobject {
    let hash_map_class = match env.find_class("java/util/HashMap") {
        Ok(c) => c,
        Err(_) => return std::ptr::null_mut(),
    };

    let map = match env.new_object(&hash_map_class, "()V", &[]) {
        Ok(m) => m,
        Err(_) => return std::ptr::null_mut(),
    };

    match result {
        Ok((reachable, latency_ms)) => {
            put_boolean(env, &map, "reachable", reachable);
            put_double(env, &map, "latencyMs", latency_ms);
        }
        Err(e) => {
            put_boolean(env, &map, "reachable", false);
            put_string(env, &map, "error", &e.to_string());
        }
    }

    map.into_raw()
}

// Helper to create a HashMap result for connection test
fn create_connection_result_map<'local>(
    env: &mut JNIEnv<'local>,
    result: Result<(bool, f64, String), Box<dyn std::error::Error + Send + Sync>>,
) -> jobject {
    let hash_map_class = match env.find_class("java/util/HashMap") {
        Ok(c) => c,
        Err(_) => return std::ptr::null_mut(),
    };

    let map = match env.new_object(&hash_map_class, "()V", &[]) {
        Ok(m) => m,
        Err(_) => return std::ptr::null_mut(),
    };

    match result {
        Ok((success, latency_ms, protocol)) => {
            put_boolean(env, &map, "success", success);
            put_double(env, &map, "latencyMs", latency_ms);
            put_string(env, &map, "protocol", &protocol);
        }
        Err(e) => {
            put_boolean(env, &map, "success", false);
            put_string(env, &map, "error", &e.to_string());
        }
    }

    map.into_raw()
}

// Helper to create a HashMap result for HTTP response
fn create_response_map<'local>(
    env: &mut JNIEnv<'local>,
    result: Result<QuicResponse, Box<dyn std::error::Error + Send + Sync>>,
) -> jobject {
    let hash_map_class = match env.find_class("java/util/HashMap") {
        Ok(c) => c,
        Err(_) => return std::ptr::null_mut(),
    };

    let map = match env.new_object(&hash_map_class, "()V", &[]) {
        Ok(m) => m,
        Err(_) => return std::ptr::null_mut(),
    };

    match result {
        Ok(response) => {
            put_int(env, &map, "status", response.status as i32);
            put_string(env, &map, "statusText", &response.status_text);
            put_string(env, &map, "body", &response.body);
            put_boolean(env, &map, "ok", response.ok);

            // Convert headers to JSON string
            let headers_json = serde_json::to_string(&response.headers).unwrap_or_default();
            put_string(env, &map, "headersJson", &headers_json);
        }
        Err(e) => {
            put_int(env, &map, "status", 0);
            put_boolean(env, &map, "ok", false);
            put_string(env, &map, "error", &e.to_string());
        }
    }

    map.into_raw()
}

/// Helper to create a HashMap result for HTTP response with raw bytes
fn create_bytes_response_map<'local>(
    env: &mut JNIEnv<'local>,
    result: Result<QuicBytesResponse, Box<dyn std::error::Error + Send + Sync>>,
) -> jobject {
    let hash_map_class = match env.find_class("java/util/HashMap") {
        Ok(c) => c,
        Err(_) => return std::ptr::null_mut(),
    };

    let map = match env.new_object(&hash_map_class, "()V", &[]) {
        Ok(m) => m,
        Err(_) => return std::ptr::null_mut(),
    };

    match result {
        Ok(response) => {
            put_int(env, &map, "status", response.status as i32);
            put_string(env, &map, "statusText", &response.status_text);
            put_boolean(env, &map, "ok", response.ok);

            // Convert headers to JSON string
            let headers_json = serde_json::to_string(&response.headers).unwrap_or_default();
            put_string(env, &map, "headersJson", &headers_json);

            // Body as byte array
            if let Ok(byte_array) = env.byte_array_from_slice(&response.body) {
                if let Ok(key_str) = env.new_string("body") {
                    let _ = env.call_method(
                        &map,
                        "put",
                        "(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;",
                        &[JValue::Object(&key_str.into()), JValue::Object(&byte_array.into())],
                    );
                }
            }
        }
        Err(e) => {
            put_int(env, &map, "status", 0);
            put_boolean(env, &map, "ok", false);
            put_string(env, &map, "error", &e.to_string());
        }
    }

    map.into_raw()
}

// Helper to create a HashMap result for ZHTP response
fn create_zhtp_response_map<'local>(
    env: &mut JNIEnv<'local>,
    result: Result<(i32, &str, String, bool), Box<dyn std::error::Error + Send + Sync>>,
) -> jobject {
    let hash_map_class = match env.find_class("java/util/HashMap") {
        Ok(c) => c,
        Err(_) => return std::ptr::null_mut(),
    };

    let map = match env.new_object(&hash_map_class, "()V", &[]) {
        Ok(m) => m,
        Err(_) => return std::ptr::null_mut(),
    };

    match result {
        Ok((status, _status_text, body, ok)) => {
            put_int(env, &map, "status", status);
            put_string(env, &map, "statusText", if ok { "OK" } else { "Error" });
            put_string(env, &map, "body", &body);
            put_boolean(env, &map, "ok", ok);
        }
        Err(e) => {
            put_int(env, &map, "status", 0);
            put_boolean(env, &map, "ok", false);
            put_string(env, &map, "error", &e.to_string());
        }
    }

    map.into_raw()
}

// Helper to create a HashMap result for ZHTP bytes response
fn create_zhtp_bytes_response_map<'local>(
    env: &mut JNIEnv<'local>,
    result: Result<(i32, &str, Vec<u8>, bool), Box<dyn std::error::Error + Send + Sync>>,
) -> jobject {
    let hash_map_class = match env.find_class("java/util/HashMap") {
        Ok(c) => c,
        Err(_) => return std::ptr::null_mut(),
    };

    let map = match env.new_object(&hash_map_class, "()V", &[]) {
        Ok(m) => m,
        Err(_) => return std::ptr::null_mut(),
    };

    match result {
        Ok((status, _status_text, body, ok)) => {
            put_int(env, &map, "status", status);
            put_string(env, &map, "statusText", if ok { "OK" } else { "Error" });
            put_boolean(env, &map, "ok", ok);

            // Body as byte array
            if let Ok(byte_array) = env.byte_array_from_slice(&body) {
                if let Ok(key_str) = env.new_string("body") {
                    let _ = env.call_method(
                        &map,
                        "put",
                        "(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;",
                        &[JValue::Object(&key_str.into()), JValue::Object(&byte_array.into())],
                    );
                }
            }
        }
        Err(e) => {
            put_int(env, &map, "status", 0);
            put_boolean(env, &map, "ok", false);
            put_string(env, &map, "error", &e.to_string());
        }
    }

    map.into_raw()
}

// Helper functions to put values into HashMap
fn put_boolean(env: &mut JNIEnv, map: &JObject, key: &str, value: bool) {
    if let Ok(key_str) = env.new_string(key) {
        if let Ok(bool_class) = env.find_class("java/lang/Boolean") {
            if let Ok(bool_obj) = env.call_static_method(
                &bool_class,
                "valueOf",
                "(Z)Ljava/lang/Boolean;",
                &[JValue::Bool(if value { 1 } else { 0 })],
            ) {
                if let Ok(bool_obj) = bool_obj.l() {
                    let _ = env.call_method(
                        map,
                        "put",
                        "(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;",
                        &[JValue::Object(&key_str.into()), JValue::Object(&bool_obj)],
                    );
                }
            }
        }
    }
}

fn put_double(env: &mut JNIEnv, map: &JObject, key: &str, value: f64) {
    if let Ok(key_str) = env.new_string(key) {
        if let Ok(double_class) = env.find_class("java/lang/Double") {
            if let Ok(double_obj) = env.call_static_method(
                &double_class,
                "valueOf",
                "(D)Ljava/lang/Double;",
                &[JValue::Double(value)],
            ) {
                if let Ok(double_obj) = double_obj.l() {
                    let _ = env.call_method(
                        map,
                        "put",
                        "(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;",
                        &[JValue::Object(&key_str.into()), JValue::Object(&double_obj)],
                    );
                }
            }
        }
    }
}

fn put_int(env: &mut JNIEnv, map: &JObject, key: &str, value: i32) {
    if let Ok(key_str) = env.new_string(key) {
        if let Ok(int_class) = env.find_class("java/lang/Integer") {
            if let Ok(int_obj) = env.call_static_method(
                &int_class,
                "valueOf",
                "(I)Ljava/lang/Integer;",
                &[JValue::Int(value)],
            ) {
                if let Ok(int_obj) = int_obj.l() {
                    let _ = env.call_method(
                        map,
                        "put",
                        "(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;",
                        &[JValue::Object(&key_str.into()), JValue::Object(&int_obj)],
                    );
                }
            }
        }
    }
}

fn put_string(env: &mut JNIEnv, map: &JObject, key: &str, value: &str) {
    if let Ok(key_str) = env.new_string(key) {
        if let Ok(value_str) = env.new_string(value) {
            let _ = env.call_method(
                map,
                "put",
                "(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;",
                &[
                    JValue::Object(&key_str.into()),
                    JValue::Object(&value_str.into()),
                ],
            );
        }
    }
}
