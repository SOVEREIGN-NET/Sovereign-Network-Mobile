# Sovereign Network Mobile - Implementation Plan

## Project Status: Phase 1 (Frontend Skeleton) ✅ Complete

**Last Updated:** 2025-10-27
**Version:** 0.0.1 (Pre-alpha - Mock data only)
**Target Platforms:** iOS 13+, Android 8.0+

---

## 📊 Current Implementation Status

### ✅ FULLY FUNCTIONAL FEATURES

#### Browser Screen (Web4 Browser)
- ✅ Address bar with URL input
- ✅ Navigation: Back, Forward, Refresh buttons
- ✅ Suggested websites with quick navigation
- ✅ Navigation history tracking
- ✅ Mock website content (ZHTP Network Hub, DAO Portal, Mesh Network, ZK Identity, Chat)
- ✅ Domain resolution display
- ✅ Protocol support indicators (ZHTP, DAO, Mesh, ZK, Web4)

#### DAO Screen (Governance)
- ✅ DAO statistics display (members, treasury, active proposals)
- ✅ Treasury balance breakdown with visual representation
- ✅ Proposal list with expandable details
- ✅ **Proposal voting interface: YES, NO, ABSTAIN buttons** (connects to MockDataService.voteOnProposal)
- ✅ Voting statistics with visual vote distribution bars
- ✅ Proposal status indicators (active, passed, failed, executed)
- ⚠️ "Create Proposal" button exists but **NOT FUNCTIONAL** (needs handler)

#### Wallet Screen (Token Management)
- ✅ Multi-wallet selection and highlighting
- ✅ Wallet balance display
- ✅ Wallet address with truncation
- ✅ Transaction history with sorting
- ✅ Transaction type icons (send, receive, stake, UBS)
- ✅ Transaction status indicators
- ⚠️ "Send ZHTP" button exists but **NOT FUNCTIONAL**
- ⚠️ "Receive ZHTP" button exists but **NOT FUNCTIONAL**
- ⚠️ "Claim UBS" button exists but **NOT FUNCTIONAL**
- ⚠️ "Stake ZHTP" button exists but **NOT FUNCTIONAL**

#### Identity Screen (ZK-DID Management)
- ✅ Display current ZK-DID identity
- ✅ Avatar emoji display
- ✅ Display name and DID address
- ✅ Identity type display (human/organization/developer)
- ✅ Citizenship verification status with color coding
- ✅ Creation date display
- ⚠️ "Create Identity" button exists but **NOT FUNCTIONAL**
- ⚠️ "Backup Identity" button exists but **NOT FUNCTIONAL**
- ⚠️ "Verify Biometric" button exists but **NOT FUNCTIONAL**

#### Dashboard Screen (Home/Overview)
- ✅ Network status display (connection state, protocol, node count)
- ✅ Mesh health visualization with progress bar
- ✅ DAO statistics grid (members, proposals, treasury)
- ⚠️ "Send ZHTP" button exists but **NOT FUNCTIONAL**
- ⚠️ "Claim UBS" button exists but **NOT FUNCTIONAL**
- ⚠️ "Vote on Proposal" button exists but **NOT FUNCTIONAL**
- ⚠️ "Create Proposal" button exists but **NOT FUNCTIONAL**

#### Core Infrastructure
- ✅ React Navigation with bottom tab navigator
- ✅ Stack navigation per tab
- ✅ Dark theme (0f0f1e background, 00d4ff cyan accents)
- ✅ Mock data service with realistic ZHTP data
- ✅ TypeScript with full type safety
- ✅ iOS simulator testing (working)
- ✅ Android emulator testing (working)

---

## 📋 IMPLEMENTATION PHASES

### Phase 1: Frontend Skeleton (CURRENT - COMPLETE)
**Scope:** UI-only, no real functionality, mock data only
**Status:** ✅ DONE

**What's Included:**
- All 5 screen layouts designed and rendered
- Mock data service with realistic test data
- Navigation structure complete
- UI/UX matching desktop browser aesthetic
- Successfully builds on iOS and Android

**Known Limitations:**
- Most buttons are placeholder UI (no handlers)
- All data is hardcoded mock data
- No backend connectivity
- No BLE support
- No real wallet transactions
- No actual voting functionality

---

