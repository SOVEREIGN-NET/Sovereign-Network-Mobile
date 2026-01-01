//! ZHTP Wire Framing - Length-Prefixed CBOR
//!
//! Format: [4 bytes big-endian u32 length] [CBOR payload]

use anyhow::{anyhow, Result};

const MAX_MESSAGE_SIZE: u32 = 16 * 1024 * 1024; // 16 MB

/// Encode message: prepend 4-byte big-endian length to CBOR payload
pub fn frame_encode(cbor_payload: &[u8]) -> Result<Vec<u8>> {
    if cbor_payload.len() > MAX_MESSAGE_SIZE as usize {
        return Err(anyhow!(
            "Message too large: {} > {} bytes",
            cbor_payload.len(),
            MAX_MESSAGE_SIZE
        ));
    }

    let mut framed = Vec::with_capacity(4 + cbor_payload.len());
    // Write length as big-endian u32
    framed.extend_from_slice(&(cbor_payload.len() as u32).to_be_bytes());
    framed.extend_from_slice(cbor_payload);
    Ok(framed)
}

/// Decode message: read 4-byte big-endian length, then N bytes
/// Returns (length_value, remaining_bytes_after_length)
pub fn frame_decode_header(data: &[u8]) -> Result<(u32, &[u8])> {
    if data.len() < 4 {
        return Err(anyhow!("Not enough bytes for length header: {}", data.len()));
    }

    let length_bytes = &data[0..4];
    let length = u32::from_be_bytes([length_bytes[0], length_bytes[1], length_bytes[2], length_bytes[3]]);

    if length == 0 {
        return Err(anyhow!("Message length cannot be zero"));
    }

    if length > MAX_MESSAGE_SIZE {
        return Err(anyhow!("Message too large: {} > {}", length, MAX_MESSAGE_SIZE));
    }

    Ok((length, &data[4..]))
}

/// Extract complete message: read header, then exact N bytes
pub fn frame_decode_message(data: &[u8]) -> Result<(Vec<u8>, &[u8])> {
    let (length, remainder) = frame_decode_header(data)?;

    if remainder.len() < length as usize {
        return Err(anyhow!(
            "Incomplete message: expected {} bytes, have {} bytes",
            length,
            remainder.len()
        ));
    }

    let payload = remainder[..length as usize].to_vec();
    let leftover = &remainder[length as usize..];

    Ok((payload, leftover))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_frame_encode_decode() {
        let original = b"hello world";
        let framed = frame_encode(original).unwrap();

        // Should be 4 + 11 = 15 bytes
        assert_eq!(framed.len(), 15);

        // First 4 bytes should be 11 in big-endian
        assert_eq!(&framed[0..4], &[0, 0, 0, 11]);

        // Rest should be original payload
        assert_eq!(&framed[4..], original);

        // Decode should recover original
        let (payload, leftover) = frame_decode_message(&framed).unwrap();
        assert_eq!(payload, original);
        assert_eq!(leftover.len(), 0);
    }

    #[test]
    fn test_max_size_enforcement() {
        let too_large = vec![0u8; MAX_MESSAGE_SIZE as usize + 1];
        let result = frame_encode(&too_large);
        assert!(result.is_err());
    }

    #[test]
    fn test_zero_length_rejected() {
        let malformed = &[0u8, 0, 0, 0][..]; // length = 0
        let result = frame_decode_header(malformed);
        assert!(result.is_err());
    }

    #[test]
    fn test_incomplete_payload() {
        // Says 100 bytes but only has 10
        let mut malformed = vec![0u8, 0, 0, 100];
        malformed.extend_from_slice(&[0u8; 10]);
        let result = frame_decode_message(&malformed);
        assert!(result.is_err());
    }
}
