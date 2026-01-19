import Foundation

// Note: ZhtpRequestWire, ZhtpResponseWire defined in ZhtpTypes.swift
// Both files should be in the same build target

// MARK: - ZHTP CBOR Codec

/// Encode ZHTP request to CBOR bytes with SDK wire format (4-byte length prefix + CBOR)
/// Converts Codable struct to CBOR format using serde-compatible encoding
func zhtp_encode_request(_ request: ZhtpRequestWire) throws -> Data {
    // Encode directly to CBOR without JSON intermediate (preserves binary data)
    var cborData = Data()

    print("[ZhtpCodec] Starting CBOR encoding")
    print("[ZhtpCodec] request_id: \(request.request_id.count) bytes")
    print("[ZhtpCodec] timestamp_ms: \(request.timestamp_ms)")
    print("[ZhtpCodec] request.method: \(request.request.method.stringValue)")
    print("[ZhtpCodec] request.uri: \(request.request.uri)")
    print("[ZhtpCodec] request.body: \(request.request.body.count) bytes")

    let hasAuthContext = request.auth_context != nil
    let mapSize: UInt8 = hasAuthContext ? 5 : 4
    cborData.append(0xa0 | mapSize) // Map type with fixed entries

    // Field order matches Rust struct declaration: version, request_id, timestamp_ms, auth_context, request
    try appendCborString(&cborData, "version")
    try appendCborUInt(&cborData, UInt64(request.version), majorType: 0)
    print("[ZhtpCodec] After version: \(cborData.count) bytes")

    try appendCborString(&cborData, "request_id")
    try appendCborBytes(&cborData, request.request_id)
    print("[ZhtpCodec] After request_id: \(cborData.count) bytes")

    try appendCborString(&cborData, "timestamp_ms")
    try appendCborUInt(&cborData, request.timestamp_ms, majorType: 0)
    print("[ZhtpCodec] After timestamp_ms: \(cborData.count) bytes")

    if let authContext = request.auth_context {
        try appendCborString(&cborData, "auth_context")
        try appendCborStringMap(&cborData, authContext)
        print("[ZhtpCodec] After auth_context: \(cborData.count) bytes")
    }

    try appendCborString(&cborData, "request")
    let requestBytes = try encodeRequest(request.request)
    cborData.append(contentsOf: requestBytes)
    print("[ZhtpCodec] Request object encoded: \(requestBytes.count) bytes")
    print("[ZhtpCodec] After request object: \(cborData.count) bytes total")

    let hexString = cborData.prefix(80).map({ String(format: "%02x", $0) }).joined(separator: " ")
    print("[ZhtpCodec] CBOR hex (first 80 bytes): \(hexString)")
    print("[ZhtpCodec] CBOR encoded: \(cborData.count) bytes total")

    // Add ZHTP wire format: [magic: 0x5A485450] + [version: 0x01] + [length: 4 BE] + [CBOR]
    var wireData = Data()
    // ZHTP magic bytes
    wireData.append(contentsOf: [0x5A, 0x48, 0x54, 0x50])  // "ZHTP"
    // Version
    wireData.append(0x01)
    // Length (big-endian)
    var length = UInt32(cborData.count).bigEndian
    withUnsafeBytes(of: &length) { buffer in
        wireData.append(contentsOf: buffer)
    }
    // CBOR payload
    wireData.append(cborData)
    print("[ZhtpCodec] Wire format with ZHTP header: \(wireData.count) bytes (magic + version + length + \(cborData.count) CBOR)")

    return wireData
}