### Phase 2: Screen Interaction & Detail Pages (NEXT)
**Scope:** Implement working button interactions and detail pages
**Estimated Effort:** 40-60 hours

#### 2.1 Send/Receive Flow
**Files to Create/Modify:**
- `src/screens/SendScreen.tsx` (NEW) - Send transaction form
- `src/screens/ReceiveScreen.tsx` (NEW) - Receive address display
- `src/screens/ConfirmTransactionScreen.tsx` (NEW) - Transaction confirmation
- `src/navigation/RootNavigator.tsx` (MODIFY) - Add new stack screens

**Features to Implement:**
- [ ] SendScreen: Address input, amount input, fee selection, preview
- [ ] ReceiveScreen: Display QR code, copy address, share functionality
- [ ] ConfirmTransactionScreen: Show details, biometric/PIN confirmation
- [ ] Navigation between wallet actions and detail screens
- [ ] Mock transaction confirmation with loading state
- [ ] Toast notifications for success/error

**Dependencies:** react-native-svg (QR code), react-native-share (share), react-native-vector-icons (icons)

---

#### 2.2 Identity Detail Pages
**Files to Create/Modify:**
- `src/screens/CreateIdentityScreen.tsx` (NEW)
- `src/screens/BackupIdentityScreen.tsx` (NEW)
- `src/screens/BiometricVerificationScreen.tsx` (NEW)
- `src/navigation/RootNavigator.tsx` (MODIFY)

**Features to Implement:**
- [ ] CreateIdentityScreen: Form for DID creation (display name, identity type)
- [ ] BackupIdentityScreen: Show backup phrase, copy/share options
- [ ] BiometricVerificationScreen: Biometric authentication UI + state handling
- [ ] Mock identity creation with state management
- [ ] Backup phrase display and security warnings

**State Management:** Use Context API or Redux for identity state

---

#### 2.3 DAO Proposal Detail & Creation
**Files to Create/Modify:**
- `src/screens/ProposalDetailScreen.tsx` (NEW)
- `src/screens/CreateProposalScreen.tsx` (NEW)
- `src/navigation/RootNavigator.tsx` (MODIFY)

**Features to Implement:**
- [ ] ProposalDetailScreen: Full proposal details, voting interface, comments
- [ ] CreateProposalScreen: Form for proposal creation (title, description, category)
- [ ] Form validation for proposal creation
- [ ] Mock proposal submission with confirmation

**Dependencies:** react-hook-form or formik (form handling)

---

#### 2.4 Web4 Browser Enhanced Features
**Files to Modify:**
- `src/screens/BrowserScreen.tsx` (MODIFY)

**Features to Implement:**
- [ ] Bookmark system
- [ ] Search functionality for domains
- [ ] Website preview/loading state
- [ ] Back button disable state handling
- [ ] Cookie/session storage (mock)

---

### Phase 3: State Management & Data Persistence
**Scope:** Replace mock data with real state, add local persistence
**Estimated Effort:** 30-40 hours

#### 3.1 Global State Management Setup
**Files to Create:**
- `src/state/store.ts` (NEW) - Redux store or Context setup
- `src/state/slices/wallet.ts` (NEW)
- `src/state/slices/identity.ts` (NEW)
- `src/state/slices/dao.ts` (NEW)
- `src/state/slices/browser.ts` (NEW)

**Implementation:**
- [ ] Choose state management: Redux, Zustand, or Context API
- [ ] Design state structure for each domain
- [ ] Implement state actions and reducers
- [ ] Add middleware for logging/debugging
- [ ] Connect all screens to global state

**Libraries:** redux + redux-toolkit OR zustand OR context API

---

#### 3.2 Local Data Persistence
**Files to Create:**
- `src/services/StorageService.ts` (NEW)
- `src/services/DatabaseService.ts` (NEW) - SQLite or Realm

**Implementation:**
- [ ] Setup AsyncStorage for simple data (settings, theme)
- [ ] Setup SQLite or Realm for transaction/proposal history
- [ ] Implement data serialization/deserialization
- [ ] Add migration system for database schema changes
- [ ] Implement cleanup/archival for old data

**Libraries:** @react-native-async-storage, sqlite3 or react-native-realm

---

#### 3.3 MockDataService Enhancement
**Files to Modify:**
- `src/services/MockDataService.ts`

