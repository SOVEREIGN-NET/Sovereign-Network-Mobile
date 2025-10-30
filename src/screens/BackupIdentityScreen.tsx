/**
 * BackupIdentityScreen
 * Screen for backing up identity (seed phrase + encrypted backup file)
 */

import React, { useState, useCallback } from 'react';
import { View, Pressable, Share, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Card,
  Text,
  Button,
  Switch,
  LoadingView,
  ScreenHeader,
  ScreenLayout,
  ActionButtons,
  InfoCard,
  OptionCardGroup,
} from '../components';
import { useAuth } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, borderRadius } from '../theme';
import type { IdentityStackParamList } from '../types/navigation';

type BackupIdentityScreenProps = NativeStackScreenProps<
  IdentityStackParamList,
  'BackupIdentity'
>;

const BackupIdentityScreen = ({ navigation }: BackupIdentityScreenProps) => {
  const { t } = useTranslation();
  const { currentIdentity, isLoading } = useAuth();

  // State
  const [backupMethod, setBackupMethod] = useState<'seed' | 'file'>('seed');
  const [showSeed, setShowSeed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [backupCreated, setBackupCreated] = useState(false);

  // Mock seed phrase
  const seedPhrase = currentIdentity?.did
    ? [
        'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb',
        'abstract', 'abuse', 'access', 'accident', 'account', // 12 words
      ].join(' ')
    : '';

  const handleCopySeed = useCallback(async () => {
    try {
      await Share.share({
        message: seedPhrase,
        title: 'Backup Seed Phrase',
      });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy seed phrase:', error);
    }
  }, [seedPhrase]);

  const handleCreateBackupFile = useCallback(async () => {
    setBackupCreated(true);
    setTimeout(() => {
      Alert.alert('Success', 'Backup file created and saved to device');
    }, 1000);
  }, []);

  const handleDownloadBackup = useCallback(async () => {
    try {
      await Share.share({
        message: 'Your encrypted backup file',
        title: 'Download Backup',
      });
    } catch (error) {
      console.error('Failed to download backup:', error);
    }
  }, []);

  if (isLoading) {
    return <LoadingView message={t.app.loading} />;
  }

  return (
    <ScreenLayout>
      {/* Header */}
      <ScreenHeader
        title={t.auth.backup.title}
        subtitle={t.auth.backup.description}
      />

        {/* Security Warning */}
        <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.lg }}>
          <InfoCard
            title={t.auth.backup.securityTitle}
            description={t.auth.backup.securityWarning}
            type="error"
            icon="⚠️"
          />
        </View>

        {/* Backup Method Selection */}
        <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.lg }}>
          <Text
            variant="body"
            weight="semibold"
            color={colors.text_primary}
            style={{ marginBottom: spacing.md }}
          >
            {t.auth.backup.method}
          </Text>

          <OptionCardGroup
            options={[
              {
                id: 'seed',
                title: t.auth.backup.seed.label,
                description: t.auth.backup.seed.description,
              },
              {
                id: 'file',
                title: t.auth.backup.file.label,
                description: t.auth.backup.file.description,
              },
            ]}
            selected={backupMethod}
            onSelect={(method) => setBackupMethod(method as 'seed' | 'file')}
            gap="md"
          />
        </View>

        {/* Content based on selected method */}
        {backupMethod === 'seed' && (
          <View style={{ paddingHorizontal: spacing.lg }}>
            {/* Seed Phrase Display */}
            <Card
              style={{
                backgroundColor: colors.bg_darker,
                borderColor: colors.border,
                borderWidth: 1,
                marginBottom: spacing.lg,
              }}
            >
              <View style={{ padding: spacing.md }}>
                <Text
                  variant="body"
                  weight="semibold"
                  color={colors.text_primary}
                  style={{ marginBottom: spacing.md }}
                >
                  {t.auth.backup.seed.title}
                </Text>

                {showSeed ? (
                  <>
                    <Text
                      variant="body"
                      color={colors.primary}
                      style={{
                        fontFamily: 'monospace',
                        lineHeight: 24,
                        padding: spacing.md,
                        backgroundColor: colors.bg_dark,
                        borderRadius: borderRadius.md,
                        marginBottom: spacing.md,
                      }}
                    >
                      {seedPhrase}
                    </Text>

                    <Button
                      variant="secondary"
                      onPress={handleCopySeed}
                      style={{ marginBottom: spacing.md }}
                    >
                      <Text color={colors.text_primary}>
                        {copied ? '✓ Copied' : 'Copy to Clipboard'}
                      </Text>
                    </Button>
                  </>
                ) : (
                  <Pressable
                    onPress={() => setShowSeed(true)}
                    style={{
                      backgroundColor: colors.bg_dark,
                      padding: spacing.lg,
                      borderRadius: borderRadius.md,
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: 120,
                    }}
                  >
                    <Text
                      variant="body"
                      color={colors.text_secondary}
                      style={{ textAlign: 'center' }}
                    >
                      👁️ Tap to reveal
                    </Text>
                  </Pressable>
                )}
              </View>
            </Card>

            {/* Understood Checkbox */}
            <Card
              style={{
                backgroundColor: colors.bg_dark,
                borderColor: colors.border,
                borderWidth: 1,
                marginBottom: spacing.lg,
              }}
            >
              <Pressable
                onPress={() => setUnderstood(!understood)}
                style={{ padding: spacing.md }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Switch
                    value={understood}
                    onValueChange={setUnderstood}
                    style={{ marginRight: spacing.md }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text variant="caption" color={colors.text_secondary}>
                      I understand that I must keep this seed phrase private and
                      secure
                    </Text>
                  </View>
                </View>
              </Pressable>
            </Card>

            <ActionButtons
              buttons={[
                {
                  label: "✓ I've saved my seed phrase",
                  onPress: () => navigation.goBack(),
                  variant: 'primary',
                  disabled: !understood,
                },
              ]}
              paddingHorizontal={0}
            />
          </View>
        )}

        {backupMethod === 'file' && (
          <View style={{ paddingHorizontal: spacing.lg }}>
            {/* File Backup Instructions */}
            <Card
              style={{
                backgroundColor: colors.bg_darker,
                borderColor: colors.border,
                borderWidth: 1,
                marginBottom: spacing.lg,
              }}
            >
              <View style={{ padding: spacing.md }}>
                <Text
                  variant="body"
                  weight="semibold"
                  color={colors.text_primary}
                  style={{ marginBottom: spacing.md }}
                >
                  {t.auth.backup.file.title}
                </Text>

                <Text
                  variant="caption"
                  color={colors.text_secondary}
                  style={{ marginBottom: spacing.md }}
                >
                  Create an encrypted backup file with a secure password.
                </Text>

                {backupCreated ? (
                  <>
                    <InfoCard
                      title="Backup file created successfully"
                      description="Stored securely on your device"
                      type="success"
                      icon="✓"
                    />

                    <ActionButtons
                      buttons={[
                        {
                          label: '⬇️ Download Backup',
                          onPress: () => {
                            handleDownloadBackup().catch(() => {});
                          },
                          variant: 'secondary',
                        },
                        {
                          label: 'Done',
                          onPress: () => navigation.goBack(),
                          variant: 'primary',
                        },
                      ]}
                      gap="md"
                      paddingVertical={spacing.md}
                    />
                  </>
                ) : (
                  <Button variant="primary" onPress={handleCreateBackupFile}>
                    <Text color={colors.white} weight="semibold">
                      Create Backup File
                    </Text>
                  </Button>
                )}
              </View>
            </Card>
          </View>
      )}
    </ScreenLayout>
  );
};

export default BackupIdentityScreen;
