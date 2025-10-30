import React, { useState } from 'react';
import { View, Alert, Pressable } from 'react-native';
import {
  Card,
  Text,
  Button,
  FormField,
  Column,
  Row,
  LoadingView,
  ScreenLayout,
  ErrorAlert,
  InfoCard,
} from '../components';
import { useAuth } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography } from '../theme';

const IdentitySettingsScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { currentIdentity, updatePassphrase, isLoading } = useAuth();

  const [currentPassphrase, setCurrentPassphrase] = useState('');
  const [newPassphrase, setNewPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [biometricEnabled] = useState(!!currentIdentity?.biometricHash);
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

  return (
    <ScreenLayout>
      <Column gap="xl">
          {/* Error Message */}
          {error && <ErrorAlert message={error} icon="❌" />}

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
              <FormField
                label={t.identity.settings.currentPassphrase}
                placeholder={t.identity.settings.currentPassphrasePlaceholder}
                value={currentPassphrase}
                onChangeText={setCurrentPassphrase}
                secureTextEntry={!showPassphrase}
                editable={!isLoading && !isSaving}
                containerStyle={{ marginBottom: 0 }}
              />

              <FormField
                label={t.identity.settings.newPassphrase}
                placeholder={t.identity.settings.newPassphrasePlaceholder}
                value={newPassphrase}
                onChangeText={setNewPassphrase}
                secureTextEntry={!showPassphrase}
                editable={!isLoading && !isSaving}
                containerStyle={{ marginBottom: 0 }}
              />

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
                <FormField
                  label=""
                  placeholder={t.identity.settings.confirmPassphrasePlaceholder}
                  value={confirmPassphrase}
                  onChangeText={setConfirmPassphrase}
                  secureTextEntry={!showPassphrase}
                  editable={!isLoading && !isSaving}
                  containerStyle={{ marginBottom: 0 }}
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
                onPress={() => navigation.navigate('BiometricVerification')}
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
          <View style={{ paddingHorizontal: spacing.lg }}>
            <InfoCard
              title={t.identity.settings.security.title}
              description={t.identity.settings.security.message}
              type="warning"
              icon="🔒"
            />
          </View>

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
                onPress={() => navigation.navigate('BackupIdentity')}
                disabled={isLoading}
              >
                {t.identity.settings.backup.createButton}
              </Button>
              <Button
                variant="secondary"
                onPress={() => navigation.navigate('BackupIdentity')}
                disabled={isLoading}
              >
                {t.identity.settings.backup.viewButton}
              </Button>
            </Column>
          </Card>

        {/* Footer spacing */}
        <View style={{ height: spacing.xl }} />
      </Column>
    </ScreenLayout>
  );
};

export default IdentitySettingsScreen;
