import React, { useState } from 'react';
import { Alert, Clipboard, Platform, View } from 'react-native';
import {
  Card,
  Text,
  Button,
  Column,
  Input,
  Row,
  LoadingView,
  ScreenLayout,
} from '../components';
import { useAuth } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography, borderRadius } from '../theme';
import { BUILD_INFO } from '../config';
import { parseBrowserAuthLink } from '../services/BrowserAuthService';

const WalletSettingsScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { currentIdentity, isLoading } = useAuth();

  /** Inline paste field for the `zhtp://auth?…` deep link / raw hex. */
  const [browserAuthInput, setBrowserAuthInput] = useState('');
  const [browserAuthError, setBrowserAuthError] = useState<string | null>(null);

  const onOpenBrowserAuth = async () => {
    setBrowserAuthError(null);
    const raw = browserAuthInput.trim();
    // Empty + user tapped Continue → try clipboard as a convenience so
    // the user doesn't have to paste manually.
    const candidate = raw.length > 0 ? raw : (await Clipboard.getString()).trim();
    if (!candidate) {
      setBrowserAuthError('Paste the auth link from your browser first.');
      return;
    }
    try {
      const parsed = parseBrowserAuthLink(candidate);
      if (!parsed) {
        setBrowserAuthError(
          'That doesn\u2019t look like a ZHTP auth link. Expected `zhtp://auth?challenge=…`.',
        );
        return;
      }
      navigation.navigate('BrowserAuth', { url: candidate });
    } catch (err: any) {
      setBrowserAuthError(err?.message ?? 'Invalid auth link');
    }
  };

  if (!currentIdentity || isLoading) {
    return <LoadingView />;
  }

  return (
    <ScreenLayout paddingTop={spacing.md}>
      <Column gap="lg">
        {/* Export / Recovery */}
        <Card>
          <Text
            style={{
              fontSize: typography.size.sm,
              fontWeight: typography.weight.semibold,
              color: colors.text_primary,
              marginBottom: spacing.md,
            }}
          >
            {t.wallet.settings.title}
          </Text>

          <Column gap="sm">
            <Button
              variant="secondary"
              onPress={() => navigation.navigate('BackupIdentity')}
            >
              {t.wallet.settings.exportWallet}
            </Button>
          </Column>
        </Card>

        {/* Browser sign-in — authenticate a web browser session by
            signing the challenge it generated. See BrowserAuthService
            for the wire-format spec. */}
        <Card>
          <Text
            style={{
              fontSize: typography.size.sm,
              fontWeight: typography.weight.semibold,
              color: colors.text_primary,
              marginBottom: spacing.xs,
            }}
          >
            Browser sign-in
          </Text>
          <Text
            style={{
              fontSize: typography.size.xs,
              color: colors.text_secondary,
              marginBottom: spacing.md,
            }}
          >
            Use this app to authenticate a browser session on another
            device. Scan the QR code shown by the browser, or paste the
            `zhtp://auth` link below. No new connection is opened —
            the challenge is signed and submitted via your connected
            node.
          </Text>

          <Column gap="sm">
            {/* Primary path: scan the browser's QR with the camera.
                QRScanScreen owns its own permission state machine,
                including the `blocked` path to OS settings — this
                button is safe to tap in every state. */}
            <Button
              variant="primary"
              onPress={() => navigation.navigate('QRScan')}
            >
              Scan QR code
            </Button>

            {/* Fallback: paste the link (or leave empty to read
                clipboard). Always available even when the camera is
                blocked/restricted so users never hit a dead end. */}
            <Input
              value={browserAuthInput}
              onChangeText={text => {
                setBrowserAuthInput(text);
                if (browserAuthError) setBrowserAuthError(null);
              }}
              placeholder="zhtp://auth?challenge=…"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {browserAuthError && (
              <Text
                style={{
                  color: colors.error,
                  fontSize: typography.size.xs,
                }}
              >
                {browserAuthError}
              </Text>
            )}
            <Button variant="secondary" onPress={onOpenBrowserAuth}>
              Use pasted link
            </Button>
            <Text
              style={{
                color: colors.text_tertiary,
                fontSize: typography.size.xs,
                textAlign: 'center',
              }}
            >
              Tip: leave the field empty and tap &quot;Use pasted link&quot; to read your clipboard.
            </Text>
          </Column>
        </Card>

        {/* Build Info — helps identify which build a user is running */}
        <Card>
          <Text
            style={{
              fontSize: typography.size.sm,
              fontWeight: typography.weight.semibold,
              color: colors.text_primary,
              marginBottom: spacing.md,
            }}
          >
            Build Info
          </Text>

          <View
            style={{
              backgroundColor: colors.bg_darker,
              padding: spacing.md,
              borderRadius: borderRadius.base,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Column gap="sm">
              <BuildInfoRow
                label="Platform"
                value={Platform.OS === 'ios' ? 'iOS' : 'Android'}
              />
              <BuildInfoRow
                label="Version"
                value={
                  Platform.OS === 'ios'
                    ? BUILD_INFO.ios.version
                    : BUILD_INFO.android.version
                }
              />
              <BuildInfoRow
                label="Build"
                value={
                  Platform.OS === 'ios'
                    ? BUILD_INFO.ios.build
                    : BUILD_INFO.android.build
                }
              />
              <BuildInfoRow
                label="Commit"
                value={`${BUILD_INFO.gitCommit}${BUILD_INFO.gitDirty ? '-dirty' : ''}`}
                mono
              />
              <BuildInfoRow label="Branch" value={BUILD_INFO.gitBranch} mono />
              <BuildInfoRow
                label="Generated"
                value={BUILD_INFO.generatedAt}
                mono
              />
            </Column>
          </View>
        </Card>
      </Column>
    </ScreenLayout>
  );
};

const BuildInfoRow = ({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) => (
  <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
    <Text
      style={{
        fontSize: typography.size.xs,
        color: colors.text_secondary,
      }}
    >
      {label}
    </Text>
    <Text
      style={{
        fontSize: typography.size.xs,
        color: colors.text_primary,
        fontWeight: typography.weight.semibold,
        fontFamily: mono ? (Platform.OS === 'ios' ? 'Menlo' : 'monospace') : undefined,
        flexShrink: 1,
        textAlign: 'right',
        marginLeft: spacing.md,
      }}
      numberOfLines={1}
    >
      {value}
    </Text>
  </Row>
);

export default WalletSettingsScreen;
