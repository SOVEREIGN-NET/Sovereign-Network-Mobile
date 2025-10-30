/**
 * BiometricVerificationScreen
 * Screen for setting up and managing biometric authentication (fingerprint/face recognition)
 */

import React, { useState, useCallback, useEffect } from 'react';
import { View, Pressable, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Card,
  Text,
  Switch,
  LoadingView,
  ScreenHeader,
  ScreenLayout,
  InfoCard,
  InfoCardList,
  ActionButtons,
} from '../components';
import { useAuth } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing } from '../theme';
import type { IdentityStackParamList } from '../types/navigation';

type BiometricVerificationScreenProps = NativeStackScreenProps<
  IdentityStackParamList,
  'BiometricVerification'
>;

const BiometricVerificationScreen = ({
  navigation,
}: BiometricVerificationScreenProps) => {
  const { t } = useTranslation();
  const { currentIdentity, updateBiometric, isLoading } = useAuth();

  // State
  const [biometricEnabled, setBiometricEnabled] = useState(
    !!currentIdentity?.biometricHash
  );
  const [biometricAvailable, setBiometricAvailable] = useState(true);
  const [biometricType, setBiometricType] = useState<
    'fingerprint' | 'face' | 'unknown'
  >('fingerprint');
  const [enrolling, setEnrolling] = useState(false);
  const [verified, setVerified] = useState(false);

  // Mock biometric availability check
  useEffect(() => {
    // In a real app, would check native biometric availability
    setBiometricAvailable(true);
    // Mock detecting device has fingerprint sensor
    setBiometricType('fingerprint');
  }, []);

  const handleToggleBiometric = useCallback(
    async (enabled: boolean) => {
      if (enrolling) return;

      if (enabled) {
        // Enable biometric
        setEnrolling(true);
        try {
          // Mock enrollment process
          await new Promise((resolve) => setTimeout(resolve, 1500));

          // Mock verification
          setVerified(true);
          setTimeout(() => {
            setVerified(false);
          }, 2000);

          await updateBiometric(true);
          setBiometricEnabled(true);

          Alert.alert(
            t.settings.biometric.enrollSuccess,
            t.settings.biometric.enrollSuccessDescription
          );
        } catch (error) {
          Alert.alert(
            t.settings.biometric.enrollFailed,
            t.settings.biometric.enrollFailedDescription
          );
          console.error('Biometric enrollment failed:', error);
        } finally {
          setEnrolling(false);
        }
      } else {
        // Disable biometric
        Alert.alert(
          t.settings.biometric.disableTitle,
          t.settings.biometric.disableMessage,
          [
            {
              text: t.settings.biometric.disableCancel,
              onPress: () => {},
              style: 'cancel',
            },
            {
              text: t.settings.biometric.disableConfirm,
              onPress: () => {
                (async () => {
                  try {
                    await updateBiometric(false);
                    setBiometricEnabled(false);
                    Alert.alert(
                      t.settings.biometric.disableSuccess,
                      t.settings.biometric.disableSuccessDescription
                    );
                  } catch (error) {
                    console.error('Failed to disable biometric:', error);
                    Alert.alert(t.app.error, t.settings.biometric.disableFailed);
                  }
                })();
              },
              style: 'destructive',
            },
          ]
        );
      }
    },
    [enrolling, updateBiometric, t]
  );

  if (isLoading) {
    return <LoadingView message={t.app.loading} />;
  }

  return (
    <ScreenLayout>
      {/* Header */}
      <ScreenHeader
        title={t.settings.biometric.title}
        subtitle={t.settings.biometric.description}
      />

        {/* Biometric Status */}
        {biometricAvailable ? (
          <>
            {/* Biometric Type Info */}
            <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.lg }}>
              <InfoCard
                title={
                  biometricType === 'fingerprint'
                    ? t.settings.biometric.fingerprint
                    : t.settings.biometric.faceRecognition
                }
                description={
                  biometricType === 'fingerprint'
                    ? t.settings.biometric.fingerprintDescription
                    : t.settings.biometric.faceRecognitionDescription
                }
                type="info"
                icon={biometricType === 'fingerprint' ? '👆' : '👤'}
              />
            </View>

            {/* Toggle Switch */}
            <Card
              style={{
                marginHorizontal: spacing.lg,
                marginBottom: spacing.lg,
                backgroundColor: colors.bg_dark,
                borderColor: colors.border,
                borderWidth: 1,
              }}
            >
              <Pressable
                disabled={enrolling}
                onPress={() => handleToggleBiometric(!biometricEnabled)}
                style={{ padding: spacing.md }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text
                      variant="body"
                      weight="semibold"
                      color={colors.text_primary}
                      style={{ marginBottom: spacing.xs }}
                    >
                      {biometricEnabled
                        ? t.settings.biometric.enabled
                        : t.settings.biometric.disabled}
                    </Text>
                    <Text variant="caption" color={colors.text_secondary}>
                      {biometricEnabled
                        ? t.settings.biometric.enabledDescription
                        : t.settings.biometric.disabledDescription}
                    </Text>
                  </View>
                  <Switch
                    value={biometricEnabled}
                    onValueChange={handleToggleBiometric}
                    disabled={enrolling}
                  />
                </View>
              </Pressable>
            </Card>

            {/* Enrollment Status */}
            {enrolling && (
              <Card
                style={{
                  marginHorizontal: spacing.lg,
                  marginBottom: spacing.lg,
                  backgroundColor: `${colors.primary}15`,
                  borderColor: colors.primary,
                  borderWidth: 1,
                }}
              >
                <View style={{ padding: spacing.lg, alignItems: 'center' }}>
                  <Text
                    variant="body"
                    weight="semibold"
                    color={colors.primary}
                    style={{ marginBottom: spacing.md }}
                  >
                    {t.settings.biometric.enrolling}
                  </Text>
                  <Text
                    variant="caption"
                    color={colors.text_secondary}
                    style={{ textAlign: 'center' }}
                  >
                    {t.settings.biometric.enrollingMessage}
                  </Text>
                  <View
                    style={{
                      marginTop: spacing.lg,
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      borderWidth: 3,
                      borderColor: colors.primary,
                      borderTopColor: 'transparent',
                    }}
                  />
                </View>
              </Card>
            )}

            {verified && (
              <Card
                style={{
                  marginHorizontal: spacing.lg,
                  marginBottom: spacing.lg,
                  backgroundColor: `${colors.success}15`,
                  borderColor: colors.success,
                  borderWidth: 1,
                }}
              >
                <View style={{ padding: spacing.lg, alignItems: 'center' }}>
                  <Text
                    variant="body"
                    weight="semibold"
                    color={colors.success}
                    style={{ marginBottom: spacing.sm }}
                  >
                    ✓ {t.settings.biometric.verifiedSuccess}
                  </Text>
                  <Text
                    variant="caption"
                    color={colors.text_secondary}
                    style={{ textAlign: 'center' }}
                  >
                    {t.settings.biometric.verifiedMessage}
                  </Text>
                </View>
              </Card>
            )}

            {/* Security Info */}
            <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.lg }}>
              <Text
                variant="body"
                weight="semibold"
                color={colors.text_primary}
                style={{ marginBottom: spacing.md }}
              >
                {t.settings.biometric.securityInfo}
              </Text>

              <InfoCardList
                items={[
                  {
                    id: 'secure',
                    title: t.settings.biometric.secure,
                    description: t.settings.biometric.secureDescription,
                  },
                  {
                    id: 'fast',
                    title: t.settings.biometric.fast,
                    description: t.settings.biometric.fastDescription,
                  },
                  {
                    id: 'convenient',
                    title: t.settings.biometric.convenient,
                    description: t.settings.biometric.convenientDescription,
                  },
                ]}
                gap="md"
              />
            </View>

            {/* Passphrase Backup Warning */}
            <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.lg }}>
              <InfoCard
                title={t.settings.biometric.backupPassphrase}
                description={t.settings.biometric.backupPassphraseMessage}
                type="warning"
                icon="💡"
              />
            </View>

            {/* Action Buttons */}
            <ActionButtons
              buttons={[
                {
                  label: t.identity.actions.settings,
                  onPress: () => navigation.goBack(),
                  variant: 'secondary',
                },
              ]}
            />
          </>
        ) : (
          <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.lg }}>
            <InfoCard
              title={t.settings.biometric.notAvailable}
              description={t.settings.biometric.notAvailableMessage}
              type="warning"
              icon="⚠️"
            />
          </View>
      )}
    </ScreenLayout>
  );
};

export default BiometricVerificationScreen;
