# QUIC Clients Implementation Guide

## Overview

This document details the implementation of QUIC (Quick UDP Internet Connections) clients for the Sovereign Network Mobile app. The app uses platform-specific implementations for iOS and Android, unified through a JavaScript/TypeScript wrapper layer that provides a consistent API to React Native.

**Key Point**: QUIC is a transport layer protocol (like TCP), not an application protocol. Your implementation runs a custom request/response protocol (`zhtp-public/1`, `zhtp-uhp/1`) on top of QUIC.

---

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│    React Native / TypeScript Layer          │
│  (src/services/QuicClient.ts)               │
│  (src/services/QuicFetchAdapter.ts)         │
└──────────────┬──────────────────────────────┘
               │
    ┌──────────┴──────────┐
    │                     │
    ▼                     ▼
┌──────────────┐    ┌──────────────┐
│   iOS        │    │   Android    │
│ Network.fwk  │    │   Quinn      │
│   (Swift)    │    │   (Rust)     │
└──────────────┘    └──────────────┘
    │                     │
    ▼                     ▼
┌──────────────────────────────────┐
│   QUIC Protocol (RFC 9000)       │
│   + TLS 1.3 (RFC 9001)           │
│   + Custom ALPN Profiles         │
└──────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────┐
│   UDP Transport                  │
└──────────────────────────────────┘
```

---

## iOS Implementation

### Overview
- **Framework**: Apple `Network.framework` (built-in, iOS 15+)
- **Language**: Swift
- **Dependencies**: None (uses native OS APIs)
- **Architecture**: Native asynchronous callbacks via DispatchQueue

### Files & Locations

#### Primary Implementation
- **`ios/NativeQuicModule.swift`** (~912 lines)
  - React Native module that exposes QUIC functionality
  - Main entry point for JS layer

- **`ios/NativeQuicModule.m`** (~27 lines)
  - Objective-C bridge that registers Swift methods with React Native

#### Integration
- **`ios/Web4Client.swift`** (~100+ lines)
  - Uses QUIC for Web4 content fetching
  - Calls `NativeQuic().requestBytes()`

### How It Works

#### 1. Initialization
```swift
// NativeQuicModule.swift
private var activeConnections: [UUID: NWConnection] = [:]
private let connectionLock = NSLock()

@objc
func isSupported(_ resolve: @escaping RCTPromiseResolveBlock,
                 reject: @escaping RCTPromiseRejectBlock) {
    // iOS 15+: returns true
    resolve(ProcessInfo.processInfo.operatingSystemVersion.majorVersion >= 15)
}
```

**What happens**:
- Checks OS version at runtime
- Only iOS 15+ has native QUIC support via Network.framework

#### 2. Reachability Check
```swift
@objc
func checkReachability(_ host: String,
                       port: Int,
                       resolve: @escaping RCTPromiseResolveBlock,
                       reject: @escaping RCTPromiseRejectBlock)
```

**Process**:
1. Creates a simple UDP connection to `host:port`
2. Doesn't perform full QUIC handshake (fast)
3. 5-second timeout
4. Returns `{ reachable: boolean, latency: number }`

**Why UDP**: Faster than full QUIC handshake for simple reachability checks.

#### 3. Full Connection Test
```swift
@objc
func testConnection(_ host: String,
                    port: Int,
                    alpnProfile: String = "public",
                    resolve: @escaping RCTPromiseResolveBlock,
                    reject: @escaping RCTPromiseRejectBlock)
```

**Process**:
1. Creates `NWConnection` with QUIC protocol
2. Sets up TLS configuration:
   ```swift
   var tlsOptions = NWProtocolTLS.Options()
   tlsOptions.setVersion(.v13)  // TLS 1.3 mandatory
   sec_protocol_options_set_verify_block(tlsOptions.secProtocolOptions, ...)
   ```
3. Configures ALPN profile:
   - `.publicContent` → `zhtp-public/1`
   - `.controlPlane` → `zhtp-uhp/1` (with fallback to `h3`)
4. Performs full 3-way QUIC handshake
5. 30-second timeout
6. Returns latency and status

**TLS Details**:
- Enforces TLS 1.3 (required for QUIC)
- Custom verification block disables certificate checks (dev mode)
- For production: would validate actual certificates

#### 4. Making Requests
```swift
@objc
func request(_ url: String,
             options: [String: Any],
             resolve: @escaping RCTPromiseResolveBlock,
             reject: @escaping RCTPromiseRejectBlock)
