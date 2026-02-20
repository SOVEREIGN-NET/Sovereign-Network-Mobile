# PoUW Cross-Platform Test Vectors

> **CRITICAL:** These test vectors ensure iOS and Android produce identical receipts for the same input. Any discrepancy breaks the reward system.

## Overview

This document defines canonical test vectors that both platforms must match exactly. Each test vector includes:
- Input parameters (content IDs, bytes, nonces, etc.)
- Expected serialized output bytes (hex)
- Protobuf wire format expectations

## Test Vector Format

All byte arrays are shown in hexadecimal format. Multi-byte values use **big-endian** encoding unless otherwise specified.

---

## Test Vector 1: Simple Hash Receipt

Basic receipt with `PROOF_HASH` proof type.

### Input Parameters

| Field | Value (hex) | Description |
|-------|-------------|-------------|
| `version` | `0x00000001` | Protocol version 1 (uint32) |
| `task_id` | `0x01020304` | 4-byte task identifier |
| `client_did` | `"did:zhtp:test123"` | UTF-8 string |
| `proof_type` | `0x00000000` | PROOF_HASH = 0 |
| `bytes_verified` | `0x0000000000000005` | 5 bytes verified (uint64) |
| `result_ok` | `true` | Verification succeeded |
| `started_at` | `0x0000018B4E7B6D80` | 1700000000000 ms |
| `finished_at` | `0x0000018B4E7B6D85` | 1700000000005 ms |
| `challenge_nonce` | `0xaabbccdd11223344` | 8-byte challenge binding |
| `receipt_nonce` | `0x1111111122222222` | 8-byte unique nonce |
| `aux` | (empty) | No auxiliary data |

### Expected Receipt Bytes (hex)

```
08 01              // version: 1 (field 1, varint)
12 04 01 02 03 04  // task_id: [0x01, 0x02, 0x03, 0x04] (field 2, length-delimited)
1a 10 64 69 64 3a 7a 68 74 70 3a 74 65 73 74 31 32 33  // client_did: "did:zhtp:test123" (field 3)
20 00              // proof_type: 0 (PROOF_HASH) (field 4, varint)
28 05              // bytes_verified: 5 (field 5, varint)
30 01              // result_ok: true (field 6, varint)
38 80 B4 D7 E7 4E 8B 01  // started_at: 1700000000000 (field 7, varint)
40 85 B4 D7 E7 4E 8B 01  // finished_at: 1700000000005 (field 8, varint)
4a 08 AA BB CC DD 11 22 33 44  // challenge_nonce (field 9)
52 08 11 11 11 11 22 22 22 22  // receipt_nonce (field 10)
```

**Full hex string:**
```
08011204010203041a106469643a7a6874703a746573743132332000280530013880b4d7e74e8b014085b4d7e74e8b014a08aabbccdd1122334452081111111122222222
```

---

## Test Vector 2: Merkle Receipt

Receipt with `PROOF_MERKLE` proof type and auxiliary Merkle proof data.

### Input Parameters

| Field | Value (hex) | Description |
|-------|-------------|-------------|
| `version` | `0x00000001` | Protocol version 1 |
| `task_id` | `0xabcdef` | 3-byte task identifier |
| `client_did` | `"did:zhtp:merkle_test"` | UTF-8 string |
| `proof_type` | `0x00000001` | PROOF_MERKLE = 1 |
| `bytes_verified` | `0x0000000000000400` | 1024 bytes |
| `result_ok` | `true` | Verification succeeded |
| `started_at` | `0x0000018B4E7B7000` | 1700000010000 ms |
| `finished_at` | `0x0000018B4E7B7020` | 1700000010032 ms |
| `challenge_nonce` | `0x00112233445566778899aabbccdd` | 14-byte nonce |
| `receipt_nonce` | `0xdeadbeefcafebabe` | 8-byte unique nonce |
| `aux.merkle_root` | `0x11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff` | 32 bytes |
| `aux.proof_digest` | `0xaabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd11223344` | 32 bytes |

### Expected Receipt Bytes (hex)

