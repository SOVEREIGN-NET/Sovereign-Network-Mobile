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
import MockDataService, { Identity } from '../services/MockDataService';
import { colors, spacing } from '../theme';

const IdentityScreen = () => {
  const { data: identity, loading } = useAsyncData(
    async () => {
      await new Promise(resolve => setTimeout(resolve, 500));
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
        <Text variant="h3">👤 ZK-DID Identity</Text>
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
        <Text variant="h3">Details</Text>
        <DetailRow label="Identity Type:" value={identity?.identityType || ''} />
        <DetailRow
          label="Citizenship:"
          value={identity?.citizenship ? '✓ Verified' : '✗ Not Verified'}
        />
        <DetailRow
          label="Created:"
          value={new Date(identity?.createdAt || '').toLocaleDateString()}
        />
      </Card>

      <Card>
        <Column gap="sm">
          <Button onPress={() => {}}>Create Identity</Button>
          <Button onPress={() => {}}>Backup Identity</Button>
          <Button onPress={() => {}}>Verify Biometric</Button>
        </Column>
      </Card>
    </ScrollView>
  );
};

export default IdentityScreen;
