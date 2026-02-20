# PoUW Deployment Guide

## Prerequisites
- Xcode 15+ (iOS)
- Android Studio Hedgehog+ (Android)
- Node endpoints deployed
- Test vectors validated

## iOS Deployment

### 1. Build Configuration
```bash
cd ios
pod install
# Verify SwiftProtobuf is linked
```

### 2. Archive Build
- Select "Any iOS Device"
- Product → Archive
- Validate App
- Distribute App (TestFlight)

### 3. TestFlight
- Internal testing (team)
- External testing (beta users)
- Collect feedback
- Monitor crash logs

### 4. Production
- App Store review submission
- Phased release (1%, 5%, 25%, 100%)
- Monitor metrics

## Android Deployment

### 1. Build Configuration
```bash
cd android
./gradlew assembleRelease
# Verify protobuf-kotlin is included
```

### 2. Signing
- Use release keystore
- Verify APK signature

### 3. Play Console
- Upload AAB to Internal Testing
- Promote to Beta
- Promote to Production (phased)

## Configuration

### Node Endpoints
```
POUW_CHALLENGE_ENDPOINT=/pouw/challenge
POUW_SUBMIT_ENDPOINT=/pouw/submit
QUIC_ALPN=public
```

### Rate Limits (Client-Side)
```
MAX_CHALLENGE_PER_MINUTE=50
MAX_SUBMIT_PER_MINUTE=50
MAX_BATCH_SIZE=100
```

## Rollback Plan

### Criteria for Rollback
- Error rate > 5%
- Crash rate > 1%
- Node rejection rate > 10%
- User complaints

### Rollback Steps
1. Halt rollout
2. Deploy previous version
3. Investigate issue
4. Fix and redeploy
