// ZhtpClient.swift
// Swift wrapper around lib-client Rust library C FFI
// This provides the Swift API for identity generation, signing, and UHP handshake

import Foundation

// MARK: - u128 amount parsing (single source of truth)
//
// Token amounts on the Rust side are u128. Swift has no native UInt128,
// and UInt64 is NOT large enough — e.g. 1000 SOV at 18 decimals is 1e21
// atoms which overflows u64. Callers MUST pass the amount as a decimal
// string and use `parseU128Halves` to split it into the (lo, hi) pair
// the C FFI accepts.
//
// Do NOT add helper overloads that take `amount: UInt64`. The previous
// version of this file had one and it silently truncated 1000 SOV to
// 3.87 SOV in production.

/// Parse a decimal u128 string into `(lo, hi)` UInt64 halves.
/// Returns `nil` on non-digit input or on u128 overflow.
public func parseU128Halves(_ s: String) -> (lo: UInt64, hi: UInt64)? {
    if s.isEmpty { return nil }
    var hi: UInt64 = 0
    var lo: UInt64 = 0
    for ch in s {
        guard let d = ch.wholeNumberValue, (0...9).contains(d) else { return nil }
        // (hi, lo) = (hi, lo) * 10 + d, with overflow detection.
        let (loMulHi, loMulLo) = lo.multipliedFullWidth(by: 10)
        let (addedLo, addOv) = loMulLo.addingReportingOverflow(UInt64(d))
        let carryFromAdd: UInt64 = addOv ? 1 : 0
        let (hiMulHi, hiMulLo) = hi.multipliedFullWidth(by: 10)
        if hiMulHi != 0 { return nil }
        let (hiSum1, hiOv1) = hiMulLo.addingReportingOverflow(loMulHi)
        if hiOv1 { return nil }
        let (hiSum2, hiOv2) = hiSum1.addingReportingOverflow(carryFromAdd)
        if hiOv2 { return nil }
        lo = addedLo
        hi = hiSum2
    }
    return (lo, hi)
}

// MARK: - C FFI Declarations: Identity

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

// Get primary wallet ID = blake3(dilithium_pk || kyber_pk) — 32 bytes
@_silgen_name("zhtp_client_identity_get_wallet_id")
private func cIdentityGetWalletId(_ handle: UnsafeRawPointer) -> ByteBuffer

// Get master seed phrase (BIP39) from identity handle
@_silgen_name("zhtp_client_identity_get_seed_phrase")
private func cIdentityGetSeedPhrase(_ handle: UnsafeMutableRawPointer) -> UnsafeMutablePointer<CChar>?

// MARK: - C FFI Declarations: Deprecated secret key getters (will be removed after migration)

// Deprecated: Use HandshakeState instead — keys no longer need to cross FFI
@_silgen_name("zhtp_client_identity_get_dilithium_secret_key")
private func cIdentityGetDilithiumSecretKey(_ handle: UnsafeMutableRawPointer) -> ByteBuffer

// Deprecated: Use HandshakeState instead — keys no longer need to cross FFI
@_silgen_name("zhtp_client_identity_get_kyber_secret_key")
private func cIdentityGetKyberSecretKey(_ handle: UnsafeMutableRawPointer) -> ByteBuffer

// Deprecated: Use HandshakeState instead — keys no longer need to cross FFI
@_silgen_name("zhtp_client_identity_get_master_seed")
private func cIdentityGetMasterSeed(_ handle: UnsafeMutableRawPointer) -> ByteBuffer

// MARK: - C FFI Declarations: Signing

// Sign registration proof
@_silgen_name("zhtp_client_sign_registration_proof")
private func cSignRegistrationProof(_ handle: UnsafeMutableRawPointer, _ timestamp: UInt64) -> ByteBuffer

// Sign arbitrary message bytes (keeps private keys in Rust)
@_silgen_name("zhtp_client_sign_message")
private func cSignMessage(_ handle: UnsafeMutableRawPointer, _ message: UnsafeRawPointer, _ messageLen: Int) -> ByteBuffer

// Sign PoUW receipt JSON (Rust canonical path: JSON -> Receipt -> bincode -> Dilithium signature)
@_silgen_name("zhtp_client_sign_pouw_receipt_json")
private func cSignPoUWReceiptJson(_ handle: UnsafeMutableRawPointer, _ receiptJson: UnsafeRawPointer, _ receiptJsonLen: Int) -> ByteBuffer

// Sign UHP challenge (keeps private keys in Rust)
@_silgen_name("zhtp_client_sign_uhp_challenge")
private func cSignUhpChallenge(_ handle: UnsafeMutableRawPointer, _ challenge: UnsafeRawPointer, _ challengeLen: Int) -> ByteBuffer

// MARK: - C FFI Declarations: Serialization

// Serialize identity to JSON (legacy lib-client format)
@_silgen_name("zhtp_client_identity_serialize")
private func cSerializeIdentity(_ handle: UnsafeMutableRawPointer) -> UnsafeMutablePointer<CChar>?

// Serialize identity to JSON in lib-network handshake format (includes all ZhtpIdentity fields)
@_silgen_name("zhtp_client_identity_to_handshake_json")
private func cSerializeIdentityToHandshakeJson(_ handle: UnsafeMutableRawPointer) -> UnsafeMutablePointer<CChar>?

// Export identity keystore as base64 string
@_silgen_name("zhtp_client_export_keystore_base64")
private func cExportKeystoreBase64(_ handle: UnsafeMutableRawPointer) -> UnsafeMutablePointer<CChar>?

// Deserialize identity from JSON
@_silgen_name("zhtp_client_identity_deserialize")
private func cDeserializeIdentity(_ json: UnsafePointer<CChar>) -> UnsafeMutableRawPointer?

