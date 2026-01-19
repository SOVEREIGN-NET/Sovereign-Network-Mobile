import Foundation
import Security

// MARK: - UHP v2 Authentication Implementation
//
// This file implements the post-handshake authentication layer for UHP v2.
// The handshake itself is performed by the Rust FFI layer (UhpHandshake.swift).
//
// ARCHITECTURE:
//   1. Handshake Phase (Rust Layer - UhpHandshake.swift)
//      - ClientHello: sends DID + Dilithium5 PK + Kyber1024 PK + challenge_nonce
//      - ServerHello: receives server identity, validates signature, extracts nonces
//      - ClientFinish: sends Kyber ciphertext, derives session keys
//      - Returns: sessionKey, sessionId (32 bytes), handshakeHash, peerDid
//
//   2. Session Derivation (Rust FFI result)
//      - sessionKey: 32-byte hybrid key (HKDF(kyberSharedSecret, classicalKey))
//      - sessionId: 32-byte HKDF(sessionKey, clientNonce || serverNonce)
//      - handshakeHash: 32-byte SHA3-256(transcript)
//
//   3. Authenticated Request Phase (iOS Layer - this file)
//      - Create AuthSession from handshake results
//      - For each request:
//        a. Increment monotonic counter (strict: no equal, no backwards)
//        b. Build canonical request: [method|pathLen|path|bodyLen|body|counter|sessionId]
//        c. MAC = HMAC-SHA3-256(macKey, canonicalRequest)
//        d. Send: [sessionId|counter|MAC] + request
//
// CRITICAL SECURITY PROPERTIES:
//   - Server signature verified in Rust layer (MITM protection)
//   - Timestamp skew validated in Rust layer (5-minute window, 300 seconds)
//   - MAC computed over EXACT canonical format (prevents tampering)
//   - Counter strictly monotonic (replay protection)
//   - Session ID exactly 32 bytes (protocol compliance)
//   - PQC hybrid key exchange mandatory (Kyber1024 + classical)
//
// SPECIFICATION REFERENCES:
//   - UHP v2 Handshake: lib-network/src/handshake/core.rs
//   - Session Keys: sdk-ts/src/quic/uhp_v2_handshake.ts:714-741
//   - MAC Computation: lib-network/src/protocols/types/session.rs:655-768

// MARK: - ZHTP Authentication (Public Mode)

/// Session state for authenticated connections
struct AuthSession {
    let sessionId: Data           // Session ID (16 or 32 bytes, per server)
    let macKey: Data              // [u8; 32] from HKDF derivation
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

    /// Increment sequence counter for next request (wraps on overflow)
    /// UHP v2 requires strict monotonic increasing with no duplicates
    mutating func nextSequence() -> UInt64 {
        let current = sequence
        sequence = sequence &+ 1  // Wraps on overflow (unlikely in practice)
        return current
    }

    /// Validate that sequence never goes backwards (critical for replay protection)
    func validateSequenceNotRepeated(_ newSequence: UInt64) -> Bool {
        // Sequence must always be strictly increasing (never equal or less than previous)
        return newSequence > sequence
    }
}

func deriveMacKey(sessionKey: Data, handshakeHash: Data) throws -> Data {
    let info = "zhtp/v2/mac_key".data(using: .utf8) ?? Data()
    return try hkdfSha3(ikm: sessionKey, salt: handshakeHash, info: info, outputLength: 32)
}

/// Authentication context sent in ZHTP request header
struct AuthContext: Codable {
    let session_id: Data    // [u8; 32] - UHP v2 fixed size
    let client_did: String
    let sequence: UInt64
    let request_mac: Data   // [u8; 32] - HMAC-SHA3-256 output
}

// MARK: - Canonical Request Bytes (UHP v2)

