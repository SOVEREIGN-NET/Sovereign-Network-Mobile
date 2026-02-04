/**
 * RecoverIdentityScreen
 * Screen for recovering a lost ZK-DID identity using seed phrase, backup file, or social recovery
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
  SelectableOptionCard,
  ActionFooter,
} from '../components';
import { useAuth } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography, borderRadius } from '../theme';
import { AuthStackParamList } from '../navigation/AuthNavigator';

type RecoverIdentityScreenProps = NativeStackScreenProps<AuthStackParamList, 'RecoverIdentity'>;

type RecoveryMethod = 'seed';

const RecoverIdentityScreen = (_props: RecoverIdentityScreenProps) => {
  const { t } = useTranslation();
  const { recoverIdentity, getMasterSeedPhrase, isLoading, error } = useAuth();

  const [recoveryMethod, setRecoveryMethod] = useState<RecoveryMethod>('seed');
  const [seedWords, setSeedWords] = useState<string[]>(Array(24).fill(''));
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRefs = useRef<Array<TextInput | null>>([]);
  const [isFillingFromKeychain, setIsFillingFromKeychain] = useState(false);

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

  const handleRecover = async () => {
    setLocalError(null);

    let data: string;
    let method: RecoveryMethod;

    switch (recoveryMethod) {
      case 'seed':
        const normalized = seedWords.map(word => word.trim().toLowerCase()).filter(Boolean);
        if (normalized.length === 0) {
          setLocalError(t.auth.recoverIdentity.validation.seedRequired);
          return;
        }
        if (normalized.length !== 24) {
          setLocalError(t.auth.recoverIdentity.validation.seedInvalid);
          return;
        }
        data = normalized.join(' ');
        method = 'seed';
        break;

      default:
        setLocalError(t.auth.recoverIdentity.validation.invalidMethod);
        return;
    }

    try {
      await recoverIdentity(method, data);

      // Reset form
      setSeedWords(Array(24).fill(''));

      // App.tsx will detect authenticated state and switch to RootNavigator
    } catch (err: any) {
      setLocalError(err.message || t.auth.recoverIdentity.errors.recoveryFailed);
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
    <ScreenLayout>
      <Column gap="xl">
        {/* Error Message */}
        {displayError && <ErrorAlert message={displayError} icon="❌" />}

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

        {/* Seed Phrase Recovery */}
        {recoveryMethod === 'seed' && (
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
                  borderLeftWidth: 4,
                  borderLeftColor: colors.warning,
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


        {/* Action Buttons */}
        <ActionFooter
          actions={[
            {
              label: isLoading ? t.auth.recoverIdentity.buttonLoading : t.auth.recoverIdentity.button,
              onPress: () => { handleRecover().catch(() => {}); },
              disabled: isLoading,
              loading: isLoading,
            },
          ]}
        />
      </Column>
    </ScreenLayout>
  );
};

export default RecoverIdentityScreen;
