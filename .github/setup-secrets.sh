#!/bin/bash

# GitHub Secrets Setup Script for Google Play Console Automation
# This script encodes your credentials and provides commands to add them to GitHub Secrets

set -e

echo "=========================================="
echo "Google Play Console - GitHub Secrets Setup"
echo "=========================================="
echo ""

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed."
    echo "   Install from: https://cli.github.com"
    exit 1
fi

# Variables
# Credentials are read from android/vault/release-keystore-credentials.txt (gitignored)
# or from environment variables.
VAULT_FILE="android/vault/release-keystore-credentials.txt"
if [[ -f "$VAULT_FILE" ]]; then
  source "$VAULT_FILE"
fi

SERVICE_ACCOUNT_JSON="${GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH:?GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH must be set to the path of your service account JSON file}"
RELEASE_KEYSTORE="android/app/release.keystore"
KEYSTORE_PASSWORD="${RELEASE_KEYSTORE_PASSWORD:?RELEASE_KEYSTORE_PASSWORD is not set. See android/vault/release-keystore-credentials.txt}"
RELEASE_KEY_ALIAS="${RELEASE_KEY_ALIAS:-release-key}"
RELEASE_KEY_PASSWORD="${RELEASE_KEY_PASSWORD:?RELEASE_KEY_PASSWORD is not set. See android/vault/release-keystore-credentials.txt}"

echo "📝 Preparing GitHub Secrets..."
echo ""

# 1. Encode keystore file to base64
if [[ ! -f "$RELEASE_KEYSTORE" ]]; then
    echo "❌ Error: $RELEASE_KEYSTORE not found!"
    exit 1
fi

echo "✓ Found release keystore: $RELEASE_KEYSTORE"
KEYSTORE_B64=$(base64 < "$RELEASE_KEYSTORE")

# 2. Encode service account JSON
if [[ ! -f "$SERVICE_ACCOUNT_JSON" ]]; then
    echo "❌ Error: $SERVICE_ACCOUNT_JSON not found!"
    exit 1
fi

echo "✓ Found service account JSON: $SERVICE_ACCOUNT_JSON"
SERVICE_ACCOUNT_B64=$(base64 < "$SERVICE_ACCOUNT_JSON")

echo ""
echo "=========================================="
echo "Adding Secrets to GitHub..."
echo "=========================================="
echo ""

# Add secrets using GitHub CLI
gh secret set RELEASE_KEYSTORE_FILE --body "$KEYSTORE_B64"
echo "✓ Added RELEASE_KEYSTORE_FILE"

gh secret set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON --body "$(cat "$SERVICE_ACCOUNT_JSON")"
echo "✓ Added GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"

gh secret set RELEASE_KEYSTORE_PASSWORD --body "$KEYSTORE_PASSWORD"
echo "✓ Added RELEASE_KEYSTORE_PASSWORD"

gh secret set RELEASE_KEY_ALIAS --body "$RELEASE_KEY_ALIAS"
echo "✓ Added RELEASE_KEY_ALIAS"

gh secret set RELEASE_KEY_PASSWORD --body "$RELEASE_KEY_PASSWORD"
echo "✓ Added RELEASE_KEY_PASSWORD"

echo ""
echo "=========================================="
echo "✅ All secrets added successfully!"
echo "=========================================="
echo ""
echo "📋 Next steps:"
echo "1. Go to: https://github.com/$(gh repo view --json nameWithOwner -q)/settings/secrets/actions"
echo "2. Verify all secrets are present"
echo "3. Push a tag (v1.1.0) or use workflow_dispatch to test"
echo ""