/// Encode public SDK request with ZHTP wire format
/// Format A: { method, path, sessionId?, sequence?, timestamp?, body?, requestMac? }
/// Returns: [magic: 0x5A485450] + [version: 0x01] + [length: 4 BE] + [CBOR]
func zhtp_encode_sdk_request(
    method: String,
    path: String,
    sessionId: String? = nil,
    sequence: UInt64? = nil,
    timestamp: UInt64? = nil,
    body: Data? = nil,
    requestMac: Data? = nil
) throws -> Data {
    var cborData = Data()

    var fieldCount = 2 // method, path
    if sessionId != nil { fieldCount += 1 }
    if sequence != nil { fieldCount += 1 }
    if timestamp != nil { fieldCount += 1 }
    if let body = body, !body.isEmpty { fieldCount += 1 }
    if requestMac != nil { fieldCount += 1 }

    cborData.append(0xa0 | UInt8(fieldCount))

    try appendCborString(&cborData, "method")
    try appendCborString(&cborData, method.uppercased())

    try appendCborString(&cborData, "path")
    try appendCborString(&cborData, path)

    if let sessionId = sessionId {
        try appendCborString(&cborData, "sessionId")
        try appendCborString(&cborData, sessionId)
    }

    if let sequence = sequence {
        try appendCborString(&cborData, "sequence")
        try appendCborUInt(&cborData, sequence, majorType: 0)
    }

    if let timestamp = timestamp {
        try appendCborString(&cborData, "timestamp")
        try appendCborUInt(&cborData, timestamp, majorType: 0)
    }

    if let body = body, !body.isEmpty {
        try appendCborString(&cborData, "body")
        try appendCborBytes(&cborData, body)
    }

    if let requestMac = requestMac {
        try appendCborString(&cborData, "requestMac")
        try appendCborBytes(&cborData, requestMac)
    }

    // Add ZHTP wire format: [magic: 0x5A485450] + [version: 0x01] + [length: 4 BE] + [CBOR]
    var wireData = Data()
    // ZHTP magic bytes
    wireData.append(contentsOf: [0x5A, 0x48, 0x54, 0x50])  // "ZHTP"
    // Version
    wireData.append(0x01)
    // Length (big-endian)
    var length = UInt32(cborData.count).bigEndian
    withUnsafeBytes(of: &length) { buffer in
        wireData.append(contentsOf: buffer)
    }
    // CBOR payload
    wireData.append(cborData)
    print("[ZhtpCodec] SDK request wire format: \(wireData.count) bytes (magic + version + length + \(cborData.count) CBOR)")

    return wireData
}

private func appendCborBytes(_ data: inout Data, _ bytes: Data) throws {
    try appendCborUInt(&data, UInt64(bytes.count), majorType: 2)
    data.append(bytes)
}

private func appendCborStringMap(_ data: inout Data, _ dict: [String: String]) throws {
    try appendCborUInt(&data, UInt64(dict.count), majorType: 5)
    for (key, value) in dict.sorted(by: { $0.key < $1.key }) {
        try appendCborString(&data, key)
        try appendCborString(&data, value)
    }
}

/// Encode ZhtpRequestWire (transport envelope with request)
func encodeRequestWire(_ wire: ZhtpRequestWire) throws -> Data {
    var data = Data()

    // Map with 5 entries: version, request_id, timestamp_ms, auth_context, request
    data.append(0xa5) // Map with 5 entries

    // version
    try appendCborString(&data, "version")
    try appendCborUInt(&data, UInt64(wire.version), majorType: 0)

    // request_id (as bytes)
    try appendCborString(&data, "request_id")
    try appendCborBytes(&data, wire.request_id)

    // timestamp_ms
    try appendCborString(&data, "timestamp_ms")
    try appendCborUInt(&data, wire.timestamp_ms, majorType: 0)

    // auth_context (null for public requests)
    try appendCborString(&data, "auth_context")
    if let authContext = wire.auth_context {
        try appendCborStringMap(&data, authContext)
    } else {
        data.append(0xf6) // CBOR null
    }

    // request (nested ZhtpRequest)
    try appendCborString(&data, "request")
    data.append(contentsOf: try encodeRequest(wire.request))

    return data
}

