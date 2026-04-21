import React, { useState, useEffect } from 'react';
import {
  View,
  Alert,
  Pressable,
  ScrollView,
} from 'react-native';
import {
  Card,
  Text,
  Button,
  Column,
  Row,
  ScreenLayout,
} from '../components';
import { useAuth } from '../hooks';
import { useNativeSettings } from '../hooks/useNativeSettings';
import {
  useTranslation,
  setLanguage as setI18nLanguage,
} from '../i18n';
import { colors, spacing, typography, borderRadius } from '../theme';
import { setUseMockService } from '../context/AuthContext';
import { DEFAULT_SOV_NODE_URL } from '../config';

const SettingsScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { currentIdentity, signOut, isLoading } = useAuth();
  const { clearNodeTrust } = useNativeSettings();

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true);

  // Force mock-data feature disabled in all builds.
  useEffect(() => {
    setUseMockService(false);
  }, []);

  const handleLogout = () => {
    Alert.alert(
      t.settings.logout.confirmTitle,
      t.settings.logout.confirmMessage,
      [
        {
          text: t.settings.logout.cancel,
          onPress: () => {},
          style: 'cancel',
        },
        {
          text: t.settings.logout.confirm,
          onPress: () => {
            (async () => {
              try {
                await signOut();
              } catch (error: any) {
                Alert.alert(
                  t.settings.logout.errorTitle,
                  error?.message || t.settings.logout.errorMessage,
                );
                console.error('Logout failed:', error);
              }
            })();
          },
          style: 'destructive',
        },
      ],
    );
  };

  const handleResetSettings = () => {
    Alert.alert(
      t.settings.reset.confirmTitle,
      t.settings.reset.confirmMessage,
      [
        {
          text: t.settings.reset.cancel,
          onPress: () => {},
          style: 'cancel',
        },
        {
          text: t.settings.reset.confirm,
          onPress: () => {
            setI18nLanguage('en');
            setNotificationsEnabled(true);
            setAnalyticsEnabled(true);
            Alert.alert(
              t.settings.reset.successTitle,
              t.settings.reset.success,
            );
          },
          style: 'destructive',
        },
      ],
    );
  };

  const handleResetNodeTrust = () => {
    Alert.alert(
      t.settings.nodeTrust.confirmTitle,
      t.settings.nodeTrust.confirmMessage,
      [
        {
          text: t.settings.nodeTrust.cancel,
          onPress: () => {},
          style: 'cancel',
        },
        {
          text: t.settings.nodeTrust.confirm,
          onPress: () => {
            (async () => {
              const ok = await clearNodeTrust();
              if (ok) {
                Alert.alert(
                  t.settings.nodeTrust.successTitle,
                  t.settings.nodeTrust.success,
                );
              } else {
                Alert.alert(
                  t.settings.nodeTrust.errorTitle,
                  t.settings.nodeTrust.error,
                );
              }
            })();
          },
          style: 'destructive',
        },
      ],
    );
  };


  return (
    <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
      <ScreenLayout paddingTop={spacing.md}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Column gap="xl">
            {/* Developer Settings */}
            <Card>
              <Text
                style={{
                  fontSize: typography.size.sm,
                  fontWeight: typography.weight.semibold,
                  color: colors.text_primary,
                  marginBottom: spacing.md,
                }}
              >
                {t.settings.developer.title}
              </Text>

              <Column gap="md">
                {/* Node URL Configuration Info */}
                <View
                  style={{
                    backgroundColor: colors.bg_darker,
                    padding: spacing.md,
                    borderRadius: borderRadius.base,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Text
                    style={{
                      fontSize: typography.size.xs,
                      fontWeight: typography.weight.semibold,
                      color: colors.text_primary,
                      marginBottom: spacing.xs,
                    }}
                  >
                    Node URL Configuration
                  </Text>
                  <Text
                    style={{
                      fontSize: typography.size.xs,
                      color: colors.text_secondary,
                      lineHeight: 18,
                    }}
                  >
                    Node URL is configured in .env file only.{'\n'}
                    Current: {DEFAULT_SOV_NODE_URL}
                    {'\n\n'}
                    To change: Edit .env file and restart Metro bundler.
                  </Text>
                </View>
              </Column>
            </Card>

            {/* Language switcher lives in Wallet Settings
                (SID tab → Settings → Wallet Settings) — see
                `WalletSettingsScreen.tsx`. Keeping it there colocates
                the user's locale preference with the rest of their
                per-identity configuration. */}

            {/* Notification & Privacy Settings */}
            <Card>
              <Text
                style={{
                  fontSize: typography.size.sm,
                  fontWeight: typography.weight.semibold,
                  color: colors.text_primary,
                  marginBottom: spacing.md,
                }}
              >
                {t.settings.privacy.title}
              </Text>

              <Column gap="md">
                {/* Notifications Toggle */}
                <Row
                  style={{
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Column style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: typography.size.sm,
                        fontWeight: typography.weight.semibold,
                        color: colors.text_primary,
                      }}
                    >
                      {t.settings.privacy.notifications}
                    </Text>
                    <Text
                      style={{
                        fontSize: typography.size.xs,
                        color: colors.text_secondary,
                        marginTop: spacing.xs,
                      }}
                    >
                      {t.settings.privacy.notificationsDescription}
                    </Text>
                  </Column>
                  <Pressable
                    onPress={() =>
                      setNotificationsEnabled(!notificationsEnabled)
                    }
                    style={{
                      backgroundColor: notificationsEnabled
                        ? colors.success
                        : colors.bg_light,
                      width: 50,
                      height: 28,
                      borderRadius: 14,
                      justifyContent: 'center',
                      alignItems: notificationsEnabled
                        ? 'flex-end'
                        : 'flex-start',
                      paddingHorizontal: 2,
                    }}
                  >
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        backgroundColor: colors.white,
                      }}
                    />
                  </Pressable>
                </Row>

                {/* Analytics Toggle */}
                <Row
                  style={{
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Column style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: typography.size.sm,
                        fontWeight: typography.weight.semibold,
                        color: colors.text_primary,
                      }}
                    >
                      {t.settings.privacy.analytics}
                    </Text>
                    <Text
                      style={{
                        fontSize: typography.size.xs,
                        color: colors.text_secondary,
                        marginTop: spacing.xs,
                      }}
                    >
                      {t.settings.privacy.analyticsDescription}
                    </Text>
                  </Column>
                  <Pressable
                    onPress={() => setAnalyticsEnabled(!analyticsEnabled)}
                    style={{
                      backgroundColor: analyticsEnabled
                        ? colors.success
                        : colors.bg_light,
                      width: 50,
                      height: 28,
                      borderRadius: 14,
                      justifyContent: 'center',
                      alignItems: analyticsEnabled ? 'flex-end' : 'flex-start',
                      paddingHorizontal: 2,
                    }}
                  >
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        backgroundColor: colors.white,
                      }}
                    />
                  </Pressable>
                </Row>
              </Column>
            </Card>

            {/* About & Info */}
            <Card>
              <Text
                style={{
                  fontSize: typography.size.sm,
                  fontWeight: typography.weight.semibold,
                  color: colors.text_primary,
                  marginBottom: spacing.md,
                }}
              >
                {t.settings.about.title}
              </Text>

              <Column gap="md">
                <View
                  style={{
                    backgroundColor: colors.bg_darker,
                    padding: spacing.md,
                    borderRadius: borderRadius.base,
                  }}
                >
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text style={{ color: colors.text_secondary }}>
                      {t.settings.about.appName}
                    </Text>
                    <Text
                      style={{
                        color: colors.text_primary,
                        fontWeight: typography.weight.semibold,
                      }}
                    >
                      SOV Web4
                    </Text>
                  </Row>
                </View>

                <View
                  style={{
                    backgroundColor: colors.bg_darker,
                    padding: spacing.md,
                    borderRadius: borderRadius.base,
                  }}
                >
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text style={{ color: colors.text_secondary }}>
                      {t.settings.about.version}
                    </Text>
                    <Text
                      style={{
                        color: colors.text_primary,
                        fontWeight: typography.weight.semibold,
                      }}
                    >
                      1.0.0
                    </Text>
                  </Row>
                </View>

                <View
                  style={{
                    backgroundColor: colors.bg_darker,
                    padding: spacing.md,
                    borderRadius: borderRadius.base,
                  }}
                >
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text style={{ color: colors.text_secondary }}>
                      {t.settings.about.buildDate}
                    </Text>
                    <Text
                      style={{
                        color: colors.text_primary,
                        fontWeight: typography.weight.semibold,
                      }}
                    >
                      {new Date().toLocaleDateString()}
                    </Text>
                  </Row>
                </View>

                <Button
                  variant="outline"
                  onPress={() =>
                    Alert.alert(
                      t.settings.about.termsTitle,
                      t.settings.about.termsText,
                    )
                  }
                >
                  {t.settings.about.termsButton}
                </Button>

                <Button
                  variant="outline"
                  onPress={() =>
                    Alert.alert(
                      t.settings.about.privacyTitle,
                      t.settings.about.privacyText,
                    )
                  }
                >
                  {t.settings.about.privacyButton}
                </Button>
              </Column>
            </Card>

            {/* Data Management */}
            <Card>
              <Text
                style={{
                  fontSize: typography.size.sm,
                  fontWeight: typography.weight.semibold,
                  color: colors.text_primary,
                  marginBottom: spacing.md,
                }}
              >
                {t.settings.data.title}
              </Text>

              <Column gap="sm">
                <Button
                  variant="secondary"
                  onPress={() => {
                    Alert.alert(
                      t.settings.cache.clearTitle,
                      t.settings.cache.clearMessage,
                    );
                  }}
                >
                  {t.settings.data.clearCache}
                </Button>

                <Button variant="secondary" onPress={handleResetNodeTrust}>
                  {t.settings.data.resetNodeTrust}
                </Button>

                <Text
                  style={{
                    fontSize: typography.size.xs,
                    color: colors.text_secondary,
                    marginTop: spacing.xs,
                  }}
                >
                  {t.settings.data.resetNodeTrustDescription}
                </Text>
              </Column>
            </Card>

            {/* On-Ramp (Demo) */}
            <Card>
              <Row style={{ alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }}>
                <Text
                  style={{
                    fontSize: typography.size.sm,
                    fontWeight: typography.weight.semibold,
                    color: colors.text_primary,
                  }}
                >
                  Buy Crypto
                </Text>
                <View
                  style={{
                    backgroundColor: colors.warning + '30',
                    paddingHorizontal: spacing.sm,
                    paddingVertical: 2,
                    borderRadius: borderRadius.sm,
                  }}
                >
                  <Text
                    style={{
                      fontSize: typography.size.xs,
                      fontWeight: typography.weight.bold,
                      color: colors.warning,
                    }}
                  >
                    DEMO
                  </Text>
                </View>
              </Row>

              <Text
                style={{
                  fontSize: typography.size.xs,
                  color: colors.text_secondary,
                  marginBottom: spacing.md,
                  lineHeight: 18,
                }}
              >
                Coinme on-ramp integration (dev widget).{'\n'}
                Buy crypto with cash at 10,000+ US retail locations or with card.
              </Text>

              <Button
                variant="outline"
                onPress={() => navigation.navigate('BuyCrypto')}
              >
                Open Coinme Widget (Demo)
              </Button>
            </Card>

            {/* Danger Zone */}
            <Card>
              <Text
                style={{
                  fontSize: typography.size.sm,
                  fontWeight: typography.weight.semibold,
                  color: colors.error,
                  marginBottom: spacing.md,
                }}
              >
                {t.settings.danger.title}
              </Text>

              <Column gap="sm">
                <Button variant="secondary" onPress={handleResetSettings}>
                  {t.settings.danger.resetSettings}
                </Button>

                <Button
                  variant="secondary"
                  onPress={
                    currentIdentity
                      ? handleLogout
                      : () => navigation.navigate('SignIn')
                  }
                  disabled={isLoading}
                >
                  {isLoading
                    ? t.settings.danger.loggingOut
                    : currentIdentity
                    ? t.settings.danger.logout
                    : 'Sign In or Create Account'}
                </Button>
              </Column>
            </Card>

            {/* Footer spacing */}
            <View style={{ height: spacing.xl }} />
          </Column>
        </ScrollView>
      </ScreenLayout>
    </View>
  );
};

export default SettingsScreen;
