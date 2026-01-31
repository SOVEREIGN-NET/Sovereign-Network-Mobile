// ZhtpClient.swift
// Swift wrapper around lib-client Rust library C FFI
// This provides the Swift API for identity generation and signing

import Foundation

// MARK: - C FFI Declarations

// Generate identity
@_silgen_name("zhtp_client_generate_identity")
private func cGenerateIdentity(_ deviceId: UnsafePointer<CChar>) -> UnsafeMutableRawPointer?

// Get DID from identity handle
@_silgen_name("zhtp_client_identity_get_did")
private func cIdentityGetDid(_ handle: UnsafeMutableRawPointer) -> UnsafeMutablePointer<CChar>?

// Get device ID from identity handle
@_silgen_name("zhtp_client_identity_get_device_id")
private func cIdentityGetDeviceId(_ handle: UnsafeMutableRawPointer) -> UnsafeMutablePointer<CChar>?

// Get public key from identity handle
@_silgen_name("zhtp_client_identity_get_public_key")
private func cIdentityGetPublicKey(_ handle: UnsafeMutableRawPointer) -> ByteBuffer

// Get Kyber public key from identity handle
@_silgen_name("zhtp_client_identity_get_kyber_public_key")
private func cIdentityGetKyberPublicKey(_ handle: UnsafeMutableRawPointer) -> ByteBuffer

// Get node ID from identity handle
@_silgen_name("zhtp_client_identity_get_node_id")
private func cIdentityGetNodeId(_ handle: UnsafeMutableRawPointer) -> ByteBuffer

// Get created_at timestamp from identity handle
@_silgen_name("zhtp_client_identity_get_created_at")
private func cIdentityGetCreatedAt(_ handle: UnsafeMutableRawPointer) -> UInt64

// Get Dilithium secret key from identity handle
@_silgen_name("zhtp_client_identity_get_dilithium_secret_key")
private func cIdentityGetDilithiumSecretKey(_ handle: UnsafeMutableRawPointer) -> ByteBuffer

// Get Kyber secret key from identity handle
@_silgen_name("zhtp_client_identity_get_kyber_secret_key")
private func cIdentityGetKyberSecretKey(_ handle: UnsafeMutableRawPointer) -> ByteBuffer

// Get master seed from identity handle
@_silgen_name("zhtp_client_identity_get_master_seed")
private func cIdentityGetMasterSeed(_ handle: UnsafeMutableRawPointer) -> ByteBuffer

// Sign registration proof
@_silgen_name("zhtp_client_sign_registration_proof")
private func cSignRegistrationProof(_ handle: UnsafeMutableRawPointer, _ timestamp: UInt64) -> ByteBuffer

// Sign UHP challenge (keeps private keys in Rust)
@_silgen_name("zhtp_client_sign_uhp_challenge")
private func cSignUhpChallenge(_ handle: UnsafeMutableRawPointer, _ challenge: UnsafeRawPointer, _ challengeLen: Int) -> ByteBuffer

// Serialize identity to JSON (legacy lib-client format)
@_silgen_name("zhtp_client_identity_serialize")
private func cSerializeIdentity(_ handle: UnsafeMutableRawPointer) -> UnsafeMutablePointer<CChar>?

// Serialize identity to JSON in lib-network handshake format (includes all ZhtpIdentity fields)
@_silgen_name("zhtp_client_identity_to_handshake_json")
private func cSerializeIdentityToHandshakeJson(_ handle: UnsafeMutableRawPointer) -> UnsafeMutablePointer<CChar>?

// Deserialize identity from JSON
@_silgen_name("zhtp_client_identity_deserialize")
private func cDeserializeIdentity(_ json: UnsafePointer<CChar>) -> UnsafeMutableRawPointer?

// Free identity handle
@_silgen_name("zhtp_client_identity_free")
private func cIdentityFree(_ handle: UnsafeMutableRawPointer)

// Free string
@_silgen_name("zhtp_client_free_string")
private func cFreeString(_ ptr: UnsafeMutablePointer<CChar>)

// Free buffer
@_silgen_name("zhtp_client_free_bytes")
private func cFreeBytes(_ buf: ByteBuffer)

// Token transaction building functions (return hex-encoded signed transaction)

/// Build signed token transfer transaction
@_silgen_name("zhtp_client_build_token_transfer")
private func cBuildTokenTransfer(
    _ handle: UnsafePointer<UInt8>?,
    _ tokenId: UnsafePointer<UInt8>?,
    _ toPubkey: UnsafePointer<UInt8>?,
    _ toPubkeyLen: Int,
    _ amount: UInt64,
    _ chainId: UInt8
) -> UnsafeMutablePointer<CChar>?

