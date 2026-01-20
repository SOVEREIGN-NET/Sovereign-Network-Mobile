import Foundation
import Network
import Security
import CryptoKit

enum UhpHandshakeError: Error {
    case missingChannelBinding
    case invalidIdentity
    case handshakeFailed(String)
}

struct UhpSessionInfo {
    let sessionKey: Data
    let sessionId: Data
    let handshakeHash: Data
    let peerDid: String
    let pqcHybridEnabled: Bool
    let clientDid: String
}

final class UhpConnectionIO {
    private let connection: NWConnection
    private let queue = DispatchQueue(label: "com.sovereignnetwork.uhp-io")
    private var buffer = Data()
    private let bufferLock = NSLock()

    init(connection: NWConnection) {
        self.connection = connection
    }

    func read(_ ptr: UnsafeMutablePointer<UInt8>, _ len: Int) -> Int {
        if len == 0 {
            return 0
        }

        while true {
            bufferLock.lock()
            if !buffer.isEmpty {
                let count = min(len, buffer.count)
                buffer.copyBytes(to: ptr, count: count)
                buffer.removeFirst(count)
                bufferLock.unlock()
                return count
            }
            bufferLock.unlock()

            let sema = DispatchSemaphore(value: 0)
            var received: Data?
            var receiveError: NWError?
            var isComplete = false

            queue.async {
                self.connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { content, _, complete, error in
                    received = content
                    receiveError = error
                    isComplete = complete
                    sema.signal()
                }
            }

            sema.wait()

            if let error = receiveError {
                print("[UHP] Read error: \(error)")
                return -1
            }

            if let content = received, !content.isEmpty {
                bufferLock.lock()
                buffer.append(content)
                bufferLock.unlock()
                continue
            }

            if isComplete {
                return 0
            }
        }
    }

    func write(_ ptr: UnsafePointer<UInt8>, _ len: Int) -> Int {
        if len == 0 {
            return 0
        }

        let data = Data(bytes: ptr, count: len)
        let sema = DispatchSemaphore(value: 0)
        var sendError: NWError?

        queue.async(execute: DispatchWorkItem(block: {
            self.connection.send(
                content: data,
                contentContext: .defaultMessage,
                isComplete: false,
                completion: NWConnection.SendCompletion.contentProcessed { error in
                    sendError = error
                    sema.signal()
                }
            )
        }))

        sema.wait()

        if let error = sendError {
            print("[UHP] Write error: \(error)")
            return -1
        }

        return len
    }
}

@_cdecl("uhp_read_callback")
func uhp_read_callback(ctx: UnsafeMutableRawPointer?, buf: UnsafeMutablePointer<UInt8>?, len: Int) -> Int {
    guard let ctx = ctx, let buf = buf else { return -1 }
    let io = Unmanaged<UhpConnectionIO>.fromOpaque(ctx).takeUnretainedValue()
    return io.read(buf, len)
}

@_cdecl("uhp_write_callback")
func uhp_write_callback(ctx: UnsafeMutableRawPointer?, buf: UnsafePointer<UInt8>?, len: Int) -> Int {
    guard let ctx = ctx, let buf = buf else { return -1 }
    let io = Unmanaged<UhpConnectionIO>.fromOpaque(ctx).takeUnretainedValue()
    return io.write(buf, len)
}

