#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${ROOT_DIR%/uhp-ffi}"
BUILD_DIR="$ROOT_DIR/build"
mkdir -p "$BUILD_DIR"

if [[ -f "$HOME/.cargo/env" ]]; then
  . "$HOME/.cargo/env"
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "error: cargo not found in PATH. Ensure Rust is installed and available to Xcode." >&2
  exit 1
fi

PLATFORM_NAME=${PLATFORM_NAME:-""}
ARCHS=${ARCHS:-""}

if [[ "$PLATFORM_NAME" == "iphoneos" ]]; then
  TARGET="aarch64-apple-ios"
elif [[ "$PLATFORM_NAME" == "iphonesimulator" ]]; then
  if [[ "$ARCHS" == *"arm64"* ]]; then
    TARGET="aarch64-apple-ios-sim"
  else
    TARGET="x86_64-apple-ios"
  fi
else
  TARGET="aarch64-apple-ios"
fi
# Xcode sometimes passes a trailing "-" in platform-related env; strip it.
TARGET="${TARGET%-}"

pushd "$ROOT_DIR" >/dev/null
cargo build --release --target "$TARGET"
cp "target/$TARGET/release/libuhp_ffi.a" "$BUILD_DIR/libuhp_ffi.a"
popd >/dev/null
