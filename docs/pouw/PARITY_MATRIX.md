# PoUW Cross-Platform Parity Matrix

> **CRITICAL:** iOS and Android must produce identical receipts for the same input. This matrix tracks parity test status.

## Status Legend

| Symbol | Meaning |
|--------|---------|
| ⬜ | Not implemented / Pending |
| 🟡 | In progress |
| ✅ | Passing |
| ❌ | Failing (BLOCKER) |
| N/A | Not applicable |

---

## Core Serialization Tests

| Test | iOS | Android | Status | Notes |
|------|-----|---------|--------|-------|
| **TV1: Hash Receipt Serialization** | ⬜ | ⬜ | Pending | Simple PROOF_HASH receipt |
| **TV2: Merkle Receipt Serialization** | ⬜ | ⬜ | Pending | PROOF_MERKLE with Aux data |
| **TV3: Batch Serialization** | ⬜ | ⬜ | Pending | ReceiptBatch with multiple receipts |
| **TV4: Challenge Token** | ⬜ | ⬜ | Pending | ChallengeToken serialization |
| **TV5: Edge Cases** | ⬜ | ⬜ | Pending | Empty fields, max values, Unicode |

---

## Cryptographic Parity Tests

| Test | iOS | Android | Status | Notes |
|------|-----|---------|--------|-------|
| **Signature Determinism** | ⬜ | ⬜ | Pending | Same input → same signature |
| **Signature Uniqueness** | ⬜ | ⬜ | Pending | Different input → different sig |
| **Hash Computation (Blake3)** | ⬜ | ⬜ | Pending | task_id derivation |
| **Hash Computation (SHA-256)** | ⬜ | ⬜ | Pending | Challenge verification |
| **Nonce Generation** | ⬜ | ⬜ | Pending | CSPRNG output |

---

## Security & Binding Tests

| Test | iOS | Android | Status | Notes |
|------|-----|---------|--------|-------|
| **Challenge Binding** | ⬜ | ⬜ | Pending | Nonce includes challenge |
| **Nonce Uniqueness (1K)** | ⬜ | ⬜ | Pending | No collisions in 1K generations |
| **Nonce Uniqueness (1M)** | ⬜ | ⬜ | Pending | No collisions in 1M generations |
| **Replay Protection** | ⬜ | ⬜ | Pending | Same nonce rejected |
| **Timestamp Precision** | ⬜ | ⬜ | Pending | Millisecond alignment |

---

## State Machine Consistency

| Test | iOS | Android | Status | Notes |
|------|-----|---------|--------|-------|
| **State Not in Wire Format** | ⬜ | ⬜ | Pending | State internal only |
| **State Transitions** | ⬜ | ⬜ | Pending | queued→submitted→accepted |
| **Retry Logic** | ⬜ | ⬜ | Pending | Failed→retryWait→queued |
| **Batch State Tracking** | ⬜ | ⬜ | Pending | All states in batch handled |

---

## Wire Format Compatibility

| Test | iOS | Android | Status | Notes |
|------|-----|---------|--------|-------|
| **Protobuf Field Order** | ⬜ | ⬜ | Pending | Tag-order serialization |
| **Varint Encoding** | ⬜ | ⬜ | Pending | uint64/int64 encoding |
| **Length-Delimited** | ⬜ | ⬜ | Pending | bytes/string encoding |
| **UTF-8 DID Encoding** | ⬜ | ⬜ | Pending | Unicode handling |
| **Empty Field Omission** | ⬜ | ⬜ | Pending | Default value handling |

---

## Enums & Constants

| Constant | iOS Value | Android Value | Status | Notes |
|----------|-----------|---------------|--------|-------|
| `PROOF_HASH` | 0 | 0 | ⬜ | Must match |
| `PROOF_MERKLE` | 0 | 0 | ⬜ | Must match |
| `PROOF_SIGNATURE` | 0 | 0 | ⬜ | Must match |
| `ED25519` | 0 | 0 | ⬜ | Must match |
| `DILITHIUM5` | 1 | 1 | ⬜ | Must match |
| `UNKNOWN` (Rejection) | 0 | 0 | ⬜ | Must match |
| `EXPIRED` | 1 | 1 | ⬜ | Must match |
| `REPLAY` | 2 | 2 | ⬜ | Must match |
| `BAD_SIGNATURE` | 4 | 4 | ⬜ | Must match |

---

## Integration Tests

| Test | iOS | Android | Status | Notes |
|------|-----|---------|--------|-------|
| **verifyContent() Flow** | ⬜ | ⬜ | Pending | End-to-end verification |
| **flush() Flow** | ⬜ | ⬜ | Pending | Batch submission |
| **getPendingCount()** | ⬜ | ⬜ | Pending | Queue status |
| **Error Propagation** | ⬜ | ⬜ | Pending | Error codes match |
| **Offline Queue** | ⬜ | ⬜ | Pending | Persistence across restarts |

---

## Performance Parity

| Metric | iOS Target | Android Target | Tolerance | Status |
|--------|------------|----------------|-----------|--------|
| **Receipt Generation** | < 10ms | < 10ms | ±2ms | ⬜ |
| **Batch Serialization** | < 50ms (100 receipts) | < 50ms | ±10ms | ⬜ |
| **Nonce Generation** | < 1ms | < 1ms | ±0.5ms | ⬜ |
| **Signature Generation** | < 100ms (Dilithium5) | < 100ms | ±20ms | ⬜ |
| **Memory Usage** | < 10MB | < 10MB | ±2MB | ⬜ |

