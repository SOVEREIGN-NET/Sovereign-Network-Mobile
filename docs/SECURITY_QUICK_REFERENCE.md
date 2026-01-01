# Security Quick Reference Checklist
## ZHTP Web4 Mobile Application

**Last Updated:** December 29, 2025
**Status:** CRITICAL - DO NOT RELEASE

---

## CRITICAL ISSUES (MUST FIX)

### ❌ CRITICAL-1: Seed Phrases in Console Logs
**File:** `src/screens/CreateIdentityScreen.tsx:97-101`
**Impact:** Identity compromise
**Status:** NOT FIXED ⚠️
**Action:** Remove console.log statements containing seedPhrases

### ❌ CRITICAL-2: Unencrypted Identity Storage
**Files:** `src/context/AuthContext.tsx` (multiple)
**Impact:** Complete credential theft from unrooted device
**Status:** NOT FIXED ⚠️
**Action:** Use Keychain instead of AsyncStorage

### ❌ CRITICAL-3: QUIC Certificate Validation Disabled
**File:** `src/services/RealAuthService.ts:48`
**Impact:** Man-in-the-Middle attacks possible
**Status:** NOT FIXED ⚠️
**Action:** Change `insecure: true` to `insecure: __DEV__`

### ❌ CRITICAL-4: Development Bypass Present
**File:** `src/screens/SignInScreen.tsx:66-77, 304-338`
**Impact:** Authentication completely bypassed
**Status:** NOT FIXED ⚠️
**Action:** Delete handleDevBypass function and UI button

---

## HIGH-RISK ISSUES (BEFORE RELEASE)

### ⚠️ HIGH-1: No Login Rate Limiting
**File:** `src/context/AuthContext.tsx`
**Impact:** Brute force attacks
**Status:** NOT FIXED ⚠️
**Action:** Implement rate limiter

### ⚠️ HIGH-2: Weak Password Policy (8 chars)
**File:** `src/screens/CreateIdentityScreen.tsx:64-72`
**Impact:** Easy to crack passphrases
**Status:** NOT FIXED ⚠️
**Action:** Enforce 12+ chars with complexity

### ⚠️ HIGH-3: HTTP Fallback for QUIC
**File:** `src/services/QuicFetchAdapter.ts`
**Impact:** Unencrypted fallback possible
**Status:** NOT FIXED ⚠️
**Action:** Disable HTTP fallback completely

### ⚠️ HIGH-4: Weak Recipient Validation
**File:** `src/screens/SendTokensScreen.tsx:27-34`
**Impact:** Permanent loss of funds
**Status:** NOT FIXED ⚠️
**Action:** Validate DID format properly

### ⚠️ HIGH-5: Hardcoded IP Address
**File:** `src/config.ts:45`
**Impact:** Supply chain attack vector
**Status:** NOT FIXED ⚠️
**Action:** Use domain instead of hardcoded IP

---

## DEPENDENCY VULNERABILITIES

### ⚠️ MODERATE: js-yaml Prototype Pollution
**Package:** js-yaml < 3.14.2 or >= 4.0.0 < 4.1.1
**Impact:** Possible code execution
**Status:** NOT FIXED ⚠️
**Action:** Run `npm audit fix`

---

## MEDIUM-RISK ISSUES

### 🔷 MEDIUM-1: No Biometric Integration
**Status:** Partial implementation exists
**Action:** Use native Keychain biometric APIs

### 🔷 MEDIUM-2: No Jailbreak Detection
**Status:** NOT IMPLEMENTED ⚠️
**Action:** Add jailbreak/root detection

### 🔷 MEDIUM-3: No Certificate Pinning
**Status:** NOT IMPLEMENTED ⚠️
**Action:** Pin SOV node certificates

### 🔷 MEDIUM-4: Weak RNG for Random Selection
**File:** `src/screens/SeedPhraseScreen.tsx`
**Status:** Uses `Math.random()` - NOT SECURE
**Action:** Use cryptographically secure RNG

---

## VERIFICATION CHECKLIST

Use this to verify fixes:

### Pre-Release Verification

```bash
# 1. Check for seed phrase logging
grep -r "seedPhrases" src/ | grep console
# Expected: 0 results

# 2. Check for dev bypass
grep -r "DEV BYPASS" src/
# Expected: 0 results

# 3. Check QUIC config
grep "insecure.*true" src/services/RealAuthService.ts
# Expected: 0 results with hardcoded true

# 4. Run dependency audit
npm audit
# Expected: 0 vulnerabilities

# 5. Run TypeScript check
npm run type-check
# Expected: 0 errors

# 6. Run tests
npm test
# Expected: All tests pass

# 7. Run linter
npm run lint
# Expected: 0 errors
```