/// Build canonical request bytes for MAC computation
///
/// Format (big-endian throughout, except signature is already BE):
/// [method: u8][pathLen: u16 BE][path bytes][bodyLen: u32 BE][body bytes][counter: u64 BE][sessionId: 32 bytes]
///
/// This exact format MUST be used for both MAC computation and verification.
/// Order is critical - any deviation will cause MAC mismatch.
func buildMacInput(
    method: ZhtpMethod,
    path: String,
    body: Data,
    counter: UInt64,
    sessionId: Data
) -> Data? {
    guard let methodByte = zhtpMethodByte(method) else {
        return nil
    }

    // Validate session ID is exactly 32 bytes (UHP v2 requirement)
    guard sessionId.count == 32 else {
        print("[MAC] ERROR: Session ID must be exactly 32 bytes, got \(sessionId.count)")
        return nil
    }

    let pathBytes = path.data(using: .utf8) ?? Data()
    guard pathBytes.count <= UInt16.max else {
        print("[MAC] ERROR: Path too long: \(pathBytes.count) bytes (max \(UInt16.max))")
        return nil
    }
    guard body.count <= UInt32.max else {
        print("[MAC] ERROR: Body too long: \(body.count) bytes (max \(UInt32.max))")
        return nil
    }

    var data = Data()

    // 1. Method (1 byte)
    data.append(methodByte)

    // 2. Path length (2 bytes BE) + path bytes
    var pathLen = UInt16(pathBytes.count).bigEndian
    data.append(Data(bytes: &pathLen, count: MemoryLayout<UInt16>.size))
    data.append(pathBytes)

    // 3. Body length (4 bytes BE) + body bytes
    var bodyLen = UInt32(body.count).bigEndian
    data.append(Data(bytes: &bodyLen, count: MemoryLayout<UInt32>.size))
    data.append(body)

    // 4. Counter (8 bytes BE)
    var counterBe = counter.bigEndian
    data.append(Data(bytes: &counterBe, count: MemoryLayout<UInt64>.size))

    // 5. Session ID (32 bytes)
    data.append(sessionId)

    return data
}

private func zhtpMethodByte(_ method: ZhtpMethod) -> UInt8? {
    switch method {
    case .get: return 0
    case .post: return 1
    case .put: return 2
    case .delete: return 3
    default: return nil
    }
}

// MARK: - MAC Computation (UHP v2)

func hkdfSha3(
    ikm: Data,
    salt: Data,
    info: Data,
    outputLength: Int
) throws -> Data {
    var output = Data(count: outputLength)
    let result = output.withUnsafeMutableBytes { outBuf -> Int32 in
        guard let outPtr = outBuf.baseAddress?.assumingMemoryBound(to: UInt8.self) else {
            return -1
        }
        return ikm.withUnsafeBytes { ikmBuf in
            guard let ikmPtr = ikmBuf.baseAddress?.assumingMemoryBound(to: UInt8.self) else {
                return -1
            }
            return salt.withUnsafeBytes { saltBuf in
                let saltPtr = saltBuf.baseAddress?.assumingMemoryBound(to: UInt8.self)
                return info.withUnsafeBytes { infoBuf in
                    let infoPtr = infoBuf.baseAddress?.assumingMemoryBound(to: UInt8.self)
                    return uhp_hkdf_sha3_256(
                        ikmPtr,
                        ikm.count,
                        saltPtr,
                        salt.count,
                        infoPtr,
                        info.count,
                        outPtr,
                        outputLength
                    )
                }
            }
        }
    }

    if result != 0 {
        throw NSError(domain: "UHP", code: -1, userInfo: [NSLocalizedDescriptionKey: "HKDF failed"])
    }

    return output
}

func hmacSha3(key: Data, message: Data) throws -> Data {
    var output = Data(count: 32)
    let result = output.withUnsafeMutableBytes { outBuf -> Int32 in
        guard let outPtr = outBuf.baseAddress?.assumingMemoryBound(to: UInt8.self) else {
            return -1
        }
        return key.withUnsafeBytes { keyBuf in
            guard let keyPtr = keyBuf.baseAddress?.assumingMemoryBound(to: UInt8.self) else {
                return -1
            }
            return message.withUnsafeBytes { msgBuf in
                guard let msgPtr = msgBuf.baseAddress?.assumingMemoryBound(to: UInt8.self) else {
                    return -1
                }
                return uhp_hmac_sha3_256(
                    keyPtr,
                    key.count,
                    msgPtr,
                    message.count,
                    outPtr,
                    32
                )
            }
        }
    }

    if result != 0 {
        throw NSError(domain: "UHP", code: -1, userInfo: [NSLocalizedDescriptionKey: "HMAC failed"])
    }

    return output
}