```

**Request Flow**:
1. Parse URL → extract host, port, path, headers, body
2. Establish QUIC connection (or reuse existing)
3. Format HTTP/1.1-like request:
   ```
   GET /path HTTP/1.1
   Host: example.com
   <custom headers>
   <body>
   ```
4. Send via NWConnection
5. Read response:
   - Parse status line
   - Parse headers
   - Read body
   - Handle chunked encoding if needed
6. Store UUID-based connection reference
7. Return response as HashMap: `{ status, headers, body, latency }`

**Connection Management**:
```swift
activeConnections[uuid] = connection
connection.stateUpdateHandler = { state in
    // Auto-cleanup on disconnect
    if state == .cancelled {
        activeConnections.removeValue(forKey: uuid)
    }
}
```

#### 5. Cancellation
```swift
@objc
func cancelAll(_ resolve: @escaping RCTPromiseResolveBlock,
               reject: @escaping RCTPromiseRejectBlock)
```

**Process**:
1. Iterate all connections in `activeConnections` dict
2. Call `.cancel()` on each
3. Clear the dictionary
4. Returns success/failure

### TLS Configuration (iOS)

```swift
// Disable certificate verification (development)
var tlsOptions = NWProtocolTLS.Options()
sec_protocol_options_set_verify_block(
    tlsOptions.secProtocolOptions,
    { (_: sec_protocol_metadata_t, _: URLCredential?) in
        // Accept all certificates
        return true
    }
)
```

**Security Notes**:
- ⚠️ Accepts self-signed, expired, wrong-domain certs
- OK for development
- Must be gated behind a production flag for release builds
- No certificate pinning (could be added)

### Response Parsing (iOS)

```swift
// Example response parsing
let responseString = String(data: bodyData, encoding: .utf8)
var responseHeaders: [String: String] = [:]
for headerLine in headerLines {
    let parts = headerLine.split(separator: ":", maxSplits: 1)
    responseHeaders[String(parts[0])] = String(parts[1]).trimmingCharacters(...)
}

return [
    "status": statusCode,
    "headers": responseHeaders,
    "body": responseString,
    "latency": latencyMs
]
```

---

## Android Implementation

### Overview
- **Framework**: Quinn (pure Rust QUIC library v0.11)
- **Language**: Rust + Kotlin + JNI
- **Dependencies**: External (Cargo-managed Rust crates)
- **Architecture**: Async runtime via Tokio

### Files & Locations

#### Rust Implementation
- **`android/app/src/main/rust/quic-jni/src/quic_client.rs`** (~459 lines)
  - Core QUIC client logic using quinn

- **`android/app/src/main/rust/quic-jni/src/lib.rs`** (~538 lines)
  - JNI bridge between Rust and Java

- **`android/app/src/main/rust/quic-jni/Cargo.toml`**
  - Rust dependency manifest
  - Key deps: `quinn`, `rustls`, `tokio`, `jni`

#### Build Infrastructure
- **`android/app/src/main/rust/quic-jni/build-android.sh`**
  - Cross-compilation script
  - Builds for: `aarch64`, `armv7`, `x86_64`, `i686`
  - Outputs `.so` files to `jniLibs/`

#### Kotlin/Java Integration
- **`android/app/src/main/java/com/sovereignnetworkmobile/NativeQuicModule.kt`**
  - React Native module bridge
  - Loads JNI library and exposes methods to JS

- **`android/app/src/main/java/com/sovereignnetworkmobile/NativeQuicBridge.kt`**
  - JNI loader wrapper
  - Synchronized initialization

### How It Works

#### 1. Initialization
```rust
// lib.rs - Global QUIC client managed by Tokio runtime
lazy_static::lazy_static! {
    static ref QUIC_CLIENT: Mutex<QuicClient> = Mutex::new(QuicClient::new());
    static ref RUNTIME: tokio::runtime::Runtime =
        tokio::runtime::Runtime::new().unwrap();
}

