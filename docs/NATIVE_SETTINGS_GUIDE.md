# Native Phone Settings Integration Guide

This document explains how the Developer Settings toggle and Node URL field are integrated with native phone settings (iOS Settings.app and Android Settings).

## Overview

The app now supports storing Developer Settings in **native phone settings** in addition to in-app storage. This provides:

✅ **iOS**: Settings visible in Settings.app → SovereignNetworkMobile
✅ **Android**: Settings in Android SharedPreferences (accessible via Settings)
✅ **Sync**: Settings automatically sync between app and native settings
✅ **Persistence**: Settings persist across app restarts
✅ **Real-time**: Changes in phone settings are reflected in app immediately

## How It Works

### Data Flow

```
Phone Native Settings (Settings.app / Android Settings)
    ↓ (NativeSettings Module reads/writes)
SharedPreferences (Android) / UserDefaults (iOS)
    ↓ (useNativeSettings Hook syncs)
React Component State (SettingsScreen)
    ↓ (setUseMockService updates)
AuthContext Global Feature Flag
    ↓ (Routes auth calls)
MockAuthService ← or → RealAuthService
```

### iOS Integration (Settings.bundle)

**Location**: `ios/SovereignNetworkMobile/Settings.bundle/Root.plist`

The `Settings.bundle` is an Xcode bundle that creates settings pages in iOS Settings.app:

```plist
<?xml version="1.0" encoding="UTF-8"?>
<plist>
  <dict>
    <key>PreferenceSpecifiers</key>
    <array>
      <!-- Developer Settings Section -->
      <dict>
        <key>Type</key>
        <string>PSGroupSpecifier</string>
        <key>Title</key>
        <string>Developer Settings</string>
      </dict>

      <!-- Use Mock Data Toggle -->
      <dict>
        <key>Type</key>
        <string>PSToggleSwitchSpecifier</string>
        <key>Title</key>
        <string>Use Mock Data</string>
        <key>Key</key>
        <string>useMockData</string>
        <key>DefaultValue</key>
        <true/>
      </dict>

      <!-- Node URL Input -->
      <dict>
        <key>Type</key>
        <string>PSTextFieldSpecifier</string>
        <key>Title</key>
        <string>Node URL</string>
        <key>Key</key>
        <string>nodeUrl</string>
        <key>DefaultValue</key>
        <string>http://192.168.1.31:9334</string>
      </dict>
    </array>
  </dict>
</plist>
```

**What this creates in iOS Settings:**
- Settings.app → SovereignNetworkMobile → Developer Settings
- Toggle switch for "Use Mock Data"
- Text input field for "Node URL"
- Both settings are stored in iOS UserDefaults

### Android Integration (SharedPreferences)

**Module**: `android/app/src/main/java/com/sovereignnetworkmobile/NativeSettingsModule.kt`

Android doesn't have a native Settings UI like iOS, so we provide:
1. **NativeSettingsModule.kt**: Kotlin module for SharedPreferences access
2. **NativeSettingsPackage.kt**: Package registration
3. **MainApplication.kt**: Package initialization

The module provides these methods:

```kotlin
getString(key, promise)          // Read string from SharedPreferences
setString(key, value, promise)   // Write string to SharedPreferences
getBoolean(key, promise)         // Read boolean from SharedPreferences
setBoolean(key, value, promise)  // Write boolean to SharedPreferences
getAllSettings(promise)          // Get all developer settings
updateSettings(settings, promise)// Update multiple settings
clearSettings(promise)           // Clear all developer settings
```

## React Native Hook: `useNativeSettings`

**File**: `src/hooks/useNativeSettings.ts`

This hook provides a clean interface to read/write native settings:

```typescript
const { settings, loading, error, saveSettings, clearSettings } = useNativeSettings();

// settings: { useMockData: boolean, nodeUrl: string }
// loading: boolean (true while loading from native)
// error: string | null (any error during load/save)

// Save settings to native storage
await saveSettings({
  useMockData: true,
  nodeUrl: 'http://localhost:3000'
});

// Clear all settings
await clearSettings();
```

### Integration in SettingsScreen

The SettingsScreen now:

1. **Loads** settings via `useNativeSettings()` hook
2. **Displays** them in the Developer Settings UI
3. **Saves** to both AsyncStorage (app) and native settings (phone)
4. **Syncs** the global feature flag immediately

```typescript
const { settings: nativeSettings, saveSettings: saveNativeSettings } = useNativeSettings();

// When user toggles the switch
const handleSaveDeveloperSettings = async () => {
  await AsyncStorage.setItem('useMockData', useMockData.toString());
  await saveNativeSettings({ useMockData, nodeUrl });
  setUseMockService(useMockData);
};
```

## Usage

### For Users