**Implementation:**
- [ ] Add state mutations (transactions, proposals, identity changes)
- [ ] Implement transaction history accumulation
- [ ] Mock real-time updates
- [ ] Add delay simulation for network calls
- [ ] Implement error scenarios

---

### Phase 4: Bluetooth Low Energy (BLE) Integration
**Scope:** Connect to edge nodes via BLE
**Estimated Effort:** 60-80 hours

#### 4.1 iOS BLE Implementation
**Files to Create:**
- `src/services/ble/BleManager.ios.ts` (NEW)
- `src/services/ble/BleServiceBridge.ts` (NEW)
- `src/screens/EdgeNodeDiscoveryScreen.tsx` (NEW)
- `src/screens/EdgeNodePairingScreen.tsx` (NEW)
- `ios/SovereignNetworkMobile/BleModule.swift` (NEW) - Native Swift code

**Native Requirements:**
- [ ] Core Bluetooth framework integration
- [ ] Device scanning with RSSI filtering
- [ ] UUID-based service discovery
- [ ] Characteristic read/write operations
- [ ] Connection state management

**Features:**
- [ ] Scan for nearby edge nodes
- [ ] Display available edge nodes with signal strength
- [ ] Pairing process with node
- [ ] Store paired node data
- [ ] Handle connection drops/reconnection

**Libraries:** react-native-ble-plx OR react-native-ble-manager

---

#### 4.2 Android BLE Implementation
**Files to Create:**
- `src/services/ble/BleManager.android.ts` (NEW)
- `android/app/src/main/java/com/sovereignnetworkmobile/BleModule.kt` (NEW)

**Native Requirements:**
- [ ] Android Bluetooth adapter access
- [ ] BluetoothAdapter setup
- [ ] Device scanning with filters
- [ ] Gatt connection management
- [ ] Service/characteristic discovery

**Features:**
- [ ] Scan for edge nodes
- [ ] Display node list with connection status
- [ ] Initiate and manage pairing
- [ ] Handle permissions (Android 12+)

---

#### 4.3 BLE Communication Protocol
**Files to Create:**
- `src/services/ble/BleProtocol.ts` (NEW)
- `src/services/ble/PacketHandler.ts` (NEW)

**Implementation:**
- [ ] Define packet structure for BLE communication
- [ ] Implement message framing (size, checksum, type)
- [ ] Handle fragmentation for large messages
- [ ] Error correction (retry logic, timeouts)
- [ ] Protocol version negotiation

---

### Phase 5: API Integration (Real Backend)
**Scope:** Replace mock data with real ZHTP node API calls
**Estimated Effort:** 50-70 hours

#### 5.1 HTTP/REST API Client
**Files to Create:**
- `src/services/api/ApiClient.ts` (NEW)
- `src/services/api/endpoints/` (NEW directory)
  - `wallet.ts` - Wallet endpoints
  - `identity.ts` - Identity endpoints
  - `dao.ts` - DAO endpoints
  - `browser.ts` - Domain resolution endpoints

**Implementation:**
- [ ] Setup axios or fetch-based HTTP client
- [ ] Implement authentication (JWT/signature-based)
- [ ] Add request/response interceptors
- [ ] Error handling and retry logic
- [ ] Request timeout configuration

---

#### 5.2 Real Wallet Operations
**Files to Modify:**
- `src/services/WalletService.ts` (NEW/MODIFY)
- `src/screens/SendScreen.tsx` (MODIFY)
- `src/screens/ReceiveScreen.tsx` (MODIFY)

**Implementation:**
- [ ] Connect to actual wallet node
- [ ] Fetch real wallet balances
- [ ] Implement transaction creation
- [ ] Sign transactions (using local keys)
- [ ] Submit transactions to network
- [ ] Track transaction status

---

#### 5.3 Real Identity Management
**Files to Modify:**
- `src/services/IdentityService.ts` (NEW/MODIFY)
- `src/screens/CreateIdentityScreen.tsx` (MODIFY)

**Implementation:**
- [ ] Connect to identity registry
- [ ] Register new DID on network
- [ ] Fetch identity data
- [ ] Update identity attributes
- [ ] Verify citizenship status

---

