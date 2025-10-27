# Native Module Migration Plan

**Document Purpose:** Guideline for when to migrate React Native modules to native code (Swift/Kotlin)

**Last Updated:** 2025-10-27

---

## 🎯 Decision Framework

### When to Migrate to Native

**DO migrate to native when:**
- Performance metric falls below threshold
- Framework limitations block required functionality
- Memory/battery impact is measurable and unacceptable
- Platform-specific behavior cannot be replicated in RN

**DO NOT migrate when:**
- "Just in case" - only migrate if there's a problem
- It's a one-time operation
- Performance cost is <5% user experience impact
- Feature is rarely used or background operation

---

## 📊 Performance Thresholds

### Critical (Immediate Native Rewrite)
| Metric | Threshold | Action |
|--------|-----------|--------|
| Frame Rate (FPS) | <55 FPS sustained | Go native |
| BLE Latency | >150ms round-trip | Go native |
| Crypto Operations | >200ms signature | Go native |
| App Startup | >3 seconds | Investigate, then native if RN bottleneck |
| Memory (Idle) | >250 MB on mid-range Android | Profile, then native if JS bridge issue |

### High Priority (Evaluate for Native)
| Metric | Threshold | Action |
|--------|-----------|--------|
| Transaction Processing | >500ms | Profile first |
| API Response Time | >2 seconds (app side) | Profile first |
| Battery Drain | >10% per hour (app-specific) | Profile first |
| Scroll Performance | <60 FPS, janky lists | Consider FlatList optimization first |

### Low Priority (Likely OK in RN)
| Metric | Threshold | Action |
|--------|-----------|--------|
| Form Interactions | Anything >100ms user-facing | Usually RN is fine |
| Navigation | >300ms transition | Usually RN is fine |
| Background Jobs | Any duration | Keep in RN, use background modules |

---

## 🔧 Modules to Potentially Go Native

### Priority 1: BLE Communication (Highest Candidate)

**When to migrate:**
- After initial implementation with `react-native-ble-plx`
- If seeing **>150ms latency** in packet round-trip
- If packet loss >2% or timeouts >5%

**Metrics to measure:**
```
1. Packet latency (send → receive): Should be <100ms
2. Connection establishment time: Should be <2 seconds
3. Characteristic write success rate: Should be >99.5%
4. Memory per connection: Should be <10 MB
5. Battery drain: Should be <1% per hour of use
```

**Rewrite effort:** 40-60 hours
- 20 hours iOS (Swift CoreBluetooth)
- 20 hours Android (Kotlin BluetoothAdapter)
- 20 hours integration + testing

**Files to create:**
```
ios/SovereignNetworkMobile/BLE/
  ├── BleManager.swift
  ├── BleDevice.swift
  ├── BleCharacteristic.swift
  └── BleModule.swift (RCT Bridge)

android/app/src/main/java/com/sovereignnetworkmobile/ble/
  ├── BleManager.kt
  ├── BleDevice.kt
  ├── BleGattCallback.kt
  └── BleModule.kt (RN Module)
```

**Decision point:**
- Build and test Phase 4 (BLE) in `react-native-ble-plx` first
- Run **benchmarks against edge node**: measure latency, throughput, reliability
- If metrics are good (latency <100ms, reliability >98%), keep RN
- If metrics are bad, schedule native rewrite

---

### Priority 2: Cryptographic Signing (High Candidate)

**When to migrate:**
- After Phase 6 security implementation
- If signature generation takes **>200ms**
- If key operations cause frame drops

**Metrics to measure:**
```
1. Private key generation: Should be <500ms (one-time, OK if slow)
2. Transaction signature: Should be <100ms (per transaction)
3. Biometric check + sign: Should be <300ms total (user-facing)
4. ZK proof generation: Depends on algorithm, but <2000ms acceptable
5. Key storage reliability: 100% - must not lose keys
```

**Rewrite effort:** 30-40 hours
- 15 hours iOS (Swift CryptoKit + Keychain integration)
- 15 hours Android (Kotlin BouncyCastle + Keystore)
- 10 hours integration + testing

**Files to create:**
```
ios/SovereignNetworkMobile/Crypto/
  ├── CryptoManager.swift
  ├── KeyManager.swift
  └── CryptoModule.swift (RCT Bridge)

android/app/src/main/java/com/sovereignnetworkmobile/crypto/
  ├── CryptoManager.kt
  ├── KeyManager.kt
  └── CryptoModule.kt (RN Module)
```

**Decision point:**
- Build Phase 6 security with `react-native-keychain` + Node.js crypto first
- Benchmark signature times on real device
- If signing transactions feels instant (<100ms), keep RN
- If user perceives delay, go native

---

### Priority 3: Biometric Authentication (Medium Candidate)

**When to migrate:**
- After Phase 6 biometric implementation
- If **authentication fails >1%** of attempts
- If **latency >1 second** on high-end device
- If unlock feeling sluggish compared to iOS/Android standards

