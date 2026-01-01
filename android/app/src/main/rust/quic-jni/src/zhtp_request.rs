//! ZHTP Request Handler - Public Mode
//!
//! Sends ZHTP-formatted requests over QUIC instead of HTTP/1.1

use crate::zhtp_types::{ZhtpMethod, ZhtpRequestWire};
use crate::zhtp_codec::{encode_request, decode_response};
use crate::zhtp_framing::{frame_encode, frame_decode_message};
use quinn::{Connection, SendStream, RecvStream};
use anyhow::Result;
use std::collections::HashMap;

/// Send ZHTP request and receive response
pub async fn send_zhtp_request(
    connection: &Connection,
    method_str: &str,
    path: &str,
    headers: HashMap<String, String>,
    body: Option<Vec<u8>>,
) -> Result<(u16, Vec<u8>)> {
    // Parse method string to ZhtpMethod
    let method = string_to_zhtp_method(method_str);
    let request_body = body.unwrap_or_default();

    // Get content type from headers or use default
    let content_type = headers
        .get("content-type")
        .cloned()
        .unwrap_or_else(|| "application/json".to_string());

    // Create ZHTP request
    let zhtp_request = ZhtpRequestWire::new_public(
        method,
        path.to_string(),
        content_type,
        request_body,
    );

    log::info!("[ZHTP] Sending {} {}", method_str, path);

    // Encode to CBOR
    let cbor_data = encode_request(&zhtp_request)?;
    log::info!("[ZHTP] CBOR encoded: {} bytes", cbor_data.len());

    // Frame it (add 4-byte length prefix)
    let framed_data = frame_encode(&cbor_data)?;
    log::info!("[ZHTP] Framed: {} bytes", framed_data.len());

    // Open bidirectional stream
    let (mut send, mut recv) = connection.open_bi().await?;

    // Send framed request
    send.write_all(&framed_data).await?;
    send.finish()?;
    log::info!("[ZHTP] Request sent");

    // Receive response
    let response_data = recv.read_to_end(16 * 1024 * 1024).await?; // 16MB max
    log::info!("[ZHTP] Received {} bytes", response_data.len());

    // Unframe response
    let (payload, _) = frame_decode_message(&response_data)?;
    log::info!("[ZHTP] Unframed: {} bytes", payload.len());

    // Decode CBOR to ZhtpResponseWire
    let response = decode_response(&payload)?;
    log::info!("[ZHTP] Response status: {}", response.status);

    // Extract body from nested response structure
    Ok((response.status, response.response.body.to_vec()))
}

/// Convert HTTP method string to ZhtpMethod
fn string_to_zhtp_method(method: &str) -> ZhtpMethod {
    match method.to_uppercase().as_str() {
        "GET" => ZhtpMethod::Get,
        "POST" => ZhtpMethod::Post,
        "PUT" => ZhtpMethod::Put,
        "DELETE" => ZhtpMethod::Delete,
        "OPTIONS" => ZhtpMethod::Options,
        "HEAD" => ZhtpMethod::Head,
        "PATCH" => ZhtpMethod::Patch,
        "VERIFY" => ZhtpMethod::Verify,
        "CONNECT" => ZhtpMethod::Connect,
        "TRACE" => ZhtpMethod::Trace,
        _ => ZhtpMethod::Get,
    }
}