/// Build signed token mint transaction
@_silgen_name("zhtp_client_build_token_mint")
private func cBuildTokenMint(
    _ handle: UnsafePointer<UInt8>?,
    _ tokenId: UnsafePointer<UInt8>?,
    _ toPubkey: UnsafePointer<UInt8>?,
    _ toPubkeyLen: Int,
    _ amount: UInt64,
    _ chainId: UInt8
) -> UnsafeMutablePointer<CChar>?

/// Build signed token create transaction
@_silgen_name("zhtp_client_build_token_create")
private func cBuildTokenCreate(
    _ handle: UnsafePointer<UInt8>?,
    _ name: UnsafePointer<CChar>?,
    _ symbol: UnsafePointer<CChar>?,
    _ initialSupply: UInt64,
    _ decimals: UInt8,
    _ chainId: UInt8
) -> UnsafeMutablePointer<CChar>?

/// Build signed token burn transaction
@_silgen_name("zhtp_client_build_token_burn")
private func cBuildTokenBurn(
    _ handle: UnsafePointer<UInt8>?,
    _ tokenId: UnsafePointer<UInt8>?,
    _ amount: UInt64,
    _ chainId: UInt8
) -> UnsafeMutablePointer<CChar>?

// MARK: - C Types

struct ByteBuffer {
    var data: UnsafeMutableRawPointer?
    var len: Int
}

// MARK: - Swift Types

public class Identity {
    public let did: String
    public let publicKey: [UInt8]
    public let kyberPublicKey: [UInt8]
    public let nodeId: [UInt8]
    public let deviceId: String
    public let createdAt: UInt64

    // Internal handle for signing operations
    private let handle: UnsafeMutableRawPointer

    init(did: String, publicKey: [UInt8], kyberPublicKey: [UInt8], nodeId: [UInt8], deviceId: String, createdAt: UInt64, handle: UnsafeMutableRawPointer) {
        self.did = did
        self.publicKey = publicKey
        self.kyberPublicKey = kyberPublicKey
        self.nodeId = nodeId
        self.deviceId = deviceId
        self.createdAt = createdAt
        self.handle = handle
    }

    func getHandle() -> UnsafeMutableRawPointer {
        return handle
    }

    /// Sign a UHP handshake challenge
    /// Private keys stay in Rust - never exposed to caller
    public func signUhpChallenge(_ challenge: [UInt8]) throws -> [UInt8] {
        let buf = challenge.withUnsafeBytes { challengePtr in
            cSignUhpChallenge(handle, challengePtr.baseAddress ?? UnsafeRawPointer(bitPattern: 0)!, challenge.count)
        }
        defer { cFreeBytes(buf) }

        guard let data = buf.data, buf.len > 0 else {
            throw ClientError.signingError("Failed to sign UHP challenge")
        }

        return Array(UnsafeBufferPointer(start: data.assumingMemoryBound(to: UInt8.self), count: buf.len))
    }

    deinit {
        cIdentityFree(handle)
    }
}

public enum ClientError: Error {
    case cryptoError(String)
    case identityError(String)
    case signingError(String)
}

// MARK: - Public API

public class ZhtpClient {
    public static func generateIdentity(deviceId: String) throws -> Identity {
        let handle = try deviceId.withCString { deviceIdC in
            guard let h = cGenerateIdentity(deviceIdC) else {
                throw ClientError.identityError("Failed to generate identity")
            }
            return h
        }

        // Extract fields from the handle (Identity will own the handle)
        let did = extractString(cIdentityGetDid(handle))
        let devId = extractString(cIdentityGetDeviceId(handle))
        let pubKey = extractBuffer(cIdentityGetPublicKey(handle))
        let kyberPubKey = extractBuffer(cIdentityGetKyberPublicKey(handle))
        let nId = extractBuffer(cIdentityGetNodeId(handle))
        let createdAt = cIdentityGetCreatedAt(handle)

        return Identity(
            did: did,
            publicKey: pubKey,
            kyberPublicKey: kyberPubKey,
            nodeId: nId,
            deviceId: devId,
            createdAt: createdAt,
            handle: handle
        )
    }

