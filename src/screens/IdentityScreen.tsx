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
import { useAsyncData } from '../hooks';
import { useTranslation } from '../i18n';
import MockDataService from '../services/MockDataService';
import { colors, spacing } from '../theme';

const IdentityScreen = () => {
  const { t } = useTranslation();

  const { data: identity, loading } = useAsyncData(
    async () => {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 500));
      return MockDataService.getIdentity();
    },
    [],
  );

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
            borderRadius: 8,
          }}
        >
          <Text style={{ fontSize: 48, marginBottom: spacing.sm }}>
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
          <Button onPress={() => {}}>
            {t.identity.actions.createIdentity}
          </Button>
          <Button onPress={() => {}}>
            {t.identity.actions.backupIdentity}
          </Button>
          <Button onPress={() => {}}>
            {t.identity.actions.verifyBiometric}
          </Button>
        </Column>
      </Card>
    </ScrollView>
  );
};

export default IdentityScreen;
