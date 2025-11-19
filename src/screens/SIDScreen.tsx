import React, { useState } from 'react';
import { View, TouchableOpacity, ScrollView, Clipboard, Alert } from 'react-native';
import {
  Card,
  Text,
  Button,
  LoadingView,
  Column,
  ScreenLayout,
  HeaderBar,
  SideDrawer,
  DrawerItem,
  DetailRow,
  SectionLabel,
} from '../components';
import SShieldLogo from '../components/atoms/Logo';
import { useAuth, useApi, useAsyncData } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography, borderRadius } from '../theme';

const SIDScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { currentIdentity, signOut, isLoading } = useAuth();
  const { api, isInitialized } = useApi();
  const [loggingOut, setLoggingOut] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [activeWalletTab, setActiveWalletTab] = useState('Tokens');

  // Fetch identity details from API when identity changes
  useAsyncData(
    async () => {
      try {
        if (api && isInitialized && currentIdentity) {
          const identity = await api.getIdentity(currentIdentity.did);
          return identity;
        }
      } catch (error) {
        console.warn('Failed to fetch identity details from API:', error);
      }
      return null;
    },
    [api, isInitialized, currentIdentity],
  );

  const drawerItems: DrawerItem[] = [
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

  const wallets = currentIdentity.wallets
    ? Object.values(currentIdentity.wallets)
    : [];
  const selectedWallet = wallets[0] || null;

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

  const votingPowerFormatted = currentIdentity.votingPower?.toLocaleString() || '0';
  const ubiEarnedFormatted = currentIdentity.ubiEarned?.toFixed(2) || '0.00';
  const walletCount = currentIdentity.wallets ? Object.keys(currentIdentity.wallets).length : 0;
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
          <Column gap="lg" style={{ paddingBottom: spacing.xl }}>
            {/* WALLET SECTION */}
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
                    {truncateId(selectedWallet?.id)} • {t.wallet.details.notSynced}
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
                      {selectedWallet.balance.toLocaleString()}
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

            {/* Wallet Tokens Tab */}
            {activeWalletTab === 'Tokens' && wallets.length > 0 && (
              <View style={{ paddingHorizontal: spacing.md }}>
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
                                {truncateId((wallet as any).id)}
                              </Text>
                              <TouchableOpacity onPress={() => (wallet as any).id && copyToClipboard((wallet as any).id)}>
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
                              {wallet.balance.toLocaleString()} ZHTP
                            </Text>
                          </View>
                        </View>
                      </Card>
                    </TouchableOpacity>
                  ))}
                </Column>
              </View>
            )}

            {/* Wallet Bottom Tab Bar */}
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

            {/* IDENTITY SECTION */}
            <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.lg, marginHorizontal: spacing.md }} />

            {/* Identity Card */}
            <View style={{ paddingHorizontal: spacing.md }}>
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
                  <Text variant="caption" style={{ color: colors.text_secondary, marginBottom: spacing.md }}>
                    {currentIdentity.did}
                  </Text>
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
                    label={t.identity.details.identityType}
                    value={currentIdentity.identityType || ''}
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
            <View style={{ paddingHorizontal: spacing.md }}>
              <Card style={{ marginHorizontal: 0 }}>
                <SectionLabel>{t.identity.stats.title}</SectionLabel>
                <Column gap="sm">
                  <DetailRow
                    label={t.identity.stats.votingPower}
                    value={votingPowerFormatted}
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
            <View style={{ paddingHorizontal: spacing.md }}>
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
            <View style={{ paddingHorizontal: spacing.md }}>
              <Card style={{ marginHorizontal: 0 }}>
                <Column gap="sm">
                  <Button
                    onPress={handleLogout}
                    disabled={authLoading}
                    variant="outline"
                    style={{
                      borderColor: colors.error,
                    }}
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
