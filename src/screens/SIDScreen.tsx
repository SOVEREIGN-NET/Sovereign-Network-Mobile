import React, { useMemo, useState } from 'react';
import {
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  Clipboard,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
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
import { useAuth, useAsyncData, useUserTokenBalances, useWalletList } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography, borderRadius } from '../theme';
import DomainRegistrationScreen from './DomainRegistrationScreen';
import appService, {
  WalletTransaction,
  WalletTransactionsResponse,
} from '../services/AppService';
import { QuicError } from '../types/api';
import { atomicToHuman } from '../utils/tokenUnits';

// Format large numbers with commas
const formatBalance = (balance: number): string => {
  return balance.toLocaleString('en-US', { maximumFractionDigits: 2 });
};

const shortMiddle = (value: string | null | undefined, head = 8, tail = 6) => {
  if (!value) return '-';
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
};

const formatTxValue = (value: number): string => {
  if (!Number.isFinite(value)) return '0';
  const abs = Math.abs(value);
  const looksAtomic = Number.isInteger(value) && abs >= 100_000;
  const normalized = looksAtomic ? atomicToHuman(value) : value;
  return normalized.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  });
};

const FIXED_TAB_PANEL_HEIGHT = 320;
const CORE_SYMBOLS = new Set(['SOV', 'UBI', 'SAVINGS']);

const SIDScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { currentIdentity, isLoading } = useAuth();
  const {
    wallets,
    walletByType,
    totalBalance,
    loading: walletsLoading,
    refresh,
  } = useWalletList();
  const {
    tokens,
    loading: tokensLoading,
    refresh: refreshTokens,
  } = useUserTokenBalances();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [activeWalletTab, setActiveWalletTab] = useState('Tokens');
  const [domainRegistrationModalVisible, setDomainRegistrationModalVisible] =
    useState(false);
  const [selectedActivityTx, setSelectedActivityTx] =
    useState<WalletTransaction | null>(null);

  const identityHex = useMemo(() => {
    const did = currentIdentity?.did;
    if (!did) return '';
    if (did.startsWith('did:zhtp:')) return did.substring('did:zhtp:'.length);
    return did;
  }, [currentIdentity?.did]);

  const customOwnedTokens = useMemo(
    () =>
      tokens.filter(token => {
        const symbol = (token.symbol || '').toUpperCase();
        const name = (token.name || '').toUpperCase();
        return !CORE_SYMBOLS.has(symbol) && !CORE_SYMBOLS.has(name);
      }),
    [tokens],
  );

  const {
    data: activityData,
    loading: activityLoading,
    retry: refreshActivity,
  } = useAsyncData<WalletTransactionsResponse>(
    async () => {
      if (!identityHex || identityHex.length !== 64) {
        return {
          identity_id: identityHex,
          total_transactions: 0,
          transactions: [],
          status: 'identity_not_found',
        };
      }
      try {
        const data = await appService.getWalletTransactions(identityHex);
        return {
          ...data,
          transactions: [...(data.transactions || [])].sort(
            (a, b) => (b.timestamp || 0) - (a.timestamp || 0),
          ),
        };
      } catch (error) {
        if (
          error instanceof QuicError &&
          error.status === 400 &&
          String(error.body || '').includes('Identity ID must be 32 bytes')
        ) {
          return {
            identity_id: identityHex,
            total_transactions: 0,
            transactions: [],
            status: 'identity_not_found',
          };
        }
        if (error instanceof QuicError && error.status === 404) {
          return {
            identity_id: identityHex,
            total_transactions: 0,
            transactions: [],
            status: 'identity_not_found',
          };
        }
        throw error;
      }
    },
    [identityHex],
    {
      identity_id: identityHex,
      total_transactions: 0,
      transactions: [],
    },
  );

  React.useEffect(() => {
    console.log('[SIDScreen] 💰 Wallet data updated:', {
      walletCount: wallets?.length || 0,
      totalBalance,
      loading: walletsLoading,
      wallets: wallets?.map(w => ({
        type: w.wallet_type,
        balance: w.total_balance,
      })),
    });
  }, [wallets, totalBalance, walletsLoading]);

  useFocusEffect(
    React.useCallback(() => {
      refresh();
      refreshTokens();
      refreshActivity();
    }, [refresh, refreshTokens, refreshActivity]),
  );

  // UBI data from identity
  const { data: ubiData } = useAsyncData(async () => {
    if (!currentIdentity?.did) {
      return null;
    }

    return {
      daily_amount: 33,
      monthly_amount: 1000,
      eligible: true,
      next_claim: null,
      total_earned: currentIdentity.ubiEarned || 0,
      claims_count: 0,
    };
  }, [currentIdentity?.did]);

  const drawerItems: DrawerItem[] = [
    {
      id: 'pouw',
      label: 'PoUW Rewards',
      icon: '',
      onPress: () => {
        navigation.navigate('PoUW');
      },
    },
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
    // Show loading while bootstrapping, or show sign-in CTA if no identity
    if (isLoading) {
      return <LoadingView />;
    }
    // Guest mode - show sign-in CTA
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
        <HeaderBar
          onMenuPress={() => setDrawerVisible(true)}
          onBalancePress={() => navigation.navigate('PoUW')}
        />

        <SideDrawer
          visible={drawerVisible}
          onClose={() => setDrawerVisible(false)}
          items={drawerItems}
          title="Menu"
        />

        <ScreenLayout paddingTop={spacing.md}>
          <View
            style={{
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
              paddingHorizontal: spacing.lg,
            }}
          >
            <Text style={{ fontSize: 48, marginBottom: spacing.md }}>🔐</Text>
            <Text
              style={{
                fontSize: typography.size.xl,
                fontWeight: typography.weight.semibold,
                color: colors.text_primary,
                marginBottom: spacing.sm,
                textAlign: 'center',
              }}
            >
              Sign in to access your wallet
            </Text>
            <Text
              style={{
                fontSize: typography.size.md,
                color: colors.text_secondary,
                marginBottom: spacing.xl,
                textAlign: 'center',
              }}
            >
              Create an identity to manage your wallets, domains, and more
            </Text>
            <TouchableOpacity
              style={{
                backgroundColor: colors.primary,
                paddingVertical: spacing.md,
                paddingHorizontal: spacing.xl,
                borderRadius: borderRadius.md,
                marginBottom: spacing.md,
              }}
              onPress={() => navigation.navigate('SignIn')}
            >
              <Text
                style={{
                  color: colors.text_primary,
                  fontSize: typography.size.md,
                  fontWeight: typography.weight.semibold,
                }}
              >
                Sign In
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                backgroundColor: 'transparent',
                paddingVertical: spacing.md,
                paddingHorizontal: spacing.xl,
                borderRadius: borderRadius.md,
                borderWidth: 1,
                borderColor: colors.primary,
              }}
              onPress={() => navigation.navigate('CreateIdentity')}
            >
              <Text
                style={{
                  color: colors.primary,
                  fontSize: typography.size.md,
                  fontWeight: typography.weight.medium,
                }}
              >
                Create Account
              </Text>
            </TouchableOpacity>
          </View>
        </ScreenLayout>
      </View>
    );
  }

  const selectedWallet = walletByType.primary ?? wallets[0] ?? null;

  const truncateId = (id: any) => {
    if (!id) return 'unknown';

    if (Array.isArray(id)) {
      const hexString = id
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
      return `${hexString.substring(0, 12)}...${hexString.substring(
        hexString.length - 12,
      )}`;
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
        onBalancePress={() => navigation.navigate('PoUW')}
      />

      <SideDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        items={drawerItems}
        title="Menu"
      />

      <ScreenLayout paddingTop={spacing.md}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          <Column gap="sm" style={{ paddingBottom: spacing.xl }}>
            {/* WALLET SECTION */}
            <View
              style={{
                paddingHorizontal: spacing.sm,
                marginBottom: spacing.sm,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
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
                  {/* Token create hidden for now */}
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
                    onPress={() => setDomainRegistrationModalVisible(true)}
                  >
                    <Text style={{ fontSize: typography.size.xl }}>🌐</Text>
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
                  <Text
                    style={{
                      fontSize: typography.size.xs,
                      color: colors.text_secondary,
                      marginBottom: spacing.md,
                    }}
                  >
                    WALLET ADDRESS (for SOV transfers)
                  </Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      marginBottom: spacing.lg,
                    }}
                  >
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ paddingRight: spacing.sm }}
                      style={{ flex: 1 }}
                    >
                      <Text
                        style={{
                          fontSize: typography.size.sm,
                          fontWeight: typography.weight.semibold,
                          color: selectedWallet?.id
                            ? colors.text_primary
                            : colors.text_tertiary,
                          letterSpacing: 0.5,
                          fontFamily: 'Courier',
                        }}
                      >
                        {selectedWallet?.id ? selectedWallet.id : '—'}
                      </Text>
                    </ScrollView>
                    {selectedWallet?.id && (
                      <TouchableOpacity
                        onPress={() => copyToClipboard(selectedWallet.id)}
                        style={{ marginLeft: spacing.sm }}
                      >
                        <Text
                          style={{
                            fontSize: typography.size.xs,
                            color: colors.primary,
                          }}
                        >
                          {t.wallet.actions.copy}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <Text
                    style={{
                      fontSize: typography.size.xs,
                      color: colors.text_secondary,
                      marginBottom: spacing.md,
                    }}
                  >
                    YOUR DID (for token transfers & sharing)
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ paddingRight: spacing.sm }}
                      style={{ flex: 1 }}
                    >
                      <Text
                        style={{
                          fontSize: typography.size.sm,
                          fontWeight: typography.weight.semibold,
                          color: colors.text_primary,
                          letterSpacing: 0.5,
                          fontFamily: 'Courier',
                        }}
                      >
                        {currentIdentity?.did || 'Loading...'}
                      </Text>
                    </ScrollView>
                    {currentIdentity?.did && (
                      <TouchableOpacity
                        onPress={() => copyToClipboard(currentIdentity.did)}
                        style={{ marginLeft: spacing.sm }}
                      >
                        <Text
                          style={{
                            fontSize: typography.size.xs,
                            color: colors.primary,
                          }}
                        >
                          {t.wallet.actions.copy}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {/* Balance Section */}
                <View
                  style={{
                    paddingHorizontal: spacing.lg,
                    paddingVertical: spacing.xs,
                    alignItems: 'center',
                  }}
                >
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
                    <Text
                      style={{
                        fontSize: typography.size.sm,
                        color: colors.text_secondary,
                      }}
                    >
                      {t.wallet.currency} (Total)
                    </Text>
                    {walletsLoading && (
                      <Text
                        style={{
                          fontSize: typography.size.xs,
                          color: colors.text_tertiary,
                        }}
                      >
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

            {/* Tabbed Wallet Content (fixed height, internal scroll) */}
            <View
              style={{
                marginHorizontal: spacing.sm,
                backgroundColor: colors.bg_darker,
                borderRadius: borderRadius.lg,
                borderWidth: 1,
                borderColor: colors.border,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  gap: spacing.md,
                  paddingHorizontal: spacing.md,
                  paddingTop: spacing.md,
                  paddingBottom: spacing.sm,
                }}
              >
                {[
                  { id: 'Tokens', label: t.wallet.tabs.tokens },
                  { id: 'NFTs', label: t.wallet.tabs.nfts },
                  { id: 'Activity', label: t.wallet.tabs.activity },
                ].map(tabItem => (
                  <TouchableOpacity
                    key={tabItem.id}
                    onPress={() => setActiveWalletTab(tabItem.id)}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      paddingVertical: spacing.sm,
                      borderRadius: borderRadius.base,
                      backgroundColor:
                        activeWalletTab === tabItem.id
                          ? colors.bg_medium
                          : 'transparent',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: typography.size.xs,
                        color:
                          activeWalletTab === tabItem.id
                            ? colors.primary
                            : colors.text_secondary,
                        fontWeight:
                          activeWalletTab === tabItem.id
                            ? typography.weight.semibold
                            : typography.weight.normal,
                      }}
                    >
                      {tabItem.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View
                style={{
                  height: FIXED_TAB_PANEL_HEIGHT,
                  paddingHorizontal: spacing.md,
                  paddingBottom: spacing.md,
                }}
              >
                {activeWalletTab === 'Tokens' && (
                  <>
                    {tokensLoading ? (
                      <View
                        style={{
                          flex: 1,
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ color: colors.text_secondary }}>
                          Loading tokens...
                        </Text>
                      </View>
                    ) : customOwnedTokens.length === 0 ? (
                      <View
                        style={{
                          flex: 1,
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ color: colors.text_secondary }}>
                          No tokens available
                        </Text>
                      </View>
                    ) : (
                      <ScrollView
                        style={{ flex: 1 }}
                        showsVerticalScrollIndicator
                        nestedScrollEnabled
                        contentContainerStyle={{ gap: spacing.sm }}
                      >
                        {customOwnedTokens.map(token => (
                          <Card key={token.token_id} style={{ marginHorizontal: 0 }}>
                            <View
                              style={{
                                paddingHorizontal: spacing.md,
                                paddingVertical: spacing.sm,
                              }}
                            >
                              <Row
                                style={{
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                }}
                              >
                                <View style={{ flex: 1, paddingRight: spacing.sm }}>
                                  <Text
                                    style={{
                                      fontSize: typography.size.base,
                                      fontWeight: typography.weight.semibold,
                                      color: colors.text_primary,
                                    }}
                                  >
                                    {token.symbol}
                                  </Text>
                                  <Text
                                    numberOfLines={1}
                                    style={{
                                      fontSize: typography.size.xs,
                                      color: colors.text_secondary,
                                    }}
                                  >
                                    {token.name || token.token_id}
                                  </Text>
                                </View>
                                <Text
                                  style={{
                                    fontSize: typography.size.base,
                                    fontWeight: typography.weight.bold,
                                    color: colors.text_primary,
                                  }}
                                >
                                  {formatBalance(token.balance)}
                                </Text>
                              </Row>
                            </View>
                          </Card>
                        ))}
                      </ScrollView>
                    )}
                  </>
                )}

                {activeWalletTab === 'NFTs' && (
                  <View
                    style={{
                      flex: 1,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: colors.text_secondary }}>
                      No NFTs available
                    </Text>
                  </View>
                )}

                {activeWalletTab === 'Activity' && (
                  <>
                    {activityLoading ? (
                      <View
                        style={{
                          flex: 1,
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ color: colors.text_secondary }}>
                          Loading activity...
                        </Text>
                      </View>
                    ) : !activityData?.transactions?.length ? (
                      <View
                        style={{
                          flex: 1,
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ color: colors.text_secondary }}>
                          No activity available
                        </Text>
                      </View>
                    ) : (
                      <ScrollView
                        style={{ flex: 1 }}
                        showsVerticalScrollIndicator
                        nestedScrollEnabled
                      >
                        {activityData.transactions.map((tx: WalletTransaction, index: number) => {
                          const isPending = tx.status === 'pending';
                          const statusBg = isPending
                            ? `${colors.warning}22`
                            : `${colors.success}22`;
                          const statusColor = isPending
                            ? colors.warning
                            : colors.success;
                          return (
                            <TouchableOpacity
                              key={tx.tx_hash}
                              activeOpacity={0.75}
                              onPress={() => setSelectedActivityTx(tx)}
                              style={{
                                backgroundColor:
                                  index % 2 === 0 ? colors.bg_darker : colors.bg_dark,
                                borderBottomWidth:
                                  index === activityData.transactions.length - 1 ? 0 : 1,
                                borderBottomColor: colors.border,
                              }}
                            >
                              <View
                                style={{
                                  paddingHorizontal: spacing.md,
                                  paddingVertical: spacing.sm,
                                  gap: spacing.xs,
                                }}
                              >
                                <Row
                                  style={{
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                  }}
                                >
                                  <Text
                                    style={{
                                      fontSize: typography.size.xs,
                                      fontWeight: typography.weight.semibold,
                                      color: colors.text_primary,
                                    }}
                                  >
                                    {tx.tx_type}
                                  </Text>
                                  <View
                                    style={{
                                      borderRadius: borderRadius.full,
                                      backgroundColor: statusBg,
                                      paddingHorizontal: 6,
                                      paddingVertical: 1,
                                    }}
                                  >
                                    <Text
                                      style={{
                                        fontSize: 10,
                                        color: statusColor,
                                        fontWeight: typography.weight.semibold,
                                      }}
                                    >
                                      {tx.status}
                                    </Text>
                                  </View>
                                </Row>
                                <Row
                                  style={{
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                  }}
                                >
                                  <Text
                                    style={{
                                      fontSize: 11,
                                      color: colors.text_secondary,
                                    }}
                                  >
                                    {new Date((tx.timestamp || 0) * 1000).toLocaleString()}
                                  </Text>
                                  <Text
                                    style={{
                                      fontSize: typography.size.xs,
                                      fontWeight: typography.weight.semibold,
                                      color: colors.text_primary,
                                    }}
                                  >
                                    {formatTxValue(Number(tx.amount || 0))}
                                  </Text>
                                </Row>
                                <Text
                                  style={{
                                    fontSize: 10,
                                    color: colors.text_secondary,
                                  }}
                                >
                                  Fee {formatTxValue(Number(tx.fee || 0))}
                                  {'  '}
                                  From {shortMiddle(tx.from_wallet)}
                                </Text>
                                <Text
                                  numberOfLines={1}
                                  style={{
                                    fontSize: 10,
                                    color: colors.text_tertiary,
                                    marginTop: 2,
                                  }}
                                >
                                  To {shortMiddle(tx.to_address)}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    )}
                  </>
                )}
              </View>
            </View>

            {/* UBI Status Card */}
            {ubiData && (
              <View style={{ paddingHorizontal: spacing.sm }}>
                <Card
                  style={{
                    marginHorizontal: 0,
                    backgroundColor: colors.success + '15',
                    borderWidth: 1,
                    borderColor: colors.success + '40',
                  }}
                >
                  <Column gap="xs">
                    <Row style={{ alignItems: 'center', gap: spacing.sm }}>
                      <Text style={{ fontSize: typography.size.xl }}>🌱</Text>
                      <Text
                        style={{
                          fontSize: typography.size.base,
                          fontWeight: typography.weight.bold,
                          color: colors.success,
                        }}
                      >
                        Universal Basic Income
                      </Text>
                    </Row>
                    <Row style={{ alignItems: 'center', gap: spacing.sm }}>
                      <Badge label="Coming soon" variant="info" size="sm" />
                      <Text
                        style={{
                          fontSize: typography.size.xs,
                          color: colors.text_secondary,
                        }}
                      >
                        Coming soon
                      </Text>
                    </Row>
                  </Column>

                  <View
                    style={{
                      marginTop: spacing.md,
                      backgroundColor: colors.bg_dark,
                      padding: spacing.sm,
                      borderRadius: borderRadius.sm,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: typography.size.xs,
                        color: colors.text_secondary,
                        lineHeight: 16,
                      }}
                    >
                      UBI is calculated as an equal per-citizen share of 45% of
                      all protocol transaction fees collected during the
                      distribution period.
                    </Text>
                  </View>
                </Card>
              </View>
            )}
          </Column>
        </ScrollView>
      </ScreenLayout>

      <Modal
        visible={domainRegistrationModalVisible}
        animationType="slide"
        presentationStyle="formSheet"
      >
        <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
          <DomainRegistrationScreen
            onClose={() => setDomainRegistrationModalVisible(false)}
          />
        </View>
      </Modal>

      <Modal
        visible={!!selectedActivityTx}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedActivityTx(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.45)',
            justifyContent: 'center',
            padding: spacing.md,
          }}
        >
          <View
            style={{
              backgroundColor: colors.bg_dark,
              borderRadius: borderRadius.lg,
              borderWidth: 1,
              borderColor: colors.border,
              padding: spacing.md,
              gap: spacing.sm,
            }}
          >
            <Text
              style={{
                fontSize: typography.size.lg,
                fontWeight: typography.weight.semibold,
                color: colors.text_primary,
              }}
            >
              Transaction Details
            </Text>
            <Text style={{ color: colors.text_secondary, fontSize: typography.size.xs }}>
              Type: {selectedActivityTx?.tx_type || '-'}
            </Text>
            <Text style={{ color: colors.text_secondary, fontSize: typography.size.xs }}>
              Status: {selectedActivityTx?.status || '-'}
            </Text>
            <Text style={{ color: colors.text_secondary, fontSize: typography.size.xs }}>
              Amount: {formatTxValue(Number(selectedActivityTx?.amount || 0))}
            </Text>
            <Text style={{ color: colors.text_secondary, fontSize: typography.size.xs }}>
              Fee: {formatTxValue(Number(selectedActivityTx?.fee || 0))}
            </Text>
            <Text style={{ color: colors.text_secondary, fontSize: typography.size.xs }}>
              From: {selectedActivityTx?.from_wallet || '-'}
            </Text>
            <Text style={{ color: colors.text_secondary, fontSize: typography.size.xs }}>
              To: {selectedActivityTx?.to_address || '-'}
            </Text>
            <Text
              selectable
              style={{
                color: colors.text_primary,
                fontSize: typography.size.xs,
                fontFamily: 'Courier',
              }}
            >
              Hash: {selectedActivityTx?.tx_hash || '-'}
            </Text>

            <Row style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: spacing.sm,
                  borderRadius: borderRadius.base,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: 'center',
                }}
                onPress={() => setSelectedActivityTx(null)}
              >
                <Text style={{ color: colors.text_secondary }}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: spacing.sm,
                  borderRadius: borderRadius.base,
                  backgroundColor: colors.primary,
                  alignItems: 'center',
                }}
                onPress={() => {
                  const hash = selectedActivityTx?.tx_hash;
                  setSelectedActivityTx(null);
                  if (!hash) return;
                  navigation.navigate('DashboardTab', {
                    screen: 'ExplorerSearch',
                    params: { query: hash },
                  });
                }}
              >
                <Text style={{ color: colors.bg_darkest, fontWeight: typography.weight.semibold }}>
                  Open in Explorer
                </Text>
              </TouchableOpacity>
            </Row>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default SIDScreen;
