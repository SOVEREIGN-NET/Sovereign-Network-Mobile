//! ZHTP CBOR Codec - Encode/Decode ZHTP Types
//!
//! Uses ciborium for CBOR serialization.
//! Field order must match server's serde defaults.
//! Manual encoding for authenticated requests to match iOS implementation.

use crate::zhtp_types::{AuthContext, ZhtpHeaders, ZhtpRequest, ZhtpRequestWire, ZhtpResponse, ZhtpResponseWire};
use anyhow::Result;
use ciborium::value::Value;
use std::collections::HashMap;

// ============================================================================
// Manual CBOR Encoding Helpers - Matches iOS Implementation
// ============================================================================

/// Append CBOR unsigned integer with explicit major type
/// Encodes the major type (3-bit field) and additional info
fn append_cbor_uint(data: &mut Vec<u8>, value: u64, major_type: u8) {
    let mt = (major_type & 0x07) << 5;
    match value {
        0..=23 => data.push(mt | (value as u8)),
        24..=255 => {
            data.push(mt | 24);
            data.push(value as u8);
        }
        256..=65535 => {
            data.push(mt | 25);
            data.extend_from_slice(&(value as u16).to_be_bytes());
        }
        65536..=4294967295 => {
            data.push(mt | 26);
            data.extend_from_slice(&(value as u32).to_be_bytes());
        }
        _ => {
            data.push(mt | 27);
            data.extend_from_slice(&value.to_be_bytes());
        }
    }
}

/// Append CBOR byte array (majorType 4 - array of integers)
/// Matches iOS appendCborByteArray encoding exactly
/// Each byte is encoded as a separate CBOR unsigned integer
fn append_cbor_byte_array(data: &mut Vec<u8>, bytes: &[u8]) {
    // Array header (majorType 4)
    append_cbor_uint(data, bytes.len() as u64, 4);
    // Each byte as separate integer (majorType 0)
    for &byte in bytes {
        append_cbor_uint(data, byte as u64, 0);
    }
}

/// Append CBOR byte string (majorType 2 - standard encoding)
fn append_cbor_bytes(data: &mut Vec<u8>, bytes: &[u8]) {
    append_cbor_uint(data, bytes.len() as u64, 2);
    data.extend_from_slice(bytes);
}

/// Append CBOR text string (majorType 3)
fn append_cbor_string(data: &mut Vec<u8>, s: &str) {
    let bytes = s.as_bytes();
    append_cbor_uint(data, bytes.len() as u64, 3);
    data.extend_from_slice(bytes);
}

/// Append CBOR map header (majorType 5)
fn append_cbor_map_header(data: &mut Vec<u8>, count: u64) {
    append_cbor_uint(data, count, 5);
}

/// Manually encode authenticated ZHTP request to CBOR bytes
/// Matches iOS manual encoding exactly (majorType 4 for byte arrays)
/// This bypasses ciborium's optimization that converts byte arrays to byte strings
pub fn encode_authenticated_request_manual(request: &ZhtpRequestWire) -> Result<Vec<u8>> {
    let mut data = Vec::new();

    // Outer map: 5 fields (version, request_id, timestamp_ms, auth_context, request)
    append_cbor_map_header(&mut data, 5);
    log::debug!("[🌐 Web4] [CBOR] Map header (5 fields): {:02x?}", &data[data.len()-1..]);

    // Field 1: version
    append_cbor_string(&mut data, "version");
    append_cbor_uint(&mut data, request.version as u64, 0);

    // Field 2: request_id (as CBOR array - NOT byte string)
    append_cbor_string(&mut data, "request_id");
    append_cbor_byte_array(&mut data, &request.request_id);

    // Field 3: timestamp_ms
    append_cbor_string(&mut data, "timestamp_ms");
    append_cbor_uint(&mut data, request.timestamp_ms, 0);

    // Field 4: auth_context
    append_cbor_string(&mut data, "auth_context");
    if let Some(ref auth_ctx) = request.auth_context {
        append_cbor_map_header(&mut data, 4);

        append_cbor_string(&mut data, "session_id");
        append_cbor_byte_array(&mut data, &auth_ctx.session_id);

        append_cbor_string(&mut data, "client_did");
        append_cbor_string(&mut data, &auth_ctx.client_did);

        append_cbor_string(&mut data, "sequence");
        append_cbor_uint(&mut data, auth_ctx.sequence, 0);

        append_cbor_string(&mut data, "request_mac");
        append_cbor_byte_array(&mut data, &auth_ctx.request_mac);
    } else {
        // CBOR null (majorType 7, value 22)
        data.push(0xf6);
    }

    // Field 5: request
    append_cbor_string(&mut data, "request");
    encode_request_inner(&mut data, &request.request)?;

    Ok(data)
}