**Metrics to measure:**
```
1. Recognition success rate: Should be >95%
2. Authentication time: Should be <500ms
3. Fallback to PIN: Should complete in <1 second
4. Session timeout handling: Should be seamless
5. Biometric enrollment check: Should be instant
```

**Rewrite effort:** 20-30 hours
- 10 hours iOS (BiometricAuthentication framework)
- 10 hours Android (BiometricPrompt)
- 10 hours integration + testing

**Files to create:**
```
ios/SovereignNetworkMobile/Biometric/
  └── BiometricManager.swift

android/app/src/main/java/com/sovereignnetworkmobile/biometric/
  └── BiometricManager.kt
```

**Decision point:**
- Test with `react-native-biometrics` on multiple devices (high-end + mid-range)
- Compare experience against native iOS/Android apps
- If feels sluggish or unreliable, go native
- Otherwise keep RN

---

### Priority 4: Local Database (Low Priority)

**When to migrate:**
- Only if **query performance >100ms** for common operations
- Only if **database size >100 MB** and RN is struggling
- Only if **batch writes timing out**

**Current approach:** SQLite via RN library (should be fine)

**Metrics to measure:**
```
1. Transaction insert time: <10ms per record
2. Query time (1000 records): <50ms
3. Index efficiency: Query plan should use indexes
4. Memory overhead: <50 MB for DB operations
5. Sync reliability: 100% data consistency
```

**Migration cost:** 25-35 hours (IF needed)

**Decision point:**
- Profile database operations in Phase 3
- If 95th percentile query is <100ms, keep RN
- If you need sub-10ms queries, consider native

---

### Priority 5: Real-Time Data Sync (Low Priority)

**When to migrate:**
- If you need **<100ms sync latency** (unlikely for crypto app)
- If **WebSocket reconnection >2 seconds** causes UX issues
- If background sync is dropping packets

**Current approach:** RN with background task support (should be fine)

**Metrics to measure:**
```
1. WebSocket latency: <100ms round-trip
2. Reconnection time: <1 second
3. Message delivery: 100% reliability
4. Background operation: Works while app backgrounded
5. Battery impact: <0.5% per hour when idle
```

**Migration cost:** 40-50 hours (IF needed)

**Decision point:**
- Test Phase 5 API integration with real ZHTP node
- If you experience frequent disconnects/reconnects, consider native background service
- Otherwise keep RN

---

## 🔄 Migration Workflow

### Step 1: Identify Performance Problem
```
1. Run performance profiling
   - Use React Native Debugger
   - Use Xcode Instruments (iOS)
   - Use Android Profiler

2. Measure actual metrics
   - Compare to threshold table above

3. Determine root cause
   - Is it JS bridge overhead?
   - Is it algorithm complexity?
   - Is it device limitation?
```

### Step 2: Decision Gate
```
Before migrating to native, ask:

□ Is performance OBJECTIVELY bad?
  (measured in milliseconds, not feeling)

□ Is the problem PERSISTENT?
  (happens on multiple devices/scenarios)

□ Is the problem USER-FACING?
  (not a background operation)

□ Can it be optimized in RN first?
  (memoization, code splitting, etc.)

□ Is the improvement worth 30-60 hours?
  (calculate ROI)

If ALL above = YES, proceed to native
```

### Step 3: Create Native Module

**Template structure (iOS):**
```swift
// ios/SovereignNetworkMobile/YourModule/YourModule.swift
import Foundation
import React

@objc(YourModule)
class YourModule: NSObject {

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return true
  }

  @objc
  func yourMethod(_ value: String, withResolver resolve: @escaping RCTPromiseResolveBlock,
                  withRejecter reject: @escaping RCTPromiseRejectBlock) {
    // Native implementation
    DispatchQueue.global(qos: .userInitiated).async {
      // Do heavy computation
      resolve(result)
    }
  }
}
```

**Template structure (Android):**
```kotlin
// android/app/src/main/java/com/sovereignnetworkmobile/YourModule.kt
import com.facebook.react.bridge.*

class YourModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "YourModule"

  @ReactMethod
  fun yourMethod(value: String, promise: Promise) {
    try {
      // Native implementation
      val result = doHeavyComputation(value)
      promise.resolve(result)
    } catch (e: Exception) {
      promise.reject("ERROR", e.message)
    }
  }
}
```

### Step 4: Bridge to React Native
```typescript
// src/native/YourModule.ts
import { NativeModules } from 'react-native';

const { YourModule } = NativeModules;

export const yourNativeFunction = async (value: string): Promise<string> => {
  return await YourModule.yourMethod(value);
};
```

### Step 5: Benchmark & Compare
```
1. Measure RN version
2. Measure native version
3. Compare metrics
4. Calculate improvement percentage
5. Document findings
```

