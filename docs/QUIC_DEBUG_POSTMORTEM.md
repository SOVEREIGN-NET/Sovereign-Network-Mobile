QUIC Debug Postmortem (iOS)

Overview

This document captures the full iOS QUIC/UHP v2 debugging effort: symptoms, blockers, root causes, fixes, and lessons learned. It focuses on the iOS client and the Quinn FFI path used to reach the QUIC control plane.

Summary Outcome

- UHP v2 handshake succeeds on iOS via Quinn FFI.
- Authenticated wallet list requests succeed and return JSON payloads.
- SID wallet UI now refreshes and can display balances and wallet IDs.

Original Symptoms

- Second write on QUIC stream failed after 4-byte header write.
- iOS error: "Socket is not connected" and group failed with EINVAL.
- Server showed accept_bi() but no data read, then handshake timeout.

Key Blockers and Root Causes

1) Stream lifecycle and stream mismatch
- Server accepted stream 0 but iOS was writing to stream 4.
- Causes: opening multiple streams per send or stream re-creation between writes.
- Fix: enforce single handshake stream, then open new stream for each request.

2) Network.framework vs Quinn mismatch
- Network.framework QUIC did not expose TLS exporter compatible with rustls.
- Channel binding mismatch blocked handshake signature verification.
- Root cause: iOS export API did not match TLS exporter (label/context/length).
- Outcome: Network.framework path abandoned for UHP v2; Quinn adopted.

3) React Native / Web4 QUIC path interference
- RN Web4 QuicFetchAdapter still generated QUIC URL requests with old stack.
- Led to wrong host/port and additional noise in logs.
- Fix: route authenticated QUIC requests through NativeQuic Quinn path.

4) Quinn FFI build and linking issues
- Missing headers, wrong xcframework layout, duplicate typedefs.
- Fix: add include dir + clean C header, package as QuinnFFI.xcframework.
- Update build script paths and ensure linking is correct.

5) Rustls crypto provider panic
- rustls 0.23 requires explicit crypto provider selection.
- Fix: install ring provider at runtime and configure rustls builder.

6) Tokio runtime missing
- "no async runtime found" error when calling Quinn from Swift.
- Fix: add global tokio runtime and wrap FFI entry points with block_on.

7) Identity JSON loading
- Quinn FFI failed "Missing id" / invalid public_key.
- Cause: using partial identity JSON from documents store.
- Fix: load serialized identity from Keychain, deserialize, re-serialize to handshake JSON, and store in handle store.

8) NodeId derivation mismatch
- Server expects deterministic node_id from DID + lowercase device ID.
- iOS had device_node_ids computed with a different method.
- Fix: override node_id in FFI using server formula.

9) Nonce replay false positives
- Client rejected server nonce as replay.
- Fix: skip server nonce registration on client (per handshake flow).

10) Request framing mismatch
- Client sent ZHTP magic header; server expects length-prefixed CBOR only.
- Fix: use 4-byte BE length + CBOR payload (no ZHTP magic) for authenticated requests.

11) CBOR encoding mismatches
- [u8; N] fields were encoded as byte strings or strings instead of arrays.
- Fix: encode request_id, session_id, request_mac as CBOR arrays of UInt8.
- Also corrected AuthContext encoding (session_id, client_did, sequence, request_mac).

12) Requester field mismatch
- Server expects requester as optional hash, not DID string.
- Fix: omit requester from authenticated request encoding.

13) MAC canonicalization mismatch
- MAC input format must match server canonical request bytes.
- iOS uses method/path/body + counter + session_id (BE).
- Ensure sequence starts at 1, not 0.

14) Response decoding issues
- Server response includes a 4-byte length prefix for CBOR payload.
- iOS was unframing or double-detecting wire formats incorrectly.
- Fix: detect length prefix on response, then decode CBOR payload.
- Response body is nested under "response" in ZhtpResponseWire; decode accordingly.

Why React Native Was a Blocker

- RN stack (Web4 QuicFetchAdapter + Network.framework) masked the real QUIC path.
- It created quic:// URL requests and retried independently, causing mixed logs.
- It also assumed legacy framing and did not integrate with UHP v2 handshake and channel binding.
- Result: Network.framework could not match rustls exporter, preventing handshake.

Why Quinn on iOS

- Server uses rustls/quinn and requires export_keying_material for channel binding.
- Network.framework does not provide a compatible exporter with context/label behavior.
- Quinn gives identical TLS exporter behavior to server, enabling matching channel binding.

Core iOS Quinn FFI Design

- Rust FFI performs QUIC connect, UHP handshake, and request/response on new stream.
- Swift only passes bytes and receives bytes; no stream handling in Swift.
- Handshake stream is terminal (finish); requests use new streams.

Major Fixes Applied (iOS)

- Build Quinn FFI static lib with correct headers and xcframework packaging.
- Install rustls crypto provider explicitly.
- Add global tokio runtime and block_on in FFI entry points.
- Normalize identity JSON from Keychain and deserialize via lib-client.
- Deterministic node_id override (lowercase device ID).
- Channel binding exporter matches server: label "zhtp-uhp-channel-binding", length 32, empty context.
- AuthContext CBOR encoding fixed.
- Request framing and response parsing fixed.

UI Wiring Changes

- SID screen now refreshes wallet list on focus.
- Total balance is computed from wallet list when server total_balance is 0.
- Removed dashboard test wallet endpoint button.

Notable Log Noise (Not Blockers)

- Repeated "Connection refused" to 127.0.0.1:8081 is Metro dev server noise.
- Not related to QUIC/UHP transport.

Remaining TODOs

- Remove debug logging after final validation.
- Verify response parsing for all endpoints (public and authenticated).
- Ensure request_id and response_id matching is stable across retry paths.
- Add integration tests for authenticated request encoding.

Lessons Learned

- QUIC handshake stream must be single-use; open a new stream for each request.
- Channel binding must be exported from the same QUIC connection and with identical exporter parameters.
- CBOR encoding must match serde types exactly (arrays vs byte strings).
- Avoid mixing multiple QUIC stacks inside the same RN app path; isolate the correct transport.

