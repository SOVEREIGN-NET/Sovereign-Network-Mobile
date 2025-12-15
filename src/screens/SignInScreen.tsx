/**
 * SignInScreen
 * Screen for signing in with existing ZK-DID identity
 */

import React, { useState } from 'react';
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
  ActionFooter,
  Badge
} from '../components';
import { useAuth, useNodeConnection } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography } from '../theme';
import { AuthStackParamList } from '../navigation/AuthNavigator';

type SignInScreenProps = NativeStackScreenProps<AuthStackParamList, 'SignIn'>;

const SignInScreen = ({ navigation }: SignInScreenProps) => {
  const { t } = useTranslation();
  const { signIn, isLoading, error, setCurrentIdentity } = useAuth();
  const { isConnected, isLoading: nodeLoading, checkConnection, getProtocol } = useNodeConnection(true);

  const [did, setDid] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

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
      // signIn expects identity_id and password
      await signIn(did, passphrase);
      // Reset form on success
      setDid('');
      setPassphrase('');
      // App.tsx will detect authenticated state and switch to RootNavigator
    } catch (err: any) {
      setLocalError(err.message || t.auth.signIn.errors.signInFailed);
    }
  };

  // TEMPORARY: Dev bypass while node identity creation is broken
  const handleDevBypass = async () => {
    console.log('[SignIn] 🚧 DEV BYPASS - Skipping authentication');
    const mockIdentity = {
      did: 'did:zhtp:dev-bypass-temp',
      displayName: 'Dev User',
      identityType: 'human',
      citizenshipStatus: 'citizen' as const,
      createdAt: new Date().toISOString(),
      wallets: [],
    };
    await setCurrentIdentity(mockIdentity);
  };

  const isSignInDisabled = isLoading || nodeLoading || !isConnected;

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

        {/* Node Connection Status - Tap to retry, Long press for full protocol check */}
        <Pressable
          onPress={() => {
            console.log('='.repeat(60));
            console.log('[SignIn] 👆 SHORT PRESS - UDP Reachability Check');
            console.log('='.repeat(60));
            checkConnection();
          }}
          onLongPress={() => {
            console.log('='.repeat(60));
            console.log('[SignIn] 👆👆 LONG PRESS - Full QUIC Protocol Health Check');
            console.log('='.repeat(60));
            getProtocol();
          }}
          delayLongPress={500}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Card>
            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Column gap="xs" style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: typography.size.xs,
                    color: colors.text_secondary,
                    fontWeight: typography.weight.medium,
                  }}
                >
                  {t.app.nodeStatus}
                </Text>
                <Text
                  style={{
                    fontSize: typography.size.sm,
                    color: colors.text_primary,
                    fontWeight: typography.weight.semibold,
                  }}
                >
                  Sovereign Network (QUIC)
                </Text>
              </Column>
              <Badge
                label={isConnected ? t.app.connected : t.app.disconnected}
                variant={isConnected ? 'success' : 'error'}
              />
            </Row>
            {!isConnected && !nodeLoading && (
              <View
                style={{
                  marginTop: spacing.sm,
                  paddingVertical: spacing.xs,
                  paddingHorizontal: spacing.sm,
                  backgroundColor: colors.bg_light,
                  borderRadius: 6,
                }}
              >
                <Text
                  style={{
                    fontSize: typography.size.xs,
                    color: colors.primary,
                    fontWeight: typography.weight.semibold,
                    textAlign: 'center',
                  }}
                >
                  {t.app.retryConnection}
                </Text>
              </View>
            )}
          </Card>
        </Pressable>

        {/* Error Message */}
        {displayError && <ErrorAlert message={displayError} icon="❌" />}

        {/* Form Card */}
        <Card>
          <Column gap="xs">
            {/* DID Input */}
            <FormField
              label={t.auth.signIn.didLabel}
              placeholder="Enter DID or Identity ID..."
              value={did}
              onChangeText={setDid}
              editable={!isLoading}
              helperText="Your DID (did:zhtp:...) or hex Identity ID from creation"
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
                placeholder="Enter your password..."
                value={passphrase}
                onChangeText={setPassphrase}
                secureTextEntry={!showPassword}
                editable={!isLoading}
                helperText="The password you set when creating your identity"
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
              disabled: isSignInDisabled,
              loading: isLoading,
            },
            {
              label: t.auth.signIn.createNew,
              onPress: () => navigation.navigate('CreateIdentity'),
              variant: 'secondary',
              disabled: isLoading || !isConnected,
            },
            {
              label: t.auth.signIn.recover,
              onPress: () => navigation.navigate('RecoverIdentity'),
              variant: 'secondary',
              disabled: isLoading || !isConnected,
            },
          ]}
        />

        {/* TEMPORARY: Dev bypass button - hidden for now */}
        {false && __DEV__ && (
          <Pressable
            onPress={handleDevBypass}
            style={{
              marginTop: spacing.lg,
              padding: spacing.md,
              backgroundColor: 'rgba(255, 0, 0, 0.1)',
              borderRadius: 8,
              borderWidth: 1,
              borderColor: 'rgba(255, 0, 0, 0.3)',
              borderStyle: 'dashed',
            }}
          >
            <Text
              style={{
                color: '#ff6b6b',
                textAlign: 'center',
                fontSize: typography.size.sm,
                fontWeight: typography.weight.medium,
              }}
            >
              🚧 DEV BYPASS → Browser
            </Text>
            <Text
              style={{
                color: colors.text_secondary,
                textAlign: 'center',
                fontSize: typography.size.xs,
                marginTop: spacing.xxs,
              }}
            >
              Skip auth (node identity creation broken)
            </Text>
          </Pressable>
        )}
      </Column>
    </ScreenLayout>
  );
};

export default SignInScreen;
