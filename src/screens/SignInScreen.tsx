/**
 * SignInScreen
 * Sign in with username + password (OPAQUE login). On success, when the
 * wallet key is on this device the user goes straight in; when it is
 * not (a new device) the flow continues to seed-phrase recovery.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Pressable,
  Text as RNText,
  Alert,
  NativeModules,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
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
  ActionFooter,
  Badge,
} from '../components';
import { useAuth, useNodeConnection } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography } from '../theme';
import { LobbyAuthError } from '../types/lobby';
import { RootStackParamList } from '../types/navigation';

type SignInScreenProps = NativeStackScreenProps<RootStackParamList, 'SignIn'>;

const SignInScreen = ({ navigation }: SignInScreenProps) => {
  const { t } = useTranslation();
  const { passwordSignIn, upgradeLegacyAccount, isLoading, error } = useAuth();
  const { isConnected, hasChecked } = useNodeConnection(true);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [upgradeNeeded, setUpgradeNeeded] = useState(false);

  // Lockout / throttle countdown driven by the server's retry hint.
  const [lockUntil, setLockUntil] = useState<number | null>(null);
  const [lockRemaining, setLockRemaining] = useState(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (lockUntil == null) {
      setLockRemaining(0);
      return;
    }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
      setLockRemaining(remaining);
      if (remaining === 0) {
        setLockUntil(null);
        if (tick.current) clearInterval(tick.current);
      }
    };
    update();
    tick.current = setInterval(update, 1000);
    return () => {
      if (tick.current) clearInterval(tick.current);
    };
  }, [lockUntil]);

  const normalized = username.trim().toLowerCase();
  const locked = lockRemaining > 0;
  const busy = submitting || isLoading;

  /** Route to the right place once the OPAQUE login has succeeded. */
  const afterAuth = (identity: unknown) => {
    setUsername('');
    setPassword('');
    if (identity) {
      // Wallet key is on this device — signed in. Return to the app.
      navigation.goBack();
    } else {
      // Authenticated but keyless — restore the wallet from the seed.
      navigation.navigate('RecoverIdentity');
    }
  };

  /** Map an auth failure to local UI state (error text, lockout, upgrade). */
  const handleAuthError = (err: unknown) => {
    if (err instanceof LobbyAuthError) {
      setLocalError(err.message);
      if (err.kind === 'upgrade_required') {
        setUpgradeNeeded(true);
      } else if (
        (err.kind === 'locked' || err.kind === 'ip_throttled') &&
        err.retryAfterSeconds
      ) {
        setLockUntil(Date.now() + err.retryAfterSeconds * 1000);
      }
    } else {
      setLocalError(
        err instanceof Error ? err.message : t.auth.signIn.errors.signInFailed,
      );
    }
  };

  const handleSignIn = async () => {
    setLocalError(null);
    setUpgradeNeeded(false);
    if (!normalized) {
      setLocalError('Enter your username.');
      return;
    }
    if (!password) {
      setLocalError(t.auth.signIn.validation.passphraseRequired);
      return;
    }
    setSubmitting(true);
    try {
      const identity = await passwordSignIn(normalized, password);
      afterAuth(identity);
    } catch (err) {
      handleAuthError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpgrade = async () => {
    setLocalError(null);
    setSubmitting(true);
    try {
      const identity = await upgradeLegacyAccount(normalized, password);
      afterAuth(identity);
    } catch (err) {
      handleAuthError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const displayError = localError || error;

  if (busy) {
    return <LoadingView />;
  }

  let signInLabel = t.auth.signIn.button;
  if (locked) signInLabel = `Try again in ${lockRemaining}s`;

  return (
    <ScreenLayout
      safeAreaEdges={['top', 'bottom']}
      onBack={() => navigation.goBack()}
      backLabel={t.app.back ?? 'Back'}
      keyboardAvoiding
    >
      <Column gap="xl">
        {/* Welcome Header */}
        <View
          style={{
            alignItems: 'center',
            paddingVertical: spacing.xl,
            marginBottom: spacing.xxs,
          }}
        >
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

        {/* Node Connection Status */}
        <View>
          <Card>
            <Row
              style={{ justifyContent: 'space-between', alignItems: 'center' }}
            >
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
                label={
                  hasChecked
                    ? isConnected
                      ? t.app.connected
                      : t.app.disconnected
                    : t.app.notChecked
                }
                variant={
                  hasChecked ? (isConnected ? 'success' : 'error') : 'default'
                }
              />
            </Row>
          </Card>
        </View>

        {/* Error Message */}
        {displayError && <ErrorAlert message={displayError} icon="❌" />}

        {/* Legacy account upgrade prompt */}
        {upgradeNeeded && (
          <Card>
            <Column gap="sm">
              <Text variant="body" style={{ color: colors.text_secondary }}>
                Your account uses an older sign-in method. Confirm your
                password to complete a one-time security upgrade.
              </Text>
              <Pressable onPress={() => void handleUpgrade().catch(() => {})}>
                <Text
                  style={{
                    color: colors.primary,
                    fontWeight: typography.weight.semibold,
                  }}
                >
                  Upgrade my account →
                </Text>
              </Pressable>
            </Column>
          </Card>
        )}

        {/* Form Card */}
        <Card>
          <Column gap="xs">
            <FormField
              label="Username"
              placeholder="Your username"
              value={username}
              onChangeText={setUsername}
              editable={!busy}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              helperText="The username you chose when you created your account"
              textContentType="username"
              autoComplete="username"
              importantForAutofill="yes"
            />

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
                    {showPassword
                      ? t.auth.signIn.passphraseShowHide.hide
                      : t.auth.signIn.passphraseShowHide.show}
                  </Text>
                </Pressable>
              </Row>
              <FormField
                label=""
                placeholder="Enter your password..."
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                editable={!busy}
                containerStyle={{ marginBottom: 0 }}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
                autoComplete="password"
                importantForAutofill="yes"
              />
            </View>
          </Column>
        </Card>

        {/* Action Buttons */}
        <ActionFooter
          actions={[
            {
              label: submitting ? t.auth.signIn.buttonLoading : signInLabel,
              onPress: () => {
                handleSignIn().catch(() => {});
              },
              disabled: busy || locked,
              loading: submitting,
            },
            {
              label: t.auth.signIn.createNew,
              onPress: () => navigation.navigate('CreateIdentity'),
              variant: 'secondary',
              disabled: busy,
            },
            {
              label: t.auth.signIn.recover,
              onPress: () => navigation.navigate('RecoverIdentity'),
              variant: 'secondary',
              disabled: busy,
            },
            ...(__DEV__
              ? [
                  {
                    label: '🧹 Clean Identities',
                    onPress: () => {
                      NativeModules.NativeIdentityProvisioning.cleanKeystoreDirectory();
                      Alert.alert(
                        '✅ Cleaned',
                        'All identities removed. Create a new one.',
                      );
                    },
                    variant: 'secondary' as const,
                  },
                  {
                    label: '🧪 Demo Login (mock)',
                    onPress: () => {
                      setUsername('did:zhtp:demo001');
                      setPassword('democitizen');
                      // Submit after a short tick so state propagates
                      setTimeout(() => {
                        passwordSignIn('did:zhtp:demo001', 'democitizen')
                          .then(identity => {
                            if (identity) {
                              navigation.goBack();
                            } else {
                              navigation.navigate('RecoverIdentity');
                            }
                          })
                          .catch(() => {});
                      }, 100);
                    },
                    variant: 'secondary' as const,
                  },
                ]
              : []),
          ]}
        />
      </Column>
    </ScreenLayout>
  );
};

export default SignInScreen;
