/**
 * CreateIdentityScreen
 * Screen for creating a new ZK-DID identity
 */

import React, { useState, useCallback } from 'react';
import { View, Pressable } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Card,
  Text,
  Column,
  Row,
  LoadingView,
  ScreenLayout,
  FormField,
  ErrorAlert,
  SelectableOptionCard,
  ActionFooter,
} from '../components';
import { useAuth, useDebounce } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography, borderRadius } from '../theme';
import MockAuthService from '../services/MockAuthService';
import { AuthStackParamList } from '../navigation/AuthNavigator';

type CreateIdentityScreenProps = NativeStackScreenProps<AuthStackParamList, 'CreateIdentity'>;

const CreateIdentityScreen = (_: CreateIdentityScreenProps) => {
  const { t } = useTranslation();
  const { createIdentity, isLoading, error } = useAuth();

  // Form state
  const [identityType, setIdentityType] = useState<
    'citizen' | 'organization' | 'developer' | 'validator'
  >('citizen');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Debounced username check
  const debouncedCheckUsername = useDebounce(async (user: string) => {
    if (!user || user.length < 3) {
      setUsernameAvailable(null);
      return;
    }

    setCheckingUsername(true);
    try {
      const available = await MockAuthService.checkUsernameAvailability(user);
      setUsernameAvailable(available);
    } catch (err) {
      console.error('Failed to check username availability:', err);
      setUsernameAvailable(null);
    } finally {
      setCheckingUsername(false);
    }
  }, 500);

  const handleUsernameChange = useCallback(
    (text: string) => {
      setUsername(text);
      debouncedCheckUsername(text);
    },
    [debouncedCheckUsername]
  );

  const handleCreateIdentity = async () => {
    setLocalError(null);

    // Validation
    if (!displayName.trim()) {
      setLocalError(t.auth.createIdentity.validation.displayNameRequired);
      return;
    }

    if (displayName.trim().length < 2) {
      setLocalError(t.auth.createIdentity.validation.displayNameTooShort);
      return;
    }

    if (!username.trim()) {
      setLocalError(t.auth.createIdentity.validation.usernameRequired);
      return;
    }

    if (username.trim().length < 3) {
      setLocalError(t.auth.createIdentity.validation.usernameTooShort);
      return;
    }

    if (!/^\w+$/.test(username)) {
      setLocalError(t.auth.createIdentity.validation.usernameInvalid);
      return;
    }

    if (usernameAvailable === false) {
      setLocalError(t.auth.createIdentity.validation.usernameUnavailable);
      return;
    }

    if (!passphrase && !biometricEnabled) {
      setLocalError(t.auth.createIdentity.validation.authMethodRequired);
      return;
    }

    if (passphrase && passphrase.length < 8) {
      setLocalError(t.auth.createIdentity.validation.passphraseTooShort);
      return;
    }

    if (passphrase && passphrase !== confirmPassphrase) {
      setLocalError(t.auth.createIdentity.validation.passphraseNoMatch);
      return;
    }

    if (!acceptedTerms) {
      setLocalError(t.auth.createIdentity.validation.termsRequired);
      return;
    }

    try {
      await createIdentity({
        identityType,
        username: username.trim(),
        displayName: displayName.trim(),
        passphrase: passphrase || undefined,
        biometricHash: biometricEnabled ? 'mock_biometric_hash' : undefined,
        acceptedTerms,
      });

      // Reset form on success
      setDisplayName('');
      setUsername('');
      setPassphrase('');
      setConfirmPassphrase('');
      setAcceptedTerms(false);
      setBiometricEnabled(false);
      // App.tsx will detect authenticated state and switch to RootNavigator
    } catch (err: any) {
      setLocalError(err.message || t.auth.createIdentity.errors.creationFailed);
    }
  };

  const displayError = localError || error;

  if (isLoading) {
    return <LoadingView />;
  }

  const identityTypes = [
    { value: 'citizen' as const, label: t.auth.createIdentity.types.citizen, description: t.auth.createIdentity.types.citizenDescription },
    { value: 'organization' as const, label: t.auth.createIdentity.types.organization, description: t.auth.createIdentity.types.organizationDescription },
    { value: 'developer' as const, label: t.auth.createIdentity.types.developer, description: t.auth.createIdentity.types.developerDescription },
    { value: 'validator' as const, label: t.auth.createIdentity.types.validator, description: t.auth.createIdentity.types.validatorDescription },
  ];

  return (
    <ScreenLayout paddingTop={spacing.xl}>
      <Column gap="xl">
        {/* Error Message */}
        {displayError && <ErrorAlert message={displayError} icon="❌" />}

        {/* Identity Type Selection */}
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
              {t.auth.createIdentity.identityType}
            </Text>

            <Column gap="xs">
              {identityTypes.map((type) => (
                <SelectableOptionCard
                  key={type.value}
                  id={type.value}
                  title={type.label}
                  description={type.description}
                  isSelected={identityType === type.value}
                  onSelect={(id) => setIdentityType(id as typeof identityType)}
                />
              ))}
            </Column>
          </Column>
        </Card>

        {/* Username Input */}
        <Card>
          <Column gap="sm">
            <Row
              style={{
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: spacing.sm,
              }}
            >
              <Text
                style={{
                  fontSize: typography.size.sm,
                  fontWeight: typography.weight.semibold,
                  color: colors.text_primary,
                }}
              >
                {t.auth.createIdentity.username}
              </Text>
              {checkingUsername && (
                <Text style={{ color: colors.primary, fontSize: typography.size.xs }}>
                  {t.auth.createIdentity.usernameChecking}
                </Text>
              )}
              {!checkingUsername && usernameAvailable === true && (
                <Text style={{ color: colors.success, fontSize: typography.size.xs }}>
                  {t.auth.createIdentity.usernameAvailable}
                </Text>
              )}
              {!checkingUsername && usernameAvailable === false && (
                <Text style={{ color: colors.error, fontSize: typography.size.xs }}>
                  {t.auth.createIdentity.usernameTaken}
                </Text>
              )}
            </Row>
            <FormField
              label=""
              placeholder="yourname"
              value={username}
              onChangeText={handleUsernameChange}
              editable={!isLoading}
              helperText={t.auth.createIdentity.usernameWillBe.replace('{username}', username || 'yourname')}
              containerStyle={{ marginBottom: 0 }}
            />
          </Column>
        </Card>

        {/* Display Name Input */}
        <Card>
          <FormField
            label={t.auth.createIdentity.displayName}
            placeholder={t.auth.createIdentity.displayNamePlaceholder}
            value={displayName}
            onChangeText={setDisplayName}
            editable={!isLoading}
            helperText={t.auth.createIdentity.displayNameHint}
            containerStyle={{ marginBottom: 0 }}
          />
        </Card>

        {/* Passphrase Input */}
        <Card>
          <Column gap="sm">
            <Row
              style={{
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: spacing.sm,
              }}
            >
              <Text
                style={{
                  fontSize: typography.size.sm,
                  fontWeight: typography.weight.semibold,
                  color: colors.text_primary,
                }}
              >
                {t.auth.createIdentity.passphrase}
              </Text>
              <Pressable onPress={() => setShowPassphrase(!showPassphrase)}>
                <Text
                  style={{
                    fontSize: typography.size.xs,
                    color: colors.primary,
                  }}
                >
                  {showPassphrase ? t.auth.createIdentity.passphraseShowHide.hide : t.auth.createIdentity.passphraseShowHide.show}
                </Text>
              </Pressable>
            </Row>
            <FormField
              label=""
              placeholder={t.auth.createIdentity.passphraseMinHint}
              value={passphrase}
              onChangeText={setPassphrase}
              secureTextEntry={!showPassphrase}
              editable={!isLoading}
              containerStyle={{ marginBottom: spacing.sm }}
            />
            <FormField
              label=""
              placeholder={t.auth.createIdentity.passphraseConfirm}
              value={confirmPassphrase}
              onChangeText={setConfirmPassphrase}
              secureTextEntry={!showPassphrase}
              editable={!isLoading}
              containerStyle={{ marginBottom: 0 }}
            />
            <Text
              style={{
                fontSize: typography.size.xs,
                color: colors.text_tertiary,
                marginTop: spacing.md,
              }}
            >
              {t.auth.createIdentity.passphraseBlankHint}
            </Text>
          </Column>
        </Card>

        {/* Biometric Setup */}
        <Card>
          <Column gap="sm">
            <Row
              style={{
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Column gap="xs" style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: typography.size.sm,
                    fontWeight: typography.weight.semibold,
                    color: colors.text_primary,
                  }}
                >
                  {t.auth.createIdentity.biometric}
                </Text>
                <Text
                  style={{
                    fontSize: typography.size.xs,
                    color: colors.text_secondary,
                  }}
                >
                  {biometricEnabled
                    ? t.auth.createIdentity.biometricEnabled
                    : t.auth.createIdentity.biometricDisabled}
                </Text>
              </Column>
              <Pressable
                onPress={() => setBiometricEnabled(!biometricEnabled)}
                style={{
                  width: spacing.xl * 2 + spacing.sm,
                  height: spacing.lg + spacing.md,
                  borderRadius: borderRadius.lg,
                  backgroundColor: biometricEnabled
                    ? colors.success
                    : colors.bg_light,
                  justifyContent: 'center',
                  alignItems: biometricEnabled ? 'flex-end' : 'flex-start',
                  paddingHorizontal: spacing.xxs,
                }}
              >
                <View
                  style={{
                    width: typography.size['3xl'],
                    height: typography.size['3xl'],
                    borderRadius: borderRadius.full,
                    backgroundColor: colors.white,
                  }}
                />
              </Pressable>
            </Row>
          </Column>
        </Card>

        {/* Terms & Conditions */}
        <Card>
          <Row style={{ alignItems: 'flex-start', gap: spacing.md }}>
            <Pressable
              onPress={() => setAcceptedTerms(!acceptedTerms)}
              style={{
                width: typography.size['3xl'],
                height: typography.size['3xl'],
                borderRadius: borderRadius.sm,
                backgroundColor: acceptedTerms
                  ? colors.success
                  : colors.bg_light,
                borderWidth: 2,
                borderColor: acceptedTerms
                  ? colors.success
                  : colors.border,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              {acceptedTerms && (
                <Text style={{ color: colors.white, fontSize: typography.size.lg }}>✓</Text>
              )}
            </Pressable>
            <Column style={{ flex: 1 }}>
              <Text style={{ fontSize: typography.size.sm, color: colors.text_primary }}>
                {t.auth.createIdentity.terms}{' '}
                <Text style={{ color: colors.primary }}>{t.auth.createIdentity.termsPrivacy}</Text>
              </Text>
            </Column>
          </Row>
        </Card>

        {/* Action Buttons */}
        <ActionFooter
          actions={[
            {
              label: isLoading ? t.auth.createIdentity.buttonLoading : t.auth.createIdentity.button,
              onPress: handleCreateIdentity,
              disabled: isLoading,
              loading: isLoading,
            },
          ]}
        />
      </Column>
    </ScreenLayout>
  );
};

export default CreateIdentityScreen;
