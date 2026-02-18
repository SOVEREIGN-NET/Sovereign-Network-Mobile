# PoUW Security Checklist

This checklist must be completed before any production release of the PoUW mobile client.

## Pre-Release Requirements

### Cryptography

- [ ] **Dilithium5 signatures verified**
  - Signature generation produces valid signatures
  - Signature verification accepts valid signatures
  - Invalid signatures are rejected
  - Performance meets requirements (< 100ms per sign/verify)

- [ ] **Hash algorithms aligned (iOS/Android)**
  - Both platforms use identical hash algorithm for CID verification
  - Document the chosen algorithm (SHA-256 or Blake3)
  - Cross-platform verification tests pass

- [ ] **Protobuf deterministic serialization verified**
  - Same receipt data produces identical serialized bytes
  - Test with multiple message sizes and field combinations
  - Document any platform-specific protobuf settings

- [ ] **No cryptographic code in RN layer**
  - All crypto operations in Rust FFI only
  - React Native layer only calls native modules
  - No key material passed through RN bridge

### Key Management

- [ ] **Private keys never exported**
  - Verify no `exportPrivateKey` methods exist
  - Check that Rust FFI returns only public keys
  - Memory analysis shows no key leakage

- [ ] **Key rotation tested**
  - Rotation procedure documented
  - Rotation completes without data loss
  - Old receipts remain valid after rotation
  - Emergency rotation procedure tested

- [ ] **Secure Enclave/Keystore usage verified**
  - iOS: Keys have `kSecAttrTokenIDSecureEnclave` attribute
  - Android: Keys have `setUserAuthenticationRequired` where appropriate
  - Keys are non-exportable in key properties

- [ ] **No key material in logs**
  - Search logs for private key fragments
  - Verify no hex-encoded key material
  - Check crash reports for key leakage

### Network Security

- [ ] **QUIC-only transport**
  - No HTTP/HTTPS fallback code paths
  - QUIC configuration validated
  - Connection fails gracefully if QUIC unavailable

- [ ] **TLS 1.3 configured**
  - Minimum TLS version set to 1.3
  - Strong cipher suites only
  - No deprecated protocols enabled

- [ ] **Certificate pinning implemented (optional but recommended)**
  - Pinning configuration documented
  - Backup pins configured
  - Certificate rotation procedure documented

- [ ] **No plaintext communication**
  - All network traffic encrypted
  - No sensitive data in URL parameters
  - No debug endpoints in production

### Input Validation

- [ ] **Protobuf bounds checking**
  - Maximum message size enforced
  - Field length limits validated
  - Nested message depth limited

- [ ] **Nonce format validation**
  - Length 16-32 bytes enforced
  - Format validated (base64/url-safe)
  - Uniqueness verified before use

- [ ] **DID format validation**
  - Pattern: `^did:zhtp:[a-zA-Z0-9]+$`
  - Validation on receipt creation
  - Validation on receipt verification

- [ ] **Max size limits enforced**
  - Receipt queue size limited
  - Individual receipt size limited (< 1MB)
  - Batch submission size limited

### Privacy

- [ ] **No URLs in receipts**
  - Review receipt schema for URL fields
  - Verify URL components not included
  - Check query parameters not logged

- [ ] **No query strings in receipts**
  - No GET parameters in work evidence
  - No URL-encoded data in receipts
  - No referrer information included

- [ ] **No content data in receipts**
  - Only proof of work, not actual content
  - Content hashes only, not content itself
  - Metadata minimized

- [ ] **PII scan passed**
  - Run automated PII detection
  - Manual review of receipt fields
  - Document any required data retention

### Audit Trail

- [ ] **Rejection reasons logged**
  - Invalid signatures logged
  - Timeout events logged
  - Network failures logged
  - No sensitive data in rejection logs

- [ ] **Disputes logged**
  - Dispute initiation logged
  - Dispute resolution logged
  - Evidence preserved per policy

- [ ] **No sensitive data in logs**
  - Review all log statements
  - Redact keys, tokens, PII
  - Use structured logging with levels

- [ ] **Log rotation configured**
  - Maximum log age configured
  - Maximum log size configured
  - Secure log deletion implemented

### Code Quality

- [ ] **Static analysis passed**
  - SwiftLint (iOS) - no critical warnings
  - KtLint/detekt (Android) - no critical warnings
  - ESLint (TypeScript) - no security warnings

- [ ] **Dependency scan passed**
  - No known CVEs in dependencies
  - liboqs version up to date
  - Protobuf libraries up to date

- [ ] **Memory safety verified**
  - Rust FFI code reviewed
  - No unsafe blocks without justification
  - Valgrind/AddressSanitizer clean

- [ ] **Fuzz testing completed**
  - Protobuf deserialization fuzzed
  - Signature verification fuzzed
  - Receipt parsing fuzzed

### Testing

- [ ] **Unit test coverage > 80%**
  - Core crypto operations
  - Receipt creation/validation
  - Queue management

- [ ] **Integration tests pass**
  - End-to-end receipt flow
  - Network error handling
  - Key rotation flow

- [ ] **Security tests pass**
  - Replay attack prevention
  - Signature verification
  - Input validation

- [ ] **Performance tests pass**
  - Signature generation < 100ms
  - Receipt submission < 5s
  - Queue processing handles 1000+ items

## Sign-Off Required

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Security Lead | | | |
| Engineering Lead | | | |
| QA Lead | | | |
| Product Manager | | | |

## Additional Verification

- [ ] **Security Team Review** - Formal security review completed
- [ ] **Penetration Test Results** - External pen test passed or findings remediated
- [ ] **Code Review** - 2+ engineers reviewed all security-critical code
- [ ] **Final Approval** - Release manager sign-off obtained

## Post-Release Monitoring

- [ ] **Error tracking configured** - Sentry/similar configured for production
- [ ] **Rate limit monitoring** - Alerts for excessive challenge requests
- [ ] **Anomaly detection** - ML-based anomaly detection for receipt patterns
- [ ] **Incident response plan** - Documented procedures for security incidents

## Notes

- This checklist should be reviewed and updated regularly
- Any exceptions must be documented with risk assessment
- Security issues take priority over feature releases
- Emergency releases may use abbreviated checklist with post-hoc verification
