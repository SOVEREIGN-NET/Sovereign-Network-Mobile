import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';

import { Button, Card, Column, LoadingView, ScreenLayout, Text } from '../components';
import { useTranslation } from '../i18n';
import { colors, spacing, typography } from '../theme';
import {
  CameraPermissionStatus,
  getCameraPermissionStatus,
  openAppSettings,
  requestCameraPermission,
} from '../services/CameraPermission';
import { parseBrowserAuthLink } from '../services/BrowserAuthService';

/**
 * QR code scanner for the browser-auth flow.
 *
 * Every camera-permission state has a rendered branch. The paste-link
 * fallback is always one tap away (Cancel → previous screen) so a
 * user whose camera is `blocked` or `restricted` is never stuck here.
 *
 * Permission state machine:
 *
 *   mount
 *     ├─ granted       → mount <Camera>, wait for a QR
 *     ├─ never-asked   → auto-request once; transition to one of the below
 *     ├─ denied        → "Allow camera" button → request again
 *     ├─ blocked       → "Open Settings" button
 *     ├─ restricted    → message + "Go back" (no recourse)
 *     └─ unsupported   → message + "Go back" (missing native module)
 */
const QRScanScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<CameraPermissionStatus>(() =>
    getCameraPermissionStatus(),
  );
  const [checking, setChecking] = useState<boolean>(status === 'never-asked');

  // Debounce + deduplicate: a vision-camera `codeScanner` fires once per
  // frame while the QR is in view — without this we'd fire
  // `navigation.navigate` dozens of times and the receiving screen
  // would stack-push itself. The ref is intentionally per-mount.
  const handledRef = useRef(false);

  // First-mount: kick off a single permission request when we don't
  // know the state yet. Avoid requesting on every re-render.
  useEffect(() => {
    let cancelled = false;
    if (status === 'never-asked') {
      (async () => {
        const next = await requestCameraPermission();
        if (!cancelled) {
          setStatus(next);
          setChecking(false);
        }
      })();
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retryPermission = useCallback(async () => {
    setChecking(true);
    const next = await requestCameraPermission();
    setStatus(next);
    setChecking(false);
  }, []);

  const goToSettings = useCallback(async () => {
    const opened = await openAppSettings();
    if (!opened) {
      Alert.alert(
        t.qrScan.blocked.manualTitle,
        Platform.OS === 'android'
          ? t.qrScan.blocked.manualHintAndroid
          : t.qrScan.blocked.manualHintIos,
      );
    }
  }, [t]);

  const onScanned = useCallback(
    (rawValue: string) => {
      if (handledRef.current) return;
      try {
        const parsed = parseBrowserAuthLink(rawValue);
        if (!parsed) return;
        handledRef.current = true;
        navigation.replace('BrowserAuth', { url: rawValue });
      } catch (err: any) {
        // Malformed auth link — keep scanning, don't leave the screen.
        // Surface the error once so the user understands why we didn't
        // proceed. We do NOT mark `handledRef` so the scanner keeps
        // running; they might present a different QR.
        Alert.alert(
          t.qrScan.invalidQr.title,
          err?.message ?? t.qrScan.invalidQr.body,
        );
      }
    },
    [navigation, t],
  );

  const onCancel = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  if (checking) {
    return <LoadingView />;
  }

  switch (status) {
    case 'granted':
      return <GrantedView onScanned={onScanned} onCancel={onCancel} />;

    case 'never-asked':
    case 'denied':
      return (
        <DeniedView
          onAllow={retryPermission}
          onCancel={onCancel}
          checking={checking}
          title={t.qrScan.permission.title}
          body={t.qrScan.permission.body}
          primaryLabel={t.qrScan.permission.allow}
          checkingLabel={t.qrScan.permission.requesting}
          cancelLabel={t.qrScan.permission.cancel}
        />
      );

    case 'blocked':
      return (
        <DeniedView
          onAllow={goToSettings}
          onCancel={onCancel}
          checking={false}
          title={t.qrScan.blocked.title}
          body={t.qrScan.blocked.body}
          primaryLabel={t.qrScan.blocked.openSettings}
          checkingLabel={t.qrScan.permission.requesting}
          cancelLabel={t.qrScan.permission.cancel}
        />
      );

    case 'restricted':
      return (
        <DeadEndView
          onCancel={onCancel}
          title={t.qrScan.restricted.title}
          body={t.qrScan.restricted.body}
          backLabel={t.qrScan.goBack}
        />
      );

    case 'unsupported':
    default:
      return (
        <DeadEndView
          onCancel={onCancel}
          title={t.qrScan.unsupported.title}
          body={t.qrScan.unsupported.body}
          backLabel={t.qrScan.goBack}
        />
      );
  }
};

/**
 * `granted` branch. Resolves the Camera module at call time so builds
 * that haven't run `pod install` / `gradle sync` still render the rest
 * of the app; they fall through to `unsupported` via the module loader.
 */
const GrantedView: React.FC<{
  onScanned: (value: string) => void;
  onCancel: () => void;
}> = ({ onScanned, onCancel }) => {
  const { t } = useTranslation();
  let Camera: any;
  let useCameraDevice: any;
  let useCodeScanner: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-vision-camera');
    Camera = mod.Camera;
    useCameraDevice = mod.useCameraDevice;
    useCodeScanner = mod.useCodeScanner;
  } catch {
    return (
      <DeadEndView
        onCancel={onCancel}
        title={t.qrScan.unsupported.title}
        body={t.qrScan.unsupported.failed}
        backLabel={t.qrScan.goBack}
      />
    );
  }

  const device = useCameraDevice('back');
  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: (codes: Array<{ value?: string }>) => {
      for (const c of codes) {
        if (typeof c?.value === 'string' && c.value.length > 0) {
          onScanned(c.value);
          return;
        }
      }
    },
  });

  if (!device) {
    return (
      <DeadEndView
        onCancel={onCancel}
        title={t.qrScan.noBackCamera.title}
        body={t.qrScan.noBackCamera.body}
        backLabel={t.qrScan.goBack}
      />
    );
  }

  return (
    <View style={styles.cameraContainer}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        codeScanner={codeScanner}
      />
      <View style={styles.cameraOverlay} pointerEvents="box-none">
        <Text
          style={{
            color: colors.text_primary,
            fontSize: typography.size.sm,
            backgroundColor: 'rgba(0,0,0,0.6)',
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.xs,
            borderRadius: 8,
          }}
        >
          {t.qrScan.granted.prompt}
        </Text>
        <View style={{ flex: 1 }} />
        <Button variant="secondary" onPress={onCancel}>
          {t.qrScan.granted.cancel}
        </Button>
      </View>
    </View>
  );
};

