# PoUW Mobile Client v1.0.0

## Overview
Initial release of Proof-of-Useful-Work mobile client for iOS and Android.

## Features
- Content verification (Hash, Merkle, Signature proofs)
- Automatic receipt generation and signing
- Offline queue with persistence
- Automatic batch submission
- Cross-platform receipt parity

## Technical Details
- Signature: Dilithium5 via Rust FFI
- Transport: QUIC only
- Storage: Core Data (iOS), Room (Android)
- Rate limits: 50 req/60s, 100 receipts/batch

## Known Limitations
- Certificate pinning optional
- Max queue size: 10,000 receipts
- Receipt retention: 7 days (accepted), 30 days (rejected)

## Upgrade Notes
N/A (initial release)
