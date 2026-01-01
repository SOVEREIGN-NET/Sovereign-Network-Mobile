//! Authenticated ZHTP Request Handler
//!
//! Sends authenticated requests with UHP handshake and session management

use crate::zhtp_types::{ZhtpMethod, ZhtpRequestWire, ZhtpRequest, ZhtpHeaders};
use crate::zhtp_codec::{encode_request, decode_response};
use crate::zhtp_framing::{frame_encode, frame_decode_message};
use crate::zhtp_auth::{
    AuthSession, AuthContext, compute_canonical_request_hash, compute_request_mac,
    build_auth_context,
};
use quinn::Connection;
use anyhow::{anyhow, Result};
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

/// Send an authenticated ZHTP request
/// Requires an active AuthSession with valid credentials
pub async fn send_authenticated_zhtp_request(
    connection: &Connection,
    session: &mut AuthSession,
    method_str: &str,
    path: &str,
    headers: HashMap<String, String>,
    body: Option<Vec<u8>>,
    requester: String,
) -> Result<(u16, Vec<u8>)> {
    // Verify session is still valid
    if !session.is_valid() {
        return Err(anyhow!("Session invalid or expired"));
    }

    // Parse method string to ZhtpMethod
    let method = string_to_zhtp_method(method_str);
    let request_body = body.unwrap_or_default();

    // Extract content type and fees from headers
    let content_type = headers
        .get("content-type")
        .cloned()
        .unwrap_or_else(|| "application/json".to_string());

    let dao_fee = headers
        .get("dao_fee")
        .and_then(|f| f.parse::<u64>().ok())
        .unwrap_or(0);

    let total_fees = headers
        .get("total_fees")
        .and_then(|f| f.parse::<u64>().ok())
        .unwrap_or(dao_fee);

    // Generate request ID and timestamps
    let request_id = generate_request_id();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let timestamp = now.as_secs();
    let timestamp_ms = now.as_millis() as u64;

    // Build request headers
    let request_headers = ZhtpHeaders {
        content_type: Some(content_type),
        content_length: Some(request_body.len() as u64),
        dao_fee,
        total_fees,
        content_encoding: headers.get("content-encoding").cloned(),
        cache_control: headers.get("cache-control").cloned(),
        network_fee: headers
            .get("network_fee")
            .and_then(|f| f.parse::<u64>().ok()),
        priority: headers
            .get("priority")
            .and_then(|p| p.parse::<u8>().ok()),
    };

    // Compute canonical request hash
    let canonical_hash =
        compute_canonical_request_hash(&request_id, timestamp_ms, method, path, &request_headers, &request_body);

    // Build auth context
    let auth_context = build_auth_context(session, &canonical_hash)?;
    log::info!(
        "[ZHTP Auth] Sequence: {}, MAC computed",
        auth_context.sequence
    );

    // Update session's last activity
    session.touch();

    // Build ZhtpRequest with authenticated fields
    let zhtp_request = ZhtpRequest {
        method,
        uri: path.to_string(),
        version: "1.0".to_string(),
        headers: request_headers,
        body: request_body,
        timestamp,
        requester: Some(requester),
        auth_proof: None, // Can be filled in with zero-knowledge proofs if needed
    };

    // Build ZhtpRequestWire with auth_context
    let request_wire = ZhtpRequestWire {
        version: 1,
        request_id: request_id.to_vec(),
        timestamp_ms,
        auth_context: Some(serde_json::to_value(auth_context)?),
        request: zhtp_request,
    };

    log::info!("[ZHTP Auth] Sending authenticated {} {}", method_str, path);

    // Encode to CBOR
    let cbor_data = encode_request(&request_wire)?;
    log::info!("[ZHTP Auth] CBOR encoded: {} bytes", cbor_data.len());

    // Frame it (add 4-byte length prefix)
    let framed_data = frame_encode(&cbor_data)?;
    log::info!("[ZHTP Auth] Framed: {} bytes", framed_data.len());

    // Open bidirectional stream
    let (mut send, mut recv) = connection.open_bi().await?;

    // Send framed request
    send.write_all(&framed_data).await?;
    send.finish()?;
    log::info!("[ZHTP Auth] Authenticated request sent");

    // Receive response
    let response_data = recv.read_to_end(16 * 1024 * 1024).await?; // 16MB max
    log::info!("[ZHTP Auth] Received {} bytes", response_data.len());

    // Unframe response
    let (payload, _) = frame_decode_message(&response_data)?;
    log::info!("[ZHTP Auth] Unframed: {} bytes", payload.len());

    // Decode CBOR to ZhtpResponseWire
    let response = decode_response(&payload)?;
    log::info!("[ZHTP Auth] Response status: {}", response.status);

    // Verify response request_id matches
    if response.request_id != request_id {
        return Err(anyhow!(
            "Response request_id mismatch: got {:?}, expected {:?}",
            response.request_id,
            request_id
        ));
    }

    // Extract body from nested response structure
    Ok((response.status, response.response.body.to_vec()))
}

/// Generate a random 16-byte request ID
fn generate_request_id() -> [u8; 16] {
    let mut request_id = [0u8; 16];
    use std::io::Read;
    let _ = std::fs::File::open("/dev/urandom")
        .and_then(|mut f| f.read_exact(&mut request_id).map(|_| ()));
    // Fallback if /dev/urandom fails
    if request_id.iter().all(|&b| b == 0) {
        for i in 0..16 {
            request_id[i] = (i as u8).wrapping_mul(31);
        }
    }
    request_id
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
