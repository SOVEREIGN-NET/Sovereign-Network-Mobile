import React, { useState, useEffect } from 'react';
import { ScrollView, View, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Card,
  Text,
  Button,
  Input,
  Column,
  LoadingView,
} from '../components';
import { useAuth } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography, borderRadius } from '../theme';

const AVATAR_OPTIONS = ['👤', '🧑', '👨', '👩', '🧔', '🧓', '👨‍💼', '👩‍💼', '🎭', '🎨', '🚀', '⚡'];

const ProfileEditScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { currentIdentity, updateProfile, isLoading } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('👤');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (currentIdentity) {
      setDisplayName(currentIdentity.displayName);
      setSelectedAvatar(currentIdentity.avatar || '👤');
    }
  }, [currentIdentity]);

  const handleSave = async () => {
    setError(null);

    // Validation
    if (!displayName.trim()) {
      setError(t.identity.profile.validation.displayNameRequired);
      return;
    }

    if (displayName.trim().length < 2) {
      setError(t.identity.profile.validation.displayNameTooShort);
      return;
    }

    if (displayName.trim().length > 50) {
      setError(t.identity.profile.validation.displayNameTooLong);
      return;
    }

    setIsSaving(true);
    try {
      await updateProfile(displayName.trim(), selectedAvatar);
      Alert.alert('Success', t.identity.profile.success.profileUpdated);
      navigation?.goBack();
    } catch (err: any) {
      setError(err.message || t.identity.profile.errors.profileUpdateFailed);
    } finally {
      setIsSaving(false);
    }
  };

  if (!currentIdentity) {
    return <LoadingView />;
  }

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
          paddingTop: 20,
          paddingBottom: spacing.lg,
        }}
        scrollIndicatorInsets={{ right: 1 }}
        showsVerticalScrollIndicator={false}
      >
        <Column gap="xl">
          {/* Error Message */}
          {error && (
            <View
              style={{
                backgroundColor: colors.error,
                padding: spacing.md,
                borderRadius: borderRadius.base,
                borderLeftWidth: 4,
                borderLeftColor: colors.error_dark,
              }}
            >
              <Text style={{ color: colors.white }}>❌ {error}</Text>
            </View>
          )}

          {/* Avatar Selection */}
          <Card>
            <Text
              style={{
                fontSize: typography.size.sm,
                fontWeight: typography.weight.semibold,
                color: colors.text_primary,
                marginBottom: spacing.md,
              }}
            >
              {t.identity.profile.selectAvatar}
            </Text>

            <View
              style={{
                alignItems: 'center',
                paddingVertical: spacing.lg,
                backgroundColor: colors.bg_darker,
                borderRadius: borderRadius.base,
                marginBottom: spacing.md,
              }}
            >
              <Text style={{ fontSize: typography.size['5xl'] }}>
                {selectedAvatar}
              </Text>
            </View>

            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: spacing.sm,
                justifyContent: 'center',
              }}
            >
              {AVATAR_OPTIONS.map((avatar) => (
                <View
                  key={avatar}
                  style={{
                    width: '23%',
                    aspectRatio: 1,
                  }}
                >
                  <Button
                    onPress={() => setSelectedAvatar(avatar)}
                    style={{
                      backgroundColor:
                        selectedAvatar === avatar ? colors.primary : colors.bg_darker,
                      borderWidth: 2,
                      borderColor:
                        selectedAvatar === avatar ? colors.primary : colors.border,
                      padding: spacing.sm,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontSize: typography.size['3xl'] }}>
                      {avatar}
                    </Text>
                  </Button>
                </View>
              ))}
            </View>
          </Card>

          {/* Display Name Input */}
          <Card>
            <Column gap="sm">
              <Text
                style={{
                  fontSize: typography.size.sm,
                  fontWeight: typography.weight.semibold,
                  color: colors.text_primary,
                  marginBottom: spacing.sm,
                }}
              >
                {t.identity.profile.displayName}
              </Text>
              <Input
                placeholder={t.identity.profile.displayNamePlaceholder}
                value={displayName}
                onChangeText={setDisplayName}
                editable={!isLoading && !isSaving}
                maxLength={50}
              />
              <Text
                style={{
                  fontSize: typography.size.xs,
                  color: colors.text_tertiary,
                  marginTop: spacing.xs,
                }}
              >
                {t.identity.profile.characterCounter.replace('{current}', displayName.length.toString())}
              </Text>
            </Column>
          </Card>

          {/* Info Card */}
          <Card>
            <View
              style={{
                backgroundColor: colors.bg_darker,
                padding: spacing.md,
                borderRadius: borderRadius.base,
                borderLeftWidth: 4,
                borderLeftColor: colors.info,
              }}
            >
              <Text
                style={{
                  fontSize: typography.size.xs,
                  fontWeight: typography.weight.semibold,
                  color: colors.info,
                  marginBottom: spacing.sm,
                }}
              >
                {t.identity.profile.info.title}
              </Text>
              <Text
                style={{
                  fontSize: typography.size.xs,
                  color: colors.text_secondary,
                  lineHeight: typography.size.sm * 1.5,
                }}
              >
                {t.identity.profile.info.description}
              </Text>
            </View>
          </Card>

          {/* Action Buttons */}
          <Column gap="sm">
            <Button
              onPress={handleSave}
              disabled={isLoading || isSaving}
              style={{
                opacity: isLoading || isSaving ? 0.6 : 1,
              }}
            >
              {isSaving ? t.identity.profile.savingButton : t.identity.profile.saveButton}
            </Button>
            <Button
              variant="outline"
              onPress={() => navigation?.goBack()}
              disabled={isLoading || isSaving}
            >
              {t.identity.profile.cancelButton}
            </Button>
          </Column>

          {/* Footer spacing */}
          <View style={{ height: spacing.xl }} />
        </Column>
      </ScrollView>
    </SafeAreaView>
  );
};

export default ProfileEditScreen;
