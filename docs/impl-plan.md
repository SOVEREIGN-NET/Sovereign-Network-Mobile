# Mobile Native ZHTP Implementation Plan
## Dual-Mode Support (Public + Authenticated)

### Overview
Implement native ZHTP wire protocol on iOS and Android to replace HTTP/1.1-over-QUIC. Architecture supports two connection modes simultaneously:
- **Public Mode** (`zhtp-public/1` ALPN): Read-only, no authentication (health checks, content fetching, wallet state)
- **Authenticated Mode** (`zhtp-uhp/1` ALPN): Authenticated transactions via UHP+Kyber handshake

---

## Phase 0: Shared Protocol Layer (Both Platforms)

### 0.1 CBOR Codec Implementation
**Location**: Shared across iOS/Android
- Implement deterministic CBOR encoder/decoder (preserves field order)
- Field names must match Rust struct names exactly
- Byte arrays: raw bytes in CBOR (not hex-encoded)
- UTF-8 strings for all string fields

**Spec Requirements**:
- iOS: Use `CBOREncoding` library or implement with `Codable`
- Android: Use CBOR library compatible with Kotlin/Java

**Verification**:
- Test: Encode/decode struct → compare with server canonical form
- Test: Field order preservation across multiple runs
- Test: Round-trip serialization

### 0.2 Hashing & Authentication
**Blake3 for MAC Computation**:
- iOS: Use `CryptoKit` (available in iOS 16+) or Swift bindings to `blake3` crate
- Android: Use `blake3-android` or `bouncycastle` implementations

**Canonical Hash Function** (same across both platforms):
```
Hash Input Order:
1. WIRE_VERSION (u16 LE) = 1
2. request_id (16 bytes)
3. timestamp_ms (u64 LE)
4. method encoded (1 byte: Get=0, Post=1, Put=2, Delete=3, Options=4, Head=5, Patch=6, Verify=7, Connect=8, Trace=9)
5. uri (length-prefixed string)
6. headers in fixed order: content_type, content_length, content_encoding, cache_control
7. body (length-prefixed bytes)
```

**Test**:
- Compare mobile canonical hash with server hash for same request

### 0.3 Wire Framing (Length-Prefixed)
**Format**:
```
[4 bytes: big-endian u32 length] [CBOR payload bytes]
```
- Max message size: 16 MB (MAX_MESSAGE_SIZE)
- Length includes only the CBOR payload, not the length bytes themselves
- Timeout: 30 seconds per message read

**Implementation**:
- Read 4 bytes → parse as big-endian u32
- Allocate buffer of size bytes
- Read exactly that many bytes
- Verify buffer not empty and ≤ 16 MB
- Decode CBOR from buffer

### 0.4 Type Definitions (Structs/Enums)
Match Rust definitions exactly from server source:

**ZhtpMethod Enum**:
```
Get, Post, Put, Delete, Options, Head, Patch, Verify, Connect, Trace
```

**ZhtpHeaders Struct**:
- content_type: Option<String>
- content_length: Option<u64>
- content_encoding: Option<String>
- cache_control: Option<String>
- **Required**: dao_fee: u64 (default 0 for reads, calculated for mutations)
- **Required**: total_fees: u64 (= dao_fee + network_fee)
- network_fee: Option<u64>
- dao_fee_proof: Option<[u8; 32]>
- priority: Option<u8>
- transaction_id: Option<String>
- privacy_level: Option<u8>
- encryption: Option<String>
- identity_did: Option<String>
- access_policy_id: Option<String>
- [... other optional fields from server ...]

**ZhtpRequest Struct**:
- method: ZhtpMethod
- uri: String
- version: String = "1.0" (ZHTP_VERSION)
- headers: ZhtpHeaders
- body: Vec<u8> (empty for GET/HEAD)
- timestamp: u64 (seconds since epoch)
- requester: Option<String> (identity, for authenticated requests)
- auth_proof: Option<Vec<u8>> (zero-knowledge proof)

