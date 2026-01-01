import Foundation

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

    // Compute canonical request hash
    let canonicalHash = computeCanonicalRequestHash(
        requestId: requestId,
        timestampMs: timestampMs,
        method: method,
        uri: path,
        headers: requestHeaders,
        body: requestBody
    )

    // Build auth context
    do {
        let authContext = try buildAuthContext(session: session, canonicalHash: canonicalHash)
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

        // Frame it (add 4-byte big-endian length prefix)
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
            completion: .contentProcessed { error in
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

/// Receive and decode authenticated ZHTP response
private func receiveAuthenticatedZhtpResponse(
    connection: NWConnection,
    requestId: Data,
    completion: @escaping (Result<(status: UInt16, body: Data), Error>) -> Void
) {
    var responseData = Data()
    var hasCompleted = false
    let completionLock = NSLock()

    func safeComplete(_ result: Result<(UInt16, Data), Error>) {
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

                    // Decode CBOR to ZhtpResponseWire
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
                    safeComplete(.success((responseWire.status, responseWire.response.body)))
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
    // Build wire structure manually for authenticated requests
    // This ensures proper CBOR encoding with auth_context

    var data = Data()

    // Version
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]

    let requestDict: [String: Any] = [
        "method": method.stringValue,
        "uri": uri,
        "version": "1.0",
        "headers": [
            "content_type": contentType,
            "content_length": requestBody.count,
            "dao_fee": 0,
            "total_fees": 0
        ] as [String: Any],
        "body": requestBody,
        "timestamp": timestamp,
        "requester": requester
    ]

    let authContextEncoded = try encoder.encode(authContext)
    let authContextDict = try JSONSerialization.jsonObject(with: authContextEncoded) as? [String: Any]

    let wireDict: [String: Any] = [
        "version": 1,
        "request_id": requestId,
        "timestamp_ms": timestampMs,
        "auth_context": authContextDict as Any,
        "request": requestDict
    ]

    let jsonData = try JSONSerialization.data(withJSONObject: wireDict)

    // Convert JSON to CBOR (reuse existing function)
    guard let jsonObject = try JSONSerialization.jsonObject(with: jsonData) else {
        throw NSError(domain: "ZhtpCodec", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to parse JSON"])
    }

    return try encodeCborValue(jsonObject)
}
