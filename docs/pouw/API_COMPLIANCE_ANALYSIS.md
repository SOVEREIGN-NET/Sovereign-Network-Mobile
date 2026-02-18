# PoUW API Compliance Analysis

## Executive Summary

**Status**: ⚠️ PARTIAL COMPLIANCE - Updates Required

The current implementation has several mismatches with the API specification that need to be addressed before node integration.

---

## API Endpoint Compliance

### 1. GET /pouw/challenge

| Aspect | Spec | Implementation | Status |
|--------|------|----------------|--------|
| **Path** | `/pouw/challenge` | `/api/v1/pouw/challenge` | ❌ MISMATCH |
| **Method** | GET | iOS: POST, Android: GET | ⚠️ iOS INCORRECT |
| **Query Params** | `cap=hash,merkle,signature` | Not supported | ❌ MISSING |
| **Response Format** | `{token, expires_at}` | Different structure | ❌ MISMATCH |

**Spec Response:**
```json
{
  "token": "base64(ChallengeToken)",
  "expires_at": 1760000030
}
```

**iOS Expects:**
```json
{
  "challenge": "base64",
  "expires_at": 1234567890,
  "nonce": "base64",
  "signature": "base64"
}
```

**Android Expects:**
```json
{
  "nonce": "hex",
  "difficulty": 5,
  "expires_at": 1234567890
}
```

**Required Changes:**
1. Update endpoint path from `/api/v1/pouw/challenge` → `/pouw/challenge`
2. Change iOS to use GET instead of POST
3. Add `cap` query parameter support
4. Parse response from `token` field (base64-encoded protobuf ChallengeToken)

---

### 2. POST /pouw/submit

| Aspect | Spec | Implementation | Status |
|--------|------|----------------|--------|
| **Path** | `/pouw/submit` | `/api/v1/pouw/submit` | ❌ MISMATCH |
| **Method** | POST | POST | ✅ CORRECT |
| **Request Format** | See below | Different structure | ❌ MISMATCH |
| **Response Format** | `{accepted, rejected}` | Different structure | ⚠️ PARTIAL |

**Spec Request:**
```json
{
  "version": 1,
  "client_did": "did:zhtp:alice",
  "receipts": [
    {
      "receipt": {
        "version": 1,
        "task_id": "hex",
        "client_did": "did:zhtp:alice",
        "client_node_id": "hex-32-bytes",
        "provider_id": "hex",
        "content_id": "hex",
        "proof_type": "hash",
        "bytes_verified": 1024,
        "result_ok": true,
        "started_at": 1760000010,
        "finished_at": 1760000020,
        "receipt_nonce": "hex-16-bytes",
        "challenge_nonce": "hex"
      },
      "sig_scheme": "ed25519",
      "signature": "hex"
    }
  ]
}
```

**iOS Sends:**
```json
{
  "did": "did:zhtp:...",
  "challenge": "base64",
  "receipts": [
    {
      "nonce": "base64",
      "task_id": "base64",
      "signed_data": "base64"
    }
  ]
}
```

**Android Sends:**
```json
{
  "receipts": [
    {
      "task_id": "hex",
      "receipt_nonce": "hex",
      "signed_data": "base64"
    }
  ],
  "count": N
}
```

**Required Changes:**
1. Update endpoint path from `/api/v1/pouw/submit` → `/pouw/submit`
2. Add `version` field to request
3. Include full `client_did` at top level
4. Expand receipt structure with all spec fields:
   - `client_node_id` (32 bytes)
   - `provider_id` (optional)
   - `content_id`
   - `bytes_verified`
   - `result_ok` (boolean)
   - `started_at` / `finished_at` (timestamps)
   - `challenge_nonce` (from challenge token)
5. Add `sig_scheme` field (`ed25519` or `dilithium5`)
6. Separate signature from receipt data

---

### 3. GET /pouw/health

| Aspect | Spec | Implementation | Status |
|--------|------|----------------|--------|
| **Path** | `/pouw/health` | Not implemented | ❌ MISSING |
| **Response** | `{status: ok}` | N/A | ❌ MISSING |

**Required:** Add health check endpoint client support.

---

## Protobuf Schema Compliance

### Receipt Message

