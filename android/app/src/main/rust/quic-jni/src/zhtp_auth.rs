//! ZHTP Authenticated Mode - UHP Handshake + Session Management
//!
//! Mirrors iOS UHP v2 MAC derivation (HKDF-SHA3 + HMAC-SHA3) for interoperability.

use crate::zhtp_types::ZhtpMethod;
use anyhow::Result;
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha3::Sha3_256;
use std::time::{SystemTime, UNIX_EPOCH};

/// Session state for authenticated connections
#[derive(Debug, Clone)]
pub struct AuthSession {
    pub session_id: Vec<u8>,      // [u8; 32] from handshake (UHP v2)
    pub mac_key: Vec<u8>,          // [u8; 32] from HKDF-SHA3 derivation
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

/// Build canonical request bytes for MAC computation (matches iOS UHP v2)
///
/// Format (big-endian):
/// [method: u8][pathLen: u16 BE][path bytes][bodyLen: u32 BE][body bytes][counter: u64 BE][sessionId: 32 bytes]
pub fn build_mac_input(
    method: ZhtpMethod,
    path: &str,
    body: &[u8],
    counter: u64,
    session_id: &[u8],
) -> Result<Vec<u8>> {
    if session_id.len() != 32 {
        return Err(anyhow::anyhow!(
            "Session ID must be 32 bytes, got {}",
            session_id.len()
        ));
    }

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

    let path_bytes = path.as_bytes();
    if path_bytes.len() > u16::MAX as usize {
        return Err(anyhow::anyhow!(
            "Path too long: {} bytes",
            path_bytes.len()
        ));
    }
    if body.len() > u32::MAX as usize {
        return Err(anyhow::anyhow!(
            "Body too long: {} bytes",
            body.len()
        ));
    }

    let mut data = Vec::with_capacity(
        1 + 2 + path_bytes.len() + 4 + body.len() + 8 + session_id.len(),
    );
    data.push(method_byte);
    data.extend_from_slice(&(path_bytes.len() as u16).to_be_bytes());
    data.extend_from_slice(path_bytes);
    data.extend_from_slice(&(body.len() as u32).to_be_bytes());
    data.extend_from_slice(body);
    data.extend_from_slice(&counter.to_be_bytes());
    data.extend_from_slice(session_id);

    Ok(data)
}

/// Derive mac_key = HKDF-SHA3-256(session_key, handshake_hash, "zhtp/v2/mac_key")
pub fn derive_mac_key(session_key: &[u8], handshake_hash: &[u8]) -> Result<Vec<u8>> {
    let hk = hkdf::Hkdf::<Sha3_256>::new(Some(handshake_hash), session_key);
    let mut okm = [0u8; 32];
    hk.expand(b"zhtp/v2/mac_key", &mut okm)
        .map_err(|_| anyhow::anyhow!("HKDF expand failed"))?;
    Ok(okm.to_vec())
}

/// Compute request MAC using HMAC-SHA3-256 (matches iOS)
pub fn compute_request_mac(mac_key: &[u8], mac_input: &[u8]) -> Result<Vec<u8>> {
    let mut hmac = Hmac::<Sha3_256>::new_from_slice(mac_key)
        .map_err(|_| anyhow::anyhow!("Invalid HMAC key"))?;
    hmac.update(mac_input);
    Ok(hmac.finalize().into_bytes().to_vec())
}

/// Build AuthContext for a request
pub fn build_auth_context(
    session: &AuthSession,
    method: ZhtpMethod,
    path: &str,
    body: &[u8],
) -> Result<AuthContext> {
    let mut session_mut = session.clone();
    let sequence = session_mut.next_sequence();
    let mac_input = build_mac_input(method, path, body, sequence, &session.session_id)?;
    let request_mac = compute_request_mac(&session.mac_key, &mac_input)?;

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
            session_id: vec![0u8; 32],
            mac_key: vec![0u8; 32],
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
    fn test_mac_input_deterministic() {
        let method = ZhtpMethod::Post;
        let uri = "/api/v1/transactions";
        let body = b"test";
        let session_id = vec![7u8; 32];

        let input1 = build_mac_input(method, uri, body, 42, &session_id).unwrap();
        let input2 = build_mac_input(method, uri, body, 42, &session_id).unwrap();

        assert_eq!(input1, input2, "MAC input must be deterministic");
    }
}
