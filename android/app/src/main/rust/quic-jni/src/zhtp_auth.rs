//! ZHTP Authenticated Mode - UHP Handshake + Session Management
//!
//! Implements authenticated requests with Dilithium5 signing and Kyber512 key exchange.

use crate::zhtp_types::{ZhtpMethod, ZhtpHeaders};
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

/// Session state for authenticated connections
#[derive(Debug, Clone)]
pub struct AuthSession {
    pub session_id: Vec<u8>,      // [u8; 16] from handshake
    pub app_key: Vec<u8>,          // [u8; 32] from HKDF derivation
    pub sequence: u64,             // monotonic counter, incremented per request
    pub client_did: String,        // client identity
    pub server_did: String,        // server identity
    pub created_at: u64,           // unix timestamp in seconds
    pub last_activity: u64,        // unix timestamp in seconds
}

impl AuthSession {
    /// Check if session is still valid
    /// - Not idle for > 5 minutes
    /// - Not older than 1 hour
    pub fn is_valid(&self) -> bool {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        // 5-minute idle timeout
        if now.saturating_sub(self.last_activity) > 300 {
            return false;
        }

        // 1-hour age limit
        if now.saturating_sub(self.created_at) > 3600 {
            return false;
        }

        true
    }

    /// Update last activity timestamp
    pub fn touch(&mut self) {
        self.last_activity = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
    }

    /// Increment sequence counter for next request
    pub fn next_sequence(&mut self) -> u64 {
        let current = self.sequence;
        self.sequence = self.sequence.saturating_add(1);
        current
    }
}

/// Authentication context sent in ZHTP request header
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthContext {
    pub session_id: Vec<u8>,  // [u8; 16]
    pub client_did: String,
    pub sequence: u64,
    pub request_mac: Vec<u8>, // [u8; 32]
}

/// Compute canonical hash of request following exact server order
/// Hash input:
/// 1. WIRE_VERSION (u16 LE) = 1
/// 2. request_id (16 bytes)
/// 3. timestamp_ms (u64 LE)
/// 4. method encoded (1 byte)
/// 5. uri (length-prefixed string)
/// 6. headers in fixed order (content_type, content_length, content_encoding, cache_control)
/// 7. body (length-prefixed bytes)
pub fn compute_canonical_request_hash(
    request_id: &[u8; 16],
    timestamp_ms: u64,
    method: ZhtpMethod,
    uri: &str,
    headers: &ZhtpHeaders,
    body: &[u8],
) -> Vec<u8> {
    let mut hash_input = Vec::new();

    // 1. WIRE_VERSION (u16 LE) = 1
    hash_input.extend_from_slice(&(1u16).to_le_bytes());

    // 2. request_id (16 bytes)
    hash_input.extend_from_slice(request_id);

    // 3. timestamp_ms (u64 LE)
    hash_input.extend_from_slice(&timestamp_ms.to_le_bytes());

    // 4. method encoded (1 byte)
    let method_byte = match method {
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
    };
    hash_input.push(method_byte);

    // 5. uri (length-prefixed string)
    let uri_bytes = uri.as_bytes();
    hash_input.extend_from_slice(&(uri_bytes.len() as u32).to_le_bytes());
    hash_input.extend_from_slice(uri_bytes);

    // 6. headers in fixed order
    // content_type (present flag + length + bytes)
    if let Some(ct) = &headers.content_type {
        hash_input.push(1); // present flag
        let ct_bytes = ct.as_bytes();
        hash_input.extend_from_slice(&(ct_bytes.len() as u32).to_le_bytes());
        hash_input.extend_from_slice(ct_bytes);
    } else {
        hash_input.push(0); // not present
    }

    // content_length (present flag + u64 LE)
    if let Some(cl) = headers.content_length {
        hash_input.push(1); // present flag
        hash_input.extend_from_slice(&cl.to_le_bytes());
    } else {
        hash_input.push(0);
    }

    // content_encoding (present flag + length + bytes)
    if let Some(ce) = &headers.content_encoding {
        hash_input.push(1);
        let ce_bytes = ce.as_bytes();
        hash_input.extend_from_slice(&(ce_bytes.len() as u32).to_le_bytes());
        hash_input.extend_from_slice(ce_bytes);
    } else {
        hash_input.push(0);
    }

    // cache_control (present flag + length + bytes)
    if let Some(cc) = &headers.cache_control {
        hash_input.push(1);
        let cc_bytes = cc.as_bytes();
        hash_input.extend_from_slice(&(cc_bytes.len() as u32).to_le_bytes());
        hash_input.extend_from_slice(cc_bytes);
    } else {
        hash_input.push(0);
    }

    // 7. body (length-prefixed bytes)
    hash_input.extend_from_slice(&(body.len() as u32).to_le_bytes());
    hash_input.extend_from_slice(body);

    // Hash with BLAKE3
    blake3::hash(&hash_input).as_bytes().to_vec()
}

