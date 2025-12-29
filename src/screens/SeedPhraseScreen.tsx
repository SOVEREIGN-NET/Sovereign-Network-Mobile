/**
 * SeedPhraseScreen
 * Display and confirm seed phrases for all 3 wallets after identity creation
 * Citizens get: Primary, UBI, and Savings wallets - each with its own 20-word seed phrase
 */

import React, { useState, useEffect } from 'react';
import { View, ScrollView, Pressable, Alert } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Card,
  Text,
  Column,
  Row,
  ScreenLayout,
  ErrorAlert,
  ActionFooter,
  SectionLabel,
  Checkbox,
  Button,
  Badge,
} from '../components';
import { useTranslation } from '../i18n';
import { useAuth } from '../hooks';
import SeedVaultService from '../services/SeedVaultService';
import { colors, spacing, typography, borderRadius } from '../theme';
import { AuthStackParamList } from '../navigation/AuthNavigator';

type SeedPhraseScreenProps = NativeStackScreenProps<AuthStackParamList, 'SeedPhrase'>;

// Wallet info for display
const WALLET_INFO = {
  primary: {
    icon: '💳',
    name: 'Primary Wallet',
    description: 'Your main spending wallet. Contains your 5,000 SOV welcome bonus.',
  },
  ubi: {
    icon: '🌱',
    name: 'UBI Wallet',
    description: 'Receives 33 SOV daily Universal Basic Income automatically.',
  },
  savings: {
    icon: '🏦',
    name: 'Savings Wallet',
    description: 'For long-term savings and staking rewards.',
  },
};

