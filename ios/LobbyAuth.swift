// LobbyAuth.swift — Swift bindings for the lib-client OPAQUE "lobby auth"
// FFI (`zhtp_opaque_*` / `zhtp_lobby_mac_compute`). OPAQUE is a password
// authenticated key exchange: register and login are each a paired
// (start, finish) flow. `_start` mints an opaque Rust state handle that
// the caller carries until `_finish`; `_finish` consumes it.
//
// The state handles never cross the JS bridge — they live in the
// thread-safe `OpaqueRegisterStateStore` / `OpaqueLoginStateStore`,
// keyed by UUID strings minted here. `NativeLobbyAuth` translates those
// UUIDs to/from JS.
//
// Argon2id (m=64 MiB, t=3, p=4) runs inside `register_finish` /
// `login_finish` — ~200 ms, 64 MB heap. Callers must invoke those off
// the bridge thread.

import Foundation

// MARK: - C FFI declarations
//
// `ByteBuffer` and `zhtp_client_buffer_free` are declared in
// ZhtpClient.swift (same target). The struct is reused as-is; the free
// symbol is re-declared here because the ZhtpClient.swift one is file
// private.

@_silgen_name("zhtp_client_buffer_free")
private func cLobbyBufferFree(_ buf: ByteBuffer)

// OPAQUE registration — step 1. Returns a non-null `*mut OpaqueRegisterState`
// on success, null on failure. `out_request` is populated with the bytes
// to POST to `/opaque/register/start`.
@_silgen_name("zhtp_opaque_register_start")
private func cOpaqueRegisterStart(
    _ password: UnsafePointer<CChar>,
    _ outRequest: UnsafeMutablePointer<ByteBuffer>
) -> UnsafeMutableRawPointer?

// OPAQUE registration — step 2. CONSUMES the state handle. Returns 0 on
// success, -1 INVALID_ARGS, -2 DESERIALIZE, -3 OPAQUE_FINISH_FAILED.
@_silgen_name("zhtp_opaque_register_finish")
private func cOpaqueRegisterFinish(
    _ state: UnsafeMutableRawPointer,
    _ password: UnsafePointer<CChar>,
    _ serverResponse: UnsafePointer<UInt8>,
    _ serverResponseLen: Int,
    _ outRecord: UnsafeMutablePointer<ByteBuffer>,
    _ outExportKey: UnsafeMutablePointer<ByteBuffer>
) -> Int32

// Free a register-state handle without consuming it (cancel path).
// No-op on null.
@_silgen_name("zhtp_opaque_register_state_free")
private func cOpaqueRegisterStateFree(_ state: UnsafeMutableRawPointer?)

// OPAQUE login — step 1. Same shape as register start.
@_silgen_name("zhtp_opaque_login_start")
private func cOpaqueLoginStart(
    _ password: UnsafePointer<CChar>,
    _ outRequest: UnsafeMutablePointer<ByteBuffer>
) -> UnsafeMutableRawPointer?

// OPAQUE login — step 2. CONSUMES the state handle. Returns 0 on success,
// -1 INVALID_ARGS, -2 DESERIALIZE, -3 wrong password.
@_silgen_name("zhtp_opaque_login_finish")
private func cOpaqueLoginFinish(
    _ state: UnsafeMutableRawPointer,
    _ password: UnsafePointer<CChar>,
    _ serverResponse: UnsafePointer<UInt8>,
    _ serverResponseLen: Int,
    _ outMsg3: UnsafeMutablePointer<ByteBuffer>,
    _ outSessionKey: UnsafeMutablePointer<ByteBuffer>,
    _ outExportKey: UnsafeMutablePointer<ByteBuffer>
) -> Int32

// Free a login-state handle without consuming it (cancel path).
// No-op on null.
@_silgen_name("zhtp_opaque_login_state_free")
private func cOpaqueLoginStateFree(_ state: UnsafeMutableRawPointer?)

// Compute the per-request channel-binding MAC. `outMac` is caller-owned
// space for exactly 32 bytes. Returns 0 on success, -1 on invalid input.
@_silgen_name("zhtp_lobby_mac_compute")
private func cLobbyMacCompute(
    _ sessionKeyPtr: UnsafePointer<UInt8>,
    _ sessionKeyLen: Int,
    _ method: UInt8,
    _ uri: UnsafePointer<UInt8>?,
    _ uriLen: Int,
    _ body: UnsafePointer<UInt8>?,
    _ bodyLen: Int,
    _ seq: UInt64,
    _ outMac: UnsafeMutablePointer<UInt8>
) -> Int32

// MARK: - Errors

/// Errors thrown by the `LobbyAuth` API. `code` mirrors the JS-facing
/// reject code so `NativeLobbyAuth` can forward it verbatim.
enum LobbyAuthError: Error {
    case startFailed
    case unknownStateId
    case invalidArgs
    case deserialize
    case opaqueFinishFailed
    case wrongPassword
    case macFailed