func encodeRequest(_ request: ZhtpRequest) throws -> Data {
    var data = Data()

    // Map with only non-null fields (order matches Rust struct declaration)
    var fieldCount = 6 // method, uri, version, headers, body, timestamp
    if request.requester != nil { fieldCount += 1 }
    if request.auth_proof != nil { fieldCount += 1 }

    data.append(0xa0 | UInt8(fieldCount)) // Map type with variable entries

    // method
    try appendCborString(&data, "method")
    // Server expects serde enum encoding (PascalCase strings), not numeric wire values.
    try appendCborString(&data, request.method.stringValue)

    // uri
    try appendCborString(&data, "uri")
    try appendCborString(&data, request.uri)

    // version
    try appendCborString(&data, "version")
    try appendCborString(&data, request.version)

    // headers
    try appendCborString(&data, "headers")
    data.append(contentsOf: try encodeHeaders(request.headers))

    // body (as bytes)
    try appendCborString(&data, "body")
    try appendCborBytes(&data, request.body)

    // timestamp
    try appendCborString(&data, "timestamp")
    try appendCborUInt(&data, request.timestamp, majorType: 0)

    // requester (only if present)
    if let requester = request.requester {
        try appendCborString(&data, "requester")
        try appendCborString(&data, requester)
    }

    // auth_proof (only if present)
    if let authProof = request.auth_proof {
        try appendCborString(&data, "auth_proof")
        try appendCborBytes(&data, authProof)
    }

    return data
}

private func encodeHeaders(_ headers: ZhtpHeaders) throws -> Data {
    var data = Data()

    // Map with 4 entries (only required fields)
    data.append(0xa4) // Map with 4 entries

    try appendCborString(&data, "content_type")
    try appendCborString(&data, headers.content_type)

    try appendCborString(&data, "content_length")
    try appendCborUInt(&data, headers.content_length, majorType: 0)

    try appendCborString(&data, "dao_fee")
    try appendCborUInt(&data, headers.dao_fee, majorType: 0)

    try appendCborString(&data, "total_fees")
    try appendCborUInt(&data, headers.total_fees, majorType: 0)

    return data
}