    public static func signRegistrationProof(identity: Identity, timestamp: UInt64) throws -> [UInt8] {
        let buf = cSignRegistrationProof(identity.getHandle(), timestamp)
        defer { cFreeBytes(buf) }

        guard let data = buf.data, buf.len > 0 else {
            throw ClientError.signingError("Failed to sign registration proof")
        }

        return Array(UnsafeBufferPointer(start: data.assumingMemoryBound(to: UInt8.self), count: buf.len))
    }

    /// Serialize an Identity to JSON string for storage
    public static func serializeIdentity(_ identity: Identity) throws -> String {
        guard let jsonPtr = cSerializeIdentity(identity.getHandle()) else {
            throw ClientError.identityError("Failed to serialize identity")
        }
        defer { cFreeString(jsonPtr) }
        return String(cString: jsonPtr)
    }

    /// Serialize identity to JSON in lib-network handshake format
    /// This format includes all ZhtpIdentity fields required by the UHP handshake
    /// Use this instead of serializeIdentity() for handshake operations
    public static func serializeIdentityToHandshakeJson(_ identity: Identity) throws -> String {
        guard let jsonPtr = cSerializeIdentityToHandshakeJson(identity.getHandle()) else {
            throw ClientError.identityError("Failed to serialize identity to handshake JSON")
        }
        defer { cFreeString(jsonPtr) }
        return String(cString: jsonPtr)
    }

    /// Get Dilithium secret key for UHP handshake
    /// Keys stay on-device - only passed in memory to uhp-ffi
    public static func getDilithiumSecretKey(_ identity: Identity) throws -> [UInt8] {
        let buf = cIdentityGetDilithiumSecretKey(identity.getHandle())
        defer { cFreeBytes(buf) }
        if buf.data == nil || buf.len == 0 {
            throw ClientError.identityError("Failed to get Dilithium secret key")
        }
        let ptr = buf.data!.assumingMemoryBound(to: UInt8.self)
        return Array(UnsafeBufferPointer(start: ptr, count: buf.len))
    }

    /// Get Kyber secret key for UHP handshake
    /// Keys stay on-device - only passed in memory to uhp-ffi
    public static func getKyberSecretKey(_ identity: Identity) throws -> [UInt8] {
        let buf = cIdentityGetKyberSecretKey(identity.getHandle())
        defer { cFreeBytes(buf) }
        if buf.data == nil || buf.len == 0 {
            throw ClientError.identityError("Failed to get Kyber secret key")
        }
        let ptr = buf.data!.assumingMemoryBound(to: UInt8.self)
        return Array(UnsafeBufferPointer(start: ptr, count: buf.len))
    }

    /// Get master seed for UHP handshake
    /// Keys stay on-device - only passed in memory to uhp-ffi
    public static func getMasterSeed(_ identity: Identity) throws -> [UInt8] {
        let buf = cIdentityGetMasterSeed(identity.getHandle())
        defer { cFreeBytes(buf) }
        if buf.data == nil || buf.len == 0 {
            throw ClientError.identityError("Failed to get master seed")
        }
        let ptr = buf.data!.assumingMemoryBound(to: UInt8.self)
        return Array(UnsafeBufferPointer(start: ptr, count: buf.len))
    }

    /// Deserialize an Identity from JSON string
    public static func deserializeIdentity(_ json: String) throws -> Identity {
        let handle = try json.withCString { jsonCStr in
            guard let h = cDeserializeIdentity(jsonCStr) else {
                throw ClientError.identityError("Failed to deserialize identity")
            }
            return h
        }

        // Extract fields from the handle
        let did = extractString(cIdentityGetDid(handle))
        let devId = extractString(cIdentityGetDeviceId(handle))
        let pubKey = extractBuffer(cIdentityGetPublicKey(handle))
        let kyberPubKey = extractBuffer(cIdentityGetKyberPublicKey(handle))
        let nId = extractBuffer(cIdentityGetNodeId(handle))
        let createdAt = cIdentityGetCreatedAt(handle)

        return Identity(
            did: did,
            publicKey: pubKey,
            kyberPublicKey: kyberPubKey,
            nodeId: nId,
            deviceId: devId,
            createdAt: createdAt,
            handle: handle
        )
    }

    /// Sign arbitrary data (transaction, message, etc.) with identity's Dilithium keypair
    /// - Parameters:
    ///   - data: Data to sign
    ///   - identity: Identity with Dilithium secret key
    /// - Returns: Dilithium signature bytes
    /// - Throws: ClientError if signing fails
    public static func signData(_ data: Data, using identity: Identity) throws -> [UInt8] {
        let buf = data.withUnsafeBytes { dataPtr in
            cSignUhpChallenge(identity.getHandle(), dataPtr.baseAddress ?? UnsafeRawPointer(bitPattern: 0)!, data.count)
        }
        defer { cFreeBytes(buf) }

        guard let sigData = buf.data, buf.len > 0 else {
            throw ClientError.signingError("Failed to sign data")
        }

        return Array(UnsafeBufferPointer(start: sigData.assumingMemoryBound(to: UInt8.self), count: buf.len))
    }