    var code: String {
        switch self {
        case .startFailed:        return "START_FAILED"
        case .unknownStateId:     return "INVALID_ARGS"
        case .invalidArgs:        return "INVALID_ARGS"
        case .deserialize:        return "DESERIALIZE"
        case .opaqueFinishFailed: return "OPAQUE_FINISH_FAILED"
        case .wrongPassword:      return "WRONG_PASSWORD"
        case .macFailed:          return "MAC_FAILED"
        }
    }

    var message: String {
        switch self {
        case .startFailed:        return "OPAQUE start failed"
        case .unknownStateId:     return "unknown stateId"
        case .invalidArgs:        return "invalid arguments"
        case .deserialize:        return "could not deserialize server response"
        case .opaqueFinishFailed: return "OPAQUE finish failed"
        case .wrongPassword:      return "incorrect username or password"
        case .macFailed:          return "MAC computation failed"
        }
    }
}

// MARK: - State handle stores
//
// Thread-safe maps from JS-visible state ID → raw Rust state pointer.
// Pointers are stored as `UnsafeMutableRawPointer`; they are owned by
// Rust and disposed of either by `_finish` (which consumes them) or by
// `_state_free` (cancel path).

/// Store for in-flight `OpaqueRegisterState*` handles.
final class OpaqueRegisterStateStore {
    static let shared = OpaqueRegisterStateStore()
    private var handles: [String: UnsafeMutableRawPointer] = [:]
    private let queue = DispatchQueue(
        label: "com.sovereign.lobbyauth.register-store",
        attributes: .concurrent
    )

    func add(_ handle: UnsafeMutableRawPointer) -> String {
        let id = UUID().uuidString
        queue.sync(flags: .barrier) { handles[id] = handle }
        return id
    }

    /// Atomically removes and returns the handle, transferring ownership
    /// to the caller. Returns nil if the id is unknown.
    func take(_ id: String) -> UnsafeMutableRawPointer? {
        queue.sync(flags: .barrier) { handles.removeValue(forKey: id) }
    }
}

/// Store for in-flight `OpaqueLoginState*` handles.
final class OpaqueLoginStateStore {
    static let shared = OpaqueLoginStateStore()
    private var handles: [String: UnsafeMutableRawPointer] = [:]
    private let queue = DispatchQueue(
        label: "com.sovereign.lobbyauth.login-store",
        attributes: .concurrent
    )

    func add(_ handle: UnsafeMutableRawPointer) -> String {
        let id = UUID().uuidString
        queue.sync(flags: .barrier) { handles[id] = handle }
        return id
    }

    /// Atomically removes and returns the handle, transferring ownership
    /// to the caller. Returns nil if the id is unknown.
    func take(_ id: String) -> UnsafeMutableRawPointer? {
        queue.sync(flags: .barrier) { handles.removeValue(forKey: id) }
    }
}

// MARK: - Typed results

struct OpaqueStartResult {
    /// JS-visible UUID for the in-flight state handle.
    let stateId: String
    /// Protocol message to POST to the server's `/start` endpoint.
    let request: Data
}

struct OpaqueRegisterFinishResult {
    /// Registration record to POST to the server's `/finish` endpoint.
    let record: Data
    /// 64-byte deterministic per-user export key.
    let exportKey: Data
}

struct OpaqueLoginFinishResult {
    /// Third (final) login message to POST to the server.
    let msg3: Data
    /// 64-byte session key — HMAC key for per-request channel binding.
    let sessionKey: Data
    /// 64-byte deterministic per-user export key.
    let exportKey: Data
}

// MARK: - LobbyAuth API
//
// Clean Swift surface over the FFI. Does the CStr / ByteBuffer
// marshalling, owns the state-store bookkeeping, and frees every
// out-param ByteBuffer after copying its bytes out.

enum LobbyAuth {

    /// Copies the bytes out of a callee-populated ByteBuffer and frees it.
    private static func drain(_ buf: ByteBuffer) -> Data {
        guard let data = buf.data, buf.len > 0 else { return Data() }
        defer { cLobbyBufferFree(buf) }
        return Data(bytes: data, count: buf.len)
    }

    /// An empty/zeroed ByteBuffer for the callee to populate.
    private static func emptyBuffer() -> ByteBuffer {
        ByteBuffer(data: nil, len: 0)
    }

    // ── Registration ─────────────────────────────────────────────

    /// OPAQUE registration step 1. Stores the state handle and returns
    /// its UUID plus the request bytes.
    static func registerStart(password: String) throws -> OpaqueStartResult {
        var outRequest = emptyBuffer()
        let handle: UnsafeMutableRawPointer? = password.withCString { pw in
            cOpaqueRegisterStart(pw, &outRequest)
        }
        guard let handle else { throw LobbyAuthError.startFailed }
        let request = drain(outRequest)
        let stateId = OpaqueRegisterStateStore.shared.add(handle)
        return OpaqueStartResult(stateId: stateId, request: request)
    }

