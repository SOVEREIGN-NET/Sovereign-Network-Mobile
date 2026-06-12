// NativeQuicSession.swift — React Native bridge for the persistent
// QUIC session FFI. JS calls land here; sessions and inbound streams
// are tracked in thread-safe stores keyed by UUID. Inbound frames
// are forwarded to JS as `QuicInboundFrame` events on the
// `RCTEventEmitter` — one event per frame, with the stream's UUID
// so multiple listeners can demultiplex.

import Foundation
import React

/// Thread-safe map from JS-visible session ID → live `QuicSession`.
final class QuicSessionStore {
    static let shared = QuicSessionStore()
    private var sessions: [String: QuicSession] = [:]
    private let queue = DispatchQueue(
        label: "com.sovereign.quic.session-store",
        attributes: .concurrent
    )

    func add(_ session: QuicSession) -> String {
        let id = UUID().uuidString
        queue.sync(flags: .barrier) { sessions[id] = session }
        return id
    }

    func get(_ id: String) -> QuicSession? {
        queue.sync { sessions[id] }
    }

    func remove(_ id: String) {
        queue.sync(flags: .barrier) { _ = sessions.removeValue(forKey: id) }
    }
}

/// Per-inbound-stream state. Owns the underlying stream and the
/// reader thread that drains it.
///
/// The reader thread closes the stream itself on exit (after its
/// blocking `cQuicSessionInboundRead` returns or sees cancellation),
/// then signals the shared `exited` semaphore. External callers
/// must NOT call `stream.close()` while the reader could be
/// mid-read — doing so frees state under a blocked FFI call and
/// crashes the process.
final class InboundStreamRunner {
    let stream: QuicInboundStream
    let thread: Thread
    let sessionId: String
    let exited: DispatchSemaphore

    init(
        stream: QuicInboundStream,
        thread: Thread,
        sessionId: String,
        exited: DispatchSemaphore
    ) {
        self.stream = stream
        self.thread = thread
        self.sessionId = sessionId
        self.exited = exited
    }

    /// Signal cancellation. Returns immediately; the reader thread
    /// notices on its next read-timeout boundary (≤1 s), closes the
    /// stream, and signals `exited`.
    func requestCancel() {
        thread.cancel()
    }

    /// Block until the reader thread has fully exited, or `timeout`
    /// elapses. Safe to call from any non-reader thread.
    func waitForExit(timeout: TimeInterval) {
        _ = exited.wait(timeout: .now() + timeout)
    }
}

final class QuicInboundStore {
    static let shared = QuicInboundStore()
    private var streams: [String: InboundStreamRunner] = [:]
    private let queue = DispatchQueue(
        label: "com.sovereign.quic.inbound-store",
        attributes: .concurrent
    )

    func add(_ runner: InboundStreamRunner) -> String {
        let id = UUID().uuidString
        queue.sync(flags: .barrier) { streams[id] = runner }
        return id
    }

    func get(_ id: String) -> InboundStreamRunner? {
        queue.sync { streams[id] }
    }

    func remove(_ id: String) -> InboundStreamRunner? {
        queue.sync(flags: .barrier) {
            let r = streams.removeValue(forKey: id)
            return r
        }
    }

    /// Snapshot of all runners currently bound to `sessionId`.
    /// Used by `closeSession` to cancel-and-wait the readers
    /// belonging to a session before freeing it.
    func allForSession(_ sessionId: String) -> [InboundStreamRunner] {
        queue.sync {
            streams.values.filter { $0.sessionId == sessionId }
        }
    }
}

@objc(NativeQuicSession)
class NativeQuicSession: RCTEventEmitter {

    @objc override static func requiresMainQueueSetup() -> Bool { return false }

    /// Events emitted to JS. Names must match `addListener` strings on
    /// the JS side (`NativeEventEmitter`).
    override func supportedEvents() -> [String]! {
        return ["QuicInboundFrame", "QuicInboundClosed", "QuicInboundError"]
    }

    // ── Lifecycle ────────────────────────────────────────────────

    // Under RN 0.82 New Architecture, `sendEventWithName:body:` asserts
    // when `_callableJSModules` is nil — which happens after the bridge
    // is invalidated (reload, teardown). Our reader threads can outlive
    // that moment, so every emission goes through `emit(...)` which
    // gates on `hasJsListeners` (cleared by RN's `stopObserving`) and
    // the bridge's validity.
    private var hasJsListeners = false
    override func startObserving() { hasJsListeners = true }
    override func stopObserving() { hasJsListeners = false }

