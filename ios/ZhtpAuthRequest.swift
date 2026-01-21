import Foundation
import Network

// MARK: - ZHTP Authenticated Request Handler

/// Send an authenticated ZHTP request
/// Requires an active AuthSession with valid credentials
func sendAuthenticatedZhtpRequest(
    connection: NWConnection,
    session: inout AuthSession,
    method: ZhtpMethod,
    path: String,
    headers: [String: String],
    body: Data?,
    requester: String,
    completion: @escaping (Result<(status: UInt16, body: Data), Error>) -> Void
) {
    // Verify session is still valid
    guard session.isValid() else {
        completion(.failure(NSError(domain: "ZHTP", code: 401, userInfo: [NSLocalizedDescriptionKey: "Session invalid or expired"])))
        return
    }

    let requestBody = body ?? Data()

    // Extract content type and fees from headers
    let contentType = headers["content-type"] ?? "application/json"
    let daoFee = UInt64(headers["dao_fee"] ?? "0") ?? 0
    let totalFees = UInt64(headers["total_fees"] ?? String(daoFee)) ?? daoFee

    // Generate request ID and timestamps
    let requestId = Data((0..<16).map { _ in UInt8.random(in: 0...255) })
    let now = Date()
    let timestamp = UInt64(now.timeIntervalSince1970)
    let timestampMs = UInt64(now.timeIntervalSince1970 * 1000)

    // Build request headers
    let requestHeaders = ZhtpHeaders(
        content_type: contentType,
        content_length: UInt64(requestBody.count),
        dao_fee: daoFee,
        total_fees: totalFees,
        content_encoding: headers["content-encoding"],
        cache_control: headers["cache-control"],
        network_fee: headers["network_fee"].flatMap(UInt64.init),
        priority: headers["priority"].flatMap(UInt8.init)
    )

    // Build auth context
    do {
        let authContext = try buildAuthContext(
            session: &session,
            method: method,
            path: path,
            body: requestBody
        )
        print("[ZHTP Auth] Sequence: \(authContext.sequence), MAC computed")

        // Update session's last activity
        session.touch()

        // Build ZhtpRequest with authenticated fields
        let zhttpRequest = ZhtpRequest(
            method: method,
            uri: path,
            version: "1.0",
            headers: requestHeaders,
            body: requestBody,
            timestamp: timestamp,
            requester: requester,
            auth_proof: nil
        )

        // Build ZhtpRequestWire with auth_context as JSON
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let authContextJson = try encoder.encode(authContext)
        let authContextDict = try JSONSerialization.jsonObject(with: authContextJson) as? [String: Any]

        // Create wire wrapper
        var wireDict: [String: Any] = [
            "version": 1,
            "request_id": requestId,
            "timestamp_ms": timestampMs,
            "request": [
                "method": method.stringValue,
                "uri": path,
                "version": "1.0",
                "headers": [
                    "content_type": contentType,
                    "content_length": requestBody.count,
                    "dao_fee": daoFee,
                    "total_fees": totalFees
                ],
                "body": requestBody,
                "timestamp": timestamp,
                "requester": requester
            ] as [String: Any]
        ]

        if let authDict = authContextDict {
            wireDict["auth_context"] = authDict
        } else {
            wireDict["auth_context"] = NSNull()
        }

        // Encode to CBOR
        let cborData: Data
        do {
            cborData = try zhtp_encode_authenticated_request(
                method: method,
                uri: path,
                contentType: contentType,
                requestBody: requestBody,
                timestamp: timestamp,
                timestampMs: timestampMs,
                requestId: requestId,
                requester: requester,
                authContext: authContext
            )
        } catch {
            completion(.failure(error))
            return
        }

        print("[ZHTP Auth] CBOR encoded: \(cborData.count) bytes")

        // Frame with 4-byte big-endian length prefix
        let framedData: Data
        do {
            framedData = try zhtp_frame_encode(cbor_payload: cborData)
        } catch {
            completion(.failure(error))
            return
        }

        print("[ZHTP Auth] Framed: \(framedData.count) bytes")

        // Send on QUIC stream
        connection.send(
            content: framedData,
            contentContext: .finalMessage,
            isComplete: true,
            completion: NWConnection.SendCompletion.contentProcessed { error in
                if let error = error {
                    print("[ZHTP Auth] Send failed: \(error.localizedDescription)")
                    completion(.failure(error))
                    return
                }
                print("[ZHTP Auth] Send succeeded, waiting for response...")
                receiveAuthenticatedZhtpResponse(
                    connection: connection,
                    requestId: requestId,
                    completion: completion
                )
            }
        )
    } catch {
        completion(.failure(error))
    }
}