**ZhtpResponse Struct**:
- version: String = "1.0"
- status: u16 (HTTP-style status codes: 200, 404, 401, etc.)
- status_message: String
- headers: ZhtpHeaders
- body: Vec<u8>
- timestamp: u64 (server timestamp)

**AuthContext** (authenticated connections only):
- session_id: [u8; 16] (from UHP handshake)
- client_did: String (client identity)
- sequence: u64 (monotonic counter per session, incremented per request)
- request_mac: [u8; 32] (BLAKE3 keyed hash)

**ZhtpRequestWire** (full envelope):
- version: u16 = 1
- request_id: [u8; 16] (16 random bytes, UUID)
- timestamp_ms: u64 (milliseconds since epoch)
- auth_context: Option<AuthContext>
- request: ZhtpRequest

**ZhtpResponseWire** (full envelope):
- request_id: [u8; 16] (mirrors request)
- status: u16
- status_message: String
- headers: ZhtpHeaders
- body: Vec<u8>
- error_code: Option<u16>
- error_message: Option<String>

---

## Phase 1: Public Connection (No Authentication)

### 1.1 Connection Manager - Public Mode
**Responsibilities**:
- Establish QUIC connection with ALPN = `zhtp-public/1`
- Reuse single connection for multiple requests
- Manage connection pooling (single persistent connection per app instance)
- Handle connection timeouts (60 seconds idle)
- Clean graceful shutdown

**Architecture**:
```
PublicConnectionManager
├─ quic_connection: QuicConnection (persistent)
├─ connection_state: enum { Disconnected, Connecting, Connected }
├─ idle_timeout_ms: 60_000
└─ methods:
    ├─ connect(host, port) -> Result<()>
    ├─ send_request(req: ZhtpRequest) -> Result<ZhtpResponse>
    ├─ is_connected() -> bool
    ├─ disconnect() -> Result<()>
    └─ reconnect_if_needed() -> Result<()>
```

**Connection Reuse Strategy**:
- Single connection per app (application-scoped singleton)
- Reuse across multiple requests sequentially or concurrently (via QUIC multiplexing)
- Auto-reconnect on connection drop
- Timeout cleanup after 60 seconds idle

### 1.2 Request/Response Handler - Public Mode
**Flow**:
1. User initiates request (e.g., "fetch content for domain X")
2. Create `ZhtpRequest` with method, uri, headers, body
3. Wrap in `ZhtpRequestWire` (add request_id, timestamp_ms, no auth_context)
4. CBOR encode → length-prefix
5. Send on new QUIC stream
6. Read response length-prefix + CBOR → deserialize `ZhtpResponseWire`
7. Return status + body to caller

**Retry Logic**:
- If connection drops: try reconnect, then retry request
- Max 3 retries with exponential backoff (100ms, 200ms, 400ms)
- Network errors: propagate after retries exhausted

### 1.3 Public Request Examples
**Health Check**:
```
Request:
  method: Get
  uri: /health
  headers: { content_type: "application/json" }
  body: []
  dao_fee: 0
  total_fees: 0

Response:
  status: 200
  body: { "status": "ok", "version": "1.0" }
```

**Fetch Manifest**:
```
Request:
  method: Get
  uri: /api/v1/domains/example.net/manifest
  headers: { content_type: "application/json" }
  body: []
  dao_fee: 0
  total_fees: 0

Response:
  status: 200
  body: { "manifest": {...}, "content_hash": "..." }
```

**Fetch Wallet State** (read-only, public):
```
Request:
  method: Get
  uri: /api/v1/wallet/public/{wallet_id}
  headers: { content_type: "application/json" }
  body: []
  dao_fee: 0
  total_fees: 0

Response:
  status: 200
  body: { "balance": 1000, "transactions": [...] }
```

---

## Phase 2: Authenticated Connection (UHP+Kyber Handshake)

### 2.1 UHP Handshake Protocol
**Two-Phase Process**:

**Phase 1: UHP Authentication (Dilithium5)**
1. Client generates UHP ClientHello
   - Send: identity + capabilities + Dilithium signature
   - Crypto: Sign UHP transcript with Dilithium5
2. Server responds with ServerHello
   - Send: server identity + signature
   - Verify: Client signature matches
