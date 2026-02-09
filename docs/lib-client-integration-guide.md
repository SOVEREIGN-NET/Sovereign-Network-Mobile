# How Frontend Clients Use lib-client

> **Breaking Change Guide** — Three FFI surfaces with exact function signatures and step-by-step flows.

## Build Targets

| Target | Build | Binding Layer | JS Field Names |
|--------|-------|---------------|----------------|
| Web (WASM) | `wasm-pack build --features wasm` | `wasm.rs` → TypeScript | camelCase |
| iOS | `cargo build --target aarch64-apple-ios` | C FFI in `lib.rs` | C pointers |
| Android | `cargo build --target aarch64-linux-android` | C FFI in `lib.rs` | C pointers |

---

## 1. Web (TypeScript/JavaScript via WASM)

### Build

```bash
cd lib-client
wasm-pack build --target web --features wasm --out-dir pkg
```

### Full Lifecycle

```typescript
import init, {
  generateIdentity,
  getPublicIdentity,
  restoreIdentityFromSeed,
  signRegistrationProof,
  signMessage,
  verifySignature,
  serializeIdentity,
  deserializeIdentity,
  WasmHandshakeState,
  WasmSession,
  serializeRequest,
  deserializeResponse,
  createZhtpFrame,
  parseZhtpFrame,
  computeChannelBinding,
  blake3Hash,
  randomBytes,
  encryptOneshot,
  decryptOneshot,
} from './pkg/zhtp_client';

// ── Step 0: Initialize WASM module (once at app startup) ──
await init();

// ── Step 1: Generate new identity ──
const identity = generateIdentity('browser-uuid-abc123');
// Returns JS object:
// {
//   did: "did:zhtp:a1b2c3...",
//   publicKey: Uint8Array(2592),     // Dilithium5 public key
//   privateKey: Uint8Array(4864),    // Dilithium5 secret key (NEVER send!)
//   kyberPublicKey: Uint8Array(1568),
//   kyberSecretKey: Uint8Array(3168),// NEVER send!
//   nodeId: Uint8Array(32),
//   deviceId: "browser-uuid-abc123",
//   masterSeed: Uint8Array(32),      // Recovery entropy (NEVER send!)
//   createdAt: 1707350400
// }

// ── Step 2: Persist identity to secure storage ──
const json = serializeIdentity(identity);
// Store in IndexedDB or encrypted localStorage
localStorage.setItem('zhtp_identity', json);

// ── Step 3: Get public identity for server registration ──
const publicIdentity = getPublicIdentity(identity);
// {
//   did: "did:zhtp:a1b2c3...",
//   publicKey: Uint8Array(2592),
//   kyberPublicKey: Uint8Array(1568),
//   nodeId: Uint8Array(32),
//   deviceId: "browser-uuid-abc123",
//   createdAt: 1707350400
// }

// ── Step 4: Register with server ──
const timestamp = Math.floor(Date.now() / 1000);
const regProof = signRegistrationProof(identity, timestamp);
// POST to /api/v1/identity/register:
// {
//   did: publicIdentity.did,
//   public_key: Array.from(publicIdentity.publicKey),
//   kyber_public_key: Array.from(publicIdentity.kyberPublicKey),
//   node_id: Array.from(publicIdentity.nodeId),
//   device_id: publicIdentity.deviceId,
//   timestamp: timestamp,
//   registration_proof: Array.from(regProof)
// }

// ── Step 5: UHP v2 Handshake (post-quantum mutual auth) ──
const channelBinding = computeChannelBinding('client:0', 'server:443');
const handshake = new WasmHandshakeState(identity, channelBinding);

// Leg 1: Client → Server
const clientHello = handshake.createClientHello();
// Send clientHello bytes to server via WebSocket/fetch

// Leg 2: Server → Client → Server
// Receive serverHello bytes from server
const clientFinish = handshake.processServerHello(serverHelloBytes);
// Send clientFinish bytes to server

// Leg 3: Get session
const result = handshake.finalize();
// result = {
//   sessionKey: Uint8Array(32),
//   sessionId: Uint8Array(32),
//   peerDid: "did:zhtp:server...",
//   peerPublicKey: Uint8Array(2592)
// }

// ── Step 6: Encrypted session communication ──
const session = new WasmSession(result.sessionKey, result.sessionId, result.peerDid);

// Send encrypted ZHTP request
const request = serializeRequest({
  method: 'GET',
  uri: '/api/v1/profile',
  headers: { contentType: 'application/json' },
  body: new Uint8Array(0),
  requester: identity.did,
});
const encrypted = session.encrypt(request);
const frame = createZhtpFrame(encrypted);
// Send frame bytes over WebSocket

// Receive encrypted response
const payload = parseZhtpFrame(responseBytes);
const decrypted = session.decrypt(payload);
const response = deserializeResponse(decrypted);
// response = { status: 200, statusText: "OK", body: Uint8Array, headers: {...} }

// ── Step 7: Sign arbitrary messages ──
const sig = signMessage(identity, new TextEncoder().encode('some payload'));
const valid = verifySignature(
  identity.publicKey,
  new TextEncoder().encode('some payload'),
  sig
);

// ── Step 8: Identity recovery (new device) ──
// User enters 24-word phrase → convert to 32-byte entropy
// (mnemonic→entropy conversion must happen in app code or via a dedicated WASM export)
// Then:
const restoredIdentity = restoreIdentityFromSeed(entropyBytes, 'new-browser-uuid');
// restoredIdentity.did === original identity.did (deterministic)
// restoredIdentity.kyberPublicKey will differ (random, re-register with server)

// ── Step 9: Reload persisted identity ──
const savedJson = localStorage.getItem('zhtp_identity');
const loadedIdentity = deserializeIdentity(savedJson);

// ── Data-at-rest encryption (local storage) ──
const key = randomBytes(32);
const ct = encryptOneshot(key, new TextEncoder().encode('sensitive'));
const pt = decryptOneshot(key, ct); // ChaCha20-Poly1305
```