    private func emit(_ name: String, body: [String: Any]) {
        guard hasJsListeners, bridge?.isValid == true else { return }
        sendEvent(withName: name, body: body)
    }

    // ── openSession ──────────────────────────────────────────────
    //
    // identityDid is used to look up the live `Identity` in the
    // existing `IdentityHandleStore`. For ALPN=0 (public), pass an
    // empty string + alpn:0; identity will be ignored.

    @objc
    func openSession(
        _ identityDid: String,
        host: String,
        port: NSNumber,
        alpn: NSNumber,
        sni: NSString?,
        spkiPinHex: NSString?,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        let alpnRaw = alpn.uint8Value
        let alpnValue: QuicAlpn = (alpnRaw == 1) ? .uhp : .publicAlpn

        var identity: Identity? = nil
        if alpnValue == .uhp {
            guard !identityDid.isEmpty,
                  let any = IdentityHandleStore.shared.retrieve(by: identityDid),
                  let id = any as? Identity
            else {
                reject("NO_IDENTITY",
                       "No live Identity in handle store for did \(identityDid)",
                       nil)
                return
            }
            identity = id
        }

        // lib-client's connect path uses `SocketAddr::from_str` which
        // only accepts literal IPs — hostnames like
        // `g1.thesovereignnetwork.org` are rejected at parse time and
        // the FFI returns null with no detail. Resolve here so the
        // FFI always gets an IP literal.
        let resolvedHost = Self.resolveHost(host) ?? host
        if resolvedHost != host {
            print("[NativeQuicSession] resolved \(host) -> \(resolvedHost)")
        }

        // Dilithium5 signing (run inside the PQC handshake) needs
        // ~1 MB of stack. GCD threads only get 512 KB, so the inner
        // call stack-overflows mid-signing and crashes. Use a
        // dedicated Thread with a 2 MB stack — same pattern the
        // legacy `enqueueQuinnRequest` path uses for the same
        // reason.
        let work = Thread { [weak self] in
            _ = self
            do {
                let session = try QuicSession(
                    host: resolvedHost,
                    port: port.uint16Value,
                    sni: sni as String?,
                    spkiPinHex: spkiPinHex as String?,
                    alpn: alpnValue,
                    identity: identity
                )
                let id = QuicSessionStore.shared.add(session)
                resolve(id)
            } catch {
                print("[NativeQuicSession] ❌ open failed: \(error)")
                reject(
                    "OPEN_FAILED",
                    "QuicSession.open failed: \(error)",
                    error
                )
            }
        }
        work.stackSize = 2 * 1024 * 1024
        work.qualityOfService = .userInitiated
        work.start()
    }

    /// Resolve `host` to its first IPv4 address. Returns nil on
    /// failure (caller falls back to the original string and lets
    /// the FFI surface the parse error). Already-numeric inputs
    /// pass through unchanged.
    private static func resolveHost(_ host: String) -> String? {
        if host.range(of: #"^\d+\.\d+\.\d+\.\d+$"#, options: .regularExpression) != nil {
            return host
        }
        var hints = addrinfo(
            ai_flags: 0,
            ai_family: AF_INET,
            ai_socktype: SOCK_STREAM,
            ai_protocol: 0,
            ai_addrlen: 0,
            ai_canonname: nil,
            ai_addr: nil,
            ai_next: nil
        )
        var result: UnsafeMutablePointer<addrinfo>? = nil
        let rc = getaddrinfo(host, nil, &hints, &result)
        if rc != 0 || result == nil {
            return nil
        }
        defer { freeaddrinfo(result) }
        guard let addrPtr = result?.pointee.ai_addr else { return nil }
        var addr = sockaddr_in()
        let size = MemoryLayout<sockaddr_in>.size
        memcpy(&addr, addrPtr, size)
        var buf = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
        let conv = withUnsafePointer(to: &addr.sin_addr) {
            inet_ntop(AF_INET, $0, &buf, socklen_t(INET_ADDRSTRLEN))
        }
        guard conv != nil else { return nil }
        return String(cString: buf)
    }

    @objc
    func closeSession(_ sessionId: String) {
        // Any inbound readers attached to this session are blocked in
        // `cQuicSessionInboundRead` (1 s polling timeout). Freeing
        // the session while a read is in flight crashes the process,
        // so cancel-and-join the readers first. Dispatch off the
        // bridge thread — the wait can take up to ~2.5 s if a reader
        // is mid-blocking-call.
        DispatchQueue.global(qos: .utility).async {
            let runners = QuicInboundStore.shared.allForSession(sessionId)
            for r in runners { r.requestCancel() }
            for r in runners { r.waitForExit(timeout: 2.5) }
            QuicSessionStore.shared.remove(sessionId)
        }
    }