| Field | Spec | Proto | Status |
|-------|------|-------|--------|
| `version` | ✅ | ✅ | ✅ Match |
| `task_id` | ✅ | ✅ | ✅ Match |
| `client_did` | ✅ | ✅ | ✅ Match |
| `client_node_id` | ✅ | ❌ | ❌ MISSING IN PROTO |
| `provider_id` | ✅ | ❌ | ❌ MISSING IN PROTO |
| `content_id` | ✅ | ❌ | ❌ MISSING IN PROTO |
| `proof_type` | ✅ | ✅ | ✅ Match |
| `bytes_verified` | ✅ | ✅ | ✅ Match |
| `result_ok` | ✅ | ✅ | ✅ Match |
| `started_at` | ✅ | ✅ | ✅ Match |
| `finished_at` | ✅ | ✅ | ✅ Match |
| `receipt_nonce` | ✅ | ✅ | ✅ Match |
| `challenge_nonce` | ✅ | ✅ | ✅ Match |

**Required Changes to Proto:**
```protobuf
message Receipt {
  // ... existing fields ...
  
  // MISSING FIELDS TO ADD:
  bytes client_node_id = 12;  // 32 bytes
  bytes provider_id = 13;     // optional
  bytes content_id = 14;      // content identifier
}
```

---

## Trigger Points (When Actions Are Called)

### 1. Challenge Request Trigger

**When**: Called during `flushReceipts()` before submitting batch

**iOS Flow:**
```swift
// PoUWController.swift line 152
let challenge = try await submissionClient.fetchChallenge(capabilities: ["pouw_v1"])
```

**Android Flow:**
```kotlin
// PoUWController.kt - before submitBatch
val challenge = submissionClient.requestChallenge()
```

**Trigger Conditions:**
- Receipt queue has pending receipts
- `flushReceipts()` is called (manual or scheduled)
- Challenge is expired or not available

**Frequency**: Max 50 per minute (rate limited)

---

### 2. Submit Request Trigger

**When**: Called during `flushReceipts()` after acquiring challenge

**iOS Flow:**
```swift
// PoUWController.swift line 167
response = try await submissionClient.submitBatch(batch)
```

**Android Flow:**
```kotlin
// PoUWController.kt
submissionClient.submitBatch(pendingReceipts)
```

**Trigger Conditions:**
- Challenge token acquired and valid
- Receipt batch created (1-100 receipts)
- Rate limit not exceeded

**Frequency**: Max 50 per minute, max 100 receipts per batch

---

### 3. Verify and Record Trigger

**When**: Called when content is verified

**iOS/Android:**
```swift
// Called by app when content is accessed/verified
PoUWController.shared.verifyAndRecord(contentId: Data, bytes: Data, providerId: Data?)
```

**Trigger Conditions:**
- Content is accessed by user
- Content hash verification succeeds
- Identity is available

**Note**: This is triggered by the app, not automatically

---

## Rate Limiting Compliance

| Limit | Spec | Implementation | Status |
|-------|------|----------------|--------|
| Per-IP | 100 req/min | Not enforced (server-side) | ⚠️ Server only |
| Per-DID | 50 req/min | ✅ 50 req/60s | ✅ Match |
| Batch size | 100 receipts | ✅ 100 max | ✅ Match |

---

## Required Fixes Summary

### Critical (Must Fix)

1. **Update API endpoints**:
   - `/api/v1/pouw/challenge` → `/pouw/challenge`
   - `/api/v1/pouw/submit` → `/pouw/submit`

2. **Fix iOS HTTP method**:
   - Change `fetchChallenge` from POST to GET

3. **Add query parameter support**:
   - `cap=hash,merkle,signature`

4. **Update proto schema**:
   - Add `client_node_id`, `provider_id`, `content_id` to Receipt

5. **Align request/response parsing**:
   - Parse `token` from challenge response (base64 protobuf)
   - Build spec-compliant submit request
   - Parse spec-compliant submit response

### Medium Priority

6. **Add health check endpoint support**
7. **Add `sig_scheme` field tracking** (ed25519 vs dilithium5)
8. **Separate signature from signed receipt data**

### Testing Checklist

- [ ] Challenge request returns correct format
- [ ] Submit request accepts spec format
- [ ] Submit response parsed correctly
- [ ] Rate limiting works at 50 req/min
- [ ] Batch size limited to 100
- [ ] Full E2E flow works with node

---

## Files Requiring Updates

1. `protos/pouw/v1/pouw.proto` - Add missing fields
2. `ios/PoUW/SubmissionClient.swift` - Update endpoints and parsing
3. `ios/PoUW/PoUWController.swift` - Update receipt building
4. `android/app/src/main/java/.../pouw/SubmissionClient.kt` - Update endpoints and parsing
5. `android/app/src/main/java/.../pouw/PoUWController.kt` - Update receipt building