3. Client sends ClientFinish
   - Verify: Server signature matches
   - Produces: `uhp_session_key` (32 bytes)

**Phase 2: Kyber Key Exchange (Post-Quantum)**
1. Client generates Kyber512 keypair
   - Send: public key + UHP transcript hash
2. Server encapsulates shared secret
   - Encapsulate using client's Kyber public key
   - Send: ciphertext
3. Client decapsulates
   - Produces: `pqc_shared_secret` (32 bytes)

**Master Key Derivation**:
```
Master Key = HKDF-SHA3(
  IKM = uhp_session_key || pqc_shared_secret || uhp_transcript_hash || peer_node_id,
  salt = "zhtp-quic-mesh",
  info = "zhtp-quic-master",
  length = 32
)
```

**App Key for MAC**:
- Use master key as the key for Blake3 keyed hashing
- Reuse across session, compute MAC per-request

### 2.2 Connection Manager - Authenticated Mode
**Responsibilities**:
- Establish QUIC connection with ALPN = `zhtp-uhp/1`
- Perform UHP+Kyber handshake
- Manage session state (session_id, app_key, sequence counter)
- Enforce per-connection timeout (5 minutes)
- Prevent session reuse beyond 1 hour

**Architecture**:
```
AuthenticatedConnectionManager
├─ quic_connection: QuicConnection
├─ session: SessionState
│  ├─ session_id: [u8; 16]
│  ├─ app_key: [u8; 32]
│  ├─ sequence: u64 (monotonically increasing)
│  ├─ created_at: Timestamp
│  └─ last_activity: Timestamp
├─ connection_state: enum { Disconnected, Connecting, Handshaking, Ready }
└─ methods:
    ├─ connect(host, port, client_identity) -> Result<()>
    ├─ perform_handshake() -> Result<SessionState>
    ├─ send_authenticated_request(req: ZhtpRequest) -> Result<ZhtpResponse>
    ├─ is_authenticated() -> bool
    ├─ disconnect() -> Result<()>
    └─ is_session_valid() -> bool
```

**Session Validity Checks**:
- Check 5-minute idle timeout
- Check 1-hour age limit (force re-authentication)
- Check connection still alive
- Increment sequence number on each request (prevents replay)

### 2.3 Request/Response Handler - Authenticated Mode
**Flow**:
1. Verify session is valid (not expired, not idle)
2. Create `ZhtpRequest` with method, uri, headers, body, requester
3. Compute canonical hash (following exact server order)
4. Compute MAC: `BLAKE3_keyed(app_key, session_id || sequence || canonical_hash)`
5. Create `AuthContext` with session_id, sequence, request_mac
6. Wrap in `ZhtpRequestWire` (include auth_context)
7. CBOR encode → length-prefix
8. Send on new QUIC stream
9. Read response length-prefix + CBOR → deserialize `ZhtpResponseWire`
10. Verify response.request_id matches request.request_id
11. Return status + body

**Error Handling**:
- 401 Unauthorized: Session invalid, need re-handshake
- 403 Forbidden: Access denied for request
- 429 Too Many Requests: Rate limited
- 500 Server Error: Propagate to caller

### 2.4 Fee Calculation for Mutations
**For GET/HEAD**:
- dao_fee: 0
- total_fees: 0
- network_fee: 0

**For POST/PUT/DELETE/PATCH (mutations)**:
- Calculate transaction value from request body
- dao_fee: max(transaction_value * 2%, 5 tokens)
- network_fee: negotiated with server (e.g., 1 token per request)
- total_fees: dao_fee + network_fee

**Fee Proof**:
- dao_fee_proof: Option<[u8; 32]> (can be None initially)
- Server may request proof if fees disputed

