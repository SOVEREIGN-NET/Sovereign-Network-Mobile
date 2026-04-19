/**
 * CameraPermission
 *
 * Single source of truth for camera permission state. Wraps
 * `react-native-vision-camera`'s low-level API with a unified
 * discriminated status that reflects BOTH iOS and Android realities,
 * including the "user denied, then picked Don't-Ask-Again" case on
 * Android (returned as `blocked`) which an ad-hoc in-screen permission
 * request would silently fail on.
 *
 * Design rules:
 *   - The screen asking for the camera NEVER inlines permission
 *     checks. It calls `getStatus()` / `request()` / `openSettings()`
 *     from this module and renders based on the returned status.
 *   - Denial is a normal outcome, not an error. Callers switch on
 *     status; they don't catch thrown errors for "denied".
 *   - The caller is responsible for offering a fallback (paste link
 *     in this codebase) when the user ends up in `blocked` /
 *     `restricted` — we never leave a dead end.
 *
 * Status meanings:
 *   granted       — camera is usable right now.
 *   never-asked   — first-time state; call `request()` to prompt.
 *   denied        — user rejected the last prompt but the system will
 *                    still show the prompt if we ask again (iOS only —
 *                    Android goes straight to `blocked` on 2nd deny).
 *   blocked       — user has permanently denied. Calling `request()`
 *                    again will NOT show a prompt; we must send them
 *                    to the app Settings page via `openSettings()`.
 *   restricted    — a system/parental policy prevents camera access.
 *                    `request()` would not help; `openSettings()` is
 *                    only sometimes useful.
 *   unsupported   — the runtime lacks the native module (older build,
 *                    missing pod/gradle). Same UX as `restricted` —
 *                    never a dead end, fall back to paste.
 */

import { Linking, Platform } from 'react-native';

export type CameraPermissionStatus =
  | 'granted'
  | 'never-asked'
  | 'denied'
  | 'blocked'
  | 'restricted'
  | 'unsupported';

type VisionPermission = 'granted' | 'not-determined' | 'denied' | 'restricted';

// Lazy-resolve vision-camera so a missing native module (e.g. running
// the JS bundle against an app that wasn't rebuilt after the dep was
// added) is reported as `unsupported` instead of crashing on import.
function loadVisionCamera(): {
  Camera?: {
    getCameraPermissionStatus: () => VisionPermission;
    requestCameraPermission: () => Promise<VisionPermission>;
  };
} {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('react-native-vision-camera');
  } catch {
    return {};
  }
}

/**
 * Translate vision-camera's 4-state permission into our 6-state one.
 *
 * vision-camera doesn't expose a `blocked` variant; we infer it from
 * the difference between the pre-request state and the post-request
 * state (see `request()` below). Read-only lookups therefore return
 * `denied` in both the denied-but-can-reprompt and blocked cases; call
 * `request()` to disambiguate.
 */
function mapVisionStatus(raw: VisionPermission): CameraPermissionStatus {
  switch (raw) {
    case 'granted':
      return 'granted';
    case 'not-determined':
      return 'never-asked';
    case 'denied':
      return 'denied';
    case 'restricted':
      return 'restricted';
    default:
      return 'denied';
  }
}

/** Synchronously read the current camera permission status. */
export function getCameraPermissionStatus(): CameraPermissionStatus {
  const { Camera } = loadVisionCamera();
  if (!Camera?.getCameraPermissionStatus) return 'unsupported';
  try {
    return mapVisionStatus(Camera.getCameraPermissionStatus());
  } catch {
    return 'unsupported';
  }
}

/**
 * Prompt the user for camera permission, disambiguating denied vs
 * blocked via pre/post comparison:
 *
 *   - iOS calls the system prompt exactly once per install. Subsequent
 *     `requestCameraPermission()` calls short-circuit to the stored
 *     decision without re-prompting. A pre=denied, post=denied is
 *     therefore `blocked` on iOS too.
 *   - Android (API 23+) shows the prompt twice. After the 2nd deny the
 *     system marks it "Don't ask again" and further requests return
 *     `denied` without prompting. Pre=denied, post=denied is `blocked`.
 */
export async function requestCameraPermission(): Promise<CameraPermissionStatus> {
  const { Camera } = loadVisionCamera();
  if (!Camera?.requestCameraPermission) return 'unsupported';
  try {
    const before = Camera.getCameraPermissionStatus();
    const after = await Camera.requestCameraPermission();
    if (after === 'granted') return 'granted';
    if (after === 'restricted') return 'restricted';
    if (after === 'denied' && before === 'denied') return 'blocked';
    return mapVisionStatus(after);
  } catch {
    return 'unsupported';
  }
}

/**
 * Open the OS-level Settings page for this app. Used when the status
 * is `blocked` — the ONLY path back to `granted` from that state.
 *
 * Returns true if a Settings screen was opened. Returns false when the
 * platform doesn't support a direct jump (older Android versions); the
 * caller should instruct the user to open Settings manually.
 */
export async function openAppSettings(): Promise<boolean> {
  try {
    if (Platform.OS === 'ios') {
      await Linking.openURL('app-settings:');
      return true;
    }
    if (Platform.OS === 'android' && typeof Linking.openSettings === 'function') {
      await Linking.openSettings();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
