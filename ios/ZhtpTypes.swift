import Foundation

// MARK: - ZHTP Types (Public Mode Only)

/// ZHTP HTTP method enum (matches server encoding)
enum ZhtpMethod: Int, Codable {
    case get = 0
    case post = 1
    case put = 2
    case delete = 3
    case options = 4
    case head = 5
    case patch = 6
    case verify = 7
    case connect = 8
    case trace = 9

    var stringValue: String {
        switch self {
        case .get: return "Get"
        case .post: return "Post"
        case .put: return "Put"
        case .delete: return "Delete"
        case .options: return "Options"
        case .head: return "Head"
        case .patch: return "Patch"
        case .verify: return "Verify"
        case .connect: return "Connect"
        case .trace: return "Trace"
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let stringVal = try container.decode(String.self)
        switch stringVal {
        case "Get": self = .get
        case "Post": self = .post
        case "Put": self = .put
        case "Delete": self = .delete
        case "Options": self = .options
        case "Head": self = .head
        case "Patch": self = .patch
        case "Verify": self = .verify
        case "Connect": self = .connect
        case "Trace": self = .trace
        default: throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid method: \(stringVal)")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(stringValue)
    }
}

/// ZHTP Headers - required fields for all requests
struct ZhtpHeaders: Codable {
    let content_type: String
    let content_length: UInt64
    let dao_fee: UInt64
    let total_fees: UInt64
    var content_encoding: String?
    var cache_control: String?
    var network_fee: UInt64?
    var priority: UInt8?

    enum CodingKeys: String, CodingKey {
        case content_type
        case content_length
        case dao_fee
        case total_fees
        case content_encoding
        case cache_control
        case network_fee
        case priority
    }

    init(
        content_type: String,
        content_length: UInt64,
        dao_fee: UInt64 = 0,
        total_fees: UInt64 = 0,
        content_encoding: String? = nil,
        cache_control: String? = nil,
        network_fee: UInt64? = nil,
        priority: UInt8? = nil
    ) {
        self.content_type = content_type
        self.content_length = content_length
        self.dao_fee = dao_fee
        self.total_fees = total_fees
        self.content_encoding = content_encoding
        self.cache_control = cache_control
        self.network_fee = network_fee
        self.priority = priority
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(content_type, forKey: .content_type)
        try container.encode(content_length, forKey: .content_length)
        try container.encode(dao_fee, forKey: .dao_fee)
        try container.encode(total_fees, forKey: .total_fees)
        try container.encodeIfPresent(content_encoding, forKey: .content_encoding)
        try container.encodeIfPresent(cache_control, forKey: .cache_control)
        try container.encodeIfPresent(network_fee, forKey: .network_fee)
        try container.encodeIfPresent(priority, forKey: .priority)
    }
}

/// ZHTP Request - the actual request payload
struct ZhtpRequest: Codable {
    let method: ZhtpMethod
    let uri: String
    let version: String // "1.0"
    let headers: ZhtpHeaders
    let body: Data
    let timestamp: UInt64 // seconds since epoch
    var requester: String?
    var auth_proof: Data?

    enum CodingKeys: String, CodingKey {
        case method
        case uri
        case version
        case headers
        case body
        case timestamp
        case requester
        case auth_proof
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(method, forKey: .method)
        try container.encode(uri, forKey: .uri)
        try container.encode(version, forKey: .version)
        try container.encode(headers, forKey: .headers)
        try container.encode(body, forKey: .body)
        try container.encode(timestamp, forKey: .timestamp)
        try container.encodeIfPresent(requester, forKey: .requester)
        try container.encodeIfPresent(auth_proof, forKey: .auth_proof)
    }
}

/// ZHTP Request Wire - transport envelope (public mode: no auth_context)
struct ZhtpRequestWire: Codable {
    let version: UInt16 // 1
    let request_id: Data // [u8; 16]
    let timestamp_ms: UInt64
    let auth_context: [String: AnyCodable]? // null for public mode
    let request: ZhtpRequest

    enum CodingKeys: String, CodingKey {
        case version
        case request_id
        case timestamp_ms
        case auth_context
        case request
    }

    /// Create a new public request (no authentication)
    static func newPublic(
        method: ZhtpMethod,
        uri: String,
        contentType: String,
        body: Data
    ) -> ZhtpRequestWire {
        let now = Date()
        let timestamp = UInt64(now.timeIntervalSince1970)
        let timestamp_ms = UInt64(now.timeIntervalSince1970 * 1000)

        // Generate 16 random bytes for request_id
        var requestId = Data(count: 16)
        _ = requestId.withUnsafeMutableBytes { buffer in
            SecRandomCopyBytes(kSecRandomDefault, 16, buffer.baseAddress!)
        }

        let headers = ZhtpHeaders(
            content_type: contentType,
            content_length: UInt64(body.count),
            dao_fee: 0,
            total_fees: 0
        )

        let request = ZhtpRequest(
            method: method,
            uri: uri,
            version: "1.0",
            headers: headers,
            body: body,
            timestamp: timestamp,
            requester: nil,
            auth_proof: nil
        )

        return ZhtpRequestWire(
            version: 1,
            request_id: requestId,
            timestamp_ms: timestamp_ms,
            auth_context: nil,
            request: request
        )
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(version, forKey: .version)
        try container.encode(request_id, forKey: .request_id)
        try container.encode(timestamp_ms, forKey: .timestamp_ms)
        try container.encodeIfPresent(auth_context, forKey: .auth_context)
        try container.encode(request, forKey: .request)
    }
}

/// ZHTP Response (nested inside ZhtpResponseWire)
struct ZhtpResponse: Codable {
    let version: String // "1.0"
    let status_message: String
    let headers: ZhtpHeaders
    let body: Data
    let timestamp: UInt64
    var server: String?
    var validity_proof: Data?

    enum CodingKeys: String, CodingKey {
        case version
        case status_message
        case headers
        case body
        case timestamp
        case server
        case validity_proof
    }
}

/// ZHTP Response Wire - transport envelope for responses (NESTED structure)
struct ZhtpResponseWire: Codable {
    let request_id: Data
    let status: UInt16
    let response: ZhtpResponse
    var error_code: UInt16?
    var error_message: String?

    enum CodingKeys: String, CodingKey {
        case request_id
        case status
        case response
        case error_code
        case error_message
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(request_id, forKey: .request_id)
        try container.encode(status, forKey: .status)
        try container.encode(response, forKey: .response)
        try container.encodeIfPresent(error_code, forKey: .error_code)
        try container.encodeIfPresent(error_message, forKey: .error_message)
    }
}

// MARK: - Helper for Optional Types in CBOR

enum AnyCodable: Codable {
    case null
    case bool(Bool)
    case int(Int)
    case double(Double)
    case string(String)
    case array([AnyCodable])
    case dict([String: AnyCodable])

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .null:
            try container.encodeNil()
        case .bool(let value):
            try container.encode(value)
        case .int(let value):
            try container.encode(value)
        case .double(let value):
            try container.encode(value)
        case .string(let value):
            try container.encode(value)
        case .array(let array):
            try container.encode(array)
        case .dict(let dict):
            try container.encode(dict)
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let bool = try? container.decode(Bool.self) {
            self = .bool(bool)
        } else if let int = try? container.decode(Int.self) {
            self = .int(int)
        } else if let double = try? container.decode(Double.self) {
            self = .double(double)
        } else if let string = try? container.decode(String.self) {
            self = .string(string)
        } else if let array = try? container.decode([AnyCodable].self) {
            self = .array(array)
        } else if let dict = try? container.decode([String: AnyCodable].self) {
            self = .dict(dict)
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Cannot decode AnyCodable")
        }
    }
}