```
08 01                    // version: 1
12 03 AB CD EF           // task_id: [0xab, 0xcd, 0xef]
1a 14 64 69 64 3a 7a 68 74 70 3a 6d 65 72 6b 6c 65 5f 74 65 73 74  // "did:zhtp:merkle_test"
20 01                    // proof_type: 1 (PROOF_MERKLE)
28 80 08                 // bytes_verified: 1024 (varint)
30 01                    // result_ok: true
38 80 E0 F7 E7 4E 8B 01  // started_at: 1700000010000
40 A0 E0 F7 E7 4E 8B 01  // finished_at: 1700000010032
4a 0E 00 11 22 33 44 55 66 77 88 99 AA BB CC DD  // challenge_nonce
52 08 DE AD BE EF CA FE BA BE  // receipt_nonce
5a 42                    // aux (field 11, length-delimited, 66 bytes)
  0a 20 11 22 33 44 55 66 77 88 99 00 AA BB CC DD EE FF 11 22 33 44 55 66 77 88 99 00 AA BB CC DD EE FF  // merkle_root
  12 20 AA BB CC DD 11 22 33 44 AA BB CC DD 11 22 33 44 AA BB CC DD 11 22 33 44 AA BB CC DD 11 22 33 44  // proof_digest
```

**Full hex string:**
```
08011203abcdef1a146469643a7a6874703a6d65726b6c655f74657374200128800830013880e0f7e74e8b0140a0e0f7e74e8b014a0e00112233445566778899aabbccdd5208deadbeefcafebabe5a420a2011223344556677889900aabbccddeeff11223344556677889900aabbccddeeff12aabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd11223344
```

---

## Test Vector 3: Batch Serialization

Receipt batch containing two signed receipts.

### Input Parameters

**Batch Header:**
| Field | Value | Description |
|-------|-------|-------------|
| `version` | `1` | Protocol version |
| `client_did` | `"did:zhtp:batch_client"` | UTF-8 string |
| `batch_nonce` | `0xaabbccdd` | 4-byte batch nonce |

**Receipt 1 (from Test Vector 1):**
- Same as TV1 with signature added

**Receipt 2 (Hash receipt variant):**
| Field | Value |
|-------|-------|
| `version` | `1` |
| `task_id` | `0x55667788` |
| `client_did` | `"did:zhtp:test123"` |
| `proof_type` | `PROOF_HASH` |
| `bytes_verified` | `10` |
| `result_ok` | `true` |
| `started_at` | `1700000000000` |
| `finished_at` | `1700000000010` |
| `challenge_nonce` | `0xaabbccdd11223344` |
| `receipt_nonce` | `0x3333333344444444` |

**Signatures:**
Both receipts use `ED25519` scheme with placeholder signatures:
- Receipt 1 signature: `0x` followed by 64 zero bytes
- Receipt 2 signature: `0x` followed by 64 `0xFF` bytes

### Expected Batch Bytes (hex)

```
08 01                    // batch version: 1
12 16 64 69 64 3a 7a 68 74 70 3a 62 61 74 63 68 5f 63 6c 69 65 6e 74  // "did:zhtp:batch_client"
1a 04 AA BB CC DD        // batch_nonce
22 7B                    // signed_receipt[0] (123 bytes)
  0a 4c                  // receipt (76 bytes)
    08 01                // version
    12 04 01 02 03 04    // task_id
    1a 10 ...            // client_did
    20 00                // proof_type: PROOF_HASH
    28 05                // bytes_verified: 5
    30 01                // result_ok: true
    38 ...               // started_at
    40 ...               // finished_at
    4a ...               // challenge_nonce
    52 ...               // receipt_nonce
  10 00                  // sig_scheme: ED25519
  1a 40 00 00 ... 00     // 64-byte signature (zeros)
22 7B                    // signed_receipt[1] (123 bytes)
  // Similar structure for receipt 2
  1a 40 FF FF ... FF     // 64-byte signature (0xFFs)
```

**Full hex string (abbreviated):**
```
080112166469643a7a6874703a62617463685f636c69656e741a04aabbccdd227b0a4c08011204010203041a106469643a7a6874703a746573743132332000280530013880b4d7e74e8b014085b4d7e74e8b014a08aabbccdd112233445208111111112222222210001a4000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000227b0a4c08011204556677881a106469643a7a6874703a746573743132332000280a30013880b4d7e74e8b01408ab4d7e74e8b014a08aabbccdd112233445208333333334444444410001a40ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
```

---

## Test Vector 4: Challenge Token

Canonical challenge token for testing challenge binding.

### Input Parameters

| Field | Value (hex) | Description |
|-------|-------------|-------------|
| `version` | `1` | Token version |
| `node_id` | `0x00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff` | 32 bytes |
| `task_id` | `0x0102030405060708090a0b0c0d0e0f10` | 16 bytes |
| `challenge_nonce` | `0xcafebabedeadbeef` | 8 bytes |
| `issued_at` | `1700000000` | Unix timestamp (seconds) |
| `expires_at` | `1700003600` | Expires in 1 hour |
| `policy.max_receipts` | `100` | Max 100 receipts |
| `policy.max_bytes_total` | `1048576` | 1 MB total |
| `policy.min_bytes_per_receipt` | `1024` | 1 KB minimum |
| `policy.allowed_proof_types` | `[0, 1]` | HASH and MERKLE |
| `node_signature` | `0x` + 64 bytes | Ed25519 signature placeholder |

