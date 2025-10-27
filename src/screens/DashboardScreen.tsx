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

const DashboardScreen = () => {
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
        padding: spacing.md,
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

      {/* DAO Stats Card */}
      <Card>
        <Text variant="h3">🏛️ DAO Statistics</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around' }}>
          <StatBox label="Members" value={daoStats?.totalMembers?.toString() || '0'} />
          <StatBox label="Active" value={daoStats?.activeProposals?.toString() || '0'} />
          <StatBox label="Total" value={daoStats?.totalProposals?.toString() || '0'} />
          <StatBox
            label="Treasury"
            value={(daoStats?.treasuryBalance || 0).toLocaleString()}
          />
        </View>
      </Card>

      {/* Quick Actions */}
      <Card>
        <Text variant="h3">⚡ Quick Actions</Text>
        <Button onPress={() => {}} style={{ marginBottom: spacing.sm }}>
          Send ZHTP
        </Button>
        <Button onPress={() => {}} style={{ marginBottom: spacing.sm }}>
          Claim UBI
        </Button>
        <Button onPress={() => {}} style={{ marginBottom: spacing.sm }}>
          Vote on Proposal
        </Button>
        <Button onPress={() => {}}>Create Proposal</Button>
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
