#!/bin/bash
# Build Android native libraries (quic-jni wrapper + lib-client)
# This builds the quic-jni JNI wrapper which uses lib-client from The-Sovereign-Network
# Requires: Rust nightly with Android targets, Android NDK
#
# Set ANDROID_NDK_HOME to your NDK installation path, e.g.:
#   macOS:     export ANDROID_NDK_HOME=$HOME/Library/Android/sdk/ndk/27.1.12297006
#   Windows:   set ANDROID_NDK_HOME=C:\Users\<USER>\AppData\Local\Android\Sdk\ndk\27.1.12297006
#   Linux:     export ANDROID_NDK_HOME=$HOME/Android/Sdk/ndk/27.1.12297006
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

# When Gradle is launched from Android Studio (or any non-login process)
# rather than a terminal, ~/.cargo/bin is not on PATH — `cargo` then
# isn't found and the build dies confusingly. Source the cargo env /
# prepend its bin dir so this works however Gradle was started.
if [[ -f "$HOME/.cargo/env" ]]; then
    # shellcheck disable=SC1091
    source "$HOME/.cargo/env"
fi
export PATH="$HOME/.cargo/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Android NDK path — must be set explicitly. We no longer fall back to a
# hardcoded macOS path. Provide a helpful error if unset.
NDK_HOME="${ANDROID_NDK_HOME:-}"
if [[ -z "$NDK_HOME" ]]; then
    echo "Error: ANDROID_NDK_HOME is not set." >&2
    echo "Please set it to your NDK installation directory, e.g.:" >&2
    echo "  macOS:   export ANDROID_NDK_HOME=\$HOME/Library/Android/sdk/ndk/27.1.12297006" >&2
    echo "  Windows: setx ANDROID_NDK_HOME C:\\Users\\<USER>\\AppData\\Local\\Android\\Sdk\\ndk\\27.1.12297006" >&2
    echo "  Linux:   export ANDROID_NDK_HOME=\$HOME/Android/Sdk/ndk/27.1.12297006" >&2
    exit 1
fi

if [[ ! -d "$NDK_HOME" ]]; then
    echo "Error: ANDROID_NDK_HOME directory does not exist: $NDK_HOME" >&2
    exit 1
fi

# Detect host tag for NDK prebuilt toolchain directory
HOST_TAG="${ANDROID_NDK_HOST_TAG:-}"
if [[ -z "$HOST_TAG" ]]; then
    case "$(uname -s)" in
        Darwin)
            case "$(uname -m)" in
                arm64|aarch64) HOST_TAG="darwin-arm64" ;;
                *)             HOST_TAG="darwin-x86_64" ;;
            esac
            ;;
        Linux)
            HOST_TAG="linux-x86_64"
            ;;
        MINGW*|MSYS*|CYGWIN*)
            HOST_TAG="windows-x86_64"
            ;;
        *)
            echo "Error: Unknown OS '$(uname -s)' — set ANDROID_NDK_HOST_TAG manually" >&2
            exit 1
            ;;
    esac
fi

TOOLCHAIN="$NDK_HOME/toolchains/llvm/prebuilt/$HOST_TAG"
if [[ ! -d "$TOOLCHAIN" ]]; then
    # Fallback: try common host tags
    for tag in darwin-x86_64 darwin-arm64 linux-x86_64 windows-x86_64; do
        if [[ -d "$NDK_HOME/toolchains/llvm/prebuilt/$tag" ]]; then
            HOST_TAG="$tag"
            TOOLCHAIN="$NDK_HOME/toolchains/llvm/prebuilt/$tag"
            echo "  (auto-detected NDK host tag: $tag)"
            break
        fi
    done
fi

if [[ ! -d "$TOOLCHAIN" ]]; then
    echo "Error: NDK toolchain not found at $TOOLCHAIN" >&2
    echo "Checked ANDROID_NDK_HOME=$NDK_HOME" >&2
    echo "Set ANDROID_NDK_HOME to the correct NDK installation path" >&2
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
echo "   Host tag: $HOST_TAG"
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

    # Export linker paths for .cargo/config.toml environment variable references.
    # These match the { env = "NDK_..." } entries in .cargo/config.toml.
    export NDK_AARCH64_LINKER="$TOOLCHAIN/bin/aarch64-linux-android${api_level}-clang"
    export NDK_ARMV7_LINKER="$TOOLCHAIN/bin/armv7a-linux-androideabi${api_level}-clang"
    export NDK_X86_64_LINKER="$TOOLCHAIN/bin/x86_64-linux-android${api_level}-clang"
    export NDK_I686_LINKER="$TOOLCHAIN/bin/i686-linux-android${api_level}-clang"

    # Build quic-jni (which depends on lib-client from node code).
    # Keep the console quiet on success (tail), but on failure dump the
    # whole log — a bare `| tail -5` once hid a cc-rs toolchain error
    # behind an opaque Gradle "exit value 101" with nothing to act on.
    build_log="$(mktemp -t quic-jni-build.XXXXXX)"
    if cargo build --release --target "$rust_target" > "$build_log" 2>&1; then
        tail -5 "$build_log"
        rm -f "$build_log"
    else
        echo "❌ cargo build failed for $rust_target — full output:" >&2
        cat "$build_log" >&2
        rm -f "$build_log"
        exit 1
    fi

    # Copy .so to jniLibs
    mkdir -p "$OUTPUT_DIR/$android_abi"
    cp "target/$rust_target/release/libquic_jni.so" "$OUTPUT_DIR/$android_abi/"

    echo "✅ $android_abi/libquic_jni.so"
done

echo ""
echo "✨ Build complete"
du -h "$OUTPUT_DIR"/*/libquic_jni.so