/**
 * `never-asked` / `denied` / `blocked` branches — single button to
 * either request permission or open settings, plus Cancel.
 */
const DeniedView: React.FC<{
  title: string;
  body: string;
  primaryLabel: string;
  checkingLabel: string;
  cancelLabel: string;
  onAllow: () => void;
  onCancel: () => void;
  checking: boolean;
}> = ({ title, body, primaryLabel, checkingLabel, cancelLabel, onAllow, onCancel, checking }) => (
  <ScreenLayout paddingTop={spacing.md}>
    <Card>
      <Column gap="md">
        <Text
          style={{
            fontSize: typography.size.md,
            fontWeight: typography.weight.semibold,
            color: colors.text_primary,
          }}
        >
          {title}
        </Text>
        <Text style={{ color: colors.text_secondary, fontSize: typography.size.sm }}>
          {body}
        </Text>
        <Column gap="sm">
          <Button variant="primary" onPress={onAllow} disabled={checking}>
            {checking ? checkingLabel : primaryLabel}
          </Button>
          <Button variant="secondary" onPress={onCancel}>
            {cancelLabel}
          </Button>
        </Column>
      </Column>
    </Card>
  </ScreenLayout>
);

/**
 * `restricted` / `unsupported` / missing-back-camera branches. One
 * message, one button back. The paste-link fallback is accessible by
 * going back to the Wallet Settings screen.
 */
const DeadEndView: React.FC<{
  title: string;
  body: string;
  backLabel: string;
  onCancel: () => void;
}> = ({ title, body, backLabel, onCancel }) => (
  <ScreenLayout paddingTop={spacing.md}>
    <Card>
      <Column gap="md">
        <Text
          style={{
            fontSize: typography.size.md,
            fontWeight: typography.weight.semibold,
            color: colors.text_primary,
          }}
        >
          {title}
        </Text>
        <Text style={{ color: colors.text_secondary, fontSize: typography.size.sm }}>
          {body}
        </Text>
        <Button variant="secondary" onPress={onCancel}>
          {backLabel}
        </Button>
      </Column>
    </Card>
  </ScreenLayout>
);

const styles = StyleSheet.create({
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    padding: spacing.lg,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
});

export default QRScanScreen;
