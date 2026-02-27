import React, { useState, useEffect } from 'react';
import { View, Alert } from 'react-native';
import {
  Card,
  Text,
  Button,
  Column,
  LoadingView,
  ScreenLayout,
  ErrorAlert,
  FormField,
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
    const lockedDisplayName = (
      currentIdentity?.displayName ||
      displayName
    ).trim();

    // Validation (display name is locked, but still required for payload)
    if (!lockedDisplayName) {
      setError(t.identity.profile.validation.displayNameRequired);
      return;
    }

    if (lockedDisplayName.length < 2) {
      setError(t.identity.profile.validation.displayNameTooShort);
      return;
    }

    if (lockedDisplayName.length > 50) {
      setError(t.identity.profile.validation.displayNameTooLong);
      return;
    }

    setIsSaving(true);
    try {
      await updateProfile(lockedDisplayName, selectedAvatar);
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
    <ScreenLayout paddingTop={20}>
      <Column gap="xl">
        {/* Error Message */}
        {error && <ErrorAlert message={error} icon="❌" />}

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
          <FormField
            label={t.identity.profile.displayName}
            placeholder={t.identity.profile.displayNamePlaceholder}
            value={displayName}
            onChangeText={setDisplayName}
            editable={false}
            maxLength={50}
            helperText="Display name cannot be edited."
            containerStyle={{ marginBottom: 0 }}
          />
        </Card>

        {/* Action Buttons - use ActionFooter import */}
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
    </ScreenLayout>
  );
};

export default ProfileEditScreen;
