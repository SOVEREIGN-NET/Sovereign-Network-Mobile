import React, { useMemo, useState, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  Clipboard,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import {
  ArrowIcon,
  Card,
  Text,
  Button,
  LoadingView,
  ScreenLayout,
  HeaderBar,
  SideDrawer,
  DrawerItem,
  Badge,
  Skeleton,
  StakeDetailModal,
  StakeDaoModal,
  StakeDaoTarget,
  GuestEntryCard,
} from '../components';
import { Column } from '../components/atoms/Column/Column';
import { Row } from '../components/atoms/Row/Row';
import { Divider } from '../components/atoms/Divider/Divider';
import {
  useAuth,
  useAsyncData,
  useUserTokenBalances,
  useWalletList,
  useDaoStakes,
  useNodeConnectionStatus,
} from '../hooks';
import type { DaoStake } from '../hooks/useDaoStakes';
import { WELFARE_DAOS, type WelfareDaoId } from '../constants';
import { useTranslation } from '../i18n';
import { colors, spacing, typography, borderRadius } from '../theme';
import appService, {
  WalletTransaction,
  WalletTransactionsResponse,
} from '../services/AppService';
import daoService from '../services/DaoService';
import { QuicError } from '../types/api';
import { atomsToDisplayLocale, SOV_DECIMALS } from '../utils/tokenUnits';

// Format large numbers with commas
const formatBalance = (balance: number): string => {
  return balance.toLocaleString('en-US', { maximumFractionDigits: 2 });
};

const shortMiddle = (value: string | null | undefined, head = 8, tail = 6) => {
  if (!value) return '-';
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
};

/**
 * Format an atoms value for a tx row.
 *
 * `decimals` MUST come from the tx (or token metadata). The default of
 * `SOV_DECIMALS` is only a fallback for rows that don't carry decimals
 * yet — do not rely on it for non-SOV tokens.
 */
const formatTxValue = (
  value: unknown,
  decimals: number = SOV_DECIMALS,
): string => {
  if (value == null) return '0';
  const s = typeof value === 'number'
    ? (Number.isFinite(value) ? String(Math.trunc(value)) : '0')
    : String(value).trim();
  if (!/^\d+$/.test(s)) return '0';
  return atomsToDisplayLocale(s, decimals, 8);
};

/**
 * Resolve decimals for a given transaction row. Prefers, in order:
 *   1. `tx.decimals` from the backend (authoritative when present).
 *   2. Token decimals looked up by `tx.token_id` in a caller-provided map.
 *   3. The `SOV_DECIMALS` default — only reached for rows that don't tag
 *      themselves and aren't in the registry.
 */
const resolveTxDecimals = (
  tx: WalletTransaction,
  tokenDecimalsById?: Record<string, number>,
): number => {
  if (tx.decimals != null && Number.isFinite(tx.decimals)) {
    return tx.decimals;
  }
  if (tx.token_id && tokenDecimalsById) {
    const d = tokenDecimalsById[tx.token_id.toLowerCase()];
    if (d != null && Number.isFinite(d)) return d;
  }
  return SOV_DECIMALS;
};

const FIXED_TAB_PANEL_HEIGHT = 320;
const CORE_SYMBOLS = new Set(['SOV', 'UBS', 'SAVINGS']);

// ---------------------------------------------------------------------------
// WalletOptionsSheet: bottom-anchored settings list for the wallet card.
// Replaces the previous inline row of 3 icon buttons (domains/profile/settings)
// with a single gear button that opens this sheet.
// ---------------------------------------------------------------------------

interface WalletOptionsSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelectProfile: () => void;
  onSelectSettings: () => void;
}

interface WalletOptionRow {
  id: 'profile' | 'settings';
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
}

/** SVG icon: person / profile */
const ProfileIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="8" r="4" stroke={colors.text_primary} strokeWidth={1.5} />
    <Path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke={colors.text_primary} strokeWidth={1.5} strokeLinecap="round" />
  </Svg>
);