---

## PRIORITY ACTION ITEMS

### This Week (CRITICAL):
- [ ] Remove seed phrase logging
- [ ] Implement Keychain storage
- [ ] Fix QUIC certificate validation
- [ ] Remove dev bypass
- [ ] Fix npm audit vulnerabilities

### Next Week (HIGH):
- [ ] Implement rate limiting
- [ ] Enhance password policy
- [ ] Disable HTTP fallback
- [ ] Implement DID validation
- [ ] Add certificate pinning

### Next 2 Weeks (MEDIUM):
- [ ] Integrate biometric properly
- [ ] Add jailbreak detection
- [ ] Implement secure RNG
- [ ] Code review with security team

---

## QUICK FIX TEMPLATES

### Fix Template 1: Remove Seed Logging
```typescript
// BEFORE
console.log('🔑 seedPhrases object:', identity?.seedPhrases);

// AFTER
if (__DEV__) {
  console.log('✅ Identity created with seed phrases');
}
```

### Fix Template 2: Use Keychain
```typescript
// BEFORE
await storage.setItem('zhtp_identity', JSON.stringify(identity));

// AFTER
import * as Keychain from 'react-native-keychain';
await Keychain.setGenericPassword(
  'identity_data',
  JSON.stringify(identity),
  { securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE }
);
```

### Fix Template 3: Fix QUIC Config
```typescript
// BEFORE
insecure: true,  // Hardcoded!

// AFTER
insecure: __DEV__,  // Only in development
```

### Fix Template 4: Remove Dev Bypass
```typescript
// BEFORE
const handleDevBypass = async () => {
  console.log('[SignIn] 🚧 DEV BYPASS - Skipping authentication');
  const mockIdentity = { ... };
  await setCurrentIdentity(mockIdentity);
};

// AFTER (DELETE ENTIRE FUNCTION)
// No dev bypass allowed
```

---

## SECURITY SCORE PROGRESSION

**Current:** 52/100 (CRITICAL)
**After Phase 1 (Critical fixes):** ~70/100
**After Phase 2 (High fixes):** ~78/100
**After Phase 3 (Medium fixes):** ~85/100
**Production Target:** 90+/100

---

## FILES TO REVIEW

### Critical Priority:
1. `src/screens/CreateIdentityScreen.tsx` - Logging issue
2. `src/context/AuthContext.tsx` - Storage issue
3. `src/services/RealAuthService.ts` - QUIC certificate issue
4. `src/screens/SignInScreen.tsx` - Dev bypass
5. `src/config.ts` - QUIC configuration

### High Priority:
6. `src/services/QuicFetchAdapter.ts` - HTTP fallback
7. `src/screens/SendTokensScreen.tsx` - Validation
8. `src/services/RateLimiter.ts` - NEW: Rate limiting

### Medium Priority:
9. `src/services/SeedVaultService.ts` - Biometric
10. `src/utils/passwordValidator.ts` - NEW: Password policy

---

## TESTING COMMANDS

```bash
# Run all tests
npm test

# Run specific test file
npm test -- CreateIdentityScreen.test.ts

# Run with coverage
npm test -- --coverage

# Run security-focused tests only
npm test -- --testPathPattern="security"

# Check TypeScript
npx tsc --noEmit

# Check for unused code
npm run lint

# Audit dependencies
npm audit
npm audit --fix

# Check specific file for issues
grep -r "password\|secret\|key" src/screens/ | grep console
```

---

## INCIDENT RESPONSE

### If App is Compromised:
1. Take app offline immediately
2. Alert all users to change passwords
3. Force seed phrase reset
4. Conduct forensic analysis
5. Release security patch
6. Require app update before usage

### If Seed Phrases Exposed:
1. All user identities compromised
2. Immediate wallet migration required
3. Legal/regulatory notification needed
4. Insurance claim process

---

## RESOURCES

- Full Security Assessment: `SECURITY_ASSESSMENT_REPORT.md`
- Remediation Roadmap: `SECURITY_REMEDIATION_ROADMAP.md`
- React Native Security: https://reactnative.dev/docs/security
- OWASP Mobile Top 10: https://owasp.org/www-project-mobile-top-10/
- NIST Guidelines: https://pages.nist.gov/800-63-3/

---

## CONTACTS

- Security Engineer: [Your Name]
- Engineering Lead: [Name]
- Security Officer: [Name]

---

## SIGN-OFF

**Current Status:** ❌ NOT APPROVED FOR PRODUCTION

This application has CRITICAL security vulnerabilities that must be fixed before any production deployment.

**Date Assessed:** December 29, 2025
**Assessed By:** Security Engineering Team
**Next Review:** After Phase 1 completion

