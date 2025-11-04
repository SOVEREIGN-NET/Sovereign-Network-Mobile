import React, { useState } from 'react';
import { View } from 'react-native';
import {
  Card,
  Text,
  Button,
  LoadingView,
  Column,
  StatBox, ScreenLayout,
  HeaderBar,
  SideDrawer,
  DrawerItem
} from '../components';
import { useAsyncData, useApi } from '../hooks';
import { useTranslation } from '../i18n';
import MockDataService from '../services/MockDataService';
import { colors, spacing, typography } from '../theme';

const DAOScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { api, isInitialized } = useApi();
  const [drawerVisible, setDrawerVisible] = useState(false);

  const drawerItems: DrawerItem[] = [
    {
      id: 'history',
      label: 'History',
      icon: '',
      onPress: () => {
        // TODO: Navigate to history
      },
    },
    {
      id: 'bookmarks',
      label: 'Bookmarks',
      icon: '',
      onPress: () => {
        // TODO: Navigate to bookmarks
      },
    },
    {
      id: 'favorites',
      label: 'Favorites',
      icon: '',
      onPress: () => {
        // TODO: Navigate to favorites
      },
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: '',
      onPress: () => {
        navigation.navigate('AppSettings');
      },
    },
  ];

  const { data, loading } = useAsyncData(
    async () => {
      try {
        if (api && isInitialized) {
          // Fetch real DAO data from API
          const proposals = await api.getDaoProposals();
          const daoStats = await api.getDaoStats();
          return { proposals, daoStats };
        }
      } catch (error) {
        console.warn('Failed to fetch DAO data, using mock:', error);
      }

      // Fallback to mock data
      await new Promise<void>(resolve => setTimeout(() => resolve(), 600));
      return {
        proposals: MockDataService.getProposals(),
        daoStats: MockDataService.getDAOStats(),
      };
    },
    [api, isInitialized],
  );

  if (loading) {
    return <LoadingView />;
  }

  const proposals = data?.proposals || [];
  const daoStats = data?.daoStats;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
      <HeaderBar
        onMenuPress={() => setDrawerVisible(true)}
        onBLEPress={() => {
          // TODO: Handle BLE connection
        }}
      />

      <SideDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        items={drawerItems}
        title="Menu"
      />

      <ScreenLayout testID="dao-screen">
      {/* DAO Statistics */}
      {daoStats && (
        <View style={{ gap: spacing.lg, marginBottom: spacing.lg }}>
          <Text variant="h3" style={{ paddingHorizontal: spacing.md }}>
            {t.dao.statistics.title}
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.xxs }}>
            <StatBox
              label={t.dao.statistics.members}
              value={daoStats.delegates?.toString() || '0'}
              style={{ flex: 1 }}
            />
            <StatBox
              label={t.dao.statistics.active}
              value={daoStats.activeProposals?.toString() || '0'}
              style={{ flex: 1 }}
            />
            <StatBox
              label={t.dao.statistics.total}
              value={daoStats.totalProposals?.toString() || '0'}
              style={{ flex: 1 }}
            />
          </View>
          <View style={{ paddingHorizontal: spacing.xxs }}>
            <StatBox
              label={t.dao.statistics.treasury}
              value={`${(daoStats.treasury || 0).toFixed(0)} ZHTP`}
              style={{ width: '100%' }}
            />
          </View>
        </View>
      )}

      {/* Governance & Native dApps */}
      <Card>
        <Text variant="h3" style={{ marginBottom: spacing.lg }}>
          {t.dao.governance.title}
        </Text>
        <Column gap="md">
          {/* Governance Section */}
          <View style={{ gap: spacing.md }}>
            <Text
              style={{
                fontSize: typography.size.md,
                fontWeight: typography.weight.semibold,
                color: colors.text_secondary,
              }}
            >
              {t.dao.governance.section}
            </Text>
            <Card
              style={{
                backgroundColor: colors.bg_darker,
                padding: spacing.lg,
              }}
            >
              <Text
                style={{
                  color: colors.text_primary,
                  fontWeight: typography.weight.semibold,
                  marginBottom: spacing.sm,
                }}
              >
                {t.dao.governance.activeProposals}
              </Text>
              <Text
                style={{
                  color: colors.text_secondary,
                  fontSize: typography.size.sm,
                  marginBottom: spacing.md,
                }}
              >
                {proposals.length > 0
                  ? `${proposals.length} proposals waiting for your vote`
                  : t.dao.governance.noProposals}
              </Text>
              <Button
                variant="primary"
                onPress={() => navigation?.navigate('ProposalDetail')}
              >
                {t.dao.governance.viewProposals}
              </Button>
            </Card>
          </View>

          {/* Native dApps Section */}
          <View style={{ gap: spacing.md }}>
            <Text
              style={{
                fontSize: typography.size.md,
                fontWeight: typography.weight.semibold,
                color: colors.text_secondary,
              }}
            >
              {t.dao.dapps.title}
            </Text>
            <Card
              style={{
                backgroundColor: colors.bg_darker,
                padding: spacing.lg,
              }}
            >
              <Text
                style={{
                  color: colors.text_primary,
                  fontWeight: typography.weight.semibold,
                  marginBottom: spacing.sm,
                }}
              >
                {t.dao.dapps.defiHub}
              </Text>
              <Text
                style={{
                  color: colors.text_secondary,
                  fontSize: typography.size.xs,
                  marginBottom: spacing.md,
                }}
              >
                {t.dao.dapps.defiHubDesc}
              </Text>
              <Button
                variant="secondary"
                onPress={() => {}}
              >
                {t.dao.dapps.defiHubAction}
              </Button>
            </Card>
            <Card
              style={{
                backgroundColor: colors.bg_darker,
                padding: spacing.lg,
              }}
            >
              <Text
                style={{
                  color: colors.text_primary,
                  fontWeight: typography.weight.semibold,
                  marginBottom: spacing.sm,
                }}
              >
                {t.dao.dapps.gameFi}
              </Text>
              <Text
                style={{
                  color: colors.text_secondary,
                  fontSize: typography.size.xs,
                  marginBottom: spacing.md,
                }}
              >
                {t.dao.dapps.gamefiDesc}
              </Text>
              <Button
                variant="secondary"
                onPress={() => {}}
              >
                {t.dao.dapps.gamefiAction}
              </Button>
            </Card>
            <Card
              style={{
                backgroundColor: colors.bg_darker,
                padding: spacing.lg,
              }}
            >
              <Text
                style={{
                  color: colors.text_primary,
                  fontWeight: typography.weight.semibold,
                  marginBottom: spacing.sm,
                }}
              >
                {t.dao.dapps.nftMarketplace}
              </Text>
              <Text
                style={{
                  color: colors.text_secondary,
                  fontSize: typography.size.xs,
                  marginBottom: spacing.md,
                }}
              >
                {t.dao.dapps.nftDesc}
              </Text>
              <Button
                variant="secondary"
                onPress={() => {}}
              >
                {t.dao.dapps.nftAction}
              </Button>
            </Card>
            <Card
              style={{
                backgroundColor: colors.bg_darker,
                padding: spacing.lg,
              }}
            >
              <Text
                style={{
                  color: colors.text_primary,
                  fontWeight: typography.weight.semibold,
                  marginBottom: spacing.sm,
                }}
              >
                {t.dao.dapps.socialGraph}
              </Text>
              <Text
                style={{
                  color: colors.text_secondary,
                  fontSize: typography.size.xs,
                  marginBottom: spacing.md,
                }}
              >
                {t.dao.dapps.socialDesc}
              </Text>
              <Button
                variant="secondary"
                onPress={() => {}}
              >
                {t.dao.dapps.socialAction}
              </Button>
            </Card>
          </View>
        </Column>
      </Card>
      </ScreenLayout>
    </View>
  );
};

export default DAOScreen;
