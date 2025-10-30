import React from 'react';
import {
  Card,
  Text,
  Button,
  ProgressBar, DetailRow,
  LoadingView,
  Column,
  Row,
  ScreenLayout
} from '../components';
import { useAsyncData } from '../hooks';
import { useTranslation } from '../i18n';
import MockDataService from '../services/MockDataService';
import { spacing } from '../theme';

const DashboardScreen = ({ navigation }: any) => {
  const { t } = useTranslation();

  const { data, loading } = useAsyncData(
    async () => {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 800));
      return {
        networkStatus: MockDataService.getNetworkStatus(),
        daoStats: MockDataService.getDAOStats(),
      };
    },
    [],
  );

  if (loading) {
    return <LoadingView message={t.dashboard.loadingMessage} />;
  }

  const networkStatus = data?.networkStatus;

  return (
    <ScreenLayout testID="dashboard-screen">
      {/* Status Card */}
      <Card>
        <Text variant="h3">{t.dashboard.networkStatus.title}</Text>
        <DetailRow
          label={t.dashboard.networkStatus.label}
          value={networkStatus?.connected ? t.dashboard.networkStatus.connected : t.dashboard.networkStatus.offline}
        />
        <DetailRow label={t.dashboard.networkStatus.protocol} value={networkStatus?.protocol || ''} />
        <DetailRow label={t.dashboard.networkStatus.nodes} value={networkStatus?.nodeCount?.toString() || ''} />
        <Column gap="md" style={{ marginVertical: spacing.md }}>
          <Row gap="md">
            <Text variant="body" style={{ flex: 1 }}>
              {t.dashboard.networkStatus.meshHealth}
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
        <Text variant="h3">{t.dashboard.explore.title}</Text>
        <Column gap="md" style={{ marginTop: spacing.md }}>
          <Button
            variant="secondary"
            onPress={() => navigation.navigate('Identity')}
            style={{ marginBottom: spacing.xs }}
          >
            {t.dashboard.explore.manageIdentity}
          </Button>
          <Button
            variant="secondary"
            onPress={() => navigation.navigate('Wallet')}
            style={{ marginBottom: spacing.xs }}
          >
            {t.dashboard.explore.viewWallet}
          </Button>
          <Button
            variant="secondary"
            onPress={() => navigation.navigate('Browser')}
          >
           {t.dashboard.explore.web4Browser}
          </Button>
        </Column>
      </Card>

      {/* About Section */}
      <Card>
        <Text variant="caption" style={{ marginBottom: spacing.xs }}>
          {t.dashboard.about.title}
        </Text>
        <Text variant="small" style={{ marginBottom: spacing.xxs }}>
          {t.dashboard.about.description}
        </Text>
        <Text variant="small" style={{ marginBottom: spacing.xxs }}>
          {t.dashboard.about.version}
        </Text>
        <Text variant="small">
          {t.dashboard.about.disclaimer}
        </Text>
      </Card>
    </ScreenLayout>
  );
};

export default DashboardScreen;
