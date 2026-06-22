# Sovereign Network Mobile

React Native mobile app for The Sovereign Network — a post-quantum, decentralized identity and token platform built on the ZHTP protocol.

## Overview

This app provides a full native interface to the Sovereign Network, including identity provisioning, token operations, DAO governance, PoUW mining, and a Web4 browser. All cryptographic operations run inside a Rust FFI core (`lib-client`) via platform-native bridges (Swift on iOS, JNI on Android).

## Architecture

### Transport Layer
- **QUIC** via Quinn v0.11 with Rustls 0.23 — compiled as `quinn-ffi` (iOS XCFramework) and `quic-jni` (Android `.so`)
- **ZHTP protocol** over QUIC, CBOR-encoded
- Two ALPNs: `zhtp-public/1` (unauthenticated) and `zhtp-uhp/2` (authenticated session)
- **UHP v2 handshake** — Dilithium5 signatures + Kyber1024 key encapsulation, keys stay in Rust

### Identity
- Post-quantum ZK-DID: one soulbound identity per human
- Opaque handle pattern on both platforms — Rust owns all key material
- iOS: `UnsafeMutableRawPointer` via `@_silgen_name` C FFI
- Android: `Long` handle via JNI
- Storage: iOS Keychain / Android EncryptedSharedPreferences (serialized JSON only, no raw keys)

### Node Registry
Multi-node QUIC with per-host SPKI certificate pinning. Nodes configured via `.env` `ZHTP_NODE_REGISTRY` (`host:port:pin`). Run `node scripts/generate-config.js` after changes.

| Node | Host | Port |
|------|------|------|
| g1 | g1.thesovereignnetwork.org | 9334 |
| g2 | g2.thesovereignnetwork.org | 9334 |
| g3 | g3.thesovereignnetwork.org | 9334 |
| g4 | g4.thesovereignnetwork.org | 9334 |

## Features

- **Identity** — Create, recover, backup ZK-DID identities with seed phrase support and biometric lock
- **Wallet** — Multi-wallet token management, send/receive, staking, UBI claims
- **Tokens** — Token creation with bonding curves, token management and trading
- **PoUW** — Proof of Useful Work mining with reward tracking
- **DAO** — Governance proposals, zero-knowledge voting, treasury status
- **Oracle** — On-chain oracle data dashboard
- **Web4 Browser** — Native ZHTP/zhtp:// protocol support with domain management
- **SID** — Sovereign Identity Document screen
- **Settings** — Node trust management, native settings bridge

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native 0.82, React 19 |
| Language | TypeScript |
| Navigation | React Navigation 7 (stack + bottom tabs) |
| Crypto core | Rust (lib-client, lib-identity, lib-crypto, lib-network) |
| iOS FFI | Swift + `@_silgen_name` C FFI |
| Android FFI | Kotlin + JNI |
| Storage | Keychain (iOS) / EncryptedSharedPreferences (Android) |
| QR codes | react-native-qrcode-svg |
| Secure storage | react-native-keychain |

## Project Structure

```
SovereignNetworkMobile/
├── src/
│   ├── screens/            # 40+ screens
│   │   ├── oracle/         # Oracle dashboard
│   │   └── explorer/       # Network explorer
│   ├── services/           # Business logic & native bridges
│   │   ├── quic.ts         # QUIC session management
│   │   ├── NativeIdentityProvisioning.ts
│   │   ├── TokenService.ts
│   │   ├── OracleService.ts
│   │   ├── BondingCurveService.ts
│   │   └── AppService.ts
│   ├── hooks/              # React hooks
│   ├── native/             # Native module type declarations
│   ├── navigation/         # RootNavigator
│   ├── types/              # Shared TypeScript types
│   ├── config.ts           # GeneratedConfig (from .env)
│   └── i18n/              # Translations
├── ios/                    # iOS native (Swift + Objective-C)
│   ├── ZhtpClient.swift    # All lib-client C FFI declarations
│   ├── NativeQuicModule.swift
│   ├── NativeIdentityProvisioning.swift
│   ├── RCTPoUW.swift
│   └── PoUWTests/
├── android/                # Android native (Kotlin + Rust)
│   └── app/src/main/java/com/sovereignnetworkmobile/
│       ├── pouw/           # PoUW controller, verifier, receipt store
│       └── [Native modules]
├── scripts/
│   ├── generate-config.js  # Generates src/config.ts from .env
│   └── bump-version.sh
├── protos/pouw/v1/         # PoUW protobuf definitions
└── docs/
    ├── RELEASE_DEPLOYMENT.md
    └── pouw/               # PoUW implementation docs
```

## Setup

### Prerequisites
- Node.js 18+
- Yarn or npm
- Xcode 15+ (iOS)
- Android Studio + NDK r26+ (Android)
- Rust toolchain with cross-compilation targets

### Install
```bash
yarn install
```

### Configure nodes
Copy `.env.example` to `.env` and set `ZHTP_NODE_REGISTRY`, then:
```bash
node scripts/generate-config.js
```

### iOS
```bash
cd ios && pod install
yarn ios
```

### Android
Android JNI libs are pre-built in `android/app/jniLibs/`. To run:
```bash
yarn android
```

To rebuild Rust JNI (requires NDK):
```bash
cd android/app/src/main/rust/quic-jni
./build-android.sh
```

### Release build (Android)
Credentials are stored in `android/vault/release-keystore-credentials.txt` (gitignored).
```bash
cd android
RELEASE_KEYSTORE_PASSWORD='...' \
RELEASE_KEY_ALIAS='release-key' \
RELEASE_KEY_PASSWORD='...' \
./gradlew bundleRelease -x buildQuicJni
```

## Testing
```bash
# JS/TS tests
yarn test

# Android unit tests (PoUW suite)
cd android && ./gradlew test

# iOS tests
xcodebuild test -workspace ios/SovereignNetworkMobile.xcworkspace \
  -scheme SovereignNetworkMobile -destination 'platform=iOS Simulator,...'
```

## Security

- All private key material stays inside Rust — never crosses the FFI boundary as plaintext
- Secrets loaded from gitignored vault files and environment variables only
- SPKI certificate pinning on all QUIC connections
- Release logging redacted; console silenced in production builds
- Jailbreak/root detection, device binding, and runtime protection services

## Version

Current: `1.1.0-beta.1` (versionCode 11)
