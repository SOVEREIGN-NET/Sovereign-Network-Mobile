//! ZHTP Request Handler - Public Mode
//!
//! Sends ZHTP-formatted requests over QUIC instead of HTTP/1.1

use crate::zhtp_types::ZhtpMethod;
use crate::zhtp_codec::{encode_public_request, decode_response};
use crate::zhtp_framing::{decode_wire_or_frame_message, wire_encode};
use crate::zhtp_types::{ZhtpHeaders, ZhtpRequest};
use quinn::Connection;
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

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let zhtp_request = ZhtpRequest {
        method,
        uri: path.to_string(),
        version: "1.0".to_string(),
        headers: ZhtpHeaders {
            content_type: Some(content_type),
            content_length: Some(request_body.len() as u64),
            dao_fee: 0,
            total_fees: 0,
            content_encoding: None,
            cache_control: None,
            network_fee: None,
            priority: None,
        },
        body: request_body,
        timestamp,
        requester: None,
        auth_proof: None,
    };

    log::info!("[🌐 Web4] [ZHTP] Sending {} {}", method_str, path);

    // Encode to CBOR
    let cbor_data = encode_public_request(&zhtp_request)?;
    let cbor_prefix = hex_prefix(&cbor_data, 16);
    log::info!("[🌐 Web4] [ZHTP] CBOR encoded: {} bytes, hex[0..16]={}", cbor_data.len(), cbor_prefix);

    // Wire encode: magic + version + length + CBOR (public mode)
    let framed_data = wire_encode(&cbor_data)?;
    let wire_prefix = hex_prefix(&framed_data, 16);
    log::info!("[🌐 Web4] [ZHTP] Wire encoded: {} bytes, hex[0..16]={}", framed_data.len(), wire_prefix);

    // Open bidirectional stream
    let (mut send, mut recv) = connection.open_bi().await?;

    // Send framed request
    send.write_all(&framed_data).await?;
    send.finish()?;
    log::info!("[ZHTP] Request sent");

    // Receive response
    let response_data = recv.read_to_end(16 * 1024 * 1024).await?; // 16MB max
    let resp_prefix = hex_prefix(&response_data, 16);
    log::info!("[🌐 Web4] [ZHTP] Received {} bytes, hex[0..16]={}", response_data.len(), resp_prefix);

    // Unframe response (wire or length-prefixed)
    let (payload, _) = decode_wire_or_frame_message(&response_data)?;
    let payload_prefix = hex_prefix(&payload, 16);
    log::info!("[🌐 Web4] [ZHTP] Unframed: {} bytes, hex[0..16]={}", payload.len(), payload_prefix);

    // Decode CBOR to ZhtpResponseWire
    let response = decode_response(&payload)?;
    log::info!("[ZHTP] Response status: {}", response.status);

    // Extract body from nested response structure
    Ok((response.status, response.response.body.to_vec()))
}

fn hex_prefix(bytes: &[u8], len: usize) -> String {
    bytes.iter().take(len).map(|b| format!("{:02x}", b)).collect()
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
