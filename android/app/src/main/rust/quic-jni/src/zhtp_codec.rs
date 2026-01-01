//! ZHTP CBOR Codec - Encode/Decode ZHTP Types
//!
//! Uses ciborium for CBOR serialization.
//! Field order must match server's serde defaults.

use crate::zhtp_types::{ZhtpRequestWire, ZhtpResponseWire};
use anyhow::Result;

/// Encode ZHTP request to CBOR bytes
pub fn encode_request(request: &ZhtpRequestWire) -> Result<Vec<u8>> {
    let mut buffer = Vec::new();
    ciborium::ser::into_writer(request, &mut buffer)
        .map_err(|e| anyhow::anyhow!("CBOR encode failed: {}", e))?;
    Ok(buffer)
}

/// Decode CBOR bytes to ZHTP response
pub fn decode_response(cbor_bytes: &[u8]) -> Result<ZhtpResponseWire> {
    ciborium::de::from_reader(cbor_bytes)
        .map_err(|e| anyhow::anyhow!("CBOR decode failed: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::zhtp_types::{ZhtpMethod, ZhtpHeaders, ZhtpRequest};

    #[test]
    fn test_encode_decode_request() {
        let req = ZhtpRequestWire::new_public(
            ZhtpMethod::Get,
            "/health".to_string(),
            "application/json".to_string(),
            vec![],
        );

        let encoded = encode_request(&req).unwrap();
        assert!(!encoded.is_empty());
        // CBOR should start with a map marker (0xa0-0xb8)
        assert!(encoded[0] >= 0xa0 && encoded[0] <= 0xb8);
    }

    #[test]
    fn test_round_trip() {
        let req = ZhtpRequestWire::new_public(
            ZhtpMethod::Post,
            "/api/v1/web4/domains/resolve".to_string(),
            "application/json".to_string(),
            br#"{"domain":"example.net"}"#.to_vec(),
        );

        let encoded = encode_request(&req).unwrap();
        // For now, just verify encoding succeeds
        // Full round-trip requires request.json deserialization
        assert!(!encoded.is_empty());
    }
}
