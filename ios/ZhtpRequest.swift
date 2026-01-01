import Foundation
import Network

// MARK: - ZHTP Request Handler (Public Mode)

/// Send ZHTP request over QUIC and receive framed response
func sendZhtpRequest(
    connection: NWConnection,
    method: ZhtpMethod,
    path: String,
    headers: [String: String],
    body: Data?,
    completion: @escaping (Result<(status: UInt16, body: Data), Error>) -> Void
) {
    // 1. Build ZhtpRequestWire
    let contentType = headers["content-type"] ?? "application/json"
    let requestBody = body ?? Data()

    let zhtpRequest = ZhtpRequestWire.newPublic(
        method: method,
        uri: path,
        contentType: contentType,
        body: requestBody
    )

    // 2. Encode to CBOR
    let cborData: Data
    do {
        cborData = try zhtp_encode_request(zhtpRequest)
    } catch {
        completion(.failure(error))
        return
    }

    // 3. Frame it (add 4-byte big-endian length prefix)
    let framedData: Data
    do {
        framedData = try zhtp_frame_encode(cbor_payload: cborData)
    } catch {
        completion(.failure(error))
        return
    }

    // 4. Send on QUIC stream
    print("[ZHTP] Sending \(method.stringValue) \(path) (\(framedData.count) bytes framed)")

    connection.send(
        content: framedData,
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
                    // Unframe: read 4-byte length, then payload
                    let (payload, _) = try zhtp_frame_decode_message(data: responseData)

                    // Decode CBOR to ZhtpResponseWire
                    let responseWire = try zhtp_decode_response(payload)

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
