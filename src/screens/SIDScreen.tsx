import React, { useState } from 'react';
import { View, TouchableOpacity, ScrollView, Alert } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import {
  Card,
  Text,
  Button,
  LoadingView,
  Column,
  Row,
  ScreenLayout,
  HeaderBar,
  SideDrawer,
  DrawerItem,
  DetailRow,
  SectionLabel,
  Badge,
} from '../components';
import SShieldLogo from '../components/atoms/Logo';
import { useAuth, useApi, useAsyncData } from '../hooks';
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
  const { currentIdentity, signOut, isLoading } = useAuth();
  const { api, isInitialized } = useApi();
  const [loggingOut, setLoggingOut] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [activeWalletTab, setActiveWalletTab] = useState('Tokens');

  // Fetch wallet balances from API
  const { data: walletData, loading: walletsLoading } = useAsyncData(
    async () => {
      if (!api || !isInitialized || !currentIdentity?.did) {
        return null;
      }

      try {
        console.log('📊 SID: Fetching wallet data for:', currentIdentity.did);
        const walletList = await api.getWalletList(currentIdentity.did);
        console.log('💰 SID: Wallet list response:', walletList);

        // Transform API response to match expected format
        const wallets = (walletList.wallets || []).map((w: any) => ({
          id: w.wallet_id,
          name: `${w.wallet_type} Wallet`,
          wallet_type: w.wallet_type,
          balance: w.total_balance || 0,
        }));

        return {
          wallets,
          totalBalance: wallets.reduce((sum: number, w: any) => sum + (w.balance || 0), 0),
        };
      } catch (error) {
        console.warn('⚠️ SID: Failed to fetch wallet data:', error);
        // Fallback to identity wallets
        if (currentIdentity?.wallets) {
          const wallets = Object.entries(currentIdentity.wallets).map(([type, wallet]: [string, any]) => ({
            id: wallet?.id,
            name: `${type.charAt(0).toUpperCase() + type.slice(1)} Wallet`,
            wallet_type: type.charAt(0).toUpperCase() + type.slice(1),
            balance: wallet?.balance || 0,
          }));
          return {
            wallets,
            totalBalance: wallets.reduce((sum, w) => sum + w.balance, 0),
          };
        }
        return null;
      }
    },
    [api, isInitialized, currentIdentity?.did],
  );

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

        console.log('🌱 SID: UBI status:', statusResponse);
        console.log('🌱 SID: UBI history:', historyResponse);

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
        return {
          daily_amount: 33,
          monthly_amount: 1000,
          eligible: true,
          total_earned: currentIdentity.ubiEarned || 0,
          claims_count: 0,
        };
      }
    },
    [api, isInitialized, currentIdentity?.did],
  );

  // Fetch DAO/voting stats
  const { data: daoStats } = useAsyncData(
    async () => {
      if (!api || !isInitialized || !currentIdentity?.did) {
        return null;
      }

      try {
        const [voteHistory, daoInfo] = await Promise.all([
          api.request(`/api/v1/dao/vote/history/${currentIdentity.did}`).catch(() => null),
          api.getDaoStats().catch(() => null),
        ]);

        console.log('🗳️ SID: Vote history:', voteHistory);
        console.log('🗳️ SID: DAO stats:', daoInfo);

        return {
          voting_power: voteHistory?.voting_power || currentIdentity.votingPower || 1,
          votes_cast: voteHistory?.votes?.length || 0,
          proposals_created: voteHistory?.proposals_created || 0,
          reputation_score: voteHistory?.reputation_score || currentIdentity.daoMembership?.reputation || 0,
        };
      } catch (error) {
        console.warn('⚠️ SID: Failed to fetch DAO stats:', error);
        return {
          voting_power: currentIdentity.votingPower || 1,
          votes_cast: 0,
          proposals_created: 0,
          reputation_score: currentIdentity.daoMembership?.reputation || 0,
        };
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

  const handleLogout = () => {
    Alert.alert(
      t.identity.logout.confirmTitle,
      t.identity.logout.confirmMessage,
      [
        {
          text: t.identity.logout.cancel,
          style: 'cancel',
        },
        {
          text: t.identity.logout.confirm,
          style: 'destructive',
          onPress: () => {
            (async () => {
              setLoggingOut(true);
              try {
                await signOut();
              } catch (error) {
                console.error('Logout failed:', error);
                Alert.alert(t.identity.logout.errorTitle, t.identity.logout.errorMessage);
              } finally {
                setLoggingOut(false);
              }
            })();
          },
        },
      ]
    );
  };

  if (!currentIdentity || isLoading) {
    return <LoadingView />;
  }

  // Use API wallet data if available, otherwise fall back to identity wallets
  const wallets = walletData?.wallets || (currentIdentity.wallets
    ? Object.entries(currentIdentity.wallets).map(([type, wallet]: [string, any]) => ({
        id: wallet?.id,
        name: `${type.charAt(0).toUpperCase() + type.slice(1)} Wallet`,
        wallet_type: type.charAt(0).toUpperCase() + type.slice(1),
        balance: wallet?.balance || 0,
      }))
    : []);
  const selectedWallet = wallets[0] || null;
  const totalBalance = walletData?.totalBalance || wallets.reduce((sum: number, w: any) => sum + (w.balance || 0), 0);

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

  // Use API data with fallback to identity data
  const votingPower = daoStats?.voting_power || currentIdentity.votingPower || 1;
  const votingPowerFormatted = votingPower.toLocaleString();
  const ubiEarned = ubiData?.total_earned || currentIdentity.ubiEarned || 0;
  const ubiEarnedFormatted = ubiEarned.toFixed(2);
  const walletCount = wallets.length || (currentIdentity.wallets ? Object.keys(currentIdentity.wallets).length : 0);
  const votesCast = daoStats?.votes_cast || 0;
  const reputationScore = daoStats?.reputation_score || currentIdentity.daoMembership?.reputation || 0;
  const authLoading = isLoading || loggingOut;

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
                  <Text style={{ fontSize: typography.size['3xl'] }}>⚙️</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Wallet Address Card */}
            {selectedWallet && (
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
                      <TouchableOpacity onPress={() => selectedWallet?.id && copyToClipboard(selectedWallet.id)}>
                        <Text style={{ fontSize: typography.size.xs, color: colors.primary }}>{t.wallet.actions.copy}</Text>
                      </TouchableOpacity>
                    </View>
                    <Text
                      style={{
                        fontSize: typography.size.sm,
                        fontWeight: typography.weight.semibold,
                        color: colors.text_primary,
                        letterSpacing: 0.5,
                      }}
                      numberOfLines={1}
                    >
                      {truncateId(selectedWallet?.id)}
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
                    <Text style={{ fontSize: typography.size.sm, color: colors.text_secondary }}>
                      {t.wallet.currency} (Total)
                    </Text>
                    {walletsLoading && (
                      <Text style={{ fontSize: typography.size.xs, color: colors.text_tertiary, marginTop: spacing.xs }}>
                        Syncing...
                      </Text>
                    )}
                  </View>
                </Card>
              </View>
            )}

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

            {/* Wallet Tokens Tab */}
            {activeWalletTab === 'Tokens' && wallets.length > 0 && (
              <View style={{ paddingHorizontal: spacing.sm, marginBottom: spacing.xs }}>
                <Column gap="xs">
                  {wallets.map((wallet: any) => {
                    const display = WALLET_DISPLAY[wallet.wallet_type] || { icon: '💰', color: colors.primary, description: 'Wallet' };
                    return (
                      <TouchableOpacity
                        key={wallet.id || wallet.wallet_type}
                        activeOpacity={0.7}
                      >
                        <Card style={{ marginHorizontal: 0, borderLeftWidth: 3, borderLeftColor: display.color }}>
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
                                {wallet.name || `${wallet.wallet_type} Wallet`}
                              </Text>
                              <Text
                                style={{
                                  fontSize: typography.size.lg,
                                  fontWeight: typography.weight.bold,
                                  color: display.color,
                                }}
                              >
                                {formatBalance(wallet.balance || 0)}
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
                                ZHTP
                              </Text>
                            </Row>
                            {wallet.id && (
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
                        Daily ZHTP income deposited to your UBI wallet
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
                    </Row>
                  </View>
                </Card>
              </View>
            )}

            {/* IDENTITY SECTION */}
            <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.lg, marginHorizontal: spacing.sm }} />

            {/* Identity Card */}
            <View style={{ paddingHorizontal: spacing.sm }}>
              <Card style={{ marginHorizontal: 0 }}>
                <View
                  style={{
                    alignItems: 'center',
                    paddingVertical: spacing.lg,
                    backgroundColor: colors.bg_darker,
                    borderRadius: borderRadius.base,
                    marginBottom: spacing.md,
                  }}
                >
                  <Text style={{ fontSize: typography.size['5xl'], marginBottom: spacing.sm }}>
                    {currentIdentity.avatar || '👤'}
                  </Text>
                  <Text variant="h2" style={{ marginBottom: spacing.xs }}>
                    {currentIdentity.displayName}
                  </Text>
                  {currentIdentity.username && (
                    <Text style={{ fontSize: typography.size.sm, color: colors.primary, marginBottom: spacing.xs }}>
                      @{currentIdentity.username}
                    </Text>
                  )}
                  <TouchableOpacity onPress={() => currentIdentity.did && copyToClipboard(currentIdentity.did)}>
                    <Text variant="caption" style={{ color: colors.text_secondary, marginBottom: spacing.md }}>
                      {truncateId(currentIdentity.did)}
                    </Text>
                  </TouchableOpacity>
                  <Button
                    variant="secondary"
                    onPress={() => navigation?.navigate('ProfileEdit')}
                    disabled={authLoading}
                  >
                    {t.identity.actions.editProfile}
                  </Button>
                </View>

                {/* Identity Details */}
                <Column gap="sm">
                  <DetailRow
                    label="DID"
                    value={truncateId(currentIdentity.did)}
                  />
                  <DetailRow
                    label={t.identity.details.identityType}
                    value={currentIdentity.identityType || 'Citizen'}
                  />
                  <DetailRow
                    label={t.identity.details.citizenship}
                    value={currentIdentity.citizenship ? t.identity.details.verified : t.identity.details.notVerified}
                  />
                  <DetailRow
                    label={t.identity.details.created}
                    value={new Date(currentIdentity.createdAt || '').toLocaleDateString()}
                  />
                </Column>
              </Card>
            </View>

            {/* Stats Card */}
            <View style={{ paddingHorizontal: spacing.sm }}>
              <Card style={{ marginHorizontal: 0 }}>
                <SectionLabel>{t.identity.stats.title}</SectionLabel>
                <Column gap="sm">
                  <DetailRow
                    label={t.identity.stats.votingPower}
                    value={votingPowerFormatted}
                  />
                  <DetailRow
                    label="Votes Cast"
                    value={votesCast.toString()}
                  />
                  <DetailRow
                    label="Reputation Score"
                    value={reputationScore.toLocaleString()}
                  />
                  <DetailRow
                    label={t.identity.stats.ubiEarned}
                    value={`${ubiEarnedFormatted} ZHTP`}
                  />
                  <DetailRow
                    label={t.identity.stats.wallets}
                    value={walletCount.toString()}
                  />
                </Column>
              </Card>
            </View>

            {/* Actions Card */}
            <View style={{ paddingHorizontal: spacing.sm }}>
              <Card style={{ marginHorizontal: 0 }}>
                <Column gap="sm">
                  <Button
                    variant="secondary"
                    onPress={() => navigation?.navigate('IdentitySettings')}
                    disabled={authLoading}
                  >
                    {t.identity.actions.settings}
                  </Button>
                  <Button
                    variant="secondary"
                    onPress={() => navigation?.navigate('AppSettings')}
                    disabled={authLoading}
                  >
                    {t.identity.actions.appSettings}
                  </Button>
                  <Button
                    variant="secondary"
                    onPress={() => navigation?.navigate('BackupIdentity')}
                    disabled={authLoading}
                  >
                    {t.identity.actions.backupIdentity}
                  </Button>
                </Column>
              </Card>
            </View>

            {/* Sign Out Card */}
            <View style={{ paddingHorizontal: spacing.sm }}>
              <Card style={{ marginHorizontal: 0 }}>
                <Column gap="sm">
                  <Button
                    onPress={handleLogout}
                    disabled={authLoading}
                    variant="danger"
                  >
                    {authLoading ? t.identity.logout.buttonLoading : t.identity.logout.button}
                  </Button>
                  <Text
                    style={{
                      fontSize: typography.size.xs,
                      color: colors.text_tertiary,
                      textAlign: 'center',
                      marginTop: spacing.xs,
                    }}
                  >
                    {t.identity.logout.hint}
                  </Text>
                </Column>
              </Card>
            </View>
          </Column>
        </ScrollView>
      </ScreenLayout>
    </View>
  );
};

export default SIDScreen;