// Restore identity from 24-word seed phrase
@_silgen_name("zhtp_client_restore_identity_from_phrase")
private func cRestoreIdentityFromPhrase(_ phrase: UnsafePointer<CChar>, _ deviceId: UnsafePointer<CChar>) -> UnsafeMutableRawPointer?

// Free identity handle
@_silgen_name("zhtp_client_identity_free")
private func cIdentityFree(_ handle: UnsafeMutableRawPointer)

// Build the signed JSON request body for `POST /api/v1/identity/update-kyber-key`.
// Keeps Dilithium sk in Rust; returns null on failure. Caller frees with `cStringFree`.
@_silgen_name("zhtp_identity_build_kyber_key_update")
private func cBuildKyberKeyUpdate(_ handle: UnsafeMutableRawPointer, _ timestamp: UInt64) -> UnsafeMutablePointer<CChar>?

// MARK: - C FFI Declarations: Memory management

// Free string allocated by Rust
@_silgen_name("zhtp_client_string_free")
private func cStringFree(_ ptr: UnsafeMutablePointer<CChar>)

// Free buffer allocated by Rust
@_silgen_name("zhtp_client_buffer_free")
private func cBufferFree(_ buf: ByteBuffer)

// MARK: - C FFI Declarations: Token transactions (handle is opaque IdentityHandle*)

/// Build signed token transfer transaction
/// amount is u128 on the Rust side — passed as (lo, hi) register pair on ARM64.
@_silgen_name("zhtp_client_build_token_transfer")
private func cBuildTokenTransfer(
    _ handle: UnsafeMutableRawPointer,
    _ tokenId: UnsafePointer<UInt8>?,
    _ toPubkey: UnsafePointer<UInt8>?,
    _ toPubkeyLen: Int,
    _ amountLo: UInt64,
    _ amountHi: UInt64,
    _ chainId: UInt8,
    _ nonce: UInt64
) -> UnsafeMutablePointer<CChar>?

/// Build signed token mint transaction
@_silgen_name("zhtp_client_build_token_mint")
private func cBuildTokenMint(
    _ handle: UnsafeMutableRawPointer,
    _ tokenId: UnsafePointer<UInt8>?,
    _ toPubkey: UnsafePointer<UInt8>?,
    _ toPubkeyLen: Int,
    _ amountLo: UInt64,
    _ amountHi: UInt64,
    _ chainId: UInt8
) -> UnsafeMutablePointer<CChar>?

/// Build signed token create transaction
@_silgen_name("zhtp_client_build_token_create")
private func cBuildTokenCreate(
    _ handle: UnsafeMutableRawPointer,
    _ name: UnsafePointer<CChar>?,
    _ symbol: UnsafePointer<CChar>?,
    _ initialSupplyLo: UInt64,
    _ initialSupplyHi: UInt64,
    _ decimals: UInt8,
    _ treasuryRecipient: UnsafePointer<UInt8>?,
    _ chainId: UInt8
) -> UnsafeMutablePointer<CChar>?

/// Build signed token burn transaction
@_silgen_name("zhtp_client_build_token_burn")
private func cBuildTokenBurn(
    _ handle: UnsafeMutableRawPointer,
    _ tokenId: UnsafePointer<UInt8>?,
    _ amountLo: UInt64,
    _ amountHi: UInt64,
    _ chainId: UInt8
) -> UnsafeMutablePointer<CChar>?

/// Build signed SOV wallet-to-wallet transfer transaction
@_silgen_name("zhtp_client_build_sov_wallet_transfer")
private func cBuildSovWalletTransfer(
    _ handle: UnsafeMutableRawPointer,
    _ fromWalletId: UnsafePointer<UInt8>?,  // 32 bytes
    _ toWalletId: UnsafePointer<UInt8>?,    // 32 bytes
    _ amountLo: UInt64,
    _ amountHi: UInt64,
    _ chainId: UInt8,
    _ nonce: UInt64
) -> UnsafeMutablePointer<CChar>?

/// Build signed token transfer where the sender is an explicit wallet_id.
/// Used for CBE and any token whose sender lives at wallet_id (not identity key).
@_silgen_name("zhtp_client_build_token_wallet_transfer")
private func cBuildTokenWalletTransfer(
    _ handle: UnsafeMutableRawPointer,
    _ tokenId: UnsafePointer<UInt8>?,       // 32 bytes
    _ fromWalletId: UnsafePointer<UInt8>?,  // 32 bytes
    _ toWalletId: UnsafePointer<UInt8>?,    // 32 bytes
    _ amountLo: UInt64,
    _ amountHi: UInt64,
    _ chainId: UInt8,
    _ nonce: UInt64
) -> UnsafeMutablePointer<CChar>?

/// Build signed DAO stake transaction. Moves SOV from the caller's key_id-derived
/// wallet into `sector_dao_key_id` (a welfare DAO wallet), locking for `lockBlocks`.
@_silgen_name("zhtp_client_build_dao_stake")
private func cBuildDaoStake(
    _ handle: UnsafeMutableRawPointer,
    _ sectorDaoKeyId: UnsafePointer<UInt8>?,  // exactly 32 bytes
    _ amountLo: UInt64,
    _ amountHi: UInt64,
    _ nonce: UInt64,
    _ lockBlocks: UInt64,
    _ chainId: UInt8
) -> UnsafeMutablePointer<CChar>?

// MARK: - C FFI Declarations: Domain transactions (handle is opaque IdentityHandle*)

/// Build signed domain update transaction
@_silgen_name("zhtp_client_build_domain_update")
private func cBuildDomainUpdate(
    _ handle: UnsafeMutableRawPointer,
    _ domain: UnsafePointer<CChar>?,
    _ contentCid: UnsafePointer<CChar>?,
    _ chainId: UInt8
) -> UnsafeMutablePointer<CChar>?