#[no_mangle]
pub extern "C" fn Java_com_sovereignnetworkmobile_NativeQuicBridge_nativeInit() {
    // Initialize Tokio runtime and QUIC client
    let _ = &RUNTIME;
    let _ = &QUIC_CLIENT;
}
```

**What happens**:
- Creates a global Tokio async runtime (once per app)
- Creates a global QuicClient wrapper (thread-safe with Mutex)
- Called once during app startup

#### 2. Reachability Check
```rust
#[no_mangle]
pub extern "C" fn Java_..._nativeCheckReachability(
    env: JNIEnv,
    _class: JClass,
    host_jstr: JString,
    port: i32,
) -> jobject {
    RUNTIME.block_on(async {
        let client = QUIC_CLIENT.lock().unwrap();
        client.check_reachability(&host, port as u16).await
    })
}
```

**Process** (in `quic_client.rs`):
```rust
pub async fn check_reachability(&self, host: &str, port: u16) -> bool {
    // Create UDP socket
    let socket = std::net::UdpSocket::bind("0.0.0.0:0")?;
    // Send UDP packet to host:port
    socket.send_to(&[0], format!("{}:{}", host, port))?;
    // Wait for response (5 second timeout)
    socket.set_read_timeout(Some(Duration::from_secs(5)))?;
    let mut buf = [0; 1];
    socket.recv(&mut buf).is_ok()
}
```

**Why UDP**: Quick network reachability without QUIC overhead.

#### 3. Full Connection Test
```rust
pub async fn test_connection(&self, host: &str, port: u16) -> ConnectionTestResult {
    // 1. Resolve hostname
    let addrs = tokio::net::lookup_host(format!("{}:{}", host, port)).await?;
    let socket_addr = addrs.next().ok_or("No addresses found")?;

    // 2. Create QUIC endpoint
    let mut endpoint = quinn::Endpoint::new(&Default::default(),
                                            Some(server_config),
                                            socket)?;

    // 3. Establish connection with 30s timeout
    let connection = tokio::time::timeout(
        Duration::from_secs(30),
        endpoint.connect(socket_addr, "localhost")?
    ).await??;

    // 4. Send initial packet, measure response time
    let elapsed = start.elapsed();

    Ok(ConnectionTestResult {
        success: true,
        latency_ms: elapsed.as_millis() as u32
    })
}
```

**QUIC Handshake Steps**:
1. Initial packet sent (CRYPTO frame with TLS ClientHello)
2. Server responds with Initial + Handshake packets
3. Exchange continues until keys are established
4. Connection ready for data
5. Timeout: 30 seconds

#### 4. Making Requests
```rust
pub async fn request(
    &mut self,
    url: &str,
    method: &str,
    headers: HashMap<String, String>,
    body: Option<Vec<u8>>,
    timeout_secs: u64,
    alpn_profile: &str,
) -> Result<RequestResponse> {
    // 1. Parse URL
    let parsed = url::Url::parse(url)?;
    let host = parsed.host_str().ok_or("No host")?;
    let port = parsed.port().unwrap_or(443);
    let path = parsed.path();

    // 2. Get or create connection
    let mut conn = if let Some(c) = self.connections.get_mut(host) {
        c.clone()
    } else {
        self.establish_quic_connection(host, port, alpn_profile).await?
    };

    // 3. Open stream
    let mut send = conn.open_uni().await?;

    // 4. Format request (HTTP/1.1 style)
    let request_line = format!("{} {} HTTP/1.1\r\n", method, path);
    let mut request_bytes = request_line.into_bytes();
    request_bytes.extend_from_slice(b"Host: ");
    request_bytes.extend_from_slice(host.as_bytes());
    request_bytes.extend_from_slice(b"\r\n");

    for (key, val) in &headers {
        request_bytes.extend_from_slice(format!("{}: {}\r\n", key, val).as_bytes());
    }
    request_bytes.extend_from_slice(b"\r\n");
    if let Some(body) = body {
        request_bytes.extend_from_slice(&body);
    }

    // 5. Send request on QUIC stream
    send.write_all(&request_bytes).await?;
    send.finish().await?;

    // 6. Read response on stream
    let mut recv = conn.accept_uni().await??;
    let mut response_bytes = Vec::new();
    recv.read_to_end(&mut response_bytes).await?;

    // 7. Parse response
    let response_str = String::from_utf8(response_bytes)?;
    let (status, headers, body) = parse_http_response(&response_str)?;

    Ok(RequestResponse {
        status,
        headers,
        body,
        latency_ms: elapsed.as_millis() as u32
    })
}
```

**Key Points**:
- Uses quinn's `Endpoint` to manage connections
- Opens unidirectional QUIC streams for requests
- Sends HTTP/1.1-style formatted request
- Reads response from stream
- Supports custom ALPN for protocol negotiation

#### 5. Connection Establishment
```rust
async fn establish_quic_connection(
    &mut self,
    host: &str,
    port: u16,
    alpn_profile: &str,
) -> Result<quinn::Connection> {
    // 1. Create client config with TLS
    let mut client_config = quinn::ClientConfig::new(
        Arc::new(QuicClientCrypto::new(alpn_profile))
    );

    // 2. Disable cert verification (dev mode)
    client_config.crypto = Arc::new(SkipServerVerification::new());

    // 3. Create endpoint
    let endpoint = quinn::Endpoint::new(
        &Default::default(),
        None,
        "0.0.0.0:0".parse()?
    )?;

    // 4. Connect with ALPN
    let connection = endpoint.connect(
        format!("{}:{}", host, port).parse()?,
        host
    )?
    .await?;

    // 5. Store for reuse
    self.connections.insert(host.to_string(), connection.clone());

    Ok(connection)
}
```

### TLS Configuration (Android)

```rust
pub struct SkipServerVerification;

