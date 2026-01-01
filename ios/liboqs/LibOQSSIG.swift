import Foundation

// MARK: - Digital Signature Wrapper

final class LibOQSSIG {
    private var sig: UnsafeMutablePointer<OQS_SIG>?
    private let algorithm: LibOQSSIGAlgorithm
    private let lock = NSLock()

    // MARK: - Initialization & Cleanup

    /// Initialize signature scheme with given algorithm
    /// - Parameter algorithm: Signature algorithm to use
    /// - Throws: LibOQSError if algorithm not supported or initialization failed
    init(algorithm: LibOQSSIGAlgorithm) throws {
        self.algorithm = algorithm

        // Check if algorithm is enabled
        guard OQS_SIG_alg_is_enabled(algorithm.cString) == 1 else {
            throw LibOQSError.algorithmNotSupported(algorithm.rawValue)
        }

        // Create signature object
        guard let sigPtr = OQS_SIG_new(algorithm.cString) else {
            throw LibOQSError.algorithmNotSupported(algorithm.rawValue)
        }

        self.sig = sigPtr
    }

    deinit {
        if let sig = sig {
            OQS_SIG_free(sig)
            self.sig = nil
        }
    }

    // MARK: - Key Generation

    /// Generate signature keypair
    /// - Returns: LibOQSKeypair with public and secret keys
    /// - Throws: LibOQSError on failure
    func generateKeypair() throws -> LibOQSKeypair {
        lock.lock()
        defer { lock.unlock() }

        guard let sig = sig else {
            throw LibOQSError.moduleDeallocated
        }

        let sigStruct = sig.pointee

        // Allocate buffers
        guard let publicKeyBuf = LibOQSMemory.SecureBuffer(
            size: Int(sigStruct.length_public_key),
            secure: false // Public keys don't need secure allocation
        ) else {
            throw LibOQSError.memoryAllocationFailed
        }

        guard let secretKeyBuf = LibOQSMemory.SecureBuffer(
            size: Int(sigStruct.length_secret_key),
            secure: true // Secret keys MUST use secure allocation
        ) else {
            throw LibOQSError.memoryAllocationFailed
        }

        // Generate keypair
        let status = OQS_SIG_keypair(
            sig,
            publicKeyBuf.bytes,
            secretKeyBuf.bytes
        )

        guard status == OQS_SUCCESS else {
            throw LibOQSError.operationFailed("Keypair generation failed")
        }

        return LibOQSKeypair(
            publicKey: publicKeyBuf.toData(),
            secretKey: secretKeyBuf.toData()
        )
    }

    // MARK: - Signing

    /// Sign a message with secret key
    /// - Parameters:
    ///   - message: Message to sign
    ///   - secretKey: Secret key for signing
    /// - Returns: Signature bytes
    /// - Throws: LibOQSError on failure
    func sign(message: Data, secretKey: Data) throws -> Data {
        lock.lock()
        defer { lock.unlock() }

        guard let sig = sig else {
            throw LibOQSError.moduleDeallocated
        }

        let sigStruct = sig.pointee

        // Validate secret key length
        guard secretKey.count == Int(sigStruct.length_secret_key) else {
            throw LibOQSError.invalidKeyLength
        }

        // Allocate signature buffer
        guard let signatureBuf = LibOQSMemory.SecureBuffer(
            size: Int(sigStruct.length_signature),
            secure: true
        ) else {
            throw LibOQSError.memoryAllocationFailed
        }

        // Signature length output parameter
        var signatureLen: size_t = 0

        // Perform signing
        let status = message.withUnsafeBytes { msgPtr in
            secretKey.withUnsafeBytes { skPtr in
                let msgBase = msgPtr.baseAddress?.assumingMemoryBound(to: UInt8.self)
                if message.count > 0 && msgBase == nil {
                    return OQS_ERROR
                }
                let skBase = skPtr.baseAddress?.assumingMemoryBound(to: UInt8.self)
                if skBase == nil {
                    return OQS_ERROR
                }
                return OQS_SIG_sign(
                    sig,
                    signatureBuf.bytes,
                    &signatureLen,
                    msgBase,
                    message.count,
                    skBase
                )
            }
        }

        guard status == OQS_SUCCESS else {
            throw LibOQSError.operationFailed("Signing failed")
        }

        // Return only the actual signature bytes (not the full buffer)
        return Data(bytes: signatureBuf.bytes, count: Int(signatureLen))
    }

