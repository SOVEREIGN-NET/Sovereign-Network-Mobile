/**
 * BiometricVerificationScreen
 * Screen for setting up and managing biometric authentication (fingerprint/face recognition)
 */

import React, { useState, useCallback, useEffect } from 'react';
import { ScrollView, View, Pressable, Alert } from 'react-native';
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
import { colors, spacing, typography, borderRadius } from '../theme';
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
              onPress: async () => {
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing['3xl'] }}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={{ padding: spacing.lg }}>
          <Text variant="h2" color={colors.primary} style={{ marginBottom: spacing.sm }}>
            {t.settings.biometric.title}
          </Text>
          <Text
            variant="body"
            color={colors.text_secondary}
            style={{ marginBottom: spacing.lg }}
          >
            {t.settings.biometric.description}
          </Text>
        </View>

        {/* Biometric Status */}
        {!biometricAvailable ? (
          <Card
            style={{
              marginHorizontal: spacing.lg,
              marginBottom: spacing.lg,
              backgroundColor: `${colors.warning}15`,
              borderColor: colors.warning,
              borderWidth: 1,
            }}
          >
            <View style={{ padding: spacing.md }}>
              <Text
                variant="body"
                weight="semibold"
                color={colors.warning}
                style={{ marginBottom: spacing.sm }}
              >
                ⚠️ {t.settings.biometric.notAvailable}
              </Text>
              <Text variant="caption" color={colors.text_secondary}>
                {t.settings.biometric.notAvailableMessage}
              </Text>
            </View>
          </Card>
        ) : (
          <>
            {/* Biometric Type Info */}
            <Card
              style={{
                marginHorizontal: spacing.lg,
                marginBottom: spacing.lg,
                backgroundColor: `${colors.info}15`,
                borderColor: colors.info,
                borderWidth: 1,
              }}
            >
              <View style={{ padding: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
                  <Text
                    variant="body"
                    weight="semibold"
                    color={colors.info}
                    style={{ flex: 1 }}
                  >
                    {biometricType === 'fingerprint' ? '👆' : '👤'}{' '}
                    {biometricType === 'fingerprint'
                      ? t.settings.biometric.fingerprint
                      : t.settings.biometric.faceRecognition}
                  </Text>
                </View>
                <Text variant="caption" color={colors.text_secondary}>
                  {biometricType === 'fingerprint'
                    ? t.settings.biometric.fingerprintDescription
                    : t.settings.biometric.faceRecognitionDescription}
                </Text>
              </View>
            </Card>

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

              {[
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
              ].map((item) => (
                <Card
                  key={item.id}
                  style={{
                    backgroundColor: colors.bg_dark,
                    borderColor: colors.border,
                    borderWidth: 1,
                    marginBottom: spacing.md,
                  }}
                >
                  <View style={{ padding: spacing.md }}>
                    <Text
                      variant="body"
                      weight="semibold"
                      color={colors.text_primary}
                      style={{ marginBottom: spacing.xs }}
                    >
                      {item.title}
                    </Text>
                    <Text variant="caption" color={colors.text_secondary}>
                      {item.description}
                    </Text>
                  </View>
                </Card>
              ))}
            </View>

            {/* Passphrase Backup Warning */}
            <Card
              style={{
                marginHorizontal: spacing.lg,
                marginBottom: spacing.lg,
                backgroundColor: `${colors.warning}15`,
                borderColor: colors.warning,
                borderWidth: 1,
              }}
            >
              <View style={{ padding: spacing.md }}>
                <Text
                  variant="body"
                  weight="semibold"
                  color={colors.warning}
                  style={{ marginBottom: spacing.sm }}
                >
                  💡 {t.settings.biometric.backupPassphrase}
                </Text>
                <Text variant="caption" color={colors.text_secondary}>
                  {t.settings.biometric.backupPassphraseMessage}
                </Text>
              </View>
            </Card>

            {/* Action Buttons */}
            <View style={{ paddingHorizontal: spacing.lg }}>
              <Button variant="secondary" onPress={() => navigation.goBack()}>
                <Text color={colors.text_primary} weight="semibold">
                  {t.identity.actions.settings}
                </Text>
              </Button>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default BiometricVerificationScreen;