/// Send an authenticated ZHTP request over Quinn (Rust FFI).
func sendAuthenticatedZhtpRequestViaQuinn(
    quinnHandle: UInt64,
    session: inout AuthSession,
    method: ZhtpMethod,
    path: String,
    headers: [String: String],
    body: Data?,
    requester: String
) -> Result<(status: UInt16, body: Data), Error> {
    guard session.isValid() else {
        return .failure(NSError(domain: "ZHTP", code: 401, userInfo: [NSLocalizedDescriptionKey: "Session invalid or expired"]))
    }

    let requestBody = body ?? Data()
    let contentType = headers["content-type"] ?? "application/json"
    let daoFee = UInt64(headers["dao_fee"] ?? "0") ?? 0
    let totalFees = UInt64(headers["total_fees"] ?? String(daoFee)) ?? daoFee

    let requestId = Data((0..<16).map { _ in UInt8.random(in: 0...255) })
    let now = Date()
    let timestamp = UInt64(now.timeIntervalSince1970)
    let timestampMs = UInt64(now.timeIntervalSince1970 * 1000)

    do {
        let authContext = try buildAuthContext(
            session: &session,
            method: method,
            path: path,
            body: requestBody
        )
        session.touch()

        print("[ZHTP Auth] Wire version=1, Request version=1.0")

        let cborData = try zhtp_encode_authenticated_request(
            method: method,
            uri: path,
            contentType: contentType,
            requestBody: requestBody,
            timestamp: timestamp,
            timestampMs: timestampMs,
            requestId: requestId,
            requester: requester,
            authContext: authContext
        )

        let framedData = try zhtp_frame_encode(cbor_payload: cborData)
        var responseData: Data?

        let rc = framedData.withUnsafeBytes { buf -> Int32 in
            guard let reqPtr = buf.baseAddress?.assumingMemoryBound(to: UInt8.self) else {
                return -1
            }

            var respPtr: UnsafeMutablePointer<UInt8>?
            var respLen: Int = 0
            let rc = uhp_quic_request(
                quinnHandle,
                reqPtr,
                framedData.count,
                &respPtr,
                &respLen
            )
            if rc != 0 {
                return rc
            }

            guard let responsePtr = respPtr, respLen > 0 else {
                return -1
            }

            responseData = Data(bytes: responsePtr, count: respLen)
            uhp_quic_free_buffer(responsePtr, respLen)
            return 0
        }

        if rc != 0 {
            return .failure(NSError(domain: "ZHTP", code: -1, userInfo: [NSLocalizedDescriptionKey: "Quinn request failed"]))
        }

        guard let responseData = responseData else {
            return .failure(NSError(domain: "ZHTP", code: -1, userInfo: [NSLocalizedDescriptionKey: "Empty Quinn response"]))
        }

        let (payload, _) = try zhtp_frame_decode_message(data: responseData)
        let responseWire = try zhtp_decode_response(payload)
        guard responseWire.request_id == requestId else {
            return .failure(NSError(domain: "ZHTP", code: -1, userInfo: [NSLocalizedDescriptionKey: "Response request_id mismatch"]))
        }
        return .success((status: responseWire.status, body: responseWire.response.body))
    } catch {
        return .failure(error)
    }
}

/// Receive and decode authenticated ZHTP response
private func receiveAuthenticatedZhtpResponse(
    connection: NWConnection,
    requestId: Data,
    completion: @escaping (Result<(status: UInt16, body: Data), Error>) -> Void
) {
    var responseData = Data()
    var hasCompleted = false
    let completionLock = NSLock()

    func safeComplete(_ result: Result<(status: UInt16, body: Data), Error>) {
        completionLock.lock()
        defer { completionLock.unlock() }
        guard !hasCompleted else { return }
        hasCompleted = true
        completion(result)
    }

    func receiveMore() {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { content, context, isComplete, error in
            if let error = error {
                print("[ZHTP Auth] Receive error: \(error)")
                safeComplete(.failure(error))
                return
            }

            if let content = content {
                responseData.append(content)
                print("[ZHTP Auth] Received \(content.count) bytes, total: \(responseData.count)")
            }

            if isComplete {
                print("[ZHTP Auth] Stream complete, decoding response...")
                do {
                    // Unframe: read 4-byte length, then payload
                    let (payload, _) = try zhtp_frame_decode_message(data: responseData)
                    let responseWire = try zhtp_decode_response(payload)

                    // Verify response request_id matches
                    guard responseWire.request_id == requestId else {
                        throw NSError(
                            domain: "ZHTP",
                            code: -1,
                            userInfo: [NSLocalizedDescriptionKey: "Response request_id mismatch"]
                        )
                    }

                    print("[ZHTP Auth] Response: status \(responseWire.status), nested body \(responseWire.response.body.count) bytes")
                    // Extract nested response body
                    safeComplete(.success((status: responseWire.status, body: responseWire.response.body)))
                } catch {
                    print("[ZHTP Auth] Decode error: \(error)")
                    safeComplete(.failure(error))
                }
            } else if content == nil && !isComplete {
                // No data yet, continue waiting
                receiveMore()
            } else {
                receiveMore()
            }
        }
    }

    receiveMore()
}

// MARK: - Helper: CBOR Encoding for Authenticated Requests

