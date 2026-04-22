#!/bin/bash
# Build Android native libraries (quic-jni wrapper + lib-client)
# This builds the quic-jni JNI wrapper which uses lib-client from The-Sovereign-Network
# Requires: Rust nightly with Android targets, Android NDK
#
# lib-client (pulled in via path dep) pins its workspace to nightly in
# `../../../../../../../The-Sovereign-Network/rust-toolchain.toml` because
# transitive deps (e.g. plonky2_field via neural-mesh-compression) use
# nightly-only features. When cargo compiles quic-jni from this directory
# it would otherwise default to stable and fail with E0554 — so we force
# the toolchain here.

set -euo pipefail

# Force nightly to match lib-client's workspace toolchain.
export RUSTUP_TOOLCHAIN="${RUSTUP_TOOLCHAIN:-nightly}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Android NDK path
NDK_HOME="${ANDROID_NDK_HOME:-$HOME/Library/Android/sdk/ndk/27.1.12297006}"
HOST_TAG="${ANDROID_NDK_HOST_TAG:-}"
if [[ -z "$HOST_TAG" ]]; then
    ARCH="$(uname -m)"
    if [[ "$ARCH" = "arm64" ]]; then
        HOST_TAG="darwin-arm64"
    else
        HOST_TAG="darwin-x86_64"
    fi
fi
TOOLCHAIN="$NDK_HOME/toolchains/llvm/prebuilt/$HOST_TAG"
if [[ ! -d "$TOOLCHAIN" ]]; then
    if [[ -d "$NDK_HOME/toolchains/llvm/prebuilt/darwin-x86_64" ]]; then
        HOST_TAG="darwin-x86_64"
    elif [[ -d "$NDK_HOME/toolchains/llvm/prebuilt/darwin-arm64" ]]; then
        HOST_TAG="darwin-arm64"
    fi
    TOOLCHAIN="$NDK_HOME/toolchains/llvm/prebuilt/$HOST_TAG"
fi

if [[ ! -d "$TOOLCHAIN" ]]; then
    echo "Error: NDK toolchain not found at $TOOLCHAIN"
    echo "Set ANDROID_NDK_HOME or NDK_HOME environment variable"
    exit 1
fi

# Output directory for .so files
OUTPUT_DIR="../../jniLibs"

# Android targets: rust_target:android_abi:clang_prefix:api_level
TARGETS=(
    "aarch64-linux-android:arm64-v8a:aarch64-linux-android:24"
    "armv7-linux-androideabi:armeabi-v7a:armv7a-linux-androideabi:24"
    "x86_64-linux-android:x86_64:x86_64-linux-android:24"
)

echo "📱 Building quic-jni for Android"
echo "   NDK: $NDK_HOME"
echo "   Output: $OUTPUT_DIR"
echo ""

if [[ -n "${ANDROID_ABIS:-}" ]]; then
    IFS=',' read -r -a ABI_LIST <<< "$ANDROID_ABIS"
    FILTERED_TARGETS=()
    for target_info in "${TARGETS[@]}"; do
        IFS=':' read -r rust_target android_abi clang_prefix api_level <<< "$target_info"
        for abi in "${ABI_LIST[@]}"; do
            if [[ "$android_abi" = "$abi" ]]; then
                FILTERED_TARGETS+=("$target_info")
            fi
        done
    done
    TARGETS=("${FILTERED_TARGETS[@]}")
fi

for target_info in "${TARGETS[@]}"; do
    IFS=':' read -r rust_target android_abi clang_prefix api_level <<< "$target_info"

    echo "🔨 Building for $rust_target ($android_abi)..."

    # Set environment for cross-compilation
    export CC="$TOOLCHAIN/bin/${clang_prefix}${api_level}-clang"
    export CXX="$TOOLCHAIN/bin/${clang_prefix}${api_level}-clang++"
    export AR="$TOOLCHAIN/bin/llvm-ar"
    export RANLIB="$TOOLCHAIN/bin/llvm-ranlib"
    export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$TOOLCHAIN/bin/${clang_prefix}${api_level}-clang"
    export CARGO_TARGET_ARMV7_LINUX_ANDROIDEABI_LINKER="$TOOLCHAIN/bin/${clang_prefix}${api_level}-clang"
    export CARGO_TARGET_X86_64_LINUX_ANDROID_LINKER="$TOOLCHAIN/bin/${clang_prefix}${api_level}-clang"

    # Build quic-jni (which depends on lib-client from node code)
    cargo build --release --target "$rust_target" 2>&1 | tail -5

    # Copy .so to jniLibs
    mkdir -p "$OUTPUT_DIR/$android_abi"
    cp "target/$rust_target/release/libquic_jni.so" "$OUTPUT_DIR/$android_abi/"

    echo "✅ $android_abi/libquic_jni.so"
done

echo ""
echo "✨ Build complete"
du -h "$OUTPUT_DIR"/*/libquic_jni.so