    // ── rpc ──────────────────────────────────────────────────────
    //
    // Body is passed as a base64 string so binary payloads (bincode
    // envelopes etc.) survive the JS bridge. Response body comes back
    // base64 too. Headers are JSON-encoded so we can extend without
    // a bridge contract change.

    @objc
    func rpc(
        _ sessionId: String,
        method: String,
        path: String,
        headersJson: NSString?,
        bodyB64: NSString?,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let session = QuicSessionStore.shared.get(sessionId) else {
            reject("NO_SESSION", "session \(sessionId) not found", nil)
            return
        }
        let body: Data? = (bodyB64 as String?).flatMap { Data(base64Encoded: $0) }
        // Hop off the bridge thread — `rpc` blocks waiting for the
        // lib-client worker thread to send the response. The signing
        // happens on that worker, not on this caller, so GCD's
        // default 512 KB stack is fine here.
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let result = try session.rpc(
                    method: method,
                    path: path,
                    headersJson: headersJson as String?,
                    body: body
                )
                let status = Int(result.status)
                let bodyString = String(data: result.body, encoding: .utf8) ?? ""
                resolve([
                    "status": status,
                    "statusText": (status >= 200 && status < 300) ? "OK" : "Error",
                    "headers": [String: String](),
                    "body": bodyString,
                    "ok": status >= 200 && status < 300
                ])
            } catch {
                reject("RPC_FAILED", "QuicSession.rpc failed: \(error)", error)
            }
        }
    }

    // ── inbound subscribe ────────────────────────────────────────
    //
    // Opens a long-lived stream and starts a reader thread that
    // drains frames in a blocking loop. Each frame fires a
    // `QuicInboundFrame` event with the stream id + base64 payload.

    @objc
    func openInbound(
        _ sessionId: String,
        path: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        print("[NativeQuicSession] openInbound bridge call session=\(sessionId.prefix(8))… path=\(path)")
        guard let session = QuicSessionStore.shared.get(sessionId) else {
            reject("NO_SESSION", "session \(sessionId) not found", nil)
            return
        }

        let stream: QuicInboundStream
        do {
            stream = try session.openInbound(path: path)
        } catch {
            reject("INBOUND_OPEN_FAILED",
                   "openInbound failed: \(error)", error)
            return
        }

        // Pre-mint the JS-visible ID so the reader thread can label
        // events even if the JS caller hasn't received the resolve
        // yet (race-free).
        var streamId: String = ""
        // Shared with the runner so `closeSession` can wait for the
        // reader to actually exit before freeing the session.
        let exited = DispatchSemaphore(value: 0)
        let reader = Thread { [weak self] in
            // Whatever exit path we take, close the stream ourselves
            // (the only safe place — concurrent close from another
            // thread while we're in `cQuicSessionInboundRead` is a
            // UAF) and notify any waiter.
            defer {
                stream.close()
                exited.signal()
                _ = QuicInboundStore.shared.remove(streamId)
            }
            guard let self else { return }
            while !Thread.current.isCancelled {
                do {
                    // 1-second polling timeout lets the loop notice
                    // cancellation promptly without churning the
                    // worker for nothing.
                    guard let frame = try stream.read(timeoutMs: 1000) else {
                        continue
                    }
                    if Thread.current.isCancelled { return }
                    let b64 = frame.base64EncodedString()
                    self.emit(
                        "QuicInboundFrame",
                        body: ["streamId": streamId, "frameB64": b64]
                    )
                } catch QuicSessionError.streamClosed {
                    self.emit(
                        "QuicInboundClosed",
                        body: ["streamId": streamId]
                    )
                    return
                } catch {
                    self.emit(
                        "QuicInboundError",
                        body: [
                            "streamId": streamId,
                            "error": "\(error)"
                        ]
                    )
                    return
                }
            }
        }
        reader.stackSize = 1 * 1024 * 1024
        reader.qualityOfService = .utility

        let runner = InboundStreamRunner(
            stream: stream,
            thread: reader,
            sessionId: sessionId,
            exited: exited
        )
        streamId = QuicInboundStore.shared.add(runner)
        reader.start()
        resolve(streamId)
    }

    @objc
    func closeInbound(_ streamId: String) {
        // Only signal cancellation. The reader thread closes its
        // own stream when its blocking read returns and signals
        // exited — calling `cQuicSessionInboundClose` from here
        // would race the read and free state under the FFI.
        if let runner = QuicInboundStore.shared.get(streamId) {
            runner.requestCancel()
        }
    }
}
