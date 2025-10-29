import React, { useState } from 'react';
import { ScrollView, View, Alert, Pressable, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Card,
  Text,
  Button,
  Column,
  Row,
} from '../components';
import { useAuth } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography, borderRadius } from '../theme';

type Theme = 'light' | 'dark' | 'system';
type Language = 'en' | 'es' | 'fr' | 'de';

const SettingsScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { signOut, isLoading } = useAuth();
  const deviceColorScheme = useColorScheme();

  // Local state for settings (would be persisted in real app)
  const [theme, setTheme] = useState<Theme>('system');
  const [language, setLanguage] = useState<Language>('en');
  const [fontSize, setFontSize] = useState<'small' | 'normal' | 'large'>('normal');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true);
  const [showThemeOptions, setShowThemeOptions] = useState(false);
  const [showLanguageOptions, setShowLanguageOptions] = useState(false);
  const [showFontOptions, setShowFontOptions] = useState(false);

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
                  error?.message || t.settings.logout.errorMessage
                );
                console.error('Logout failed:', error);
              }
            })();
          },
          style: 'destructive',
        },
      ]
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
            setTheme('system');
            setLanguage('en');
            setFontSize('normal');
            setNotificationsEnabled(true);
            setAnalyticsEnabled(true);
            Alert.alert(t.settings.reset.successTitle, t.settings.reset.success);
          },
          style: 'destructive',
        },
      ]
    );
  };

  const getThemeLabel = () => {
    if (theme === 'system') {
      return deviceColorScheme === 'dark'
        ? t.settings.display.themes.dark
        : t.settings.display.themes.light;
    }
    return theme === 'dark' ? t.settings.display.themes.dark : t.settings.display.themes.light;
  };

  const currentTheme = getThemeLabel();

  const fontSizeLabel = t.settings.display.fontSizes[fontSize];

  const languageLabel = t.settings.languages[language];

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: colors.bg_darkest,
      }}
      edges={['bottom']}
    >
      <ScrollView
        style={{
          flex: 1,
          backgroundColor: colors.bg_darkest,
        }}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingTop: 20,
          paddingBottom: spacing.lg,
        }}
        scrollIndicatorInsets={{ right: 1 }}
        showsVerticalScrollIndicator={false}
      >
        <Column gap="xl">
          {/* Display Settings */}
          <Card>
            <Text
              style={{
                fontSize: typography.size.sm,
                fontWeight: typography.weight.semibold,
                color: colors.text_primary,
                marginBottom: spacing.md,
              }}
            >
              {t.settings.display.title}
            </Text>

            <Column gap="md">
              {/* Theme Selector */}
              <View>
                <Text
                  style={{
                    fontSize: typography.size.xs,
                    fontWeight: typography.weight.semibold,
                    color: colors.text_primary,
                    marginBottom: spacing.sm,
                  }}
                >
                  {t.settings.display.theme}
                </Text>
                <Pressable
                  onPress={() => setShowThemeOptions(!showThemeOptions)}
                  style={{
                    backgroundColor: colors.bg_darker,
                    padding: spacing.md,
                    borderRadius: borderRadius.base,
                    borderWidth: 1,
                    borderColor: colors.border,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: colors.text_primary }}>
                    🎨 {currentTheme}
                  </Text>
                  <Text style={{ color: colors.primary }}>
                    {showThemeOptions ? '▲' : '▼'}
                  </Text>
                </Pressable>

                {showThemeOptions && (
                  <Column gap="sm" style={{ marginTop: spacing.sm }}>
                    {(['light', 'dark', 'system'] as const).map(t_option => (
                      <Pressable
                        key={t_option}
                        onPress={() => {
                          setTheme(t_option);
                          setShowThemeOptions(false);
                        }}
                        style={{
                          backgroundColor:
                            theme === t_option ? colors.primary : colors.bg_darker,
                          padding: spacing.md,
                          borderRadius: borderRadius.base,
                          borderWidth: 1,
                          borderColor:
                            theme === t_option ? colors.primary : colors.border,
                        }}
                      >
                        <Text
                          style={{
                            color: theme === t_option ? colors.white : colors.text_primary,
                          }}
                        >
                          {t.settings.display.themes[t_option]}
                        </Text>
                      </Pressable>
                    ))}
                  </Column>
                )}
              </View>

              {/* Font Size Selector */}
              <View>
                <Text
                  style={{
                    fontSize: typography.size.xs,
                    fontWeight: typography.weight.semibold,
                    color: colors.text_primary,
                    marginBottom: spacing.sm,
                  }}
                >
                  {t.settings.display.fontSize}
                </Text>
                <Pressable
                  onPress={() => setShowFontOptions(!showFontOptions)}
                  style={{
                    backgroundColor: colors.bg_darker,
                    padding: spacing.md,
                    borderRadius: borderRadius.base,
                    borderWidth: 1,
                    borderColor: colors.border,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: colors.text_primary }}>
                    📝 {fontSizeLabel}
                  </Text>
                  <Text style={{ color: colors.primary }}>
                    {showFontOptions ? '▲' : '▼'}
                  </Text>
                </Pressable>

                {showFontOptions && (
                  <Column gap="sm" style={{ marginTop: spacing.sm }}>
                    {(['small', 'normal', 'large'] as const).map(size => (
                      <Pressable
                        key={size}
                        onPress={() => {
                          setFontSize(size);
                          setShowFontOptions(false);
                        }}
                        style={{
                          backgroundColor:
                            fontSize === size ? colors.primary : colors.bg_darker,
                          padding: spacing.md,
                          borderRadius: borderRadius.base,
                          borderWidth: 1,
                          borderColor:
                            fontSize === size ? colors.primary : colors.border,
                        }}
                      >
                        <Text
                          style={{
                            color: fontSize === size ? colors.white : colors.text_primary,
                            fontSize:
                              size === 'small'
                                ? 12
                                : size === 'normal'
                                ? 14
                                : 16,
                          }}
                        >
                          {t.settings.display.fontSizes[size]}
                        </Text>
                      </Pressable>
                    ))}
                  </Column>
                )}
              </View>
            </Column>
          </Card>

          {/* Language Settings */}
          <Card>
            <Text
              style={{
                fontSize: typography.size.sm,
                fontWeight: typography.weight.semibold,
                color: colors.text_primary,
                marginBottom: spacing.md,
              }}
            >
              {t.settings.language.title}
            </Text>

            <Pressable
              onPress={() => setShowLanguageOptions(!showLanguageOptions)}
              style={{
                backgroundColor: colors.bg_darker,
                padding: spacing.md,
                borderRadius: borderRadius.base,
                borderWidth: 1,
                borderColor: colors.border,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text style={{ color: colors.text_primary }}>
                🌐 {languageLabel}
              </Text>
              <Text style={{ color: colors.primary }}>
                {showLanguageOptions ? '▲' : '▼'}
              </Text>
            </Pressable>

            {showLanguageOptions && (
              <Column gap="sm" style={{ marginTop: spacing.sm }}>
                {(['en', 'es', 'fr', 'de'] as const).map(lang => (
                  <Pressable
                    key={lang}
                    onPress={() => {
                      setLanguage(lang);
                      setShowLanguageOptions(false);
                    }}
                    style={{
                      backgroundColor:
                        language === lang ? colors.primary : colors.bg_darker,
                      padding: spacing.md,
                      borderRadius: borderRadius.base,
                      borderWidth: 1,
                      borderColor:
                        language === lang ? colors.primary : colors.border,
                    }}
                  >
                    <Text
                      style={{
                        color: language === lang ? colors.white : colors.text_primary,
                      }}
                    >
                      {t.settings.languages[lang]}
                    </Text>
                  </Pressable>
                ))}
              </Column>
            )}
          </Card>

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
                  onPress={() => setNotificationsEnabled(!notificationsEnabled)}
                  style={{
                    backgroundColor: notificationsEnabled
                      ? colors.success
                      : colors.bg_light,
                    width: 50,
                    height: 28,
                    borderRadius: 14,
                    justifyContent: 'center',
                    alignItems: notificationsEnabled ? 'flex-end' : 'flex-start',
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
                    backgroundColor: analyticsEnabled ? colors.success : colors.bg_light,
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
                    ZHTP Web4
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
                    t.settings.about.termsText
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
                    t.settings.about.privacyText
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
                    t.settings.cache.clearMessage
                  );
                }}
              >
                {t.settings.data.clearCache}
              </Button>
            </Column>
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
              <Button
                variant="secondary"
                onPress={handleResetSettings}
                style={{
                  backgroundColor: colors.warning,
                }}
              >
                {t.settings.danger.resetSettings}
              </Button>

              <Button
                variant="secondary"
                onPress={handleLogout}
                disabled={isLoading}
                style={{
                  backgroundColor: colors.error,
                  opacity: isLoading ? 0.6 : 1,
                }}
              >
                {isLoading ? t.settings.danger.loggingOut : t.settings.danger.logout}
              </Button>
            </Column>
          </Card>

          {/* Footer spacing */}
          <View style={{ height: spacing.xl }} />
        </Column>
      </ScrollView>
    </SafeAreaView>
  );
};

export default SettingsScreen;
