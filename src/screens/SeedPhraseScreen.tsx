/**
 * SeedPhraseScreen
 * Display and confirm a single 24-word master seed phrase after identity creation
 */

import React, { useState, useEffect } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
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
} from '../components';
import { useTranslation } from '../i18n';
import { useAuth } from '../hooks';
import SeedVaultService from '../services/SeedVaultService';
import { colors, spacing, typography, borderRadius } from '../theme';
import { AuthStackParamList } from '../navigation/AuthNavigator';

type SeedPhraseScreenProps = NativeStackScreenProps<AuthStackParamList, 'SeedPhrase'>;

const SeedPhraseScreen = ({ navigation, route }: SeedPhraseScreenProps) => {
  const { t } = useTranslation();
  const { seedPhrases, identity } = route.params || {};
  const { setCurrentIdentity } = useAuth();

  const [confirmedSaved, setConfirmedSaved] = useState(false);
  const [showPhrase, setShowPhrase] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSecureStorageSupported, setIsSecureStorageSupported] = useState(false);
  const [vaultState, setVaultState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [vaultError, setVaultError] = useState<string | null>(null);

  useEffect(() => {
    SeedVaultService.isSecureStorageAvailable()
      .then(setIsSecureStorageSupported)
      .catch(() => setIsSecureStorageSupported(false));
  }, []);

  if (!seedPhrases || !Array.isArray(seedPhrases) || seedPhrases.length === 0) {
    return (
      <ScreenLayout>
        <Column gap="xl">
          <ErrorAlert message={t.auth.seedPhrase.errors.invalidPhrases} icon="❌" />
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

  const handleSecureSave = async () => {
    if (!seedPhrases?.length || !isSecureStorageSupported) {
      setVaultError(t.auth.seedPhrase.secureSave.unavailable);
      setVaultState('error');
      return;
    }

    setVaultState('saving');
    setVaultError(null);
    try {
      await SeedVaultService.saveSeedPhrase(seedPhrases);
      setVaultState('saved');
    } catch (err: any) {
      setVaultError(err?.message || t.auth.seedPhrase.secureSave.error);
      setVaultState('error');
    }
  };

  const handleContinue = async () => {
    if (!confirmedSaved) {
      return;
    }

    setIsSaving(true);
    try {
      if (identity) {
        await setCurrentIdentity(identity);
        navigation.goBack();
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScreenLayout paddingTop={spacing.md}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Column gap="lg">
          <Card style={{ backgroundColor: colors.bg_darker }}>
            <Column gap="xs">
              <Text
                style={{
                  fontSize: typography.size.lg,
                  fontWeight: typography.weight.bold,
                  color: colors.text_primary,
                }}
              >
                {t.auth.seedPhrase.title}
              </Text>
              <Text
                style={{
                  fontSize: typography.size.xs,
                  color: colors.text_secondary,
                }}
              >
                {t.auth.seedPhrase.warning}
              </Text>
            </Column>
          </Card>

          <Card>
            <Column gap="sm">
              <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <SectionLabel label={t.auth.seedPhrase.title} />
                <Pressable onPress={() => setShowPhrase((prev) => !prev)}>
                  <Text style={{ color: colors.primary, fontSize: typography.size.xs }}>
                    {showPhrase ? t.auth.seedPhrase.hide : t.auth.seedPhrase.show}
                  </Text>
                </Pressable>
              </Row>

              {!showPhrase ? (
                <Text style={{ color: colors.text_secondary, fontSize: typography.size.xs }}>
                  {t.auth.seedPhrase.hidden}
                </Text>
              ) : (
                <View
                  style={{
                    borderRadius: borderRadius.lg,
                    borderWidth: 1,
                    borderColor: colors.border,
                    padding: spacing.md,
                    backgroundColor: colors.bg_darker,
                  }}
                >
                  <Column gap="sm">
                    {[0, 1].map((column) => (
                      <Column key={column} gap="xs">
                        {seedPhrases.slice(column * 12, column * 12 + 12).map((word, index) => (
                          <Row key={`${column}-${index}`} style={{ alignItems: 'center' }}>
                            <Text style={{ color: colors.text_secondary, width: 28 }}>
                              {column * 12 + index + 1}.
                            </Text>
                            <Text style={{ color: colors.text_primary }}>{word}</Text>
                          </Row>
                        ))}
                      </Column>
                    ))}
                  </Column>
                </View>
              )}

              <Card style={{ backgroundColor: colors.bg_light }}>
                <Text style={{ color: colors.text_secondary, fontSize: typography.size.xs }}>
                  {t.auth.seedPhrase.warningDescription}
                </Text>
              </Card>

              <Checkbox
                label={t.auth.seedPhrase.confirmSaved}
                checked={confirmedSaved}
                onChange={setConfirmedSaved}
              />

              {isSecureStorageSupported && (
                <Card style={{ backgroundColor: colors.bg_light }}>
                  <Column gap="xs">
                    <Text style={{ color: colors.text_primary, fontSize: typography.size.sm }}>
                      {t.auth.seedPhrase.secureSave.title}
                    </Text>
                    <Text style={{ color: colors.text_secondary, fontSize: typography.size.xs }}>
                      {t.auth.seedPhrase.secureSave.description}
                    </Text>
                    <Button
                      onPress={handleSecureSave}
                      variant="secondary"
                      loading={vaultState === 'saving'}
                      disabled={vaultState === 'saving' || vaultState === 'saved'}
                    >
                      {t.auth.seedPhrase.secureSave.button}
                    </Button>
                  </Column>
                </Card>
              )}

              {vaultState === 'error' && vaultError && (
                <ErrorAlert message={vaultError} icon="❌" />
              )}

              {vaultState === 'saved' && (
                <Text style={{ color: colors.success, fontSize: typography.size.xs }}>
                  {t.auth.seedPhrase.secureSave.success}
                </Text>
              )}
            </Column>
          </Card>
        </Column>
      </ScrollView>

      <ActionFooter
        actions={[
          {
            label: t.auth.seedPhrase.continueButton,
            onPress: handleContinue,
            loading: isSaving,
            disabled: !confirmedSaved || isSaving,
          },
        ]}
      />
    </ScreenLayout>
  );
};

export default SeedPhraseScreen;
