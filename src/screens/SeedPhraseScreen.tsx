/**
 * SeedPhraseScreen
 * Display and confirm seed phrases after identity creation
 */

import React, { useState } from 'react';
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
} from '../components';
import { useTranslation } from '../i18n';
import { colors, spacing, typography, borderRadius } from '../theme';
import { AuthStackParamList } from '../navigation/AuthNavigator';

type SeedPhraseScreenProps = NativeStackScreenProps<AuthStackParamList, 'SeedPhrase'>;

const SeedPhraseScreen = ({ navigation, route }: SeedPhraseScreenProps) => {
  const { t } = useTranslation();
  const { seedPhrases, walletType = 'primary' } = route.params || {};
  const [copied, setCopied] = useState(false);
  const [confirmedSaved, setConfirmedSaved] = useState(false);
  const [showPhrase, setShowPhrase] = useState(false);

  if (!seedPhrases || !Array.isArray(seedPhrases)) {
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

  const handleCopy = async () => {
    // In a real app, use react-native-clipboard
    // For now, just show feedback
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleContinue = () => {
    if (!confirmedSaved) {
      return;
    }
    // Navigate to next screen or main app
    navigation.navigate('SignIn');
  };

  return (
    <ScreenLayout paddingTop={spacing.xl}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Column gap="xl">
          {/* Warning */}
          <Card style={{ backgroundColor: colors.warning + '33', borderLeftWidth: 4, borderLeftColor: colors.warning }}>
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
                    marginBottom: spacing.md,
                  }}
                >
                  {t.auth.seedPhrase.title} ({walletType.toUpperCase()} {t.auth.seedPhrase.wallet})
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
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                    {seedPhrases.map((word, index) => (
                      <View
                        key={`${index}-${word}`}
                        style={{
                          backgroundColor: colors.bg_medium,
                          paddingVertical: spacing.xs,
                          paddingHorizontal: spacing.sm,
                          borderRadius: borderRadius.sm,
                          minWidth: '30%',
                          marginBottom: spacing.xs,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: typography.size.xs,
                            color: colors.text_secondary,
                            fontWeight: typography.weight.semibold,
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
                      </View>
                    ))}
                  </View>

                  <Pressable
                    onPress={handleCopy}
                    style={{
                      marginTop: spacing.md,
                      paddingVertical: spacing.sm,
                      paddingHorizontal: spacing.md,
                      backgroundColor: colors.primary,
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
                      {copied ? t.auth.seedPhrase.copied : t.auth.seedPhrase.copy}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <View
                  style={{
                    backgroundColor: colors.bg_light,
                    padding: spacing.lg,
                    borderRadius: borderRadius.base,
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: spacing['3xl'] * 3 + spacing.lg,
                  }}
                >
                  <Text
                    style={{
                      fontSize: typography.size.sm,
                      color: colors.text_secondary,
                      fontStyle: 'italic',
                    }}
                  >
                    {t.auth.seedPhrase.hidden}
                  </Text>
                </View>
              )}

              <Text
                style={{
                  fontSize: typography.size.xs,
                  color: colors.text_tertiary,
                  marginTop: spacing.sm,
                }}
              >
                {t.auth.seedPhrase.writeDown}
              </Text>
            </Column>
          </Card>

          {/* Confirmation Checkbox */}
          <Card>
            <Column gap="xs">
              <Checkbox
                checked={confirmedSaved}
                onChange={setConfirmedSaved}
              />
              <Column gap="xs" style={{ marginLeft: spacing.lg + spacing.md }}>
                <SectionLabel>{t.auth.seedPhrase.confirmSaved}</SectionLabel>
                <Text
                  style={{
                    fontSize: typography.size.xs,
                    color: colors.text_secondary,
                    lineHeight: typography.lineHeight.relaxed,
                  }}
                >
                  {t.auth.seedPhrase.confirmSavedDescription}
                </Text>
              </Column>
            </Column>
          </Card>

          {/* Action Buttons */}
          <ActionFooter
            actions={[
              {
                label: t.auth.seedPhrase.continueButton,
                onPress: handleContinue,
                disabled: !confirmedSaved,
              },
              {
                label: t.app.back,
                onPress: () => navigation.goBack(),
                variant: 'secondary',
              },
            ]}
          />
        </Column>
      </ScrollView>
    </ScreenLayout>
  );
};

export default SeedPhraseScreen;