/// Build signed domain transfer transaction
@_silgen_name("zhtp_client_build_domain_transfer")
private func cBuildDomainTransfer(
    _ handle: UnsafeMutableRawPointer,
    _ domain: UnsafePointer<CChar>?,
    _ toPubkey: UnsafePointer<UInt8>?,
    _ chainId: UInt8
) -> UnsafeMutablePointer<CChar>?

/// Build signed 10 SOV fee TokenTransfer from owner's Primary wallet to DAO treasury.
/// Returns hex-encoded TokenTransfer string. If `treasuryWalletId` is NULL, lib-client
/// uses the deterministic blake3("SOV_DAO_TREASURY_V1") constant.
@_silgen_name("zhtp_client_build_domain_fee_payment_tx")
private func cBuildDomainFeePaymentTx(
    _ handle: UnsafeMutableRawPointer,
    _ senderWalletId: UnsafePointer<UInt8>?,   // 32 bytes
    _ treasuryWalletId: UnsafePointer<UInt8>?, // 32 bytes or NULL for deterministic
    _ amountLo: UInt64,
    _ amountHi: UInt64,
    _ nonce: UInt64,
    _ chainId: UInt8
) -> UnsafeMutablePointer<CChar>?

/// Build full /api/v1/web4/domains/register JSON body with attached fee_payment_tx.
/// `contentMappingsJson` may be NULL for metadata-only registration.
@_silgen_name("zhtp_client_build_domain_register_request_with_fee_payment")
private func cBuildDomainRegisterRequestWithFeePayment(
    _ handle: UnsafeMutableRawPointer,
    _ domain: UnsafePointer<CChar>?,
    _ contentMappingsJson: UnsafePointer<CChar>?,
    _ feePaymentTxHex: UnsafePointer<CChar>?
) -> UnsafeMutablePointer<CChar>?

// MARK: - C FFI Declarations: Fee Config (global, no handle)

/// Set fee config from server JSON. Returns 0 on success, writes updated_at and chain_height.
@_silgen_name("zhtp_client_set_fee_config_json_ex")
private func cSetFeeConfigJsonEx(
    _ json: UnsafePointer<CChar>,
    _ updatedAt: UnsafeMutablePointer<UInt64>,
    _ chainHeight: UnsafeMutablePointer<UInt64>
) -> Int32

/// Quote exact fee for a hex-encoded transaction.
@_silgen_name("zhtp_client_quote_fee_for_tx_hex")
private func cQuoteFeeForTxHex(_ txHex: UnsafePointer<CChar>) -> UInt64

// MARK: - C FFI Declarations: HandshakeState (3-leg UHP, keys stay in Rust)

/// Create handshake state — keys never leave Rust
@_silgen_name("zhtp_client_handshake_new")
private func cHandshakeNew(
    _ identity: UnsafeMutableRawPointer,
    _ channelBinding: UnsafePointer<UInt8>,
    _ channelBindingLen: Int
) -> UnsafeMutableRawPointer?

/// Produce ClientHello bytes to send to server
@_silgen_name("zhtp_client_handshake_create_client_hello")
private func cHandshakeCreateClientHello(_ hs: UnsafeMutableRawPointer) -> ByteBuffer

/// Feed ServerHello bytes, get ClientFinish bytes back
@_silgen_name("zhtp_client_handshake_process_server_hello")
private func cHandshakeProcessServerHello(
    _ hs: UnsafeMutableRawPointer,
    _ serverHello: UnsafePointer<UInt8>,
    _ serverHelloLen: Int
) -> ByteBuffer

/// Derive session from completed handshake
@_silgen_name("zhtp_client_handshake_finalize")
private func cHandshakeFinalize(_ hs: UnsafeMutableRawPointer) -> UnsafeMutableRawPointer?

/// Get session key (32 bytes) from handshake result
@_silgen_name("zhtp_client_handshake_result_get_session_key")
private func cHandshakeResultGetSessionKey(_ result: UnsafeMutableRawPointer) -> ByteBuffer

/// Get session ID (32 bytes) from handshake result
@_silgen_name("zhtp_client_handshake_result_get_session_id")
private func cHandshakeResultGetSessionId(_ result: UnsafeMutableRawPointer) -> ByteBuffer

/// Get peer DID (null-terminated string) from handshake result
@_silgen_name("zhtp_client_handshake_result_get_peer_did")
private func cHandshakeResultGetPeerDid(_ result: UnsafeMutableRawPointer) -> UnsafeMutablePointer<CChar>?

/// Get peer public key from handshake result
@_silgen_name("zhtp_client_handshake_result_get_peer_public_key")
private func cHandshakeResultGetPeerPublicKey(_ result: UnsafeMutableRawPointer) -> ByteBuffer

/// Free handshake state
@_silgen_name("zhtp_client_handshake_free")
private func cHandshakeFree(_ hs: UnsafeMutableRawPointer)

/// Free handshake result
@_silgen_name("zhtp_client_handshake_result_free")
private func cHandshakeResultFree(_ result: UnsafeMutableRawPointer)

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
        defer { cBufferFree(buf) }

        guard let data = buf.data, buf.len > 0 else {
            throw ClientError.signingError("Failed to sign UHP challenge")
        }

        return Array(UnsafeBufferPointer(start: data.assumingMemoryBound(to: UInt8.self), count: buf.len))
    }

    /// Build a signed JSON request body for `POST /api/v1/identity/update-kyber-key`.
    /// Rust extracts DID + Kyber pk + Dilithium sk from the IdentityHandle and
    /// signs `UPDATE_KYBER_KEY:{did}:{kyber_pk_hex}:{timestamp}` internally —
    /// the secret key never crosses to Swift.
    public func buildKyberKeyUpdate(timestamp: UInt64) throws -> String {
        guard let ptr = cBuildKyberKeyUpdate(handle, timestamp) else {
            throw ClientError.signingError("Failed to build kyber key update")
        }
        defer { cStringFree(ptr) }
        return String(cString: ptr)
    }

    deinit {
        cIdentityFree(handle)
    }
}

