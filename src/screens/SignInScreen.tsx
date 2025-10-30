/**
 * SignInScreen
 * Screen for signing in with existing ZK-DID identity
 */

import React, { useState, useEffect } from 'react';
import { View, Pressable } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Card,
  Text, Column,
  Row,
  LoadingView,
  ScreenLayout,
  FormField,
  ErrorAlert,
  InfoCard,
  ActionFooter
} from '../components';
import { useAuth } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography } from '../theme';
import { AuthStackParamList } from '../navigation/AuthNavigator';
import MockAuthService from '../services/MockAuthService';

type SignInScreenProps = NativeStackScreenProps<AuthStackParamList, 'SignIn'>;

const SignInScreen = ({ navigation }: SignInScreenProps) => {
  const { t } = useTranslation();
  const { signIn, isLoading, error } = useAuth();

  const [did, setDid] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Load demo credentials on mount
  useEffect(() => {
    const demoCredentials = MockAuthService.getDemoCredentials();
    setDid(demoCredentials.did);
    setPassphrase(demoCredentials.passphrase);
  }, []);

  const handleSignIn = async () => {
    setLocalError(null);

    // Validation
    if (!did.trim()) {
      setLocalError(t.auth.signIn.validation.didRequired);
      return;
    }

    if (!passphrase) {
      setLocalError(t.auth.signIn.validation.passphraseRequired);
      return;
    }

    try {
      await signIn(did, passphrase);
      // Reset form on success
      setDid('');
      setPassphrase('');
      // App.tsx will detect authenticated state and switch to RootNavigator
    } catch (err: any) {
      setLocalError(err.message || t.auth.signIn.errors.signInFailed);
    }
  };

  const displayError = localError || error;

  if (isLoading) {
    return <LoadingView />;
  }

  return (
    <ScreenLayout>
      <Column gap="xl">
        {/* Error Message */}
        {displayError && <ErrorAlert message={displayError} icon="❌" />}

        {/* Form Card */}
        <Card>
          <Column gap="md">
            {/* DID Input */}
            <FormField
              label={t.auth.signIn.didLabel}
              placeholder={t.auth.signIn.didPlaceholder}
              value={did}
              onChangeText={setDid}
              editable={!isLoading}
              helperText={t.auth.signIn.didExample}
            />

            {/* Passphrase Input */}
            <View>
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
                  {t.auth.signIn.passphraseLabel}
                </Text>
                <Pressable onPress={() => setShowPassword(!showPassword)}>
                  <Text
                    style={{
                      fontSize: typography.size.xs,
                      color: colors.primary,
                    }}
                  >
                    {showPassword ? t.auth.signIn.passphraseShowHide.hide : t.auth.signIn.passphraseShowHide.show}
                  </Text>
                </Pressable>
              </Row>
              <FormField
                label=""
                placeholder={t.auth.signIn.passphrasePlaceholder}
                value={passphrase}
                onChangeText={setPassphrase}
                secureTextEntry={!showPassword}
                editable={!isLoading}
                helperText={t.auth.signIn.passphraseHint}
                containerStyle={{ marginBottom: 0 }}
              />
            </View>

            {/* Test Credentials Info */}
            <InfoCard
              title={t.auth.signIn.demoLabel}
              description={t.auth.signIn.demoInfo}
              type="info"
              icon="ℹ️"
            />
          </Column>
        </Card>

        {/* Action Buttons */}
        <ActionFooter
          actions={[
            {
              label: isLoading ? t.auth.signIn.buttonLoading : t.auth.signIn.button,
              onPress: () => {
                handleSignIn().catch(() => {});
              },
              disabled: isLoading,
              loading: isLoading,
            },
            {
              label: t.auth.signIn.createNew,
              onPress: () => navigation.navigate('CreateIdentity'),
              variant: 'secondary',
              disabled: isLoading,
            },
            {
              label: t.auth.signIn.recover,
              onPress: () => navigation.navigate('RecoverIdentity'),
              variant: 'secondary',
              disabled: isLoading,
            },
          ]}
        />
      </Column>
    </ScreenLayout>
  );
};

export default SignInScreen;