---

## 📈 Benchmark Examples

### BLE Example
```
Task: Send transaction data over BLE (500 bytes)

React Native (react-native-ble-plx):
- Send: 5ms
- Receive: 45ms
- Total round-trip: 50ms ✅ GOOD

Native (Swift CoreBluetooth):
- Send: 2ms
- Receive: 8ms
- Total round-trip: 10ms
- Improvement: 5x faster (NOT NEEDED)

Decision: Keep RN (already acceptable)
```

### Crypto Signing Example
```
Task: Sign transaction (256-bit ECDSA)

React Native (TweetNaCl.js):
- Key gen: 120ms (first time, OK)
- Signature: 85ms ⚠️ BORDERLINE
- Verification: 95ms

Native (Swift CryptoKit):
- Key gen: 50ms
- Signature: 12ms ✅
- Verification: 15ms
- Improvement: 7x faster

Decision: Consider native if user-facing delays
```

---

## ⚠️ Migration Risks

### Testing Complexity
- Must test on iPhone + Android
- Must test on multiple OS versions
- Must test different device capabilities
- Risk: Platform-specific bugs

**Mitigation:** Comprehensive test suite before shipping

### Maintenance Burden
- Now maintaining Swift + Kotlin + RN
- Harder to find engineers
- Easier to introduce bugs

**Mitigation:** Keep native modules small and focused

### Update Cycles
- Native depends on OS updates
- Could break with new iOS/Android version

**Mitigation:** Abstract native layer, monitor platform updates

---

## 🎛️ Phases & Native Migration Points

| Phase | Feature | Native Decision |
|-------|---------|-----------------|
| 1 | UI/Navigation | RN only ✅ |
| 2 | Detail pages | RN only ✅ |
| 3 | State & Storage | RN only ✅ |
| 4 | **BLE** | ⚠️ **EVALUATE** after benchmarking |
| 5 | API Integration | RN only ✅ |
| 6 | **Security & Crypto** | ⚠️ **EVALUATE** after benchmarking |
| 7 | Testing | RN tests only ✅ |
| 8 | Optimization | **START HERE** - optimize RN first |
| 9 | Deployment | RN tools ✅ |

---

## 🚀 Optimization Checklist (Before Going Native)

**Do these FIRST before deciding to go native:**

### Memory Optimization
- [ ] Remove unused dependencies
- [ ] Implement code splitting
- [ ] Lazy load screens
- [ ] Use React.memo() on expensive components
- [ ] Profile memory leaks

### Performance Optimization
- [ ] Use FlatList instead of ScrollView for long lists
- [ ] Implement image caching
- [ ] Use shouldComponentUpdate / useMemo
- [ ] Reduce bundle size
- [ ] Enable Hermes engine (RN 0.64+)

### Network Optimization
- [ ] Implement request batching
- [ ] Add compression (gzip)
- [ ] Cache API responses
- [ ] Implement request debouncing
- [ ] Profile API call overhead

### JS Bridge Optimization
- [ ] Batch native calls (don't call native in loops)
- [ ] Use background modules for heavy work
- [ ] Avoid frequent state sync
- [ ] Defer non-critical operations

---

## 📋 Decision Template

Use this template when evaluating native migration:

```markdown
# Module: [BLE / Crypto / Biometric / etc]

## Current Performance
- Metric 1: [value] (threshold: [threshold])
- Metric 2: [value] (threshold: [threshold])
- Metric 3: [value] (threshold: [threshold])

## Problem Statement
[What is the actual user impact?]

## Investigation Results
- Profiling tool used: [which tool]
- Bottleneck identified: [where is time spent]
- Root cause: [JS bridge / algorithm / device limitation]

## RN Optimization Attempts
- [ ] Attempted X optimization
- [ ] Attempted Y optimization
- [ ] Attempted Z optimization

## Benchmark Results
- RN version: [timing]
- Native version: [timing]
- Improvement: [X%]

## ROI Analysis
- Development cost: [hours]
- Testing cost: [hours]
- Maintenance cost: [hours/year]
- User impact: [improvement in user experience]

## Decision
- [ ] KEEP RN (acceptable performance)
- [ ] OPTIMIZE RN (try different approach)
- [ ] GO NATIVE (justified by metrics)

## Notes
[Any other considerations]
```

---

## ✅ Summary

**Start here:** Keep everything in React Native

**Measure at Phase 4:** BLE performance

**Measure at Phase 6:** Crypto and biometric performance

**Measure at Phase 8:** Overall app performance

**Go native only if:**
1. Metrics objectively fall below threshold
2. User experience is noticeably degraded
3. RN optimizations have been exhausted
4. ROI calculation justifies the effort

**Expected outcome:** 80% stays in RN, <20% needs native modules (if any)

---

**Document Version:** 1.0
**Maintainer:** Development Team
**Review Frequency:** After each major phase completion