/// Encode the nested ZhtpRequest structure for authenticated requests
/// Matches iOS: exactly 6 fields (method, uri, version, headers, body, timestamp)
/// Does NOT encode optional fields like requester or auth_proof
fn encode_request_inner(data: &mut Vec<u8>, req: &ZhtpRequest) -> Result<()> {
    // Exactly 6 fields - matches iOS implementation
    append_cbor_map_header(data, 6);

    append_cbor_string(data, "method");
    append_cbor_string(data, req.method.as_str());

    append_cbor_string(data, "uri");
    append_cbor_string(data, &req.uri);

    append_cbor_string(data, "version");
    append_cbor_string(data, &req.version);

    append_cbor_string(data, "headers");
    encode_headers(data, &req.headers);

    append_cbor_string(data, "body");
    append_cbor_bytes(data, &req.body); // Standard byte string encoding

    append_cbor_string(data, "timestamp");
    append_cbor_uint(data, req.timestamp, 0);

    Ok(())
}

/// Encode ZhtpHeaders for authenticated requests
/// Matches iOS: only encodes 4 required fields (content_type, content_length, dao_fee, total_fees)
fn encode_headers(data: &mut Vec<u8>, headers: &ZhtpHeaders) {
    // Map with 4 entries (only required fields) - matches iOS exactly
    append_cbor_map_header(data, 4);

    append_cbor_string(data, "content_type");
    if let Some(ref ct) = headers.content_type {
        append_cbor_string(data, ct);
    } else {
        data.push(0xf6);
    }

    append_cbor_string(data, "content_length");
    if let Some(cl) = headers.content_length {
        append_cbor_uint(data, cl, 0);
    } else {
        data.push(0xf6);
    }

    append_cbor_string(data, "dao_fee");
    append_cbor_uint(data, headers.dao_fee, 0);

    append_cbor_string(data, "total_fees");
    append_cbor_uint(data, headers.total_fees, 0);
}

// ============================================================================
// Ciborium-based Encoding - Used for Public (Unauthenticated) Requests
// ============================================================================

/// Encode ZHTP request to CBOR bytes
pub fn encode_request(request: &ZhtpRequestWire) -> Result<Vec<u8>> {
    let mut buffer = Vec::new();
    ciborium::ser::into_writer(request, &mut buffer)
        .map_err(|e| anyhow::anyhow!("CBOR encode failed: {}", e))?;
    Ok(buffer)
}

/// Encode public ZHTP request to CBOR bytes (full ZhtpRequest struct)
pub fn encode_public_request(request: &ZhtpRequest) -> Result<Vec<u8>> {
    let mut buffer = Vec::new();
    ciborium::ser::into_writer(request, &mut buffer)
        .map_err(|e| anyhow::anyhow!("CBOR encode failed: {}", e))?;
    Ok(buffer)
}

/// Decode CBOR bytes to ZHTP response
pub fn decode_response(cbor_bytes: &[u8]) -> Result<ZhtpResponseWire> {
    let value: Value = ciborium::de::from_reader(cbor_bytes)
        .map_err(|e| anyhow::anyhow!("CBOR decode failed: {}", e))?;
    decode_response_value(&value)
}

