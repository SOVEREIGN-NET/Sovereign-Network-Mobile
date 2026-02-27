#!/bin/bash

# Bump iOS/Android versions consistently.
# Usage:
#   ./scripts/bump-version.sh [build|patch|minor|major] [--dry-run]
#
# Modes:
#   build (default): set a paired build number on both platforms (max+1)
#   patch/minor/major: bump semantic version + set paired build number

set -euo pipefail

ANDROID_GRADLE="android/app/build.gradle"
IOS_PBXPROJ="ios/SovereignNetworkMobile.xcodeproj/project.pbxproj"

MODE="build"
DRY_RUN="false"

for arg in "${@:-}"; do
  case "$arg" in
    build|patch|minor|major)
      MODE="$arg"
      ;;
    --dry-run)
      DRY_RUN="true"
      ;;
    --help|-h)
      cat <<'EOF'
Usage: ./scripts/bump-version.sh [build|patch|minor|major] [--dry-run]

Modes:
  build  Set paired iOS/Android build numbers to max(current)+1 (default)
  patch  Bump X.Y.Z -> X.Y.(Z+1), plus paired build numbers
  minor  Bump X.Y.Z -> X.(Y+1).0, plus paired build numbers
  major  Bump X.Y.Z -> (X+1).0.0, plus paired build numbers
EOF
      exit 0
      ;;
    "")
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

bump_semver() {
  local version="$1"
  local part="$2"
  local major minor patch
  IFS='.' read -r major minor patch <<<"$version"
  case "$part" in
    patch) patch=$((patch + 1)) ;;
    minor) minor=$((minor + 1)); patch=0 ;;
    major) major=$((major + 1)); minor=0; patch=0 ;;
    *) echo "Invalid semver part: $part" >&2; exit 1 ;;
  esac
  echo "${major}.${minor}.${patch}"
}

ANDROID_VERSION_CODE=$(grep -Eo 'versionCode[[:space:]]+[0-9]+' "$ANDROID_GRADLE" | head -1 | awk '{print $2}')
ANDROID_VERSION_NAME=$(grep -Eo 'versionName "[^"]+"' "$ANDROID_GRADLE" | head -1 | sed -E 's/versionName "([^"]+)"/\1/')
IOS_BUILD_NUMBER=$(grep -Eo 'CURRENT_PROJECT_VERSION = [0-9]+' "$IOS_PBXPROJ" | head -1 | awk '{print $3}')
IOS_MARKETING_VERSION=$(grep -Eo 'MARKETING_VERSION = [0-9]+(\.[0-9]+){1,2}' "$IOS_PBXPROJ" | head -1 | awk '{print $3}')

ANDROID_BASE_VERSION="${ANDROID_VERSION_NAME%%-*}"
if [[ "$ANDROID_BASE_VERSION" =~ ^[0-9]+\.[0-9]+$ ]]; then
  ANDROID_BASE_VERSION="${ANDROID_BASE_VERSION}.0"
fi
if [[ "$IOS_MARKETING_VERSION" =~ ^[0-9]+\.[0-9]+$ ]]; then
  IOS_MARKETING_VERSION="${IOS_MARKETING_VERSION}.0"
fi

if [[ ! "$ANDROID_BASE_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Could not parse Android versionName semver: $ANDROID_VERSION_NAME" >&2
  exit 1
fi
if [[ ! "$IOS_MARKETING_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Could not parse iOS MARKETING_VERSION semver: $IOS_MARKETING_VERSION" >&2
  exit 1
fi

if (( ANDROID_VERSION_CODE > IOS_BUILD_NUMBER )); then
  NEW_SHARED_BUILD_NUMBER=$((ANDROID_VERSION_CODE + 1))
else
  NEW_SHARED_BUILD_NUMBER=$((IOS_BUILD_NUMBER + 1))
fi
NEW_ANDROID_VERSION_CODE=$NEW_SHARED_BUILD_NUMBER
NEW_IOS_BUILD_NUMBER=$NEW_SHARED_BUILD_NUMBER
NEW_ANDROID_VERSION_NAME="$ANDROID_VERSION_NAME"
NEW_IOS_MARKETING_VERSION="$IOS_MARKETING_VERSION"

if [[ "$MODE" != "build" ]]; then
  NEW_ANDROID_VERSION_NAME=$(bump_semver "$ANDROID_BASE_VERSION" "$MODE")
  NEW_IOS_MARKETING_VERSION=$(bump_semver "$IOS_MARKETING_VERSION" "$MODE")
fi

echo "Version bump mode: $MODE"
echo "  Android versionCode: $ANDROID_VERSION_CODE -> $NEW_ANDROID_VERSION_CODE"
echo "  iOS build number:    $IOS_BUILD_NUMBER -> $NEW_IOS_BUILD_NUMBER"
if [[ "$MODE" != "build" ]]; then
  echo "  Android versionName: $ANDROID_VERSION_NAME -> $NEW_ANDROID_VERSION_NAME"
  echo "  iOS marketing:       $IOS_MARKETING_VERSION -> $NEW_IOS_MARKETING_VERSION"
fi

if [[ "$DRY_RUN" == "true" ]]; then
  echo ""
  echo "Dry-run only. No files changed."
  exit 0
fi

perl -i -pe 'if (!$done && s/versionCode\s+\d+/versionCode '"$NEW_ANDROID_VERSION_CODE"'/) { $done = 1; }' "$ANDROID_GRADLE"
sed -i '' -E "s/CURRENT_PROJECT_VERSION = [0-9]+;/CURRENT_PROJECT_VERSION = $NEW_IOS_BUILD_NUMBER;/g" "$IOS_PBXPROJ"

if [[ "$MODE" != "build" ]]; then
  perl -i -pe 'if (!$done && s/versionName\s+\"[^\"]+\"/versionName \"'"$NEW_ANDROID_VERSION_NAME"'\"/) { $done = 1; }' "$ANDROID_GRADLE"
  sed -i '' -E "s/MARKETING_VERSION = [0-9]+(\\.[0-9]+){1,2};/MARKETING_VERSION = $NEW_IOS_MARKETING_VERSION;/g" "$IOS_PBXPROJ"
fi

echo ""
echo "Updated versions:"
echo "  Android versionCode: $(grep -Eo 'versionCode[[:space:]]+[0-9]+' "$ANDROID_GRADLE" | head -1)"
echo "  Android versionName: $(grep -Eo 'versionName \"[^\"]+\"' "$ANDROID_GRADLE" | head -1)"
echo "  iOS build number:    $(grep -Eo 'CURRENT_PROJECT_VERSION = [0-9]+' "$IOS_PBXPROJ" | head -1)"
echo "  iOS marketing:       $(grep -Eo 'MARKETING_VERSION = [0-9]+(\.[0-9]+){1,2}' "$IOS_PBXPROJ" | head -1 || true)"
