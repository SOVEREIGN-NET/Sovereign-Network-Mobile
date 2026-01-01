#!/bin/bash

################################################################################
# Build liboqs for iOS (device + simulator)
# Produces: liboqs.xcframework with arm64, arm64-sim, x86_64-sim slices
################################################################################

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
IOS_VENDOR_DIR="$PROJECT_ROOT/ios/vendor"
LIBOQS_SOURCE_DIR="$IOS_VENDOR_DIR/liboqs"
IOS_CMAKE_DIR="$IOS_VENDOR_DIR/ios-cmake"
BUILD_DIR="$IOS_VENDOR_DIR/build"
INSTALL_DIR="$IOS_VENDOR_DIR/install"
DEPLOYMENT_TARGET="15.1"

# Deployment settings
export IPHONEOS_DEPLOYMENT_TARGET=$DEPLOYMENT_TARGET
export SIMULATOR_DEPLOYMENT_TARGET=$DEPLOYMENT_TARGET

log_info "liboqs iOS Build Script"
log_info "======================"
log_info "Source: $LIBOQS_SOURCE_DIR"
log_info "ios-cmake: $IOS_CMAKE_DIR"
log_info "Build dir: $BUILD_DIR"
log_info "Install dir: $INSTALL_DIR"
log_info "Deployment target: $DEPLOYMENT_TARGET"
echo ""

# Check prerequisites
if [ ! -d "$LIBOQS_SOURCE_DIR" ]; then
    log_error "liboqs source not found at $LIBOQS_SOURCE_DIR"
    log_info "Run: git clone https://github.com/open-quantum-safe/liboqs.git $LIBOQS_SOURCE_DIR"
    exit 1
fi

if [ ! -d "$IOS_CMAKE_DIR" ]; then
    log_error "ios-cmake not found at $IOS_CMAKE_DIR"
    log_info "Run: git clone https://github.com/leetal/ios-cmake.git $IOS_CMAKE_DIR"
    exit 1
fi

if ! command -v cmake &> /dev/null; then
    log_error "CMake not found. Install with: brew install cmake"
    exit 1
fi

if ! command -v ninja &> /dev/null; then
    log_error "Ninja not found. Install with: brew install ninja"
    exit 1
fi

log_info "All prerequisites found ✓"
echo ""

# Function to build a single architecture slice
build_slice() {
    local PLATFORM=$1
    local PLATFORM_DISPLAY=$2
    local BUILD_SUBDIR=$3
    local INSTALL_SUBDIR=$4

    log_info "Building liboqs for $PLATFORM_DISPLAY..."

    local SLICE_BUILD="$BUILD_DIR/$BUILD_SUBDIR"
    local SLICE_INSTALL="$INSTALL_DIR/$INSTALL_SUBDIR"

    # Clean
    rm -rf "$SLICE_BUILD" "$SLICE_INSTALL"
    mkdir -p "$SLICE_BUILD" "$SLICE_INSTALL"

    # Configure
    log_info "  CMake configure..."
    cmake -GNinja \
        -DCMAKE_TOOLCHAIN_FILE="$IOS_CMAKE_DIR/ios.toolchain.cmake" \
        -DPLATFORM="$PLATFORM" \
        -DDEPLOYMENT_TARGET="$DEPLOYMENT_TARGET" \
        -DBUILD_SHARED_LIBS=OFF \
        -DOQS_DIST_BUILD=ON \
        -DOQS_USE_OPENSSL=OFF \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_INSTALL_PREFIX="$SLICE_INSTALL" \
        -B "$SLICE_BUILD" \
        "$LIBOQS_SOURCE_DIR" \
        2>&1 | grep -v "Performing C SOURCE FILE Test" | tail -20

    if [ ${PIPESTATUS[0]} -ne 0 ]; then
        log_error "CMake configuration failed for $PLATFORM_DISPLAY"
        exit 1
    fi

    # Build
    log_info "  Ninja build..."
    ninja -C "$SLICE_BUILD" -v 2>&1 | tail -10

    if [ ${PIPESTATUS[0]} -ne 0 ]; then
        log_error "Ninja build failed for $PLATFORM_DISPLAY"
        exit 1
    fi

    # Install
    log_info "  Installing..."
    ninja -C "$SLICE_BUILD" install > /dev/null 2>&1

    if [ ! -f "$SLICE_INSTALL/lib/liboqs.a" ]; then
        log_error "liboqs.a not found in $SLICE_INSTALL/lib/"
        exit 1
    fi

    # Verify architecture
    local ARCH=$(lipo -info "$SLICE_INSTALL/lib/liboqs.a" | grep -oE "(arm64|x86_64)")
    log_info "  ✓ $PLATFORM_DISPLAY ($ARCH) built successfully"
}

# Build all architectures
log_info "Starting builds..."
echo ""

build_slice "OS64" "iOS Device (arm64)" "ios-arm64" "ios-arm64"
echo ""

build_slice "SIMULATORARM64" "iOS Simulator (arm64)" "sim-arm64" "sim-arm64"
echo ""

build_slice "SIMULATOR64" "iOS Simulator (x86_64)" "sim-x86_64" "sim-x86_64"
echo ""

# Create XCFramework
log_info "Creating XCFramework..."

FRAMEWORK_OUTPUT="$IOS_VENDOR_DIR/liboqs.xcframework"
rm -rf "$FRAMEWORK_OUTPUT"

xcodebuild -create-xcframework \
    -library "$INSTALL_DIR/ios-arm64/lib/liboqs.a" \
    -headers "$INSTALL_DIR/ios-arm64/include" \
    -library "$INSTALL_DIR/sim-arm64/lib/liboqs.a" \
    -headers "$INSTALL_DIR/sim-arm64/include" \
    -library "$INSTALL_DIR/sim-x86_64/lib/liboqs.a" \
    -headers "$INSTALL_DIR/sim-x86_64/include" \
    -output "$FRAMEWORK_OUTPUT" > /dev/null 2>&1

if [ ! -d "$FRAMEWORK_OUTPUT" ]; then
    log_error "XCFramework creation failed"
    exit 1
fi

log_info "✓ XCFramework created at: $FRAMEWORK_OUTPUT"
echo ""

# Verify framework structure
log_info "Framework contents:"
find "$FRAMEWORK_OUTPUT" -type f -name "*.a" | while read lib; do
    ARCH=$(lipo -info "$lib" | grep -oE "(arm64|x86_64|macOS|iOS|simulator)")
    ARCH_DESC=$(lipo -info "$lib" | sed 's/.*: //')
    echo "  ✓ $(basename "$(dirname "$lib")"): $ARCH_DESC"
done

# Create symlink for easy access
ln -sf "vendor/liboqs.xcframework" "$PROJECT_ROOT/ios/liboqs.xcframework" 2>/dev/null || true

echo ""
log_info "=========================================="
log_info "Build complete! ✓"
log_info "=========================================="
echo ""
log_info "Next steps:"
log_info "1. Open ios/SovereignNetworkMobile.xcodeproj in Xcode"
log_info "2. Add liboqs.xcframework to the project:"
log_info "   - Project → Targets → SovereignNetworkMobile"
log_info "   - Build Phases → Link Binary With Libraries"
log_info "   - Add ios/vendor/liboqs.xcframework"
log_info "3. Update bridging header:"
log_info "   - Add: #import <oqs/oqs.h>"
log_info "4. Create ios/liboqs/*.swift wrapper files (see Phase 2)"
echo ""