/// Encode authenticated ZHTP request to CBOR bytes
private func zhtp_encode_authenticated_request(
    method: ZhtpMethod,
    uri: String,
    contentType: String,
    requestBody: Data,
    timestamp: UInt64,
    timestampMs: UInt64,
    requestId: Data,
    requester: String,
    authContext: AuthContext
) throws -> Data {
    var data = Data()

    // Outer map: version, request_id, timestamp_ms, auth_context, request
    try appendCborMapHeader(&data, count: 5)

    try appendCborString(&data, "version")
    try appendCborUInt(&data, 1)

    try appendCborString(&data, "request_id")
    try appendCborBytes(&data, requestId)

    try appendCborString(&data, "timestamp_ms")
    try appendCborUInt(&data, timestampMs)

    try appendCborString(&data, "auth_context")
    try appendCborMapHeader(&data, count: 4)
    try appendCborString(&data, "session_id")
    try appendCborByteArray(&data, authContext.session_id)
    try appendCborString(&data, "client_did")
    try appendCborString(&data, authContext.client_did)
    try appendCborString(&data, "sequence")
    try appendCborUInt(&data, authContext.sequence)
    try appendCborString(&data, "request_mac")
    try appendCborByteArray(&data, authContext.request_mac)

    try appendCborString(&data, "request")
    try appendCborMapHeader(&data, count: 7)
    try appendCborString(&data, "method")
    try appendCborString(&data, method.stringValue)
    try appendCborString(&data, "uri")
    try appendCborString(&data, uri)
    try appendCborString(&data, "version")
    try appendCborString(&data, "1.0")
    try appendCborString(&data, "headers")
    try appendCborMapHeader(&data, count: 4)
    try appendCborString(&data, "content_type")
    try appendCborString(&data, contentType)
    try appendCborString(&data, "content_length")
    try appendCborUInt(&data, UInt64(requestBody.count))
    try appendCborString(&data, "dao_fee")
    try appendCborUInt(&data, 0)
    try appendCborString(&data, "total_fees")
    try appendCborUInt(&data, 0)
    try appendCborString(&data, "body")
    try appendCborBytes(&data, requestBody)
    try appendCborString(&data, "timestamp")
    try appendCborUInt(&data, timestamp)
    try appendCborString(&data, "requester")
    try appendCborString(&data, requester)

    return data
}

private func appendCborMapHeader(_ data: inout Data, count: Int) throws {
    guard count >= 0 && count < 24 else {
        throw NSError(domain: "ZhtpCodec", code: 1, userInfo: [NSLocalizedDescriptionKey: "CBOR map size too large"])
    }
    data.append(0xa0 | UInt8(count))
}

private func appendCborUInt(_ data: inout Data, _ value: UInt64) throws {
    switch value {
    case 0...23:
        data.append(UInt8(value))
    case 24...UInt64(UInt8.max):
        data.append(0x18)
        data.append(UInt8(value))
    case 0...UInt64(UInt16.max):
        data.append(0x19)
        var be = UInt16(value).bigEndian
        data.append(Data(bytes: &be, count: 2))
    case 0...UInt64(UInt32.max):
        data.append(0x1a)
        var be = UInt32(value).bigEndian
        data.append(Data(bytes: &be, count: 4))
    default:
        data.append(0x1b)
        var be = value.bigEndian
        data.append(Data(bytes: &be, count: 8))
    }
}

private func appendCborString(_ data: inout Data, _ string: String) throws {
    let bytes = string.data(using: .utf8) ?? Data()
    try appendCborTextHeader(&data, length: bytes.count)
    data.append(bytes)
}

private func appendCborByteArray(_ data: inout Data, _ bytes: Data) throws {
    try appendCborLength(&data, majorType: 4, length: bytes.count)
    for byte in bytes {
        try appendCborUInt(&data, UInt64(byte))
    }
}

private func appendCborBytes(_ data: inout Data, _ bytes: Data) throws {
    try appendCborBytesHeader(&data, length: bytes.count)
    data.append(bytes)
}

private func appendCborTextHeader(_ data: inout Data, length: Int) throws {
    try appendCborLength(&data, majorType: 3, length: length)
}

private func appendCborBytesHeader(_ data: inout Data, length: Int) throws {
    try appendCborLength(&data, majorType: 2, length: length)
}

private func appendCborLength(_ data: inout Data, majorType: UInt8, length: Int) throws {
    guard length >= 0 else {
        throw NSError(domain: "ZhtpCodec", code: 2, userInfo: [NSLocalizedDescriptionKey: "Invalid CBOR length"])
    }

    if length < 24 {
        data.append((majorType << 5) | UInt8(length))
    } else if length <= UInt8.max {
        data.append((majorType << 5) | 24)
        data.append(UInt8(length))
    } else if length <= UInt16.max {
        data.append((majorType << 5) | 25)
        var be = UInt16(length).bigEndian
        data.append(Data(bytes: &be, count: 2))
    } else if length <= UInt32.max {
        data.append((majorType << 5) | 26)
        var be = UInt32(length).bigEndian
        data.append(Data(bytes: &be, count: 4))
    } else {
        data.append((majorType << 5) | 27)
        var be = UInt64(length).bigEndian
        data.append(Data(bytes: &be, count: 8))
    }
}
