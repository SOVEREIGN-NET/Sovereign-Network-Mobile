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
  Button,
  Modal,
} from '../components';
import { useAuth, useNodeConnection } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography } from '../theme';
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
  const [isPassphraseModalVisible, setIsPassphraseModalVisible] = useState(false);
  const [isCreatingIdentity, setIsCreatingIdentity] = useState(false);
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

    setIsCreatingIdentity(true);

    const backendType = identityType === 'citizen' ? 'human' : identityType;

    createIdentity({
      display_name: displayName.trim(),
      password,
      identity_type: backendType,
      recovery_options: [],
    }).then((identity) => {
      if (identity?.seedPhrases?.primary?.length) {
        console.log('✅ Identity created, navigating to SeedPhrase:', identity.did);
        navigation.navigate('SeedPhrase', {
          seedPhrases: identity.seedPhrases.primary,
          walletType: 'primary',
          identity,
        });
      } else {
        console.warn('⚠️ Identity created but no seed phrases returned');
        setDisplayName('');
        setPassword('');
        setConfirmPassword('');
        setAcceptedTerms(false);
      }
    }).catch((err) => {
      console.error('❌ Identity creation error:', err);
    }).finally(() => {
      setIsCreatingIdentity(false);
    });
  };

  const isCreateDisabled = isCreatingIdentity || nodeLoading || !isConnected;
  const isPassphraseSet = password.length >= 8 && password === confirmPassword;

  const validatePassphraseFields = () => {
    const errors: typeof fieldErrors = {};

    if (!password) {
      errors.password = t.auth.createIdentity.validation.passphraseRequired;
    } else if (password.length < 8) {
      errors.password = t.auth.createIdentity.validation.passphraseTooShort;
    }

    if (password && confirmPassword && password !== confirmPassword) {
      errors.confirmPassword = t.auth.createIdentity.validation.passphraseNoMatch;
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(prev => ({
        ...prev,
        password: errors.password,
        confirmPassword: errors.confirmPassword,
      }));
      return false;
    }

    setFieldErrors(prev => ({
      ...prev,
      password: undefined,
      confirmPassword: undefined,
    }));
    return true;
  };

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
            autoCapitalize="words"
            autoCorrect={false}
            importantForAutofill="no"
            spellCheck={false}
          />
        </Card>

        {/* Passphrase Summary */}
        <Card>
          <Column gap="md">
            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Text
                style={{
                  fontSize: typography.size.sm,
                  fontWeight: typography.weight.semibold,
                  color: colors.text_primary,
                }}
              >
                {t.auth.createIdentity.passphrase}
              </Text>
              <Badge
                label={
                  isPassphraseSet
                    ? t.auth.createIdentity.passphraseStatus.secure
                    : t.auth.createIdentity.passphraseStatus.pending
                }
                variant={isPassphraseSet ? 'success' : 'warning'}
              />
            </Row>
            <Text
              style={{
                fontSize: typography.size.xs,
                color: colors.text_secondary,
              }}
            >
              {t.auth.createIdentity.passphraseStatus.description}
            </Text>
            {(fieldErrors.password || fieldErrors.confirmPassword) && (
              <Text style={{ color: colors.error, fontSize: typography.size.xs }}>
                {fieldErrors.password || fieldErrors.confirmPassword}
              </Text>
            )}
            <Button
              onPress={() => setIsPassphraseModalVisible(true)}
              variant="secondary"
              disabled={isCreateDisabled}
            >
              {isPassphraseSet
                ? t.auth.createIdentity.passphraseStatus.updateButton
                : t.auth.createIdentity.passphraseStatus.setButton}
            </Button>
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

      <Modal
        visible={isPassphraseModalVisible}
        onClose={() => setIsPassphraseModalVisible(false)}
        title={t.auth.createIdentity.passphraseModal.title}
        closeOnBackdropPress={false}
      >
        <Column gap="md">
          <Text
            style={{
              fontSize: typography.size.xs,
              color: colors.text_secondary,
            }}
          >
            {t.auth.createIdentity.passphraseModal.description}
          </Text>
          <PasswordField
            label={t.auth.createIdentity.passphrase}
            placeholder={t.auth.createIdentity.passphraseMinHint}
            value={password}
            onChangeText={setPassword}
            helperText={t.auth.createIdentity.passphraseMinHint}
            error={fieldErrors.password}
            textContentType="none"
            autoComplete="off"
            importantForAutofill="no"
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
          />
          <PasswordField
            label={t.auth.createIdentity.passphraseConfirm}
            placeholder={t.auth.createIdentity.passphraseConfirm}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            error={fieldErrors.confirmPassword}
            textContentType="none"
            autoComplete="off"
            importantForAutofill="no"
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
          />
          <Text
            style={{
              fontSize: typography.size.xs,
              color: colors.text_tertiary,
            }}
          >
            {t.auth.createIdentity.passphraseBlankHint}
          </Text>
          <Row gap="md" style={{ justifyContent: 'flex-end' }}>
            <Button
              variant="secondary"
              onPress={() => setIsPassphraseModalVisible(false)}
            >
              {t.auth.createIdentity.passphraseModal.cancel}
            </Button>
            <Button
              onPress={() => {
                if (validatePassphraseFields()) {
                  setIsPassphraseModalVisible(false);
                }
              }}
            >
              {t.auth.createIdentity.passphraseModal.save}
            </Button>
          </Row>
        </Column>
      </Modal>
    </ScreenLayout>
  );
};

export default CreateIdentityScreen;
