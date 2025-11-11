/**
 * CreateIdentityScreen
 * Screen for creating a new ZK-DID identity
 */

import React, { useState } from 'react';
import { Pressable } from 'react-native';
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
  Badge,
} from '../components';
import { useAuth, useNodeConnection } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography, borderRadius } from '../theme';
import { AuthStackParamList } from '../navigation/AuthNavigator';

type CreateIdentityScreenProps = NativeStackScreenProps<AuthStackParamList, 'CreateIdentity'>;

const CreateIdentityScreen = ({ navigation }: CreateIdentityScreenProps) => {
  const { t } = useTranslation();
  const { createIdentity, isLoading, error } = useAuth();
  const { isConnected, isLoading: nodeLoading } = useNodeConnection(true);

  // Form state
  const [identityType, setIdentityType] = useState<
    'citizen' | 'organization' | 'developer' | 'validator'
  >('citizen');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const identityTypes = [
    { value: 'citizen' as const, label: t.auth.createIdentity.types.citizen, description: t.auth.createIdentity.types.citizenDescription },
    { value: 'organization' as const, label: t.auth.createIdentity.types.organization, description: t.auth.createIdentity.types.organizationDescription },
    { value: 'developer' as const, label: t.auth.createIdentity.types.developer, description: t.auth.createIdentity.types.developerDescription },
    { value: 'validator' as const, label: t.auth.createIdentity.types.validator, description: t.auth.createIdentity.types.validatorDescription },
  ];

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

    if (!password) {
      setLocalError(t.auth.createIdentity.validation.passphraseTooShort);
      return;
    }

    if (password.length < 8) {
      setLocalError(t.auth.createIdentity.validation.passphraseTooShort);
      return;
    }

    if (password !== confirmPassword) {
      setLocalError(t.auth.createIdentity.validation.passphraseNoMatch);
      return;
    }

    if (!acceptedTerms) {
      setLocalError(t.auth.createIdentity.validation.termsRequired);
      return;
    }

    try {
      await createIdentity({
        display_name: displayName.trim(),
        password,
        identity_type: identityType,
        recovery_options: [],
      });

      // Reset form on success
      setDisplayName('');
      setPassword('');
      setConfirmPassword('');
      setAcceptedTerms(false);
      // App.tsx will detect authenticated state and switch to RootNavigator
    } catch (err: any) {
      setLocalError(err.message || t.auth.createIdentity.errors.creationFailed);
    }
  };

  const isCreateDisabled = isLoading || nodeLoading || !isConnected;
  const displayError = localError || error;

  if (isLoading) {
    return <LoadingView />;
  }

  return (
    <ScreenLayout paddingTop={spacing.xl}>
      <Column gap="xl">
        {/* Node Connection Status */}
        <Card>
          <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Column gap="xs" style={{ flex: 1 }}>
              <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary, fontWeight: typography.weight.medium }}>
                {t.app.nodeStatus}
              </Text>
            </Column>
            <Badge
              label={isConnected ? t.app.connected : t.app.disconnected}
              variant={isConnected ? 'success' : 'error'}
            />
          </Row>
        </Card>

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

        {/* Display Name Input */}
        <Card>
          <FormField
            label={t.auth.createIdentity.displayName}
            placeholder={t.auth.createIdentity.displayNamePlaceholder}
            value={displayName}
            onChangeText={setDisplayName}
            editable={!isLoading || !isCreateDisabled}
            helperText={t.auth.createIdentity.displayNameHint}
            containerStyle={{ marginBottom: 0 }}
          />
        </Card>

        {/* Password Input */}
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
              <Pressable onPress={() => setShowPassword(!showPassword)}>
                <Text
                  style={{
                    fontSize: typography.size.xs,
                    color: colors.primary,
                  }}
                >
                  {showPassword ? t.auth.createIdentity.passphraseShowHide.hide : t.auth.createIdentity.passphraseShowHide.show}
                </Text>
              </Pressable>
            </Row>
            <FormField
              label=""
              placeholder={t.auth.createIdentity.passphraseMinHint}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              editable={!isCreateDisabled}
              containerStyle={{ marginBottom: spacing.sm }}
            />
            <FormField
              label=""
              placeholder={t.auth.createIdentity.passphraseConfirm}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showPassword}
              editable={!isCreateDisabled}
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

        {/* Terms & Conditions */}
        <Card>
          <Row
            style={{
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Column gap="xs" style={{ flex: 1, marginRight: spacing.md }}>
              <Text
                style={{
                  fontSize: typography.size.sm,
                  fontWeight: typography.weight.semibold,
                  color: colors.text_primary,
                }}
              >
                {t.auth.createIdentity.termsTitle}
              </Text>
              <Text
                style={{
                  fontSize: typography.size.xs,
                  color: colors.text_secondary,
                }}
              >
                {t.auth.createIdentity.termsDescription}
              </Text>
            </Column>
            <Pressable
              onPress={() => setAcceptedTerms(!acceptedTerms)}
              style={{
                width: spacing.lg,
                height: spacing.lg,
                borderRadius: borderRadius.sm,
                backgroundColor: acceptedTerms ? colors.success : colors.bg_light,
                justifyContent: 'center',
                alignItems: 'center',
                borderWidth: acceptedTerms ? 0 : 1,
                borderColor: colors.border_light,
              }}
            >
              {acceptedTerms && (
                <Text style={{ color: colors.white, fontSize: typography.size.base }}>✓</Text>
              )}
            </Pressable>
          </Row>
        </Card>

        {/* Action Buttons */}
        <ActionFooter
          actions={[
            {
              label: t.auth.createIdentity.button,
              onPress: () => handleCreateIdentity(),
              disabled: isCreateDisabled,
              loading: isLoading,
            },
            {
              label: t.app.back,
              onPress: () => navigation.goBack(),
              variant: 'secondary' as const,
              disabled: isLoading,
            },
          ]}
        />
      </Column>
    </ScreenLayout>
  );
};

export default CreateIdentityScreen;