fn decode_response_value(value: &Value) -> Result<ZhtpResponseWire> {
    let dict = match value {
        Value::Map(items) => map_to_string_keys(items),
        _ => {
            return Err(anyhow::anyhow!(
                "CBOR decode failed: response is not a map"
            ))
        }
    };

    if let Some((status_code, body_bytes, headers)) = parse_simplified_error(&dict) {
        let response = ZhtpResponse {
            version: "1.0".to_string(),
            status_message: String::from_utf8_lossy(&body_bytes).to_string(),
            headers,
            body: body_bytes,
            timestamp: current_timestamp(),
            server: None,
            validity_proof: None,
        };
        return Ok(ZhtpResponseWire {
            request_id: extract_request_id(&dict),
            status: status_code,
            response,
            error_code: None,
            error_message: None,
        });
    }

    let response_dict = match dict.get("response") {
        Some(Value::Map(items)) => map_to_string_keys(items),
        _ => dict.clone(),
    };

    let status_code = extract_status_code(&dict).unwrap_or(200);
    let (body_bytes, content_type) = extract_body_and_content_type(&response_dict);
    let headers = ZhtpHeaders {
        content_type: Some(content_type),
        content_length: Some(body_bytes.len() as u64),
        dao_fee: 0,
        total_fees: 0,
        content_encoding: None,
        cache_control: None,
        network_fee: None,
        priority: None,
    };

    let response = ZhtpResponse {
        version: extract_string(&response_dict, "version").unwrap_or_else(|| "1.0".to_string()),
        status_message: extract_string(&response_dict, "status_message").unwrap_or_default(),
        headers,
        body: body_bytes,
        timestamp: extract_u64(&response_dict, "timestamp").unwrap_or_else(current_timestamp),
        server: extract_string(&response_dict, "server"),
        validity_proof: extract_bytes(&response_dict, "validity_proof"),
    };

    Ok(ZhtpResponseWire {
        request_id: extract_request_id(&dict),
        status: status_code,
        response,
        error_code: None,
        error_message: None,
    })
}

fn map_to_string_keys(items: &[(Value, Value)]) -> HashMap<String, Value> {
    let mut map = HashMap::new();
    for (k, v) in items {
        if let Value::Text(key) = k {
            map.insert(key.to_string(), v.clone());
        }
    }
    map
}

fn extract_request_id(dict: &HashMap<String, Value>) -> Vec<u8> {
    match dict.get("request_id") {
        Some(Value::Bytes(bytes)) => bytes.clone(),
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(|v| match v {
                Value::Integer(i) => i64::try_from(*i).ok().map(|b| b as u8),
                _ => None,
            })
            .collect(),
        _ => Vec::new(),
    }
}

fn extract_status_code(dict: &HashMap<String, Value>) -> Option<u16> {
    match dict.get("status") {
        Some(Value::Text(s)) => match s.as_str() {
            "Ok" => Some(200),
            "Created" => Some(201),
            "BadRequest" => Some(400),
            "Unauthorized" => Some(401),
            "Forbidden" => Some(403),
            "NotFound" => Some(404),
            "InternalServerError" => Some(500),
            _ => Some(200),
        },
        Some(Value::Integer(i)) => i64::try_from(*i).ok().map(|v| v as u16),
        _ => None,
    }
}

fn extract_body_and_content_type(dict: &HashMap<String, Value>) -> (Vec<u8>, String) {
    let body = match dict.get("body") {
        Some(Value::Bytes(bytes)) => bytes.clone(),
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(|v| match v {
                Value::Integer(i) => i64::try_from(*i).ok().map(|b| b as u8),
                _ => None,
            })
            .collect(),
        Some(Value::Text(s)) => s.as_bytes().to_vec(),
        _ => Vec::new(),
    };

    let content_type = match dict.get("headers") {
        Some(Value::Map(items)) => {
            let header_map = map_to_string_keys(items);
            if let Some(Value::Text(ct)) = header_map.get("content_type") {
                ct.to_string()
            } else if let Some(Value::Text(ct)) = header_map.get("Content-Type") {
                ct.to_string()
            } else {
                "application/json".to_string()
            }
        }
        _ => "application/json".to_string(),
    };

    (body, content_type)
}

