// QuicSession.swift — Swift bindings for the persistent-session QUIC FFI
// in lib-client (`zhtp_quic_session_*`). One session per identity stays
// open for the signed-in lifetime; RPCs multiplex over it as new
// bidi streams, and `/api/v1/msg/inbound` rides a long-lived
// unidirectional reader so server-pushed envelopes arrive without
// polling.
//
// All FFI handles are wrapped in classes that free the underlying
// pointer in `deinit`. JS never sees pointers — only opaque string
// IDs minted by `NativeQuicModule` against `QuicSessionStore` /
// `QuicInboundStore`.

import Foundation

// MARK: - C FFI declarations

@_silgen_name("zhtp_quic_session_open")
private func cQuicSessionOpen(
    _ host: UnsafePointer<CChar>,
    _ port: UInt16,
    _ sni: UnsafePointer<CChar>?,
    _ spkiPinHex: UnsafePointer<CChar>?,
    _ alpn: UInt8,
    _ identity: UnsafeRawPointer?
) -> UnsafeMutableRawPointer?

@_silgen_name("zhtp_quic_session_rpc")
private func cQuicSessionRpc(
    _ session: UnsafeMutableRawPointer,
    _ method: UnsafePointer<CChar>,
    _ path: UnsafePointer<CChar>,
    _ headersJson: UnsafePointer<CChar>?,
    _ bodyPtr: UnsafePointer<UInt8>?,
    _ bodyLen: Int
) -> UnsafeMutableRawPointer?

@_silgen_name("zhtp_quic_session_rpc_status")
private func cQuicSessionRpcStatus(_ response: UnsafeRawPointer) -> UInt16

@_silgen_name("zhtp_quic_session_rpc_body")
private func cQuicSessionRpcBody(
    _ response: UnsafeRawPointer,
    _ outLen: UnsafeMutablePointer<Int>
) -> UnsafePointer<UInt8>?

@_silgen_name("zhtp_quic_session_rpc_free")
private func cQuicSessionRpcFree(_ response: UnsafeMutableRawPointer)

@_silgen_name("zhtp_quic_session_inbound_open")
private func cQuicSessionInboundOpen(
    _ session: UnsafeMutableRawPointer,
    _ path: UnsafePointer<CChar>
) -> UnsafeMutableRawPointer?

@_silgen_name("zhtp_quic_session_inbound_read")
private func cQuicSessionInboundRead(
    _ stream: UnsafeMutableRawPointer,
    _ timeoutMs: UInt32,
    _ outPtr: UnsafeMutablePointer<UnsafePointer<UInt8>?>,
    _ outLen: UnsafeMutablePointer<Int>
) -> Int32

@_silgen_name("zhtp_quic_session_inbound_frame_free")
private func cQuicSessionInboundFrameFree(_ ptr: UnsafePointer<UInt8>?, _ len: Int)

@_silgen_name("zhtp_quic_session_inbound_close")
private func cQuicSessionInboundClose(_ stream: UnsafeMutableRawPointer)

@_silgen_name("zhtp_quic_session_close")
private func cQuicSessionClose(_ session: UnsafeMutableRawPointer)

// MARK: - Swift wrappers

public enum QuicAlpn: UInt8 {
    case publicAlpn = 0       // zhtp-public/1
    case uhp = 1              // zhtp-uhp/2 — authenticated
}

public struct QuicRpcResult {
    public let status: UInt16
    public let body: Data
}

public enum QuicSessionError: Error {
    case openFailed
    case rpcFailed
    case streamOpenFailed
    case streamClosed
    case streamError
}

/// Owning wrapper for a `*mut QuicSessionHandle`. Free on deinit.
public final class QuicSession {
    fileprivate var handle: UnsafeMutableRawPointer?

    /// `identity` may be nil for ALPN=0 (public). For ALPN=1 (UHP) the
    /// caller must hand a live `Identity` so its handle is available
    /// across the lifetime of the session.
    public init(
        host: String,
        port: UInt16,
        sni: String?,
        spkiPinHex: String?,
        alpn: QuicAlpn,
        identity: Identity?
    ) throws {
        let identityPtr: UnsafeRawPointer? = identity.map {
            UnsafeRawPointer($0.getHandle())
        }

        let opened: UnsafeMutableRawPointer? = host.withCString { hostPtr in
            withOptionalCString(sni) { sniPtr in
                withOptionalCString(spkiPinHex) { pinPtr in
                    cQuicSessionOpen(
                        hostPtr,
                        port,
                        sniPtr,
                        pinPtr,
                        alpn.rawValue,
                        identityPtr
                    )
                }
            }
        }

        guard let opened else { throw QuicSessionError.openFailed }
        self.handle = opened
    }

