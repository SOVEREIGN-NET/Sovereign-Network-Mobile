import React, { useState } from 'react';
import { ScrollView, View, Alert, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Card,
  Text,
  Button,
  Input,
  Column,
  Row,
  LoadingView,
} from '../components';
import { useAuth } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography, borderRadius } from '../theme';

const IdentitySettingsScreen = (_: any) => {
  const { t } = useTranslation();
  const { currentIdentity, updatePassphrase, updateBiometric, isLoading } = useAuth();

  const [currentPassphrase, setCurrentPassphrase] = useState('');
  const [newPassphrase, setNewPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(!!currentIdentity?.biometricHash);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!currentIdentity) {
    return <LoadingView />;
  }

  const handleChangePassphrase = async () => {
    setError(null);

    // Validation
    if (!currentPassphrase.trim()) {
      setError(t.identity.settings.validation.currentPassphraseRequired);
      return;
    }

    if (!newPassphrase.trim()) {
      setError(t.identity.settings.validation.newPassphraseRequired);
      return;
    }

    if (newPassphrase.length < 8) {
      setError(t.identity.settings.validation.newPassphraseTooShort);
      return;
    }

    if (newPassphrase !== confirmPassphrase) {
      setError(t.identity.settings.validation.passphraseNoMatch);
      return;
    }

    setIsSaving(true);
    try {
      await updatePassphrase(newPassphrase);
      Alert.alert('Success', t.identity.settings.success.passphraseUpdated);
      setCurrentPassphrase('');
      setNewPassphrase('');
      setConfirmPassphrase('');
    } catch (err: any) {
      setError(err.message || t.identity.settings.errors.passphraseUpdateFailed);
    } finally {
      setIsSaving(false);
    }
  };

  const handleBiometricToggle = async (enabled: boolean) => {
    setError(null);
    setIsSaving(true);
    try {
      await updateBiometric(enabled);
      setBiometricEnabled(enabled);
      Alert.alert(
        'Success',
        enabled ? t.identity.settings.success.biometricEnabled : t.identity.settings.success.biometricDisabled
      );
    } catch (err: any) {
      setError(err.message || t.identity.settings.errors.biometricUpdateFailed);
    } finally {
      setIsSaving(false);
    }
  };

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
          {/* Error Message */}
          {error && (
            <View
              style={{
                backgroundColor: colors.error,
                padding: spacing.md,
                borderRadius: borderRadius.base,
                borderLeftWidth: 4,
                borderLeftColor: colors.error_dark,
              }}
            >
              <Text style={{ color: colors.white }}>❌ {error}</Text>
            </View>
          )}

          {/* Passphrase Section */}
          <Card>
            <Text
              style={{
                fontSize: typography.size.sm,
                fontWeight: typography.weight.semibold,
                color: colors.text_primary,
                marginBottom: spacing.md,
              }}
            >
              {t.identity.settings.changePassphrase}
            </Text>

            <Column gap="sm">
              <View>
                <Text
                  style={{
                    fontSize: typography.size.xs,
                    fontWeight: typography.weight.semibold,
                    color: colors.text_primary,
                    marginBottom: spacing.sm,
                  }}
                >
                  {t.identity.settings.currentPassphrase}
                </Text>
                <Input
                  placeholder={t.identity.settings.currentPassphrasePlaceholder}
                  value={currentPassphrase}
                  onChangeText={setCurrentPassphrase}
                  secureTextEntry={!showPassphrase}
                  editable={!isLoading && !isSaving}
                />
              </View>

              <View>
                <Row
                  style={{
                    justifyContent: 'space-between',
                    marginBottom: spacing.sm,
                  }}
                >
                  <Text
                    style={{
                      fontSize: typography.size.xs,
                      fontWeight: typography.weight.semibold,
                      color: colors.text_primary,
                    }}
                  >
                    {t.identity.settings.newPassphrase}
                  </Text>
                </Row>
                <Input
                  placeholder={t.identity.settings.newPassphrasePlaceholder}
                  value={newPassphrase}
                  onChangeText={setNewPassphrase}
                  secureTextEntry={!showPassphrase}
                  editable={!isLoading && !isSaving}
                />
              </View>

              <View>
                <Row
                  style={{
                    justifyContent: 'space-between',
                    marginBottom: spacing.sm,
                  }}
                >
                  <Text
                    style={{
                      fontSize: typography.size.xs,
                      fontWeight: typography.weight.semibold,
                      color: colors.text_primary,
                    }}
                  >
                    {t.identity.settings.confirmPassphrase}
                  </Text>
                  <Pressable onPress={() => setShowPassphrase(!showPassphrase)}>
                    <Text
                      style={{
                        fontSize: typography.size.xs,
                        color: colors.primary,
                      }}
                    >
                      {showPassphrase ? t.identity.settings.showHide.hide : t.identity.settings.showHide.show}
                    </Text>
                  </Pressable>
                </Row>
                <Input
                  placeholder={t.identity.settings.confirmPassphrasePlaceholder}
                  value={confirmPassphrase}
                  onChangeText={setConfirmPassphrase}
                  secureTextEntry={!showPassphrase}
                  editable={!isLoading && !isSaving}
                />
              </View>

              <Button
                onPress={handleChangePassphrase}
                disabled={isLoading || isSaving}
                style={{ marginTop: spacing.md }}
              >
                {isSaving ? t.identity.settings.updatingButton : t.identity.settings.updateButton}
              </Button>
            </Column>
          </Card>

          {/* Biometric Section */}
          <Card>
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
                  {t.identity.settings.biometric.title}
                </Text>
                <Text
                  style={{
                    fontSize: typography.size.xs,
                    color: colors.text_secondary,
                    marginTop: spacing.xs,
                  }}
                >
                  {biometricEnabled ? t.identity.settings.biometric.enabled : t.identity.settings.biometric.disabled}
                </Text>
              </Column>
              <Button
                onPress={() => handleBiometricToggle(!biometricEnabled)}
                disabled={isLoading || isSaving}
                style={{
                  backgroundColor: biometricEnabled ? colors.success : colors.bg_light,
                  paddingHorizontal: spacing.md,
                }}
              >
                <Text style={{ color: colors.text_primary }}>
                  {biometricEnabled ? t.identity.settings.biometric.enabledButton : t.identity.settings.biometric.enableButton}
                </Text>
              </Button>
            </Row>
          </Card>

          {/* Security Info Card */}
          <Card>
            <View
              style={{
                backgroundColor: colors.bg_darker,
                padding: spacing.md,
                borderRadius: borderRadius.base,
                borderLeftWidth: 4,
                borderLeftColor: colors.warning,
              }}
            >
              <Text
                style={{
                  fontSize: typography.size.xs,
                  fontWeight: typography.weight.semibold,
                  color: colors.warning_dark,
                  marginBottom: spacing.sm,
                }}
              >
                {t.identity.settings.security.title}
              </Text>
              <Text
                style={{
                  fontSize: typography.size.xs,
                  color: colors.text_secondary,
                  lineHeight: typography.size.sm * 1.5,
                }}
              >
                {t.identity.settings.security.message}
              </Text>
            </View>
          </Card>

          {/* Backup Section */}
          <Card>
            <Column gap="sm">
              <Text
                style={{
                  fontSize: typography.size.sm,
                  fontWeight: typography.weight.semibold,
                  color: colors.text_primary,
                  marginBottom: spacing.sm,
                }}
              >
                {t.identity.settings.backup.title}
              </Text>
              <Button
                variant="secondary"
                onPress={() => {}}
                disabled={isLoading}
              >
                {t.identity.settings.backup.createButton}
              </Button>
              <Button
                variant="secondary"
                onPress={() => {}}
                disabled={isLoading}
              >
                {t.identity.settings.backup.viewButton}
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

export default IdentitySettingsScreen;
