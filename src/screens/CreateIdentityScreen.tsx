/**
 * CreateIdentityScreen
 * Screen for creating a new ZK-DID identity
 */

import React, { useState } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Card,
  Text,
  Column,
  Row,
  LoadingView,
  ScreenLayout,
  FormField,
  PasswordField,
  ActionFooter,
  Badge,
  Select,
  Checkbox,
} from '../components';
import { useAuth, useNodeConnection } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography } from '../theme';
import { AuthStackParamList } from '../navigation/AuthNavigator';

type CreateIdentityScreenProps = NativeStackScreenProps<AuthStackParamList, 'CreateIdentity'>;

const CreateIdentityScreen = ({ navigation }: CreateIdentityScreenProps) => {
  const { t } = useTranslation();
  const { createIdentity, isLoading } = useAuth();
  const { isConnected, isLoading: nodeLoading } = useNodeConnection(true);

  // Form state
  const [identityType, setIdentityType] = useState<
    'citizen' | 'organization' | 'developer' | 'validator'
  >('citizen');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    displayName?: string;
    password?: string;
    confirmPassword?: string;
    terms?: string;
  }>({});

  const identityTypes = [
    { id: 'citizen' as const, label: t.auth.createIdentity.types.citizen || 'Citizen' },
    { id: 'organization' as const, label: t.auth.createIdentity.types.organization || 'Organization' },
    { id: 'developer' as const, label: t.auth.createIdentity.types.developer || 'Developer' },
    { id: 'validator' as const, label: t.auth.createIdentity.types.validator || 'Validator' },
  ].filter(item => item.label);

  const handleCreateIdentity = async () => {
    setFieldErrors({});
    const errors: typeof fieldErrors = {};

    // Validation
    if (!displayName.trim()) {
      errors.displayName = t.auth.createIdentity.validation.displayNameRequired;
    } else if (displayName.trim().length < 2) {
      errors.displayName = t.auth.createIdentity.validation.displayNameTooShort;
    }

    if (!password) {
      errors.password = t.auth.createIdentity.validation.passphraseRequired;
    } else if (password.length < 8) {
      errors.password = t.auth.createIdentity.validation.passphraseTooShort;
    }

    if (password && password !== confirmPassword) {
      errors.confirmPassword = t.auth.createIdentity.validation.passphraseNoMatch;
    }

    if (!acceptedTerms) {
      errors.terms = t.auth.createIdentity.validation.termsRequired;
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    createIdentity({
      display_name: displayName.trim(),
      password,
      identity_type: identityType,
      recovery_options: [],
    }).then((identity) => {
      // Show seed phrases if available
      if (identity?.seedPhrases) {
        navigation.navigate('SeedPhrase', {
          seedPhrases: identity.seedPhrases.primary,
          walletType: 'primary',
        });
      } else {
        // Fallback: reset form and app will detect authenticated state
        setDisplayName('');
        setPassword('');
        setConfirmPassword('');
        setAcceptedTerms(false);
      }
    }).catch(() => {
      // Error is handled by auth context and displayed via error state
    });
  };

  const isCreateDisabled = isLoading || nodeLoading || !isConnected;

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

        {/* Identity Type Selection */}
        <Card>
          <Column gap="sm">
            <Text
              style={{
                fontSize: typography.size.sm,
                fontWeight: typography.weight.semibold,
                color: colors.text_primary,
              }}
            >
              {t.auth.createIdentity.selectType}
            </Text>
            <Select
              options={identityTypes}
              selectedId={identityType}
              onSelect={(id) => setIdentityType(id as typeof identityType)}
              label={t.auth.createIdentity.identityType}
              placeholder={t.auth.createIdentity.identityType}
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
            editable={!isCreateDisabled}
            helperText={!fieldErrors.displayName ? t.auth.createIdentity.displayNameHint : undefined}
            error={fieldErrors.displayName}
            containerStyle={{ marginBottom: 0 }}
          />
        </Card>

        {/* Password Input */}
        <Card>
          <Column gap="md">
            <PasswordField
              label={t.auth.createIdentity.passphrase}
              placeholder={t.auth.createIdentity.passphraseMinHint}
              value={password}
              onChangeText={setPassword}
              editable={!isCreateDisabled}
              containerStyle={{ marginBottom: 0 }}
              error={fieldErrors.password}
              helperText={t.auth.createIdentity.passphraseMinHint}
            />
            <PasswordField
              label={t.auth.createIdentity.passphraseConfirm}
              placeholder={t.auth.createIdentity.passphraseConfirm}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              editable={!isCreateDisabled}
              containerStyle={{ marginBottom: 0 }}
              error={fieldErrors.confirmPassword}
            />
            <Text
              style={{
                fontSize: typography.size.xs,
                color: colors.text_tertiary,
              }}
            >
              {t.auth.createIdentity.passphraseBlankHint}
            </Text>
          </Column>
        </Card>

        {/* Terms & Conditions */}
        <Card
          style={{
            borderWidth: fieldErrors.terms ? 2 : 1,
            borderColor: fieldErrors.terms ? colors.error : colors.border,
          }}
        >
          <Column gap="xs">
            <Row style={{ alignItems: 'center' }}>
              <Text
                style={{
                  fontSize: typography.size.sm,
                  fontWeight: typography.weight.semibold,
                  color: colors.text_primary,
                }}
              >
                {t.auth.createIdentity.termsTitle}
              </Text>
              <Text style={{ color: colors.error, marginLeft: spacing.xs }}>*</Text>
            </Row>
            <Text
              style={{
                fontSize: typography.size.xs,
                color: colors.text_secondary,
              }}
            >
              {t.auth.createIdentity.termsDescription}
            </Text>
            <Checkbox
              checked={acceptedTerms}
              onChange={setAcceptedTerms}
              disabled={isCreateDisabled}
            />
            {fieldErrors.terms && (
              <Text
                style={{
                  fontSize: typography.size.xs,
                  color: colors.error,
                  marginTop: spacing.xs,
                }}
              >
                {fieldErrors.terms}
              </Text>
            )}
          </Column>
        </Card>

        {/* Action Buttons */}
        <ActionFooter
          actions={[
            {
              label: t.auth.createIdentity.button,
              onPress: () => void handleCreateIdentity().catch(() => {}),
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
