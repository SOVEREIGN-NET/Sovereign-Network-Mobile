#!/usr/bin/env bash
# =============================================================================
# Sovereign Network Mobile — Environment Setup Script
# =============================================================================
# Detects your OS and Android SDK location, then prints the environment
# variables you need to set for building.
#
# Usage:
#   ./scripts/setup-env.sh           # prints instructions
#   eval "$(./scripts/setup-env.sh)"  # auto-exports (bash/zsh)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🔍 Sovereign Network Mobile — Environment Setup"
echo ""
echo "========================================"
echo "  Detecting Android SDK..."
echo "========================================"

ANDROID_HOME=""

# --- macOS ---
if [[ "$(uname -s)" == "Darwin" ]]; then
    if [[ -d "$HOME/Library/Android/sdk" ]]; then
        ANDROID_HOME="$HOME/Library/Android/sdk"
    fi

# --- Linux (including WSL) ---
elif [[ "$(uname -s)" == "Linux" ]]; then
    if [[ -d "$HOME/Android/Sdk" ]]; then
        ANDROID_HOME="$HOME/Android/Sdk"
    elif [[ -d "$HOME/.android/sdk" ]]; then
        ANDROID_HOME="$HOME/.android/sdk"
    fi
    # WSL: check Windows SDK mount
    if [[ -z "$ANDROID_HOME" ]]; then
        for user_path in /mnt/c/Users/*/AppData/Local/Android/Sdk; do
            if [[ -d "$user_path" ]]; then
                ANDROID_HOME="$user_path"
                echo "  (detected Windows SDK from WSL mount)"
                break
            fi
        done
    fi

# --- Windows (Git Bash / MSYS2 / Cygwin) ---
elif [[ "$(uname -s)" == MINGW* || "$(uname -s)" == MSYS* || "$(uname -s)" == CYGWIN* ]]; then
    LOCALAPPDATA=$(cygpath -u "$LOCALAPPDATA" 2>/dev/null || echo "$HOME/AppData/Local")
    if [[ -d "$LOCALAPPDATA/Android/Sdk" ]]; then
        ANDROID_HOME="$(cygpath -w "$LOCALAPPDATA/Android/Sdk" 2>/dev/null || echo "$LOCALAPPDATA/Android/Sdk")"
    fi
fi

# --- Results ---
if [[ -z "$ANDROID_HOME" ]]; then
    echo "  ❌ Android SDK not found at any standard location."
    echo ""
    echo "  Install Android Studio with the Android SDK, or set ANDROID_HOME manually."
    echo "  Common locations:"
    echo "    macOS:   ~/Library/Android/sdk"
    echo "    Linux:   ~/Android/Sdk"
    echo "    Windows: %LOCALAPPDATA%\\Android\\Sdk"
    echo ""
    echo "  Then re-run this script."
    exit 1
fi

echo "  ✅ Android SDK found: $ANDROID_HOME"
echo ""

# --- Detect NDK ---
echo "========================================"
echo "  Detecting Android NDK..."
echo "========================================"

NDK_HOME=""
if [[ -n "${ANDROID_NDK_HOME:-}" ]]; then
    NDK_HOME="$ANDROID_NDK_HOME"
elif ls "$ANDROID_HOME/ndk/"*/  >/dev/null 2>&1; then
    NDK_HOME=$(ls -d "$ANDROID_HOME/ndk/"* 2>/dev/null | sort -V | tail -1)
fi

if [[ -z "$NDK_HOME" || ! -d "$NDK_HOME" ]]; then
    echo "  ⚠️  NDK not found under $ANDROID_HOME/ndk/"
    echo "  Install the NDK via Android Studio: SDK Manager → SDK Tools → NDK"
    echo ""
else
    echo "  ✅ Android NDK found: $NDK_HOME"
    echo ""
fi

# --- Print export commands ---
echo "========================================"
echo "  📋 Add these to your shell profile"
echo "========================================"
echo ""

case "$(uname -s)" in
    Darwin|Linux)
        echo "  export ANDROID_HOME=\"$ANDROID_HOME\""
        if [[ -n "$NDK_HOME" ]]; then
            echo "  export ANDROID_NDK_HOME=\"$NDK_HOME\""
        fi
        if [[ "$(uname -s)" == "Linux" ]]; then
            echo "  export ANDROID_NDK_HOST_TAG=\"linux-x86_64\""
        fi
        echo ""
        echo "  # Add to ~/.bashrc or ~/.zshrc:"
        echo "  echo 'export ANDROID_HOME=\"$ANDROID_HOME\"' >> ~/.bashrc"
        if [[ -n "$NDK_HOME" ]]; then
            echo "  echo 'export ANDROID_NDK_HOME=\"$NDK_HOME\"' >> ~/.bashrc"
        fi
        ;;
    MINGW*|MSYS*|CYGWIN*)
        WIN_PATH=$(cygpath -w "$ANDROID_HOME" 2>/dev/null || echo "$ANDROID_HOME")
        echo "  setx ANDROID_HOME \"$WIN_PATH\""
        if [[ -n "$NDK_HOME" ]]; then
            WIN_NDK=$(cygpath -w "$NDK_HOME" 2>/dev/null || echo "$NDK_HOME")
            echo "  setx ANDROID_NDK_HOME \"$WIN_NDK\""
        fi
        ;;
esac

echo ""
echo "========================================"
echo "  ✅ Done! Close and reopen your terminal,"
echo "     then run: cd android && ./gradlew assembleDebug"
echo "========================================"