    /// Build signed token transfer transaction (returns hex-encoded string ready for API)
    public static func buildTokenTransfer(
        tokenId: Data,
        toPublicKey: Data,
        amount: UInt64,
        using identity: Identity,
        chainId: UInt8 = 0x02  // testnet
    ) throws -> String {
        guard let hexPtr = tokenId.withUnsafeBytes({ tokenIdPtr in
            toPublicKey.withUnsafeBytes { toPubkeyPtr in
                cBuildTokenTransfer(
                    identity.getHandle().assumingMemoryBound(to: UInt8.self),
                    tokenIdPtr.baseAddress?.assumingMemoryBound(to: UInt8.self),
                    toPubkeyPtr.baseAddress?.assumingMemoryBound(to: UInt8.self),
                    toPublicKey.count,
                    amount,
                    chainId
                )
            }
        }) else {
            throw ClientError.signingError("Failed to build token transfer transaction")
        }
        defer { cFreeString(hexPtr) }
        return String(cString: hexPtr)
    }

    /// Build signed token mint transaction (returns hex-encoded string ready for API)
    public static func buildTokenMint(
        tokenId: Data,
        toPublicKey: Data,
        amount: UInt64,
        using identity: Identity,
        chainId: UInt8 = 0x02  // testnet
    ) throws -> String {
        guard let hexPtr = tokenId.withUnsafeBytes({ tokenIdPtr in
            toPublicKey.withUnsafeBytes { toPubkeyPtr in
                cBuildTokenMint(
                    identity.getHandle().assumingMemoryBound(to: UInt8.self),
                    tokenIdPtr.baseAddress?.assumingMemoryBound(to: UInt8.self),
                    toPubkeyPtr.baseAddress?.assumingMemoryBound(to: UInt8.self),
                    toPublicKey.count,
                    amount,
                    chainId
                )
            }
        }) else {
            throw ClientError.signingError("Failed to build token mint transaction")
        }
        defer { cFreeString(hexPtr) }
        return String(cString: hexPtr)
    }

    /// Build signed token create transaction (returns hex-encoded string ready for API)
    public static func buildTokenCreate(
        name: String,
        symbol: String,
        initialSupply: UInt64,
        decimals: UInt8,
        using identity: Identity,
        chainId: UInt8 = 0x02  // testnet
    ) throws -> String {
        guard let hexPtr = name.withCString({ namePtr in
            symbol.withCString { symbolPtr in
                cBuildTokenCreate(
                    identity.getHandle().assumingMemoryBound(to: UInt8.self),
                    namePtr,
                    symbolPtr,
                    initialSupply,
                    decimals,
                    chainId
                )
            }
        }) else {
            throw ClientError.signingError("Failed to build token create transaction")
        }
        defer { cFreeString(hexPtr) }
        return String(cString: hexPtr)
    }

    /// Build signed token burn transaction (returns hex-encoded string ready for API)
    public static func buildTokenBurn(
        tokenId: Data,
        amount: UInt64,
        using identity: Identity,
        chainId: UInt8 = 0x02  // testnet
    ) throws -> String {
        guard let hexPtr = tokenId.withUnsafeBytes({ tokenIdPtr in
            cBuildTokenBurn(
                identity.getHandle().assumingMemoryBound(to: UInt8.self),
                tokenIdPtr.baseAddress?.assumingMemoryBound(to: UInt8.self),
                amount,
                chainId
            )
        }) else {
            throw ClientError.signingError("Failed to build token burn transaction")
        }
        defer { cFreeString(hexPtr) }
        return String(cString: hexPtr)
    }
}

// MARK: - Helpers

private func extractString(_ ptr: UnsafeMutablePointer<CChar>?) -> String {
    guard let p = ptr else { return "" }
    defer { cFreeString(p) }
    return String(cString: p)
}

private func extractBuffer(_ buf: ByteBuffer) -> [UInt8] {
    guard let data = buf.data, buf.len > 0 else { return [] }
    defer { cFreeBytes(buf) }
    return Array(UnsafeBufferPointer(start: data.assumingMemoryBound(to: UInt8.self), count: buf.len))
}