#### 5.4 Real DAO Operations
**Files to Modify:**
- `src/services/DaoService.ts` (NEW/MODIFY)
- `src/screens/DAOScreen.tsx` (MODIFY)
- `src/screens/ProposalDetailScreen.tsx` (MODIFY)

**Implementation:**
- [ ] Fetch real proposals from DAO contract
- [ ] Fetch DAO statistics
- [ ] Submit votes to blockchain
- [ ] Track voting history
- [ ] Create new proposals

---

#### 5.5 Domain Resolution (Web4)
**Files to Modify:**
- `src/services/DomainResolver.ts` (NEW/MODIFY)
- `src/screens/BrowserScreen.tsx` (MODIFY)

**Implementation:**
- [ ] Resolve ZHTP domains to content
- [ ] Handle domain hierarchies (dao://, mesh://, zk://)
- [ ] Content fetching and caching
- [ ] Handle invalid/unresolving domains

---

### Phase 6: Security & Biometrics
**Scope:** Implement secure key storage, biometric authentication
**Estimated Effort:** 40-50 hours

#### 6.1 Secure Key Storage
**Files to Create:**
- `src/services/security/KeyManager.ts` (NEW)
- `src/services/security/EncryptionService.ts` (NEW)

**Implementation:**
- [ ] Use Keychain (iOS) / Keystore (Android) for key storage
- [ ] Generate and store private keys securely
- [ ] Implement key rotation
- [ ] Handle key backup and recovery
- [ ] Zero-knowledge proof capability

**Libraries:** react-native-keychain, react-native-encrypted-storage

---

#### 6.2 Biometric Authentication
**Files to Create:**
- `src/services/security/BiometricService.ts` (NEW)
- `src/components/BiometricPrompt.tsx` (NEW)

**Implementation:**
- [ ] Setup iOS Face ID / Android Biometric
- [ ] Implement authentication flow
- [ ] Fallback to PIN/password
- [ ] Session timeout handling
- [ ] Biometric enrollment check

**Libraries:** react-native-biometrics or @react-native-biometric-login/biometric-login

---

#### 6.3 Transaction Signing
**Files to Modify:**
- `src/services/api/endpoints/wallet.ts` (MODIFY)
- `src/screens/ConfirmTransactionScreen.tsx` (MODIFY)

**Implementation:**
- [ ] Display transaction details for review
- [ ] Request biometric confirmation
- [ ] Sign transaction with private key
- [ ] Verify signature before submission

---

### Phase 7: Testing & QA
**Scope:** Unit tests, integration tests, E2E tests
**Estimated Effort:** 50-70 hours

#### 7.1 Unit Tests
**Files to Create:**
- `__tests__/services/*.test.ts`
- `__tests__/screens/*.test.tsx`
- `__tests__/utils/*.test.ts`

**Coverage Target:** 80%+

**Testing Framework:** Jest (already configured)

---

#### 7.2 Integration Tests
**Files to Create:**
- `__tests__/integration/*.test.tsx`

**Scope:**
- Screen navigation flows
- State management with services
- API client with mock server
- BLE communication protocol

**Testing Library:** React Native Testing Library

---

#### 7.3 E2E Tests
**Files to Create:**
- `e2e/wallet.e2e.ts`
- `e2e/dao.e2e.ts`
- `e2e/identity.e2e.ts`
- `e2e/browser.e2e.ts`

**Testing Framework:** Detox

**Scenarios:**
- Send transaction flow
- Vote on proposal
- Create identity
- Browse Web4 domains

---

### Phase 8: Performance & Optimization
**Scope:** Performance tuning, bundle optimization
**Estimated Effort:** 30-40 hours

**Optimizations:**
- [ ] Code splitting and lazy loading
- [ ] Image optimization and caching
- [ ] Memoization of expensive components
- [ ] Network request batching
- [ ] Memory leak prevention
- [ ] Bundle size analysis and reduction
- [ ] Animation performance

**Tools:** React DevTools, Hermes profiler, Metro analyzer

---

### Phase 9: Deployment & Release
**Scope:** App Store and Play Store deployment
**Estimated Effort:** 20-30 hours

#### 9.1 iOS Deployment
**Tasks:**
- [ ] Create Apple Developer account
- [ ] Generate certificates and provisioning profiles
- [ ] Configure app signing
- [ ] Create TestFlight beta build
- [ ] Submit to App Store

**Tools:** Fastlane, Xcode

---

#### 9.2 Android Deployment
**Tasks:**
- [ ] Create Google Play Developer account
- [ ] Generate signing key
- [ ] Build release APK/AAB
- [ ] Create Play Console listing
- [ ] Submit for review

**Tools:** Gradle, Fastlane, Android Studio

---

#### 9.3 CI/CD Pipeline
**Files to Create:**
- `.github/workflows/build.yml` (NEW)
- `.github/workflows/deploy.yml` (NEW)
- `fastlane/Fastfile` (NEW/CONFIGURE)

**Implementation:**
- [ ] GitHub Actions workflows
- [ ] Automated builds on push
- [ ] Automated testing
- [ ] Beta deployment to TestFlight/Play Console
- [ ] Production deployment (manual trigger)

---

## 🎯 Immediate Next Steps (Phase 2)

### Priority 1: Send/Receive Functionality (Week 1-2)
1. Create SendScreen with form validation
2. Create ReceiveScreen with QR code
3. Add navigation from wallet actions
4. Implement mock transaction flow
5. Add loading/success states

### Priority 2: Identity Management (Week 2-3)
1. Create CreateIdentityScreen
2. Create BackupIdentityScreen
3. Add identity state management
4. Implement mock creation flow

### Priority 3: DAO Creation (Week 3-4)
1. Create ProposalDetailScreen
2. Create CreateProposalScreen
3. Form validation for proposals
4. Mock proposal submission

### Priority 4: Testing (Week 4)
1. Write tests for new screens
2. Test navigation flows
3. Test state persistence

---

## 📦 Key Dependencies to Add

**Phase 2:**
```json
{
  "react-hook-form": "^7.x",
  "react-native-svg": "^13.x",
  "react-native-share": "^8.x",
  "react-native-vector-icons": "^10.x"
}
```

**Phase 3:**
```json
{
  "@reduxjs/toolkit": "^1.x",
  "react-redux": "^8.x",
  "@react-native-async-storage/async-storage": "^1.x",
  "react-native-sqlite-storage": "^6.x"
}
```

**Phase 4:**
```json
{
  "react-native-ble-plx": "^2.x"
}
```

**Phase 6:**
```json
{
  "react-native-keychain": "^8.x",
  "react-native-biometrics": "^2.x"
}
```

**Phase 7:**
```json
{
  "@react-native-testing-library/": "^12.x",
  "detox": "^20.x",
  "detox-cli": "^20.x"
}
```

---

## 📊 Effort Summary

| Phase | Description | Est. Hours | Priority |
|-------|-------------|-----------|----------|
| 1 | Frontend Skeleton | **DONE** | ✅ |
| 2 | Detail Pages & Interactions | 40-60 | 🔴 NEXT |
| 3 | State Management | 30-40 | 🟠 HIGH |
| 4 | BLE Integration | 60-80 | 🟠 HIGH |
| 5 | Real API Integration | 50-70 | 🟡 MEDIUM |
| 6 | Security & Biometrics | 40-50 | 🟡 MEDIUM |
| 7 | Testing & QA | 50-70 | 🟡 MEDIUM |
| 8 | Optimization | 30-40 | 🟢 LOW |
| 9 | Deployment | 20-30 | 🟢 LOW |
| **TOTAL** | **All Phases** | **~450 hours** | |

---

## 🚨 Known Blockers / Dependencies

1. **Phase 2 requires:** Navigation library enhancements (nested stacks)
2. **Phase 3 requires:** Finalized app state schema
3. **Phase 4 requires:** ZHTP BLE protocol specification
4. **Phase 5 requires:** ZHTP node API documentation
5. **Phase 6 requires:** Crypto library integration (for signing)
6. **Phase 9 requires:** Apple/Google developer accounts

---

## 📝 Notes

- All mock data in Phase 1 uses realistic ZHTP format
- Phase 1 intentionally excludes button handlers for scope management
- BLE is Phase 4 (not Phase 1) per requirements
- Real API integration is Phase 5 (after local state management)
- Each phase builds on previous phase
- Estimated hours are rough - will refine as implementation progresses

---

**Document Version:** 1.0
**Last Updated:** 2025-10-27
**Next Review:** After Phase 2 completion