public enum ClientError: Error {
    case cryptoError(String)
    case identityError(String)
    case signingError(String)
    case handshakeError(String)
}

// MARK: - HandshakeState (3-leg UHP, keys stay in Rust)

/// Manages a UHP v2 handshake. Secret keys never leave Rust.
///
/// Usage:
///   let hs = try HandshakeState(identity: identity, channelBinding: binding)
///   let clientHello = try hs.createClientHello()   // send to server
///   let clientFinish = try hs.processServerHello(serverHelloBytes)  // send to server
///   let result = try hs.finalize()
///   // result.sessionKey, result.sessionId, result.peerDid
public class HandshakeState {
    private var handle: UnsafeMutableRawPointer?

    /// Create a new handshake state. Channel binding is Blake3(sorted(local_addr || peer_addr)), 32 bytes.
    public init(identity: Identity, channelBinding: Data) throws {
        let hs = channelBinding.withUnsafeBytes { cbPtr -> UnsafeMutableRawPointer? in
            guard let cbBase = cbPtr.baseAddress?.assumingMemoryBound(to: UInt8.self) else { return nil }
            return cHandshakeNew(identity.getHandle(), cbBase, channelBinding.count)
        }
        guard let hs else {
            throw ClientError.handshakeError("Failed to create handshake state")
        }
        self.handle = hs
    }

    /// Produce ClientHello bytes. Send these to the server.
    /// Wire format: [4-byte BE length][serialized HandshakeMessage]
    public func createClientHello() throws -> Data {
        guard let hs = handle else {
            throw ClientError.handshakeError("HandshakeState already consumed")
        }
        let buf = cHandshakeCreateClientHello(hs)
        defer { cBufferFree(buf) }

        guard let data = buf.data, buf.len > 0 else {
            throw ClientError.handshakeError("Failed to create ClientHello")
        }
        return Data(bytes: data, count: buf.len)
    }

    /// Feed raw ServerHello bytes from the server, get ClientFinish bytes back.
    /// Send the returned bytes to the server.
    public func processServerHello(_ serverHello: Data) throws -> Data {
        guard let hs = handle else {
            throw ClientError.handshakeError("HandshakeState already consumed")
        }
        let buf = serverHello.withUnsafeBytes { shPtr -> ByteBuffer in
            guard let shBase = shPtr.baseAddress?.assumingMemoryBound(to: UInt8.self) else {
                return ByteBuffer(data: nil, len: 0)
            }
            return cHandshakeProcessServerHello(hs, shBase, serverHello.count)
        }
        defer { cBufferFree(buf) }

        guard let data = buf.data, buf.len > 0 else {
            throw ClientError.handshakeError("Failed to process ServerHello")
        }
        return Data(bytes: data, count: buf.len)
    }

    /// Derive session from completed handshake. Consumes the handshake state.
    public func finalize() throws -> HandshakeResult {
        guard let hs = handle else {
            throw ClientError.handshakeError("HandshakeState already consumed")
        }
        guard let resultHandle = cHandshakeFinalize(hs) else {
            throw ClientError.handshakeError("Failed to finalize handshake")
        }
        // State is consumed after finalize — don't free it again in deinit
        handle = nil

        return HandshakeResult(handle: resultHandle)
    }

    deinit {
        if let hs = handle {
            cHandshakeFree(hs)
        }
    }
}

/// Session data extracted from a completed UHP handshake
public class HandshakeResult {
    private let handle: UnsafeMutableRawPointer

    fileprivate init(handle: UnsafeMutableRawPointer) {
        self.handle = handle
    }

    /// 32-byte session key for MAC derivation
    public var sessionKey: Data {
        let buf = cHandshakeResultGetSessionKey(handle)
        defer { cBufferFree(buf) }
        guard let data = buf.data, buf.len > 0 else { return Data() }
        return Data(bytes: data, count: buf.len)
    }

    /// 32-byte session ID
    public var sessionId: Data {
        let buf = cHandshakeResultGetSessionId(handle)
        defer { cBufferFree(buf) }
        guard let data = buf.data, buf.len > 0 else { return Data() }
        return Data(bytes: data, count: buf.len)
    }

    /// Server's DID
    public var peerDid: String {
        guard let ptr = cHandshakeResultGetPeerDid(handle) else { return "" }
        defer { cStringFree(ptr) }
        return String(cString: ptr)
    }

    /// Server's public key
    public var peerPublicKey: Data {
        let buf = cHandshakeResultGetPeerPublicKey(handle)
        defer { cBufferFree(buf) }
        guard let data = buf.data, buf.len > 0 else { return Data() }
        return Data(bytes: data, count: buf.len)
    }

