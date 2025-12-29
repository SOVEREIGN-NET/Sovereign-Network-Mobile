import React, { useState } from 'react';
import { View, ScrollView } from 'react-native';
import {
  Card,
  Text,
  Column,
  ScreenLayout,
  HeaderBar,
  SideDrawer,
  DrawerItem,
  SectionLabel,
} from '../components';
import { useAuth } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography, borderRadius } from '../theme';

const FavoritesScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { currentIdentity } = useAuth();
  const [drawerVisible, setDrawerVisible] = useState(false);

  const drawerItems: DrawerItem[] = [
    {
      id: 'history',
      label: 'History',
      icon: '',
      onPress: () => {
        navigation.navigate('History');
        setDrawerVisible(false);
      },
    },
    {
      id: 'bookmarks',
      label: 'Bookmarks',
      icon: '',
      onPress: () => {
        navigation.navigate('Bookmarks');
        setDrawerVisible(false);
      },
    },
    {
      id: 'favorites',
      label: 'Favorites',
      icon: '',
      onPress: () => {
        navigation.navigate('Favorites');
        setDrawerVisible(false);
      },
    },
    {
      id: 'settings',
      label: 'App Settings',
      icon: '',
      onPress: () => {
        navigation.navigate('AppSettings');
        setDrawerVisible(false);
      },
    },
  ];

  const favoriteWallets = [
    {
      id: '1',
      name: 'Primary Wallet',
      address: 'did:zhtp:abc123...xyz',
      balance: '1,250.00',
    },
    {
      id: '2',
      name: 'Savings Wallet',
      address: 'did:zhtp:def456...uvw',
      balance: '5,000.00',
    },
  ];

  const favoriteDapps = [
    {
      id: '1',
      name: 'DeFi Hub',
      icon: '💰',
      description: 'Decentralized finance platform',
    },
    {
      id: '2',
      name: 'DAO Portal',
      icon: '🏛️',
      description: 'Community governance',
    },
    {
      id: '3',
      name: 'NFT Marketplace',
      icon: '🎨',
      description: 'Trade digital collectibles',
    },
  ];

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
            {/* Header */}
            <View style={{ paddingHorizontal: spacing.md }}>
              <Text
                style={{
                  fontSize: typography.size.lg,
                  fontWeight: typography.weight.semibold,
                  color: colors.text_primary,
                }}
              >
                {t.favorites.title}
              </Text>
            </View>

            {/* Favorite Wallets Section */}
            <View style={{ paddingHorizontal: spacing.md }}>
              <Card style={{ marginHorizontal: 0 }}>
                <SectionLabel>{t.favorites.wallets}</SectionLabel>
                <Column gap="sm">
                  {favoriteWallets.map((wallet) => (
                    <View
                      key={wallet.id}
                      style={{
                        paddingHorizontal: spacing.md,
                        paddingVertical: spacing.sm,
                        backgroundColor: colors.bg_darker,
                        borderRadius: borderRadius.base,
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs }}>
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
                            fontSize: typography.size.sm,
                            fontWeight: typography.weight.semibold,
                            color: colors.primary,
                          }}
                        >
                          {wallet.balance} SOV
                        </Text>
                      </View>
                      <Text
                        style={{
                          fontSize: typography.size.xs,
                          color: colors.text_secondary,
                        }}
                        numberOfLines={1}
                      >
                        {wallet.address}
                      </Text>
                    </View>
                  ))}
                </Column>
              </Card>
            </View>

            {/* Favorite dApps Section */}
            <View style={{ paddingHorizontal: spacing.md }}>
              <Card style={{ marginHorizontal: 0 }}>
                <SectionLabel>{t.favorites.dapps}</SectionLabel>
                <Column gap="sm">
                  {favoriteDapps.map((dapp) => (
                    <View
                      key={dapp.id}
                      style={{
                        paddingHorizontal: spacing.md,
                        paddingVertical: spacing.sm,
                        backgroundColor: colors.bg_darker,
                        borderRadius: borderRadius.base,
                        borderWidth: 1,
                        borderColor: colors.border,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: spacing.md,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: typography.size.lg,
                        }}
                      >
                        {dapp.icon}
                      </Text>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: typography.size.sm,
                            fontWeight: typography.weight.semibold,
                            color: colors.text_primary,
                            marginBottom: spacing.xs,
                          }}
                        >
                          {dapp.name}
                        </Text>
                        <Text
                          style={{
                            fontSize: typography.size.xs,
                            color: colors.text_secondary,
                          }}
                        >
                          {dapp.description}
                        </Text>
                      </View>
                    </View>
                  ))}
                </Column>
              </Card>
            </View>

            {/* Empty State for Contacts */}
            <View style={{ paddingHorizontal: spacing.md }}>
              <Card style={{ marginHorizontal: 0, alignItems: 'center', paddingVertical: spacing.lg }}>
                <Text
                  style={{
                    fontSize: typography.size.sm,
                    fontWeight: typography.weight.semibold,
                    color: colors.text_primary,
                    marginBottom: spacing.sm,
                  }}
                >
                  {t.favorites.contacts}
                </Text>
                <Text
                  style={{
                    fontSize: typography.size.xs,
                    color: colors.text_secondary,
                    textAlign: 'center',
                  }}
                >
                  {t.favorites.empty}
                </Text>
              </Card>
            </View>
          </Column>
        </ScrollView>
      </ScreenLayout>
    </View>
  );
};

export default FavoritesScreen;