/// Decode CBOR bytes to ZHTP response
/// Handles SDK wire format (4-byte length prefix + CBOR)
/// Falls back to decoding just ZhtpResponse if wire wrapper is not present
func zhtp_decode_response(_ cbor_bytes: Data) throws -> ZhtpResponseWire {
    // Step 1: Handle ZHTP wire format: [magic: 4] + [version: 1] + [length: 4 BE] + [body]
    var actualCbor = cbor_bytes

    // Check for ZHTP magic bytes: 0x5A485450 = "ZHTP"
    if cbor_bytes.count >= 9 && cbor_bytes[0] == 0x5A && cbor_bytes[1] == 0x48 &&
       cbor_bytes[2] == 0x54 && cbor_bytes[3] == 0x50 {
        // Skip magic (4 bytes) and version (1 byte)
        let version = cbor_bytes[4]

        // Read length (4 bytes, big-endian) from offset 5
        let lengthBytes = cbor_bytes.subdata(in: 5..<9)
        let length = lengthBytes.withUnsafeBytes { buffer -> UInt32 in
            let bytes = buffer.load(fromByteOffset: 0, as: UInt32.self)
            return UInt32(bigEndian: bytes)
        }

        // Extract payload (should start at offset 9)
        let payloadStart = 9
        if payloadStart + Int(length) <= cbor_bytes.count {
            actualCbor = cbor_bytes.subdata(in: payloadStart..<(payloadStart + Int(length)))
            print("[ZhtpCodec] Detected ZHTP wire format: version \(version), length \(length) bytes")

            // Log payload hex for debugging
            let payloadHex = actualCbor.prefix(128).map({ String(format: "%02x", $0) }).joined(separator: " ")
            print("[ZhtpCodec] ZHTP payload hex (first 128 bytes): \(payloadHex)")
        } else {
            print("[ZhtpCodec] ZHTP header present but invalid length or truncated payload")
            throw NSError(domain: "ZhtpCodec", code: -1, userInfo: [NSLocalizedDescriptionKey: "Truncated ZHTP response"])
        }
    } else if cbor_bytes.count > 4 {
        // Fallback: try frame format (4-byte length prefix + CBOR) for compatibility
        let potentialLength = cbor_bytes.withUnsafeBytes { buffer -> UInt32 in
            let bytes = buffer.load(fromByteOffset: 0, as: UInt32.self)
            return UInt32(bigEndian: bytes)
        }

        if potentialLength == cbor_bytes.count - 4 && potentialLength > 0 {
            actualCbor = cbor_bytes.subdata(in: 4..<cbor_bytes.count)
            print("[ZhtpCodec] Detected frame format (4-byte length prefix): \(potentialLength) bytes")
        }
    }

    // Step 2: Decode CBOR to JSON-compatible value
    let jsonValue = try decodeCborValue(actualCbor)
    print("[ZhtpCodec] CBOR decoded successfully")
    print("[ZhtpCodec] Decoded JSON: \(jsonValue)")
    print("[ZhtpCodec] Decoded type: \(type(of: jsonValue))")

    // Log CBOR hex for debugging
    let hexString = actualCbor.prefix(64).map({ String(format: "%02x", $0) }).joined(separator: " ")
    print("[ZhtpCodec] CBOR hex (first 64 bytes): \(hexString)")

    // Step 3: Handle scalar responses (number, string, bool) or structured responses
    let jsonData: Data
    if let jsonValue = jsonValue as? [String: Any] {
        // Dictionary - normal case
        jsonData = try JSONSerialization.data(withJSONObject: jsonValue)
    } else if let jsonValue = jsonValue as? [Any] {
        // Array - normal case
        jsonData = try JSONSerialization.data(withJSONObject: jsonValue)
    } else {
        // Scalar value (number, string, etc.) - wrap in error response
        print("[ZhtpCodec] WARNING: Server sent scalar CBOR response: \(jsonValue)")
        let errorResponse: [String: Any] = [
            "statusCode": 500,
            "body": ["error": "Invalid response format from server", "raw_response": "\(jsonValue)"]
        ]
        jsonData = try JSONSerialization.data(withJSONObject: errorResponse)

        // Return error response
        return ZhtpResponseWire(
            request_id: Data(),
            status: 500,
            response: ZhtpResponse(
                version: "1.0",
                status_message: "Server returned invalid response format",
                headers: ZhtpHeaders(content_type: "application/json", content_length: 0),
                body: Data("Server returned scalar value: \(jsonValue)".utf8),
                timestamp: UInt64(Date().timeIntervalSince1970)
            ),
            error_code: nil,
            error_message: "Invalid CBOR response format"
        )
    }
    if let jsonString = String(data: jsonData, encoding: .utf8) {
        print("[ZhtpCodec] JSON string: \(jsonString)")
    }
    let decoder = JSONDecoder()

    // Check if this is the simplified error response format (server sends statusCode/body/headers)
    if let dict = jsonValue as? [String: Any],
       let bodyArray = dict["body"] as? [Any],
       let statusCode = dict["statusCode"] as? NSNumber {

        // Convert array of integers to Data/String
        var bodyData = Data()
        for item in bodyArray {
            if let num = item as? NSNumber {
                bodyData.append(UInt8(truncatingIfNeeded: num.uint64Value))
            }
        }

        let bodyString = String(data: bodyData, encoding: .utf8) ?? ""

        // Extract headers
        var headers = ZhtpHeaders(
            content_type: "text/plain",
            content_length: UInt64(bodyData.count)
        )
        if let headersDict = dict["headers"] as? [String: String],
           let contentType = headersDict["Content-Type"] {
            headers = ZhtpHeaders(
                content_type: contentType,
                content_length: UInt64(bodyData.count)
            )
        }

        // Build response
        let response = ZhtpResponse(
            version: "1.0",
            status_message: bodyString,
            headers: headers,
            body: bodyData,
            timestamp: UInt64(Date().timeIntervalSince1970)
        )

        return ZhtpResponseWire(
            request_id: Data(),
            status: statusCode.uint16Value,
            response: response,
            error_code: nil,
            error_message: bodyString
        )
    }

    // Parse response dictionary manually to handle mixed-type headers
    guard let dict = jsonValue as? [String: Any] else {
        throw NSError(domain: "ZhtpCodec", code: -1, userInfo: [NSLocalizedDescriptionKey: "Response is not a dictionary"])
    }

    // Extract required fields
    let version = dict["version"] as? String ?? "1.0"
    let statusMessage = dict["status_message"] as? String ?? ""
    let timestamp = dict["timestamp"] as? UInt64 ?? UInt64(Date().timeIntervalSince1970)

    // Extract status (can be "Ok", "NotFound", etc. or numeric)
    var statusCode: UInt16 = 200
    if let statusStr = dict["status"] as? String {
        // Convert status string to HTTP code
        switch statusStr {
        case "Ok": statusCode = 200
        case "Created": statusCode = 201
        case "BadRequest": statusCode = 400
        case "Unauthorized": statusCode = 401
        case "Forbidden": statusCode = 403
        case "NotFound": statusCode = 404
        case "InternalServerError": statusCode = 500
        default: statusCode = 200
        }
    } else if let statusNum = dict["status"] as? NSNumber {
        statusCode = statusNum.uint16Value
    }

    // Extract body as Data
    var bodyData = Data()
    if let bodyArray = dict["body"] as? [Any] {
        for item in bodyArray {
            if let num = item as? NSNumber {
                bodyData.append(UInt8(truncatingIfNeeded: num.uint64Value))
            }
        }
    } else if let bodyStr = dict["body"] as? String {
        bodyData = Data(bodyStr.utf8)
    }

    // Extract headers - use minimal required fields, ignore problematic optional ones
    var headers = ZhtpHeaders(
        content_type: "application/json",
        content_length: UInt64(bodyData.count),
        dao_fee: 0,
        total_fees: 0
    )
    if let headersDict = dict["headers"] as? [String: Any] {
        if let contentType = headersDict["content_type"] as? String {
            headers = ZhtpHeaders(
                content_type: contentType,
                content_length: UInt64(bodyData.count),
                dao_fee: 0,
                total_fees: 0
            )
        }
    }

    // Build response
    let response = ZhtpResponse(
        version: version,
        status_message: statusMessage,
        headers: headers,
        body: bodyData,
        timestamp: timestamp
    )

    return ZhtpResponseWire(
        request_id: Data(),
        status: statusCode,
        response: response,
        error_code: nil,
        error_message: nil
    )
}