---

## 2. iOS (Swift via C FFI)

### Build

```bash
cargo build --release --target aarch64-apple-ios
# Output: target/aarch64-apple-ios/release/libzhtp_client.a
```

### Header (bridge to Swift)

```c
// zhtp_client.h
typedef struct IdentityHandle IdentityHandle;
typedef struct { uint8_t* data; size_t len; } ByteBuffer;

IdentityHandle* zhtp_client_generate_identity(const char* device_id);
IdentityHandle* zhtp_client_restore_identity_from_phrase(const char* phrase, const char* device_id);
void zhtp_client_identity_free(IdentityHandle* handle);

char* zhtp_client_identity_get_did(const IdentityHandle* handle);
char* zhtp_client_identity_get_device_id(const IdentityHandle* handle);
char* zhtp_client_identity_get_seed_phrase(const IdentityHandle* handle);
ByteBuffer zhtp_client_identity_get_public_key(const IdentityHandle* handle);
ByteBuffer zhtp_client_identity_get_kyber_public_key(const IdentityHandle* handle);
ByteBuffer zhtp_client_identity_get_node_id(const IdentityHandle* handle);
uint64_t zhtp_client_identity_get_created_at(const IdentityHandle* handle);

ByteBuffer zhtp_client_sign_registration_proof(const IdentityHandle* handle, uint64_t timestamp);
ByteBuffer zhtp_client_sign_uhp_challenge(const IdentityHandle* handle, const uint8_t* challenge, size_t len);
ByteBuffer zhtp_client_sign_message(const IdentityHandle* handle, const uint8_t* msg, size_t len);

char* zhtp_client_identity_serialize(const IdentityHandle* handle);
IdentityHandle* zhtp_client_identity_deserialize(const char* json);
char* zhtp_client_identity_to_handshake_json(const IdentityHandle* handle);
char* zhtp_client_export_keystore_base64(const IdentityHandle* handle);

// Token transactions
char* zhtp_client_build_token_transfer(const IdentityHandle* handle,
    const uint8_t* token_id, const uint8_t* to_pubkey, size_t to_pk_len,
    uint64_t amount, uint8_t chain_id);
char* zhtp_client_build_token_create(const IdentityHandle* handle,
    const char* name, const char* symbol, uint64_t supply, uint8_t decimals, uint8_t chain_id);
char* zhtp_client_build_token_mint(const IdentityHandle* handle,
    const uint8_t* token_id, const uint8_t* to_pubkey, size_t to_pk_len,
    uint64_t amount, uint8_t chain_id);
char* zhtp_client_build_token_burn(const IdentityHandle* handle,
    const uint8_t* token_id, uint64_t amount, uint8_t chain_id);

// Domain transactions
char* zhtp_client_build_domain_register(const IdentityHandle* handle,
    const char* domain, const char* content_cid, uint8_t chain_id);
char* zhtp_client_build_domain_update(const IdentityHandle* handle,
    const char* domain, const char* content_cid, uint8_t chain_id);
char* zhtp_client_build_domain_transfer(const IdentityHandle* handle,
    const char* domain, const uint8_t* to_pubkey, uint8_t chain_id);

void zhtp_client_string_free(char* s);
void zhtp_client_buffer_free(ByteBuffer buf);
```

