#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$ROOT_DIR/build"
OUTPUT_DIR="$ROOT_DIR/UhpFFI.xcframework"
HEADERS_DIR="$ROOT_DIR/include"

if [[ -f "$HOME/.cargo/env" ]]; then
  . "$HOME/.cargo/env"
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "error: cargo not found in PATH. Ensure Rust is installed." >&2
  exit 1
fi

mkdir -p "$BUILD_DIR"

pushd "$ROOT_DIR" >/dev/null

echo "[uhp-ffi] Building iOS device (aarch64-apple-ios)..."
cargo build --release --target aarch64-apple-ios
cp "$ROOT_DIR/target/aarch64-apple-ios/release/libuhp_ffi.a" "$BUILD_DIR/libuhp_ffi_ios.a"

echo "[uhp-ffi] Building iOS simulator (aarch64-apple-ios-sim)..."
cargo build --release --target aarch64-apple-ios-sim
cp "$ROOT_DIR/target/aarch64-apple-ios-sim/release/libuhp_ffi.a" "$BUILD_DIR/libuhp_ffi_ios_sim.a"

rm -rf "$OUTPUT_DIR"

echo "[uhp-ffi] Creating XCFramework..."
xcodebuild -create-xcframework   -library "$BUILD_DIR/libuhp_ffi_ios.a"   -headers "$HEADERS_DIR"   -library "$BUILD_DIR/libuhp_ffi_ios_sim.a"   -headers "$HEADERS_DIR"   -output "$OUTPUT_DIR"

popd >/dev/null

echo "[uhp-ffi] XCFramework ready: $OUTPUT_DIR"
