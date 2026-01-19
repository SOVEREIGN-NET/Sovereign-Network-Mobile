#!/bin/bash
# Build lib-client for iOS with C FFI exports and post-quantum crypto support
# Usage: ./scripts/build-lib-client-ios.sh

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PATCH_FILE="$PROJECT_ROOT/patches/lib-client-ios-ffi.patch"
LIB_CLIENT_DIR="$PROJECT_ROOT/../The-Sovereign-Network"
IOS_LIB_DIR="$PROJECT_ROOT/ios/lib-client"

echo "📦 Building lib-client for iOS..."
echo "   Project root: $PROJECT_ROOT"
echo "   lib-client source: $LIB_CLIENT_DIR"
echo "   iOS output: $IOS_LIB_DIR"
echo ""

# Verify patch file exists
if [ ! -f "$PATCH_FILE" ]; then
  echo "❌ ERROR: Patch file not found at $PATCH_FILE"
  exit 1
fi

# Verify lib-client exists
if [ ! -d "$LIB_CLIENT_DIR/lib-client" ]; then
  echo "❌ ERROR: lib-client not found at $LIB_CLIENT_DIR/lib-client"
  exit 1
fi

# Verify iOS output directory exists
if [ ! -d "$IOS_LIB_DIR" ]; then
  echo "❌ ERROR: iOS lib directory not found at $IOS_LIB_DIR"
  exit 1
fi

cd "$LIB_CLIENT_DIR"

echo "🔄 Checking lib-client status..."

# Check if we're on development branch, if not reset to it
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "development" ] && [ "$CURRENT_BRANCH" != "feat/ios-c-ffi-exports" ]; then
  echo "⚠️  Switching to development branch..."
  git checkout development
fi

# Check if patch is already applied by looking for one of the added functions
if grep -q "zhtp_client_identity_get_kyber_public_key" lib-client/src/lib.rs; then
  echo "✅ iOS C FFI exports already applied"
else
  echo "📝 Applying iOS C FFI patch..."
  git apply "$PATCH_FILE" 2>/dev/null || {
    echo "⚠️  Patch may already be partially applied, continuing..."
  }
fi

echo ""
echo "🛠️  Building lib-client for aarch64-apple-ios..."
cd lib-client

IPHONEOS_DEPLOYMENT_TARGET=18.5 \
  RUSTFLAGS="-C link-arg=-Wl,-undefined,suppress -C link-arg=-Wl,-flat_namespace" \
  cargo build --release --target aarch64-apple-ios 2>&1 | tail -20

echo ""
echo "📋 Verifying build output..."
# Note: Cargo builds in workspace root target directory, not lib-client/target
WORKSPACE_BUILD_PATH="../target/aarch64-apple-ios/release/libzhtp_client.a"
if [ ! -f "$WORKSPACE_BUILD_PATH" ]; then
  echo "❌ ERROR: Build failed - libzhtp_client.a not found at $WORKSPACE_BUILD_PATH"
  exit 1
fi

BUILD_SIZE=$(du -h "$WORKSPACE_BUILD_PATH" | cut -f1)
echo "✅ Build successful - libzhtp_client.a ($BUILD_SIZE)"

echo ""
echo "📤 Copying library to iOS project..."
cp "$WORKSPACE_BUILD_PATH" "$IOS_LIB_DIR/"
echo "✅ Copied to $IOS_LIB_DIR/libzhtp_client.a"

echo ""
echo "✨ Done! lib-client is ready for iOS"
echo ""
echo "Next steps:"
echo "  1. cd $PROJECT_ROOT"
echo "  2. pod install"
echo "  3. Open Xcode and build"
