import React, { useState } from 'react';
import { Alert, Clipboard, Platform, Pressable, View } from 'react-native';
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
import {
  useTranslation,
  setLanguage as setI18nLanguage,
  type LanguageCode,
} from '../i18n';
import { useTheme } from '../context/ThemeContext';
import type { ThemeType } from '../theme/tokens';
import { colors, spacing, typography, borderRadius } from '../theme';
import { BUILD_INFO } from '../config';
import { parseBrowserAuthLink } from '../services/BrowserAuthService';

/**
 * Locales offered in the switcher. Keep in sync with `LanguageCode`
 * in `src/i18n/i18n.ts` — when a new translation file ships, add it
 * here and the pill row picks it up automatically.
 */
type PickableLanguage = LanguageCode;
const PICKABLE_LANGUAGES: PickableLanguage[] = ['en', 'es'];

/** Same pill-row pattern as the language switcher — kept parallel so
 *  both settings read as obviously-toggles at a glance. */
const PICKABLE_THEMES: ThemeType[] = ['charcoal', 'light'];

/** Platform-aware monospace font for hash / address readouts. */
const MONO_FONT = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

const WalletSettingsScreen = ({ navigation }: any) => {
  // `language` drives the "which pill is active" highlight; `t` is
  // the live translation object. `useTranslation` subscribes to the
  // central i18n listener set, so tapping a pill that calls
  // `setI18nLanguage` causes this component (and every other
  // translated screen) to re-render with the new strings.
  const { t, language: currentLanguage } = useTranslation();
  const { theme: currentTheme, setTheme } = useTheme();
  const { currentIdentity, isLoading } = useAuth();

  /** Inline paste field for the `zhtp://auth?…` deep link / raw hex. */
  const [browserAuthInput, setBrowserAuthInput] = useState('');
  const [browserAuthError, setBrowserAuthError] = useState<string | null>(null);

  /**
   * Apply a language selection. Goes through the central
   * `setI18nLanguage`, which persists to AsyncStorage and fires the
   * listener set — every `useTranslation` consumer re-renders.
   */
  const applyLanguage = (lang: PickableLanguage) => {
    setI18nLanguage(lang);
  };

  const activeLanguageLabel =
    t.settings.languages[currentLanguage] ?? t.settings.languages.en;

  const onOpenBrowserAuth = async () => {
    setBrowserAuthError(null);
    const raw = browserAuthInput.trim();
    // Empty + user tapped Continue → try clipboard as a convenience so
    // the user doesn't have to paste manually.
    const candidate = raw.length > 0 ? raw : (await Clipboard.getString()).trim();
    if (!candidate) {
      setBrowserAuthError(t.walletSettings.browserAuth.errors.emptyClipboard);
      return;
    }
    try {
      const parsed = parseBrowserAuthLink(candidate);
      if (!parsed) {
        setBrowserAuthError(t.walletSettings.browserAuth.errors.invalidLink);
        return;
      }
      navigation.navigate('BrowserAuth', { url: candidate });
    } catch (err: any) {
      setBrowserAuthError(err?.message ?? t.walletSettings.browserAuth.errors.invalid);
    }
  };

  if (!currentIdentity || isLoading) {
    return <LoadingView />;
  }

  return (
    <ScreenLayout paddingTop={spacing.md}>
      <Column gap="lg">
        {/* Language switcher — colocated with the user's other
            per-identity preferences. Always-visible segmented pill
            row (no dropdown) so the user can read and change locale
            in one tap without navigating anywhere. */}
        <Card>
          <Text
            style={{
              fontSize: typography.size.sm,
              fontWeight: typography.weight.semibold,
              color: colors.text_primary,
              marginBottom: spacing.sm,
            }}
          >
            {t.settings.language.title}
          </Text>
          <Text
            style={{
              fontSize: typography.size.xs,
              color: colors.text_secondary,
              marginBottom: spacing.md,
            }}
          >
            {activeLanguageLabel}
          </Text>

          <View
            style={{
              flexDirection: 'row',
              backgroundColor: colors.bg_darker,
              borderRadius: borderRadius.full,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 3,
            }}
          >
            {PICKABLE_LANGUAGES.map(lang => {
              const isActive = currentLanguage === lang;
              return (
                <Pressable
                  key={lang}
                  onPress={() => applyLanguage(lang)}
                  style={{
                    flex: 1,
                    paddingVertical: spacing.xs + 2,
                    paddingHorizontal: spacing.xs,
                    borderRadius: borderRadius.full,
                    backgroundColor: isActive
                      ? colors.primary
                      : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: typography.size.xs,
                      fontWeight: isActive ? '700' : '500',
                      color: isActive
                        ? colors.bg_darkest
                        : colors.text_primary,
                    }}
                  >
                    {t.settings.languages[lang]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {/* Appearance — pill-row twin of the language switcher. The
            toggle mutates the shared `colors` palette in place via
            `ThemeProvider.setTheme`, and the provider re-keys its
            subtree so screens using the static `import { colors }`
            pattern re-render with the new palette. Persists across
            launches via AsyncStorage / NativeStorage. */}
        <Card>
          <Text
            style={{
              fontSize: typography.size.sm,
              fontWeight: typography.weight.semibold,
              color: colors.text_primary,
              marginBottom: spacing.sm,
            }}
          >
            {t.settings.theme.title}
          </Text>
          <Text
            style={{
              fontSize: typography.size.xs,
              color: colors.text_secondary,
              marginBottom: spacing.md,
            }}
          >
            {t.settings.theme.subtitle}
          </Text>

          <View
            style={{
              flexDirection: 'row',
              backgroundColor: colors.bg_darker,
              borderRadius: borderRadius.full,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 3,
            }}
          >
            {PICKABLE_THEMES.map(themeOption => {
              const isActive = currentTheme === themeOption;
              return (
                <Pressable
                  key={themeOption}
                  onPress={() => setTheme(themeOption)}
                  style={{
                    flex: 1,
                    paddingVertical: spacing.xs + 2,
                    paddingHorizontal: spacing.xs,
                    borderRadius: borderRadius.full,
                    backgroundColor: isActive
                      ? colors.primary
                      : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: typography.size.xs,
                      fontWeight: isActive ? '700' : '500',
                      color: isActive
                        ? colors.bg_darkest
                        : colors.text_primary,
                    }}
                  >
                    {t.settings.theme[themeOption]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

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
            {t.walletSettings.browserAuth.title}
          </Text>
          <Text
            style={{
              fontSize: typography.size.xs,
              color: colors.text_secondary,
              marginBottom: spacing.md,
            }}
          >
            {t.walletSettings.browserAuth.description}
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
              {t.walletSettings.browserAuth.scanButton}
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
              placeholder={t.walletSettings.browserAuth.pastePlaceholder}
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
              {t.walletSettings.browserAuth.useLinkButton}
            </Button>
            <Text
              style={{
                color: colors.text_tertiary,
                fontSize: typography.size.xs,
                textAlign: 'center',
              }}
            >
              {t.walletSettings.browserAuth.clipboardTip}
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
            {t.walletSettings.buildInfo.title}
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
                label={t.walletSettings.buildInfo.platform}
                value={
                  Platform.OS === 'ios'
                    ? t.walletSettings.buildInfo.ios
                    : t.walletSettings.buildInfo.android
                }
              />
              <BuildInfoRow
                label={t.walletSettings.buildInfo.version}
                value={
                  Platform.OS === 'ios'
                    ? BUILD_INFO.ios.version
                    : BUILD_INFO.android.version
                }
              />
              <BuildInfoRow
                label={t.walletSettings.buildInfo.build}
                value={
                  Platform.OS === 'ios'
                    ? BUILD_INFO.ios.build
                    : BUILD_INFO.android.build
                }
              />
              <BuildInfoRow
                label={t.walletSettings.buildInfo.commit}
                value={`${BUILD_INFO.gitCommit}${BUILD_INFO.gitDirty ? '-dirty' : ''}`}
                mono
              />
              <BuildInfoRow
                label={t.walletSettings.buildInfo.branch}
                value={BUILD_INFO.gitBranch}
                mono
              />
              <BuildInfoRow
                label={t.walletSettings.buildInfo.generated}
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
        fontFamily: mono ? MONO_FONT : undefined,
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
