/**
 * DashboardScreen
 * Merged browser and dashboard screen with:
 * - HeaderBar (hamburger menu, BLE button, connection status)
 * - User wallet balances (Primary, UBI, Savings)
 * - UBI status and daily income
 * - Search bar for browsing
 * - Trending dApps, Tokens, and Bounties
 */

import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
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
import { useAsyncData, useApi, useAuth } from '../hooks';
import { useTranslation } from '../i18n';
import MockDataService from '../services/MockDataService';
import { colors, spacing, typography, borderRadius, gradientAccents } from '../theme';

// Wallet type info for display
const WALLET_DISPLAY = {
  Primary: { icon: '💳', color: colors.primary },
  UBI: { icon: '🌱', color: colors.success },
  Savings: { icon: '🏦', color: colors.warning },
};

// Format large numbers with commas
const formatBalance = (balance: number): string => {
  return balance.toLocaleString('en-US', { maximumFractionDigits: 2 });
};

const DashboardScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { api, isInitialized } = useApi();
  const { currentIdentity } = useAuth();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [urlInput, setUrlInput] = useState('zhtp://network.sovereign');

  // Fetch wallet balances and UBI status
  const { data: walletData, loading: walletsLoading } = useAsyncData(
    async () => {
      if (!api || !isInitialized || !currentIdentity?.did) {
        return null;
      }

      try {
        console.log('📊 Fetching wallet data for:', currentIdentity.did);
        const walletList = await api.getWalletList(currentIdentity.did);
        console.log('💰 Wallet list response:', walletList);
        return {
          wallets: walletList.wallets || [],
          totalBalance: walletList.wallets?.reduce((sum, w) => sum + (w.total_balance || 0), 0) || 0,
        };
      } catch (error) {
        console.warn('⚠️ Failed to fetch wallet data:', error);
        // Return data from identity if available
        if (currentIdentity?.wallets) {
          const wallets = [
            { wallet_type: 'Primary', total_balance: currentIdentity.wallets.primary?.balance || 5000, wallet_id: currentIdentity.wallets.primary?.id },
            { wallet_type: 'UBI', total_balance: currentIdentity.wallets.ubi?.balance || 0, wallet_id: currentIdentity.wallets.ubi?.id },
            { wallet_type: 'Savings', total_balance: currentIdentity.wallets.savings?.balance || 0, wallet_id: currentIdentity.wallets.savings?.id },
          ];
          return {
            wallets,
            totalBalance: wallets.reduce((sum, w) => sum + w.total_balance, 0),
          };
        }
        return null;
      }
    },
    [api, isInitialized, currentIdentity?.did],
  );

  // Fetch UBI status
  const { data: ubiData } = useAsyncData(
    async () => {
      if (!api || !isInitialized || !currentIdentity?.did) {
        return null;
      }

      try {
        // Try to get UBI status from API
        const response = await api.request(`/api/v1/ubi/status/${currentIdentity.did}`);
        console.log('🌱 UBI status:', response);
        return response;
      } catch (error) {
        console.warn('⚠️ Failed to fetch UBI status:', error);
        // Return default UBI info for citizens
        return {
          daily_amount: 33,
          monthly_amount: 1000,
          eligible: true,
          next_claim: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        };
      }
    },
    [api, isInitialized, currentIdentity?.did],
  );

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

          {/* Wallet Balances Card */}
          {currentIdentity && (
            <Card style={{ marginHorizontal: spacing.xxs, marginBottom: spacing.md }}>
              {/* Total Balance Header */}
              <Pressable onPress={() => navigation.navigate('WalletTab')}>
                <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
                  <Column gap="xs">
                    <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary }}>
                      Total Balance
                    </Text>
                    <Text style={{ fontSize: typography.size['2xl'], fontWeight: typography.weight.bold, color: colors.text_primary }}>
                      {formatBalance(walletData?.totalBalance || 0)} ZHTP
                    </Text>
                  </Column>
                  <Badge label="Citizen" variant="success" />
                </Row>
              </Pressable>

              {/* Individual Wallets */}
              <Column gap="sm">
                {(walletData?.wallets || []).map((wallet: any) => {
                  const display = WALLET_DISPLAY[wallet.wallet_type as keyof typeof WALLET_DISPLAY] || { icon: '💰', color: colors.primary };
                  return (
                    <Pressable
                      key={wallet.wallet_id || wallet.wallet_type}
                      onPress={() => navigation.navigate('WalletTab')}
                      style={({ pressed }) => [
                        {
                          backgroundColor: colors.bg_darker,
                          padding: spacing.sm,
                          borderRadius: borderRadius.sm,
                          opacity: pressed ? 0.8 : 1,
                        },
                      ]}
                    >
                      <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                        <Column gap="xxs">
                          <Text style={{ fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text_primary }}>
                            {wallet.wallet_type} Wallet
                          </Text>
                          {wallet.wallet_type === 'Primary' && (
                            <Text style={{ fontSize: typography.size.xs, color: colors.success }}>
                              Welcome Bonus
                            </Text>
                          )}
                        </Column>
                        <Text style={{ fontSize: typography.size.base, fontWeight: typography.weight.bold, color: display.color }}>
                          {formatBalance(wallet.total_balance || 0)}
                        </Text>
                      </Row>
                    </Pressable>
                  );
                })}
              </Column>

              {walletsLoading && (
                <Text style={{ fontSize: typography.size.xs, color: colors.text_tertiary, textAlign: 'center', marginTop: spacing.sm }}>
                  Loading wallets...
                </Text>
              )}
            </Card>
          )}

          {/* UBI Status Card */}
          {currentIdentity && ubiData && (
            <Card style={{ marginHorizontal: spacing.xxs, marginBottom: spacing.md, backgroundColor: colors.success + '15', borderWidth: 1, borderColor: colors.success + '40' }}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Column gap="xs" style={{ flex: 1 }}>
                  <Row style={{ alignItems: 'center', gap: spacing.sm }}>
                    <Text style={{ fontSize: typography.size.xl }}>🌱</Text>
                    <Text style={{ fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.success }}>
                      Universal Basic Income
                    </Text>
                  </Row>
                  <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary, marginTop: spacing.xs }}>
                    As a citizen, you receive daily ZHTP income automatically deposited to your UBI wallet.
                  </Text>
                </Column>
              </Row>

              <View style={{ marginTop: spacing.md, backgroundColor: colors.bg_dark, padding: spacing.sm, borderRadius: borderRadius.sm }}>
                <Row style={{ justifyContent: 'space-around' }}>
                  <Column style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: colors.success }}>
                      {ubiData.daily_amount || 33}
                    </Text>
                    <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary }}>
                      ZHTP/day
                    </Text>
                  </Column>
                  <View style={{ width: 1, backgroundColor: colors.border }} />
                  <Column style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: colors.success }}>
                      {ubiData.monthly_amount || 1000}
                    </Text>
                    <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary }}>
                      ZHTP/month
                    </Text>
                  </Column>
                  <View style={{ width: 1, backgroundColor: colors.border }} />
                  <Column style={{ alignItems: 'center' }}>
                    <Badge label={ubiData.eligible !== false ? 'Eligible' : 'Pending'} variant={ubiData.eligible !== false ? 'success' : 'warning'} />
                  </Column>
                </Row>
              </View>
            </Card>
          )}

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
        <Card style={{ marginHorizontal: spacing.xxs, marginBottom: spacing.lg, opacity: 0.6 }}>
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
            <Badge label="Coming Soon" variant="warning" />
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
        <Card style={{ marginHorizontal: spacing.xxs, marginBottom: spacing.lg, opacity: 0.6 }}>
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
            <Badge label="Coming Soon" variant="warning" />
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
        <Card style={{ marginHorizontal: spacing.xxs, marginBottom: spacing.xl, opacity: 0.6 }}>
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
            <Badge label="Coming Soon" variant="warning" />
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
