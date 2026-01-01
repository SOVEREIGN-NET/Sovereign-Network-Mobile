import Foundation

// MARK: - ZHTP CBOR Codec

/// Encode ZHTP request to CBOR bytes
/// Converts Codable struct to CBOR format using serde-compatible encoding
func zhtp_encode_request(_ request: ZhtpRequestWire) throws -> Data {
    // Step 1: Encode to JSON first (Codable → JSON)
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    let jsonData = try encoder.encode(request)

    // Step 2: Convert JSON to CBOR manually
    // Parse JSON and convert to CBOR byte format
    let jsonObject = try JSONSerialization.jsonObject(with: jsonData)

    return try encodeCborValue(jsonObject)
}

/// Decode CBOR bytes to ZHTP response
/// Converts CBOR format to Codable struct
func zhtp_decode_response(_ cbor_bytes: Data) throws -> ZhtpResponseWire {
    // Step 1: Decode CBOR to JSON-compatible value
    let jsonValue = try decodeCborValue(cbor_bytes)

    // Step 2: Convert to Data and JSONDecode
    let jsonData = try JSONSerialization.data(withJSONObject: jsonValue)
    let decoder = JSONDecoder()
    return try decoder.decode(ZhtpResponseWire.self, from: jsonData)
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
        let value = try decodeCborUInt(additionalInfo, data, &offset) as! Int64
        return -1 - value
    case 2, 3: // Byte string or text string
        let length = try decodeCborUInt(additionalInfo, data, &offset) as! Int
        let stringData = data.subdata(in: offset..<offset + length)
        offset += length
        if majorType == 2 {
            return stringData
        } else {
            return String(data: stringData, encoding: .utf8) ?? ""
        }
    case 4: // Array
        let length = try decodeCborUInt(additionalInfo, data, &offset) as! Int
        var array: [Any] = []
        for _ in 0..<length {
            array.append(try decodeCborAt(data, &offset))
        }
        return array
    case 5: // Map
        let length = try decodeCborUInt(additionalInfo, data, &offset) as! Int
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
    let mt = (majorType & 0x07) << 5
    if value < 24 {
        data.append(mt | UInt8(value))
    } else if value < 256 {
        data.append(mt | 24)
        data.append(UInt8(value))
    } else if value < 65536 {
        data.append(mt | 25)
        data.append(UInt8(value >> 8))
        data.append(UInt8(value))
    } else if value < 4294967296 {
        data.append(mt | 26)
        data.append(UInt8(value >> 24))
        data.append(UInt8(value >> 16))
        data.append(UInt8(value >> 8))
        data.append(UInt8(value))
    } else {
        data.append(mt | 27)
        data.append(UInt8(value >> 56))
        data.append(UInt8(value >> 48))
        data.append(UInt8(value >> 40))
        data.append(UInt8(value >> 32))
        data.append(UInt8(value >> 24))
        data.append(UInt8(value >> 16))
        data.append(UInt8(value >> 8))
        data.append(UInt8(value))
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
