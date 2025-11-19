/**
 * DashboardScreen
 * Merged browser and dashboard screen with:
 * - HeaderBar (hamburger menu, BLE button, connection status)
 * - Search bar for browsing
 * - Trending dApps, Tokens, and Bounties
 * - Network status and dashboard content
 */

import React, { useState } from 'react';
import { View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {
  Card,
  Text,
  Button,
  LoadingView,
  Column,
  Row,
  ScreenLayout,
  Badge,
  HeaderBar,
  SideDrawer,
  FormField,
  DrawerItem,
} from '../components';
import SShieldLogo from '../components/atoms/Logo';
import { useAsyncData, useApi } from '../hooks';
import { useTranslation } from '../i18n';
import MockDataService from '../services/MockDataService';
import { colors, spacing, typography, borderRadius, gradientAccents } from '../theme';

const DashboardScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { api, isInitialized } = useApi();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [urlInput, setUrlInput] = useState('zhtp://network.sovereign');

  const { data, loading } = useAsyncData(
    async () => {
      try {
        if (api && isInitialized) {
          // Fetch real network info from API
          const networkInfo = await api.getNetworkInfo();
          const daoStats = await api.getDaoStats();
          return {
            networkStatus: networkInfo,
            daoStats: daoStats,
          };
        }
      } catch (error) {
        // Silently fallback to mock data if API is unavailable
        // This is expected in development when node is not running
      }

      // Fallback to mock data
      await new Promise<void>(resolve => setTimeout(() => resolve(), 800));
      return {
        networkStatus: MockDataService.getNetworkStatus(),
        daoStats: MockDataService.getDAOStats(),
      };
    },
    [api, isInitialized],
  );

  if (loading && !data) {
    return <LoadingView message={t.dashboard.loadingMessage} />;
  }


  // Get sample data from translations
  const trendingDapps = t.dashboard.trendingDapps.items;
  const trendingTokens = t.dashboard.trendingTokens.items;
  const trendingBounties = t.dashboard.bounties.items;

  // Drawer menu items
  const drawerItems: DrawerItem[] = [
    {
      id: 'history',
      label: 'History',
      icon: '',
      onPress: () => {
        navigation.navigate('SIDTab', { screen: 'History' });
      },
    },
    {
      id: 'bookmarks',
      label: 'Bookmarks',
      icon: '',
      onPress: () => {
        navigation.navigate('SIDTab', { screen: 'Bookmarks' });
      },
    },
    {
      id: 'favorites',
      label: 'Favorites',
      icon: '',
      onPress: () => {
        navigation.navigate('SIDTab', { screen: 'Favorites' });
      },
    },
    {
      id: 'settings',
      label: 'App Settings',
      icon: '',
      onPress: () => {
        navigation.navigate('SIDTab', { screen: 'AppSettings' });
      },
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
      {/* Header Bar */}
      <HeaderBar
        onMenuPress={() => setDrawerVisible(true)}
        onBLEPress={() => {
          // TODO: Handle BLE connection
        }}
      />

      {/* Side Drawer */}
      <SideDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        items={drawerItems}
        title="Menu"
      />

      {/* Main Content */}
      <ScreenLayout
        testID="dashboard-screen"
        paddingTop={0}
        paddingBottom={0}
        contentContainerStyle={{ paddingBottom: 80 }}
      >
          {/* App Logo */}
          <View
            style={{
              alignItems: 'center',
              paddingTop: spacing.lg + 10,
              paddingBottom: spacing.xxs,
              shadowColor: gradientAccents.gradient_end,
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.25,
              shadowRadius: 10,
              elevation: 6,
            }}
          >
            <SShieldLogo size={100} />
            {/* Subtle accent line below logo */}
            <View style={{ height: 1, width: 120, marginTop: spacing.md, overflow: 'hidden' }}>
              <LinearGradient
                colors={[gradientAccents.gradient_start, gradientAccents.gradient_end]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ height: 1, opacity: 0.4 }}
              />
            </View>
          </View>

          {/* Search Bar */}
          <View style={{ paddingHorizontal: spacing.xxs, paddingTop: 0, paddingBottom: spacing.md }}>
            <FormField
              label=""
              placeholder="Search dApps, tokens..."
              value={urlInput}
              onChangeText={setUrlInput}
              containerStyle={{ marginBottom: 0 }}
            />
          </View>

        {/* Trending dApps */}
        <Card style={{ marginHorizontal: spacing.xxs, marginBottom: spacing.lg }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <Row style={{ alignItems: 'center', gap: spacing.sm }}>
              <Text
                style={{
                  fontSize: typography.size.lg,
                  fontWeight: typography.weight.bold,
                  color: colors.text_primary,
                }}
              >
                {t.dashboard.trendingDapps.title}
              </Text>
            </Row>
          </Row>

          <Column gap="sm" style={{ marginBottom: spacing.md }}>
            {trendingDapps.map((dapp) => (
              <View
                key={dapp.name}
                style={{
                  backgroundColor: colors.bg_darker,
                  padding: spacing.md,
                  borderRadius: borderRadius.sm,
                }}
              >
                <Row style={{ justifyContent: 'space-between' }}>
                  <Column gap="xs" style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: typography.size.sm,
                        fontWeight: typography.weight.semibold,
                        color: colors.text_primary,
                      }}
                    >
                      {dapp.name}
                    </Text>
                    <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary }}>
                      {dapp.desc}
                    </Text>
                  </Column>
                  <Badge label={`↑ ${dapp.change}`} variant="primary" />
                </Row>
              </View>
            ))}
          </Column>

          <Button variant="primary" onPress={() => {}}>
            {t.dashboard.trendingDapps.exploreAll}
          </Button>
        </Card>

        {/* Trending Tokens */}
        <Card style={{ marginHorizontal: spacing.xxs, marginBottom: spacing.lg }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <Row style={{ alignItems: 'center', gap: spacing.sm }}>
              <Text
                style={{
                  fontSize: typography.size.lg,
                  fontWeight: typography.weight.bold,
                  color: colors.text_primary,
                }}
              >
                {t.dashboard.trendingTokens.title}
              </Text>
            </Row>
          </Row>

          <Column gap="sm" style={{ marginBottom: spacing.md }}>
            {trendingTokens.map((token) => (
              <View
                key={token.symbol}
                style={{
                  backgroundColor: colors.bg_darker,
                  padding: spacing.md,
                  borderRadius: borderRadius.sm,
                }}
              >
                <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <Column gap="xs" style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: typography.size.sm,
                        fontWeight: typography.weight.semibold,
                        color: colors.text_primary,
                      }}
                    >
                      {token.symbol}
                    </Text>
                    <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary }}>
                      {token.name}
                    </Text>
                  </Column>
                  <Text
                    style={{
                      fontSize: typography.size.sm,
                      fontWeight: typography.weight.bold,
                      color: colors.primary,
                    }}
                  >
                    {token.price}
                  </Text>
                </Row>
              </View>
            ))}
          </Column>

          <Button variant="primary" onPress={() => {}}>
            {t.dashboard.trendingTokens.viewAll}
          </Button>
        </Card>

        {/* Trending Bounties */}
        <Card style={{ marginHorizontal: spacing.xxs, marginBottom: spacing.xl }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <Row style={{ alignItems: 'center', gap: spacing.sm }}>
              <Text
                style={{
                  fontSize: typography.size.lg,
                  fontWeight: typography.weight.bold,
                  color: colors.text_primary,
                }}
              >
                {t.dashboard.bounties.title}
              </Text>
            </Row>
          </Row>

          <Column gap="sm" style={{ marginBottom: spacing.md }}>
            {trendingBounties.map((bounty) => (
              <View
                key={bounty.title}
                style={{
                  backgroundColor: colors.bg_darker,
                  padding: spacing.md,
                  borderRadius: borderRadius.sm,
                }}
              >
                <Row style={{ justifyContent: 'space-between', marginBottom: spacing.xs }}>
                  <Text
                    style={{
                      fontSize: typography.size.sm,
                      fontWeight: typography.weight.semibold,
                      color: colors.text_primary,
                      flex: 1,
                    }}
                    numberOfLines={2}
                  >
                    {bounty.title}
                  </Text>
                  <Badge label={bounty.reward} variant="primary" />
                </Row>
                <Row style={{ justifyContent: 'space-between', gap: spacing.sm }}>
                  <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary }}>
                    ⏰ {bounty.daysLeft}d
                  </Text>
                  <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary }}>
                    👥 {bounty.contributors}
                  </Text>
                </Row>
              </View>
            ))}
          </Column>

          <Column gap="sm">
            <Button variant="secondary" onPress={() => {}}>
              {t.dashboard.bounties.submitBounty}
            </Button>
            <Button variant="primary" onPress={() => {}}>
              {t.dashboard.bounties.viewAll}
            </Button>
          </Column>
        </Card>
      </ScreenLayout>
    </View>
  );
};

export default DashboardScreen;
