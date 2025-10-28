/**
 * SignInScreen
 * Screen for signing in with existing ZK-DID identity
 */

import React, { useState, useEffect } from 'react';
import { ScrollView, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
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
        {displayError && (
          <View
            style={{
              backgroundColor: colors.error,
              padding: spacing.md,
              borderRadius: borderRadius.base,
              borderLeftWidth: 4,
              borderLeftColor: colors.error_dark,
            }}
          >
            <Text variant="body" style={{ color: colors.white }}>
              {displayError}
            </Text>
          </View>
        )}

        {/* Form Card */}
        <Card>
          <Column gap="md">
            {/* DID Input */}
            <View>
              <Text
                style={{
                  fontSize: typography.size.sm,
                  fontWeight: typography.weight.semibold,
                  color: colors.text_primary,
                  marginBottom: spacing.sm,
                }}
              >
                {t.auth.signIn.didLabel}
              </Text>
              <Input
                placeholder={t.auth.signIn.didPlaceholder}
                value={did}
                onChangeText={setDid}
                editable={!isLoading}
              />
              <Text
                style={{
                  fontSize: typography.size.xs,
                  color: colors.text_tertiary,
                  marginTop: spacing.xs,
                }}
              >
                {t.auth.signIn.didExample}
              </Text>
            </View>

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
              <Input
                placeholder={t.auth.signIn.passphrasePlaceholder}
                value={passphrase}
                onChangeText={setPassphrase}
                secureTextEntry={!showPassword}
                editable={!isLoading}
              />
              <Text
                style={{
                  fontSize: typography.size.xs,
                  color: colors.text_tertiary,
                  marginTop: spacing.xs,
                }}
              >
                {t.auth.signIn.passphraseHint}
              </Text>
            </View>

            {/* Test Credentials Info */}
            <View
              style={{
                backgroundColor: colors.bg_darker,
                padding: spacing.md,
                borderRadius: borderRadius.base
              }}
            >
              <Text
                style={{
                  fontSize: typography.size.xs,
                  fontWeight: typography.weight.semibold,
                  color: colors.info,
                  marginBottom: spacing.sm,
                }}
              >
                {t.auth.signIn.demoLabel}
              </Text>
              <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary }}>
                {t.auth.signIn.demoInfo}
              </Text>
            </View>
          </Column>
        </Card>

        {/* Action Buttons */}
        <Column gap="sm">
          <Button
            onPress={handleSignIn}
            disabled={isLoading}
            style={{
              opacity: isLoading ? 0.6 : 1,
            }}
          >
            {isLoading ? t.auth.signIn.buttonLoading : t.auth.signIn.button}
          </Button>
        </Column>

        {/* Alternative Actions */}
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.border,
            paddingTop: spacing.lg,
          }}
        >
          <Column gap="sm">
            <Button
              variant="secondary"
              onPress={() => navigation.navigate('CreateIdentity')}
              disabled={isLoading}
            >
              {t.auth.signIn.createNew}
            </Button>
            <Button
              variant="outline"
              onPress={() => navigation.navigate('RecoverIdentity')}
              disabled={isLoading}
            >
              {t.auth.signIn.recover}
            </Button>
          </Column>
        </View>

        {/* Footer spacing */}
        <View style={{ height: spacing.xl }} />
      </Column>
      </ScrollView>
    </SafeAreaView>
  );
};

export default SignInScreen;
