import Foundation
import Network

// MARK: - ZHTP Request Handler (Public Mode)

/// Send ZHTP request over QUIC and receive framed response
func sendZhtpRequest(
    connection: NWConnection,
    method: String,
    path: String,
    headers: [String: String],
    body: Data?,
    completion: @escaping (Result<(status: UInt16, body: Data), Error>) -> Void
) {
    let requestBody = body ?? Data()
    let timestamp = UInt64(Date().timeIntervalSince1970)

    let cborData: Data
    do {
        // Build ZhtpRequest structure (server expects this directly, not wrapped)
        let contentType = headers["content-type"] ?? "application/json"
        let contentLength = UInt64(requestBody.count)

        let zhttpHeaders = ZhtpHeaders(
            content_type: contentType,
            content_length: contentLength,
            dao_fee: 0,
            total_fees: 0
        )

        let zhttpRequest = ZhtpRequest(
            method: ZhtpMethod.from(string: method),
            uri: path,
            version: "1.0",
            headers: zhttpHeaders,
            body: requestBody,
            timestamp: timestamp,
            requester: nil,
            auth_proof: nil
        )

        // Encode ZhtpRequest directly (no wrapper envelope for public requests)
        cborData = try encodeRequest(zhttpRequest)
    } catch {
        completion(.failure(error))
        return
    }

    print("[ZHTP] Sending \(method.uppercased()) \(path) (\(cborData.count) bytes CBOR)")

    // Log CBOR payload hex
    let cborHex = cborData.map { String(format: "%02x", $0) }.joined(separator: " ")
    print("[ZHTP] CBOR payload hex: \(cborHex)")

    // Wrap CBOR with ZHTP wire format: [magic] + [version] + [length BE] + [CBOR]
    var wireData = Data()
    wireData.append(contentsOf: [0x5A, 0x48, 0x54, 0x50])  // "ZHTP" magic
    wireData.append(0x01)  // version 1
    var length = UInt32(cborData.count).bigEndian
    withUnsafeBytes(of: &length) { buffer in
        wireData.append(contentsOf: buffer)
    }
    wireData.append(cborData)

    print("[ZHTP] Sending with ZHTP header: \(wireData.count) bytes total (magic + version + length + \(cborData.count) CBOR)")

    // Log full wire hex
    let wireHex = wireData.map { String(format: "%02x", $0) }.joined(separator: " ")
    print("[ZHTP] Full wire frame hex: \(wireHex)")

    connection.send(
        content: wireData,
        contentContext: .finalMessage,
        isComplete: true,
        completion: .contentProcessed { error in
            if let error = error {
                print("[ZHTP] Send failed: \(error.localizedDescription)")
                completion(.failure(error))
                return
            }
            print("[ZHTP] Send succeeded, waiting for response...")
            receiveZhtpResponse(connection: connection, completion: completion)
        }
    )
}

/// Receive and decode ZHTP response
private func receiveZhtpResponse(
    connection: NWConnection,
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
                print("[ZHTP] Receive error: \(error)")
                safeComplete(.failure(error))
                return
            }

            if let content = content {
                responseData.append(content)
                print("[ZHTP] Received \(content.count) bytes, total: \(responseData.count)")
            }

            if isComplete {
                print("[ZHTP] Stream complete, decoding response...")
                do {
                    // Decode SDK CBOR response (handles optional length prefix internally)
                    let responseWire = try zhtp_decode_response(responseData)

                    print("[ZHTP] Response: status \(responseWire.status), nested body \(responseWire.response.body.count) bytes")
                    // Extract nested response body
                    safeComplete(.success((status: responseWire.status, body: responseWire.response.body)))
                } catch {
                    print("[ZHTP] Decode error: \(error)")
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