const SeedPhraseScreen = ({ navigation, route }: SeedPhraseScreenProps) => {
  const { t } = useTranslation();
  const {
    seedPhrases,
    walletType = 'primary',
    identity,
    allSeedPhrases,
    currentStep = 1,
    totalSteps = 3,
  } = route.params || {};
  const { setCurrentIdentity } = useAuth();

  const [copied, setCopied] = useState(false);
  const [confirmedSaved, setConfirmedSaved] = useState(false);
  const [showPhrase, setShowPhrase] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSecureStorageSupported, setIsSecureStorageSupported] = useState(false);
  const [vaultState, setVaultState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [vaultError, setVaultError] = useState<string | null>(null);

  const walletInfo = WALLET_INFO[walletType];
  const isLastWallet = currentStep === totalSteps;

  useEffect(() => {
    console.log('🌱 SeedPhraseScreen mounted', {
      walletType,
      currentStep,
      totalSteps,
      hasSeedPhrases: !!seedPhrases,
      seedPhraseCount: seedPhrases?.length,
      hasIdentity: !!identity,
      identityDid: identity?.did,
      hasAllSeedPhrases: !!allSeedPhrases,
    });

    SeedVaultService.isSecureStorageAvailable()
      .then(setIsSecureStorageSupported)
      .catch(() => setIsSecureStorageSupported(false));

    // Reset state when navigating to new wallet
    setConfirmedSaved(false);
    setShowPhrase(false);
    setCopied(false);
    setVaultState('idle');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletType, currentStep]);

  if (!seedPhrases || !Array.isArray(seedPhrases) || seedPhrases.length === 0) {
    return (
      <ScreenLayout>
        <Column gap="xl">
          <ErrorAlert message={t.auth.seedPhrase.errors.invalidPhrases} icon="❌" />
          <Text style={{ color: colors.text_secondary, fontSize: typography.size.xs }}>
            Debug: seedPhrases={JSON.stringify(seedPhrases)}
          </Text>
          <ActionFooter
            actions={[
              {
                label: t.app.back,
                onPress: () => navigation.goBack(),
                variant: 'secondary',
              },
            ]}
          />
        </Column>
      </ScreenLayout>
    );
  }

  const handleCopy = async () => {
    try {
      const phraseText = seedPhrases.join(' ');
      Clipboard.setString(phraseText);
      setCopied(true);
      Alert.alert('Copied', 'Seed phrase copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      Alert.alert('Error', 'Failed to copy to clipboard');
    }
  };

  const handleSecureSave = async () => {
    if (!seedPhrases?.length || !isSecureStorageSupported) {
      setVaultError(t.auth.seedPhrase.secureSave.unavailable);
      setVaultState('error');
      return;
    }

    setVaultState('saving');
    setVaultError(null);
    try {
      // Save with wallet type as key
      await SeedVaultService.saveSeedPhrase(seedPhrases, walletType);
      setVaultState('saved');
    } catch (err: any) {
      setVaultError(err?.message || t.auth.seedPhrase.secureSave.error);
      setVaultState('error');
    }
  };

  const handleNext = async () => {
    if (!confirmedSaved) {
      return;
    }

    if (isLastWallet) {
      // Final wallet - save identity and enter app
      setIsSaving(true);
      try {
        if (identity) {
          await setCurrentIdentity(identity);
          console.log('✅ Identity saved after all seed phrases confirmed:', identity.did);
          // Navigate back - app will detect authenticated state
          navigation.goBack();
        }
      } catch (err) {
        console.error('❌ Failed to save identity:', err);
      } finally {
        setIsSaving(false);
      }
    } else {
      // Navigate to next wallet
      const nextWalletType = currentStep === 1 ? 'ubi' : 'savings';
      const nextSeeds = allSeedPhrases?.[nextWalletType];

      if (nextSeeds?.length) {
        navigation.push('SeedPhrase', {
          seedPhrases: nextSeeds,
          walletType: nextWalletType,
          identity,
          allSeedPhrases,
          currentStep: currentStep + 1,
          totalSteps,
        });
      } else {
        console.error('❌ No seed phrases for next wallet:', nextWalletType);
      }
    }
  };

  return (
    <ScreenLayout paddingTop={spacing.md}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Column gap="lg">
          {/* Progress Indicator */}
          <Card style={{ backgroundColor: colors.bg_darker }}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Column gap="xs">
                <Text
                  style={{
                    fontSize: typography.size.lg,
                    fontWeight: typography.weight.bold,
                    color: colors.text_primary,
                  }}
                >
                  {walletInfo.icon} {walletInfo.name}
                </Text>
                <Text
                  style={{
                    fontSize: typography.size.xs,
                    color: colors.text_secondary,
                  }}
                >
                  {walletInfo.description}
                </Text>
              </Column>
              <Badge
                label={`${currentStep}/${totalSteps}`}
                variant="info"
              />
            </Row>

            {/* Step indicators */}
            <Row gap="sm" style={{ marginTop: spacing.md, justifyContent: 'center' }}>
              {[1, 2, 3].map((step) => (
                <View
                  key={step}
                  style={{
                    width: 40,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: step <= currentStep ? colors.primary : colors.bg_light,
                  }}
                />
              ))}
            </Row>
          </Card>

          {/* Warning */}
          <Card style={{ backgroundColor: colors.warning + '22', borderLeftWidth: 4, borderLeftColor: colors.warning }}>
            <Column gap="xs">
              <Text
                style={{
                  fontSize: typography.size.sm,
                  fontWeight: typography.weight.bold,
                  color: colors.warning,
                }}
              >
                ⚠️ {t.auth.seedPhrase.warning}
              </Text>
              <Text
                style={{
                  fontSize: typography.size.xs,
                  color: colors.text_secondary,
                  lineHeight: typography.lineHeight.relaxed,
                }}
              >
                {t.auth.seedPhrase.warningDescription}
              </Text>
            </Column>
          </Card>

          {/* Seed Phrase Display */}
          <Card>
            <Column gap="sm">
              <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Text
                  style={{
                    fontSize: typography.size.sm,
                    fontWeight: typography.weight.semibold,
                    color: colors.text_primary,
                  }}
                >
                  🔑 Recovery Phrase (20 words)
                </Text>
                <Pressable onPress={() => setShowPhrase(!showPhrase)}>
                  <Text
                    style={{
                      fontSize: typography.size.xs,
                      color: colors.primary,
                      fontWeight: typography.weight.semibold,
                    }}
                  >
                    {showPhrase ? t.auth.seedPhrase.hide : t.auth.seedPhrase.show}
                  </Text>
                </Pressable>
              </Row>

              {/* Seed Words Grid */}
              {showPhrase ? (
                <View style={{ backgroundColor: colors.bg_light, padding: spacing.md, borderRadius: borderRadius.base }}>
                  {/* Two-column layout for 20 words */}
                  <Row style={{ justifyContent: 'space-between' }}>
                    {/* Column 1: words 1-10 */}
                    <Column gap="xs" style={{ flex: 1, marginRight: spacing.sm }}>
                      {seedPhrases.slice(0, 10).map((word, index) => (
                        <Row
                          key={`${index}-${word}`}
                          style={{
                            backgroundColor: colors.bg_medium,
                            paddingVertical: spacing.xs,
                            paddingHorizontal: spacing.sm,
                            borderRadius: borderRadius.sm,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: typography.size.xs,
                              color: colors.text_tertiary,
                              fontWeight: typography.weight.semibold,
                              width: 24,
                            }}
                          >
                            {index + 1}.
                          </Text>
                          <Text
                            style={{
                              fontSize: typography.size.sm,
                              color: colors.text_primary,
                              fontWeight: typography.weight.bold,
                            }}
                          >
                            {word}
                          </Text>
                        </Row>
                      ))}
                    </Column>

                    {/* Column 2: words 11-20 */}
                    <Column gap="xs" style={{ flex: 1, marginLeft: spacing.sm }}>
                      {seedPhrases.slice(10, 20).map((word, index) => (
                        <Row
                          key={`${index + 10}-${word}`}
                          style={{
                            backgroundColor: colors.bg_medium,
                            paddingVertical: spacing.xs,
                            paddingHorizontal: spacing.sm,
                            borderRadius: borderRadius.sm,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: typography.size.xs,
                              color: colors.text_tertiary,
                              fontWeight: typography.weight.semibold,
                              width: 24,
                            }}
                          >
                            {index + 11}.
                          </Text>
                          <Text
                            style={{
                              fontSize: typography.size.sm,
                              color: colors.text_primary,
                              fontWeight: typography.weight.bold,
                            }}
                          >
                            {word}
                          </Text>
                        </Row>
                      ))}
                    </Column>
                  </Row>

                  {/* Copy Button */}
                  <Pressable
                    onPress={handleCopy}
                    style={{
                      marginTop: spacing.md,
                      paddingVertical: spacing.sm,
                      paddingHorizontal: spacing.md,
                      backgroundColor: copied ? colors.success : colors.primary,
                      borderRadius: borderRadius.sm,
                      alignItems: 'center',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: typography.size.xs,
                        color: colors.white,
                        fontWeight: typography.weight.semibold,
                      }}
                    >
                      {copied ? '✓ Copied!' : '📋 Copy to Clipboard'}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={() => setShowPhrase(true)}
                  style={{
                    backgroundColor: colors.bg_light,
                    padding: spacing.xl,
                    borderRadius: borderRadius.base,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 48, marginBottom: spacing.sm }}>🔒</Text>
                  <Text
                    style={{
                      fontSize: typography.size.sm,
                      color: colors.primary,
                      fontWeight: typography.weight.semibold,
                    }}
                  >
                    Tap to reveal seed phrase
                  </Text>
                </Pressable>
              )}

              <Text
                style={{
                  fontSize: typography.size.xs,
                  color: colors.text_tertiary,
                  marginTop: spacing.xs,
                  textAlign: 'center',
                }}
              >
                Write these 20 words down in order. Store them safely offline.
              </Text>
            </Column>
          </Card>

          {/* Secure Save Option */}
          {isSecureStorageSupported && (
            <Card>
              <Column gap="sm">
                <Text
                  style={{
                    fontSize: typography.size.sm,
                    fontWeight: typography.weight.semibold,
                    color: colors.text_primary,
                  }}
                >
                  🔐 {t.auth.seedPhrase.secureSave.title}
                </Text>
                <Text
                  style={{
                    fontSize: typography.size.xs,
                    color: colors.text_secondary,
                  }}
                >
                  {t.auth.seedPhrase.secureSave.description}
                </Text>
                <Button
                  onPress={handleSecureSave}
                  disabled={vaultState === 'saving' || vaultState === 'saved'}
                  variant="secondary"
                >
                  {vaultState === 'saving'
                    ? t.auth.seedPhrase.secureSave.saving
                    : vaultState === 'saved'
                      ? '✓ Saved to Secure Storage'
                      : t.auth.seedPhrase.secureSave.button}
                </Button>
                {vaultState === 'error' && vaultError && (
                  <Text style={{ fontSize: typography.size.xs, color: colors.error }}>
                    {vaultError}
                  </Text>
                )}
              </Column>
            </Card>
          )}

          {/* Confirmation Checkbox */}
          <Card
            style={{
              borderWidth: !confirmedSaved && showPhrase ? 2 : 1,
              borderColor: !confirmedSaved && showPhrase ? colors.warning : colors.border,
            }}
          >
            <Pressable onPress={() => setConfirmedSaved(!confirmedSaved)}>
              <Row style={{ alignItems: 'flex-start' }}>
                <Checkbox
                  checked={confirmedSaved}
                  onChange={setConfirmedSaved}
                />
                <Column gap="xs" style={{ flex: 1, marginLeft: spacing.sm }}>
                  <Text
                    style={{
                      fontSize: typography.size.sm,
                      fontWeight: typography.weight.semibold,
                      color: colors.text_primary,
                    }}
                  >
                    I have saved this seed phrase securely
                  </Text>
                  <Text
                    style={{
                      fontSize: typography.size.xs,
                      color: colors.text_secondary,
                    }}
                  >
                    I understand that losing this phrase means losing access to this wallet forever.
                  </Text>
                </Column>
              </Row>
            </Pressable>
          </Card>

          {/* Action Buttons */}
          <ActionFooter
            actions={[
              {
                label: isLastWallet
                  ? '✓ Complete Setup'
                  : `Next: ${WALLET_INFO[currentStep === 1 ? 'ubi' : 'savings'].name} →`,
                onPress: () => void handleNext().catch(() => {}),
                disabled: !confirmedSaved || isSaving,
                loading: isSaving,
              },
            ]}
          />

          {/* Bottom spacing */}
          <View style={{ height: spacing.xl }} />
        </Column>
      </ScrollView>
    </ScreenLayout>
  );
};

export default SeedPhraseScreen;
