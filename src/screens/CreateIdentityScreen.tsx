import React, { useState } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { View } from 'react-native';
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
import { validatePassword, getStrengthDescription, getStrengthColor } from '../utils/passwordValidator';
import { AuthStackParamList } from '../navigation/AuthNavigator';

type CreateIdentityScreenProps = NativeStackScreenProps<AuthStackParamList, 'CreateIdentity'>;

const CreateIdentityScreen = ({ navigation }: CreateIdentityScreenProps) => {
  const { t } = useTranslation();
  const { createIdentity } = useAuth();
  const { isConnected, isLoading: nodeLoading } = useNodeConnection(true);

  // Form state
  const [identityType, setIdentityType] = useState<
    'citizen' | 'organization' | 'developer' | 'validator'
  >('citizen');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isCreatingIdentity, setIsCreatingIdentity] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<ReturnType<typeof validatePassword>>({
    valid: false,
    errors: [],
    strength: 'weak',
    score: 0,
  });
  const [fieldErrors, setFieldErrors] = useState<{
    displayName?: string;
    password?: string;
    confirmPassword?: string;
    terms?: string;
  }>({});

  const identityTypes = [
    { id: 'citizen' as const, label: 'Citizen (Human)', disabled: false },
    { id: 'device' as const, label: 'Device', disabled: true, badge: 'Soon' },
    { id: 'organization' as const, label: 'Organization', disabled: true, badge: 'Soon' },
    { id: 'agent' as const, label: 'Agent', disabled: true, badge: 'Soon' },
    { id: 'contract' as const, label: 'Contract', disabled: true, badge: 'Soon' },
  ];

  // SECURITY: Real-time password validation
  const handlePasswordChange = (newPassword: string) => {
    setPassword(newPassword);
    if (newPassword) {
      const validation = validatePassword(newPassword);
      setPasswordStrength(validation);
    } else {
      setPasswordStrength({
        valid: false,
        errors: [],
        strength: 'weak',
        score: 0,
      });
    }
  };

  const handleCreateIdentity = async () => {
    setFieldErrors({});
    const errors: typeof fieldErrors = {};

    // Validation
    if (!displayName.trim()) {
      errors.displayName = t.auth.createIdentity.validation.displayNameRequired;
    } else if (displayName.trim().length < 2) {
      errors.displayName = t.auth.createIdentity.validation.displayNameTooShort;
    }

    // Password validation - SECURITY: Use strong policy
    if (!password) {
      errors.password = t.auth.createIdentity.validation.passphraseRequired;
    } else if (!passwordStrength.valid) {
      // Use first error from validation
      errors.password = passwordStrength.errors[0] || 'Password does not meet security requirements';
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

    setIsCreatingIdentity(true);

    const backendType = identityType === 'citizen' ? 'human' : identityType;

    createIdentity({
      display_name: displayName.trim(),
      password,
      identity_type: backendType,
      recovery_options: [],
    }).then((identity) => {
      // SECURITY: No logging of sensitive data (seed phrases, keys, etc.)
      // Only log non-sensitive metadata in development mode
      if (__DEV__) {
        console.log('✅ Identity created successfully');
      }

      // Check if we have seed phrases for all 3 wallets (server-generated)
      const hasPrimary = identity?.walletSeedPhrases?.primary?.length > 0;
      const hasUbi = identity?.walletSeedPhrases?.ubi?.length > 0;
      const hasSavings = identity?.walletSeedPhrases?.savings?.length > 0;

      if (hasPrimary) {
        if (__DEV__) {
          console.log(`📊 Identity created with wallets: Primary=${hasPrimary}, UBI=${hasUbi}, Savings=${hasSavings}`);
        }

        // Navigate to seed phrase screen with all wallets
        // For citizens, we have 3 wallets to show
        const totalSteps = (hasPrimary ? 1 : 0) + (hasUbi ? 1 : 0) + (hasSavings ? 1 : 0);

        navigation.navigate('SeedPhrase', {
          seedPhrases: identity.walletSeedPhrases?.primary?.split(' ') || [],
          walletType: 'primary',
          identity,
          allSeedPhrases: {
            primary: identity.walletSeedPhrases?.primary?.split(' '),
            ubi: identity.walletSeedPhrases?.ubi?.split(' '),
            savings: identity.walletSeedPhrases?.savings?.split(' '),
          },
          currentStep: 1,
          totalSteps,
        });
      } else {
        console.warn('⚠️ Identity created but no wallet seed phrases available');
        // SECURITY: Do not log full identity object as it contains sensitive data
        setFieldErrors({
          displayName: 'Wallet seed phrases are not available. Please contact support.',
        });
      }
    }).catch((err) => {
      console.error('❌ Identity creation error:', err);
      setFieldErrors({
        displayName: err?.message || 'Failed to create identity. Please try again.',
      });
    }).finally(() => {
      setIsCreatingIdentity(false);
    });
  };

  const isCreateDisabled = isCreatingIdentity || nodeLoading || !isConnected;
  // SECURITY: Password must be valid AND confirmed to enable create button
  const isPassphraseSet = passwordStrength.valid && password === confirmPassword;

  if (isCreatingIdentity) {
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
            helperText={t.auth.createIdentity.displayNameHint}
            error={fieldErrors.displayName}
            containerStyle={{ marginBottom: 0 }}
            textContentType="none"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect={false}
            importantForAutofill="no"
            spellCheck={false}
          />
        </Card>

        {/* Password Section */}
        <Card>
          <Text
            style={{
              fontSize: typography.size.sm,
              fontWeight: typography.weight.semibold,
              color: colors.text_primary,
              marginBottom: spacing.sm,
            }}
          >
            {t.auth.createIdentity.passphrase}
          </Text>
          <PasswordField
            label=""
            placeholder={t.auth.createIdentity.passphraseMinHint}
            value={password}
            onChangeText={handlePasswordChange}
            error={fieldErrors.password}
            editable={!isCreateDisabled}
            containerStyle={{ marginBottom: spacing.xs }}
            textContentType="none"
            autoComplete="off"
            importantForAutofill="no"
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
          />
          {/* Password Strength Indicator */}
          {password && (
            <Column gap="xs" style={{ marginTop: spacing.xs }}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary }}>
                  Strength:
                </Text>
                <Text
                  style={{
                    fontSize: typography.size.xs,
                    color: getStrengthColor(passwordStrength.strength),
                    fontWeight: typography.weight.semibold,
                  }}
                >
                  {getStrengthDescription(passwordStrength.strength)}
                </Text>
              </Row>
              {/* Progress bar for strength */}
              <View
                style={{
                  height: 4,
                  backgroundColor: colors.border,
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    height: '100%',
                    width: `${passwordStrength.score}%`,
                    backgroundColor: getStrengthColor(passwordStrength.strength),
                  }}
                />
              </View>
            </Column>
          )}
          <PasswordField
            label=""
            placeholder={t.auth.createIdentity.passphraseConfirm}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            error={fieldErrors.confirmPassword}
            editable={!isCreateDisabled}
            containerStyle={{ marginBottom: 0 }}
            textContentType="none"
            autoComplete="off"
            importantForAutofill="no"
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
          />
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
              loading: isCreatingIdentity,
            },
            {
              label: t.app.back,
              onPress: () => navigation.goBack(),
              variant: 'secondary' as const,
              disabled: isCreatingIdentity,
            },
          ]}
        />
      </Column>

    </ScreenLayout>
  );
};

export default CreateIdentityScreen;