---

## Test Vectors Verification

### Test Vector 1: Simple Hash Receipt

```
Input:
  version: 1
  task_id: [0x01, 0x02, 0x03, 0x04]
  client_did: "did:zhtp:test123"
  proof_type: PROOF_HASH (0)
  bytes_verified: 5
  result_ok: true
  started_at: 1700000000000
  finished_at: 1700000000005
  challenge_nonce: [0xaa, 0xbb, 0xcc, 0xdd, 0x11, 0x22, 0x33, 0x44]
  receipt_nonce: [0x11, 0x11, 0x11, 0x11, 0x22, 0x22, 0x22, 0x22]

Expected Output (hex):
  08011204010203041a106469643a7a6874703a7465737431323320002805
  30013880b4d7e74e8b014085b4d7e74e8b014a08aabbccdd112233445208
  1111111122222222

iOS Result: ⬜ Pending
Android Result: ⬜ Pending
Match: ⬜
```

### Test Vector 2: Merkle Receipt

```
Input:
  version: 1
  task_id: [0xab, 0xcd, 0xef]
  client_did: "did:zhtp:merkle_test"
  proof_type: PROOF_MERKLE (1)
  aux.merkle_root: [32 bytes]
  aux.proof_digest: [32 bytes]
  ...

Expected Output (hex):
  08011203abcdef1a146469643a7a6874703a6d65726b6c655f7465737420...

iOS Result: ⬜ Pending
Android Result: ⬜ Pending
Match: ⬜
```

### Test Vector 3: Batch

```
Input:
  version: 1
  client_did: "did:zhtp:batch_client"
  batch_nonce: [0xaa, 0xbb, 0xcc, 0xdd]
  receipts: [receipt1, receipt2]

Expected Output (hex):
  [Batch wire format - see CROSS_PLATFORM_TEST_VECTORS.md]

iOS Result: ⬜ Pending
Android Result: ⬜ Pending
Match: ⬜
```

---

## Running the Tests

### iOS

```bash
cd ios
xcodebuild test \
  -workspace SovereignNetworkMobile.xcworkspace \
  -scheme SovereignNetworkMobile \
  -destination 'platform=iOS Simulator,name=iPhone 15' \
  -only-testing:PoUWTests/PoUWParityTests
```

### Android

```bash
cd android
./gradlew testDebugUnitTest \
  --tests "com.sovereignnetworkmobile.pouw.PoUWParityTests"
```

### React Native Bridge

```bash
npm test -- __tests__/pouw/PoUWBridge.test.ts
```

---

## CI/CD Integration

### GitHub Actions

```yaml
name: PoUW Parity Tests

on: [push, pull_request]

jobs:
  ios-parity:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run iOS Parity Tests
        run: |
          cd ios
          xcodebuild test ...
      
  android-parity:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run Android Parity Tests
        run: |
          cd android
          ./gradlew testDebugUnitTest ...
      
  bridge-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run Bridge Tests
        run: npm test -- __tests__/pouw/PoUWBridge.test.ts
```

---

## Known Issues

| Issue | Platform | Severity | Description | Ticket |
|-------|----------|----------|-------------|--------|
| None | - | - | - | - |

---

## Action Items

### Blockers (Must Fix)

- [ ] Complete iOS protobuf generation from pouw.proto
- [ ] Complete Android protobuf generation from pouw.proto
- [ ] Implement iOS PoUWParityTests with real protobuf types
- [ ] Implement Android PoUWParityTests with real protobuf types

### High Priority

- [ ] Add test vector fixtures shared between platforms
- [ ] Set up CI/CD for automated parity testing
- [ ] Document any platform-specific encoding differences

### Medium Priority

- [ ] Performance benchmarking suite
- [ ] Memory usage validation
- [ ] Fuzz testing for serialization

---

## Success Criteria

✅ **All tests passing when:**

1. iOS and Android produce identical protobuf bytes for all test vectors
2. Signatures are deterministic for same inputs on both platforms
3. No nonce collisions in 1M generations on either platform
4. Challenge binding verified on both platforms
5. All enum values match between platforms
6. Wire format is byte-for-byte identical

---

## References

- [CROSS_PLATFORM_TEST_VECTORS.md](./CROSS_PLATFORM_TEST_VECTORS.md) - Detailed test vectors
- [PoUW Protobuf Schema](../../protos/pouw/v1/pouw.proto) - Source of truth
- [POUW_IMPLEMENTATION_PLAN.md](../POUW_IMPLEMENTATION_PLAN.md) - Implementation roadmap
- iOS Tests: `ios/PoUWTests/PoUWParityTests.swift`
- Android Tests: `android/app/src/test/java/com/sovereignnetworkmobile/pouw/PoUWParityTests.kt`
- Bridge Tests: `__tests__/pouw/PoUWBridge.test.ts`

---

## Last Updated

- Date: 2026-02-18
- Phase: 6 (Integration Testing)
- Version: 1.0

**Next Review:** 2026-03-01 or upon completion of Phase 6
