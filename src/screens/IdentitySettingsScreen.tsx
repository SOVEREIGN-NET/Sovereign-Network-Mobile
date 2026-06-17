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
  EyeOpenIcon,
  EyeClosedIcon,
  LockIcon,
  KeyIcon,
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
  const [showCurrentPassphrase, setShowCurrentPassphrase] = useState(false);
  const [showNewPassphrase, setShowNewPassphrase] = useState(false);
  const [showConfirmPassphrase, setShowConfirmPassphrase] = useState(false);
  const [biometricEnabled] = useState(!!currentIdentity?.biometricHash);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  /** Factory: creates an independent eye toggle for a given field. */
  const eyeToggle = (
    visible: boolean,
    onToggle: () => void,
  ) => (
    <Pressable
      onPress={onToggle}
      hitSlop={8}
      style={{ padding: 2 }}
    >
      {visible ? (
        <EyeOpenIcon size={18} color={colors.primary} />
      ) : (
        <EyeClosedIcon size={18} color={colors.primary} />
      )}
    </Pressable>
  );

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
                secureTextEntry={!showCurrentPassphrase}
                editable={!isLoading && !isSaving}
                containerStyle={{ marginBottom: 0 }}
                rightIcon={eyeToggle(showCurrentPassphrase, () => setShowCurrentPassphrase(prev => !prev))}
              />

              <FormField
                label={t.identity.settings.newPassphrase}
                placeholder={t.identity.settings.newPassphrasePlaceholder}
                value={newPassphrase}
                onChangeText={setNewPassphrase}
                secureTextEntry={!showNewPassphrase}
                editable={!isLoading && !isSaving}
                containerStyle={{ marginBottom: 0 }}
                rightIcon={eyeToggle(showNewPassphrase, () => setShowNewPassphrase(prev => !prev))}
              />

              <FormField
                label={t.identity.settings.confirmPassphrase}
                placeholder={t.identity.settings.confirmPassphrasePlaceholder}
                value={confirmPassphrase}
                onChangeText={setConfirmPassphrase}
                secureTextEntry={!showConfirmPassphrase}
                editable={!isLoading && !isSaving}
                containerStyle={{ marginBottom: 0 }}
                rightIcon={eyeToggle(showConfirmPassphrase, () => setShowConfirmPassphrase(prev => !prev))}
              />

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
            <Card
              style={{
                backgroundColor: `${colors.warning}15`,
                borderColor: colors.warning,
                borderWidth: 1,
              }}
            >
              <View style={{ padding: spacing.xxs }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.sm,
                    marginBottom: spacing.sm,
                  }}
                >
                  <LockIcon size={18} color={colors.warning} />
                  <Text
                    variant="body"
                    weight="semibold"
                    color={colors.warning}
                  >
                    {t.identity.settings.security.title}
                  </Text>
                </View>
                <Text variant="caption" color={colors.text_secondary}>
                  {t.identity.settings.security.message}
                </Text>
              </View>
            </Card>
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <LockIcon size={16} color={isLoading ? colors.text_tertiary : colors.text_primary} />
                  <Text>{t.identity.settings.backup.createButton}</Text>
                </View>
              </Button>
              <Button
                variant="secondary"
                onPress={() => navigation.navigate('BackupIdentity')}
                disabled={isLoading}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <KeyIcon size={16} color={isLoading ? colors.text_tertiary : colors.text_primary} />
                  <Text>{t.identity.settings.backup.viewButton}</Text>
                </View>
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
