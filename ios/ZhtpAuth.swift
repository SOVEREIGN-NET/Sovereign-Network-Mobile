import Foundation
import CryptoKit

// MARK: - ZHTP Authentication (Public Mode)

/// Session state for authenticated connections
struct AuthSession {
    let sessionId: Data           // [u8; 16] from handshake
    let appKey: Data              // [u8; 32] from HKDF derivation
    var sequence: UInt64          // monotonic counter, incremented per request
    let clientDid: String         // client identity
    let serverDid: String         // server identity
    let createdAt: Date           // session creation timestamp
    var lastActivity: Date        // last request timestamp

    /// Check if session is still valid
    /// - Not idle for > 5 minutes
    /// - Not older than 1 hour
    func isValid() -> Bool {
        let now = Date()

        // 5-minute idle timeout
        if now.timeIntervalSince(lastActivity) > 300 {
            return false
        }

        // 1-hour age limit
        if now.timeIntervalSince(createdAt) > 3600 {
            return false
        }

        return true
    }

    /// Update last activity timestamp
    mutating func touch() {
        lastActivity = Date()
    }

    /// Increment sequence counter for next request
    mutating func nextSequence() -> UInt64 {
        let current = sequence
        sequence = sequence &+ 1
        return current
    }
}

/// Authentication context sent in ZHTP request header
struct AuthContext: Codable {
    let session_id: Data    // [u8; 16]
    let client_did: String
    let sequence: UInt64
    let request_mac: Data   // [u8; 32]
}

// MARK: - Canonical Request Hash

/// Compute canonical hash of request following exact server order
/// Hash input:
/// 1. WIRE_VERSION (u16 LE) = 1
/// 2. request_id (16 bytes)
/// 3. timestamp_ms (u64 LE)
/// 4. method encoded (1 byte)
/// 5. uri (length-prefixed string)
/// 6. headers in fixed order (content_type, content_length, content_encoding, cache_control)
/// 7. body (length-prefixed bytes)
func computeCanonicalRequestHash(
    requestId: Data,
    timestampMs: UInt64,
    method: ZhtpMethod,
    uri: String,
    headers: ZhtpHeaders,
    body: Data
) -> Data {
    var hashInput = Data()

    // 1. WIRE_VERSION (u16 LE) = 1
    var version: UInt16 = 1
    hashInput.append(Data(bytes: &version, count: MemoryLayout<UInt16>.size))

    // 2. request_id (16 bytes)
    hashInput.append(requestId)

    // 3. timestamp_ms (u64 LE)
    var timestampLe = timestampMs.littleEndian
    hashInput.append(Data(bytes: &timestampLe, count: MemoryLayout<UInt64>.size))

    // 4. method encoded (1 byte)
    let methodByte: UInt8 = UInt8(method.wireValue)
    hashInput.append(methodByte)

    // 5. uri (length-prefixed string)
    let uriBytes = uri.data(using: .utf8) ?? Data()
    var uriLength = UInt32(uriBytes.count).littleEndian
    hashInput.append(Data(bytes: &uriLength, count: MemoryLayout<UInt32>.size))
    hashInput.append(uriBytes)

    // 6. headers in fixed order
    // content_type (present flag + length + bytes)
    if let ct = headers.content_type {
        hashInput.append(0x01) // present flag
        let ctBytes = ct.data(using: .utf8) ?? Data()
        var ctLength = UInt32(ctBytes.count).littleEndian
        hashInput.append(Data(bytes: &ctLength, count: MemoryLayout<UInt32>.size))
        hashInput.append(ctBytes)
    } else {
        hashInput.append(0x00) // not present
    }

    // content_length (present flag + u64 LE)
    if let cl = headers.content_length {
        hashInput.append(0x01)
        var clLe = cl.littleEndian
        hashInput.append(Data(bytes: &clLe, count: MemoryLayout<UInt64>.size))
    } else {
        hashInput.append(0x00)
    }

    // content_encoding (present flag + length + bytes)
    if let ce = headers.content_encoding {
        hashInput.append(0x01)
        let ceBytes = ce.data(using: .utf8) ?? Data()
        var ceLength = UInt32(ceBytes.count).littleEndian
        hashInput.append(Data(bytes: &ceLength, count: MemoryLayout<UInt32>.size))
        hashInput.append(ceBytes)
    } else {
        hashInput.append(0x00)
    }

    // cache_control (present flag + length + bytes)
    if let cc = headers.cache_control {
        hashInput.append(0x01)
        let ccBytes = cc.data(using: .utf8) ?? Data()
        var ccLength = UInt32(ccBytes.count).littleEndian
        hashInput.append(Data(bytes: &ccLength, count: MemoryLayout<UInt32>.size))
        hashInput.append(ccBytes)
    } else {
        hashInput.append(0x00)
    }

    // 7. body (length-prefixed bytes)
    var bodyLength = UInt32(body.count).littleEndian
    hashInput.append(Data(bytes: &bodyLength, count: MemoryLayout<UInt32>.size))
    hashInput.append(body)

    // Hash with BLAKE3-like function (using SHA256 as fallback, BLAKE3 for production)
    return SHA256.hash(data: hashInput).withUnsafeBytes { Data($0) }
}