// MARK: - Manual CBOR Encoding/Decoding

/// Encode a JSON-compatible value to CBOR bytes
private func encodeCborValue(_ value: Any) throws -> Data {
    var data = Data()

    if value is NSNull {
        data.append(0xf6) // CBOR null
    } else if let bool = value as? Bool {
        data.append(bool ? 0xf5 : 0xf4) // CBOR true/false
    } else if let number = value as? NSNumber {
        if number === kCFBooleanTrue as NSNumber {
            data.append(0xf5)
        } else if number === kCFBooleanFalse as NSNumber {
            data.append(0xf4)
        } else if CFGetTypeID(number as CFNumber) == CFNumberGetTypeID() {
            let objCType = String(cString: number.objCType)
            if objCType == "q" || objCType == "l" || objCType == "i" {
                // Integer
                let intValue = number.int64Value
                try appendCborInteger(&data, intValue)
            } else {
                // Float/Double
                let doubleValue = number.doubleValue
                try appendCborFloat(&data, doubleValue)
            }
        }
    } else if let string = value as? String {
        try appendCborString(&data, string)
    } else if let array = value as? [Any] {
        try appendCborArray(&data, array)
    } else if let dict = value as? [String: Any] {
        try appendCborMap(&data, dict)
    } else {
        throw NSError(domain: "ZhtpCodec", code: 2, userInfo: [NSLocalizedDescriptionKey: "Unsupported value type"])
    }

    return data
}

