# PoUW Threat Model

## Overview

This document describes the threat model for the Proof of Useful Work (PoUW) mobile client implementation. It identifies assets, threats, mitigations, and residual risks.

## Assets

### A1: Private Signing Keys
- **Description**: Dilithium5 private keys used for signing receipts
- **Location**: Secure Enclave (iOS), Android Keystore (Android), Rust FFI layer
- **Criticality**: Critical - compromise allows fake receipt generation
- **Protection**: Hardware-backed storage, never exported

### A2: Receipt Queue (Unsent Receipts)
- **Description**: Pending work receipts awaiting submission
- **Location**: Local device storage (encrypted)
- **Criticality**: High - tampering could affect reputation
- **Protection**: Signed receipts provide tamper evidence

### A3: Challenge Tokens
- **Description**: Server-provided tokens for work proof
- **Location**: In-memory only
- **Criticality**: Medium - replay attacks possible if compromised
- **Protection**: Time-bound, single-use, nonce binding

### A4: Device Identity (DID)
- **Description**: Decentralized identifier for the device
- **Location**: Generated at first launch
- **Criticality**: Medium - identifies device on network
- **Protection**: Cryptographically derived from public key

## Threats

### T1: Key Extraction
- **Threat**: Attacker extracts private key from device
- **Attack Vectors**: 
  - Memory dump analysis
  - Hardware debugging (JTAG/SWD)
  - OS-level privilege escalation
- **Mitigation**: 
  - Keys stored in hardware security modules (Secure Enclave/Keystore)
  - Rust FFI layer prevents key export
  - No key material in application memory
- **Residual Risk**: Low
- **Testing**: Hardware security module integration verified

### T2: Receipt Replay
- **Threat**: Attacker replays old receipts to inflate reputation
- **Attack Vectors**:
  - Network interception and replay
  - Local storage manipulation
- **Mitigation**:
  - Nonce uniqueness enforced (database UNIQUE constraint)
  - Challenge binding (receipt tied to specific challenge)
  - Timestamp validation
- **Residual Risk**: Very Low
- **Testing**: Replay attack simulation performed

### T3: Fake Receipts
- **Threat**: Attacker creates invalid/fraudulent receipts
- **Attack Vectors**:
  - Signature forgery
  - Protocol manipulation
- **Mitigation**:
  - Dilithium5 signatures (post-quantum secure)
  - Node-side validation of all receipt fields
  - Challenge-response protocol prevents pre-computation
- **Residual Risk**: Very Low
- **Testing**: Signature verification fuzz testing

### T4: Queue Tampering
- **Threat**: Attacker modifies pending receipts in queue
- **Attack Vectors**:
  - Local storage access
  - Backup/restore attacks
- **Mitigation**:
  - All receipts cryptographically signed
  - Tampering detected via signature verification
  - Queue integrity validated on load
- **Residual Risk**: Low
- **Testing**: Queue integrity verification tests

### T5: Man-in-the-Middle
- **Threat**: Attacker intercepts node communication
- **Attack Vectors**:
  - DNS hijacking
  - Rogue certificate authorities
  - Network spoofing
- **Mitigation**:
  - QUIC-only transport (no fallback to TCP/HTTP)
  - TLS 1.3 with strong cipher suites
  - Optional certificate pinning
- **Residual Risk**: Low
- **Testing**: MITM proxy testing performed

### T6: Denial of Service
- **Threat**: Attacker prevents legitimate work submission
- **Attack Vectors**:
  - Network flooding
  - Resource exhaustion
  - Queue overflow
- **Mitigation**:
  - Rate limiting on challenges and submissions
  - Queue size limits with automatic pruning
  - Exponential backoff on failures
- **Residual Risk**: Low
- **Testing**: Load testing and resource exhaustion tests

### T7: Timing Attacks
- **Threat**: Attacker infers key material from timing information
- **Attack Vectors**:
  - Side-channel analysis of signature operations
- **Mitigation**:
  - Constant-time implementations in liboqs
  - Rust FFI layer minimizes timing variations
- **Residual Risk**: Very Low
- **Testing**: Timing analysis review

### T8: Implementation Bugs
- **Threat**: Vulnerabilities in cryptographic implementations
- **Attack Vectors**:
  - Buffer overflows
  - Integer overflows
  - Protobuf parsing vulnerabilities
- **Mitigation**:
  - Memory-safe Rust for cryptographic operations
  - Protobuf bounds checking
  - Regular dependency updates
- **Residual Risk**: Low
- **Testing**: Static analysis, fuzz testing

## Attack Scenarios

### Scenario 1: Compromised Device
**Description**: Physical device access by attacker
**Impact**: High (key extraction, receipt manipulation)
**Mitigation**: Hardware-backed keys resist extraction
**Recovery**: Key rotation from backup phrase

### Scenario 2: Malicious Node
**Description**: Compromised or malicious network node
**Impact**: Medium (receipt rejection, data leakage)
**Mitigation**: Multi-node validation, no sensitive data in receipts
**Recovery**: Switch to different node

### Scenario 3: Network Eavesdropping
**Description**: Passive network monitoring
**Impact**: Low (receipt metadata visible)
**Mitigation**: QUIC encryption, no PII in receipts
**Recovery**: N/A (already mitigated)

### Scenario 4: Supply Chain Attack
**Description**: Compromised dependencies or build process
**Impact**: Critical (backdoored cryptographic libraries)
**Mitigation**: Dependency pinning, reproducible builds
**Recovery**: Rebuild from verified sources

## Risk Assessment Matrix

| Threat | Likelihood | Impact | Risk Level | Status |
|--------|------------|--------|------------|--------|
| T1: Key Extraction | Low | Critical | Medium | Mitigated |
| T2: Receipt Replay | Low | High | Low | Mitigated |
| T3: Fake Receipts | Very Low | Critical | Low | Mitigated |
| T4: Queue Tampering | Low | High | Low | Mitigated |
| T5: MITM | Low | High | Low | Mitigated |
| T6: DoS | Medium | Medium | Medium | Partially Mitigated |
| T7: Timing Attacks | Very Low | Critical | Very Low | Mitigated |
| T8: Implementation Bugs | Low | Critical | Medium | Ongoing |

## Security Assumptions

1. **Hardware Security**: Secure Enclave (iOS) and Keystore (Android) provide adequate protection
2. **Cryptographic Primitives**: Dilithium5 provides post-quantum security
3. **Network Protocol**: QUIC + TLS 1.3 provides sufficient transport security
4. **Node Behavior**: Majority of network nodes are honest
5. **Implementation**: Rust FFI implementation is free of memory safety bugs

## Glossary

- **DID**: Decentralized Identifier
- **PoUW**: Proof of Useful Work
- **QUIC**: Quick UDP Internet Connections
- **Dilithium**: Post-quantum digital signature algorithm
- **FFI**: Foreign Function Interface
- **PII**: Personally Identifiable Information
- **MITM**: Man-in-the-Middle
- **DoS**: Denial of Service
