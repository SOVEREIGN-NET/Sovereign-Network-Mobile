import Foundation
import Network
import Security
import CryptoKit
import Dispatch

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
    private var streamInitialized = false
    private let streamLock = NSLock()
    private var lastStreamIdentifier: UInt64?

    init(connection: NWConnection) {
        self.connection = connection
    }

    /// Initialize bidirectional stream for QUIC handshake
    /// Network.framework creates streams implicitly on first send/receive
    /// Just mark as initialized - actual stream creation happens on I/O
    private func ensureStreamInitialized() -> Bool {
        streamLock.lock()
        defer { streamLock.unlock() }

        if streamInitialized {
            return true
        }

        print("[UHP] 📡 Preparing for stream I/O...")

        // Wait for connection ready state (with timeout)
        var attempts = 0
        let maxAttempts = 50 // 5 seconds

        while connection.state != .ready && attempts < maxAttempts {
            Thread.sleep(forTimeInterval: 0.1)
            attempts += 1
        }

        guard connection.state == .ready else {
            print("[UHP] ❌ Connection not ready after \(attempts * 100)ms: \(connection.state)")
            return false
        }

        print("[UHP] ✓ Connection ready (\(attempts * 100)ms)")
        print("[UHP] ✓ Stream will be created on first send/receive")
        logQuicStreamIdentifier(context: "ready")
        streamInitialized = true
        return true
    }

    func read(_ ptr: UnsafeMutablePointer<UInt8>, _ len: Int) -> Int {
        if len == 0 {
            return 0
        }

        print("[UHP] 📥 read() called: requesting \(len) bytes")

        // Ensure stream is initialized before reading
        guard ensureStreamInitialized() else {
            print("[UHP] ❌ Stream initialization failed for read")
            return -1
        }

        while true {
            bufferLock.lock()
            if !buffer.isEmpty {
                let count = min(len, buffer.count)
                buffer.copyBytes(to: ptr, count: count)
                buffer.removeFirst(count)
                bufferLock.unlock()
                print("[UHP] ✓ Read from buffer: \(count) bytes")
                return count
            }
            bufferLock.unlock()

            print("[UHP]    Buffer empty, calling receive() directly...")
            let sema = DispatchSemaphore(value: 0)
            var received: Data?
            var receiveError: NWError?
            var isComplete = false

            // Call receive() directly - don't dispatch to queue
            self.connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { content, _, complete, error in
                print("[UHP]    ✓ Receive callback: \(content?.count ?? 0) bytes, complete=\(complete), error=\(error?.localizedDescription ?? "nil")")
                received = content
                receiveError = error
                isComplete = complete
                sema.signal()
            }

            print("[UHP]    ⏱️  Waiting for receive callback (30s timeout)...")
            let waitResult = sema.wait(timeout: .now() + 30)

            if waitResult == .timedOut {
                print("[UHP] ❌ Read timed out after 30s - receive callback never fired")
                print("[UHP]    connection.state: \(connection.state)")
                return -1
            }

            if let error = receiveError {
                print("[UHP] ❌ Read error: \(error)")
                return -1
            }

            if let content = received, !content.isEmpty {
                print("[UHP] ✓ Received: \(content.count) bytes")
                bufferLock.lock()
                buffer.append(content)
                bufferLock.unlock()
                continue
            }

            if isComplete {
                print("[UHP] ✓ Stream complete (EOF)")
                return 0
            }
        }
    }

    func write(_ ptr: UnsafePointer<UInt8>, _ len: Int) -> Int {
        if len == 0 {
            return 0
        }

        print("[UHP] 📤 write() called: \(len) bytes")

        // Ensure stream is initialized before writing
        guard ensureStreamInitialized() else {
            print("[UHP] ❌ Stream initialization failed")
            return -1
        }

        let data = Data(bytes: ptr, count: len)
        if len == 4 {
            let headerValue = data.withUnsafeBytes { rawBuf -> UInt32 in
                guard let base = rawBuf.baseAddress else { return 0 }
                return base.load(as: UInt32.self).bigEndian
            }
            let headerHex = data.map { String(format: "%02x", $0) }.joined()
            print("[UHP] 🔍 Frame header: 0x\(headerHex) (len=\(headerValue))")
        } else if len > 4 {
            let digest = SHA256.hash(data: data)
            let hashPrefix = digest.prefix(8).map { String(format: "%02x", $0) }.joined()
            print("[UHP] 🔍 Frame payload: \(len) bytes, sha256[0..8]=\(hashPrefix)")
        }

        // Chunk large payloads to avoid flow control or MTU issues
        // UHP uses length-prefixed framing (4-byte header), so chunking within stream is safe
        let chunkSize = 8192  // 8KB chunks - conservative for QUIC over UDP MTU (~1200 bytes effective)
        var bytesWritten = 0

        // For small payloads, send as single chunk; for large, chunked
        if data.count <= chunkSize {
            return sendChunk(data, isComplete: false)
        }

        // Large payload: send in chunks
        print("[UHP]    Large payload (\(data.count) bytes) - chunking into \(chunkSize)B chunks")
        var offset = 0
        while offset < data.count {
            let end = min(offset + chunkSize, data.count)
            let chunk = data.subdata(in: offset..<end)

            print("[UHP]    Sending chunk: offset=\(offset), size=\(chunk.count) bytes")
            let result = sendChunk(chunk, isComplete: false)

            if result < 0 {
                print("[UHP] ❌ Chunk write failed at offset \(offset)")
                return -1
            }

            bytesWritten += result
            offset = end
        }

        print("[UHP] ✓ Write succeeded: \(bytesWritten) bytes sent in \((data.count + chunkSize - 1) / chunkSize) chunks")
        return bytesWritten
    }

    private func sendChunk(_ chunk: Data, isComplete: Bool) -> Int {
        let sema = DispatchSemaphore(value: 0)
        var sendError: NWError?

        // Use the default message context so we stay on the existing stream connection.
        logQuicStreamIdentifier(context: "send")
        self.connection.send(
            content: chunk,
            contentContext: .defaultMessage,
            isComplete: isComplete,
            completion: NWConnection.SendCompletion.contentProcessed { error in
                sendError = error
                sema.signal()
            }
        )

        let waitResult = sema.wait(timeout: .now() + 30)

        if waitResult == .timedOut {
            print("[UHP]    ❌ Chunk send timed out after 30s")
            return -1
        }

        if let error = sendError {
            print("[UHP]    ❌ Chunk send error: \(error)")
            return -1
        }

        return chunk.count
    }

    private func logQuicStreamIdentifier(context: String) {
        guard let metadata = connection.metadata(definition: NWProtocolQUIC.definition) as? NWProtocolQUIC.Metadata else {
            return
        }

        let streamId = metadata.streamIdentifier
        if lastStreamIdentifier == nil || lastStreamIdentifier != streamId {
            print("[UHP] 🔍 QUIC stream id (\(context)): \(streamId)")
            lastStreamIdentifier = streamId
        }
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
    identity: Identity? = nil,
    channelBindingOverride: Data? = nil
) -> Result<UhpSessionInfo, Error> {
    func exportQuicChannelBinding(from connection: NWConnection) -> Data? {
        func exportBinding(from secMetadata: sec_protocol_metadata_t, source: String) -> Data? {
            let label = "zhtp-uhp-channel-binding"
            print("[UhpHandshake] 🔐 Exporting channel binding via \(source) label_len=\(label.utf8.count)")
            let exported = sec_protocol_metadata_create_secret(
                secMetadata,
                label.utf8.count,
                label,
                32
            )
            guard let secret = exported else {
                print("[UhpHandshake] ⚠️ Failed to export channel binding via \(source)")
                return nil
            }

            let secretData = secret as DispatchData
            let data = Data(secretData)

            guard data.count == 32 else {
                print("[UhpHandshake] ⚠️ Invalid channel binding length via \(source): \(data.count) bytes")
                return nil
            }

            let digest = SHA256.hash(data: data)
            let hashPrefix = digest.prefix(8).map { String(format: "%02x", $0) }.joined()
            print("[UhpHandshake] 🔐 Channel binding via \(source): sha256[0..8]=\(hashPrefix)")
            return data
        }

        var attempts = 0
        let maxAttempts = 50 // 5 seconds
        while connection.state != .ready && attempts < maxAttempts {
            Thread.sleep(forTimeInterval: 0.1)
            attempts += 1
        }
        if connection.state != .ready {
            print("[UhpHandshake] ⚠️ Connection not ready for channel binding: \(connection.state)")
        }

        if let quicMetadata = connection.metadata(definition: NWProtocolQUIC.definition) as? NWProtocolQUIC.Metadata {
            return exportBinding(from: quicMetadata.securityProtocolMetadata, source: "QUIC")
        }

        print("[UhpHandshake] ⚠️ QUIC metadata unavailable for channel binding")
        return nil
    }

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

    // Channel binding must match server's QUIC exporter (label: zhtp-uhp-channel-binding, len: 32)
    guard let channelBinding = channelBindingOverride else {
        print("[UhpHandshake] ❌ Missing channel binding override - cannot continue")
        return .failure(UhpHandshakeError.missingChannelBinding)
    }
    let digest = SHA256.hash(data: channelBinding)
    let hashPrefix = digest.prefix(8).map { String(format: "%02x", $0) }.joined()
    let hexPrefix = channelBinding.prefix(8).map { String(format: "%02x", $0) }.joined()
    print("[UhpHandshake] ✅ Using provided channel binding: \(channelBinding.count) bytes, sha256[0..8]=\(hashPrefix), hex[0..8]=\(hexPrefix)")

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
