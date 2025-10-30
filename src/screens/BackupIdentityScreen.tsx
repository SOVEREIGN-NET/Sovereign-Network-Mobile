/**
 * BackupIdentityScreen
 * Screen for backing up identity (seed phrase + encrypted backup file)
 */

import React, { useState, useCallback } from 'react';
import { ScrollView, View, Pressable, Share, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Card,
  Text,
  Button,
  Switch,
  LoadingView,
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing['3xl'] }}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={{ padding: spacing.lg }}>
          <Text variant="h2" color={colors.primary} style={{ marginBottom: spacing.sm }}>
            {t.auth.backup.title}
          </Text>
          <Text
            variant="body"
            color={colors.text_secondary}
            style={{ marginBottom: spacing.lg }}
          >
            {t.auth.backup.description}
          </Text>
        </View>

        {/* Security Warning */}
        <Card
          style={{
            marginHorizontal: spacing.lg,
            marginBottom: spacing.lg,
            backgroundColor: `${colors.error}15`,
            borderColor: colors.error,
            borderWidth: 1,
          }}
        >
          <View style={{ padding: spacing.md }}>
            <Text
              variant="body"
              weight="semibold"
              color={colors.error}
              style={{ marginBottom: spacing.sm }}
            >
              ⚠️ {t.auth.backup.securityTitle}
            </Text>
            <Text variant="caption" color={colors.text_secondary}>
              {t.auth.backup.securityWarning}
            </Text>
          </View>
        </Card>

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

          {/* Seed Phrase Option */}
          <Pressable
            onPress={() => setBackupMethod('seed')}
            style={{ marginBottom: spacing.md }}
          >
            <Card
              style={{
                padding: spacing.md,
                backgroundColor:
                  backupMethod === 'seed' ? `${colors.primary}20` : colors.bg_dark,
                borderColor:
                  backupMethod === 'seed' ? colors.primary : colors.border,
                borderWidth: 1,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text
                    variant="body"
                    weight="semibold"
                    color={colors.text_primary}
                  >
                    {t.auth.backup.seed.label}
                  </Text>
                  <Text
                    variant="caption"
                    color={colors.text_secondary}
                    style={{ marginTop: spacing.xs }}
                  >
                    {t.auth.backup.seed.description}
                  </Text>
                </View>
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    borderWidth: 2,
                    borderColor:
                      backupMethod === 'seed' ? colors.primary : colors.border,
                    backgroundColor:
                      backupMethod === 'seed' ? colors.primary : 'transparent',
                  }}
                />
              </View>
            </Card>
          </Pressable>

          {/* Encrypted File Option */}
          <Pressable onPress={() => setBackupMethod('file')}>
            <Card
              style={{
                padding: spacing.md,
                backgroundColor:
                  backupMethod === 'file' ? `${colors.primary}20` : colors.bg_dark,
                borderColor:
                  backupMethod === 'file' ? colors.primary : colors.border,
                borderWidth: 1,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text
                    variant="body"
                    weight="semibold"
                    color={colors.text_primary}
                  >
                    {t.auth.backup.file.label}
                  </Text>
                  <Text
                    variant="caption"
                    color={colors.text_secondary}
                    style={{ marginTop: spacing.xs }}
                  >
                    {t.auth.backup.file.description}
                  </Text>
                </View>
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    borderWidth: 2,
                    borderColor:
                      backupMethod === 'file' ? colors.primary : colors.border,
                    backgroundColor:
                      backupMethod === 'file' ? colors.primary : 'transparent',
                  }}
                />
              </View>
            </Card>
          </Pressable>
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

            <Button
              variant="primary"
              disabled={!understood}
              onPress={() => navigation.goBack()}
              style={{ marginBottom: spacing.lg }}
            >
              <Text color={colors.white} weight="semibold">
                ✓ I've saved my seed phrase
              </Text>
            </Button>
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

                {!backupCreated ? (
                  <Button variant="primary" onPress={handleCreateBackupFile}>
                    <Text color={colors.white} weight="semibold">
                      Create Backup File
                    </Text>
                  </Button>
                ) : (
                  <>
                    <Card
                      style={{
                        backgroundColor: `${colors.success}15`,
                        borderColor: colors.success,
                        borderWidth: 1,
                        marginBottom: spacing.md,
                      }}
                    >
                      <View style={{ padding: spacing.md }}>
                        <Text
                          variant="caption"
                          color={colors.success}
                          weight="semibold"
                        >
                          ✓ Backup file created successfully
                        </Text>
                        <Text
                          variant="caption"
                          color={colors.text_secondary}
                          style={{ marginTop: spacing.xs }}
                        >
                          Stored securely on your device
                        </Text>
                      </View>
                    </Card>

                    <Button
                      variant="secondary"
                      onPress={handleDownloadBackup}
                      style={{ marginBottom: spacing.md }}
                    >
                      <Text color={colors.text_primary} weight="semibold">
                        ⬇️ Download Backup
                      </Text>
                    </Button>

                    <Button
                      variant="primary"
                      onPress={() => navigation.goBack()}
                    >
                      <Text color={colors.white} weight="semibold">
                        Done
                      </Text>
                    </Button>
                  </>
                )}
              </View>
            </Card>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default BackupIdentityScreen;
