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
import Svg, { Path, Circle } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import {
  ArrowIcon,
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
  Skeleton,
  StakeDetailModal,
  GuestEntryCard,
} from '../components';
import {
  useAuth,
  useAsyncData,
  useUserTokenBalances,
  useWalletList,
  useDaoStakes,
  useNodeConnectionStatus,
} from '../hooks';
import type { DaoStake } from '../hooks/useDaoStakes';
import { WELFARE_DAOS } from '../constants';
import { useTranslation } from '../i18n';
import { colors, spacing, typography, borderRadius } from '../theme';
import appService, {
  WalletTransaction,
  WalletTransactionsResponse,
} from '../services/AppService';
import { QuicError } from '../types/api';
import { atomsToDisplayLocale, SOV_DECIMALS } from '../utils/tokenUnits';

// Format large numbers with commas
const formatBalance = (balance: number): string => {
  return balance.toLocaleString('en-US', { maximumFractionDigits: 2 });
};

/** Pick a responsive font-size based on string length. */
const balanceFontSize = (text: string): number => {
  const len = text.length;
  if (len <= 8) return typography.size['5xl'];
  if (len <= 12) return 32;
  if (len <= 16) return 26;
  return 20;
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
  let s: string;
  if (typeof value === 'number') {
    s = Number.isFinite(value) ? String(Math.trunc(value)) : '0';
  } else {
    s = typeof value === 'object' && value !== null
      ? JSON.stringify(value)
      : String(value).trim();
  }
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

// ---------------------------------------------------------------------------
// BalanceCarousel: horizontal paged wallet balance cards, one per token.
// ---------------------------------------------------------------------------

interface BalanceCarouselProps {
  cards: Array<{
    token_id: string;
    symbol: string;
    name: string;
    /** Pre-formatted display string (locale, with commas). Null = unknown/error. */
    balance: string | null;
  }>;
  walletId: string | undefined;
  walletsLoading: boolean;
  /** Aggregate SOV balance from useWalletList — more accurate than the
   *  per-token balance endpoint for SOV (which may report only one wallet). */
  totalSovBalance: number;
  sovCurrencyLabel: string;
  copyLabel: string;
  onCopyWalletId: () => void;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  scrollRef: React.RefObject<ScrollView | null>;
}

const BalanceCarousel = ({
  cards,
  walletId,
  walletsLoading,
  totalSovBalance,
  sovCurrencyLabel,
  copyLabel,
  onCopyWalletId,
  activeIndex,
  onActiveIndexChange,
  scrollRef,
}: BalanceCarouselProps) => {
  const { t } = useTranslation();
  // One card per token; each card is full-width (minus horizontal padding).
  const [cardWidth, setCardWidth] = useState(
    Dimensions.get('window').width - spacing.sm * 2,
  );

  const handleLayout = (e: { nativeEvent: { layout: { width: number } } }) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - cardWidth) > 0.5) {
      setCardWidth(w);
    }
  };

  const handleMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const next = Math.round(x / cardWidth);
    if (next !== activeIndex && next >= 0 && next < cards.length) {
      onActiveIndexChange(next);
    }
  };

  return (
    <View onLayout={handleLayout}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentumEnd}
        // Backup for slow drags that don't trigger momentum: also commit
        // the active index when the user releases the finger. Without this,
        // the active card index can stay stuck on the previous card after a
        // slow scroll, causing send-button state (e.g. CBE lockout) to lag
        // behind what the user sees.
        onScrollEndDrag={handleMomentumEnd}
        decelerationRate="fast"
        snapToInterval={cardWidth}
        snapToAlignment="start"
      >
        {cards.map(card => {
          const isSov = (card.symbol || '').toUpperCase() === 'SOV';
          const isCbe = (card.symbol || '').toUpperCase() === 'CBE';
          // For SOV, prefer the wallet-list aggregate so multi-wallet users see
          // their full balance. Other tokens use the per-wallet amount from the
          // balances endpoint (pre-formatted string; null when decimals missing).
          const displayBalance: string = isSov
            ? totalSovBalance.toLocaleString('en-US', { maximumFractionDigits: 2 })
            : card.balance ?? '—';
          // CBE's chain-registered name is "Cooperative Banking Equity" — drop
          // the "equity" word in the on-card label per product call. Strip
          // safely (word boundary, case-insensitive, collapse double spaces).
          const cardName = isCbe && card.name
            ? card.name.replace(/\bequity\b/gi, '').replace(/\s+/g, ' ').trim()
            : card.name;
          return (
            <View
              key={card.token_id}
              style={{ width: cardWidth, paddingRight: 0 }}
            >
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
                    WALLET ADDRESS ({card.symbol} transfers)
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
                          color: walletId
                            ? colors.text_primary
                            : colors.text_tertiary,
                          letterSpacing: 0.5,
                          fontFamily: 'Courier',
                        }}
                      >
                        {walletId || '—'}
                      </Text>
                    </ScrollView>
                    {!!walletId && (
                      <TouchableOpacity
                        onPress={onCopyWalletId}
                        style={{ marginLeft: spacing.sm }}
                      >
                        <Text
                          style={{
                            fontSize: typography.size.xs,
                            color: colors.primary,
                          }}
                        >
                          {copyLabel}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                <View
                  style={{
                    paddingHorizontal: spacing.lg,
                    paddingTop: spacing.lg,
                    paddingBottom: spacing.xs,
                    alignItems: 'center',
                  }}
                >
                  {(() => {
                    const fontSize = balanceFontSize(displayBalance);
                    return (
                      <Text
                        style={{
                          fontSize,
                          fontWeight: typography.weight.bold,
                          color: colors.primary,
                          marginBottom: spacing.sm,
                        }}
                      >
                        {displayBalance}
                      </Text>
                    );
                  })()}
                  <Row style={{ alignItems: 'center', gap: spacing.sm }}>
                    <Text
                      style={{
                        fontSize: typography.size.sm,
                        color: colors.text_secondary,
                      }}
                    >
                      {isSov ? sovCurrencyLabel : card.symbol}
                      {cardName && cardName !== card.symbol
                        ? ` · ${cardName}`
                        : ''}
                    </Text>
                    {isSov && walletsLoading && (
                      <Text
                        style={{
                          fontSize: typography.size.xs,
                          color: colors.text_tertiary,
                        }}
                      >
                        {t.sidScreen.tokens.syncing}
                      </Text>
                    )}
                  </Row>
                </View>
              </Card>
            </View>
          );
        })}
      </ScrollView>

      {cards.length > 1 && (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            gap: spacing.xs,
            marginTop: spacing.sm,
          }}
        >
          {cards.map((card, idx) => (
            <View
              key={card.token_id}
              style={{
                width: idx === activeIndex ? 20 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor:
                  idx === activeIndex ? colors.primary : colors.border,
              }}
            />
          ))}
        </View>
      )}
    </View>
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
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [activeWalletTab, setActiveWalletTab] = useState('Activity');
  const [selectedStake, setSelectedStake] = useState<DaoStake | null>(null);
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
      if (s === 'UBS') return 4;
      return 2;
    };

    // Build wallet-type cards for Savings and UBS from the wallet list.
    const walletCards: typeof tokens = (wallets ?? [])
      .filter(w => {
        const t = (w.wallet_type || '').toLowerCase();
        return t === 'savings' || t === 'ubs';
      })
      .map(w => ({
        token_id: `wallet:${w.id}`,
        symbol: w.wallet_type.toUpperCase(),
        name: w.name || `${w.wallet_type} Wallet`,
        decimals: null,
        balance: w.total_balance.toLocaleString('en-US', { maximumFractionDigits: 2 }),
        atomicBalance: '0',
      }));

    // Merge tokens + wallet cards, dedupe by symbol
    const seen = new Set<string>();
    const all = [...tokens, ...walletCards].filter(t => {
      const key = t.symbol.toUpperCase();
      if (seen.has(key)) return false;
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
          String(typeof error?.body === 'object' && error?.body !== null ? JSON.stringify(error.body) : (error?.body ?? '')).includes('Identity ID must be 32 bytes')
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

  // UBS data from identity
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
          showHamburger={false}
        />

        <SideDrawer
          visible={drawerVisible}
          onClose={() => setDrawerVisible(false)}
          items={drawerItems}
          title={t.sidScreen.menu}
        />

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
                  0.0000 SOV
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
      <HeaderBar
        onMenuPress={() => setDrawerVisible(true)}
        onBalancePress={() => navigation.navigate('PoUW')}
        showHamburger={false}
      />

      <SideDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        items={drawerItems}
        title={t.sidScreen.menu}
      />

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
                    {selectedWallet?.name || t.wallet.empty.defaultWallet}
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

            {/* Swipeable per-token balance carousel:
                SOV first, CBE second, remaining tokens alphabetical. Each card
                shows the same wallet ID (per-chain address rule — CBE and SOV
                share the wallet_id) but highlights the balance in that token. */}
            <View style={{ paddingHorizontal: spacing.sm }}>
              {balanceCards.length === 0 ? (
                // Reserved-height skeleton that mirrors the carousel's
                // inner dimensions (large numeric + caption). Keeping
                // the vertical space identical to the carousel state
                // eliminates the "card jumps up when data arrives"
                // flash — the real carousel lands in the exact slot
                // the skeleton occupied.
                <Card style={{ marginHorizontal: 0, overflow: 'hidden' }}>
                  <View
                    style={{
                      borderTopWidth: 2,
                      borderTopColor: colors.primary,
                      paddingHorizontal: spacing.lg,
                      paddingVertical: spacing.xl,
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
                          const fontSize = balanceFontSize(balStr);
                          return (
                            <Text
                              style={{
                                fontSize,
                                fontWeight: typography.weight.bold,
                                color: colors.primary,
                                marginBottom: spacing.sm,
                              }}
                            >
                              {balStr}
                            </Text>
                          );
                        })()}
                        <Text
                          style={{
                            fontSize: typography.size.sm,
                            color: colors.text_secondary,
                          }}
                        >
                          {t.wallet.currency}
                        </Text>
                      </>
                    )}
                  </View>
                </Card>
              ) : (
                <BalanceCarousel
                  cards={balanceCards}
                  walletId={selectedWallet?.id}
                  walletsLoading={walletsLoading}
                  totalSovBalance={totalBalance}
                  sovCurrencyLabel={t.wallet.currency}
                  copyLabel={t.wallet.actions.copy}
                  onCopyWalletId={() => copyToClipboard(selectedWallet?.id)}
                  activeIndex={activeBalanceCardIndex}
                  onActiveIndexChange={setActiveBalanceCardIndex}
                  scrollRef={balanceScrollRef}
                />
              )}
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
              {(() => {
                // Send is disabled when CBE is the active card — backend
                // verification path for non-SOV wallet transfers isn't ready
                // yet. Mirrors the in-screen lockout in SendTokensScreen.
                const activeSymbol = (activeCardToken?.symbol || '').toUpperCase();
                const isWalletCard = activeSymbol === 'SAVINGS' || activeSymbol === 'UBS';
                const sendDisabled =
                  isLoading ||
                  !nodeConnected ||
                  isWalletCard ||
                  activeSymbol === 'CBE';
                return (
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      paddingVertical: spacing.lg,
                      borderRadius: borderRadius.base,
                      borderWidth: 2,
                      borderColor: sendDisabled ? colors.border : '#006688',
                      backgroundColor: sendDisabled ? colors.bg_darker : 'transparent',
                      justifyContent: 'center',
                      alignItems: 'center',
                      opacity: sendDisabled ? 0.5 : 1,
                    }}
                    onPress={() =>
                      navigation?.navigate('SendTokens', {
                        preselectedTokenId: activeCardToken?.token_id,
                      })
                    }
                    disabled={sendDisabled}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <ArrowIcon direction="up" size={14} color={sendDisabled ? colors.text_tertiary : colors.text_primary} />
                      <Text
                        style={{
                          fontSize: typography.size.md,
                          fontWeight: typography.weight.semibold,
                          color: sendDisabled ? colors.text_tertiary : colors.text_primary,
                        }}
                      >
                        {t.wallet.actions.send}
                        {activeCardToken ? ` ${activeCardToken.symbol}` : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })()}

              {(() => {
                const activeSymbolR = (activeCardToken?.symbol || '').toUpperCase();
                const isWalletCardR = activeSymbolR === 'SAVINGS' || activeSymbolR === 'UBS';
                const receiveDisabled = isLoading || isWalletCardR;
                return (
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      paddingVertical: spacing.lg,
                      borderRadius: borderRadius.base,
                      borderWidth: 2,
                      borderColor: receiveDisabled ? colors.border : '#006688',
                      backgroundColor: receiveDisabled ? colors.bg_darker : 'transparent',
                      justifyContent: 'center',
                      alignItems: 'center',
                      opacity: receiveDisabled ? 0.5 : 1,
                    }}
                    onPress={() =>
                      navigation?.navigate('ReceiveTokens', {
                        preselectedTokenId: activeCardToken?.token_id,
                      })
                    }
                    disabled={receiveDisabled}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <ArrowIcon direction="down" size={14} color={receiveDisabled ? colors.text_tertiary : colors.text_primary} />
                      <Text
                        style={{
                          fontSize: typography.size.md,
                          fontWeight: typography.weight.semibold,
                          color: receiveDisabled ? colors.text_tertiary : colors.text_primary,
                        }}
                      >
                        {t.wallet.actions.receive}
                        {activeCardToken ? ` ${activeCardToken.symbol}` : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })()}
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
                  <>
                    {daoStakes.stakes.length === 0 ? (
                      <View
                        style={{
                          flex: 1,
                          justifyContent: 'center',
                          alignItems: 'center',
                          paddingHorizontal: spacing.lg,
                        }}
                      >
                        <Text
                          style={{
                            color: colors.text_secondary,
                            textAlign: 'center',
                            marginBottom: spacing.xs,
                          }}
                        >
                          No active stakes
                        </Text>
                        <Text
                          style={{
                            color: colors.text_tertiary,
                            fontSize: typography.size.xs,
                            textAlign: 'center',
                          }}
                        >
                          Stake SOV in a welfare DAO from the DAO tab to support real outcomes.
                        </Text>
                      </View>
                    ) : (
                      <ScrollView
                        style={{ flex: 1 }}
                        showsVerticalScrollIndicator
                        nestedScrollEnabled
                        contentContainerStyle={{ gap: spacing.sm }}
                      >
                        {daoStakes.stakes.map((stake, idx) => {
                          const dao = WELFARE_DAOS.find(
                            d => d.id === stake.sector,
                          );
                          const accent = dao?.color ?? colors.primary;
                          const amountSov = stake.amount / 1_000_000_000;
                          const canUnstake =
                            stake.unlocked || stake.blocks_remaining <= 0;
                          const daysRemaining = Math.max(
                            0,
                            Math.round(stake.blocks_remaining / 7200),
                          );
                          return (
                            <TouchableOpacity
                              key={`${stake.sector_dao_key_id}-${idx}`}
                              activeOpacity={0.85}
                              onPress={() => setSelectedStake(stake)}
                            >
                              <Card
                                style={{
                                  marginHorizontal: 0,
                                  borderWidth: 0.5,
                                  borderColor: accent,
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
                                    }}
                                  >
                                    <View
                                      style={{
                                        flex: 1,
                                        paddingRight: spacing.sm,
                                      }}
                                    >
                                      <Text
                                        style={{
                                          fontSize: typography.size.base,
                                          fontWeight:
                                            typography.weight.semibold,
                                          color: colors.text_primary,
                                        }}
                                      >
                                        {dao?.name ?? stake.sector}
                                      </Text>
                                      <Text
                                        numberOfLines={1}
                                        style={{
                                          fontSize: typography.size.xs,
                                          color: canUnstake
                                            ? accent
                                            : colors.text_secondary,
                                          marginTop: 2,
                                        }}
                                      >
                                        {canUnstake
                                          ? 'Unlocked · tap to unstake'
                                          : `Locked · ${daysRemaining}d remaining`}
                                      </Text>
                                    </View>
                                    <Text
                                      style={{
                                        fontSize: typography.size.base,
                                        fontWeight: typography.weight.bold,
                                        color: colors.text_primary,
                                      }}
                                    >
                                      {formatBalance(amountSov)} SOV
                                    </Text>
                                  </Row>
                                </View>
                              </Card>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    )}
                  </>
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

            {/* UBS Status Card */}
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
                      
                      <Text
                        style={{
                          fontSize: typography.size.base,
                          fontWeight: typography.weight.bold,
                          color: colors.success,
                        }}
                      >
                        Universal Basic Services
                      </Text>
                    </Row>
                    <Row style={{ alignItems: 'center', gap: spacing.sm }}>
                      <Badge label={t.sidScreen.tokens.comingSoon} variant="info" size="sm" />
                      <Text
                        style={{
                          fontSize: typography.size.xs,
                          color: colors.text_secondary,
                        }}
                      >
                        {t.sidScreen.tokens.comingSoon}
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
                      UBS is calculated as an equal per-citizen share of 45% of
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
          // TODO(sov-network/node#1234): wire up unstake transaction via lib-client once endpoint lands
          console.log('[SIDScreen] unstake requested', stake);
          setSelectedStake(null);
          Alert.alert(
            'Unstake submitted',
            `Your intent to unstake ${(stake.amount / 1_000_000_000).toLocaleString()} SOV from ${stake.sector} has been recorded.`,
          );
        }}
      />

    </View>
  );
};

export default SIDScreen;