    deinit {
        cHandshakeResultFree(handle)
    }
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
        defer { cBufferFree(buf) }

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
        defer { cStringFree(jsonPtr) }
        return String(cString: jsonPtr)
    }

    /// Serialize identity to JSON in lib-network handshake format
    /// This format includes all ZhtpIdentity fields required by the UHP handshake
    /// Use this instead of serializeIdentity() for handshake operations
    public static func serializeIdentityToHandshakeJson(_ identity: Identity) throws -> String {
        guard let jsonPtr = cSerializeIdentityToHandshakeJson(identity.getHandle()) else {
            throw ClientError.identityError("Failed to serialize identity to handshake JSON")
        }
        defer { cStringFree(jsonPtr) }
        return String(cString: jsonPtr)
    }

    /// Export identity keystore as base64 string
    public static func exportKeystoreBase64(_ identity: Identity) throws -> String {
        guard let ptr = cExportKeystoreBase64(identity.getHandle()) else {
            throw ClientError.identityError("Failed to export keystore as base64")
        }
        defer { cStringFree(ptr) }
        return String(cString: ptr)
    }

    // MARK: Deprecated secret key getters — use HandshakeState instead

    /// Deprecated: Use HandshakeState instead. Keys no longer need to cross FFI.
    @available(*, deprecated, message: "Use HandshakeState for UHP handshake — keys stay in Rust")
    public static func getDilithiumSecretKey(_ identity: Identity) throws -> [UInt8] {
        let buf = cIdentityGetDilithiumSecretKey(identity.getHandle())
        defer { cBufferFree(buf) }
        if buf.data == nil || buf.len == 0 {
            throw ClientError.identityError("Failed to get Dilithium secret key")
        }
        let ptr = buf.data!.assumingMemoryBound(to: UInt8.self)
        return Array(UnsafeBufferPointer(start: ptr, count: buf.len))
    }

    /// Deprecated: Use HandshakeState instead. Keys no longer need to cross FFI.
    @available(*, deprecated, message: "Use HandshakeState for UHP handshake — keys stay in Rust")
    public static func getKyberSecretKey(_ identity: Identity) throws -> [UInt8] {
        let buf = cIdentityGetKyberSecretKey(identity.getHandle())
        defer { cBufferFree(buf) }
        if buf.data == nil || buf.len == 0 {
            throw ClientError.identityError("Failed to get Kyber secret key")
        }
        let ptr = buf.data!.assumingMemoryBound(to: UInt8.self)
        return Array(UnsafeBufferPointer(start: ptr, count: buf.len))
    }

    /// Deprecated: Use HandshakeState instead. Keys no longer need to cross FFI.
    @available(*, deprecated, message: "Use HandshakeState for UHP handshake — keys stay in Rust")
    public static func getMasterSeed(_ identity: Identity) throws -> [UInt8] {
        let buf = cIdentityGetMasterSeed(identity.getHandle())
        defer { cBufferFree(buf) }
        if buf.data == nil || buf.len == 0 {
            throw ClientError.identityError("Failed to get master seed")
        }
        let ptr = buf.data!.assumingMemoryBound(to: UInt8.self)
        return Array(UnsafeBufferPointer(start: ptr, count: buf.len))
    }

    /// Get primary wallet ID = blake3(dilithium_pk || kyber_pk) — 32 bytes
    /// Use this as from_wallet_id in SOV transfers.
    public static func getWalletId(_ identity: Identity) throws -> Data {
        let buf = cIdentityGetWalletId(identity.getHandle())
        defer { cBufferFree(buf) }
        if buf.data == nil || buf.len == 0 {
            throw ClientError.identityError("Failed to get wallet ID")
        }
        let ptr = buf.data!.assumingMemoryBound(to: UInt8.self)
        return Data(UnsafeBufferPointer(start: ptr, count: buf.len))
    }

    /// Get 24-word seed phrase (BIP39) derived from the identity master seed
    public static func getSeedPhrase(_ identity: Identity) throws -> String {
        guard let phrasePtr = cIdentityGetSeedPhrase(identity.getHandle()) else {
            throw ClientError.identityError("Failed to get seed phrase")
        }
        defer { cStringFree(phrasePtr) }
        return String(cString: phrasePtr)
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

    /// Restore an Identity from a 24-word master seed phrase
    public static func restoreIdentityFromPhrase(_ phrase: String, deviceId: String) throws -> Identity {
        let handle = try phrase.withCString { phraseCStr in
            try deviceId.withCString { deviceIdCStr in
                guard let h = cRestoreIdentityFromPhrase(phraseCStr, deviceIdCStr) else {
                    throw ClientError.identityError("Failed to restore identity from seed phrase")
                }
                return h
            }
        }

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
    public static func signData(_ data: Data, using identity: Identity) throws -> [UInt8] {
        NSLog("[ZhtpClient] signData: calling zhtp_client_sign_message (len=%d)", data.count)
        let buf = data.withUnsafeBytes { dataPtr in
            cSignMessage(identity.getHandle(), dataPtr.baseAddress ?? UnsafeRawPointer(bitPattern: 0)!, data.count)
        }
        NSLog(
            "[ZhtpClient] signData: zhtp_client_sign_message returned (buf.len=%d buf.data=%@)",
            buf.len,
            buf.data == nil ? "nil" : "non-nil"
        )
        defer { cBufferFree(buf) }

        guard let sigData = buf.data, buf.len > 0 else {
            throw ClientError.signingError("Failed to sign data")
        }

        return Array(UnsafeBufferPointer(start: sigData.assumingMemoryBound(to: UInt8.self), count: buf.len))
    }

    /// Sign PoUW receipt JSON using Rust canonical serialization path.
    /// This guarantees parity with server verification (bincode::serialize(receipt)).
    public static func signPoUWReceiptJson(_ receiptJson: String, using identity: Identity) throws -> [UInt8] {
        guard let jsonData = receiptJson.data(using: .utf8) else {
            throw ClientError.signingError("Failed to encode PoUW receipt JSON")
        }

        let buf = jsonData.withUnsafeBytes { dataPtr in
            cSignPoUWReceiptJson(
                identity.getHandle(),
                dataPtr.baseAddress ?? UnsafeRawPointer(bitPattern: 0)!,
                jsonData.count
            )
        }
        defer { cBufferFree(buf) }

        guard let sigData = buf.data, buf.len > 0 else {
            throw ClientError.signingError("Failed to sign PoUW receipt JSON")
        }

        return Array(UnsafeBufferPointer(start: sigData.assumingMemoryBound(to: UInt8.self), count: buf.len))
    }

    // MARK: Token transactions — handle is opaque IdentityHandle*

    /// Build signed token transfer transaction.
    /// `amountAtoms` is a decimal u128 atoms string (NOT UInt64 — see parseU128Halves).
    public static func buildTokenTransfer(
        tokenId: Data,
        toPublicKey: Data,
        amountAtoms: String,
        nonce: UInt64,
        using identity: Identity,
        chainId: UInt8 = 0x03  // development
    ) throws -> String {
        guard let (amountLo, amountHi) = parseU128Halves(amountAtoms) else {
            throw ClientError.signingError("amountAtoms must be a non-negative u128 decimal string; got \"\(amountAtoms)\"")
        }
        guard let hexPtr = tokenId.withUnsafeBytes({ tokenIdPtr in
            toPublicKey.withUnsafeBytes { toPubkeyPtr in
                cBuildTokenTransfer(
                    identity.getHandle(),
                    tokenIdPtr.baseAddress?.assumingMemoryBound(to: UInt8.self),
                    toPubkeyPtr.baseAddress?.assumingMemoryBound(to: UInt8.self),
                    toPublicKey.count,
                    amountLo, amountHi,
                    chainId,
                    nonce
                )
            }
        }) else {
            throw ClientError.signingError("Failed to build token transfer transaction")
        }
        defer { cStringFree(hexPtr) }
        return String(cString: hexPtr)
    }

    /// Build signed token mint transaction.
    /// `amountAtoms` is a decimal u128 atoms string.
    public static func buildTokenMint(
        tokenId: Data,
        toPublicKey: Data,
        amountAtoms: String,
        using identity: Identity,
        chainId: UInt8 = 0x03  // development
    ) throws -> String {
        guard let (amountLo, amountHi) = parseU128Halves(amountAtoms) else {
            throw ClientError.signingError("amountAtoms must be a non-negative u128 decimal string; got \"\(amountAtoms)\"")
        }
        guard let hexPtr = tokenId.withUnsafeBytes({ tokenIdPtr in
            toPublicKey.withUnsafeBytes { toPubkeyPtr in
                cBuildTokenMint(
                    identity.getHandle(),
                    tokenIdPtr.baseAddress?.assumingMemoryBound(to: UInt8.self),
                    toPubkeyPtr.baseAddress?.assumingMemoryBound(to: UInt8.self),
                    toPublicKey.count,
                    amountLo, amountHi,
                    chainId
                )
            }
        }) else {
            throw ClientError.signingError("Failed to build token mint transaction")
        }
        defer { cStringFree(hexPtr) }
        return String(cString: hexPtr)
    }

    // Protocol treasury recipient key-id (32 bytes)
    private static let treasuryRecipientBytes: [UInt8] = {
        let hex = "6adb0279d2af625f4d292bafe0fcfe3e2020436478b0f90d98adaf820cac1547"
        var result = [UInt8](repeating: 0, count: 32)
        for i in 0..<32 {
            let start = hex.index(hex.startIndex, offsetBy: i * 2)
            let end = hex.index(start, offsetBy: 2)
            result[i] = UInt8(hex[start..<end], radix: 16) ?? 0
        }
        return result
    }()

    /// Build signed token create transaction.
    /// `initialSupplyAtoms` is a decimal u128 atoms string.
    public static func buildTokenCreate(
        name: String,
        symbol: String,
        initialSupplyAtoms: String,
        decimals: UInt8,
        using identity: Identity,
        chainId: UInt8 = 0x03  // development
    ) throws -> String {
        guard let (supplyLo, supplyHi) = parseU128Halves(initialSupplyAtoms) else {
            throw ClientError.signingError("initialSupplyAtoms must be a non-negative u128 decimal string; got \"\(initialSupplyAtoms)\"")
        }
        var treasury = treasuryRecipientBytes
        guard let hexPtr = name.withCString({ namePtr in
            symbol.withCString { symbolPtr in
                treasury.withUnsafeBufferPointer { treasuryPtr in
                    cBuildTokenCreate(
                        identity.getHandle(),
                        namePtr,
                        symbolPtr,
                        supplyLo, supplyHi,
                        decimals,
                        treasuryPtr.baseAddress,
                        chainId
                    )
                }
            }
        }) else {
            throw ClientError.signingError("Failed to build token create transaction")
        }
        defer { cStringFree(hexPtr) }
        return String(cString: hexPtr)
    }

    /// Build signed token burn transaction.
    /// `amountAtoms` is a decimal u128 atoms string.
    public static func buildTokenBurn(
        tokenId: Data,
        amountAtoms: String,
        using identity: Identity,
        chainId: UInt8 = 0x03  // development
    ) throws -> String {
        guard let (amountLo, amountHi) = parseU128Halves(amountAtoms) else {
            throw ClientError.signingError("amountAtoms must be a non-negative u128 decimal string; got \"\(amountAtoms)\"")
        }
        guard let hexPtr = tokenId.withUnsafeBytes({ tokenIdPtr in
            cBuildTokenBurn(
                identity.getHandle(),
                tokenIdPtr.baseAddress?.assumingMemoryBound(to: UInt8.self),
                amountLo, amountHi,
                chainId
            )
        }) else {
            throw ClientError.signingError("Failed to build token burn transaction")
        }
        defer { cStringFree(hexPtr) }
        return String(cString: hexPtr)
    }

    /// Build signed SOV wallet-to-wallet transfer transaction (returns hex-encoded string ready for API).
    /// fromWalletId and toWalletId must each be exactly 32 bytes.
    /// `amountAtoms` is a decimal u128 string in atoms (18 decimals for SOV) —
    /// NOT a JS Number or UInt64. See parseU128Halves for the rationale.
    public static func buildSovWalletTransfer(
        fromWalletId: Data,
        toWalletId: Data,
        amountAtoms: String,
        nonce: UInt64,
        using identity: Identity,
        chainId: UInt8 = 0x03  // development
    ) throws -> String {
        guard let (amountLo, amountHi) = parseU128Halves(amountAtoms) else {
            throw ClientError.signingError("amountAtoms must be a non-negative u128 decimal string; got \"\(amountAtoms)\"")
        }
        print("[ZhtpClient] buildSovWalletTransfer nonce=\(nonce) atoms=\(amountAtoms) lo=\(amountLo) hi=\(amountHi)")

        guard fromWalletId.count == 32 else {
            throw ClientError.signingError("fromWalletId must be exactly 32 bytes, got \(fromWalletId.count)")
        }
        guard toWalletId.count == 32 else {
            throw ClientError.signingError("toWalletId must be exactly 32 bytes, got \(toWalletId.count)")
        }

        guard let hexPtr = fromWalletId.withUnsafeBytes({ fromPtr in
            toWalletId.withUnsafeBytes { toPtr in
                cBuildSovWalletTransfer(
                    identity.getHandle(),
                    fromPtr.baseAddress?.assumingMemoryBound(to: UInt8.self),
                    toPtr.baseAddress?.assumingMemoryBound(to: UInt8.self),
                    amountLo, amountHi,
                    chainId,
                    nonce
                )
            }
        }) else {
            throw ClientError.signingError("Failed to build SOV wallet transfer transaction")
        }
        defer { cStringFree(hexPtr) }
        return String(cString: hexPtr)
    }

    /// Build signed token transfer where the sender is an explicit wallet_id.
    /// Used for CBE and any token held at wallet_id rather than the identity key.
    /// All three 32-byte buffers (tokenId, fromWalletId, toWalletId) are required.
    public static func buildTokenWalletTransfer(
        tokenId: Data,
        fromWalletId: Data,
        toWalletId: Data,
        amountAtoms: String,
        nonce: UInt64,
        using identity: Identity,
        chainId: UInt8 = 0x03  // development
    ) throws -> String {
        guard let (amountLo, amountHi) = parseU128Halves(amountAtoms) else {
            throw ClientError.signingError("amountAtoms must be a non-negative u128 decimal string; got \"\(amountAtoms)\"")
        }
        print("[ZhtpClient] buildTokenWalletTransfer nonce=\(nonce) atoms=\(amountAtoms) lo=\(amountLo) hi=\(amountHi)")

        guard tokenId.count == 32 else {
            throw ClientError.signingError("tokenId must be exactly 32 bytes, got \(tokenId.count)")
        }
        guard fromWalletId.count == 32 else {
            throw ClientError.signingError("fromWalletId must be exactly 32 bytes, got \(fromWalletId.count)")
        }
        guard toWalletId.count == 32 else {
            throw ClientError.signingError("toWalletId must be exactly 32 bytes, got \(toWalletId.count)")
        }

        guard let hexPtr = tokenId.withUnsafeBytes({ tokPtr in
            fromWalletId.withUnsafeBytes { fromPtr in
                toWalletId.withUnsafeBytes { toPtr in
                    cBuildTokenWalletTransfer(
                        identity.getHandle(),
                        tokPtr.baseAddress?.assumingMemoryBound(to: UInt8.self),
                        fromPtr.baseAddress?.assumingMemoryBound(to: UInt8.self),
                        toPtr.baseAddress?.assumingMemoryBound(to: UInt8.self),
                        amountLo, amountHi,
                        chainId,
                        nonce
                    )
                }
            }
        }) else {
            throw ClientError.signingError("Failed to build token wallet transfer transaction")
        }
        defer { cStringFree(hexPtr) }
        return String(cString: hexPtr)
    }

    /// Build signed DAO stake transaction — moves SOV from the identity's key_id
    /// wallet into a sector welfare DAO wallet, locking for `lockBlocks`.
    /// `sectorDaoKeyId` must be exactly 32 bytes. Amount is in nSOV.
    public static func buildDaoStake(
        sectorDaoKeyId: Data,
        amountAtoms: String,
        nonce: UInt64,
        lockBlocks: UInt64,
        using identity: Identity,
        chainId: UInt8 = 0x03
    ) throws -> String {
        guard let (amountLo, amountHi) = parseU128Halves(amountAtoms) else {
            throw ClientError.signingError("amountAtoms must be a non-negative u128 decimal string; got \"\(amountAtoms)\"")
        }
        print("[ZhtpClient] buildDaoStake atoms=\(amountAtoms) lo=\(amountLo) hi=\(amountHi) nonce=\(nonce) lockBlocks=\(lockBlocks) chainId=\(chainId)")

        guard sectorDaoKeyId.count == 32 else {
            throw ClientError.signingError("sectorDaoKeyId must be exactly 32 bytes, got \(sectorDaoKeyId.count)")
        }

        guard let hexPtr = sectorDaoKeyId.withUnsafeBytes({ daoPtr in
            cBuildDaoStake(
                identity.getHandle(),
                daoPtr.baseAddress?.assumingMemoryBound(to: UInt8.self),
                amountLo, amountHi,
                nonce,
                lockBlocks,
                chainId
            )
        }) else {
            throw ClientError.signingError("Failed to build DAO stake transaction")
        }
        defer { cStringFree(hexPtr) }
        return String(cString: hexPtr)
    }

    // MARK: Domain requests — handle is opaque IdentityHandle*
    // Note: C FFI still uses old function names but internally delegates to _request functions
    // which return JSON. New parameters (content_mappings, expected_previous_manifest_cid)
    // require new C FFI exports from lib-client.

    /// Build signed 10 SOV fee payment TokenTransfer from Primary wallet to DAO treasury.
    /// `treasuryWalletId` may be nil to use lib-client's deterministic
    /// blake3("SOV_DAO_TREASURY_V1") constant. `amountAtoms` is a decimal u128 atoms
    /// string (10 SOV = "10000000000000000000").
    public static func buildDomainFeePaymentTx(
        senderWalletId: Data,
        treasuryWalletId: Data?,
        amountAtoms: String,
        nonce: UInt64,
        using identity: Identity,
        chainId: UInt8 = 0x03
    ) throws -> String {
        guard senderWalletId.count == 32 else {
            throw ClientError.signingError("senderWalletId must be exactly 32 bytes, got \(senderWalletId.count)")
        }
        if let treasury = treasuryWalletId, treasury.count != 32 {
            throw ClientError.signingError("treasuryWalletId must be exactly 32 bytes when provided, got \(treasury.count)")
        }
        guard let (amountLo, amountHi) = parseU128Halves(amountAtoms) else {
            throw ClientError.signingError("amountAtoms must be a non-negative u128 decimal string; got \"\(amountAtoms)\"")
        }

        let hexPtr: UnsafeMutablePointer<CChar>? = senderWalletId.withUnsafeBytes { senderPtr -> UnsafeMutablePointer<CChar>? in
            let sender = senderPtr.baseAddress?.assumingMemoryBound(to: UInt8.self)
            if let treasury = treasuryWalletId {
                return treasury.withUnsafeBytes { treasuryPtr in
                    cBuildDomainFeePaymentTx(
                        identity.getHandle(),
                        sender,
                        treasuryPtr.baseAddress?.assumingMemoryBound(to: UInt8.self),
                        amountLo, amountHi,
                        nonce,
                        chainId
                    )
                }
            }
            return cBuildDomainFeePaymentTx(
                identity.getHandle(),
                sender,
                nil,
                amountLo, amountHi,
                nonce,
                chainId
            )
        }

        guard let ptr = hexPtr else {
            throw ClientError.signingError("Failed to build domain fee payment transaction")
        }
        defer { cStringFree(ptr) }
        return String(cString: ptr)
    }

    /// Build the full POST /api/v1/web4/domains/register JSON body with fee_payment_tx attached.
    /// `contentMappingsJson` may be nil for metadata-only registrations.
    public static func buildDomainRegisterRequest(
        domain: String,
        contentMappingsJson: String?,
        feePaymentTxHex: String,
        using identity: Identity
    ) throws -> String {
        let resultPtr: UnsafeMutablePointer<CChar>? = domain.withCString { domainPtr -> UnsafeMutablePointer<CChar>? in
            feePaymentTxHex.withCString { feePtr -> UnsafeMutablePointer<CChar>? in
                if let mappings = contentMappingsJson {
                    return mappings.withCString { mappingsPtr in
                        cBuildDomainRegisterRequestWithFeePayment(
                            identity.getHandle(),
                            domainPtr,
                            mappingsPtr,
                            feePtr
                        )
                    }
                }
                return cBuildDomainRegisterRequestWithFeePayment(
                    identity.getHandle(),
                    domainPtr,
                    nil,
                    feePtr
                )
            }
        }

        guard let ptr = resultPtr else {
            throw ClientError.signingError("Failed to build domain register request")
        }
        defer { cStringFree(ptr) }
        return String(cString: ptr)
    }

    /// Build domain update request (returns JSON for REST API)
    /// Note: expected_previous_manifest_cid not supported via C FFI yet — uses "" as placeholder
    public static func buildDomainUpdateRequest(
        domain: String,
        newManifestCid: String,
        using identity: Identity
    ) throws -> String {
        guard let resultPtr = domain.withCString({ domainPtr in
            newManifestCid.withCString { cidPtr in
                cBuildDomainUpdate(
                    identity.getHandle(),
                    domainPtr,
                    cidPtr,
                    0x03
                )
            }
        }) else {
            throw ClientError.signingError("Failed to build domain update request")
        }
        defer { cStringFree(resultPtr) }
        return String(cString: resultPtr)
    }

    /// Build domain transfer request (returns JSON for REST API)
    /// Note: C FFI takes pubkey bytes; DID-based transfer requires new C FFI export from lib-client
    public static func buildDomainTransferRequest(
        domain: String,
        toOwnerDid: String,
        using identity: Identity
    ) throws -> String {
        // Convert DID to pubkey bytes for the old C FFI
        // Strip "did:zhtp:" prefix and decode hex to bytes
        let hexPart = toOwnerDid.hasPrefix("did:zhtp:")
            ? String(toOwnerDid.dropFirst("did:zhtp:".count))
            : toOwnerDid
        var pubkeyBytes = [UInt8]()
        var chars = hexPart.makeIterator()
        while let c1 = chars.next(), let c2 = chars.next() {
            if let byte = UInt8(String([c1, c2]), radix: 16) {
                pubkeyBytes.append(byte)
            }
        }

        guard let resultPtr = domain.withCString({ domainPtr in
            cBuildDomainTransfer(
                identity.getHandle(),
                domainPtr,
                pubkeyBytes,
                0x03
            )
        }) else {
            throw ClientError.signingError("Failed to build domain transfer request")
        }
        defer { cStringFree(resultPtr) }
        return String(cString: resultPtr)
    }

    // MARK: - Fee Config

    /// Pass fee config JSON to Rust. Returns (updatedAt, chainHeight) on success.
    public static func setFeeConfig(json: String) throws -> (updatedAt: UInt64, chainHeight: UInt64) {
        var updatedAt: UInt64 = 0
        var chainHeight: UInt64 = 0
        let ok = json.withCString { cStr in
            cSetFeeConfigJsonEx(cStr, &updatedAt, &chainHeight)
        }
        guard ok == 1 else {
            throw ClientError.cryptoError("Failed to set fee config (code: \(ok))")
        }
        return (updatedAt, chainHeight)
    }

    /// Quote exact fee for a hex-encoded transaction.
    public static func quoteFeeForTx(txHex: String) -> UInt64 {
        return txHex.withCString { cStr in cQuoteFeeForTxHex(cStr) }
    }
}

// MARK: - Helpers

private func extractString(_ ptr: UnsafeMutablePointer<CChar>?) -> String {
    guard let p = ptr else { return "" }
    defer { cStringFree(p) }
    return String(cString: p)
}

private func extractBuffer(_ buf: ByteBuffer) -> [UInt8] {
    guard let data = buf.data, buf.len > 0 else { return [] }
    defer { cBufferFree(buf) }
    return Array(UnsafeBufferPointer(start: data.assumingMemoryBound(to: UInt8.self), count: buf.len))
}
