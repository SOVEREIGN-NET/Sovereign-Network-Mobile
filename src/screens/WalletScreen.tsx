import React, { useState } from 'react';
import { View, TouchableOpacity, ScrollView, Alert, Clipboard } from 'react-native';
import {
  Card,
  Text, LoadingView,
  Column, ScreenLayout,
  HeaderBar,
  SideDrawer,
  DrawerItem,
} from '../components';
import SShieldLogo from '../components/atoms/Logo';
import { useAuth, useWalletList, useUserTokenBalances } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography, borderRadius } from '../theme';

const WalletScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { currentIdentity, isLoading } = useAuth();
  const { wallets, walletByType, loading: walletsLoading } = useWalletList();
  const { tokens, loading: tokensLoading } = useUserTokenBalances();
  const [activeTab, setActiveTab] = useState('Tokens');
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

  if (!currentIdentity || isLoading) {
    return <LoadingView />;
  }

  const selectedWallet = walletByType.primary ?? wallets[0] ?? null;
  const selectedWalletBalance = selectedWallet?.total_balance ?? 0;

  const truncateId = (id: any) => {
    if (!id) return 'unknown';

    // If it's a byte array, convert to hex string
    if (Array.isArray(id)) {
      const hexString = id.map(byte => byte.toString(16).padStart(2, '0')).join('');
      return `${hexString.substring(0, 12)}...${hexString.substring(hexString.length - 12)}`;
    }

    // If it's already a string
    if (typeof id === 'string' && id !== '') {
      return `${id.substring(0, 12)}...${id.substring(id.length - 12)}`;
    }

    return 'unknown';
  };

  const copyToClipboard = async (id: any) => {
    let textToCopy = '';
    if (Array.isArray(id)) {
      textToCopy = id.map(byte => byte.toString(16).padStart(2, '0')).join('');
    } else if (typeof id === 'string') {
      textToCopy = id;
    }

    if (textToCopy) {
      try {
        await Clipboard.setString(textToCopy);
        Alert.alert('Copied', `Wallet ID copied to clipboard:\n\n${textToCopy}`);
      } catch (error) {
        console.error('Failed to copy wallet ID:', error);
        Alert.alert('Error', 'Failed to copy wallet ID to clipboard');
      }
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
        <Column gap="lg" style={{ paddingBottom: spacing.xl }}>
          {/* Wallet Header */}
          <View style={{ paddingHorizontal: spacing.md }}>
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
                  {truncateId(selectedWallet?.id)} • {walletsLoading ? 'Syncing...' : t.wallet.details.notSynced}
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
            <View style={{ paddingHorizontal: spacing.md }}>
              <Card style={{ marginHorizontal: 0, overflow: 'hidden' }}>
                <View
                  style={{
                    borderTopWidth: 2,
                    borderTopColor: colors.primary,
                    paddingHorizontal: spacing.lg,
                    paddingVertical: spacing.sm,
                  }}
                >
                  <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary, marginBottom: spacing.md }}>
                    WALLET ADDRESS (for SOV transfers)
                  </Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
                    <Text
                      style={{
                        fontSize: typography.size.sm,
                        fontWeight: typography.weight.semibold,
                        color: colors.text_primary,
                        letterSpacing: 0.5,
                        flex: 1,
                      }}
                      numberOfLines={1}
                    >
                      {selectedWallet.id}
                    </Text>
                    {selectedWallet?.id && (
                      <TouchableOpacity onPress={() => {
                        copyToClipboard(selectedWallet.id);
                      }} style={{ marginLeft: spacing.sm }}>
                        <Text style={{ fontSize: typography.size.xs, color: colors.primary }}>{t.wallet.actions.copy}</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary, marginBottom: spacing.md }}>
                    YOUR DID (for token transfers & sharing)
                  </Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text
                      style={{
                        fontSize: typography.size.sm,
                        fontWeight: typography.weight.semibold,
                        color: colors.text_primary,
                        letterSpacing: 0.5,
                        flex: 1,
                      }}
                      numberOfLines={1}
                    >
                      {currentIdentity?.did || 'Loading...'}
                    </Text>
                    {currentIdentity?.did && (
                      <TouchableOpacity onPress={() => {
                        copyToClipboard(currentIdentity.did);
                      }} style={{ marginLeft: spacing.sm }}>
                        <Text style={{ fontSize: typography.size.xs, color: colors.primary }}>{t.wallet.actions.copy}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
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
                    {Math.floor(selectedWalletBalance).toLocaleString()}
                  </Text>
                  <Text style={{ fontSize: typography.size.sm, color: colors.text_secondary }}>
                    {t.wallet.currency}
                  </Text>
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

          {/* Tab Content */}
          {activeTab === 'Tokens' && (
            <View style={{ paddingHorizontal: spacing.md }}>
              <Column gap="md">
                {/* SOV Wallets Section */}
                {wallets.length > 0 && (
                  <>
                    <View>
                      <Text
                        style={{
                          fontSize: typography.size.sm,
                          fontWeight: typography.weight.semibold,
                          color: colors.text_secondary,
                          marginBottom: spacing.sm,
                        }}
                      >
                        WALLETS
                      </Text>
                      <Column gap="md">
                        {wallets.map((wallet) => (
                          <TouchableOpacity
                            key={wallet.id}
                            activeOpacity={0.7}
                          >
                            <Card style={{ marginHorizontal: 0 }}>
                              <View
                                style={{
                                  paddingHorizontal: spacing.md,
                                  paddingVertical: spacing.xs,
                                }}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.xxs }}>
                                  <View
                                    style={{
                                      width: 48,
                                      height: 48,
                                      borderRadius: borderRadius.full,
                                      backgroundColor: colors.primary,
                                      justifyContent: 'center',
                                      alignItems: 'center',
                                      overflow: 'hidden',
                                    }}
                                  >
                                    <SShieldLogo size={48} />
                                  </View>
                                  <View style={{ flex: 1 }}>
                                    <Text
                                      style={{
                                        fontSize: typography.size.sm,
                                        fontWeight: typography.weight.semibold,
                                        color: colors.text_primary,
                                      }}
                                    >
                                      {wallet.name}
                                    </Text>
                                    <Text
                                      style={{
                                        fontSize: typography.size.xs,
                                        color: colors.text_secondary,
                                        marginTop: spacing.xxs,
                                      }}
                                      numberOfLines={1}
                                    >
                                      {truncateId(wallet.id)}
                                    </Text>
                                    <TouchableOpacity onPress={() => wallet.id && copyToClipboard(wallet.id)}>
                                      <Text style={{ fontSize: typography.size.xs, color: colors.primary, marginTop: spacing.xxs }}>
                                        Copy
                                      </Text>
                                    </TouchableOpacity>
                                  </View>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                  <Text
                                    style={{
                                      fontSize: typography.size.lg,
                                      fontWeight: typography.weight.bold,
                                      color: colors.text_primary,
                                    }}
                                  >
                                    {Math.floor(wallet.total_balance).toLocaleString()} SOV
                                  </Text>
                                </View>
                              </View>
                            </Card>
                          </TouchableOpacity>
                        ))}
                      </Column>
                    </View>
                  </>
                )}

                {/* Custom Tokens Section */}
                {tokens.length > 0 && (
                  <>
                    <View>
                      <Text
                        style={{
                          fontSize: typography.size.sm,
                          fontWeight: typography.weight.semibold,
                          color: colors.text_secondary,
                          marginBottom: spacing.sm,
                        }}
                      >
                        TOKENS
                      </Text>
                      <Column gap="md">
                        {tokens.map((token) => (
                          <TouchableOpacity
                            key={token.token_id}
                            activeOpacity={0.7}
                          >
                            <Card style={{ marginHorizontal: 0 }}>
                              <View
                                style={{
                                  paddingHorizontal: spacing.md,
                                  paddingVertical: spacing.xs,
                                }}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.xxs }}>
                                  <View
                                    style={{
                                      width: 48,
                                      height: 48,
                                      borderRadius: borderRadius.full,
                                      backgroundColor: colors.bg_medium,
                                      justifyContent: 'center',
                                      alignItems: 'center',
                                      overflow: 'hidden',
                                      borderWidth: 2,
                                      borderColor: colors.primary,
                                    }}
                                  >
                                    <Text style={{ fontSize: typography.size.lg, fontWeight: typography.weight.bold }}>
                                      {token.symbol.substring(0, 2).toUpperCase()}
                                    </Text>
                                  </View>
                                  <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                                      <Text
                                        style={{
                                          fontSize: typography.size.sm,
                                          fontWeight: typography.weight.semibold,
                                          color: colors.text_primary,
                                        }}
                                      >
                                        {token.symbol}
                                      </Text>
                                      {token.isCreatedByUser && (
                                        <Text style={{ fontSize: typography.size.sm }}>⭐</Text>
                                      )}
                                    </View>
                                    <Text
                                      style={{
                                        fontSize: typography.size.xs,
                                        color: colors.text_secondary,
                                        marginTop: spacing.xxs,
                                      }}
                                      numberOfLines={1}
                                    >
                                      {token.token_id ? `${token.token_id.substring(0, 12)}...` : 'Unknown'}
                                    </Text>
                                  </View>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                  <Text
                                    style={{
                                      fontSize: typography.size.lg,
                                      fontWeight: typography.weight.bold,
                                      color: colors.text_primary,
                                    }}
                                  >
                                    {Math.floor(token.balance).toLocaleString()} {token.symbol}
                                  </Text>
                                </View>
                              </View>
                            </Card>
                          </TouchableOpacity>
                        ))}
                      </Column>
                    </View>
                  </>
                )}

                {/* Empty State */}
                {wallets.length === 0 && tokens.length === 0 && !walletsLoading && !tokensLoading && (
                  <Card>
                    <Column gap="md" style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
                      <Text style={{ fontSize: typography.size.lg, fontWeight: typography.weight.semibold, color: colors.text_primary }}>
                        No tokens yet
                      </Text>
                      <Text style={{ fontSize: typography.size.sm, color: colors.text_secondary }}>
                        Create or receive tokens to see them here
                      </Text>
                    </Column>
                  </Card>
                )}
              </Column>
            </View>
          )}

          {activeTab === 'NFTs' && (
            <View style={{ paddingHorizontal: spacing.md }}>
              <Card>
                <Column gap="md" style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
                  <Text style={{ fontSize: typography.size.lg, fontWeight: typography.weight.semibold, color: colors.text_primary }}>
                    {t.wallet.empty.nftTitle}
                  </Text>
                  <Text style={{ fontSize: typography.size.sm, color: colors.text_secondary }}>
                    {t.wallet.empty.nftDescription}
                  </Text>
                </Column>
              </Card>
            </View>
          )}

          {activeTab === 'Activity' && (
            <View style={{ paddingHorizontal: spacing.md }}>
              <Card>
                <Column gap="md" style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
                  <Text style={{ fontSize: typography.size.lg, fontWeight: typography.weight.semibold, color: colors.text_primary }}>
                    {t.wallet.empty.activityTitle}
                  </Text>
                  <Text style={{ fontSize: typography.size.sm, color: colors.text_secondary }}>
                    {t.wallet.empty.activityDescription}
                  </Text>
                </Column>
              </Card>
            </View>
          )}

          {/* Bottom Tab Bar */}
          <View
            style={{
              marginHorizontal: spacing.md,
              marginTop: spacing.lg,
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
                onPress={() => setActiveTab(tabItem.id)}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: spacing.md,
                  borderRadius: borderRadius.base,
                  backgroundColor: activeTab === tabItem.id ? colors.bg_medium : 'transparent',
                }}
              >
                <Text
                  style={{
                    fontSize: typography.size.xs,
                    color: activeTab === tabItem.id ? colors.primary : colors.text_secondary,
                    fontWeight: activeTab === tabItem.id ? typography.weight.semibold : typography.weight.normal,
                  }}
                >
                  {tabItem.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Column>
      </ScrollView>
      </ScreenLayout>
    </View>
  );
};

export default WalletScreen;
