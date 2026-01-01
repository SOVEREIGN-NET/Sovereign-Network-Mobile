import Foundation

// MARK: - ZHTP Wire Framing

let MAX_MESSAGE_SIZE: UInt32 = 16 * 1024 * 1024 // 16 MB

/// Encode message: prepend 4-byte big-endian length to CBOR payload
func zhtp_frame_encode(cbor_payload: Data) throws -> Data {
    guard cbor_payload.count <= Int(MAX_MESSAGE_SIZE) else {
        throw NSError(
            domain: "ZhtpFraming",
            code: -1,
            userInfo: [NSLocalizedDescriptionKey: "Message too large: \(cbor_payload.count) > \(MAX_MESSAGE_SIZE) bytes"]
        )
    }

    var framed = Data(capacity: 4 + cbor_payload.count)

    // Write length as big-endian u32
    let length = UInt32(cbor_payload.count)
    var lengthBE = length.bigEndian
    withUnsafeBytes(of: &lengthBE) { buffer in
        framed.append(contentsOf: buffer)
    }

    framed.append(cbor_payload)
    return framed
}

/// Decode message header: read 4-byte big-endian length
/// Returns (length_value, remaining_bytes_after_header)
func zhtp_frame_decode_header(data: Data) throws -> (UInt32, Data) {
    guard data.count >= 4 else {
        throw NSError(
            domain: "ZhtpFraming",
            code: -2,
            userInfo: [NSLocalizedDescriptionKey: "Not enough bytes for length header: \(data.count)"]
        )
    }

    let lengthBytes = data.subdata(in: 0..<4)
    let length = UInt32(
        UInt8(lengthBytes[0]) << 24 |
        UInt8(lengthBytes[1]) << 16 |
        UInt8(lengthBytes[2]) << 8 |
        UInt8(lengthBytes[3])
    )

    guard length > 0 else {
        throw NSError(
            domain: "ZhtpFraming",
            code: -3,
            userInfo: [NSLocalizedDescriptionKey: "Message length cannot be zero"]
        )
    }

    guard length <= MAX_MESSAGE_SIZE else {
        throw NSError(
            domain: "ZhtpFraming",
            code: -4,
            userInfo: [NSLocalizedDescriptionKey: "Message too large: \(length) > \(MAX_MESSAGE_SIZE)"]
        )
    }

    let remainder = data.subdata(in: 4..<data.count)
    return (length, remainder)
}

/// Extract complete message: read header, then exact N bytes
func zhtp_frame_decode_message(data: Data) throws -> (Data, Data) {
    let (length, remainder) = try zhtp_frame_decode_header(data: data)

    guard remainder.count >= Int(length) else {
        throw NSError(
            domain: "ZhtpFraming",
            code: -5,
            userInfo: [NSLocalizedDescriptionKey: "Incomplete message: expected \(length) bytes, have \(remainder.count) bytes"]
        )
    }

    let payload = remainder.subdata(in: 0..<Int(length))
    let leftover = remainder.count > Int(length) ? remainder.subdata(in: Int(length)..<remainder.count) : Data()

    return (payload, leftover)
}