### 2.5 Authenticated Request Examples
**Make Transaction**:
```
Request:
  method: Post
  uri: /api/v1/transactions
  headers: {
    content_type: "application/json",
    dao_fee: 10,
    total_fees: 11,
    priority: 5,
    transaction_id: "tx-123456"
  }
  body: {
    "from": "wallet_A",
    "to": "wallet_B",
    "amount": 500,
    "signature": "..."
  }
  requester: user_identity
  timestamp: 1704067200

AuthContext:
  session_id: [16 random bytes from handshake]
  client_did: user_identity
  sequence: 1 (incremented for each request)
  request_mac: [BLAKE3_keyed(app_key, session_id || sequence || canonical_hash)]

Response:
  status: 200
  body: {
    "transaction_id": "tx-123456",
    "status": "confirmed",
    "block_height": 12345
  }
```

**Submit Identity Claim**:
```
Request:
  method: Post
  uri: /api/v1/identities/claim
  headers: { content_type: "application/json", dao_fee: 5, total_fees: 6 }
  body: { "public_key": "...", "signature": "..." }
  requester: user_identity

AuthContext:
  session_id: [16 bytes]
  client_did: user_identity
  sequence: 2
  request_mac: [computed]

Response:
  status: 201
  body: { "identity_id": "id-123", "created_at": 1704067200 }
```

---

## Phase 3: iOS Implementation

### 3.1 Project Structure
```
SovereignNetworkMobile/ios/
├── SovereignNetworkMobile/
│   └── Sources/
│       └── ZHTP/
│           ├── Protocol/
│           │   ├── ZhtpTypes.swift (enums, structs)
│           │   ├── ZhtpCodec.swift (CBOR encode/decode)
│           │   ├── WireFraming.swift (length-prefix)
│           │   └── Hashing.swift (Blake3, canonical hash)
│           ├── Connection/
│           │   ├── PublicConnectionManager.swift
│           │   ├── AuthenticatedConnectionManager.swift
│           │   ├── UHPHandshake.swift (UHP+Kyber)
│           │   └── SessionState.swift
│           ├── Requests/
│           │   ├── PublicRequestHandler.swift
│           │   ├── AuthenticatedRequestHandler.swift
│           │   └── RequestBuilder.swift
│           └── API/
│               ├── ZhtpClient.swift (high-level facade)
│               ├── DomainAPI.swift (domain resolution)
│               ├── WalletAPI.swift (wallet queries)
│               └── TransactionAPI.swift (transactions)
└── Tests/
    └── ZhtpTests/
        ├── CodecTests.swift
        ├── WireFramingTests.swift
        ├── ConnectionTests.swift
        └── E2ETests.swift
```

### 3.2 Dependencies
**Required**:
- Quinn (QUIC): Already in project (for transport)
- CryptoKit (iOS 16+): Built-in for Blake3, Kyber (ML-KEM), Dilithium5 (ML-DSA)

**Optional**:
- CBOREncoding: For deterministic CBOR (if CryptoKit insufficient)
- UHP library: Wrapper around server's UHP protocol

### 3.3 Core iOS Classes
**ZhtpClient** (high-level facade):
```swift
class ZhtpClient {
    // Public mode
    func fetchPublic<T: Decodable>(
        path: String,
        responseType: T.Type
    ) -> Result<T, Error>

    // Authenticated mode
    func authenticate(identity: String) -> Result<Session, Error>
    func makeAuthenticatedRequest<T: Decodable>(
        method: ZhtpMethod,
        path: String,
        body: Encodable?,
        fees: Fees?,
        responseType: T.Type
    ) -> Result<T, Error>

    func disconnect()
}
```

**Session** (holds authenticated state):
```swift
struct Session {
    let sessionId: Data
    let appKey: Data
    var sequence: UInt64
    let createdAt: Date
    var lastActivity: Date

    func isValid() -> Bool
}
```

### 3.4 Testing Strategy
- Unit tests: CBOR codec, canonical hashing, fee calculation
- Integration tests: Public mode against mock server
- E2E tests: Both modes against real server (staging environment)

---

## Phase 4: Android Implementation