    /// OPAQUE registration step 2. Looks up + removes the handle (the
    /// FFI consumes it). Throws `unknownStateId` if the id is unknown.
    static func registerFinish(
        stateId: String,
        password: String,
        serverResponse: Data
    ) throws -> OpaqueRegisterFinishResult {
        guard let handle = OpaqueRegisterStateStore.shared.take(stateId) else {
            throw LobbyAuthError.unknownStateId
        }
        var outRecord = emptyBuffer()
        var outExportKey = emptyBuffer()
        let serverBytes = [UInt8](serverResponse)
        let rc: Int32 = password.withCString { pw in
            serverBytes.withUnsafeBufferPointer { srv in
                cOpaqueRegisterFinish(
                    handle,
                    pw,
                    srv.baseAddress!,
                    srv.count,
                    &outRecord,
                    &outExportKey
                )
            }
        }
        switch rc {
        case 0:
            return OpaqueRegisterFinishResult(
                record: drain(outRecord),
                exportKey: drain(outExportKey)
            )
        case -1: throw LobbyAuthError.invalidArgs
        case -2: throw LobbyAuthError.deserialize
        case -3: throw LobbyAuthError.opaqueFinishFailed
        default: throw LobbyAuthError.opaqueFinishFailed
        }
    }

    /// Cancel an in-flight registration. Frees the handle if present;
    /// a no-op for an unknown id.
    static func registerCancel(stateId: String) {
        if let handle = OpaqueRegisterStateStore.shared.take(stateId) {
            cOpaqueRegisterStateFree(handle)
        }
    }

    // ── Login ────────────────────────────────────────────────────

    /// OPAQUE login step 1. Stores the state handle and returns its
    /// UUID plus the request bytes.
    static func loginStart(password: String) throws -> OpaqueStartResult {
        var outRequest = emptyBuffer()
        let handle: UnsafeMutableRawPointer? = password.withCString { pw in
            cOpaqueLoginStart(pw, &outRequest)
        }
        guard let handle else { throw LobbyAuthError.startFailed }
        let request = drain(outRequest)
        let stateId = OpaqueLoginStateStore.shared.add(handle)
        return OpaqueStartResult(stateId: stateId, request: request)
    }

    /// OPAQUE login step 2. Looks up + removes the handle (the FFI
    /// consumes it). `-3` from the FFI is the wrong-password signal.
    static func loginFinish(
        stateId: String,
        password: String,
        serverResponse: Data
    ) throws -> OpaqueLoginFinishResult {
        guard let handle = OpaqueLoginStateStore.shared.take(stateId) else {
            throw LobbyAuthError.unknownStateId
        }
        var outMsg3 = emptyBuffer()
        var outSessionKey = emptyBuffer()
        var outExportKey = emptyBuffer()
        let serverBytes = [UInt8](serverResponse)
        let rc: Int32 = password.withCString { pw in
            serverBytes.withUnsafeBufferPointer { srv in
                cOpaqueLoginFinish(
                    handle,
                    pw,
                    srv.baseAddress!,
                    srv.count,
                    &outMsg3,
                    &outSessionKey,
                    &outExportKey
                )
            }
        }
        switch rc {
        case 0:
            return OpaqueLoginFinishResult(
                msg3: drain(outMsg3),
                sessionKey: drain(outSessionKey),
                exportKey: drain(outExportKey)
            )
        case -1: throw LobbyAuthError.invalidArgs
        case -2: throw LobbyAuthError.deserialize
        case -3: throw LobbyAuthError.wrongPassword
        default: throw LobbyAuthError.wrongPassword
        }
    }

    /// Cancel an in-flight login. Frees the handle if present; a no-op
    /// for an unknown id.
    static func loginCancel(stateId: String) {
        if let handle = OpaqueLoginStateStore.shared.take(stateId) {
            cOpaqueLoginStateFree(handle)
        }
    }

    // ── Channel binding ──────────────────────────────────────────

    /// Compute the 32-byte per-request channel-binding MAC.
    /// `sessionKey` must be exactly 64 bytes; `method` is 0..6.
    static func macCompute(
        sessionKey: Data,
        method: UInt8,
        uri: String,
        body: Data,
        seq: UInt64
    ) throws -> Data {
        guard sessionKey.count == 64 else { throw LobbyAuthError.macFailed }
        let keyBytes = [UInt8](sessionKey)
        let uriBytes = [UInt8](uri.utf8)
        let bodyBytes = [UInt8](body)
        var outMac = [UInt8](repeating: 0, count: 32)

        let rc: Int32 = keyBytes.withUnsafeBufferPointer { key in
            uriBytes.withUnsafeBufferPointer { uriPtr in
                bodyBytes.withUnsafeBufferPointer { bodyPtr in
                    outMac.withUnsafeMutableBufferPointer { mac in
                        cLobbyMacCompute(
                            key.baseAddress!,
                            key.count,
                            method,
                            uriPtr.baseAddress,
                            uriPtr.count,
                            bodyPtr.baseAddress,
                            bodyPtr.count,
                            seq,
                            mac.baseAddress!
                        )
                    }
                }
            }
        }
        guard rc == 0 else { throw LobbyAuthError.macFailed }
        return Data(outMac)
    }
}