**iOS:**
1. Open Settings.app
2. Scroll to find "SovereignNetworkMobile"
3. Tap it
4. Go to "Developer Settings"
5. Toggle "Use Mock Data" ON/OFF
6. Enter "Node URL" (default: http://192.168.1.31:9334)
7. Return to app - settings load automatically

**Android:**
1. Open SovereignNetworkMobile app
2. Hamburger menu → App Settings
3. Scroll to "Developer Settings"
4. Toggle "Use Mock Data" ON/OFF
5. Enter "Node URL"
6. Tap "Save Configuration"

### For Developers

**Read settings from native storage:**
```typescript
import { useNativeSettings } from '../hooks';

const MyComponent = () => {
  const { settings, loading } = useNativeSettings();

  if (loading) return <LoadingView />;

  console.log('Mock Data:', settings?.useMockData);
  console.log('Node URL:', settings?.nodeUrl);
};
```

**Write settings to native storage:**
```typescript
const { saveSettings } = useNativeSettings();

await saveSettings({
  useMockData: false,
  nodeUrl: 'http://production.example.com'
});
```

## File Structure

```
ios/SovereignNetworkMobile/
├── Settings.bundle/
│   └── Root.plist                    ← iOS Settings UI definition
├── NativeSettings.swift              ← iOS native module implementation
├── NativeSettings.m                  ← iOS bridge file

android/app/src/main/java/com/sovereignnetworkmobile/
├── NativeSettingsModule.kt           ← Android SharedPreferences module
├── NativeSettingsPackage.kt          ← Android package registration
└── MainApplication.kt                ← Register the package

src/hooks/
└── useNativeSettings.ts              ← React Native hook interface

src/screens/
└── SettingsScreen.tsx                ← UI integrated with native settings
```

## Technical Details

### iOS

**UserDefaults Keys:**
- `useMockData` → boolean (true = mock, false = real)
- `nodeUrl` → string (ZHTP node URL)

**Native Module Methods:**
- Swift: `NativeSettings.swift`
- Bridge: `NativeSettings.m`
- Exports methods to JavaScript via React Native bridge

### Android

**SharedPreferences Namespace:**
- `sovereign_settings` → contains all developer settings

**Native Module Methods:**
- Kotlin: `NativeSettingsModule.kt`
- Package: `NativeSettingsPackage.kt`
- Registers with `MainApplication.kt`

## Fallback Behavior

If native settings are not available:
- App uses AsyncStorage fallback
- Settings still work within app
- Default values: mock=true, nodeUrl=http://192.168.1.31:9334

```typescript
// In useNativeSettings hook
if (!NativeSettings) {
  console.warn('NativeSettings module not available');
  // Falls back to AsyncStorage
}
```

## Building and Running

### iOS with Settings Bundle

The Settings.bundle is automatically included in Xcode builds:

```bash
npm run ios
# Settings.bundle is auto-copied to app bundle
```

**Important**: After adding Settings.bundle, you may need to:
1. Clean build: `npm run ios -- --clean`
2. Restart Xcode
3. Uninstall and reinstall the app

### Android with Native Module

The native module is auto-linked:

```bash
npm run android
# NativeSettingsModule is auto-registered
```

## Testing

### Unit Tests

Tests verify native settings behavior:

```typescript
it('should save and load native settings', async () => {
  const { saveSettings, loadSettings } = useNativeSettings();

  await saveSettings({ useMockData: false, nodeUrl: 'http://test.com' });
  const settings = await loadSettings();

  expect(settings.useMockData).toBe(false);
  expect(settings.nodeUrl).toBe('http://test.com');
});
```

### Manual Testing

1. **iOS Settings.app:**
   - Change "Use Mock Data" toggle
   - Edit "Node URL"
   - Restart app → values should persist

2. **Android in-app:**
   - Change settings in Developer Settings
   - Click Save
   - Restart app → values should persist
   - Check native SharedPreferences with adb:
     ```bash
     adb shell am start -n com.sovereignnetworkmobile/.MainActivity
     adb shell dumpsys secure | grep sovereign_settings
     ```

## Troubleshooting

### Settings not showing in iOS Settings.app

**Solution:**
1. Clean build: `npm run ios -- --clean`
2. Delete app from simulator/device
3. Rebuild and reinstall
4. Verify Settings.bundle exists in Xcode project

### Android native module not found

**Error**: `NativeSettings is undefined`

**Solution:**
1. Rebuild: `npm run android -- --clean`
2. Verify `NativeSettingsPackage` is registered in `MainApplication.kt`
3. Check `android/app/src/main/AndroidManifest.xml` exists

### Settings not persisting

**iOS:**
- Check that keys in Root.plist match variable names
- Verify UserDefaults.synchronize() is called

**Android:**
- Check SharedPreferences namespace: `sovereign_settings`
- Verify context is ApplicationContext, not Activity

## Best Practices

1. **Always load settings on app startup** - Use `useNativeSettings()` hook
2. **Sync app and native settings** - Save to both locations
3. **Handle missing native module** - Graceful fallback to AsyncStorage
4. **Clear settings on logout** - Call `clearSettings()` if user requests
5. **Validate input** - URL format should be checked before saving

## Future Enhancements

- Add more developer settings (logging level, network timeout, etc.)
- Create Android PreferenceFragment for native Settings UI
- Add settings encryption for sensitive data
- Implement settings sync across devices (iCloud, Google Drive)
- Add settings reset to defaults option

## References

- iOS Settings Bundle: https://developer.apple.com/library/archive/documentation/PreferenceSettings/Conceptual/SettingsApplicationSchemaReference
- Android SharedPreferences: https://developer.android.com/training/data-storage/shared-preferences
- React Native Native Modules: https://reactnative.dev/docs/native-modules-intro