### 4.1 Project Structure
```
SovereignNetworkMobile/android/
├── app/src/main/
│   ├── rust/quic-jni/src/
│   │   └── zhtp/
│   │       ├── types.rs (structs/enums)
│   │       ├── codec.rs (CBOR)
│   │       ├── framing.rs (length-prefix)
│   │       ├── hashing.rs (Blake3, canonical hash)
│   │       ├── public_connection.rs
│   │       ├── authenticated_connection.rs
│   │       ├── uhp_handshake.rs
│   │       └── lib.rs (JNI bindings)
│   ├── kotlin/
│   │   └── com/sovereign/network/zhtp/
│   │       ├── ZhtpClient.kt (facade)
│   │       ├── ZhtpConnection.kt
│   │       ├── PublicRequester.kt
│   │       ├── AuthenticatedRequester.kt
│   │       └── api/
│   │           ├── DomainAPI.kt
│   │           ├── WalletAPI.kt
│   │           └── TransactionAPI.kt
│   └── resources/
└── build.gradle.kts
```

### 4.2 Dependencies
**Rust side**:
- Quinn (QUIC): FFI binding to existing client
- serde + serde_cbor: CBOR encoding
- blake3: Hashing
- liboqs-sys or pqcrypto: Kyber512, Dilithium5

**Kotlin side**:
- kotlinx-serialization: JSON/CBOR marshalling
- coroutines: Async operations

### 4.3 JNI Bindings
```rust
// lib.rs
#[no_mangle]
pub extern "C" fn zhtp_public_request(
    host: *const c_char,
    port: u16,
    request_json: *const c_char
) -> *const c_char // response JSON

#[no_mangle]
pub extern "C" fn zhtp_authenticate(
    host: *const c_char,
    port: u16,
    identity: *const c_char
) -> *const c_char // session JSON

#[no_mangle]
pub extern "C" fn zhtp_authenticated_request(
    session_json: *const c_char,
    request_json: *const c_char
) -> *const c_char // response JSON
```

### 4.4 Kotlin Facade
```kotlin
object ZhtpClient {
    // Public
    suspend inline fun <reified T> fetchPublic(
        path: String
    ): T

    // Authenticated
    suspend fun authenticate(identity: String): Session

    suspend inline fun <reified T> makeAuthenticatedRequest(
        method: ZhtpMethod,
        path: String,
        body: Any? = null,
        fees: Fees? = null
    ): T
}

data class Session(
    val sessionId: ByteArray,
    val appKey: ByteArray,
    var sequence: Long,
    val createdAt: Instant
)
```

### 4.5 Testing Strategy
- Unit tests: CBOR codec, canonical hashing (Rust)
- Integration tests: Public mode with mock server (Kotlin)
- E2E tests: Both modes against real server (staging)

---

## Phase 5: Integration & Testing

### 5.1 Protocol Compatibility Tests
**Goal**: Verify mobile CBOR matches server exactly

**Test Suite**:
- Encode same request on mobile and server → compare CBOR bytes
- Encode same request on iOS and Android → compare CBOR bytes
- Canonical hash: mobile vs server for same input
- Blake3 MAC: mobile vs server for same input + key
- Wire framing: iOS/Android decode server's wire frames
- Wire framing: Server decodes iOS/Android frames

### 5.2 Connection Tests
**Public Mode**:
- Connect to public ALPN
- Fetch health check (GET /health)
- Fetch manifest (GET /api/v1/domains/example.net/manifest)
- Fetch wallet (GET /api/v1/wallet/public/{id})
- Verify responses match expected structure
- Test connection reuse (multiple requests on same connection)
- Test reconnection after disconnect

**Authenticated Mode**:
- Connect to authenticated ALPN
- Perform UHP+Kyber handshake
- Verify session state created
- Make authenticated request with auth_context
- Verify server accepts MAC
- Verify server rejects replay (same sequence)
- Verify sequence increment works
- Test session timeout (5 minutes)
- Test session age limit (1 hour)

### 5.3 End-to-End Tests
**Scenario 1: Public Website Read**
```
User opens app
├─ Connect public mode
├─ Fetch domain manifest
├─ Fetch content
└─ Display on screen
```

**Scenario 2: View Wallet State**
```
User navigates to wallet screen
├─ Connect public mode (or reuse existing)
├─ Fetch /api/v1/wallet/public/{wallet_id}
└─ Display balance and transaction history
```

