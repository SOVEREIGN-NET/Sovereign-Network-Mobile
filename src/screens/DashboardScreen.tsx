import React from 'react';
import { ScrollView, View } from 'react-native';
import {
  Card,
  Text,
  Button,
  ProgressBar,
  StatBox,
  DetailRow,
  LoadingView,
  Column,
  Row,
} from '../components';
import { useAsyncData } from '../hooks';
import MockDataService from '../services/MockDataService';
import { colors, spacing } from '../theme';

const DashboardScreen = ({ navigation }: any) => {
  const { data, loading } = useAsyncData(
    async () => {
      await new Promise(resolve => setTimeout(resolve, 800));
      return {
        networkStatus: MockDataService.getNetworkStatus(),
        daoStats: MockDataService.getDAOStats(),
      };
    },
    [],
  );

  if (loading) {
    return <LoadingView message="Loading ZHTP Dashboard..." />;
  }

  const networkStatus = data?.networkStatus;
  const daoStats = data?.daoStats;

  return (
    <ScrollView
      style={{
        flex: 1,
        backgroundColor: colors.bg_dark,
        padding: spacing.lg,
      }}
    >
      {/* Status Card */}
      <Card>
        <Text variant="h3">🌐 Network Status</Text>
        <DetailRow
          label="Status:"
          value={networkStatus?.connected ? '🟢 Connected' : '🔴 Offline'}
        />
        <DetailRow label="Protocol:" value={networkStatus?.protocol || ''} />
        <DetailRow label="Nodes:" value={networkStatus?.nodeCount?.toString() || ''} />
        <Column gap="md" style={{ marginVertical: spacing.md }}>
          <Row gap="md">
            <Text variant="body" style={{ flex: 1 }}>
              Mesh Health:
            </Text>
            <ProgressBar
              percentage={networkStatus?.meshHealth || 0}
              showPercentage
              style={{ flex: 1 }}
            />
          </Row>
        </Column>
      </Card>

      {/* Explore More Card */}
      <Card>
        <Text variant="h3">🔍 Explore</Text>
        <Column gap="md" style={{ marginTop: spacing.md }}>
          <Button
            variant="secondary"
            onPress={() => navigation.navigate('Identity')}
            style={{ marginBottom: spacing.xs }}
          >
            👤 MANAGE IDENTITY
          </Button>
          <Button
            variant="secondary"
            onPress={() => navigation.navigate('Wallet')}
            style={{ marginBottom: spacing.xs }}
          >
            💼 VIEW WALLET
          </Button>
          <Button
            variant="secondary"
            onPress={() => navigation.navigate('Browser')}
          >
            🌐 WEB4 BROWSER
          </Button>
        </Column>
      </Card>

      {/* Quick Actions */}
      <Card>
        <Text variant="h3">⚡ Quick Actions</Text>
        <Button
          onPress={() => navigation.navigate('Wallet', { screen: 'SendTokens' })}
          style={{ marginBottom: spacing.sm }}
        >
          SEND ZHTP
        </Button>
        <Button
          onPress={() => navigation.navigate('Dashboard', { screen: 'ClaimUBI' })}
          style={{ marginBottom: spacing.sm }}
        >
          CLAIM UBI
        </Button>
        <Button
          onPress={() => navigation.navigate('DAO')}
          style={{ marginBottom: spacing.sm }}
        >
          VOTE ON PROPOSAL
        </Button>
        <Button onPress={() => {}}>CREATE PROPOSAL</Button>
      </Card>

      {/* About Section */}
      <Card>
        <Text variant="h3">ℹ️ About</Text>
        <Text variant="body" style={{ marginBottom: spacing.sm }}>
          ZHTP Web4 Mobile - Zero-Knowledge Hypertext Transfer Protocol
        </Text>
        <Text variant="body" style={{ marginBottom: spacing.sm }}>
          Version 1.0.0 (Demo Mode)
        </Text>
        <Text variant="body">
          This is a frontend demonstration. No blockchain operations are executed.
        </Text>
      </Card>
    </ScrollView>
  );
};

export default DashboardScreen;