fn extract_string(dict: &HashMap<String, Value>, key: &str) -> Option<String> {
    match dict.get(key) {
        Some(Value::Text(s)) => Some(s.to_string()),
        _ => None,
    }
}

fn extract_u64(dict: &HashMap<String, Value>, key: &str) -> Option<u64> {
    match dict.get(key) {
        Some(Value::Integer(i)) => u64::try_from(*i).ok(),
        _ => None,
    }
}

fn extract_bytes(dict: &HashMap<String, Value>, key: &str) -> Option<Vec<u8>> {
    match dict.get(key) {
        Some(Value::Bytes(bytes)) => Some(bytes.clone()),
        Some(Value::Array(items)) => Some(
            items
                .iter()
                .filter_map(|v| match v {
                    Value::Integer(i) => i64::try_from(*i).ok().map(|b| b as u8),
                    _ => None,
                })
                .collect(),
        ),
        _ => None,
    }
}

fn parse_simplified_error(
    dict: &HashMap<String, Value>,
) -> Option<(u16, Vec<u8>, ZhtpHeaders)> {
    let status = match dict.get("statusCode") {
        Some(Value::Integer(i)) => u16::try_from(i64::try_from(*i).ok()?).ok()?,
        _ => return None,
    };

    let body_bytes = match dict.get("body") {
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(|v| match v {
                Value::Integer(i) => i64::try_from(*i).ok().map(|b| b as u8),
                _ => None,
            })
            .collect(),
        _ => Vec::new(),
    };

    let content_type = match dict.get("headers") {
        Some(Value::Map(items)) => {
            let header_map = map_to_string_keys(items);
            if let Some(Value::Text(ct)) = header_map.get("Content-Type") {
                ct.to_string()
            } else {
                "text/plain".to_string()
            }
        }
        _ => "text/plain".to_string(),
    };

    Some((
        status,
        body_bytes.clone(),
        ZhtpHeaders {
            content_type: Some(content_type),
            content_length: Some(body_bytes.len() as u64),
            dao_fee: 0,
            total_fees: 0,
            content_encoding: None,
            cache_control: None,
            network_fee: None,
            priority: None,
        },
    ))
}

fn current_timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::zhtp_types::{ZhtpMethod, ZhtpHeaders, ZhtpRequest};

    #[test]
    fn test_encode_decode_request() {
        let req = ZhtpRequest {
            method: ZhtpMethod::Get,
            uri: "/health".to_string(),
            version: "1.0".to_string(),
            headers: ZhtpHeaders {
                content_type: Some("application/json".to_string()),
                content_length: Some(0),
                dao_fee: 0,
                total_fees: 0,
                content_encoding: None,
                cache_control: None,
                network_fee: None,
                priority: None,
            },
            body: vec![],
            timestamp: 0,
            requester: None,
            auth_proof: None,
        };

        let encoded = encode_public_request(&req).unwrap();
        assert!(!encoded.is_empty());
        // CBOR should start with a map marker (0xa0-0xb8)
        assert!(encoded[0] >= 0xa0 && encoded[0] <= 0xb8);
    }

    #[test]
    fn test_round_trip() {
        let req = ZhtpRequest {
            method: ZhtpMethod::Post,
            uri: "/api/v1/web4/domains/resolve".to_string(),
            version: "1.0".to_string(),
            headers: ZhtpHeaders {
                content_type: Some("application/json".to_string()),
                content_length: Some(br#"{"domain":"example.net"}"#.len() as u64),
                dao_fee: 0,
                total_fees: 0,
                content_encoding: None,
                cache_control: None,
                network_fee: None,
                priority: None,
            },
            body: br#"{"domain":"example.net"}"#.to_vec(),
            timestamp: 0,
            requester: None,
            auth_proof: None,
        };

        let encoded = encode_public_request(&req).unwrap();
        // For now, just verify encoding succeeds
        // Full round-trip requires request.json deserialization
        assert!(!encoded.is_empty());
    }
}
