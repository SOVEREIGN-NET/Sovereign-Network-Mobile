import React, { useMemo, useState } from 'react';
import { Alert, Clipboard, TouchableOpacity, View } from 'react-native';
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
  StakeDaoModal,
  StakeDaoTarget,
} from '../components';
import { useAsyncData, useWalletList, useAuth } from '../hooks';
import { useDAOStats, formatTreasury } from '../hooks/useDAOStats';
import { useTranslation } from '../i18n';
import MockDataService from '../services/MockDataService';
import daoService from '../services/DaoService';
import { colors, spacing, typography } from '../theme';
import { WELFARE_DAOS, type WelfareDaoId } from '../constants';

const DAOScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [stakeTarget, setStakeTarget] = useState<StakeDaoTarget | null>(null);
  const [stakeSubmitting, setStakeSubmitting] = useState(false);
  const { currentIdentity } = useAuth();
  const isLoggedIn = !!currentIdentity;
  const daoStats = useDAOStats();
  const { walletByType, wallets } = useWalletList();
  const primaryWalletId = useMemo(() => {
    const wallet = walletByType?.primary ?? wallets?.[0] ?? null;
    return wallet?.id || null;
  }, [walletByType, wallets]);

  const copyWallet = (address: string) => {
    Clipboard.setString(address);
    Alert.alert('Copied', 'Wallet address copied to clipboard');
  };

  const truncateAddress = (address: string) =>
    `${address.substring(0, 10)}...${address.substring(address.length - 10)}`;

  const openStakeModal = (dao: (typeof WELFARE_DAOS)[number]) => {
    setStakeTarget({
      id: dao.id,
      name: dao.name,
      desc: dao.desc,
      color: dao.color,
      symbol: dao.symbol,
    });
  };

  const closeStakeModal = () => setStakeTarget(null);

  const handleStakeSubmit = async (
    daoId: string,
    amount: number,
    lockBlocks: number,
  ) => {
    console.log('[DAOScreen] stake submit', { daoId, amount, lockBlocks });

    if (stakeSubmitting) return; // guard re-entry

    if (!primaryWalletId) {
      Alert.alert(
        'No wallet',
        'Your primary wallet could not be resolved. Please try again once the wallet list has loaded.',
      );
      return;
    }

    setStakeSubmitting(true);
    try {
      const result = await daoService.stakeDao(
        daoId as WelfareDaoId,
        amount,
        lockBlocks,
        primaryWalletId,
      );
      closeStakeModal();
      Alert.alert(
        'Stake accepted',
        `Tx ${result.tx_hash.substring(0, 12)}… accepted into mempool.`,
      );
    } catch (err: any) {
      console.error('[DAOScreen] stake failed', err);
      Alert.alert(
        'Stake failed',
        err?.message ?? 'Unknown error while submitting stake transaction.',
      );
    } finally {
      setStakeSubmitting(false);
    }
  };

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
        {/* DAO Statistics — compact summary card */}
        <Card
          style={{
            marginBottom: spacing.lg,
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.lg,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: colors.text_tertiary,
                  fontSize: typography.size.xs,
                  textTransform: 'uppercase',
                  letterSpacing: 0.8,
                  marginBottom: 2,
                }}
              >
                {t.dao.statistics.treasury}
              </Text>
              <Text
                style={{
                  color: colors.text_primary,
                  fontSize: typography.size.lg,
                  fontWeight: typography.weight.semibold,
                }}
                numberOfLines={1}
              >
                {formatTreasury(daoStats.treasury)}
              </Text>
            </View>

            <View
              style={{
                width: 1,
                height: 32,
                backgroundColor: colors.border_light,
                marginHorizontal: spacing.md,
              }}
            />

            <View style={{ alignItems: 'center', minWidth: 56 }}>
              <Text
                style={{
                  color: colors.text_primary,
                  fontSize: typography.size.lg,
                  fontWeight: typography.weight.semibold,
                }}
              >
                {daoStats.members.toString()}
              </Text>
              <Text
                style={{
                  color: colors.text_tertiary,
                  fontSize: typography.size.xs,
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                }}
              >
                {t.dao.statistics.members}
              </Text>
            </View>

            <View
              style={{
                width: 1,
                height: 32,
                backgroundColor: colors.border_light,
                marginHorizontal: spacing.md,
              }}
            />

            <View style={{ alignItems: 'center', minWidth: 56 }}>
              <Text
                style={{
                  color: colors.text_primary,
                  fontSize: typography.size.lg,
                  fontWeight: typography.weight.semibold,
                }}
              >
                {daoStats.activeProposals.toString()}
              </Text>
              <Text
                style={{
                  color: colors.text_tertiary,
                  fontSize: typography.size.xs,
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                }}
              >
                {t.dao.statistics.active}
              </Text>
            </View>
          </View>
        </Card>

        {/* Welfare DAOs */}
        <Card style={{ marginBottom: spacing.lg }}>
          <Text variant="h3" style={{ marginBottom: spacing.lg }}>
            Welfare DAOs
          </Text>
          <Column gap="md">
            {WELFARE_DAOS.map(dao => (
              <Card
                key={dao.url}
                style={{
                  backgroundColor: colors.bg_darker,
                  padding: spacing.lg,
                  borderWidth: 0.5,
                  borderColor: dao.color,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginBottom: spacing.sm,
                    gap: spacing.sm,
                  }}
                >
                  <Text
                    style={{
                      color: colors.text_primary,
                      fontWeight: typography.weight.semibold,
                      flexShrink: 1,
                    }}
                  >
                    {dao.name}
                  </Text>
                  <View
                    style={{
                      paddingHorizontal: spacing.sm,
                      paddingVertical: 2,
                      borderRadius: 999,
                      backgroundColor: `${dao.color}22`,
                      borderWidth: 1,
                      borderColor: dao.color,
                    }}
                  >
                    <Text
                      style={{
                        color: dao.color,
                        fontSize: typography.size.xs,
                        fontWeight: typography.weight.semibold,
                        letterSpacing: 0.5,
                        fontFamily: 'Courier',
                      }}
                    >
                      {dao.symbol}
                    </Text>
                  </View>
                </View>
                <Text
                  style={{
                    color: colors.text_secondary,
                    fontSize: typography.size.xs,
                    marginBottom: spacing.md,
                  }}
                >
                  {dao.desc}
                </Text>
                <Button
                  variant="secondary"
                  onPress={() =>
                    isLoggedIn
                      ? openStakeModal(dao)
                      : navigation.navigate('SignIn')
                  }
                >
                  {isLoggedIn ? `Launch ${dao.name}` : 'Sign in to stake'}
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
                <TouchableOpacity
                  onPress={() => copyWallet(dao.wallet)}
                  style={{ marginTop: spacing.xs }}
                >
                  <Text
                    style={{
                      color: colors.text_tertiary,
                      fontSize: typography.size.xs,
                      fontFamily: 'Courier',
                    }}
                  >
                    {truncateAddress(dao.wallet)}
                  </Text>
                </TouchableOpacity>
              </Card>
            ))}
          </Column>
        </Card>

        {/* Governance card hidden — will return when voting/proposal flow
            lands on-chain. Keep the imports/state around the section dead
            so re-enabling is a one-line toggle. */}
      </ScreenLayout>

      <StakeDaoModal
        visible={stakeTarget !== null}
        dao={stakeTarget}
        onClose={closeStakeModal}
        onSubmit={handleStakeSubmit}
      />
    </View>
  );
};

export default DAOScreen;