/// Decode CBOR bytes to JSON-compatible value
private func decodeCborValue(_ data: Data) throws -> Any {
    var offset = 0
    return try decodeCborAt(data, &offset)
}

private func decodeCborAt(_ data: Data, _ offset: inout Int) throws -> Any {
    guard offset < data.count else {
        throw NSError(domain: "ZhtpCodec", code: 3, userInfo: [NSLocalizedDescriptionKey: "Unexpected end of data"])
    }

    let byte = data[offset]
    offset += 1

    let majorType = (byte & 0xE0) >> 5
    let additionalInfo = byte & 0x1F

    switch majorType {
    case 0: // Unsigned integer
        return try decodeCborUInt(additionalInfo, data, &offset)
    case 1: // Negative integer
        let uintValue = try decodeCborUInt(additionalInfo, data, &offset) as! UInt64
        return -1 - Int64(uintValue)
    case 2, 3: // Byte string or text string
        let lengthValue = try decodeCborUInt(additionalInfo, data, &offset) as! UInt64
        let length = Int(lengthValue)
        let stringData = data.subdata(in: offset..<offset + length)
        offset += length
        if majorType == 2 {
            return [UInt8](stringData)
        } else {
            return String(data: stringData, encoding: .utf8) ?? ""
        }
    case 4: // Array
        let lengthValue = try decodeCborUInt(additionalInfo, data, &offset) as! UInt64
        let length = Int(lengthValue)
        var array: [Any] = []
        for _ in 0..<length {
            array.append(try decodeCborAt(data, &offset))
        }
        return array
    case 5: // Map
        let lengthValue = try decodeCborUInt(additionalInfo, data, &offset) as! UInt64
        let length = Int(lengthValue)
        var dict: [String: Any] = [:]
        for _ in 0..<length {
            let key = try decodeCborAt(data, &offset)
            let value = try decodeCborAt(data, &offset)
            if let keyStr = key as? String {
                dict[keyStr] = value
            }
        }
        return dict
    case 7: // Special types
        if additionalInfo == 20 {
            return NSNull()
        } else if additionalInfo == 21 {
            return false
        } else if additionalInfo == 22 {
            return true
        } else if additionalInfo == 27 {
            let doubleData = data.subdata(in: offset..<offset + 8)
            offset += 8
            var doubleValue: Double = 0
            doubleData.withUnsafeBytes { ptr in
                doubleValue = ptr.load(as: Double.self).bitPattern != 0 ? Double(bitPattern: UInt64(bigEndian: doubleData.withUnsafeBytes { $0.load(as: UInt64.self) })) : 0
            }
            return doubleValue
        }
        return NSNull()
    default:
        throw NSError(domain: "ZhtpCodec", code: 4, userInfo: [NSLocalizedDescriptionKey: "Unknown CBOR major type"])
    }
}

// MARK: - CBOR Encoding Helpers

private func appendCborInteger(_ data: inout Data, _ value: Int64) throws {
    if value >= 0 {
        try appendCborUInt(&data, UInt64(value), majorType: 0)
    } else {
        try appendCborUInt(&data, UInt64(-1 - value), majorType: 1)
    }
}

private func appendCborFloat(_ data: inout Data, _ value: Double) {
    data.append(0xfb) // CBOR double (64-bit float)
    var doubleValue = value
    withUnsafeBytes(of: &doubleValue) { buffer in
        data.append(contentsOf: buffer.reversed())
    }
}

private func appendCborString(_ data: inout Data, _ string: String) throws {
    let stringBytes = string.data(using: .utf8) ?? Data()
    try appendCborUInt(&data, UInt64(stringBytes.count), majorType: 3)
    data.append(stringBytes)
}

