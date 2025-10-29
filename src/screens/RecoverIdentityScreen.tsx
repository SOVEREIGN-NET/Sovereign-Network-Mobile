/**
 * RecoverIdentityScreen
 * Screen for recovering a lost ZK-DID identity using seed phrase, backup file, or social recovery
 */

import React, { useState } from 'react';
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

type RecoverIdentityScreenProps = NativeStackScreenProps<AuthStackParamList, 'RecoverIdentity'>;

type RecoveryMethod = 'seed' | 'backup' | 'social';

const RecoverIdentityScreen = ({ navigation }: RecoverIdentityScreenProps) => {
  const { t } = useTranslation();
  const { recoverIdentity, isLoading, error } = useAuth();

  const [recoveryMethod, setRecoveryMethod] = useState<RecoveryMethod>('seed');
  const [seedPhrase, setSeedPhrase] = useState('');
  const [backupJson, setBackupJson] = useState('');
  const [backupPassword, setBackupPassword] = useState('');
  const [guardianCode, setGuardianCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleRecover = async () => {
    setLocalError(null);

    let data: string;
    let method: RecoveryMethod;

    switch (recoveryMethod) {
      case 'seed':
        if (!seedPhrase.trim()) {
          setLocalError(t.auth.recoverIdentity.validation.seedRequired);
          return;
        }
        data = seedPhrase;
        method = 'seed';
        break;

      case 'backup':
        if (!backupJson.trim()) {
          setLocalError(t.auth.recoverIdentity.validation.backupRequired);
          return;
        }
        if (!backupPassword.trim()) {
          setLocalError(t.auth.recoverIdentity.validation.backupPasswordRequired);
          return;
        }
        data = `${backupJson}|||${backupPassword}`;
        method = 'backup';
        break;

      case 'social':
        if (!guardianCode.trim()) {
          setLocalError(t.auth.recoverIdentity.validation.guardianCodeRequired);
          return;
        }
        data = guardianCode;
        method = 'social';
        break;

      default:
        setLocalError(t.auth.recoverIdentity.validation.invalidMethod);
        return;
    }

    try {
      await recoverIdentity(method, data);

      // Reset form
      setSeedPhrase('');
      setBackupJson('');
      setBackupPassword('');
      setGuardianCode('');

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
    {
      value: 'backup' as const,
      label: t.auth.recoverIdentity.backup.label,
      description: t.auth.recoverIdentity.backup.description,
    },
    {
      value: 'social' as const,
      label: t.auth.recoverIdentity.social.label,
      description: t.auth.recoverIdentity.social.description,
    },
  ];

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
          paddingTop: spacing.xl,
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
                <Pressable
                  key={option.value}
                  onPress={() => setRecoveryMethod(option.value)}
                  style={{
                    backgroundColor:
                      recoveryMethod === option.value
                        ? colors.primary
                        : colors.bg_darker,
                    padding: spacing.md,
                    borderRadius: borderRadius.base,
                    borderWidth: 2,
                    borderColor:
                      recoveryMethod === option.value
                        ? colors.primary
                        : colors.border,
                  }}
                >
                  <Text
                    style={{
                      fontSize: typography.size.md,
                      fontWeight: typography.weight.semibold,
                      color:
                        recoveryMethod === option.value
                          ? colors.bg_darkest
                          : colors.text_primary,
                      marginBottom: spacing.xs,
                    }}
                  >
                    {option.label}
                  </Text>
                  <Text
                    style={{
                      fontSize: typography.size.xs,
                      color:
                        recoveryMethod === option.value
                          ? colors.bg_darkest
                          : colors.text_secondary,
                    }}
                  >
                    {option.description}
                  </Text>
                </Pressable>
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

              <Input
                placeholder={t.auth.recoverIdentity.seed.placeholder}
                value={seedPhrase}
                onChangeText={setSeedPhrase}
                multiline
                numberOfLines={4}
                editable={!isLoading}
                textInputStyle={{ textAlignVertical: 'top' }}
              />

              <Text
                style={{
                  fontSize: typography.size.xs,
                  color: colors.text_tertiary,
                }}
              >
                {t.auth.recoverIdentity.seed.hint}
              </Text>

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

        {/* Backup File Recovery */}
        {recoveryMethod === 'backup' && (
          <Card>
            <Column gap="sm">
              <Text
                style={{
                  fontSize: typography.size.sm,
                  fontWeight: typography.weight.semibold,
                  color: colors.text_primary,
                }}
              >
                {t.auth.recoverIdentity.backup.title}
              </Text>

              <Input
                placeholder={t.auth.recoverIdentity.backup.placeholder}
                value={backupJson}
                onChangeText={setBackupJson}
                multiline
                numberOfLines={4}
                editable={!isLoading}
                textInputStyle={{ textAlignVertical: 'top' }}
              />

              <Text
                style={{
                  fontSize: typography.size.xs,
                  color: colors.text_tertiary,
                  marginTop: spacing.md,
                }}
              >
                {t.auth.recoverIdentity.backup.passwordLabel}
              </Text>

              <Row
                style={{
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: spacing.sm,
                }}
              >
                <Pressable onPress={() => setShowPassword(!showPassword)}>
                  <Text
                    style={{
                      fontSize: typography.size.xs,
                      color: colors.primary,
                    }}
                  >
                    {showPassword ? t.auth.recoverIdentity.backup.passwordShowHide.hide : t.auth.recoverIdentity.backup.passwordShowHide.show}
                  </Text>
                </Pressable>
              </Row>

              <Input
                placeholder={t.auth.recoverIdentity.backup.passwordPlaceholder}
                value={backupPassword}
                onChangeText={setBackupPassword}
                secureTextEntry={!showPassword}
                editable={!isLoading}
              />

              <Text
                style={{
                  fontSize: typography.size.xs,
                  color: colors.text_tertiary,
                  marginTop: spacing.md,
                }}
              >
                {t.auth.recoverIdentity.backup.hint}
              </Text>
            </Column>
          </Card>
        )}

        {/* Social Recovery */}
        {recoveryMethod === 'social' && (
          <Card>
            <Column gap="sm">
              <Text
                style={{
                  fontSize: typography.size.sm,
                  fontWeight: typography.weight.semibold,
                  color: colors.text_primary,
                }}
              >
                {t.auth.recoverIdentity.social.title}
              </Text>

              <Input
                placeholder={t.auth.recoverIdentity.social.placeholder}
                value={guardianCode}
                onChangeText={setGuardianCode}
                editable={!isLoading}
              />

              <Text
                style={{
                  fontSize: typography.size.xs,
                  color: colors.text_tertiary,
                  marginTop: spacing.md,
                }}
              >
                {t.auth.recoverIdentity.social.processTitle}
              </Text>

              <View
                style={{
                  backgroundColor: colors.bg_darker,
                  padding: spacing.md,
                  borderRadius: borderRadius.base,
                  gap: spacing.sm,
                }}
              >
                <Row>
                  <Text style={{ color: colors.primary, marginRight: spacing.sm }}>1.</Text>
                  <Text style={{ color: colors.text_secondary, flex: 1 }}>
                    {t.auth.recoverIdentity.social.step1}
                  </Text>
                </Row>

                <Row>
                  <Text style={{ color: colors.primary, marginRight: spacing.sm }}>2.</Text>
                  <Text style={{ color: colors.text_secondary, flex: 1 }}>
                    {t.auth.recoverIdentity.social.step2}
                  </Text>
                </Row>

                <Row>
                  <Text style={{ color: colors.primary, marginRight: spacing.sm }}>3.</Text>
                  <Text style={{ color: colors.text_secondary, flex: 1 }}>
                    {t.auth.recoverIdentity.social.step3}
                  </Text>
                </Row>

                <Row>
                  <Text style={{ color: colors.primary, marginRight: spacing.sm }}>4.</Text>
                  <Text style={{ color: colors.text_secondary, flex: 1 }}>
                    {t.auth.recoverIdentity.social.step4}
                  </Text>
                </Row>
              </View>

              <View
                style={{
                  backgroundColor: colors.bg_darker,
                  padding: spacing.md,
                  borderRadius: borderRadius.base,
                  borderLeftWidth: 4,
                  borderLeftColor: colors.info,
                  marginTop: spacing.md,
                }}
              >
                <Text
                  style={{
                    fontSize: typography.size.xs,
                    color: colors.info,
                    fontWeight: typography.weight.semibold,
                  }}
                >
                  {t.auth.recoverIdentity.social.testTitle}
                </Text>
                <Text
                  style={{
                    fontSize: typography.size.xs,
                    color: colors.text_secondary,
                    marginTop: spacing.xs,
                  }}
                >
                  {t.auth.recoverIdentity.social.testCode}
                </Text>
              </View>
            </Column>
          </Card>
        )}

        {/* Action Buttons */}
        <Column gap="sm">
          <Button
            onPress={handleRecover}
            disabled={isLoading}
            style={{
              opacity: isLoading ? 0.6 : 1,
            }}
          >
            {isLoading ? t.auth.recoverIdentity.buttonLoading : t.auth.recoverIdentity.button}
          </Button>
        </Column>

        {/* Footer spacing */}
        <View style={{ height: spacing.xl }} />
      </Column>
      </ScrollView>
    </SafeAreaView>
  );
};

export default RecoverIdentityScreen;
