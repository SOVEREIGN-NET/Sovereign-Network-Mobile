import React from 'react';
import { ScrollView, View } from 'react-native';
import {
  Card,
  Text,
  Button,
  DetailRow,
  LoadingView,
  Column,
} from '../components';
import { useAsyncData, useAuth } from '../hooks';
import { useTranslation } from '../i18n';
import MockDataService from '../services/MockDataService';
import { colors, spacing, typography, borderRadius } from '../theme';

const IdentityScreen = () => {
  const { t } = useTranslation();
  const { signOut, isLoading: authLoading } = useAuth();

  const { data: identity, loading } = useAsyncData(
    async () => {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 500));
      return MockDataService.getIdentity();
    },
    [],
  );

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (loading) {
    return <LoadingView />;
  }

  return (
    <ScrollView
      style={{
        flex: 1,
        backgroundColor: colors.bg_dark,
        padding: spacing.lg,
      }}
    >
      <Card>
        <Text variant="h3" style={{ marginBottom: spacing.md }}>{t.identity.title}</Text>
        <View
          style={{
            alignItems: 'center',
            paddingVertical: spacing.lg,
            backgroundColor: colors.bg_darker,
            borderRadius: borderRadius.base,
          }}
        >
          <Text style={{ fontSize: typography.size['5xl'], marginBottom: spacing.sm }}>
            {identity?.avatar}
          </Text>
          <Text variant="h2" style={{ marginBottom: spacing.xs }}>
            {identity?.displayName}
          </Text>
          <Text variant="caption" style={{ color: colors.text_secondary }}>
            {identity?.did}
          </Text>
        </View>
      </Card>

      <Card>
        <Text variant="h3">{t.identity.details.title}</Text>
        <DetailRow label={t.identity.details.identityType} value={identity?.identityType || ''} />
        <DetailRow
          label={t.identity.details.citizenship}
          value={identity?.citizenship ? t.identity.details.verified : t.identity.details.notVerified}
        />
        <DetailRow
          label={t.identity.details.created}
          value={new Date(identity?.createdAt || '').toLocaleDateString()}
        />
      </Card>

      <Card>
        <Column gap="sm">
          <Button onPress={() => {}} variant="secondary">
            {t.identity.actions.createIdentity}
          </Button>
          <Button onPress={() => {}} variant="secondary">
            {t.identity.actions.backupIdentity}
          </Button>
          <Button onPress={() => {}} variant="secondary">
            {t.identity.actions.verifyBiometric}
          </Button>
        </Column>
      </Card>

      <Card>
        <Column gap="sm">
          <Button
            onPress={handleLogout}
            disabled={authLoading}
            variant="outline"
            style={{
              borderColor: colors.error,
            }}
          >
            {authLoading ? t.identity.logout.buttonLoading : t.identity.logout.button}
          </Button>
          <Text
            style={{
              fontSize: typography.size.xs,
              color: colors.text_tertiary,
              textAlign: 'center',
              marginTop: spacing.xs,
            }}
          >
            {t.identity.logout.hint}
          </Text>
        </Column>
      </Card>
    </ScrollView>
  );
};

export default IdentityScreen;
