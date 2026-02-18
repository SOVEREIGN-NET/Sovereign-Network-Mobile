#!/bin/bash
# Security audit script for PoUW
# Usage: ./scripts/security_audit.sh [--verbose]

set -euo pipefail

VERBOSE=0
if [[ "${1:-}" == "--verbose" ]]; then
    VERBOSE=1
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
ISSUES_FOUND=0
WARNINGS_FOUND=0

echo "=== PoUW Security Audit ==="
echo "Date: $(date)"
echo ""

# Helper function for logging
log_info() {
    if [[ $VERBOSE -eq 1 ]]; then
        echo -e "${GREEN}[INFO]${NC} $1"
    fi
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((WARNINGS_FOUND++))
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    ((ISSUES_FOUND++))
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

# Check for hardcoded secrets
echo "[*] Checking for hardcoded keys/secrets..."
PATTERNS=(
    "private.*key"
    "secret.*key"
    "password.*="
    "api_key"
    "apikey"
    "access_token"
    "private_key.*hardcoded"
    "sk-"
    "dilithium.*secret"
)

SECRETS_FOUND=0
for pattern in "${PATTERNS[@]}"; do
    if grep -ri --include="*.swift" --include="*.kt" --include="*.m" --include="*.java" \
        "$pattern" ios/ android/ src/ 2>/dev/null | grep -v "//.*$pattern\|#.*$pattern\|Example\|Test\|Mock" | head -5; then
        ((SECRETS_FOUND++))
    fi
done

if [[ $SECRETS_FOUND -eq 0 ]]; then
    log_pass "No hardcoded keys or secrets found"
else
    log_error "Potential hardcoded secrets detected ($SECRETS_FOUND patterns found)"
fi
echo ""

# Check for debug logging
echo "[*] Checking for debug logging..."

# iOS NSLog checks
if command -v grep &>/dev/null; then
    IOS_LOG_COUNT=$(find ios -name "*.swift" -o -name "*.m" -o -name "*.mm" 2>/dev/null | xargs grep -l "NSLog\|print(" 2>/dev/null | wc -l || echo 0)
    if [[ $IOS_LOG_COUNT -gt 0 ]]; then
        log_warn "Found $IOS_LOG_COUNT iOS files with NSLog/print statements"
        if [[ $VERBOSE -eq 1 ]]; then
            find ios -name "*.swift" -o -name "*.m" -o -name "*.mm" 2>/dev/null | xargs grep -n "NSLog\|print(" 2>/dev/null | head -10 || true
        fi
    else
        log_pass "No NSLog/print statements found in iOS code"
    fi

    # Android Log checks
    ANDROID_LOG_COUNT=$(find android -name "*.kt" -o -name "*.java" 2>/dev/null | xargs grep -l "Log\.d\|Log\.v\|Log\.i\|System\.out\.print" 2>/dev/null | grep -v "test\|Test" | wc -l || echo 0)
    if [[ $ANDROID_LOG_COUNT -gt 0 ]]; then
        log_warn "Found $ANDROID_LOG_COUNT Android files with debug logging"
        if [[ $VERBOSE -eq 1 ]]; then
            find android -name "*.kt" -o -name "*.java" 2>/dev/null | xargs grep -n "Log\.d\|Log\.v\|Log\.i\|System\.out\.print" 2>/dev/null | grep -v "test\|Test" | head -10 || true
        fi
    else
        log_pass "No debug logging found in Android code"
    fi
fi
echo ""

# Check for HTTP usage (should be QUIC only)
echo "[*] Checking for HTTP/HTTPS usage..."
HTTP_PATTERNS=("http://" "https://" "URLSession.*http" "OkHttp" "HttpURLConnection")
HTTP_FOUND=0

for pattern in "${HTTP_PATTERNS[@]}"; do
    if grep -ri "$pattern" ios/ android/ src/ 2>/dev/null | grep -v "//\|#\|Example\|Test\|README\|docs" | head -3; then
        ((HTTP_FOUND++))
    fi
done

if [[ $HTTP_FOUND -eq 0 ]]; then
    log_pass "No HTTP/HTTPS usage found (QUIC only)"
else
    log_warn "Potential HTTP usage detected ($HTTP_FOUND patterns) - verify QUIC-only policy"
fi
echo ""

# Check RN boundary (crypto should not be in RN layer)
echo "[*] Checking React Native boundary..."
RN_CRYPTO_PATTERNS=("crypto" "sign" "receipt.*create" "privateKey" "dilithium")
RN_CRYPTO_FOUND=0

for pattern in "${RN_CRYPTO_PATTERNS[@]}"; do
    if grep -ri "$pattern" src/native/ 2>/dev/null | head -3; then
        ((RN_CRYPTO_FOUND++))
    fi
done

if [[ $RN_CRYPTO_FOUND -eq 0 ]]; then
    log_pass "RN boundary clean - no cryptographic code in native bridge"
else
    log_warn "Potential cryptographic code found in RN native bridge"
fi
echo ""

# Check for certificate pinning configuration
echo "[*] Checking certificate pinning..."
PINNING_PATTERNS=("pinning" "certificatePinning" "SSLPinning" "publicKeyPin" "SPKI")
PINNING_FOUND=0

for pattern in "${PINNING_PATTERNS[@]}"; do
    if grep -ri "$pattern" ios/ android/ 2>/dev/null | head -1; then
        ((PINNING_FOUND++))
    fi
done

if [[ $PINNING_FOUND -eq 0 ]]; then
    log_warn "Certificate pinning not detected (optional but recommended)"
else
    log_pass "Certificate pinning configuration found"
fi
echo ""

# Check for proper error handling (no sensitive data leakage)
echo "[*] Checking error handling..."
ERROR_LEAK_PATTERNS=("password.*error\|secret.*error\|key.*error" "error.*password\|error.*secret")
LEAKS_FOUND=0

for pattern in "${ERROR_LEAK_PATTERNS[@]}"; do
    if grep -ri "$pattern" ios/ android/ src/ 2>/dev/null | head -3; then
        ((LEAKS_FOUND++))
    fi
done

if [[ $LEAKS_FOUND -eq 0 ]]; then
    log_pass "No sensitive data in error messages detected"
else
    log_warn "Potential sensitive data in error messages"
fi
echo ""

# Check for TODO/FIXME related to security
echo "[*] Checking for security TODOs..."
SECURITY_TODOS=$(grep -ri "TODO.*secur\|FIXME.*secur\|TODO.*crypto\|FIXME.*crypto\|TODO.*key\|FIXME.*key" ios/ android/ src/ 2>/dev/null | wc -l || echo 0)
if [[ $SECURITY_TODOS -gt 0 ]]; then
    log_warn "Found $SECURITY_TODOS security-related TODOs/FIXMEs"
    grep -ri "TODO.*secur\|FIXME.*secur\|TODO.*crypto\|FIXME.*crypto\|TODO.*key\|FIXME.*key" ios/ android/ src/ 2>/dev/null | head -5 || true
else
    log_pass "No security-related TODOs found"
fi
echo ""

# Check for weak cryptographic algorithms
echo "[*] Checking for weak cryptography..."
WEAK_CRYPTO=("MD5" "SHA1" "DES" "RC4" "RSA.*1024" "ECB")
WEAK_FOUND=0

for algo in "${WEAK_CRYPTO[@]}"; do
    if grep -ri "$algo" ios/ android/ 2>/dev/null | grep -v "//\|#\|deprecated\|legacy" | head -3; then
        log_warn "Potential weak algorithm found: $algo"
        ((WEAK_FOUND++))
    fi
done

if [[ $WEAK_FOUND -eq 0 ]]; then
    log_pass "No weak cryptographic algorithms detected"
fi
echo ""

# Check file permissions
echo "[*] Checking file permissions..."
WORLD_WRITABLE=$(find ios android src -type f -perm -002 2>/dev/null | wc -l || echo 0)
if [[ $WORLD_WRITABLE -gt 0 ]]; then
    log_warn "Found $WORLD_WRITABLE world-writable files"
else
    log_pass "No world-writable files found"
fi
echo ""

# Check for .env files with secrets
echo "[*] Checking for .env files..."
ENV_FILES=$(find . -name ".env*" -type f 2>/dev/null | grep -v node_modules | wc -l || echo 0)
if [[ $ENV_FILES -gt 0 ]]; then
    log_warn "Found $ENV_FILES .env files - ensure secrets are not committed"
    if [[ $VERBOSE -eq 1 ]]; then
        find . -name ".env*" -type f 2>/dev/null | grep -v node_modules | head -5
    fi
else
    log_pass "No .env files found in repository"
fi
echo ""

# Summary
echo "=== Audit Summary ==="
echo "Issues Found: $ISSUES_FOUND"
echo "Warnings: $WARNINGS_FOUND"
echo ""

if [[ $ISSUES_FOUND -eq 0 && $WARNINGS_FOUND -eq 0 ]]; then
    echo -e "${GREEN}✓ All security checks passed!${NC}"
    exit 0
elif [[ $ISSUES_FOUND -eq 0 ]]; then
    echo -e "${YELLOW}⚠ Security checks passed with warnings${NC}"
    exit 0
else
    echo -e "${RED}✗ Security issues found - please review${NC}"
    exit 1
fi