/** SVG icon: gear / settings */
const SettingsIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="3" stroke={colors.text_primary} strokeWidth={1.5} />
    <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" stroke={colors.text_primary} strokeWidth={1.5} />
  </Svg>
);

const WalletOptionsSheet = ({
  visible,
  onClose,
  onSelectProfile,
  onSelectSettings,
}: WalletOptionsSheetProps) => {
  const { t } = useTranslation();
  const sheet = t.sidScreen.walletOptionsSheet;
  const rows: WalletOptionRow[] = [
    {
      id: 'profile',
      icon: <ProfileIcon />,
      title: sheet.rows.profileTitle,
      subtitle: sheet.rows.profileSubtitle,
      onPress: onSelectProfile,
    },
    {
      id: 'settings',
      icon: <SettingsIcon />,
      title: sheet.rows.settingsTitle,
      subtitle: sheet.rows.settingsSubtitle,
      onPress: onSelectSettings,
    },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      {/* Dimmed backdrop — tap to dismiss. */}
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.55)',
          justifyContent: 'flex-end',
        }}
      >
        {/* Prevent taps inside the sheet from dismissing. */}
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => {}}
          style={{
            backgroundColor: colors.bg_darker,
            borderTopLeftRadius: borderRadius.lg,
            borderTopRightRadius: borderRadius.lg,
            borderTopWidth: 1,
            borderLeftWidth: 1,
            borderRightWidth: 1,
            borderColor: colors.border,
            paddingTop: spacing.sm,
            paddingBottom: spacing.xl,
          }}
        >
          {/* Grabber */}
          <View
            style={{
              alignSelf: 'center',
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.border,
              marginBottom: spacing.md,
            }}
          />

          {/* Header */}
          <View
            style={{
              paddingHorizontal: spacing.lg,
              paddingBottom: spacing.md,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <Text
              style={{
                fontSize: typography.size.lg,
                fontWeight: typography.weight.semibold,
                color: colors.text_primary,
              }}
            >
              {sheet.title}
            </Text>
            <Text
              style={{
                fontSize: typography.size.xs,
                color: colors.text_secondary,
                marginTop: spacing.xs,
              }}
            >
              {sheet.subtitle}
            </Text>
          </View>

          {/* Rows */}
          {rows.map((row, idx) => (
            <TouchableOpacity
              key={row.id}
              onPress={row.onPress}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
                borderBottomWidth: idx < rows.length - 1 ? 1 : 0,
                borderBottomColor: colors.border,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: borderRadius.full,
                  backgroundColor: colors.bg_darkest,
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginRight: spacing.md,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                {row.icon}
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: typography.size.base,
                    fontWeight: typography.weight.semibold,
                    color: colors.text_primary,
                  }}
                >
                  {row.title}
                </Text>
                <Text
                  style={{
                    fontSize: typography.size.xs,
                    color: colors.text_secondary,
                    marginTop: 2,
                  }}
                  numberOfLines={1}
                >
                  {row.subtitle}
                </Text>
              </View>
              <ArrowIcon
                direction="right"
                size={18}
                color={colors.text_tertiary}
                style={{ marginLeft: spacing.sm }}
              />
            </TouchableOpacity>
          ))}

          {/* Cancel */}
          <TouchableOpacity
            onPress={onClose}
            style={{
              marginTop: spacing.md,
              marginHorizontal: spacing.lg,
              paddingVertical: spacing.md,
              borderRadius: borderRadius.base,
              backgroundColor: colors.bg_darkest,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                fontSize: typography.size.md,
                fontWeight: typography.weight.semibold,
                color: colors.text_secondary,
              }}
            >
              {sheet.cancel}
            </Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const SIDScreen = ({ navigation, route }: any) => {
  const { t } = useTranslation();
  const { currentIdentity, isLoading } = useAuth();
  const [welcomeName, setWelcomeName] = React.useState<string | null>(null);

  React.useEffect(() => {
    const name = route?.params?.showWelcome;
    if (!name) return;
    setWelcomeName(name);
    const timer = setTimeout(() => setWelcomeName(null), 4000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { isConnected: nodeConnected } = useNodeConnectionStatus();
  const {
    wallets,
    walletByType,
    totalBalance,
    loading: walletsLoading,
    refresh,
  } = useWalletList();
  // Resolve the primary wallet ID early so per-wallet token balances can be
  // fetched against the same address format used elsewhere in the app.
  const primaryWalletId = useMemo(() => {
    const wallet = walletByType?.primary ?? wallets?.[0] ?? null;
    return wallet?.id || null;
  }, [walletByType, wallets]);
  const {
    tokens,
    loading: tokensLoading,
    refresh: refreshTokens,
  } = useUserTokenBalances(primaryWalletId);
  const [activeWalletTab, setActiveWalletTab] = useState('Activity');
  const [selectedStake, setSelectedStake] = useState<DaoStake | null>(null);
  const [stakeTarget, setStakeTarget] = useState<StakeDaoTarget | null>(null);
  const [stakeSubmitting, setStakeSubmitting] = useState(false);
  const daoStakes = useDaoStakes(primaryWalletId);
  const [activeBalanceCardIndex, setActiveBalanceCardIndex] = useState(0);
  const balanceScrollRef = useRef<ScrollView>(null);
  const [walletOptionsVisible, setWalletOptionsVisible] = useState(false);

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

  /**
   * token_id → decimals lookup built from the user's tokens. Used as a
   * fallback for WalletTransaction rows that don't carry their own
   * `decimals` field but do tag a `token_id`.
   */
  const tokenDecimalsById = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const t of tokens) {
      if (!t.token_id) continue;
      if (t.decimals != null && Number.isFinite(t.decimals)) {
        map[t.token_id.toLowerCase()] = t.decimals;
      }
    }
    return map;
  }, [tokens]);

  // Ordered balance cards for the swipeable wallet carousel:
  // SOV first, CBE second, then wallet-type cards (Savings, UBS),
  // then remaining tokens alphabetical. All shown even at zero balance.
  const balanceCards = useMemo(() => {
    const rank = (symbol: string) => {
      const s = symbol.toUpperCase();
      if (s === 'SOV') return 0;
      if (s === 'CBE') return 1;
      if (s === 'SAVINGS') return 3;
      return 2;
    };

    // Build wallet-type cards for Savings from the wallet list.
    const walletCards: typeof tokens = (wallets ?? [])
      .filter(w => {
        const t = (w.wallet_type || '').toLowerCase();
        return t === 'savings';
      })
      .map(w => ({
        token_id: `wallet:${w.id}`,
        symbol: w.wallet_type.toUpperCase(),
        name: w.name || 'Primary Wallet',
        decimals: null,
        balance: w.total_balance.toLocaleString('en-US', { maximumFractionDigits: 2 }),
        atomicBalance: '0',
      }));

    // Merge tokens + wallet cards, dedupe by symbol
    const seen = new Set<string>();
    const all = [...tokens, ...walletCards].filter(t => {
      const key = t.symbol.toUpperCase();
      if (seen.has(key)) return false;
      if (key === 'UBS') return false; // Remove UBS as requested
      seen.add(key);
      return true;
    });

    return all.sort((a, b) => {
      const ra = rank(a.symbol);
      const rb = rank(b.symbol);
      if (ra !== rb) return ra - rb;
      return (a.symbol || '').localeCompare(b.symbol || '');
    });
  }, [tokens, wallets]);

  const activeCardToken = balanceCards[activeBalanceCardIndex] ?? balanceCards[0] ?? null;

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

  const openStakeModal = (dao: (typeof WELFARE_DAOS)[number]) => {
    setStakeTarget({
      id: dao.id,
      name: dao.name,
      desc: dao.desc,
      color: dao.color,
      symbol: dao.symbol,
    });
  };

  const closeStakeModal = () => {
    setStakeTarget(null);
  };

  const handleStakeSubmit = async (daoId: string, amount: number, lockBlocks: number) => {
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
      refresh();
    } catch (err: any) {
      console.error('[SIDScreen] stake failed', err);
      Alert.alert(
        'Stake failed',
        err?.message ?? 'Unknown error while submitting stake transaction.',
      );
    } finally {
      setStakeSubmitting(false);
    }
  };

  if (!currentIdentity || isLoading) {
    // Show loading while bootstrapping, or show sign-in CTA if no identity
    if (isLoading) {
      return <LoadingView />;
    }
    // Guest mode - show sign-in CTA
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
        <HeaderBar />

        <ScreenLayout paddingTop={spacing.md} centerContent>
          <GuestEntryCard
            headline={t.sidScreen.guest.signInTitle}
            body={t.sidScreen.guest.signInBody}
            signInLabel={t.sidScreen.guest.signIn}
            createLabel={t.sidScreen.guest.createAccount}
            onSignIn={() => navigation.navigate('SignIn')}
            onCreate={() => navigation.navigate('CreateIdentity')}
            preview={
              <View
                style={{
                  width: '100%',
                  maxWidth: 340,
                  backgroundColor: colors.bg_darker,
                  borderRadius: borderRadius.lg,
                  borderWidth: 1,
                  borderColor: colors.border,
                  paddingVertical: spacing.lg,
                  paddingHorizontal: spacing.lg,
                  opacity: 0.55,
                }}
              >
                <Text
                  style={{
                    color: colors.text_tertiary,
                    fontSize: typography.size.xs,
                    letterSpacing: 1.5,
                    textTransform: 'uppercase',
                    marginBottom: spacing.xs,
                  }}
                >
                  Your wallet
                </Text>
                <Text
                  style={{
                    color: colors.text_primary,
                    fontSize: typography.size['2xl'],
                    fontWeight: typography.weight.bold,
                    letterSpacing: -0.5,
                    marginBottom: spacing.md,
                  }}
                >
                  SOV 0.00
                </Text>
                <View
                  style={{
                    height: 10,
                    width: '70%',
                    backgroundColor: colors.text_secondary,
                    opacity: 0.18,
                    borderRadius: 5,
                    marginBottom: 8,
                  }}
                />
                <View
                  style={{
                    height: 10,
                    width: '45%',
                    backgroundColor: colors.text_secondary,
                    opacity: 0.18,
                    borderRadius: 5,
                  }}
                />
              </View>
            }
          />
        </ScreenLayout>
      </View>
    );
  }

  const selectedWallet = walletByType.primary ?? wallets[0] ?? null;

  const copyToClipboard = (id: any) => {
    let textToCopy = '';
    if (Array.isArray(id)) {
      textToCopy = id.map(byte => byte.toString(16).padStart(2, '0')).join('');
    } else if (typeof id === 'string') {
      textToCopy = id;
    }

    if (textToCopy) {
      Clipboard.setString(textToCopy);
      Alert.alert(t.sidScreen.copy.title, t.sidScreen.copy.walletId);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
      <HeaderBar />

      {welcomeName !== null && (
        <View
          style={{
            backgroundColor: colors.success_dark,
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.lg,
          }}
        >
          <Text
            style={{
              color: '#fff',
              fontSize: typography.size.sm,
              fontWeight: typography.weight.semibold,
              textAlign: 'center',
            }}
          >
            {t.sidScreen.welcomeBack.replace('{name}', welcomeName)}
          </Text>
        </View>
      )}

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
                paddingVertical: spacing.lg,
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
                    Primary Wallet
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
                  onPress={() => setWalletOptionsVisible(true)}
                  accessibilityLabel="Wallet options"
                >
                  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                    <Circle cx="12" cy="12" r="3" stroke={colors.text_primary} strokeWidth={1.5} />
                    <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" stroke={colors.text_primary} strokeWidth={1.5} />
                  </Svg>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ paddingHorizontal: spacing.sm }}>
              <Card style={{ marginHorizontal: 0, overflow: 'hidden' }}>
                <View
                  style={{
                    borderBottomWidth: 1,
                    borderBottomColor: colors.primary,
                    paddingHorizontal: spacing.sm,
                    paddingTop: spacing.xs,
                    paddingBottom: spacing.xs,
                  }}
                >
                  <Text
                    style={{
                      fontSize: typography.size.xs,
                      color: colors.text_secondary,
                      marginBottom: spacing.xs,
                    }}
                  >
                    WALLET ADDRESS
                  </Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
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
                        {selectedWallet?.id || '—'}
                      </Text>
                    </ScrollView>
                    {selectedWallet?.id && (
                      <TouchableOpacity
                        onPress={() => copyToClipboard(selectedWallet?.id)}
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

                <View
                  style={{
                    paddingHorizontal: spacing.lg,
                    paddingTop: spacing.xl,
                    paddingBottom: spacing.xl,
                    alignItems: 'center',
                  }}
                >
                  {walletsLoading || tokensLoading ? (
                    <>
                      <Skeleton
                        width={180}
                        height={48}
                        radius={borderRadius.sm}
                        style={{ marginBottom: spacing.sm }}
                      />
                      <Skeleton width={80} height={14} radius={borderRadius.sm} />
                    </>
                  ) : (
                    <>
                      {(() => {
                        const balStr = formatBalance(totalBalance);
                        const displayStr = `SOV ${balStr}`;
                        const len = displayStr.length;
                        const fontSize =
                          len <= 12
                            ? typography.size['5xl']
                            : len <= 16
                            ? 32
                            : len <= 20
                            ? 26
                            : 20;
                        return (
                          <Text
                            style={{
                              fontSize,
                              fontWeight: typography.weight.bold,
                              color: colors.text_primary,
                            }}
                          >
                            {displayStr}
                          </Text>
                        );
                      })()}
                    </>
                  )}
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
                  backgroundColor: 'transparent',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
                onPress={() => navigation?.navigate('SendTokens')}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <ArrowIcon direction="up" size={14} color={colors.text_primary} />
                  <Text
                    style={{
                      fontSize: typography.size.md,
                      fontWeight: typography.weight.semibold,
                      color: colors.text_primary,
                    }}
                  >
                    {t.wallet.actions.send}
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: spacing.lg,
                  borderRadius: borderRadius.base,
                  borderWidth: 2,
                  borderColor: '#006688',
                  backgroundColor: 'transparent',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
                onPress={() => navigation?.navigate('ReceiveTokens')}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <ArrowIcon direction="down" size={14} color={colors.text_primary} />
                  <Text
                    style={{
                      fontSize: typography.size.md,
                      fontWeight: typography.weight.semibold,
                      color: colors.text_primary,
                    }}
                  >
                    {t.wallet.actions.receive}
                  </Text>
                </View>
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
                  { id: 'Staking', label: t.wallet.tabs.staking },
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
                    {/* Token row skeleton — same height rhythm as the
                        rendered per-token Card list below. Keeps the
                        tab panel content stable while balances stream
                        in. */}
                    {tokensLoading ? (
                      <Column gap="sm" style={{ paddingTop: spacing.sm }}>
                        {[0, 1, 2].map(i => (
                          <Row
                            key={i}
                            align="center"
                            style={{ gap: spacing.md, paddingVertical: spacing.xs }}
                          >
                            <Skeleton width={40} height={40} radius={20} />
                            <Column gap="xs" style={{ flex: 1 }}>
                              <Skeleton height={14} width={'50%'} />
                              <Skeleton height={10} width={'30%'} />
                            </Column>
                            <Skeleton height={16} width={72} />
                          </Row>
                        ))}
                      </Column>
                    ) : customOwnedTokens.length === 0 ? (
                      <View
                        style={{
                          flex: 1,
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ color: colors.text_secondary }}>
                          {t.sidScreen.tokens.empty}
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
                                  {token.balance ?? '—'}
                                </Text>
                              </Row>
                            </View>
                          </Card>
                        ))}
                      </ScrollView>
                    )}
                  </>
                )}

                {activeWalletTab === 'Staking' && (
                  <ScrollView
                    style={{ flex: 1 }}
                    showsVerticalScrollIndicator
                    nestedScrollEnabled
                    contentContainerStyle={{ gap: spacing.sm, paddingTop: spacing.sm }}
                  >
                    {WELFARE_DAOS.map((dao) => {
                      // Find if the user has an active stake in this DAO sector
                      const stake = daoStakes.stakes.find(
                        (s) => s.sector === dao.id || s.sector_dao_key_id === dao.wallet
                      );

                      // Find hub token balance
                      const hubToken = tokens.find(t => t.token_id.toLowerCase() === dao.tokenId.toLowerCase());
                      const hubBalance = hubToken?.balance ?? '0';

                      const accent = dao.color;
                      const amountSov = stake ? stake.amount / 1_000_000_000 : 0;
                      const canUnstake = stake && (stake.unlocked || stake.blocks_remaining <= 0);
                      const daysRemaining = stake
                        ? Math.max(0, Math.round(stake.blocks_remaining / 7200))
                        : 0;

                      // Mock relative value logic: more total staking in a hub increases its token value
                      // 1 Hub Token = (base 10) + (mock variation) SOV
                      const relativeValue = 10 + (dao.id.length % 5);

                      return (
                        <TouchableOpacity
                          key={dao.id}
                          activeOpacity={0.85}
                          onPress={() => openStakeModal(dao)}
                        >
                          <Card
                            style={{
                              marginHorizontal: 0,
                              borderWidth: 0.5,
                              borderColor: accent,
                              backgroundColor: colors.bg_darker,
                            }}
                          >
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
                                  marginBottom: spacing.xs,
                                }}
                              >
                                <View
                                  style={{
                                    flex: 1,
                                    paddingRight: spacing.sm,
                                  }}
                                >
                                  <Row align="center" gap="xs">
                                    <Text
                                      style={{
                                        fontSize: typography.size.base,
                                        fontWeight: typography.weight.semibold,
                                        color: colors.text_primary,
                                      }}
                                    >
                                      {dao.name}
                                    </Text>
                                    <View
                                      style={{
                                        paddingHorizontal: 6,
                                        paddingVertical: 1,
                                        borderRadius: 4,
                                        backgroundColor: `${accent}22`,
                                      }}
                                    >
                                      <Text style={{ color: accent, fontSize: 10, fontWeight: 'bold' }}>{dao.symbol}</Text>
                                    </View>
                                  </Row>
                                  <Text
                                    numberOfLines={1}
                                    style={{
                                      fontSize: typography.size.xs,
                                      color: colors.text_tertiary,
                                      marginTop: 2,
                                    }}
                                  >
                                    {dao.desc}
                                  </Text>
                                </View>
                                <Column align="flex-end">
                                  <Text style={{ fontSize: 9, color: colors.text_tertiary, textTransform: 'uppercase', letterSpacing: 0.5 }}>Hub Power</Text>
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: accent }}>1 SOV = {relativeValue} {dao.symbol.replace('$', '')}</Text>
                                </Column>
                              </Row>

                              <Divider style={{ marginVertical: spacing.sm, opacity: 0.3 }} />

                              <Row justify="space-around">
                                <Column align="center">
                                  <Text style={{ fontSize: 10, color: colors.text_secondary, textTransform: 'uppercase' }}>Staked</Text>
                                  <Text style={{ fontSize: typography.size.sm, fontWeight: '600', color: colors.text_primary }}>
                                    {formatBalance(amountSov)} SOV
                                  </Text>
                                </Column>

                                <View style={{ width: 1, height: 20, backgroundColor: colors.border, opacity: 0.5 }} />

                                <Column align="center">
                                  <Text style={{ fontSize: 10, color: colors.text_secondary, textTransform: 'uppercase' }}>Balance</Text>
                                  <Text style={{ fontSize: typography.size.sm, fontWeight: '600', color: colors.text_primary }}>
                                    {hubBalance} {dao.symbol}
                                  </Text>
                                </Column>
                              </Row>

                              {stake && (
                                <TouchableOpacity
                                  style={{
                                    marginTop: spacing.md,
                                    paddingVertical: 6,
                                    borderRadius: 6,
                                    backgroundColor: colors.bg_dark,
                                    alignItems: 'center',
                                    borderWidth: 1,
                                    borderColor: colors.border,
                                  }}
                                  onPress={(e) => {
                                    e.stopPropagation();
                                    setSelectedStake(stake);
                                  }}
                                >
                                  <Text style={{ fontSize: 11, color: canUnstake ? accent : colors.text_secondary, fontWeight: '600' }}>
                                    {canUnstake ? '✓ Unlocked · Tap to Unstake' : `Locked · ${daysRemaining}d remaining`}
                                  </Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          </Card>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}

                {activeWalletTab === 'Activity' && (
                  <>
                    {/* Skeleton rows that match the real activity row
                        height — three placeholder cards stacked with
                        the same vertical rhythm as the rendered
                        transaction list. This stops the "activity
                        flashes empty then pops 5 rows" jump. */}
                    {activityLoading ? (
                      <Column gap="sm" style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
                        {[0, 1, 2].map(i => (
                          <Row
                            key={i}
                            align="center"
                            style={{ gap: spacing.md, paddingVertical: spacing.xs }}
                          >
                            <Skeleton width={36} height={36} radius={18} />
                            <Column gap="xs" style={{ flex: 1 }}>
                              <Skeleton height={12} width={'60%'} />
                              <Skeleton height={10} width={'40%'} />
                            </Column>
                            <Skeleton height={14} width={64} />
                          </Row>
                        ))}
                      </Column>
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
                          const txDecimals = resolveTxDecimals(tx, tokenDecimalsById);
                          return (
                            <TouchableOpacity
                              key={tx.tx_hash}
                              activeOpacity={0.75}
                              onPress={() => navigation.navigate('TransactionDetail', { hash: tx.tx_hash, activityTx: tx })}
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
                                    {tx.amount_human != null ? String(tx.amount_human) : formatTxValue(tx.amount ?? 0, txDecimals)}
                                  </Text>
                                </Row>
                                <Text
                                  style={{
                                    fontSize: 10,
                                    color: colors.text_secondary,
                                  }}
                                >
                                  Fee {formatTxValue(tx.fee ?? 0, SOV_DECIMALS)}
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

          </Column>
        </ScrollView>
      </ScreenLayout>

      <WalletOptionsSheet
        visible={walletOptionsVisible}
        onClose={() => setWalletOptionsVisible(false)}
        onSelectProfile={() => {
          setWalletOptionsVisible(false);
          navigation?.navigate('Profile');
        }}
        onSelectSettings={() => {
          setWalletOptionsVisible(false);
          navigation?.navigate('WalletSettings');
        }}
      />

      <StakeDetailModal
        visible={selectedStake !== null}
        stake={selectedStake}
        currentHeight={daoStakes.current_height}
        onClose={() => setSelectedStake(null)}
        onUnstake={stake => {
          // TODO: wire up unstake transaction via lib-client once endpoint lands
          console.log('[SIDScreen] unstake requested', stake);
          setSelectedStake(null);
          Alert.alert(
            'Unstake submitted',
            `Your intent to unstake ${(stake.amount / 1_000_000_000).toLocaleString()} SOV from ${stake.sector} has been recorded.`,
          );
        }}
      />

      <StakeDaoModal
        visible={stakeTarget !== null}
        dao={stakeTarget}
        exchangeRate={10 + (stakeTarget?.id?.length ?? 0) % 5}
        onClose={closeStakeModal}
        onSubmit={handleStakeSubmit}
        submitting={stakeSubmitting}
      />

    </View>
  );
};

export default SIDScreen;