/// Build AuthContext for a request (computes MAC)
///
/// Performs these steps:
/// 1. Get next monotonic sequence number
/// 2. Build canonical request bytes
/// 3. Compute HMAC-SHA3-256(macKey, canonicalRequest)
/// 4. Return AuthContext with sessionId, clientDid, sequence, and MAC
func buildAuthContext(
    session: inout AuthSession,
    method: ZhtpMethod,
    path: String,
    body: Data
) throws -> AuthContext {
    let sequence = session.nextSequence()

    guard let macInput = buildMacInput(
        method: method,
        path: path,
        body: body,
        counter: sequence,
        sessionId: session.sessionId
    ) else {
        throw NSError(domain: "ZHTP", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid MAC input"])
    }

    let requestMac = try hmacSha3(key: session.macKey, message: macInput)

    print("[Auth] Request MAC computed: sequence=\(sequence), macLen=\(requestMac.count), inputLen=\(macInput.count)")

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

// MARK: - UHP Identity Keystore Loader

struct UhpPrivateKeyBytesData {
    let dilithiumSk: Data
    let kyberSk: Data
    let masterSeed: Data
}

struct UhpIdentityMaterials {
    let identityJson: Data
    let identityDid: String
    let privateKey: UhpPrivateKeyBytesData
}

private struct UhpPrivateKeyJson: Decodable {
    let dilithium_sk: [UInt8]
    let kyber_sk: [UInt8]
    let master_seed: [UInt8]
}

enum UhpKeystore {
    private static let keychainService = "com.sovereign.zhtp"
    private static let keychainAccountPrefix = "private_key_"

    /// Store identity materials when synced from server
    static func storeIdentityMaterials(identityId: String, identityJson: Data, privateKeyJson: Data) -> Bool {
        guard let documentsDir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
            print("[UhpKeystore] Failed to get Documents directory")
            return false
        }

        let keystoreDir = documentsDir.appendingPathComponent("keystore")
        let identityDir = keystoreDir.appendingPathComponent(identityId)

        do {
            // Create directories if they don't exist
            try FileManager.default.createDirectory(at: identityDir, withIntermediateDirectories: true)

            // Store identity JSON file
            let identityPath = identityDir.appendingPathComponent("user_identity.json")
            try identityJson.write(to: identityPath)
            print("[UhpKeystore] ✅ Stored identity JSON at: \(identityPath)")

            // Store private key in Keychain
            let success = storePrivateKeyJson(identityId: identityId, data: privateKeyJson, requireUserPresence: true)
            if success {
                print("[UhpKeystore] ✅ Stored private key in Keychain")
                return true
            } else {
                print("[UhpKeystore] ❌ Failed to store private key in Keychain")
                return false
            }
        } catch {
            print("[UhpKeystore] ❌ Failed to store identity: \(error)")
            return false
        }
    }

    static func loadIdentityForHandshake(identityId: String) -> UhpIdentityMaterials? {
        let trimmedId = identityId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedId.isEmpty else {
            print("[UhpKeystore] ❌ Identity ID is empty")
            return nil
        }

        guard let identityJson = loadIdentityJson(identityId: trimmedId) else {
            print("[UhpKeystore] ❌ Failed to load identity JSON from Documents/keystore/\(trimmedId)/user_identity.json")
            return nil
        }
        print("[UhpKeystore] ✅ Loaded identity JSON (\(identityJson.count) bytes)")

        guard let identityDid = parseIdentityDid(identityJson) else {
            print("[UhpKeystore] ❌ Failed to parse DID from identity JSON")
            return nil
        }
        print("[UhpKeystore] ✅ Parsed identity DID: \(identityDid)")

        guard let privateKeyJson = loadPrivateKeyJson(identityId: trimmedId) else {
            print("[UhpKeystore] ❌ Failed to load private key from Keychain with account 'private_key_\(trimmedId)'")
            return nil
        }
        print("[UhpKeystore] ✅ Loaded private key JSON from Keychain (\(privateKeyJson.count) bytes)")

        guard let privateKey = decodePrivateKey(privateKeyJson) else {
            print("[UhpKeystore] ❌ Failed to decode private key JSON (missing or invalid dilithium_sk, kyber_sk, master_seed)")
            return nil
        }
        print("[UhpKeystore] ✅ Decoded private key: Dilithium(\(privateKey.dilithiumSk.count)) Kyber(\(privateKey.kyberSk.count)) Seed(\(privateKey.masterSeed.count))")

        return UhpIdentityMaterials(identityJson: identityJson, identityDid: identityDid, privateKey: privateKey)
    }

    private static func loadIdentityJson(identityId: String) -> Data? {
        guard let documentsDir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
            print("[UhpKeystore] Failed to get Documents directory")
            return nil
        }

        let keystoreDir = documentsDir.appendingPathComponent("keystore")
        let identityDir = keystoreDir.appendingPathComponent(identityId)
        let identityPath = identityDir.appendingPathComponent("user_identity.json")

        do {
            return try Data(contentsOf: identityPath)
        } catch {
            print("[UhpKeystore] ⚠️ Identity file missing at: \(identityPath)")
            print("[UhpKeystore] This identity needs to be synced from the server or created.")
            print("[UhpKeystore] Expected identity materials:")
            print("[UhpKeystore]   - Dilithium5 signing keypair (for UHP v2 ClientHello signature)")
            print("[UhpKeystore]   - Kyber1024 KEM keypair (for post-quantum key exchange)")
            print("[UhpKeystore]   - Identity DID, public keys, node ID, device ID, timestamp")
            print("[UhpKeystore]")
            print("[UhpKeystore] Next steps:")
            print("[UhpKeystore]   1. Fetch identity from server: GET /api/v1/identities/\(identityId)")
            print("[UhpKeystore]   2. Store response at: \(identityPath)")
            print("[UhpKeystore]   3. Also store key materials in Keychain with account: private_key_\(identityId)")
            return nil
        }
    }

    static func storePrivateKeyJson(identityId: String, data: Data, requireUserPresence: Bool) -> Bool {
        let account = "\(keychainAccountPrefix)\(identityId)"
        guard let access = createAccessControl(requireUserPresence: requireUserPresence) else { return false }

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
        ]

        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessControl as String: access,
        ]

        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecSuccess {
            return true
        }

        var addQuery = query
        addQuery[kSecValueData as String] = data
        addQuery[kSecAttrAccessControl as String] = access
        addQuery[kSecUseAuthenticationUI as String] = kSecUseAuthenticationUIAllow
        let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
        return addStatus == errSecSuccess
    }

    private static func loadPrivateKeyJson(identityId: String) -> Data? {
        let account = "\(keychainAccountPrefix)\(identityId)"
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]

        query[kSecUseOperationPrompt as String] = "Authenticate to access your private key"

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess else {
            let errorMsg: String
            switch status {
            case errSecItemNotFound:
                errorMsg = "Item not found in Keychain"
            case errSecAuthFailed:
                errorMsg = "Authentication failed (user denied)"
            case errSecUserCanceled:
                errorMsg = "User cancelled authentication"
            default:
                errorMsg = "OSStatus \(status)"
            }
            print("[UhpKeystore] Keychain lookup failed for '\(account)': \(errorMsg)")
            return nil
        }

        guard let data = item as? Data else {
            print("[UhpKeystore] Keychain item is not Data type")
            return nil
        }

        return data
    }

    private static func decodePrivateKey(_ data: Data) -> UhpPrivateKeyBytesData? {
        do {
            let decoded = try JSONDecoder().decode(UhpPrivateKeyJson.self, from: data)
            return UhpPrivateKeyBytesData(
                dilithiumSk: Data(decoded.dilithium_sk),
                kyberSk: Data(decoded.kyber_sk),
                masterSeed: Data(decoded.master_seed)
            )
        } catch {
            print("[UhpKeystore] JSON decode error: \(error)")
            if let jsonStr = String(data: data, encoding: .utf8) {
                print("[UhpKeystore] JSON content: \(jsonStr.prefix(200))...")
            }
            return nil
        }
    }

    private static func parseIdentityDid(_ identityJson: Data) -> String? {
        guard
            let obj = try? JSONSerialization.jsonObject(with: identityJson),
            let dict = obj as? [String: Any],
            let did = dict["did"] as? String,
            !did.isEmpty
        else {
            return nil
        }
        return did
    }

    private static func createAccessControl(requireUserPresence: Bool) -> SecAccessControl? {
        let flags: SecAccessControlCreateFlags = requireUserPresence ? .userPresence : []
        return SecAccessControlCreateWithFlags(
            nil,
            kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            flags,
            nil
        )
    }
}