impl rustls::client::danger::ServerCertVerifier for SkipServerVerification {
    fn verify_server_cert(
        &self,
        _end_entity: &rustls::pki_types::CertificateDer<'_>,
        _intermediates: &[rustls::pki_types::CertificateDer<'_>],
        _server_name: &rustls::pki_types::ServerName<'_>,
        _ocsp_response: &[u8],
        _now: rustls::pki_types::UnixTime,
    ) -> Result<rustls::client::danger::ServerCertVerified, rustls::Error> {
        // Accept all certificates
        Ok(rustls::client::danger::ServerCertVerified::assertion())
    }
}
```

**Security Notes**:
- ⚠️ Accepts ANY certificate (self-signed, expired, wrong domain, etc.)
- OK for development/testing
- Must be gated for production
- No certificate pinning

### Rust Dependencies (Cargo.toml)

```toml
[dependencies]
quinn = "0.11"              # QUIC protocol
rustls = "0.23"             # TLS 1.3 (pure Rust)
rustls-platform-verifier = "0.3"  # OS cert verification
webpki-roots = "0.26"       # Root CA certificates
tokio = "1"                 # Async runtime
jni = "0.21"                # Java Native Interface
url = "2"                   # URL parsing
```

### Build Process

**Step 1**: Compile Rust with Cargo
```bash
cd android/app/src/main/rust/quic-jni
cargo build --release --target aarch64-linux-android
cargo build --release --target armv7-linux-androideabi
# etc for x86_64, i686
```

**Step 2**: Place `.so` files in JNI directories
```
android/app/src/main/jniLibs/
├── arm64-v8a/          (aarch64)
│   └── libquic_jni.so
├── armeabi-v7a/        (armv7)
│   └── libquic_jni.so
├── x86_64/
│   └── libquic_jni.so
└── x86/                (i686)
    └── libquic_jni.so
```

**Step 3**: Gradle bundles `.so` files with APK
- App loads at runtime: `NativeQuicBridge.loadNativeLibrary()`

---

## JavaScript/TypeScript Layer

### QuicClient.ts
**Location**: `src/services/QuicClient.ts` (~256 lines)

**Main Functions**:

```typescript
// Platform detection
export function isQuicSupported(): Promise<boolean>

// Reachability check (UDP)
export function checkNodeReachability(
    host: string,
    port: number
): Promise<QuicReachabilityResult>

// Full QUIC test
export function testQuicConnection(
    host: string,
    port: number,
    alpn?: 'public' | 'control',
    timeout?: number
): Promise<QuicConnectionTestResult>

// Make QUIC request
export function quicRequest(
    url: string,
    options?: QuicRequestOptions
): Promise<QuicResponse>

// Cancel all active connections
export function cancelAllQuicConnections(): Promise<void>
```

**Implementation Detail**:
```typescript
const quicModule = NativeModules.NativeQuic;

export async function quicRequest(
    url: string,
    options: QuicRequestOptions = {}
): Promise<QuicResponse> {
    // 1. Validate QUIC support
    const supported = await isQuicSupported();
    if (!supported) {
        throw new Error('QUIC not supported on this device');
    }

    // 2. Call native module
    const response = await quicModule.request(
        url,
        {
            method: options.method || 'GET',
            headers: options.headers || {},
            body: options.body,
            timeout: options.timeout || 30,
            alpnProfile: options.alpn || 'public'
        }
    );

    // 3. Parse response
    return {
        status: response.status,
        headers: response.headers,
        body: response.body,
        latency: response.latency
    };
}
```

### QuicFetchAdapter.ts
**Location**: `src/services/QuicFetchAdapter.ts` (~371 lines)

**Purpose**: Makes QUIC work like `fetch()` for API client integration

```typescript
export class QuicFetchAdapter implements FetchAdapter {
    async fetch(
        resource: string,
        init?: RequestInit
    ): Promise<Response> {
        // 1. Check if endpoint should use QUIC
        const useQuic = isPublicEndpoint(resource);

        if (!useQuic) {
            // Fallback to HTTP
            return fetch(resource, init);
        }

        // 2. Make QUIC request
        const quicResponse = await quicRequest(resource, {
            method: init?.method || 'GET',
            headers: init?.headers as Record<string, string>,
            body: init?.body ? await toBytes(init.body) : undefined,
            alpn: 'public'  // or 'control'
        });

        // 3. Convert to fetch Response
        return new Response(quicResponse.body, {
            status: quicResponse.status,
            headers: quicResponse.headers
        });
    }
}
```

**ALPN Selection Logic**:
```typescript
function selectAlpnProfile(endpoint: string): 'public' | 'control' {
    const publicEndpoints = [
        /\/api\/v1\/identity\/.*/,
        /\/api\/v1\/protocol\/health/,
        /\/api\/v1\/ubs\/.*/,
        /\/api\/v1\/dao\/.*/,
        /\/api\/v1\/wallet\/.*/,
        /\/web4\/.*/
    ];

    return publicEndpoints.some(p => p.test(endpoint))
        ? 'public'
        : 'control';
}
```

---

## ALPN Profiles

### What is ALPN?

ALPN (Application Layer Protocol Negotiation) allows client and server to agree on which protocol to use during the TLS handshake, before sending any application data.

### Your ALPN Profiles

**1. `zhtp-public/1`** - Public Endpoints
- Read-only or whitelisted operations
- No authentication required
- Endpoints:
  - `/api/v1/identity/*` - Identity checks, creation
  - `/api/v1/protocol/health` - Node health
  - `/api/v1/ubs/*` - UBS status checks
  - `/api/v1/dao/*` - DAO proposal queries
  - `/api/v1/wallet/*` - Balance/public info
  - `/web4/*` - Web4 content

**2. `zhtp-uhp/1`** (iOS: also supports `h3`) - Authenticated Endpoints
- Control plane operations
- Requires authentication
- Endpoints not in public list
- Fallback default

### Implementation Details

**iOS**:
```swift
let alpnProfiles: [NWProtocolTLS.AlpnProtocol] = [
    alpnProfile == "public"
        ? .publicContent
        : .controlPlane
]
tlsOptions.alpnProtocols = alpnProfiles
```

**Android**:
```rust
pub fn set_alpn_protocol(&mut self, profile: &str) {
    self.alpn = match profile {
        "public" => "zhtp-public/1".to_string(),
        "control" => "zhtp-uhp/1".to_string(),
        other => other.to_string(),
    };
}
```

---

## Comparison: iOS vs Android

| Aspect | iOS | Android |
|--------|-----|---------|
| **Library** | Apple Network.framework | Quinn (Rust) |
| **Language** | Swift | Rust + Kotlin JNI |
| **Dependencies** | None (built-in) | External (Cargo) |
| **Min OS** | iOS 15+ | Android 21+ |
| **Architectures** | ARM64 | ARM64, ARMv7, x86_64, x86 |
| **Cert Verification** | Custom insecure verifier | Custom insecure verifier |
| **Async Model** | DispatchQueue | Tokio runtime |
| **Connection Pool** | UUID-based dictionary | Hashmap by hostname |
| **Request Parsing** | Manual HTTP/1.1 parsing | Manual HTTP/1.1 parsing |

---

## Security Considerations

### Current Issues

1. **Insecure Certificate Verification** (Both Platforms)
   - Accepts ANY certificate (self-signed, expired, wrong domain)
   - ⚠️ **MITM vulnerability in production**
   - Must be gated behind dev flag

2. **No Certificate Pinning**
   - Certificates not pinned to specific keys
   - Vulnerable if CA is compromised
   - Could add per-node pinning

3. **ALPN Enforcement**
   - Depends on server respecting ALPN
   - Server must reject `zhtp-control/1` requests without auth
   - No client-side auth token validation

### Recommendations

1. **Production Build**:
   ```kotlin
   // Android
   val verifier = if (BuildConfig.DEBUG) {
       SkipServerVerification()
   } else {
       DefaultServerVerifier()  // Use system trust
   }
   ```

2. **Certificate Pinning** (Optional):
   ```rust
   pub struct PinnedCertificates {
       pins: HashMap<String, String>,  // host -> pubkey hash
   }
   ```

3. **Authentication Tokens**:
   - Add Authorization headers to requests
   - Server validates token + ALPN profile together

---

## Data Flow Example: Making a Request

### iOS Flow
```
JavaScript quicRequest()
    ↓
NativeModules.NativeQuic.request()
    ↓
NativeQuicModule.swift request()
    ↓
Get or create NWConnection to host:port
    ↓
Establish QUIC + TLS connection
    ↓
Send HTTP/1.1 formatted request on connection
    ↓
Read response bytes
    ↓
Parse status line + headers + body
    ↓
Return HashMap to JavaScript
```

### Android Flow
```
JavaScript quicRequest()
    ↓
NativeModules.NativeQuic.request()
    ↓
NativeQuicBridge.nativeRequest() (JNI)
    ↓
lib.rs JNI function
    ↓
RUNTIME.block_on(quic_client.request())
    ↓
Get or create quinn::Connection
    ↓
Establish QUIC + TLS handshake (Tokio async)
    ↓
Open unidirectional QUIC stream
    ↓
Send HTTP/1.1 formatted request bytes
    ↓
Receive response on stream
    ↓
Parse status line + headers + body
    ↓
Convert to HashMap, return to Java via JNI
    ↓
Return to JavaScript
```

---

## Testing Endpoints

Both implementations can test against these endpoints:

```typescript
// Health check
await quicRequest('https://api.example.com/api/v1/protocol/health')

// Identity lookup
await quicRequest('https://api.example.com/api/v1/identity/0x123', {
    alpn: 'public'
})

// Wallet balance
await quicRequest('https://api.example.com/api/v1/wallet/balance', {
    alpn: 'public'
})
```

---

## Future Improvements

1. **HTTP/3 Support** (instead of HTTP/1.1-like)
   - More efficient header compression
   - Better stream prioritization
   - Standardized protocol

2. **Connection Pooling**
   - Currently each request may establish new connection
   - Could pool and reuse connections per host

3. **Request Retry Logic**
   - Automatic retry on timeout
   - Exponential backoff

4. **Metrics/Observability**
   - Track request latencies
   - Monitor connection success rates
   - Log errors for debugging

5. **Configuration System**
   - Env-specific endpoints
   - Timeout tuning
   - Enable/disable QUIC per environment
