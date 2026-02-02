# Domain Registration Feature - Implementation Guide

## Overview

This document provides comprehensive guidance for completing the domain registration feature implementation, including native bridge integration, testing, and deployment considerations.

## Status

- ✅ **Phase 1**: Type definitions and validation utilities complete
- ✅ **Phase 2**: QUIC-based service layer complete
- ✅ **Phase 3**: TypeScript native bridge methods added
- ✅ **Phase 4**: Registration UI with real-time validation complete
- ✅ **Phase 5**: SIDScreen integration complete
- 🟡 **Phase 6**: Native implementations needed
- 🟡 **Phase 7**: Full testing and deployment

## Files Created

### TypeScript/React Native Layer

| File | Purpose | Status |
|------|---------|--------|
| `src/types/domain.ts` | Type definitions for domain operations | ✅ Complete |
| `src/utils/domainValidation.ts` | Client-side validation logic | ✅ Complete |
| `src/services/DomainService.ts` | QUIC-based API service | ✅ Complete |
| `src/screens/DomainRegistrationScreen.tsx` | Registration modal UI | ✅ Complete |
| `src/screens/DomainManagementScreen.tsx` | Domain list management | ✅ Complete |
| `src/services/NativeIdentityProvisioning.ts` | Updated with domain methods | ✅ Complete |
| `src/screens/SIDScreen.tsx` | Updated with domain button | ✅ Complete |
| `src/utils/__tests__/domainValidation.test.ts` | Unit tests | ✅ Complete |

### Native Implementation Templates

| File | Platform | Purpose | Status |
|------|----------|---------|--------|
| `ios/NativeIdentityProvisioningModule+Domain.swift` | iOS | Domain signing template | 🟡 Template |
| `android/app/src/main/java/.../NativeIdentityProvisioningModuleDomain.kt` | Android | Domain signing template | 🟡 Template |

## Next Steps - Native Implementation

### iOS Implementation

**Location**: `ios/NativeIdentityProvisioningModule.swift`

**Required methods**:
```swift
@objc func signDomainRegisterTransaction(
  _ params: NSDictionary,
  resolve: @escaping RCTPromiseResolveBlock,
  reject: @escaping RCTPromiseRejectBlock
)

@objc func signDomainUpdateTransaction(
  _ params: NSDictionary,
  resolve: @escaping RCTPromiseResolveBlock,
  reject: @escaping RCTPromiseRejectBlock
)
```

**Implementation checklist**:
1. [ ] Copy methods from `ios/NativeIdentityProvisioningModule+Domain.swift` template
2. [ ] Replace TODO sections with actual lib-client integration
3. [ ] Implement `loadIdentityFromKeychain()` helper
4. [ ] Implement `loadDilithiumPrivateKeyFromKeychain()` helper
5. [ ] Add error handling for missing identity/keys
6. [ ] Test with valid/invalid domain parameters
7. [ ] Verify signing performance (< 1 second)
8. [ ] Test on physical iOS device

**Dependencies**:
- lib-client (compiled iOS framework)
- React Native Bridge headers
- Security framework

### Android Implementation

**Location**: `android/app/src/main/java/com/sovereignnetworkmobile/NativeIdentityProvisioningModule.kt`

**Required methods**:
```kotlin
@ReactMethod
fun signDomainRegisterTransaction(params: ReadableMap, promise: Promise)

@ReactMethod
fun signDomainUpdateTransaction(params: ReadableMap, promise: Promise)
```

**Implementation checklist**:
1. [ ] Add methods from template to NativeIdentityProvisioningModule.kt
2. [ ] Create NativeIdentityProvisioningModuleDomain.kt helper
3. [ ] Replace TODO sections with actual lib-client JNI integration
4. [ ] Implement `loadIdentityFromKeystore()` helper
5. [ ] Implement `loadDilithiumPrivateKeyFromKeystore()` helper
6. [ ] Add Android Keystore integration
7. [ ] Handle user authentication requirements
8. [ ] Test with valid/invalid domain parameters
9. [ ] Verify signing performance (< 1 second)
10. [ ] Test on physical Android device

**Dependencies**:
- lib-client (compiled Android AAR)
- JNI bindings to Rust lib
- EncryptedSharedPreferences (optional)

## Testing Guide

### Unit Tests

