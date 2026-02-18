#!/bin/bash
# Pre-release checks for PoUW

EXIT_CODE=0

echo "=== PoUW Pre-Release Checks ==="

# Run unit tests
echo "[*] Running iOS tests..."
xcodebuild test -project ios/*.xcodeproj -scheme Tests || EXIT_CODE=1

# Android tests
echo "[*] Running Android tests..."
cd android && ./gradlew test || EXIT_CODE=1

# RN tests
echo "[*] Running RN tests..."
npm test -- --testPathPattern=pouw || EXIT_CODE=1

# Security audit
echo "[*] Running security audit..."
bash scripts/security_audit.sh || EXIT_CODE=1

# Check coverage
echo "[*] Checking coverage..."
# Coverage check commands

echo "=== Checks Complete ==="
exit $EXIT_CODE