**Scenario 3: Make Transaction**
```
User clicks "Send"
├─ Connect authenticated mode
├─ Perform handshake (if not already authenticated)
├─ Create transaction request
├─ Calculate fees (2% + network fee)
├─ Sign transaction
├─ Make authenticated POST /api/v1/transactions
└─ Display confirmation
```

**Scenario 4: Handle Errors**
```
Network errors:
├─ Server down: Retry with backoff
├─ Invalid MAC: Re-authenticate (session expired)
├─ 401 Unauthorized: Discard session, re-handshake
├─ 429 Too Many Requests: Back off exponentially
└─ Network timeout: Retry or propagate to user
```

---

## Phase 6: Deployment

### 6.1 Server Configuration
**No changes needed immediately** - server already supports dual-protocol:
- Public ALPN: `zhtp-public/1` (existing)
- Authenticated ALPN: `zhtp-uhp/1` (existing)
- Can coexist with HTTP compatibility layer: `zhtp-http/1`, `h3`

### 6.2 Mobile Rollout Strategy
1. **Develop & Test** (Phases 1-5): Implement on both platforms
2. **Beta Testing** (internal): Test with staging server
3. **Staged Rollout** (App Store/Play Store):
   - Week 1: 5% of users (early adopters)
   - Week 2: 25% of users (monitor stability)
   - Week 3: 100% of users (full rollout)
4. **Monitor**: Track connection success rate, error rates, performance
5. **Fallback**: If issues, server can keep HTTP compat layer active
6. **Server Cleanup** (after stabilization): Remove HTTP compat layer (branch #573)

### 6.3 Metrics to Monitor
- Connection success rate
- Authentication handshake success rate
- Request latency (public vs authenticated)
- Error rates by type (connection, auth, rate limiting)
- Session validity / re-authentication frequency
- MAC verification failures (indicates client bug)

---

## Dependencies Matrix

| Component | iOS | Android | Status |
|-----------|-----|---------|--------|
| QUIC | Quinn + CryptoKit | Quinn FFI + Rust | ✅ Existing |
| CBOR Codec | CBOREncoding or custom | serde_cbor + bindings | ⚠️ To implement |
| Blake3 | CryptoKit (built-in) | blake3 crate + bindings | ✅ Available |
| Kyber512 | CryptoKit ML-KEM (iOS 26) | liboqs or pqcrypto | ✅ Available |
| Dilithium5 | CryptoKit ML-DSA (iOS 26) | liboqs or pqcrypto | ✅ Available |
| UHP Protocol | Custom implementation | Custom Rust implementation | ⚠️ To implement |

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| CBOR codec mismatch | Test round-trip with server before production |
| Canonical hash order wrong | Unit tests comparing mobile vs server hashes |
| Session sequence overflow | Use u64 (overflow unlikely), validate ≥ 0 |
| Kyber unavailable on iOS < 26 | Require iOS 16+ for now, upgrade to iOS 26+ when available |
| UHP handshake complexity | Use existing server code as reference, test against staging |
| Connection pooling issues | Start with single connection, optimize later |
| Fee calculation errors | Mock server to test various transaction values |

---

## Success Criteria

✅ Phase 1: Public mode working, health checks passing
✅ Phase 2: Authenticated mode working, transactions processed
✅ Phase 3: iOS implementation complete and tested
✅ Phase 4: Android implementation complete and tested
✅ Phase 5: All protocol compatibility tests passing
✅ Phase 6: Staged rollout complete, metrics green

---

## Timeline Overview (Not prescriptive, just guidance)

| Phase | Component | Est. Effort |
|-------|-----------|-------------|
| 0 | Shared protocol (CBOR, hashing, types) | 1-2 weeks |
| 1 | Public connection (both) | 1-2 weeks |
| 2 | Authenticated connection (both) | 2-3 weeks |
| 3 | iOS implementation | 2-3 weeks |
| 4 | Android implementation | 2-3 weeks |
| 5 | Testing & integration | 2-3 weeks |
| 6 | Deployment & monitoring | 1-2 weeks |

**Total: 11-18 weeks** for full implementation and rollout.
