//! ZHTP Protocol Types - Public Mode Only (Unauthenticated)
//!
//! Implements serializable types matching server's lib-protocols definitions.
//! Only includes public mode - no authentication/session state.

use serde::{Deserialize, Serialize};

/// ZHTP HTTP method enum (matches server encoding)
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "PascalCase")]
pub enum ZhtpMethod {
    Get,
    Post,
    Put,
    Delete,
    Options,
    Head,
    Patch,
    Verify,
    Connect,
    Trace,
}

impl ZhtpMethod {
    /// Convert to wire encoding (u8)
    pub fn to_wire(&self) -> u8 {
        match self {
            ZhtpMethod::Get => 0,
            ZhtpMethod::Post => 1,
            ZhtpMethod::Put => 2,
            ZhtpMethod::Delete => 3,
            ZhtpMethod::Options => 4,
            ZhtpMethod::Head => 5,
            ZhtpMethod::Patch => 6,
            ZhtpMethod::Verify => 7,
            ZhtpMethod::Connect => 8,
            ZhtpMethod::Trace => 9,
        }
    }

    /// Parse from wire encoding
    pub fn from_wire(byte: u8) -> Option<Self> {
        match byte {
            0 => Some(ZhtpMethod::Get),
            1 => Some(ZhtpMethod::Post),
            2 => Some(ZhtpMethod::Put),
            3 => Some(ZhtpMethod::Delete),
            4 => Some(ZhtpMethod::Options),
            5 => Some(ZhtpMethod::Head),
            6 => Some(ZhtpMethod::Patch),
            7 => Some(ZhtpMethod::Verify),
            8 => Some(ZhtpMethod::Connect),
            9 => Some(ZhtpMethod::Trace),
            _ => None,
        }
    }
}

/// ZHTP Headers - required fields for all requests
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZhtpHeaders {
    pub content_type: String,
    pub content_length: u64,
    pub dao_fee: u64,
    pub total_fees: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_encoding: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_control: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub network_fee: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<u8>,
}

/// ZHTP Request - the actual request payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZhtpRequest {
    pub method: ZhtpMethod,
    pub uri: String,
    pub version: String, // "1.0"
    pub headers: ZhtpHeaders,
    pub body: Vec<u8>,
    pub timestamp: u64, // seconds since epoch
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requester: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_proof: Option<Vec<u8>>,
}

/// ZHTP Request Wire - transport envelope (public mode: no auth_context)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZhtpRequestWire {
    pub version: u16, // 1
    pub request_id: Vec<u8>, // [u8; 16] - serialize as bytes
    pub timestamp_ms: u64,
    pub auth_context: Option<serde_json::Value>, // null for public mode
    pub request: ZhtpRequest,
}

impl ZhtpRequestWire {
    /// Create a new public request (no authentication)
    pub fn new_public(
        method: ZhtpMethod,
        uri: String,
        content_type: String,
        body: Vec<u8>,
    ) -> Self {
        let content_length = body.len() as u64;
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let timestamp_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        // Generate 16 random bytes for request_id
        let mut request_id = vec![0u8; 16];
        use std::io::Read;
        let _ = std::fs::File::open("/dev/urandom")
            .and_then(|mut f| f.read_exact(&mut request_id).map(|_| ()));
        // Fallback if /dev/urandom fails
        if request_id.iter().all(|&b| b == 0) {
            for i in 0..16 {
                request_id[i] = (i as u8).wrapping_mul(31);
            }
        }

        ZhtpRequestWire {
            version: 1,
            request_id,
            timestamp_ms,
            auth_context: None,
            request: ZhtpRequest {
                method,
                uri,
                version: "1.0".to_string(),
                headers: ZhtpHeaders {
                    content_type,
                    content_length,
                    dao_fee: 0,
                    total_fees: 0,
                    content_encoding: None,
                    cache_control: None,
                    network_fee: None,
                    priority: None,
                },
                body,
                timestamp,
                requester: None,
                auth_proof: None,
            },
        }
    }
}

/// ZHTP Response (nested inside ZhtpResponseWire)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZhtpResponse {
    pub version: String, // "1.0"
    pub status_message: String,
    pub headers: ZhtpHeaders,
    pub body: Vec<u8>,
    pub timestamp: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub server: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub validity_proof: Option<Vec<u8>>,
}

/// ZHTP Response Wire - transport envelope for responses (NESTED structure)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZhtpResponseWire {
    pub request_id: Vec<u8>,
    pub status: u16,
    pub response: ZhtpResponse, // ← NESTED: contains status_message, headers, body
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_method_encoding() {
        assert_eq!(ZhtpMethod::Get.to_wire(), 0);
        assert_eq!(ZhtpMethod::Post.to_wire(), 1);
        assert_eq!(ZhtpMethod::Trace.to_wire(), 9);
        assert_eq!(ZhtpMethod::from_wire(0), Some(ZhtpMethod::Get));
    }

    #[test]
    fn test_public_request_creation() {
        let req = ZhtpRequestWire::new_public(
            ZhtpMethod::Get,
            "/health".to_string(),
            "application/json".to_string(),
            vec![],
        );
        assert_eq!(req.version, 1);
        assert_eq!(req.request_id.len(), 16);
        assert_eq!(req.auth_context, None);
        assert_eq!(req.request.headers.dao_fee, 0);
        assert_eq!(req.request.headers.total_fees, 0);
    }
}