// MARK: - MAC Computation

/// Compute request MAC using BLAKE3-like keyed hashing (SHA256 as fallback)
/// MAC = BLAKE3_keyed(app_key, session_id || sequence || canonical_hash)
func computeRequestMac(
    appKey: Data,
    sessionId: Data,
    sequence: UInt64,
    canonicalHash: Data
) -> Data {
    var macInput = Data()
    macInput.append(sessionId)

    var seqLe = sequence.littleEndian
    macInput.append(Data(bytes: &seqLe, count: MemoryLayout<UInt64>.size))
    macInput.append(canonicalHash)

    // BLAKE3-compatible keyed hash (using HMAC-SHA256 as fallback)
    let keyHash = SHA256.hash(data: appKey)
    let keyData = Data(keyHash).prefix(32)

    let key = SymmetricKey(data: keyData)
    let hmac = HMAC<SHA256>.authenticationCode(for: macInput, using: key)
    return Data(hmac)
}

/// Derive app_key from master_key using BLAKE3
/// app_key = blake3("zhtp-web4-app-mac" || master_key || session_id || server_did || client_did)
func deriveAppKey(
    masterKey: Data,
    sessionId: Data,
    serverDid: String,
    clientDid: String
) -> Data {
    var input = Data()
    input.append("zhtp-web4-app-mac".data(using: .utf8) ?? Data())
    input.append(masterKey)
    input.append(sessionId)
    input.append(serverDid.data(using: .utf8) ?? Data())
    input.append(clientDid.data(using: .utf8) ?? Data())

    let hash = SHA256.hash(data: input)
    return Data(hash).prefix(32)
}

/// Derive master key from session components (BLAKE3-like)
/// Master Key = BLAKE3(
///   "zhtp-quic-master" ||
///   uhp_session_key || pqc_shared_secret || uhp_transcript_hash || peer_node_id
/// )
func deriveMasterKey(
    uhpSessionKey: Data,
    pqcSharedSecret: Data,
    uhpTranscriptHash: Data,
    peerNodeId: String
) -> Data {
    var input = Data()
    input.append("zhtp-quic-master".data(using: .utf8) ?? Data())
    input.append(uhpSessionKey)
    input.append(pqcSharedSecret)
    input.append(uhpTranscriptHash)
    input.append(peerNodeId.data(using: .utf8) ?? Data())

    let hash = SHA256.hash(data: input)
    return Data(hash).prefix(32)
}

/// Build AuthContext for a request
func buildAuthContext(session: AuthSession, canonicalHash: Data) throws -> AuthContext {
    var mutableSession = session
    let sequence = mutableSession.nextSequence()

    let requestMac = computeRequestMac(
        appKey: session.appKey,
        sessionId: session.sessionId,
        sequence: sequence,
        canonicalHash: canonicalHash
    )

    return AuthContext(
        session_id: session.sessionId,
        client_did: session.clientDid,
        sequence: sequence,
        request_mac: requestMac
    )
}

// MARK: - ZhtpMethod Wire Encoding

extension ZhtpMethod {
    var wireValue: Int {
        switch self {
        case .get: return 0
        case .post: return 1
        case .put: return 2
        case .delete: return 3
        case .options: return 4
        case .head: return 5
        case .patch: return 6
        case .verify: return 7
        case .connect: return 8
        case .trace: return 9
        }
    }
}