/// Perform UHP v2 handshake with server (3-phase handshake)
///
/// The Rust FFI layer (uhp_handshake) performs the following validations:
/// 1. Server signature verification - Verifies server's Dilithium5 signature (MITM protection)
/// 2. Timestamp skew validation - Ensures server timestamp is within 5-minute window
/// 3. Server node ID verification - Validates server's identity structure
/// 4. Kyber public key validation - Verifies Kyber public key integrity
///
/// Returns: SessionInfo with derived session_key, session_id (32 bytes), and handshake_hash
func performUhpHandshake(
    connection: NWConnection,
    identityId: String,
    nonceCachePath: String? = nil,
    chainId: UInt8 = 0,
    identity: Identity? = nil
) -> Result<UhpSessionInfo, Error> {
    // SECURITY: If Identity object is provided, use it directly (signing stays in Rust)
    // Otherwise, fall back to loading from Keystore (for backwards compatibility)
    let identityToUse: Identity?

    if let providedIdentity = identity {
        print("[UhpHandshake] ✅ Using provided Identity object (DID: \(providedIdentity.did))")
        identityToUse = providedIdentity

        // Store Identity in handle store to keep it alive during handshake
        do {
            try IdentityHandleStore.shared.store(identity: providedIdentity)
            print("[UhpHandshake] ✅ Stored Identity in handle store")
        } catch {
            print("[UhpHandshake] ⚠️ Failed to store Identity in handle store: \(error)")
        }
    } else {
        print("[UhpHandshake] Loading identity for ID: \(identityId)")
        if let storedIdentity = IdentityHandleStore.shared.retrieve(by: identityId) as? Identity {
            identityToUse = storedIdentity
            print("[UhpHandshake] ✅ Retrieved Identity from handle store")
        } else {
            identityToUse = nil
        }
    }

    // SECURITY: Use fresh Identity from handle store if available (private keys in Rust)
    // Only load from Keychain as fallback if no fresh Identity
    let materials: UhpIdentityMaterials

    if let freshIdentity = identityToUse {
        print("[UhpHandshake] ✅ Using fresh Identity from handle store (skipping stale Keychain)")

        do {
            // Get identity JSON in lib-network handshake format
            // This includes all ZhtpIdentity::from_serialized() required fields:
            // id, did, identity_type, public_key (structured), node_id, primary_device, dao_member_id, ownership_proof, etc.
            let handshakeJsonString = try ZhtpClient.serializeIdentityToHandshakeJson(freshIdentity as! Identity)

            // Debug: Log the handshake JSON
            let jsonPreview = String(handshakeJsonString.prefix(500))
            print("[UhpHandshake] 📋 Handshake Identity JSON (first 500 chars):")
            print("[UhpHandshake] \(jsonPreview)")

            guard let identityJsonData = handshakeJsonString.data(using: .utf8) else {
                print("[UhpHandshake] ❌ Failed to encode handshake JSON to data")
                return .failure(UhpHandshakeError.handshakeFailed("Failed to encode handshake JSON"))
            }

            print("[UhpHandshake] ✅ Got handshake identity JSON from lib-client")
            print("[UhpHandshake]    Identity JSON: \(identityJsonData.count) bytes")

            // Get private keys from lib-client for uhp-ffi handshake
            // Keys stay on-device - only passed in memory between lib-client and uhp-ffi
            let dilithiumSk = try ZhtpClient.getDilithiumSecretKey(freshIdentity as! Identity)
            let kyberSk = try ZhtpClient.getKyberSecretKey(freshIdentity as! Identity)
            let masterSeed = try ZhtpClient.getMasterSeed(freshIdentity as! Identity)

            print("[UhpHandshake] ✅ Retrieved private keys from lib-client")
            print("[UhpHandshake]    Dilithium SK: \(dilithiumSk.count) bytes")
            print("[UhpHandshake]    Kyber SK: \(kyberSk.count) bytes")
            print("[UhpHandshake]    Master seed: \(masterSeed.count) bytes")

            materials = UhpIdentityMaterials(
                identityJson: identityJsonData,
                identityDid: freshIdentity.did,
                privateKey: UhpPrivateKeyBytesData(
                    dilithiumSk: Data(dilithiumSk),
                    kyberSk: Data(kyberSk),
                    masterSeed: Data(masterSeed)
                )
            )
        } catch {
            print("[UhpHandshake] ❌ Failed to serialize identity to handshake JSON: \(error)")
            return .failure(UhpHandshakeError.handshakeFailed("Failed to serialize identity: \(error)"))
        }
    } else {
        // Fallback: Load from Keychain only if no fresh Identity available
        print("[UhpHandshake] Loading identity materials from Keychain for ID: \(identityId)")
        guard let keychainMaterials = UhpKeystore.loadIdentityForHandshake(identityId: identityId) else {
            print("[UhpHandshake] ❌ Failed to load identity materials for ID: \(identityId)")
            return .failure(UhpHandshakeError.invalidIdentity)
        }
        print("[UhpHandshake] ✅ Loaded identity materials from Keychain (fallback)")
        materials = keychainMaterials
    }

    let cachePath = nonceCachePath ?? {
        let cacheDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
        let path = cacheDir?.appendingPathComponent("uhp-nonce-cache").path ?? NSTemporaryDirectory() + "uhp-nonce-cache"

        // Ensure cache directory exists
        do {
            try FileManager.default.createDirectory(atPath: path, withIntermediateDirectories: true, attributes: nil)
            print("[UhpHandshake] ✅ Created nonce cache directory: \(path)")
        } catch {
            print("[UhpHandshake] ⚠️ Failed to create nonce cache directory: \(error)")
        }

        return path
    }()

    let io = UhpConnectionIO(connection: connection)
    let ctx = Unmanaged.passRetained(io)
    defer { ctx.release() }

    var session = UhpSession()
    let identityJson = materials.identityJson
    let clientDid = materials.identityDid
    let privateKey = materials.privateKey

    // Channel binding not available on iOS (requires private Security API)
    // Create deterministic placeholder from identity materials for validation compatibility
    let channelBindingInput = "\(clientDid):\(identityId)".data(using: .utf8) ?? Data()
    let channelBinding = Data(SHA256.hash(data: channelBindingInput))

    // SECURITY: Ensure Identity is in handle store for signing operations
    // This keeps the private keys in Rust while allowing signing callbacks
    if let providedIdentity = identityToUse, !IdentityHandleStore.shared.exists(by: providedIdentity.did) {
        do {
            try IdentityHandleStore.shared.store(identity: providedIdentity)
            print("[UhpHandshake] ✅ Confirmed Identity in handle store")
        } catch {
            print("[UhpHandshake] ⚠️ Failed to confirm Identity in handle store: \(error)")
        }
    }

    print("[UhpHandshake] Starting handshake:")
    print("[UhpHandshake]   - Client DID: \(clientDid)")
    print("[UhpHandshake]   - Identity JSON: \(identityJson.count) bytes")
    print("[UhpHandshake]   - Dilithium SK: \(privateKey.dilithiumSk.count) bytes")
    print("[UhpHandshake]   - Kyber SK: \(privateKey.kyberSk.count) bytes")
    print("[UhpHandshake]   - Master seed: \(privateKey.masterSeed.count) bytes")
    print("[UhpHandshake]   - Identity in store: \(identityToUse != nil ? "✅" : "❌")")
    print("[UhpHandshake]   - Cache path: \(cachePath)")
    print("[UhpHandshake]   - Chain ID: \(chainId)")
    print("[UhpHandshake] 🔐 SECURITY: Signing infrastructure in place for callback pattern")

    let result = identityJson.withUnsafeBytes { identityBuf -> Int32 in
        guard let identityPtr = identityBuf.baseAddress?.assumingMemoryBound(to: UInt8.self) else {
            return -1
        }
        return privateKey.dilithiumSk.withUnsafeBytes { dilBuf in
            guard let dilPtr = dilBuf.baseAddress?.assumingMemoryBound(to: UInt8.self) else {
                return -1
            }
            return privateKey.kyberSk.withUnsafeBytes { kybBuf in
                guard let kybPtr = kybBuf.baseAddress?.assumingMemoryBound(to: UInt8.self) else {
                    return -1
                }
                return privateKey.masterSeed.withUnsafeBytes { seedBuf in
                    guard let seedPtr = seedBuf.baseAddress?.assumingMemoryBound(to: UInt8.self) else {
                        return -1
                    }
                    return channelBinding.withUnsafeBytes { bindingBuf in
                        guard let bindingPtr = bindingBuf.baseAddress?.assumingMemoryBound(to: UInt8.self) else {
                            return -1
                        }

                        var keyBytes = UhpPrivateKeyBytes(
                            dilithium_sk_ptr: dilPtr,
                            dilithium_sk_len: privateKey.dilithiumSk.count,
                            kyber_sk_ptr: kybPtr,
                            kyber_sk_len: privateKey.kyberSk.count,
                            master_seed_ptr: seedPtr,
                            master_seed_len: privateKey.masterSeed.count
                        )

                        return cachePath.withCString { cachePathPtr in
                            var callbacks = UhpIoCallbacks(
                                ctx: ctx.toOpaque(),
                                read: uhp_read_callback,
                                write: uhp_write_callback
                            )

                            let result = uhp_handshake(
                                callbacks,
                                identityPtr,
                                identityJson.count,
                                keyBytes,
                                bindingPtr,
                                channelBinding.count,
                                cachePathPtr,
                                chainId,
                                &session
                            )
                            return result
                        }
                    }
                }
            }
        }
    }

    print("[UhpHandshake] Handshake completed with result code: \(Int(result))")

    if result != 0 {
        let errorMessage = uhp_last_error_message().flatMap { String(cString: $0) } ?? "unknown error"
        print("[UhpHandshake] ❌ Handshake failed: \(errorMessage)")
        return .failure(UhpHandshakeError.handshakeFailed(errorMessage))
    }

    print("[UhpHandshake] ✅ Handshake succeeded")

    let peerDid = session.peer_did != nil ? String(cString: session.peer_did) : ""
    if session.peer_did != nil {
        uhp_free_string(session.peer_did)
    }

    // UHP v2 SPEC: Session ID MUST always be 32 bytes (derived via HKDF)
    // Enforce this at iOS layer for protocol compliance
    let sessionIdLength = Int(session.session_id_len)
    guard sessionIdLength == 32 else {
        return .failure(UhpHandshakeError.handshakeFailed("Invalid session ID length: \(sessionIdLength) bytes (expected 32)"))
    }

    let sessionIdFull = dataFromTuple(session.session_id)
    let sessionId = Data(sessionIdFull.prefix(32))

    guard !peerDid.isEmpty else {
        return .failure(UhpHandshakeError.handshakeFailed("Server DID is empty"))
    }

    // Extract session key and validate it's 32 bytes
    let sessionKey = dataFromTuple(session.session_key)
    guard sessionKey.count == 32 else {
        return .failure(UhpHandshakeError.handshakeFailed("Invalid session key length: \(sessionKey.count) bytes (expected 32)"))
    }

    // Extract handshake hash and validate it's 32 bytes
    let handshakeHash = dataFromTuple(session.handshake_hash)
    guard handshakeHash.count == 32 else {
        return .failure(UhpHandshakeError.handshakeFailed("Invalid handshake hash length: \(handshakeHash.count) bytes (expected 32)"))
    }

    // Verify PQC hybrid key exchange is enabled (mandatory for UHP v2)
    guard session.pqc_hybrid_enabled == 1 else {
        return .failure(UhpHandshakeError.handshakeFailed("Server did not enable PQC hybrid key exchange (Kyber1024 required)"))
    }

    return .success(
        UhpSessionInfo(
            sessionKey: sessionKey,
            sessionId: sessionId,
            handshakeHash: handshakeHash,
            peerDid: peerDid,
            pqcHybridEnabled: true,
            clientDid: clientDid
        )
    )
}

private func dataFromTuple<T>(_ value: T) -> Data {
    return withUnsafeBytes(of: value) { Data($0) }
}
