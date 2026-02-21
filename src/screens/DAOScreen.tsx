import React, { useState } from 'react';
import { View } from 'react-native';
import {
  Card,
  Text,
  Button,
  LoadingView,
  Column,
  StatBox,
  ScreenLayout,
  HeaderBar,
  SideDrawer,
  DrawerItem,
  Badge,
  Row,
} from '../components';
import { useAsyncData } from '../hooks';
import { useDAOStats, formatTreasury } from '../hooks/useDAOStats';
import { useTranslation } from '../i18n';
import MockDataService from '../services/MockDataService';
import { colors, spacing, typography } from '../theme';

const DAOScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const daoStats = useDAOStats();

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

  const { data, loading } = useAsyncData(async () => {
    // TODO: Re-enable when API is ready
    // try {
    //   if (api && isInitialized) {
    //     // Fetch real DAO data from API
    //     const proposals = await api.getDaoProposals();
    //     const daoStats = await api.getDaoStats();
    //     return { proposals, daoStats };
    //   }
    // } catch (error) {
    //   console.warn('Failed to fetch DAO data, using mock:', error);
    // }

    // Fallback to mock data
    await new Promise<void>(resolve => setTimeout(() => resolve(), 600));
    return {
      proposals: MockDataService.getProposals(),
      daoStats: MockDataService.getDAOStats(),
    };
  }, []);

  if (loading) {
    return <LoadingView />;
  }

  const proposals = data?.proposals || [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
      <HeaderBar
        onMenuPress={() => setDrawerVisible(true)}
        showHamburger={false}
      />

      <SideDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        items={drawerItems}
        title="Menu"
      />

      <ScreenLayout testID="dao-screen">
        {/* Coming Soon Banner */}
        <View
          style={{ paddingHorizontal: spacing.md, marginBottom: spacing.lg }}
        >
          <Row style={{ justifyContent: 'center', alignItems: 'center' }}>
            <Badge label="Coming Soon" variant="warning" />
          </Row>
          <Text
            style={{
              fontSize: typography.size.xs,
              color: colors.text_secondary,
              textAlign: 'center',
              marginTop: spacing.sm,
            }}
          >
            DAO governance features are under development
          </Text>
        </View>

        {/* DAO Statistics */}
        <View style={{ gap: spacing.lg, marginBottom: spacing.lg }}>
          <Text variant="h3" style={{ paddingHorizontal: spacing.md }}>
            {t.dao.statistics.title}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              gap: spacing.md,
              paddingHorizontal: spacing.xxs,
            }}
          >
            <StatBox
              label={t.dao.statistics.members}
              value={daoStats.members.toString()}
              style={{ flex: 1 }}
            />
            <StatBox
              label={t.dao.statistics.active}
              value={daoStats.activeProposals.toString()}
              style={{ flex: 1 }}
            />
            <StatBox
              label={t.dao.statistics.total}
              value={daoStats.totalProposals.toString()}
              style={{ flex: 1 }}
            />
          </View>
          <View style={{ paddingHorizontal: spacing.xxs }}>
            <StatBox
              label={t.dao.statistics.treasury}
              value={formatTreasury(daoStats.treasury)}
              style={{ width: '100%' }}
            />
          </View>
        </View>

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
                <Button variant="primary" onPress={() => {}} disabled>
                  {t.dao.governance.viewProposals}
                </Button>
              </Card>
            </View>

            {/* Welfare DAOs Section */}
            <View style={{ gap: spacing.md }}>
              <Text
                style={{
                  fontSize: typography.size.md,
                  fontWeight: typography.weight.semibold,
                  color: colors.text_secondary,
                }}
              >
                Welfare DAOs
              </Text>
              {[
                {
                  name: 'Food Hub',
                  desc: 'Community food security network',
                  url: 'food.dao.sov',
                },
                {
                  name: 'Health Hub',
                  desc: 'Decentralized healthcare access',
                  url: 'health.dao.sov',
                },
                {
                  name: 'Education Hub',
                  desc: 'Open learning resources',
                  url: 'edu.dao.sov',
                },
                {
                  name: 'Housing Hub',
                  desc: 'Affordable housing collective',
                  url: 'housing.dao.sov',
                },
                {
                  name: 'Energy Hub',
                  desc: 'Renewable energy sharing',
                  url: 'energy.dao.sov',
                },
              ].map(dao => (
                <Card
                  key={dao.url}
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
                    {dao.name}
                  </Text>
                  <Text
                    style={{
                      color: colors.text_secondary,
                      fontSize: typography.size.xs,
                      marginBottom: spacing.md,
                    }}
                  >
                    {dao.desc}
                  </Text>
                  <Button variant="secondary" onPress={() => {}} disabled>
                    Launch {dao.name}
                  </Button>
                  <Text
                    style={{
                      color: colors.text_tertiary,
                      fontSize: typography.size.xs,
                      marginTop: spacing.sm,
                    }}
                  >
                    {dao.url}
                  </Text>
                </Card>
              ))}
            </View>
          </Column>
        </Card>
      </ScreenLayout>
    </View>
  );
};

export default DAOScreen;
