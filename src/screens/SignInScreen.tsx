/**
 * SignInScreen
 * Screen for signing in with existing ZK-DID identity
 */

import React, { useState, useEffect } from 'react';
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
import { CommonActions } from '@react-navigation/native';
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
import SecureIdentityStorage from '../services/SecureIdentityStorage';
import { RootStackParamList } from '../types/navigation';

type SignInScreenProps = NativeStackScreenProps<RootStackParamList, 'SignIn'>;

/** Validate DID format: "did:zhtp:" followed by exactly 64 lowercase hex chars. */
function isValidDid(did: string): boolean {
  return /^did:zhtp:[0-9a-f]{64}$/.test(did);
}

const SignInScreen = ({ navigation }: SignInScreenProps) => {
  const { t } = useTranslation();
  const { signIn, isLoading, error, setCurrentIdentity } = useAuth();
  const { isConnected, hasChecked } = useNodeConnection(true);

  const [did, setDid] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Pre-fill DID from native identity store (EncryptedSharedPreferences → Rust serde
  // roundtrip — immune to react-native-keychain AES-CBC silent corruption).
  useEffect(() => {
    const prefillDid = async () => {
      try {
        // 1. Direct native path: IdentityStore.getCurrentIdentityId → loadIdentity → Rust deser → DID
        if (NativeModules.NativeIdentityProvisioning) {
          const nativeDid: string | null =
            await NativeModules.NativeIdentityProvisioning.getCurrentIdentityDid();
          if (nativeDid && isValidDid(nativeDid)) {
            if (__DEV__) console.log('[SignIn] Pre-fill DID from native store');
            setDid(nativeDid);
            return;
          }
        }
        // 2. Fallback: react-native-keychain (may be corrupted by AES-CBC)
        const creds = await SecureIdentityStorage.getLoginCredentials();
        if (creds?.did && isValidDid(creds.did)) {
          if (__DEV__) console.log('[SignIn] Pre-fill DID from keychain');
          setDid(creds.did);
        } else if (creds?.did) {
          console.warn(
            '[SignIn] Keychain DID failed validation — not pre-filling',
          );
        }
      } catch {
        // Pre-fill is best-effort
      }
    };
    prefillDid();
  }, []);

  const handleSignIn = async () => {
    setLocalError(null);

    // Validation
    if (!did.trim()) {
      setLocalError(t.auth.signIn.validation.didRequired);
      return;
    }

    // Validate DID format — catches AES-CBC silent corruption from react-native-keychain
    if (did.trim().startsWith('did:zhtp:') && !isValidDid(did.trim())) {
      setLocalError(
        'DID appears corrupted (non-hex characters detected). Please recover your identity.',
      );
      return;
    }

    if (!passphrase) {
      setLocalError(t.auth.signIn.validation.passphraseRequired);
      return;
    }

    try {
      // signIn expects identity_id and password
      await signIn(did.trim(), passphrase);
      // Reset form on success
      setDid('');
      setPassphrase('');
      // Navigate back - since SignIn is presented as modal, goBack will return to the main tabs
      navigation.goBack();
    } catch (err: any) {
      setLocalError(err.message || t.auth.signIn.errors.signInFailed);
    }
  };

  // SECURITY: Dev bypass removed for security reasons
  // To test development flows, use the mock identity service in AuthContext instead

  const isSignInDisabled = isLoading;

  const displayError = localError || error;

  if (isLoading) {
    return <LoadingView />;
  }

  return (
    <ScreenLayout>
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
              textContentType="username"
              autoComplete="username"
              importantForAutofill="yes"
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
                    {showPassword
                      ? t.auth.signIn.passphraseShowHide.hide
                      : t.auth.signIn.passphraseShowHide.show}
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
              label: isLoading
                ? t.auth.signIn.buttonLoading
                : t.auth.signIn.button,
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
              disabled: isLoading,
            },
            {
              label: t.auth.signIn.recover,
              onPress: () => navigation.navigate('RecoverIdentity'),
              variant: 'secondary',
              disabled: isLoading,
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
                ]
              : []),
          ]}
        />
      </Column>
    </ScreenLayout>
  );
};

export default SignInScreen;