/// Compute request MAC using BLAKE3 keyed hashing
/// MAC = BLAKE3_keyed(app_key, session_id || sequence || canonical_hash)
pub fn compute_request_mac(
    app_key: &[u8],
    session_id: &[u8],
    sequence: u64,
    canonical_hash: &[u8],
) -> Vec<u8> {
    let mut mac_input = Vec::new();
    mac_input.extend_from_slice(session_id);
    mac_input.extend_from_slice(&sequence.to_le_bytes());
    mac_input.extend_from_slice(canonical_hash);

    // Derive keyed MAC from app_key
    let key_hash = blake3::hash(app_key);
    let key_array: [u8; 32] = key_hash.as_bytes()[..32].try_into().unwrap_or_default();

    blake3::keyed_hash(&key_array, &mac_input)
        .as_bytes()
        .to_vec()
}

/// Derive app_key from master_key using BLAKE3
/// app_key = blake3("zhtp-web4-app-mac" || master_key || session_id || server_did || client_did)
pub fn derive_app_key(
    master_key: &[u8],
    session_id: &[u8],
    server_did: &str,
    client_did: &str,
) -> Vec<u8> {
    let mut input = Vec::new();
    input.extend_from_slice(b"zhtp-web4-app-mac");
    input.extend_from_slice(master_key);
    input.extend_from_slice(session_id);
    input.extend_from_slice(server_did.as_bytes());
    input.extend_from_slice(client_did.as_bytes());

    blake3::hash(&input).as_bytes().to_vec()
}

/// Derive master key from session components using BLAKE3
/// Master Key = BLAKE3(
///   "zhtp-quic-master" ||
///   uhp_session_key || pqc_shared_secret || uhp_transcript_hash || peer_node_id
/// )
pub fn derive_master_key(
    uhp_session_key: &[u8],
    pqc_shared_secret: &[u8],
    uhp_transcript_hash: &[u8],
    peer_node_id: &str,
) -> Vec<u8> {
    let mut input = Vec::new();
    input.extend_from_slice(b"zhtp-quic-master");
    input.extend_from_slice(uhp_session_key);
    input.extend_from_slice(pqc_shared_secret);
    input.extend_from_slice(uhp_transcript_hash);
    input.extend_from_slice(peer_node_id.as_bytes());

    blake3::hash(&input).as_bytes()[..32].to_vec()
}

/// Build AuthContext for a request
pub fn build_auth_context(
    session: &AuthSession,
    canonical_hash: &[u8],
) -> Result<AuthContext> {
    let mut session_mut = session.clone();
    let sequence = session_mut.next_sequence();

    let request_mac = compute_request_mac(&session.app_key, &session.session_id, sequence, canonical_hash);

    Ok(AuthContext {
        session_id: session.session_id.clone(),
        client_did: session.client_did.clone(),
        sequence,
        request_mac,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_validity() {
        let session = AuthSession {
            session_id: vec![0u8; 16],
            app_key: vec![0u8; 32],
            sequence: 0,
            client_did: "client".to_string(),
            server_did: "server".to_string(),
            created_at: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            last_activity: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        };
        assert!(session.is_valid());
    }

    #[test]
    fn test_canonical_hash_deterministic() {
        let request_id = [1u8; 16];
        let method = ZhtpMethod::Post;
        let uri = "/api/v1/transactions";
        let headers = ZhtpHeaders {
            content_type: Some("application/json".to_string()),
            content_length: Some(100),
            dao_fee: 10,
            total_fees: 11,
            content_encoding: None,
            cache_control: None,
            network_fee: None,
            priority: None,
        };
        let body = b"test";

        let hash1 = compute_canonical_request_hash(&request_id, 1000, method, uri, &headers, body);
        let hash2 = compute_canonical_request_hash(&request_id, 1000, method, uri, &headers, body);

        assert_eq!(hash1, hash2, "Canonical hash must be deterministic");
        assert_eq!(hash1.len(), 32, "BLAKE3 hash should be 32 bytes");
    }
}