### Swift Usage

```swift
import Foundation

class ZhtpIdentity {
    private var handle: OpaquePointer

    // Generate new identity
    init(deviceId: String) throws {
        guard let h = zhtp_client_generate_identity(deviceId) else {
            throw ZhtpError.identityGenerationFailed
        }
        self.handle = h
    }

    // Restore from 24-word phrase
    init(phrase: String, deviceId: String) throws {
        guard let h = zhtp_client_restore_identity_from_phrase(phrase, deviceId) else {
            throw ZhtpError.recoveryFailed
        }
        self.handle = h
    }

    // Restore from Keychain JSON
    init(json: String) throws {
        guard let h = zhtp_client_identity_deserialize(json) else {
            throw ZhtpError.deserializationFailed
        }
        self.handle = h
    }

    var did: String {
        let ptr = zhtp_client_identity_get_did(handle)!
        defer { zhtp_client_string_free(ptr) }
        return String(cString: ptr)
    }

    var seedPhrase: String {
        let ptr = zhtp_client_identity_get_seed_phrase(handle)!
        defer { zhtp_client_string_free(ptr) }
        return String(cString: ptr)
    }

    func signRegistrationProof(timestamp: UInt64) -> Data {
        let buf = zhtp_client_sign_registration_proof(handle, timestamp)
        defer { zhtp_client_buffer_free(buf) }
        return Data(bytes: buf.data, count: buf.len)
    }

    func signMessage(_ message: Data) -> Data {
        let buf = message.withUnsafeBytes { ptr in
            zhtp_client_sign_message(handle, ptr.baseAddress!, message.count)
        }
        defer { zhtp_client_buffer_free(buf) }
        return Data(bytes: buf.data, count: buf.len)
    }

    // Serialize for Keychain storage
    func serialize() -> String {
        let ptr = zhtp_client_identity_serialize(handle)!
        defer { zhtp_client_string_free(ptr) }
        return String(cString: ptr)
    }

    // Get handshake-compatible JSON for UHP
    func handshakeJson() -> String {
        let ptr = zhtp_client_identity_to_handshake_json(handle)!
        defer { zhtp_client_string_free(ptr) }
        return String(cString: ptr)
    }

    // Token transfer
    func buildTransferTx(tokenId: Data, toPublicKey: Data, amount: UInt64, chainId: UInt8) -> String? {
        let ptr = tokenId.withUnsafeBytes { tid in
            toPublicKey.withUnsafeBytes { tpk in
                zhtp_client_build_token_transfer(
                    handle, tid.baseAddress!, tpk.baseAddress!,
                    toPublicKey.count, amount, chainId
                )
            }
        }
        guard let ptr = ptr else { return nil }
        defer { zhtp_client_string_free(ptr) }
        return String(cString: ptr)
    }

    deinit { zhtp_client_identity_free(handle) }
}

// ── Usage ──

// First launch: generate + save to Keychain
let identity = try ZhtpIdentity(deviceId: UIDevice.current.identifierForVendor!.uuidString)
let seedPhrase = identity.seedPhrase  // Show to user once, they write it down
KeychainManager.save(key: "zhtp_identity", value: identity.serialize())

// Subsequent launches: load from Keychain
let json = KeychainManager.load(key: "zhtp_identity")
let identity = try ZhtpIdentity(json: json)

// Recovery on new device
let identity = try ZhtpIdentity(phrase: "word1 word2 ... word24", deviceId: newDeviceUuid)
// identity.did matches the original — re-register Kyber key with server
```

