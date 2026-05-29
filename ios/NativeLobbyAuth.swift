// NativeLobbyAuth.swift — React Native bridge for the OPAQUE "lobby auth"
// flow. JS calls land here; all binary values cross the bridge as
// standard-alphabet, padded base64 strings. The CPU-heavy `_finish`
// calls (Argon2id, ~200 ms) are dispatched off the bridge thread.
//
// Plain `NSObject` module — no events, so no `RCTEventEmitter`.

import Foundation
import React

@objc(NativeLobbyAuth)
class NativeLobbyAuth: NSObject {

    @objc static func requiresMainQueueSetup() -> Bool { false }

    /// Shared queue for the FFI work. `_finish` calls block on Argon2id;
    /// never run them on the bridge thread.
    private static let workQueue = DispatchQueue.global(qos: .userInitiated)

    /// Maps a thrown `LobbyAuthError` to a JS promise rejection.
    private func reject(
        _ error: Error,
        _ reject: RCTPromiseRejectBlock
    ) {
        if let e = error as? LobbyAuthError {
            reject(e.code, e.message, nil)
        } else {
            reject("INVALID_ARGS", "\(error)", nil)
        }
    }

    // ── Registration ─────────────────────────────────────────────

    @objc
    func opaqueRegisterStart(
        _ password: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        Self.workQueue.async {
            do {
                let result = try LobbyAuth.registerStart(password: password)
                resolve([
                    "stateId": result.stateId,
                    "requestB64": result.request.base64EncodedString(),
                ])
            } catch {
                self.reject(error, reject)
            }
        }
    }

    @objc
    func opaqueRegisterFinish(
        _ stateId: String,
        password: String,
        serverMsgB64: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let serverMsg = Data(base64Encoded: serverMsgB64) else {
            reject("INVALID_ARGS", "serverMsgB64 is not valid base64", nil)
            return
        }
        Self.workQueue.async {
            do {
                let result = try LobbyAuth.registerFinish(
                    stateId: stateId,
                    password: password,
                    serverResponse: serverMsg
                )
                resolve([
                    "recordB64": result.record.base64EncodedString(),
                    "exportKeyB64": result.exportKey.base64EncodedString(),
                ])
            } catch {
                self.reject(error, reject)
            }
        }
    }

    @objc
    func opaqueRegisterCancel(
        _ stateId: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        Self.workQueue.async {
            LobbyAuth.registerCancel(stateId: stateId)
            resolve(nil)
        }
    }

    // ── Login ────────────────────────────────────────────────────

    @objc
    func opaqueLoginStart(
        _ password: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        Self.workQueue.async {
            do {
                let result = try LobbyAuth.loginStart(password: password)
                resolve([
                    "stateId": result.stateId,
                    "requestB64": result.request.base64EncodedString(),
                ])
            } catch {
                self.reject(error, reject)
            }
        }
    }

    @objc
    func opaqueLoginFinish(
        _ stateId: String,
        password: String,
        serverMsgB64: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let serverMsg = Data(base64Encoded: serverMsgB64) else {
            reject("INVALID_ARGS", "serverMsgB64 is not valid base64", nil)
            return
        }
        Self.workQueue.async {
            do {
                let result = try LobbyAuth.loginFinish(
                    stateId: stateId,
                    password: password,
                    serverResponse: serverMsg
                )
                resolve([
                    "msg3B64": result.msg3.base64EncodedString(),
                    "sessionKeyB64": result.sessionKey.base64EncodedString(),
                    "exportKeyB64": result.exportKey.base64EncodedString(),
                ])
            } catch {
                self.reject(error, reject)
            }
        }
    }

    @objc
    func opaqueLoginCancel(
        _ stateId: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        Self.workQueue.async {
            LobbyAuth.loginCancel(stateId: stateId)
            resolve(nil)
        }
    }

    // ── Channel binding ──────────────────────────────────────────

    @objc
    func lobbyMacCompute(
        _ sessionKeyB64: String,
        method: NSNumber,
        uri: String,
        bodyB64: String,
        seq: NSNumber,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let sessionKey = Data(base64Encoded: sessionKeyB64) else {
            reject("MAC_FAILED", "sessionKeyB64 is not valid base64", nil)
            return
        }
        // bodyB64 may be empty — that decodes to empty Data.
        let body = bodyB64.isEmpty
            ? Data()
            : Data(base64Encoded: bodyB64)
        guard let body else {
            reject("MAC_FAILED", "bodyB64 is not valid base64", nil)
            return
        }
        Self.workQueue.async {
            do {
                let mac = try LobbyAuth.macCompute(
                    sessionKey: sessionKey,
                    method: method.uint8Value,
                    uri: uri,
                    body: body,
                    seq: seq.uint64Value
                )
                let macHex = mac.map { String(format: "%02x", $0) }.joined()
                resolve(["macHex": macHex])
            } catch {
                self.reject(error, reject)
            }
        }
    }
}