    /// Synchronously run one RPC on a new bidirectional stream. Blocks
    /// the calling thread until the response is fully received.
    /// Multiple concurrent calls on the same session are supported by
    /// the FFI and will multiplex across streams.
    public func rpc(
        method: String,
        path: String,
        headersJson: String?,
        body: Data?
    ) throws -> QuicRpcResult {
        guard let session = handle else { throw QuicSessionError.rpcFailed }
        let bodyBytes = body ?? Data()
        let response: UnsafeMutableRawPointer? = method.withCString { mPtr in
            path.withCString { pPtr in
                withOptionalCString(headersJson) { hPtr in
                    bodyBytes.withUnsafeBytes { bufPtr -> UnsafeMutableRawPointer? in
                        let basePtr = bufPtr.bindMemory(to: UInt8.self).baseAddress
                        return cQuicSessionRpc(
                            session,
                            mPtr,
                            pPtr,
                            hPtr,
                            basePtr,
                            bodyBytes.count
                        )
                    }
                }
            }
        }

        guard let response else { throw QuicSessionError.rpcFailed }
        defer { cQuicSessionRpcFree(response) }

        let status = cQuicSessionRpcStatus(response)
        var len: Int = 0
        let bodyPtr = cQuicSessionRpcBody(response, &len)
        let bodyData: Data
        if let bodyPtr, len > 0 {
            bodyData = Data(bytes: bodyPtr, count: len)
        } else {
            bodyData = Data()
        }
        return QuicRpcResult(status: status, body: bodyData)
    }

    /// Open a long-lived inbound stream at `path`. The returned
    /// `QuicInboundStream` owns the FFI handle and exposes a blocking
    /// reader; the bridge layer spins a thread that drains it and
    /// forwards each frame to JS via an event emitter.
    public func openInbound(path: String) throws -> QuicInboundStream {
        guard let session = handle else { throw QuicSessionError.streamOpenFailed }
        let opened: UnsafeMutableRawPointer? = path.withCString { p in
            cQuicSessionInboundOpen(session, p)
        }
        guard let opened else { throw QuicSessionError.streamOpenFailed }
        return QuicInboundStream(handle: opened)
    }

    deinit {
        if let h = handle {
            cQuicSessionClose(h)
            handle = nil
        }
    }
}

/// Owning wrapper for a `*mut InboundStreamHandle`. Free on deinit.
public final class QuicInboundStream {
    fileprivate var handle: UnsafeMutableRawPointer?

    init(handle: UnsafeMutableRawPointer) {
        self.handle = handle
    }

    /// Returns `nil` on timeout. Throws `streamClosed` on peer close
    /// or `streamError` on transport failure. On success, returns one
    /// frame's worth of payload (length-prefix already stripped by the
    /// FFI).
    public func read(timeoutMs: UInt32) throws -> Data? {
        guard let stream = handle else { throw QuicSessionError.streamClosed }
        var ptr: UnsafePointer<UInt8>? = nil
        var len: Int = 0
        let rc = cQuicSessionInboundRead(stream, timeoutMs, &ptr, &len)
        switch rc {
        case 0:
            guard let ptr, len > 0 else { return Data() }
            let data = Data(bytes: ptr, count: len)
            cQuicSessionInboundFrameFree(ptr, len)
            return data
        case 1:
            return nil
        case -1:
            throw QuicSessionError.streamClosed
        default:
            throw QuicSessionError.streamError
        }
    }

    /// Closes the stream. Safe to call multiple times.
    public func close() {
        if let h = handle {
            cQuicSessionInboundClose(h)
            handle = nil
        }
    }

    deinit { close() }
}

// MARK: - Helpers

private func withOptionalCString<R>(
    _ str: String?,
    _ body: (UnsafePointer<CChar>?) -> R
) -> R {
    if let str {
        return str.withCString { body($0) }
    }
    return body(nil)
}