private func appendCborArray(_ data: inout Data, _ array: [Any]) throws {
    try appendCborUInt(&data, UInt64(array.count), majorType: 4)
    for item in array {
        data.append(contentsOf: try encodeCborValue(item))
    }
}

private func appendCborMap(_ data: inout Data, _ dict: [String: Any]) throws {
    try appendCborUInt(&data, UInt64(dict.count), majorType: 5)
    for (key, value) in dict.sorted(by: { $0.key < $1.key }) {
        data.append(contentsOf: try encodeCborValue(key))
        data.append(contentsOf: try encodeCborValue(value))
    }
}

private func appendCborUInt(_ data: inout Data, _ value: UInt64, majorType: UInt8) throws {
    let mt: UInt8 = (majorType & 0x07) << 5
    if value < 24 {
        data.append(mt | UInt8(truncatingIfNeeded: value))
    } else if value < 256 {
        data.append(mt | UInt8(24))
        data.append(UInt8(truncatingIfNeeded: value))
    } else if value < 65536 {
        data.append(mt | UInt8(25))
        data.append(UInt8(truncatingIfNeeded: value >> 8))
        data.append(UInt8(truncatingIfNeeded: value & 0xFF))
    } else if value < 4294967296 {
        data.append(mt | UInt8(26))
        data.append(UInt8(truncatingIfNeeded: value >> 24))
        data.append(UInt8(truncatingIfNeeded: value >> 16))
        data.append(UInt8(truncatingIfNeeded: value >> 8))
        data.append(UInt8(truncatingIfNeeded: value & 0xFF))
    } else {
        data.append(mt | UInt8(27))
        data.append(UInt8(truncatingIfNeeded: value >> 56))
        data.append(UInt8(truncatingIfNeeded: value >> 48))
        data.append(UInt8(truncatingIfNeeded: value >> 40))
        data.append(UInt8(truncatingIfNeeded: value >> 32))
        data.append(UInt8(truncatingIfNeeded: value >> 24))
        data.append(UInt8(truncatingIfNeeded: value >> 16))
        data.append(UInt8(truncatingIfNeeded: value >> 8))
        data.append(UInt8(truncatingIfNeeded: value & 0xFF))
    }
}

// MARK: - CBOR Decoding Helpers

private func decodeCborUInt(_ additionalInfo: UInt8, _ data: Data, _ offset: inout Int) throws -> Any {
    if additionalInfo < 24 {
        return UInt64(additionalInfo)
    } else if additionalInfo == 24 {
        guard offset < data.count else { throw NSError(domain: "ZhtpCodec", code: 5, userInfo: nil) }
        let value = UInt64(data[offset])
        offset += 1
        return value
    } else if additionalInfo == 25 {
        guard offset + 1 < data.count else { throw NSError(domain: "ZhtpCodec", code: 5, userInfo: nil) }
        let value = (UInt64(data[offset]) << 8) | UInt64(data[offset + 1])
        offset += 2
        return value
    } else if additionalInfo == 26 {
        guard offset + 3 < data.count else { throw NSError(domain: "ZhtpCodec", code: 5, userInfo: nil) }
        let value = (UInt64(data[offset]) << 24) | (UInt64(data[offset + 1]) << 16) |
                    (UInt64(data[offset + 2]) << 8) | UInt64(data[offset + 3])
        offset += 4
        return value
    } else if additionalInfo == 27 {
        guard offset + 7 < data.count else { throw NSError(domain: "ZhtpCodec", code: 5, userInfo: nil) }
        var value: UInt64 = 0
        for i in 0..<8 {
            value = (value << 8) | UInt64(data[offset + i])
        }
        offset += 8
        return value
    }
    throw NSError(domain: "ZhtpCodec", code: 6, userInfo: [NSLocalizedDescriptionKey: "Invalid CBOR uint encoding"])
}