---

## 3. Key Operations Summary

| Operation | WASM Function | C FFI Function | What It Does |
|-----------|--------------|----------------|--------------|
| New identity | `generateIdentity(deviceId)` | `zhtp_client_generate_identity(deviceId)` | Full PQ key derivation |
| Recover from phrase | `restoreIdentityFromSeed(entropy, deviceId)` | `zhtp_client_restore_identity_from_phrase(phrase, deviceId)` | Deterministic DID recovery |
| Get public part | `getPublicIdentity(identity)` | Compose from `_get_did`, `_get_public_key`, etc. | Safe-to-send subset |
| Register proof | `signRegistrationProof(identity, ts)` | `zhtp_client_sign_registration_proof(handle, ts)` | `"ZHTP_REGISTER:{did}:{ts}"` signature |
| Sign message | `signMessage(identity, msg)` | `zhtp_client_sign_message(handle, msg, len)` | Dilithium5 detached signature |
| UHP handshake | `WasmHandshakeState` class | `zhtp_client_handshake_*` (see Section 6) | 3-leg mutual auth (keys stay in Rust) |
| Encrypted session | `WasmSession` class | Session from `handshake_finalize` | ChaCha20-Poly1305 |
| Persist | `serializeIdentity` / `deserializeIdentity` | `_serialize` / `_deserialize` | JSON round-trip |
| Token transfer | N/A (use `build_transfer_tx` from Rust) | `zhtp_client_build_token_transfer(...)` | Signed hex tx |
| Migration | Build payload manually | `build_migrate_identity_request_json` | POST to `/api/v1/identity/migrate` |

---

## 4. Critical Security Rules for Frontend Devs

1. **NEVER transmit:** `privateKey`, `kyberSecretKey`, `masterSeed`/`recovery_entropy`
2. **Only send to server:** `did`, `publicKey`, `kyberPublicKey`, `nodeId`, `deviceId`, `createdAt`, `registrationProof`
3. **Store identity JSON** in platform secure storage (iOS Keychain, Android Keystore, Web encrypted IndexedDB)
4. **Show seed phrase exactly once** during onboarding — user writes it down, then never display again
5. **On recovery:** Same 24-word phrase produces same DID + same Dilithium keys. Kyber keys will differ (random) — re-register the new `kyberPublicKey` with the server
6. **Migration (breaking DID change):** If user has a legacy identity (pre-ADR-0004), call `build_migrate_identity_request` and POST to `/api/v1/identity/migrate`

---

## 5. WASM Caveats

- `restoreIdentityFromSeed` takes raw 32-byte entropy, not a phrase. The WASM layer doesn't expose `entropy_from_mnemonic()` directly — you need to either:
  - Add a WASM export for `restore_identity_from_phrase` (recommended)
  - Or implement BIP39 mnemonic→entropy in JS
- The `masterSeed` field in WASM JS objects is the 32-byte `recovery_entropy` (legacy naming preserved for backward compat)

---

## 6. New HandshakeState C FFI (replaces uhp-ffi dependency)

> Secret keys no longer cross FFI. The full 3-leg UHP handshake now runs inside Rust.

### New C FFI Header Additions