Run validation tests:
```bash
cd /Users/supertramp/Dev/SovereignNetworkMobile
npm test -- src/utils/__tests__/domainValidation.test.ts
```

**Tests cover**:
- Valid domain formats
- Invalid domain formats
- Reserved domain detection
- Domain classification
- Duration validation
- Edge cases (empty, too long, special chars)

### Integration Tests

**1. Domain Validation**
```typescript
// Test real-time validation
const result = validateDomainFormat('example.sov');
expect(result.valid).toBe(true);

// Test reserved domains
const reserved = validateDomainFormat('dao.sov');
expect(reserved.isReserved).toBe(true);
```

**2. Availability Checking**
```typescript
// Test QUIC connection
const availability = await domainService.checkAvailability('test.sov');
expect(availability.available).toEqual(expect.any(Boolean));
```

**3. Registration Flow**
- Register a valid domain
- Verify AsyncStorage persistence
- Check DomainManagementScreen displays domain
- Verify expiration date calculation

### End-to-End Testing

**Test sequence**:

1. **Launch app**
   - Navigate to SID tab
   - Verify 🌐 button appears next to token creator (◆)

2. **Open registration modal**
   - Tap 🌐 button
   - Verify modal opens with form

3. **Test validation**
   - Enter `dao.sov` → Verify error "Reserved domain"
   - Enter `food.dao.sov` → Verify error "Reserved welfare"
   - Enter `test..sov` → Verify error "empty label"
   - Enter `example.sov` → Verify no error

4. **Test availability checking**
   - Type `test123.sov` and blur field
   - Verify "Checking..." indicator appears
   - Verify result displays (✓ or ✗)
   - Verify classification badge displays

5. **Test registration** (requires network)
   - Enter valid available domain: `mynewdomain.sov`
   - Select duration: 1 year
   - Tap "Register Domain"
   - Verify "🔐 Signing..." state appears
   - Verify "⛏️ Mining..." state appears
   - Verify success message with transaction hash
   - Verify modal closes after 2 seconds

6. **Test persistence**
   - Open DomainManagementScreen
   - Verify registered domain appears
   - Verify expiration date shows
   - Verify "1 Active" badge shows 1

7. **Test domain management**
   - Verify active domains display
   - Verify expired domains section (if any)
   - Test delete domain functionality
   - Test cleanup expired domains

### Performance Testing

**Targets**:
- Domain validation: < 50ms (client-side, should be instant)
- Availability check: < 2s (QUIC API call)
- Registration signing: < 1s (native Dilithium signing)
- Mining confirmation: varies (blockchain dependent)
- Modal animation: 60fps smooth

**Measurement**:
```typescript
console.time('domain-validation');
validateDomainFormat('example.sov');
console.timeEnd('domain-validation');
```

### Error Scenarios to Test

1. **No internet connection**
   - Attempt availability check
   - Expect: Error message "Failed to check domain availability"

2. **Invalid DID/Identity not loaded**
   - Clear identity from Keychain
   - Attempt registration
   - Expect: Error message "Identity not available"

3. **Insufficient funds** (if applicable)
   - Try registering when balance too low
   - Expect: Error from server

4. **Domain already registered**
   - Try registering same domain twice
   - Expect: Error "Domain not available"

5. **Invalid parameters**
   - Pass invalid duration (0 or > 3650 days)
   - Pass invalid domain format
   - Expect: Validation errors

6. **Native bridge failure**
   - On iOS: Missing NativeIdentityProvisioning module
   - On Android: Missing JNI library
   - Expect: Graceful error message

## Config Updates

### Add Domain API Endpoints

Update `src/config.ts` if needed:

```typescript
export const API_ENDPOINTS = {
  // ... existing endpoints

  web4: {
    domains: {
      register: '/api/v1/web4/domains/register',
      status: '/api/v1/web4/domains/{domain}/status',
      list: '/api/v1/web4/domains',
      history: '/api/v1/web4/domains/{domain}/history',
      update: '/api/v1/web4/domains/update',
      rollback: '/api/v1/web4/domains/{domain}/rollback',
    },
  },
}
```

**Note**: These are already hardcoded in `DomainService.ts`, so no changes needed unless you want centralized endpoint management.

## Deployment Considerations

### Pre-Release Checklist

- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] E2E testing on iOS device
- [ ] E2E testing on Android device
- [ ] Performance metrics acceptable
- [ ] Error handling comprehensive
- [ ] Documentation complete
- [ ] Code reviewed by team
- [ ] Security audit of native implementations
- [ ] QUIC certificate pinning verified
- [ ] Rate limiting considered for availability checks
- [ ] AsyncStorage migration strategy (if upgrading)

### Feature Flags

Consider adding feature flag in `src/config.ts`:

```typescript
export const FEATURE_FLAGS = {
  ENABLE_TOKEN_CREATOR: __DEV__,
  ENABLE_DOMAIN_REGISTRATION: __DEV__, // Add this
}
```

Then use in code:
```typescript
if (FEATURE_FLAGS.ENABLE_DOMAIN_REGISTRATION) {
  // Show domain registration button
}
```

### Monitoring & Analytics

Consider adding event tracking:

```typescript
// Track domain registrations
analytics.trackEvent('domain_registered', {
  domain,
  duration_days: durationDays,
  classification,
});

// Track validation errors
analytics.trackEvent('domain_validation_error', {
  domain,
  error: validationResult.errors[0],
});
```

### Rollout Strategy

1. **Internal testing**: Deploy to staging with all features enabled
2. **Closed beta**: Release to small subset of users with feature flag OFF (manual override for testers)
3. **Gradual rollout**: Enable feature flag for % of users
4. **Full release**: Enable for all users

## Common Issues & Solutions

### Native Bridge Not Found

**Error**: "NativeIdentityProvisioning not available on this platform"

**Solutions**:
1. Verify native module is registered in MainApplication.kt (Android)
2. Verify native module is registered in RN bridge (iOS)
3. Check build.gradle/podfile includes module
4. Clean build and rebuild

### QUIC Connection Failed

**Error**: "QUIC connection required but failed"

**Solutions**:
1. Verify node is accessible and supports QUIC
2. Check network connectivity
3. Verify QUIC_CONFIG settings in src/config.ts
4. Check certificate pinning configuration

### Signing Fails on Native Layer

**Error**: "Could not load Dilithium private key"

**Solutions**:
1. Verify identity provisioned successfully
2. Verify Keychain/Keystore has key stored
3. Verify native bridge methods implemented
4. Check device supports Dilithium (unlikely but verify)

### Domain Already Expired

**Issue**: Registered domain shows as expired immediately

**Solutions**:
1. Verify server returns correct expires_at timestamp
2. Check client timezone handling
3. Verify AsyncStorage stores expiry correctly
4. Check DomainManagementScreen expiry calculation

## Advanced Features (Future)

Consider for future versions:

1. **Domain Renewal**: Implement renew endpoint to extend expiry
2. **Domain Transfer**: Allow transferring domains to other DIDs
3. **Domain Auctions**: Bid on expiring domains
4. **Domain Analytics**: Track domain access patterns
5. **IPFS Integration**: Automatically upload domain content to IPFS
6. **DNSLink Integration**: Generate DNSLink records
7. **Subdomain Delegation**: Allow creating subdomains
8. **Domain Marketplace**: Show available premium domains

## Support & Debugging

### Enable Debug Logging

Set in react-native code:
```typescript
if (__DEV__) {
  // Increase console output
  console.log('[DomainService] ...');
}
```

### Check Native Implementation

Verify native methods exist:
```typescript
// Check if methods are available
console.log(NativeModules.NativeIdentityProvisioning?.signDomainRegisterTransaction);
```

### Verify AsyncStorage

Check stored domains:
```typescript
const stored = await AsyncStorage.getItem('sov:registered_domains');
console.log('Stored domains:', stored ? JSON.parse(stored) : []);
```

## References

- **Validation Rules**: See `lib-blockchain/src/contracts/root_registry/validation.rs`
- **Token Pattern**: See `src/screens/TokenCreatorScreen.tsx` (follow same pattern)
- **Service Pattern**: See `src/services/TokenService.ts` (same architecture)
- **Native Bridge**: See `src/services/NativeIdentityProvisioning.ts`
- **Tests**: See `src/utils/__tests__/domainValidation.test.ts`

## Contact & Issues

For issues or questions about domain registration:
1. Check this guide first
2. Review inline code comments
3. Check test files for usage examples
4. Open GitHub issue with full error logs

---

**Last Updated**: 2026-02-02
**Feature Status**: TypeScript/React complete, Native implementations needed
**Next Steps**: Implement iOS and Android native signing methods
