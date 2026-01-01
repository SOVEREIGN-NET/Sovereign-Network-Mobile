# liboqs Usage Guide

This guide explains how to use the liboqs quantum-resistant cryptography module from JavaScript/React Native.

## Table of Contents

1. [Basic Setup](#basic-setup)
2. [KEM Operations](#kem-operations)
3. [Signature Operations](#signature-operations)
4. [Error Handling](#error-handling)
5. [Complete Examples](#complete-examples)

## Basic Setup

First, import the module in your React component or service:

```typescript
import { NativeModules } from "react-native";
import type { LibOQSModule, KEMAlgorithm, SIGAlgorithm } from "../types/liboqs";

const LibOQS: LibOQSModule = NativeModules.LibOQS;
```

Or use the provided helper:

```typescript
import { getLibOQSModule, RECOMMENDED_KEM, RECOMMENDED_SIG } from "../types/liboqs";

const LibOQS = getLibOQSModule();
```

## KEM Operations

KEM (Key Encapsulation Mechanism) is used for establishing shared secrets between two parties.

### 1. Generate Keypair

```typescript
import { RECOMMENDED_KEM } from "../types/liboqs";

const keypair = await LibOQS.kemGenerateKeypair(RECOMMENDED_KEM);
console.log("Public Key:", keypair.publicKey); // Base64 encoded
console.log("Secret Key:", keypair.secretKey); // Base64 encoded
console.log("Public Key Length:", keypair.publicKeyLength); // bytes
```

**Algorithm Options:**
- `"ML-KEM-768"` (NIST standard, recommended)
- `"ML-KEM-1024"` (higher security)
- `"Kyber768"` (older naming)
- `"Kyber1024"` (older naming)
- `"FrodoKEM-640-AES"`, `"FrodoKEM-976-AES"` (alternative)

### 2. Encapsulate (Sender Side)

The encapsulator uses the recipient's public key to create a ciphertext and shared secret:

```typescript
const recipientPublicKey = "... base64 encoded public key ...";

const encapsulation = await LibOQS.kemEncapsulate(
  RECOMMENDED_KEM,
  recipientPublicKey
);

console.log("Ciphertext:", encapsulation.ciphertext); // Send to recipient
console.log("Shared Secret:", encapsulation.sharedSecret); // Keep secret
```

### 3. Decapsulate (Recipient Side)

The recipient uses their secret key to recover the same shared secret:

```typescript
const recipientSecretKey = "... base64 encoded secret key ...";
const ciphertextFromSender = "... base64 encoded ciphertext ...";

const decapsulation = await LibOQS.kemDecapsulate(
  RECOMMENDED_KEM,
  ciphertextFromSender,
  recipientSecretKey
);

console.log("Shared Secret:", decapsulation.sharedSecret);
// Should match: encapsulation.sharedSecret === decapsulation.sharedSecret
```

## Signature Operations

Signature schemes are used for authentication and non-repudiation.

### 1. Generate Keypair

```typescript
import { RECOMMENDED_SIG } from "../types/liboqs";

const keypair = await LibOQS.sigGenerateKeypair(RECOMMENDED_SIG);
console.log("Public Key:", keypair.publicKey); // Base64 encoded
console.log("Secret Key:", keypair.secretKey); // Base64 encoded
```

**Algorithm Options:**
- `"ML-DSA-65"` (NIST standard, recommended)
- `"ML-DSA-87"` (higher security)
- `"Dilithium3"`, `"Dilithium5"` (older naming)
- `"Falcon-512"`, `"Falcon-1024"` (compact signatures)
- `"SPHINCS+-SHA2-128f"`, `"SPHINCS+-SHA2-256f"` (stateless, large signatures)

### 2. Sign a Message

```typescript
import { stringToBase64 } from "../types/liboqs";

const message = "Hello, World!";
const messageBase64 = stringToBase64(message);
const secretKey = "... base64 encoded secret key ...";

const signatureResult = await LibOQS.sigSign(
  RECOMMENDED_SIG,
  messageBase64,
  secretKey
);

console.log("Signature:", signatureResult.signature); // Base64 encoded
console.log("Signature Length:", signatureResult.signatureLength); // bytes
```

### 3. Verify a Signature

```typescript
import { base64ToString } from "../types/liboqs";

const publicKey = "... base64 encoded public key ...";
const signatureBase64 = "... base64 encoded signature ...";
const messageBase64 = "... base64 encoded message ...";

const verificationResult = await LibOQS.sigVerify(
  RECOMMENDED_SIG,
  messageBase64,
  signatureBase64,
  publicKey
);

if (verificationResult.valid) {
  console.log("✓ Signature is valid!");
} else {
  console.log("✗ Signature is invalid!");
}
```

## Error Handling

All methods return promises and may throw errors:

```typescript
try {
  const keypair = await LibOQS.kemGenerateKeypair("ML-KEM-768");
} catch (error: any) {
  console.error("Error:", error.message);
  // Common errors:
  // - "Algorithm not supported: UnknownAlgorithm"
  // - "Invalid key length"
  // - "Invalid input data"
  // - "Memory allocation failed"
}
```

## Complete Examples

### Example 1: KEM Key Exchange (Two Parties)

```typescript
import { getLibOQSModule, stringToBase64 } from "../types/liboqs";

const LibOQS = getLibOQSModule();

// === SETUP (recipient generates keypair) ===
const recipientKeypair = await LibOQS.kemGenerateKeypair("ML-KEM-768");
// recipientKeypair.publicKey is shared with sender
// recipientKeypair.secretKey is kept secret

// === SENDER: Encapsulate ===
const encapsulation = await LibOQS.kemEncapsulate(
  "ML-KEM-768",
  recipientKeypair.publicKey
);
// Send encapsulation.ciphertext to recipient
// Keep encapsulation.sharedSecret secret for encryption

// === RECIPIENT: Decapsulate ===
const decapsulation = await LibOQS.kemDecapsulate(
  "ML-KEM-768",
  encapsulation.ciphertext,
  recipientKeypair.secretKey
);

// Both parties now have the same shared secret!
console.log(
  "Shared secrets match:",
  encapsulation.sharedSecret === decapsulation.sharedSecret
);
```

### Example 2: Digital Signature (Sign and Verify)

```typescript
import {
  getLibOQSModule,
  stringToBase64,
  base64ToString,
  RECOMMENDED_SIG,
} from "../types/liboqs";

const LibOQS = getLibOQSModule();

// === KEY SETUP ===
const signerKeypair = await LibOQS.sigGenerateKeypair(RECOMMENDED_SIG);
// signerKeypair.publicKey can be shared publicly
// signerKeypair.secretKey must be kept secret

// === SIGNING ===
const message = "Important document content";
const messageBase64 = stringToBase64(message);

const signatureResult = await LibOQS.sigSign(
  RECOMMENDED_SIG,
  messageBase64,
  signerKeypair.secretKey
);

// Send: message + signature + publicKey to recipient

// === VERIFICATION ===
const verificationResult = await LibOQS.sigVerify(
  RECOMMENDED_SIG,
  messageBase64,
  signatureResult.signature,
  signerKeypair.publicKey
);

if (verificationResult.valid) {
  console.log("✓ Message is authenticated!");
} else {
  console.log("✗ Signature invalid - message tampered!");
}
```

### Example 3: Check Available Algorithms

```typescript
import { getLibOQSModule } from "../types/liboqs";

const LibOQS = getLibOQSModule();

const supportedKEMs = await LibOQS.getSupportedKEMAlgorithms();
const supportedSIGs = await LibOQS.getSupportedSIGAlgorithms();
const version = await LibOQS.getVersion();

console.log("Supported KEMs:", supportedKEMs);
console.log("Supported Signatures:", supportedSIGs);
console.log("liboqs version:", version);
```

## Performance Notes

### Expected Latencies (on iPhone 12+)

**KEM Operations:**
- ML-KEM-768 keypair generation: 50-100ms
- ML-KEM-768 encapsulate: 30-60ms
- ML-KEM-768 decapsulate: 30-60ms

**Signature Operations:**
- ML-DSA-65 keypair generation: 50-150ms
- ML-DSA-65 signing: 100-200ms
- ML-DSA-65 verification: 50-100ms

### Tips for Performance

1. **Cache keypairs**: Generate keypairs once and reuse them
2. **Batch operations**: If doing multiple operations, consider batching
3. **Use Release builds**: Debug builds are 2-3x slower
4. **Choose algorithms wisely**: Falcon is faster than SPHINCS+, Kyber is faster than FrodoKEM

## Security Notes

### Key Storage

This module only handles key generation and usage. For persistent storage:

- **Secret keys**: Use `react-native-keychain` for secure storage
- **Public keys**: Can be stored normally (not sensitive)

Example:

```typescript
import * as Keychain from "react-native-keychain";

const keypair = await LibOQS.kemGenerateKeypair("ML-KEM-768");

// Store secret key securely
await Keychain.setGenericPassword("oqs_secret_kem", keypair.secretKey);

// Later, retrieve it
const { password: secretKey } = await Keychain.getGenericPassword();
```

### Data Sensitivity

- **Secret keys**: Always treated as sensitive data
- **Shared secrets**: Keep confidential, use for encryption
- **Signatures**: Provide authentication but don't contain sensitive data
- **Public keys**: Can be distributed openly

## Troubleshooting

### "LibOQS native module not found"

- Ensure iOS build linked liboqs.xcframework
- Verify bridging header includes `#import <oqs/oqs.h>`
- Check that all wrapper files are added to Xcode project

### "Algorithm not supported"

- Verify algorithm name spelling (case-sensitive)
- Check supported algorithms with `getSupportedKEMAlgorithms()`
- Ensure algorithm was enabled during liboqs build

### Slow Operations

- Use Release builds (not Debug)
- Check device has sufficient free memory
- Consider algorithm selection (some are faster than others)

## References

- [liboqs GitHub](https://github.com/open-quantum-safe/liboqs)
- [liboqs API Docs](https://openquantumsafe.org/liboqs/api/)
- [NIST Post-Quantum Cryptography](https://csrc.nist.gov/projects/post-quantum-cryptography/)