    // MARK: - Verification

    /// Verify a signature on a message
    /// - Parameters:
    ///   - message: Original message that was signed
    ///   - signature: Signature bytes to verify
    ///   - publicKey: Public key for verification
    /// - Returns: true if signature is valid, false otherwise
    /// - Throws: LibOQSError on failure
    func verify(message: Data, signature: Data, publicKey: Data) throws -> Bool {
        lock.lock()
        defer { lock.unlock() }

        guard let sig = sig else {
            throw LibOQSError.moduleDeallocated
        }

        let sigStruct = sig.pointee

        // Validate key length
        guard publicKey.count == Int(sigStruct.length_public_key) else {
            throw LibOQSError.invalidKeyLength
        }

        // Validate signature length (must not exceed max)
        guard signature.count <= Int(sigStruct.length_signature) else {
            throw LibOQSError.invalidKeyLength
        }

        // Perform verification
        let status = message.withUnsafeBytes { msgPtr in
            signature.withUnsafeBytes { sigPtr in
                publicKey.withUnsafeBytes { pkPtr in
                    let msgBase = msgPtr.baseAddress?.assumingMemoryBound(to: UInt8.self)
                    if message.count > 0 && msgBase == nil {
                        return OQS_ERROR
                    }
                    let sigBase = sigPtr.baseAddress?.assumingMemoryBound(to: UInt8.self)
                    if signature.count > 0 && sigBase == nil {
                        return OQS_ERROR
                    }
                    let pkBase = pkPtr.baseAddress?.assumingMemoryBound(to: UInt8.self)
                    if pkBase == nil {
                        return OQS_ERROR
                    }
                    return OQS_SIG_verify(
                        sig,
                        msgBase,
                        message.count,
                        sigBase,
                        signature.count,
                        pkBase
                    )
                }
            }
        }

        // OQS_SUCCESS = 0 (valid), OQS_ERROR = -1 (invalid)
        return status == OQS_SUCCESS
    }

    // MARK: - Algorithm Properties

    /// Public key size in bytes
    var publicKeyLength: Int {
        guard let sig = sig else { return 0 }
        return Int(sig.pointee.length_public_key)
    }

    /// Secret key size in bytes
    var secretKeyLength: Int {
        guard let sig = sig else { return 0 }
        return Int(sig.pointee.length_secret_key)
    }

    /// Maximum signature size in bytes
    var signatureLength: Int {
        guard let sig = sig else { return 0 }
        return Int(sig.pointee.length_signature)
    }

    /// Algorithm name
    var algorithmName: String {
        guard let sig = sig, let name = sig.pointee.method_name else {
            return algorithm.rawValue
        }
        return String(cString: name)
    }

    /// NIST security level (1-5)
    var nistLevel: UInt8 {
        guard let sig = sig else { return 0 }
        return sig.pointee.claimed_nist_level
    }

    /// Whether signature scheme provides EUF-CMA security
    var isEUFCMA: Bool {
        guard let sig = sig else { return false }
        return sig.pointee.euf_cma
    }

    /// Whether signature scheme provides SUF-CMA security
    var isSUFCMA: Bool {
        guard let sig = sig else { return false }
        return sig.pointee.suf_cma
    }

    /// Whether signature scheme supports context strings
    var supportsContextString: Bool {
        guard let sig = sig else { return false }
        return sig.pointee.sig_with_ctx_support
    }
}