```c
typedef struct HandshakeStateHandle HandshakeStateHandle;
typedef struct HandshakeResultHandle HandshakeResultHandle;

// 1. Create handshake state (keys stay in Rust)
HandshakeStateHandle* zhtp_client_handshake_new(
    const IdentityHandle* identity,
    const uint8_t* channel_binding,
    size_t channel_binding_len
);

// 2. Produce ClientHello bytes to send to server
ByteBuffer zhtp_client_handshake_create_client_hello(HandshakeStateHandle* hs);

// 3. Feed ServerHello bytes, get ClientFinish bytes back
ByteBuffer zhtp_client_handshake_process_server_hello(
    HandshakeStateHandle* hs,
    const uint8_t* server_hello,
    size_t server_hello_len
);

// 4. Derive session
HandshakeResultHandle* zhtp_client_handshake_finalize(HandshakeStateHandle* hs);

// 5. Extract session fields
ByteBuffer zhtp_client_handshake_result_get_session_key(const HandshakeResultHandle* result);   // 32 bytes
ByteBuffer zhtp_client_handshake_result_get_session_id(const HandshakeResultHandle* result);    // 32 bytes
char*      zhtp_client_handshake_result_get_peer_did(const HandshakeResultHandle* result);      // null-terminated
ByteBuffer zhtp_client_handshake_result_get_peer_public_key(const HandshakeResultHandle* result);

// 6. Cleanup
void zhtp_client_handshake_free(HandshakeStateHandle* hs);
void zhtp_client_handshake_result_free(HandshakeResultHandle* result);
```

### Migration from old flow

**Old flow (deprecated):**
```swift
// Extract raw secret keys across FFI boundary
let sk  = zhtp_client_identity_get_dilithium_secret_key(identity)
let ksk = zhtp_client_identity_get_kyber_secret_key(identity)
let seed = zhtp_client_identity_get_master_seed(identity)
// Pass raw key bytes to uhp-ffi crate
```

**New flow:**
```swift
// 1. Create handshake state (keys stay in Rust)
let hs = zhtp_client_handshake_new(identity.handle, channelBinding, channelBindingLen)

// 2. ClientHello → send to server
let hello = zhtp_client_handshake_create_client_hello(hs)

// 3. Feed ServerHello bytes → get ClientFinish back
let finish = zhtp_client_handshake_process_server_hello(hs, serverHelloData, serverHelloLen)

// 4. Derive session
let result = zhtp_client_handshake_finalize(hs)

// 5. Extract what you need
let sessionKey = zhtp_client_handshake_result_get_session_key(result)  // 32 bytes
let sessionId  = zhtp_client_handshake_result_get_session_id(result)   // 32 bytes
let peerDid    = zhtp_client_handshake_result_get_peer_did(result)
let peerPk     = zhtp_client_handshake_result_get_peer_public_key(result)

// 6. Cleanup
zhtp_client_handshake_free(hs)
zhtp_client_handshake_result_free(result)
zhtp_client_buffer_free(sessionKey)
zhtp_client_buffer_free(sessionId)
zhtp_client_string_free(peerDid)
zhtp_client_buffer_free(peerPk)
```

### Error convention

Same as existing FFI: pointer-returning functions return `NULL` on error, `ByteBuffer`-returning functions return `{NULL, 0}` on error. No error strings — check inputs on your side.

### Deprecated getters (still compile, will be removed)

- `zhtp_client_identity_get_dilithium_secret_key`
- `zhtp_client_identity_get_kyber_secret_key`
- `zhtp_client_identity_get_master_seed`

### Channel binding

Same as before: `Blake3(local_addr || peer_addr)` sorted lexicographically. Compute on your side before calling `zhtp_client_handshake_new`. 32 bytes.

### Wire format

`create_client_hello` and `process_server_hello` return/consume length-prefixed JSON: `[4-byte BE length][serialized HandshakeMessage]`. Same wire format the WASM client uses. Feed the raw server response bytes directly into `process_server_hello` — it handles the length prefix stripping internally.

### What didn't change

HandshakeState internals, Identity, lib-identity-core, WASM bindings — all untouched. This is purely additive FFI surface.