### Expected Challenge Token Bytes (hex)

```
08 01                    // version
12 20 00 11 22 33 44 55 66 77 88 99 AA BB CC DD EE FF 00 11 22 33 44 55 66 77 88 99 AA BB CC DD EE FF  // node_id
1a 10 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F 10  // task_id
22 08 CA FE BA BE DE AD BE EF  // challenge_nonce
28 80 89 FA 65           // issued_at: 1700000000 (varint)
30 80 F5 FB 65           // expires_at: 1700003600 (varint)
3a 0f                    // policy (15 bytes)
  08 64                  // max_receipts: 100
  10 80 80 40            // max_bytes_total: 1048576
  18 80 08               // min_bytes_per_receipt: 1024
  22 02 00 01            // allowed_proof_types: [0, 1]
42 40                    // node_signature (64 bytes)
  00 00 ... (64 zeros)
```

---

## Test Vector 5: Edge Cases

### 5.1 Empty Receipt Fields

Receipt with minimal required fields:
- Empty `aux`
- Zero `bytes_verified`
- `result_ok: false`

**Expected bytes:**
```
080112001a00...30003800...
```

### 5.2 Maximum Values

Receipt with maximum uint64 values:
- `bytes_verified: 0xFFFFFFFFFFFFFFFF`
- `started_at: 0x7FFFFFFFFFFFFFFF` (max positive int64)

**Expected bytes (varint encoded):**
```
28ffffffffffffffffff0138ffffffffffffffff7f...
```

### 5.3 Unicode DID

Receipt with Unicode characters in DID:
- `client_did: "did:zhtp:测试🧪"`

**Expected bytes (UTF-8):**
```
1a166469643a7a6874703ae6b58be8af95f09fa7aa
```

---

## Verification Procedures

### iOS Verification

```swift
// 1. Build receipt from test vector
let receipt = PoUWReceipt(
    version: 1,
    taskId: Data([0x01, 0x02, 0x03, 0x04]),
    // ... other fields
)

// 2. Serialize to protobuf
let serialized = try receipt.serializedData()

// 3. Compare to expected hex
let expectedHex = "0801120401020304..."
let actualHex = serialized.map { String(format: "%02x", $0) }.joined()
XCTAssertEqual(actualHex, expectedHex)
```

### Android Verification

```kotlin
// 1. Build receipt from test vector
val receipt = Receipt.newBuilder()
    .setVersion(1)
    .setTaskId(ByteString.copyFrom(byteArrayOf(0x01, 0x02, 0x03, 0x04)))
    // ... other fields
    .build()

// 2. Serialize to protobuf
val serialized = receipt.toByteArray()

// 3. Compare to expected hex
val expectedHex = "0801120401020304..."
val actualHex = serialized.joinToString("") { "%02x".format(it) }
assertEquals(expectedHex, actualHex)
```

---

## Cross-Platform Requirements

1. **Identical Protobuf Serialization**: Same message → same bytes on both platforms
2. **Same Field Numbers**: protobuf field tags must match
3. **Same Wire Types**: Varint, fixed64, length-delimited consistency
4. **Deterministic Ordering**: Fields in tag order (1, 2, 3, ...)
5. **Same UTF-8 Handling**: Unicode DIDs encoded identically

---

## Test Vector Checksum

For automated verification, here are SHA-256 checksums of the expected byte sequences:

| Test Vector | Expected SHA-256 |
|-------------|------------------|
| TV1: Simple Hash | `a1b2c3d4...e5f6` (placeholder) |
| TV2: Merkle | `b2c3d4e5...f6a7` (placeholder) |
| TV3: Batch | `c3d4e5f6...a7b8` (placeholder) |
| TV4: Challenge | `d4e5f6a7...b8c9` (placeholder) |

> **Note:** Replace placeholders with actual computed checksums after finalizing protobuf generation.

---

## References

- [Protobuf Encoding Guide](https://protobuf.dev/programming-guides/encoding/)
- [PoUW Protobuf Schema](../../protos/pouw/v1/pouw.proto)
- [PARITY_MATRIX.md](./PARITY_MATRIX.md)
