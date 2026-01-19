# Alpha Release Notes - Sovereign Network Mobile

## Overview

First alpha release of the Sovereign Network Mobile app - a decentralized Web4 browser with quantum-resistant identity, native QUIC transport, and blockchain wallet integration.

---

## Core Features

### Identity & Authentication
- ZK-DID (Zero-Knowledge Decentralized Identifier) creation and management
- Dilithium post-quantum signature support
- Seed phrase backup and recovery
- Biometric authentication (Face ID / Touch ID)
- Secure keychain storage for credentials

### Web4 Browser
- Native ZHTP protocol support via QUIC/UDP transport
- Browse `.sov` domains directly (e.g., `zhtp://central.sov`)
- URL bar with protocol auto-detection
- Error pages for unreachable sites
- Fallback handling for network issues

### Wallet
- Multi-wallet support (Main, Savings, Staking)
- SOV token balance display
- Transaction history
- Send/Receive token flows
- Staking interface (coming soon)

### DAO Governance
- DAO statistics dashboard
- Proposal viewing and voting interface
- Welfare DAOs integration:
  - `food.dao.sov` - Community food security
  - `health.dao.sov` - Decentralized healthcare
  - `edu.dao.sov` - Open learning resources
  - `housing.dao.sov` - Affordable housing
  - `energy.dao.sov` - Renewable energy sharing

### Dashboard
- Live trending tokens with price simulation
- Active dApp user metrics
- SOV reward accumulation counter
- Quick access to bookmarks and history

---

## Technical Specifications

### Network Transport
| Layer | Technology |
|-------|------------|
| Transport | QUIC over UDP |
| Encryption | TLS 1.3 + PQC (Dilithium) |
| Protocol | ZHTP (Zero-Knowledge HTTP) |
| Discovery | DHT-based peer resolution |

### Supported Platforms
| Platform | Minimum Version | Architecture |
|----------|-----------------|--------------|
| iOS | 15.0+ | arm64 |
| Android | API 24+ (Android 7.0) | arm64-v8a, armeabi-v7a |

### Build Information
| Component | Version |
|-----------|---------|
| React Native | 0.82.1 |
| React | 19.1.1 |
| API Client | @sovereign-net/api-client 1.1.12 |

---

## Known Limitations (Alpha)

### Not Production Ready
- Mock data used for some dashboard metrics
- Staking functionality not yet connected to chain
- DAO voting transactions not yet live
- Profile editing limited

### Network Requirements
- Requires connection to SOV node (default: 77.42.37.161:9334)
- QUIC/UDP must not be blocked by firewall
- No offline mode support yet

### Security Considerations
- Self-signed certificates accepted in alpha
- Debug logging enabled (will be removed in production)
- Rate limiting permissive for testing

### Missing Features
- Push notifications
- Deep linking
- Multi-language support (English only)
- Dark/Light theme toggle
- QR code scanning for payments

---

## App Screens

| Screen | Description |
|--------|-------------|
| Dashboard | Home with trending tokens, dApps, and bounties |
| Browser | Web4 browser for `.sov` sites |
| Wallet | Token balances and transactions |
| DAO | Governance proposals and welfare DAOs |
| Identity (SID) | DID management and profile |

---

## Default Configuration

| Setting | Value |
|---------|-------|
| Default Node | `http://77.42.37.161:9334` |
| Network | Testnet |
| QUIC Timeout | 30 seconds |
| Connection Check | Every 30 seconds |

---

## Quick Start

### iOS
```bash
npm install
cd ios && pod install && cd ..
npm run ios
```

### Android
```bash
npm install
npm run android
```

### Build Release
```bash
# Bump version first
npm run version:bump

# Build
npm run build:android      # APK
npm run build:android:aab  # AAB for Play Store
npm run build:ios          # Xcode archive
```

---

## What's Next (Post-Alpha)

### P0 - Critical
- Real blockchain transaction signing
- Secure key storage audit
- Production node endpoints

### P1 - High
- Push notification integration
- QR code payment scanning
- Seed phrase import flow
- Guardian recovery UI

### P2 - Medium
- Multi-language (i18n)
- Theme customization
- Offline transaction queue
- Widget for iOS/Android

### P3 - Future
- Hardware wallet support
- Cross-device sync
- Desktop companion app

---

## Version History

| Version | Build | Date | Notes |
|---------|-------|------|-------|
| 1.0.0-alpha.5 | 5 (Android) / 17 (iOS) | Dec 2024 | Animated dashboard, Welfare DAOs |
| 1.0.0-alpha.4 | 4 (Android) / 16 (iOS) | Dec 2024 | Web4 runtime, URL bar |
| 1.0.0-alpha.3 | 3 (Android) / 15 (iOS) | Dec 2024 | Profile screen, wallet clipboard |

---

## Reporting Issues

https://github.com/SOVEREIGN-NET/Sovereign-Network-Mobile/issues

---

## Connect

- **Node**: `zhtp://77.42.37.161:9334`
- **Central Hub**: `zhtp://central.sov`
- **GitHub**: https://github.com/SOVEREIGN-NET
