/**
 * SignInScreen
 * Screen for signing in with existing ZK-DID identity
 */

import React, { useState, useEffect } from 'react';
import { View, Pressable, Text as RNText } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Card,
  Text, Column,
  Row,
  LoadingView,
  ScreenLayout,
  FormField,
  ErrorAlert,
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
        {/* Welcome Header */}
        <View style={{
          alignItems: 'center',
          paddingVertical: spacing.xl,
          marginBottom: spacing.xxs,
        }}>
          <Text
            style={{
              fontSize: typography.size['2xl'],
              fontWeight: typography.weight.bold,
              marginBottom: spacing.xxs,
              textAlign: 'center',
              color: colors.text_primary,
            }}
          >
            {t.auth.signIn.welcome.heading}
          </Text>

          {/* Gradient Text for Sovereign Network */}
          <MaskedView
            style={{ marginBottom: spacing.lg, alignSelf: 'center' }}
            maskElement={
              <RNText
                style={{
                  fontSize: typography.size['3xl'],
                  fontWeight: typography.weight.bold,
                  textAlign: 'center',
                  color: colors.white,
                }}
              >
                {t.auth.signIn.welcome.accent}
              </RNText>
            }
          >
            <LinearGradient
              colors={['#ff00d4', '#00d4ff']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                height: typography.size['3xl'] * 1.5,
                width: 300,
              }}
            />
          </MaskedView>

          <Text
            variant="body"
            style={{
              color: colors.text_secondary,
              textAlign: 'center',
              fontSize: typography.size.base,
              paddingHorizontal: spacing.lg,
              opacity: 0.8,
            }}
          >
            {t.auth.signIn.welcome.subtitle}
          </Text>
        </View>

        {/* Error Message */}
        {displayError && <ErrorAlert message={displayError} icon="❌" />}

        {/* Form Card */}
        <Card>
          <Column gap="xs">
            {/* DID Input */}
            <FormField
              label={t.auth.signIn.didLabel}
              placeholder={t.auth.signIn.didPlaceholder}
              value={did}
              onChangeText={setDid}
              editable={!isLoading}
              helperText=''
            />

            {/* Passphrase Input */}
            <View>
              <Row
                style={{
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: spacing.xxs,
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
                helperText=''
                containerStyle={{ marginBottom: 0 }}
              />
            </View>
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
