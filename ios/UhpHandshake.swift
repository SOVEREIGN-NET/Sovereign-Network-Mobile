import Foundation
import Network
import Security

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
    chainId: UInt8 = 0
) -> Result<UhpSessionInfo, Error> {
    // Channel binding not available on iOS (requires private Security API)
    // Using empty data as placeholder - Rust layer doesn't require this for handshake validation
    let channelBinding = Data()

    print("[UhpHandshake] Loading identity for ID: \(identityId)")
    guard let materials = UhpKeystore.loadIdentityForHandshake(identityId: identityId) else {
        print("[UhpHandshake] ❌ Failed to load identity materials for ID: \(identityId)")
        return .failure(UhpHandshakeError.invalidIdentity)
    }
    print("[UhpHandshake] ✅ Loaded identity materials")

    let cachePath = nonceCachePath ?? {
        let cacheDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
        return cacheDir?.appendingPathComponent("uhp-nonce-cache").path ?? NSTemporaryDirectory() + "uhp-nonce-cache"
    }()

    let io = UhpConnectionIO(connection: connection)
    let ctx = Unmanaged.passRetained(io)
    defer { ctx.release() }

    var session = UhpSession()
    let identityJson = materials.identityJson
    let clientDid = materials.identityDid
    let privateKey = materials.privateKey

    print("[UhpHandshake] Starting handshake:")
    print("[UhpHandshake]   - Client DID: \(clientDid)")
    print("[UhpHandshake]   - Identity JSON: \(identityJson.count) bytes")
    print("[UhpHandshake]   - Dilithium SK: \(privateKey.dilithiumSk.count) bytes")
    print("[UhpHandshake]   - Kyber SK: \(privateKey.kyberSk.count) bytes")
    print("[UhpHandshake]   - Master seed: \(privateKey.masterSeed.count) bytes")
    print("[UhpHandshake]   - Cache path: \(cachePath)")
    print("[UhpHandshake]   - Chain ID: \(chainId)")

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

                            return uhp_handshake(
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
                        }
                    }
                }
            }
        }
    }

    print("[UhpHandshake] Handshake completed with result code: \(result)")

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
