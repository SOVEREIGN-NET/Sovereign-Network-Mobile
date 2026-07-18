import React, { useState, useEffect } from 'react';
import { View, Alert, TouchableOpacity } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import {
  Card,
  Text,
  Button,
  Column,
  Row,
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
  const { currentIdentity, updateProfile, isLoading, upgradeToPremium } = useAuth();

  const isPremium = currentIdentity?.tier === 'premium';
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

  const handleUploadImage = () => {
    if (!isPremium) {
      Alert.alert('Premium Feature', 'Custom image uploads are only available for Premium SID users.');
      return;
    }
    Alert.alert('Upload', 'Image picker would open here for Premium users.');
  };

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

        {/* Tier Status Card */}
        <Card style={{ backgroundColor: isPremium ? colors.bg_darker : colors.bg_dark }}>
          <Row justify="space-between" align="center">
            <Column>
              <Text style={{ fontSize: 12, color: colors.text_secondary, textTransform: 'uppercase', letterSpacing: 1 }}>Account Tier</Text>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: isPremium ? colors.primary : colors.text_primary, marginTop: 4 }}>
                {isPremium ? 'Premium SID' : 'Free SID'}
              </Text>
            </Column>
            {!isPremium && (
              <Button size="sm" variant="primary" onPress={() => navigation.navigate('Profile')}>
                Upgrade
              </Button>
            )}
            {isPremium && (
              <View style={{ backgroundColor: colors.primary + '22', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: colors.primary }}>
                <Text style={{ color: colors.primary, fontSize: 10, fontWeight: 'bold' }}>LIFETIME</Text>
              </View>
            )}
          </Row>
        </Card>

          {/* Avatar Selection */}
          <Card>
            <Row justify="space-between" align="center" style={{ marginBottom: spacing.md }}>
              <Text
                style={{
                  fontSize: typography.size.sm,
                  fontWeight: typography.weight.semibold,
                  color: colors.text_primary,
                }}
              >
                {t.identity.profile.selectAvatar}
              </Text>

              <TouchableOpacity onPress={handleUploadImage}>
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>
                  {isPremium ? 'Upload Photo' : 'Upload (Premium)'}
                </Text>
              </TouchableOpacity>
            </Row>

            <View
              style={{
                alignItems: 'center',
                paddingVertical: spacing.lg,
                backgroundColor: colors.bg_darker,
                borderRadius: borderRadius.base,
                marginBottom: spacing.md,
                borderWidth: isPremium ? 1 : 0,
                borderColor: colors.primary + '44',
                borderStyle: 'dashed',
              }}
            >
              <Text style={{ fontSize: typography.size['5xl'] }}>
                {selectedAvatar}
              </Text>
              {isPremium && <Text style={{ fontSize: 10, color: colors.text_tertiary, marginTop: spacing.sm }}>Premium: Custom Image Supported</Text>}
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
            helperText={isPremium ? "Your Premium SID allows a custom .sov domain." : "Display name cannot be edited. Upgrade to Premium for custom .sov names."}
            containerStyle={{ marginBottom: 0 }}
          />
          {isPremium && (
            <Row align="center" gap="xs" style={{ marginTop: spacing.sm, paddingLeft: spacing.xs }}>
              <Text style={{ fontSize: 12, color: colors.success }}>✓</Text>
              <Text style={{ fontSize: 12, color: colors.text_secondary }}>
                Linked to: <Text style={{ color: colors.primary, fontWeight: 'bold' }}>{currentIdentity.username}.sov</Text>
              </Text>
            </Row>
          )}
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
