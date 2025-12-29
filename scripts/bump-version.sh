#!/bin/bash

# Bump build version for iOS and Android
# Usage: ./scripts/bump-version.sh

set -e

ANDROID_GRADLE="android/app/build.gradle"
IOS_PBXPROJ="ios/SovereignNetworkMobile.xcodeproj/project.pbxproj"

# Get current versions
ANDROID_VERSION_CODE=$(grep -o 'versionCode [0-9]*' "$ANDROID_GRADLE" | grep -o '[0-9]*')
IOS_BUILD_NUMBER=$(grep -o 'CURRENT_PROJECT_VERSION = [0-9]*' "$IOS_PBXPROJ" | head -1 | grep -o '[0-9]*')

# Calculate new versions
NEW_ANDROID_VERSION_CODE=$((ANDROID_VERSION_CODE + 1))
NEW_IOS_BUILD_NUMBER=$((IOS_BUILD_NUMBER + 1))

echo "Bumping build versions..."
echo "  Android: $ANDROID_VERSION_CODE -> $NEW_ANDROID_VERSION_CODE"
echo "  iOS:     $IOS_BUILD_NUMBER -> $NEW_IOS_BUILD_NUMBER"

# Update Android versionCode
sed -i '' "s/versionCode $ANDROID_VERSION_CODE/versionCode $NEW_ANDROID_VERSION_CODE/" "$ANDROID_GRADLE"

# Update Android versionName (increment alpha number)
CURRENT_ALPHA=$(grep -o 'versionName "1.0.0-alpha\.[0-9]*"' "$ANDROID_GRADLE" | grep -o 'alpha\.[0-9]*' | grep -o '[0-9]*')
if [ -n "$CURRENT_ALPHA" ]; then
  NEW_ALPHA=$((CURRENT_ALPHA + 1))
  sed -i '' "s/versionName \"1.0.0-alpha\.$CURRENT_ALPHA\"/versionName \"1.0.0-alpha.$NEW_ALPHA\"/" "$ANDROID_GRADLE"
  echo "  Android versionName: 1.0.0-alpha.$CURRENT_ALPHA -> 1.0.0-alpha.$NEW_ALPHA"
fi

# Update iOS CURRENT_PROJECT_VERSION (all occurrences)
sed -i '' "s/CURRENT_PROJECT_VERSION = $IOS_BUILD_NUMBER;/CURRENT_PROJECT_VERSION = $NEW_IOS_BUILD_NUMBER;/g" "$IOS_PBXPROJ"

echo ""
echo "Build versions bumped successfully!"
echo ""

# Verify changes
echo "Verifying changes..."
echo "  Android versionCode: $(grep -o 'versionCode [0-9]*' "$ANDROID_GRADLE")"
echo "  Android versionName: $(grep -o 'versionName "[^"]*"' "$ANDROID_GRADLE")"
echo "  iOS build: $(grep -o 'CURRENT_PROJECT_VERSION = [0-9]*' "$IOS_PBXPROJ" | head -1)"
