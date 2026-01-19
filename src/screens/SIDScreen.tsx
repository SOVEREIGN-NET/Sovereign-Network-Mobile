import React, { useState } from 'react';
import { View, TouchableOpacity, ScrollView, Alert } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import {
  Card,
  Text,
  LoadingView,
  Column,
  Row,
  ScreenLayout,
  HeaderBar,
  SideDrawer,
  DrawerItem,
  Badge,
} from '../components';
import { useAuth, useApi, useAsyncData, useWalletList } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography, borderRadius } from '../theme';

// Wallet type info for display
const WALLET_DISPLAY: Record<string, { icon: string; color: string; description: string }> = {
  Primary: { icon: '💳', color: colors.primary, description: 'Main spending wallet' },
  primary: { icon: '💳', color: colors.primary, description: 'Main spending wallet' },
  UBI: { icon: '🌱', color: colors.success, description: 'Universal Basic Income' },
  ubi: { icon: '🌱', color: colors.success, description: 'Universal Basic Income' },
  Savings: { icon: '🏦', color: colors.warning, description: 'Long-term savings' },
  savings: { icon: '🏦', color: colors.warning, description: 'Long-term savings' },
};

// Format large numbers with commas
const formatBalance = (balance: number): string => {
  return balance.toLocaleString('en-US', { maximumFractionDigits: 2 });
};

const SIDScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { currentIdentity, isLoading } = useAuth();
  const { api, isInitialized } = useApi();
  const { wallets, walletByType, totalBalance, loading: walletsLoading } = useWalletList();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [activeWalletTab, setActiveWalletTab] = useState('Tokens');

  // Fetch UBI status and history
  const { data: ubiData } = useAsyncData(
    async () => {
      if (!api || !isInitialized || !currentIdentity?.did) {
        return null;
      }

      try {
        // Fetch both status and history in parallel
        const [statusResponse, historyResponse] = await Promise.all([
          api.request(`/api/v1/ubi/status/${currentIdentity.did}`).catch(() => null),
          api.request(`/api/v1/ubi/history/${currentIdentity.did}`).catch(() => null),
        ]);

        // console.log('🌱 SID: UBI status:', statusResponse);
        // console.log('🌱 SID: UBI history:', historyResponse);

        // Calculate total earned from history
        const totalEarned = historyResponse?.claims?.reduce((sum: number, claim: any) => sum + (claim.amount || 0), 0) || 0;

        return {
          daily_amount: statusResponse?.daily_amount || 33,
          monthly_amount: statusResponse?.monthly_amount || 1000,
          eligible: statusResponse?.eligible !== false,
          next_claim: statusResponse?.next_claim,
          total_earned: totalEarned || statusResponse?.total_earned || currentIdentity.ubiEarned || 0,
          claims_count: historyResponse?.claims?.length || 0,
        };
      } catch (error) {
        console.warn('⚠️ SID: Failed to fetch UBI data:', error);
        return null;
      }
    },
    [api, isInitialized, currentIdentity?.did],
  );

  const drawerItems: DrawerItem[] = [
    {
      id: 'history',
      label: 'History',
      icon: '',
      onPress: () => {
        navigation.navigate('History');
      },
    },
    {
      id: 'bookmarks',
      label: 'Bookmarks',
      icon: '',
      onPress: () => {
        navigation.navigate('Bookmarks');
      },
    },
    {
      id: 'favorites',
      label: 'Favorites',
      icon: '',
      onPress: () => {
        navigation.navigate('Favorites');
      },
    },
    {
      id: 'settings',
      label: 'App Settings',
      icon: '',
      onPress: () => {
        navigation.navigate('AppSettings');
      },
    },
  ];

  if (!currentIdentity || isLoading) {
    return <LoadingView />;
  }

  const selectedWallet = walletByType.primary ?? wallets[0] ?? null;

  const truncateId = (id: any) => {
    if (!id) return 'unknown';

    if (Array.isArray(id)) {
      const hexString = id.map(byte => byte.toString(16).padStart(2, '0')).join('');
      return `${hexString.substring(0, 12)}...${hexString.substring(hexString.length - 12)}`;
    }

    if (typeof id === 'string' && id !== '') {
      return `${id.substring(0, 12)}...${id.substring(id.length - 12)}`;
    }

    return 'unknown';
  };

  const copyToClipboard = (id: any) => {
    let textToCopy = '';
    if (Array.isArray(id)) {
      textToCopy = id.map(byte => byte.toString(16).padStart(2, '0')).join('');
    } else if (typeof id === 'string') {
      textToCopy = id;
    }

    if (textToCopy) {
      Clipboard.setString(textToCopy);
      Alert.alert('Copied', 'Wallet ID copied to clipboard');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
      <HeaderBar
        onMenuPress={() => setDrawerVisible(true)}
      />

      <SideDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        items={drawerItems}
        title="Menu"
      />

      <ScreenLayout paddingTop={spacing.md}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Column gap="sm" style={{ paddingBottom: spacing.xl }}>
            {/* WALLET SECTION */}
            <View style={{ paddingHorizontal: spacing.sm, marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View>
                  <Text
                    style={{
                      fontSize: typography.size.lg,
                      fontWeight: typography.weight.semibold,
                      color: colors.text_primary,
                    }}
                  >
                    {selectedWallet?.name || t.wallet.empty.defaultWallet}
                  </Text>
                  <Text
                    style={{
                      fontSize: typography.size.xs,
                      color: colors.text_secondary,
                      marginTop: spacing.xs,
                    }}
                    numberOfLines={1}
                  >
                    {truncateId(selectedWallet?.id)}
                  </Text>
                </View>
                <Row style={{ gap: spacing.sm }}>
                  <TouchableOpacity
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: borderRadius.full,
                      backgroundColor: colors.bg_darker,
                      justifyContent: 'center',
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                    onPress={() => navigation?.navigate('Profile')}
                  >
                    <Text style={{ fontSize: typography.size.xl }}>👤</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: borderRadius.full,
                      backgroundColor: colors.bg_darker,
                      justifyContent: 'center',
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                    onPress={() => navigation?.navigate('WalletSettings')}
                  >
                    <Text style={{ fontSize: typography.size.xl }}>⚙️</Text>
                  </TouchableOpacity>
                </Row>
              </View>
            </View>

            {/* Wallet Address Card - Always show, populate when data arrives */}
            <View style={{ paddingHorizontal: spacing.sm }}>
              <Card style={{ marginHorizontal: 0, overflow: 'hidden' }}>
                <View
                  style={{
                    borderTopWidth: 2,
                    borderTopColor: colors.primary,
                    paddingHorizontal: spacing.lg,
                    paddingVertical: spacing.sm,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
                    <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary }}>
                      {t.wallet.details.address}
                    </Text>
                    {selectedWallet?.id && (
                      <TouchableOpacity onPress={() => copyToClipboard(selectedWallet.id)}>
                        <Text style={{ fontSize: typography.size.xs, color: colors.primary }}>{t.wallet.actions.copy}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text
                    style={{
                      fontSize: typography.size.sm,
                      fontWeight: typography.weight.semibold,
                      color: selectedWallet?.id ? colors.text_primary : colors.text_tertiary,
                      letterSpacing: 0.5,
                    }}
                    numberOfLines={1}
                  >
                    {selectedWallet?.id ? truncateId(selectedWallet.id) : '—'}
                  </Text>
                </View>

                {/* Balance Section */}
                <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.xs, alignItems: 'center' }}>
                  <Text
                    style={{
                      fontSize: typography.size['5xl'],
                      fontWeight: typography.weight.bold,
                      color: colors.primary,
                      marginBottom: spacing.sm,
                    }}
                  >
                    {formatBalance(totalBalance)}
                  </Text>
                  <Row style={{ alignItems: 'center', gap: spacing.sm }}>
                    <Text style={{ fontSize: typography.size.sm, color: colors.text_secondary }}>
                      {t.wallet.currency} (Total)
                    </Text>
                    {walletsLoading && (
                      <Text style={{ fontSize: typography.size.xs, color: colors.text_tertiary }}>
                        Syncing...
                      </Text>
                    )}
                  </Row>
                </View>
              </Card>
            </View>

            {/* Send & Receive Buttons */}
            <View
              style={{
                paddingHorizontal: spacing.md,
                flexDirection: 'row',
                gap: spacing.md,
                marginBottom: spacing.md,
              }}
            >
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: spacing.lg,
                  borderRadius: borderRadius.base,
                  borderWidth: 2,
                  borderColor: '#006688',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
                onPress={() => navigation?.navigate('SendTokens')}
                disabled={isLoading}
              >
                <Text
                  style={{
                    fontSize: typography.size.md,
                    fontWeight: typography.weight.semibold,
                    color: colors.text_primary,
                  }}
                >
                  ↑ {t.wallet.actions.send}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: spacing.lg,
                  borderRadius: borderRadius.base,
                  borderWidth: 2,
                  borderColor: '#006688',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
                onPress={() => navigation?.navigate('ReceiveTokens')}
                disabled={isLoading}
              >
                <Text
                  style={{
                    fontSize: typography.size.md,
                    fontWeight: typography.weight.semibold,
                    color: colors.text_primary,
                  }}
                >
                  ↓ {t.wallet.actions.receive}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Wallet Tokens Tab - Always show skeleton, populate when data arrives */}
            {activeWalletTab === 'Tokens' && (
              <View style={{ paddingHorizontal: spacing.sm, marginBottom: spacing.xs }}>
                <Column gap="xs">
                  {(['Primary', 'UBI', 'Savings'] as const).map((walletType) => {
                    const display = WALLET_DISPLAY[walletType];
                    const wallet = wallets.find((w: any) =>
                      w.wallet_type === walletType || w.wallet_type?.toLowerCase() === walletType.toLowerCase()
                    );
                    const hasData = !!wallet;

                    return (
                      <TouchableOpacity
                        key={walletType}
                        activeOpacity={0.7}
                      >
                        <Card style={{ marginHorizontal: 0, opacity: hasData ? 1 : 0.6 }}>
                          <View
                            style={{
                              paddingHorizontal: spacing.md,
                              paddingVertical: spacing.sm,
                            }}
                          >
                            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                              <Text
                                style={{
                                  fontSize: typography.size.base,
                                  fontWeight: typography.weight.semibold,
                                  color: colors.text_primary,
                                }}
                              >
                                {walletType} Wallet
                              </Text>
                              <Text
                                style={{
                                  fontSize: typography.size.lg,
                                  fontWeight: typography.weight.bold,
                                  color: display.color,
                                }}
                              >
                    {hasData ? formatBalance(wallet.total_balance || 0) : '—'}
                              </Text>
                            </Row>
                            <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs }}>
                              <Text
                                style={{
                                  fontSize: typography.size.xs,
                                  color: colors.text_secondary,
                                }}
                              >
                                {display.description}
                              </Text>
                              <Text
                                style={{
                                  fontSize: typography.size.xs,
                                  color: colors.text_tertiary,
                                }}
                              >
                                SOV
                              </Text>
                            </Row>
                            {wallet?.id && (
                              <TouchableOpacity
                                onPress={() => copyToClipboard(wallet.id)}
                                style={{ marginTop: spacing.xs }}
                              >
                                <Text
                                  style={{
                                    fontSize: typography.size.xs,
                                    color: colors.text_tertiary,
                                  }}
                                  numberOfLines={1}
                                >
                                  {truncateId(wallet.id)}
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </Card>
                      </TouchableOpacity>
                    );
                  })}
                </Column>
              </View>
            )}

            {/* Wallet Bottom Tab Bar */}
            <View
              style={{
                marginHorizontal: spacing.sm,
                marginTop: 0,
                flexDirection: 'row',
                gap: spacing.md,
                backgroundColor: colors.bg_darker,
                borderRadius: borderRadius.lg,
                paddingVertical: spacing.md,
                paddingHorizontal: spacing.md,
              }}
            >
              {[
                { id: 'Tokens', label: t.wallet.tabs.tokens },
                { id: 'NFTs', label: t.wallet.tabs.nfts },
                { id: 'Activity', label: t.wallet.tabs.activity },
              ].map((tabItem) => (
                <TouchableOpacity
                  key={tabItem.id}
                  onPress={() => setActiveWalletTab(tabItem.id)}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    paddingVertical: spacing.md,
                    borderRadius: borderRadius.base,
                    backgroundColor: activeWalletTab === tabItem.id ? colors.bg_medium : 'transparent',
                  }}
                >
                  <Text
                    style={{
                      fontSize: typography.size.xs,
                      color: activeWalletTab === tabItem.id ? colors.primary : colors.text_secondary,
                      fontWeight: activeWalletTab === tabItem.id ? typography.weight.semibold : typography.weight.normal,
                    }}
                  >
                    {tabItem.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* UBI Status Card */}
            {ubiData && (
              <View style={{ paddingHorizontal: spacing.sm }}>
                <Card style={{ marginHorizontal: 0, backgroundColor: colors.success + '15', borderWidth: 1, borderColor: colors.success + '40' }}>
                  <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Column gap="xs" style={{ flex: 1 }}>
                      <Row style={{ alignItems: 'center', gap: spacing.sm }}>
                        <Text style={{ fontSize: typography.size.xl }}>🌱</Text>
                        <Text style={{ fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.success }}>
                          Universal Basic Income
                        </Text>
                      </Row>
                      <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary, marginTop: spacing.xs }}>
                        Daily SOV income deposited to your UBI wallet
                      </Text>
                    </Column>
                    <Badge label={ubiData.eligible !== false ? 'Active' : 'Pending'} variant={ubiData.eligible !== false ? 'success' : 'warning'} />
                  </Row>

                  <View style={{ marginTop: spacing.md, backgroundColor: colors.bg_dark, padding: spacing.sm, borderRadius: borderRadius.sm }}>
                    <Row style={{ justifyContent: 'space-around' }}>
                      <Column style={{ alignItems: 'center' }}>
                        <Text style={{ fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: colors.success }}>
                          {ubiData.daily_amount || 33}
                        </Text>
                        <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary }}>
                          SOV/day
                        </Text>
                      </Column>
                      <View style={{ width: 1, backgroundColor: colors.border }} />
                      <Column style={{ alignItems: 'center' }}>
                        <Text style={{ fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: colors.success }}>
                          {ubiData.monthly_amount || 1000}
                        </Text>
                        <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary }}>
                          SOV/month
                        </Text>
                      </Column>
                    </Row>
                  </View>
                </Card>
              </View>
            )}

          </Column>
        </ScrollView>
      </ScreenLayout>
    </View>
  );
};

export default SIDScreen;
