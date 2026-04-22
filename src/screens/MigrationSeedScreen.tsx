/**
 * MigrationSeedScreen
 * One-time migration flow when seed recovery fails with known error.
 */

import React, { useRef, useState } from 'react';
import { View, TextInput } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Card,
  Button,
  Text,
  Column,
  LoadingView,
  ScreenLayout,
  ErrorAlert,
  ActionFooter,
  PasswordField,
} from '../components';
import { useAuth } from '../hooks';
import { colors, spacing, typography, borderRadius } from '../theme';
import { RootStackParamList } from '../types/navigation';
import SeedVaultService from '../services/SeedVaultService';
import SecureIdentityStorage from '../services/SecureIdentityStorage';

type MigrationSeedScreenProps = NativeStackScreenProps<RootStackParamList, 'MigrationSeed'>;

const MigrationSeedScreen = ({ navigation, route }: MigrationSeedScreenProps) => {
  const { migrateIdentityFromSeed, isLoading, error } = useAuth();
  const inputRefs = useRef<Array<TextInput | null>>([]);

  const initialWords = route.params?.seedWords?.length
    ? route.params.seedWords
    : Array(24).fill('');

  const [seedWords, setSeedWords] = useState<string[]>(initialWords);
  const [displayName, setDisplayName] = useState<string>('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [step, setStep] = useState<number>(1);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const handleMigrate = async () => {
    setLocalError(null);
    const normalized = seedWords.map(word => word.trim().toLowerCase()).filter(Boolean);
    if (normalized.length !== 24) {
      setLocalError('Recovery phrase must be 24 words.');
      return;
    }
    if (!displayName.trim()) {
      setLocalError('Display name is required.');
      return;
    }

    try {
      console.log('[MigrationSeed] ▶️ Starting migration request');
      console.log('[MigrationSeed] Display name:', displayName.trim());
      const result = await migrateIdentityFromSeed(displayName.trim(), normalized.join(' '));

      // Save login credentials for local sign-in + OS autofill
      if (result.identity?.did) {
        await SecureIdentityStorage.saveLoginCredentials(result.identity.did, newPassword);
      }

      try {
        await SeedVaultService.saveSeedPhrase(result.newSeedPhrase);
      } catch (saveError: any) {
        console.warn('[MigrationSeed] Failed to persist seed phrase:', saveError);
        setLocalError(saveError?.message || 'Migration succeeded, but failed to persist seed phrase.');
      }

      const seedPhrases = result.newSeedPhrase;
      navigation.navigate('SeedPhrase', {
        seedPhrases,
        identity: result.identity,
      });
    } catch (err: any) {
      setLocalError(err?.message || 'Migration failed');
    }
  };

  const displayError = localError || error;

  if (isLoading) {
    return <LoadingView />;
  }

  const normalizedSeed = seedWords.map(word => word.trim().toLowerCase()).filter(Boolean);

  const goNext = () => {
    setLocalError(null);
    if (step === 2) {
      if (normalizedSeed.length !== 24) {
        setLocalError('Recovery phrase must be 24 words.');
        return;
      }
    }
    if (step === 3) {
      if (!displayName.trim()) {
        setLocalError('Display name is required.');
        return;
      }
    }
    if (step === 4) {
      if (newPassword.length < 8) {
        setLocalError('Password must be at least 8 characters.');
        return;
      }
      if (newPassword !== confirmNewPassword) {
        setLocalError('Passwords do not match.');
        return;
      }
    }
    setStep((prev) => Math.min(prev + 1, 5));
  };

  const goBack = () => {
    setLocalError(null);
    setStep((prev) => Math.max(prev - 1, 1));
  };

  return (
    <ScreenLayout>
      <Column gap="xl">
        {displayError && <ErrorAlert message={displayError} icon="❌" />}

        <Card style={{ backgroundColor: colors.bg_darker }}>
          <Column gap="xs">
            <Text style={{ fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text_primary }}>
              Migration Step {step} of 5
            </Text>
            <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary }}>
              We will guide you through migration. A new identity and new seed will be created only after migration succeeds.
            </Text>
          </Column>
        </Card>

        <Card style={{ backgroundColor: colors.bg_darker }}>
          <Column gap="xs">
            <Text style={{ fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.warning_dark }}>
              Migration Seed Disclaimer
            </Text>
            <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary }}>
              Make sure your seed words are correct. This is a one-time migration flow.
              If your seeds are wrong, you risk corrupting your DID. Do not try more than once.
              If this fails, report to an admin.
            </Text>
          </Column>
        </Card>

        {step === 1 && (
          <Card>
            <Column gap="sm">
              <Text style={{ fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text_primary }}>
                Why migration is required
              </Text>
              <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary }}>
                Your original identity was registered with older random keys. Your seed now generates
                deterministic keys that do not match the server record. Migration links your display name
                to a new deterministic identity.
              </Text>
              <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary }}>
                A new seed will be created only after migration succeeds. You will be asked to save it.
              </Text>
            </Column>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <Column gap="sm">
              <Text style={{ fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text_primary }}>
                Enter your old seed phrase
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
                            next[index] = lower.replaceAll(/\s+/g, '');
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
            </Column>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <Column gap="sm">
              <Text style={{ fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text_primary }}>
                Confirm your display name
              </Text>
              <TextInput
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
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="username_to_claim"
                placeholderTextColor={colors.text_tertiary}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLoading}
              />
              <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary }}>
                This display name will be transferred to your new identity after migration.
              </Text>
            </Column>
          </Card>
        )}

        {step === 4 && (
          <Card>
            <Column gap="sm">
              <Text style={{ fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text_primary }}>
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
            </Column>
          </Card>
        )}

        {step === 5 && (
          <Card>
            <Column gap="sm">
              <Text style={{ fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text_primary }}>
                Ready to migrate
              </Text>
              <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary }}>
                We will authenticate with your old private key, register a new deterministic identity, and transfer your display name.
              </Text>
              <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary }}>
                After migration, a new seed will be shown and stored in Keychain/Keystore.
              </Text>
            </Column>
          </Card>
        )}

        <ActionFooter
          actions={[
            ...(step > 1
              ? [{
                label: 'Back',
                onPress: () => { goBack(); },
                variant: 'secondary' as const,
                disabled: isLoading,
              }]
              : []),
            ...(step < 5
              ? [{
                label: 'Next',
                onPress: () => { goNext(); },
                disabled: isLoading,
              }]
              : [{
                label: 'Migrate Identity',
                onPress: () => { handleMigrate().catch(() => {}); },
                disabled: isLoading,
                loading: isLoading,
              }]),
          ]}
        />
      </Column>
    </ScreenLayout>
  );
};

export default MigrationSeedScreen;
