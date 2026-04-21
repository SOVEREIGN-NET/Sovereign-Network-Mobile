/**
 * RecoverIdentityScreen
 * Screen for recovering a lost ZK-DID identity using seed phrase, backup file, or social recovery
 */

import React, { useRef, useState, useEffect } from 'react';
import { View, TextInput } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Card,
  Button,
  Text,
  Column,
  Row,
  LoadingView,
  ScreenLayout,
  ErrorAlert,
  SelectableOptionCard,
  ActionFooter,
  PasswordField,
} from '../components';
import { useAuth } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography, borderRadius } from '../theme';
import { RootStackParamList } from '../types/navigation';
import RealAuthService from '../services/RealAuthService';
import SecureIdentityStorage from '../services/SecureIdentityStorage';
import SeedVaultService from '../services/SeedVaultService';

type RecoverIdentityScreenProps = NativeStackScreenProps<RootStackParamList, 'RecoverIdentity'>;

type RecoveryMethod = 'seed';

const RecoverIdentityScreen = (props: RecoverIdentityScreenProps) => {
  const _props = props;
  const { t } = useTranslation();
  const { recoverIdentity, getMasterSeedPhrase, isLoading, error, migrationRequired } = useAuth();

  const [recoveryMethod, setRecoveryMethod] = useState<RecoveryMethod>('seed');
  const [seedWords, setSeedWords] = useState<string[]>(Array(24).fill(''));
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRefs = useRef<Array<TextInput | null>>([]);
  const [isFillingFromKeychain, setIsFillingFromKeychain] = useState(false);
  const [showMigration, setShowMigration] = useState(false);
  const [showMigrationBanner, setShowMigrationBanner] = useState(false);

  // Password step: shown after seed is validated, before calling recoverIdentity
  const [recoveryPhase, setRecoveryPhase] = useState<'seed' | 'password'>('seed');
  const [validatedSeedData, setValidatedSeedData] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  // Opt-in save-to-secure-chain state for the recovered seed. User taps the
  // button on the password card to persist; we don't auto-save.
  const [vaultState, setVaultState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [vaultError, setVaultError] = useState<string | null>(null);

  const handleSaveSeedToChain = async () => {
    if (!validatedSeedData) {
      setVaultError('No validated seed to save');
      setVaultState('error');
      return;
    }
    setVaultState('saving');
    setVaultError(null);
    try {
      const words = validatedSeedData.trim().split(/\s+/);
      await SeedVaultService.saveSeedPhrase(words);
      setVaultState('saved');
    } catch (err: any) {
      setVaultError(err?.message || 'Failed to save to secure storage');
      setVaultState('error');
    }
  };

  useEffect(() => {
    if (migrationRequired) {
      setShowMigration(true);
      setShowMigrationBanner(true);
    }
  }, [migrationRequired]);

  const handleFillFromKeychain = async () => {
    setLocalError(null);
    setIsFillingFromKeychain(true);
    try {
      const phrase = await getMasterSeedPhrase();
      if (!phrase) {
        setLocalError('No seed phrase found in Keychain for this device.');
        return;
      }
      const words = phrase.trim().split(/\s+/).filter(Boolean);
      if (words.length !== 24) {
        setLocalError('Stored seed phrase must be 24 words.');
        return;
      }
      setSeedWords(words);
      inputRefs.current[0]?.focus();
    } catch (err: any) {
      setLocalError(err?.message || 'Failed to load seed phrase from Keychain.');
    } finally {
      setIsFillingFromKeychain(false);
    }
  };

  // Phase 1: Validate seed and move to password step
  const handleValidateSeed = () => {
    setLocalError(null);

    switch (recoveryMethod) {
      case 'seed': {
        const normalized = seedWords.map(word => word.trim().toLowerCase()).filter(Boolean);
        if (normalized.length === 0) {
          setLocalError(t.auth.recoverIdentity.validation.seedRequired);
          return;
        }
        if (normalized.length !== 24) {
          setLocalError(t.auth.recoverIdentity.validation.seedInvalid);
          return;
        }
        setValidatedSeedData(normalized.join(' '));
        setRecoveryPhase('password');
        break;
      }
      default:
        setLocalError(t.auth.recoverIdentity.validation.invalidMethod);
    }
  };

  // Phase 2: Set password and finalize recovery
  const handleRecover = async () => {
    setLocalError(null);

    if (!validatedSeedData) {
      setLocalError('Seed phrase not validated');
      return;
    }

    // Validate password
    if (newPassword.length < 8) {
      setLocalError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setLocalError('Passwords do not match');
      return;
    }

    try {
      const identity = await recoverIdentity(recoveryMethod, validatedSeedData);

      if (recoveryMethod === 'seed' && RealAuthService.getLastSeedRecoveryNotFound()) {
        setShowMigrationBanner(true);
        setShowMigration(true);
        return;
      }

      // Save login credentials for local sign-in + OS autofill
      if (identity?.did) {
        await SecureIdentityStorage.saveLoginCredentials(identity.did, newPassword);
      }

      // Note: SeedVaultService.saveSeedPhrase() is intentionally NOT called here.
      // The seed is already stored without biometric via walletKeychainService
      // inside RealAuthService.storeIdentity(), which getMasterSeedPhrase()
      // checks first. Calling saveSeedPhrase() would trigger a biometric prompt
      // on Android even on write, which is unexpected UX during recovery.

      // Navigate to SIDTab (wallet) and show welcome banner with display name.
      _props.navigation.reset({
        index: 0,
        routes: [{
          name: 'MainTabs',
          state: {
            index: 2,
            routes: [
              { name: 'DashboardTab' },
              { name: 'DAOTab' },
              {
                name: 'SIDTab',
                state: {
                  index: 0,
                  routes: [{ name: 'SIDMain', params: { showWelcome: identity.displayName || 'back' } }],
                },
              },
            ],
          },
        }],
      });
    } catch (err: any) {
      const message = err.message || t.auth.recoverIdentity.errors.recoveryFailed;
      if (message === 'MIGRATION_REQUIRED') {
        setShowMigration(true);
        setShowMigrationBanner(true);
        setLocalError(null);
        return;
      }
      setLocalError(message);
      const msgLower = String(message).toLowerCase();
      if (msgLower.includes('not found') || msgLower.includes('identity not found')) {
        setShowMigration(true);
        setShowMigrationBanner(true);
      }
    }
  };

  const displayError = localError || error;

  if (isLoading) {
    return <LoadingView />;
  }

  const recoveryOptions = [
    {
      value: 'seed' as const,
      label: t.auth.recoverIdentity.seed.label,
      description: t.auth.recoverIdentity.seed.description,
    },
  ];

  return (
    <ScreenLayout
      safeAreaEdges={['top', 'bottom']}
      onBack={() => props.navigation.goBack()}
      backLabel={t.app.back ?? 'Back'}
      keyboardAvoiding
    >
      <Column gap="xl">
        {/* Error Message */}
        {displayError && <ErrorAlert message={displayError} icon="❌" />}
        {showMigrationBanner && (
          <Card
            style={{
              backgroundColor: colors.bg_darker,
            }}
          >
            <Column gap="xs">
              <Text style={{ fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.warning_dark }}>
                Migration required
              </Text>
              <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary }}>
                This identity was registered with older random keys. To continue, migrate to a new deterministic identity.
              </Text>
            </Column>
          </Card>
        )}

        {/* Recovery Method Selection */}
        <Card>
          <Column gap="sm">
            <Text
              style={{
                fontSize: typography.size.sm,
                fontWeight: typography.weight.semibold,
                color: colors.text_primary,
              }}
            >
              {t.auth.recoverIdentity.method}
            </Text>

            <Column gap="xs">
              {recoveryOptions.map((option) => (
                <SelectableOptionCard
                  key={option.value}
                  id={option.value}
                  title={option.label}
                  description={option.description}
                  isSelected={recoveryMethod === option.value}
                  onSelect={(id) => setRecoveryMethod(id as typeof recoveryMethod)}
                />
              ))}
            </Column>
          </Column>
        </Card>

        {/* Seed verified summary (password phase) — replaces the 24-word
            input card once the seed has been validated, so the password
            fields below aren't pushed off-screen by the keyboard. */}
        {recoveryMethod === 'seed' && recoveryPhase === 'password' && (
          <Card>
            <Column gap="xs">
              <Row align="center" style={{ gap: spacing.sm }}>
                <Text
                  style={{
                    color: colors.success,
                    fontSize: typography.size.md,
                    fontWeight: typography.weight.bold,
                  }}
                >
                  ✓
                </Text>
                <Text
                  style={{
                    color: colors.text_primary,
                    fontSize: typography.size.sm,
                    fontWeight: typography.weight.semibold,
                  }}
                >
                  Seed phrase verified
                </Text>
              </Row>
              <Text
                style={{
                  color: colors.text_secondary,
                  fontSize: typography.size.xs,
                }}
              >
                Set a local password below to finish restoring your identity.
              </Text>
            </Column>
          </Card>
        )}

        {/* Seed Phrase Recovery (input phase) */}
        {recoveryMethod === 'seed' && recoveryPhase === 'seed' && (
          <Card>
            <Column gap="sm">
              <Text
                style={{
                  fontSize: typography.size.sm,
                  fontWeight: typography.weight.semibold,
                  color: colors.text_primary,
                }}
              >
                {t.auth.recoverIdentity.seed.title}
              </Text>
              <Button
                onPress={() => { handleFillFromKeychain().catch(() => {}); }}
                variant="secondary"
                size="sm"
                loading={isFillingFromKeychain}
                disabled={isLoading || isFillingFromKeychain}
                style={{ alignSelf: 'flex-start' }}
              >
                Use saved seed from this device
              </Button>
              <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary }}>
                {t.auth.recoverIdentity.seed.hint}
              </Text>

              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: spacing.sm,
                  marginTop: spacing.sm,
                }}
              >
                {seedWords.map((word, index) => (
                  <View
                    key={`seed-word-${index}`}
                    style={{
                      width: '30%',
                      minWidth: 90,
                      flexGrow: 1,
                    }}
                  >
                    <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary, marginBottom: 4 }}>
                      {index + 1}
                    </Text>
                    <TextInput
                      ref={(ref) => {
                        inputRefs.current[index] = ref;
                      }}
                      style={{
                        backgroundColor: colors.bg_darker,
                        borderRadius: borderRadius.base,
                        borderWidth: 1,
                        borderColor: colors.border,
                        color: colors.text_primary,
                        fontSize: typography.size.sm,
                        paddingVertical: spacing.sm,
                        paddingHorizontal: spacing.sm,
                      }}
                      editable={!isLoading}
                      autoCapitalize="none"
                      autoCorrect={false}
                      spellCheck={false}
                      value={word}
                      placeholder="word"
                      placeholderTextColor={colors.text_tertiary}
                      returnKeyType={index === 23 ? 'done' : 'next'}
                      onSubmitEditing={() => {
                        if (index < 23) {
                          inputRefs.current[index + 1]?.focus();
                        }
                      }}
                      onChangeText={(text) => {
                        const lower = text.toLowerCase();
                        const parts = lower.trim().split(/\s+/).filter(Boolean);
                        if (parts.length <= 1) {
                          setSeedWords(prev => {
                            const next = [...prev];
                            next[index] = lower.replace(/\s+/g, '');
                            return next;
                          });
                          return;
                        }
                        setSeedWords(prev => {
                          const next = [...prev];
                          let cursor = index;
                          parts.forEach((part) => {
                            if (cursor < next.length) {
                              next[cursor] = part;
                              cursor += 1;
                            }
                          });
                          return next;
                        });
                        const nextIndex = Math.min(index + parts.length, 23);
                        inputRefs.current[nextIndex]?.focus();
                      }}
                    />
                  </View>
                ))}
              </View>

              <View
                style={{
                  backgroundColor: colors.bg_darker,
                  padding: spacing.md,
                  borderRadius: borderRadius.base,
                  marginTop: spacing.md,
                }}
              >
                <Text
                  style={{
                    fontSize: typography.size.xs,
                    color: colors.warning_dark,
                    fontWeight: typography.weight.semibold,
                  }}
                >
                  {t.auth.recoverIdentity.seed.securityTitle}
                </Text>
                <Text
                  style={{
                    fontSize: typography.size.xs,
                    color: colors.text_secondary,
                    marginTop: spacing.xs,
                  }}
                >
                  {t.auth.recoverIdentity.seed.securityWarning}
                </Text>
              </View>
            </Column>
          </Card>
        )}


        {/* Set Local Password (shown after seed validation) */}
        {recoveryPhase === 'password' && (
          <Card>
            <Column gap="sm">
              <Text
                style={{
                  fontSize: typography.size.sm,
                  fontWeight: typography.weight.semibold,
                  color: colors.text_primary,
                }}
              >
                Set Local Password
              </Text>
              <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary }}>
                This password is stored locally on your device for sign-in. It is never sent to any server.
              </Text>
              <PasswordField
                label="Password"
                placeholder="At least 8 characters"
                value={newPassword}
                onChangeText={setNewPassword}
                editable={!isLoading}
                textContentType="newPassword"
                autoComplete="password-new"
                importantForAutofill="yes"
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
              />
              <PasswordField
                label="Confirm Password"
                placeholder="Re-enter your password"
                value={confirmNewPassword}
                onChangeText={setConfirmNewPassword}
                editable={!isLoading}
                textContentType="newPassword"
                autoComplete="password-new"
                importantForAutofill="no"
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
              />

              {/* Opt-in: persist the recovered seed to the device's secure
                  chain (iOS Keychain / Android EncryptedSharedPreferences).
                  User-triggered only — tap the button if you want the seed
                  saved for future recovery on this device. */}
              <View
                style={{
                  backgroundColor: colors.bg_darker,
                  padding: spacing.md,
                  borderRadius: borderRadius.base,
                  marginTop: spacing.sm,
                }}
              >
                <Text
                  style={{
                    color: colors.text_primary,
                    fontSize: typography.size.sm,
                    fontWeight: typography.weight.semibold,
                    marginBottom: spacing.xs,
                  }}
                >
                  Save seed to secure chain
                </Text>
                <Text
                  style={{
                    color: colors.text_secondary,
                    fontSize: typography.size.xs,
                    marginBottom: spacing.sm,
                  }}
                >
                  Store the 24-word seed in this device's hardware-backed
                  keystore so you can recover without retyping it. Skip if
                  you prefer to keep it only on paper.
                </Text>
                <Button
                  variant="secondary"
                  onPress={handleSaveSeedToChain}
                  loading={vaultState === 'saving'}
                  disabled={vaultState === 'saving' || vaultState === 'saved'}
                >
                  {vaultState === 'saved' ? 'Saved ✓' : 'Save to secure chain'}
                </Button>
                {vaultState === 'error' && vaultError && (
                  <Text
                    style={{
                      color: colors.error,
                      fontSize: typography.size.xs,
                      marginTop: spacing.xs,
                    }}
                  >
                    {vaultError}
                  </Text>
                )}
              </View>
            </Column>
          </Card>
        )}

        {/* Action Buttons */}
        <ActionFooter
          actions={[
            ...(recoveryPhase === 'seed' ? [
              {
                label: isLoading ? t.auth.recoverIdentity.buttonLoading : 'Next: Set Password',
                onPress: handleValidateSeed,
                disabled: isLoading,
                loading: isLoading,
              },
            ] : [
              {
                label: isLoading ? t.auth.recoverIdentity.buttonLoading : t.auth.recoverIdentity.button,
                onPress: () => { handleRecover().catch(() => {}); },
                disabled: isLoading,
                loading: isLoading,
              },
              {
                label: 'Back',
                onPress: () => { setRecoveryPhase('seed'); setLocalError(null); },
                variant: 'secondary' as const,
              },
            ]),
            ...(showMigration ? [
              {
                label: 'Migration Seed',
                onPress: () => {
                  const normalized = seedWords.map(word => word.trim().toLowerCase()).filter(Boolean);
                  if (normalized.length !== 24) {
                    setLocalError('Recovery phrase must be 24 words.');
                    return;
                  }
                  _props.navigation.navigate('MigrationSeed', { seedWords: normalized });
                },
                variant: 'secondary' as const,
              },
            ] : []),
          ]}
        />
      </Column>
    </ScreenLayout>
  );
};

export default RecoverIdentityScreen;
