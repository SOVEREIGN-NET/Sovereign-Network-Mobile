import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  Animated,
  Dimensions,
  ActivityIndicator,
  Easing,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useNetworkNotices } from '../hooks/useNetworkNotices';
import { useAuth } from '../hooks';
import {
  useTrendingDapps,
  getActivityColor,
} from '../hooks/useTrendingDapps';
import {
  ActivityDot,
  ArrowIcon,
  Button,
  Column,
  DrawerItem,
  HeaderBar,
  Row,
  SideDrawer,
  Text,
} from '../components';
import { colors, spacing, typography, borderRadius } from '../theme';
import SShieldLogo from '../components/atoms/Logo';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SCROLL_THRESHOLD = 80;
const SEARCH_BAR_HEIGHT = 44;

/**
 * Small hero — just tall enough to show the logo at ~1/3 with the
 * search bar directly below it. A spacer pushes the dapps section
 * below the fold so they are invisible until the user scrolls.
 */
const HERO_SECTION_HEIGHT = SCREEN_HEIGHT * 0.35;
/** Spacer after the sticky search bar fills the remaining viewport */
const DAPPS_SPACER = SCREEN_HEIGHT - HERO_SECTION_HEIGHT - SEARCH_BAR_HEIGHT - 64;

/** Estimated height of the "Scroll to browse" indicator section (text + chevron + padding) */
const INDICATOR_HEIGHT = 54;
/** Scroll offset that positions dapp rows just below the stuck search bar */
const DAPPS_SNAP_OFFSET = HERO_SECTION_HEIGHT + INDICATOR_HEIGHT + DAPPS_SPACER;
/** Scroll threshold — scrolling past 35% of the way to dapps triggers snap */
const SNAP_THRESHOLD = DAPPS_SNAP_OFFSET * 0.35;
/** Buffer zone to prevent re-snapping when already freely scrolling within dapps */
const SNAP_BUFFER = 60;

const NOTICE_STYLE: Record<
  'info' | 'warning' | 'error',
  { bg: string; border: string; text: string; icon: string }
> = {
  error:   { bg: '#3D1515', border: '#7B2020', text: '#FF6B6B', icon: '⚠' },
  warning: { bg: '#3D2E00', border: '#7B5C00', text: '#FFB800', icon: '⚡' },
  info:    { bg: '#0D2D45', border: '#0E4B7A', text: '#4FC3F7', icon: 'ℹ' },
};

/** Wide, thick downward chevron drawn as two thick angled lines */
const WideChevronDown: React.FC<{ color: string; size?: number }> = ({
  color,
  size = 32,
}) => (
  <Svg width={size} height={size * 0.4} viewBox="0 0 48 20">
    <Path
      d="M4 2 L24 18 L44 2"
      stroke={color}
      strokeWidth={4}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
);

/** Generates more dapp configs for infinite-scroll simulation */
const generateDappPage = (page: number, pageSize: number) => {
  const templates = [
    { name: 'Central.sov', desc: 'CBE applications', baseUsers: 342 },
    { name: 'SovSwap', desc: 'DAO registry - Token Swap', baseUsers: 287 },
    { name: 'Ballot', desc: 'Voting Platform', baseUsers: 89 },
    { name: 'Namesake', desc: 'Domain Name Service', baseUsers: 156 },
    { name: 'Vault', desc: 'Decentralized Storage', baseUsers: 201 },
    { name: 'Stream', desc: 'Live Content Platform', baseUsers: 73 },
    { name: 'Mint', desc: 'Token Creator', baseUsers: 118 },
    { name: 'Bid', desc: 'Auction House', baseUsers: 45 },
    { name: 'Vote', desc: 'DAO Governance', baseUsers: 234 },
    { name: 'Stake', desc: 'Staking Dashboard', baseUsers: 167 },
  ];
  const start = (page - 1) * pageSize;
  return templates.slice(start, start + pageSize).map((t, i) => ({
    id: `page${page}-${i}`,
    name: t.name,
    desc: t.desc,
    url: `zhtp://${t.name.toLowerCase().replace(/\s+/g, '')}.sov`,
    change: Math.round(Math.random() * 200 + 50),
    activityLevel: (['high', 'medium', 'low'] as const)[
      Math.floor(Math.random() * 3)
    ],
  }));
};

const DappRow: React.FC<{
  dapp: { id: string; name: string; desc: string; url: string; activityLevel: string };
  onPress: () => void;
}> = ({ dapp, onPress }) => {
  const activityColor = getActivityColor(dapp.activityLevel as any);
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: borderRadius.lg,
        backgroundColor: colors.bg_darker,
        marginBottom: spacing.sm,
      }}
    >
      <Row gap="sm" align="center" style={{ flex: 1 }}>
        <ActivityDot color={activityColor} />
        <Column gap="xs" style={{ flex: 1 }}>
          <Text variant="body" style={{ fontWeight: '600' }}>
            {dapp.name}
          </Text>
          <Text variant="caption" style={{ color: colors.text_secondary }}>
            {dapp.desc}
          </Text>
        </Column>
      </Row>
    </Pressable>
  );
};

const DashboardScreen: React.FC<any> = ({ navigation }) => {
  const [drawerVisible, setDrawerVisible] = useState(false);
  const { activeNotice, dismiss } = useNetworkNotices();
  const { currentIdentity } = useAuth();
  const [urlInput, setUrlInput] = useState('zhtp://central.sov');

  // Scroll animation
  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);

  // Bob animation for the Available Dapps indicator
  const bobAnim = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const bob = Animated.loop(
      Animated.sequence([
        Animated.timing(bobAnim, {
          toValue: -4,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bobAnim, {
          toValue: 4,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bobAnim, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(textOpacity, {
          toValue: 0.35,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(textOpacity, {
          toValue: 0.5,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    bob.start();
    pulse.start();
    return () => {
      bob.stop();
      pulse.stop();
    };
  }, [bobAnim, textOpacity]);

  // Logo fades out as it scrolls up past threshold
  const logoOpacity = scrollY.interpolate({
    inputRange: [0, SCROLL_THRESHOLD],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const logoTranslateY = scrollY.interpolate({
    inputRange: [0, SCROLL_THRESHOLD],
    outputRange: [0, -30],
    extrapolate: 'clamp',
  });

  // Search bar shadow appears when stuck
  const searchBarShadowOpacity = scrollY.interpolate({
    inputRange: [SCROLL_THRESHOLD - 10, SCROLL_THRESHOLD],
    outputRange: [0, 0.3],
    extrapolate: 'clamp',
  });

  // Dapps data and infinite scroll
  const trendingDapps = useTrendingDapps();
  const [loadedDapps, setLoadedDapps] = useState(() => {
    const initial = trendingDapps.map(d => ({
      id: d.id,
      name: d.name,
      desc: d.desc,
      url: d.url,
      activityLevel: d.activityLevel,
    }));
    return [...initial, ...generateDappPage(1, 5)];
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const pageRef = useRef(2);
  const hasMoreRef = useRef(true);

  const openBrowser = useCallback(
    (url?: string) => {
      const targetUrl = url || urlInput;
      if (__DEV__) {
        console.log('[🌐 Web4] Dashboard: Navigating to URL:', targetUrl);
      }
      navigation.navigate('Browser', { url: targetUrl });
    },
    [navigation, urlInput],
  );

  const handleLoadMore = useCallback(() => {
    if (loadingMore || !hasMoreRef.current) return;
    setLoadingMore(true);
    setTimeout(() => {
      const nextPage = generateDappPage(pageRef.current, 5);
      if (nextPage.length === 0) {
        hasMoreRef.current = false;
      } else {
        setLoadedDapps(prev => [...prev, ...nextPage]);
        pageRef.current += 1;
      }
      setLoadingMore(false);
    }, 800);
  }, [loadingMore]);

  const isNearBottom = useRef(false);
  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    {
      useNativeDriver: true,
      listener: (event: any) => {
        const { contentOffset, contentSize, layoutMeasurement } =
          event.nativeEvent;
        if (
          contentOffset.y + layoutMeasurement.height >
          contentSize.height - layoutMeasurement.height * 0.2
        ) {
          if (!isNearBottom.current) {
            isNearBottom.current = true;
            handleLoadMore();
          }
        } else {
          isNearBottom.current = false;
        }
      },
    },
  );

  /** Snaps to top or dapps section based on how far the user scrolled */
  const handleMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      if (offsetY < SNAP_THRESHOLD) {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      } else if (offsetY < DAPPS_SNAP_OFFSET + SNAP_BUFFER) {
        scrollRef.current?.scrollTo({ y: DAPPS_SNAP_OFFSET, animated: true });
      }
      // else: already within dapps section, free scroll — no snap
    },
    [],
  );

  const openDomains = useCallback(() => {
    if (currentIdentity) {
      navigation.navigate('SIDTab', { screen: 'MyDomains' });
    } else {
      navigation.navigate('SIDTab');
    }
  }, [currentIdentity, navigation]);

  const drawerItems: DrawerItem[] = useMemo(() => {
    const items: DrawerItem[] = [
      {
        id: 'pouw',
        label: 'PoUW Rewards',
        icon: '',
        onPress: () => {
          setDrawerVisible(false);
          navigation.navigate('SIDTab', { screen: 'PoUW' });
        },
      },
      {
        id: 'history',
        label: 'History',
        icon: '',
        onPress: () => {
          setDrawerVisible(false);
          navigation.navigate('SIDTab', { screen: 'History' });
        },
      },
      {
        id: 'bookmarks',
        label: 'Bookmarks',
        icon: '',
        onPress: () => {
          setDrawerVisible(false);
          navigation.navigate('SIDTab', { screen: 'Bookmarks' });
        },
      },
      {
        id: 'favorites',
        label: 'Favorites',
        icon: '',
        onPress: () => {
          setDrawerVisible(false);
          navigation.navigate('SIDTab', { screen: 'Favorites' });
        },
      },
    ];
    items.push({
      id: 'domains',
      label: 'My Domains',
      icon: '',
      onPress: () => {
        setDrawerVisible(false);
        openDomains();
      },
    });
    items.push({
      id: 'settings',
      label: 'Settings',
      icon: '',
      onPress: () => {
        setDrawerVisible(false);
        navigation.navigate('SIDTab', { screen: 'AppSettings' });
      },
    });
    return items;
  }, [navigation, openDomains]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
      <HeaderBar
        onMenuPress={() => setDrawerVisible(true)}
        onNavigatePouw={() => navigation.navigate('SIDTab', { screen: 'PoUW' })}
        onNavigateExplorer={() => navigation.navigate('ExplorerDashboard')}
        onNavigateDapps={() => navigation.navigate('Dapps')}
        onNavigateDomains={openDomains}
      />

      {activeNotice && (() => {
        const s = NOTICE_STYLE[activeNotice.level];
        return (
          <Pressable
            onPress={() => dismiss(activeNotice.id)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: s.bg,
              borderBottomWidth: 1,
              borderBottomColor: s.border,
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.lg,
              gap: spacing.sm,
            }}
          >
            <Text style={{ fontSize: typography.size.sm, color: s.text }}>{s.icon}</Text>
            <Text style={{ flex: 1, fontSize: typography.size.xs, color: s.text, lineHeight: 18 }}>
              {activeNotice.message}
            </Text>
            <Text style={{ fontSize: typography.size.md, color: s.text, opacity: 0.7 }}>×</Text>
          </Pressable>
        );
      })()}

      <SideDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        items={drawerItems}
        title="Menu"
      />

      <Animated.ScrollView
        ref={scrollRef}
        onScroll={handleScroll}
        onMomentumScrollEnd={handleMomentumEnd}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
      >
        {/* ── Index 0: Hero section — logo closer to search bar ── */}
        <View style={{ height: HERO_SECTION_HEIGHT }}>
          <View style={{ flex: 2 }} />
          <Animated.View
            style={{
              opacity: logoOpacity,
              transform: [{ translateY: logoTranslateY }],
              alignItems: 'center',
              marginBottom: spacing.sm,
            }}
          >
            <SShieldLogo size={100} />
          </Animated.View>
          <View style={{ flex: 1 }} />
        </View>

        {/* ── Index 1: Sticky search bar ── */}
        <Animated.View
          style={{
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.sm,
            paddingBottom: spacing.sm,
            backgroundColor: colors.bg_darkest,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: searchBarShadowOpacity,
            shadowRadius: 4,
            elevation: searchBarShadowOpacity.interpolate({
              inputRange: [0, 0.3],
              outputRange: [0, 6],
            }),
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.xs,
              height: SEARCH_BAR_HEIGHT,
            }}
          >
            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                borderRadius: 12,
                backgroundColor: colors.bg_dark,
                borderWidth: 1,
                borderColor: colors.border,
                paddingHorizontal: spacing.sm,
                height: 40,
              }}
            >
              <TextInput
                placeholder="zhtp://..."
                placeholderTextColor={colors.text_placeholder}
                value={urlInput}
                onChangeText={setUrlInput}
                onSubmitEditing={() => openBrowser()}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="go"
                style={{
                  flex: 1,
                  color: colors.text_primary,
                  fontSize: 14,
                  paddingVertical: 0,
                  height: '100%',
                }}
              />
            </View>
            <Button
              onPress={() => openBrowser()}
              size="sm"
              variant="primary"
              style={{
                width: 36,
                height: 36,
                paddingHorizontal: 0,
                paddingVertical: 0,
                justifyContent: 'center',
                alignItems: 'center',
                borderRadius: 18,
              }}
            >
              <ArrowIcon direction="right" size={16} color={colors.text_primary} />
            </Button>
          </View>
        </Animated.View>

        {/* ── Index 2: Available Dapps indicator (centered, arrow below text) ── */}
        <Animated.View
          style={{
            alignItems: 'center',
            paddingVertical: spacing.sm,
            transform: [{ translateY: bobAnim }],
          }}
        >
          <Animated.Text
            style={{
              fontWeight: '600',
              color: colors.text_secondary,
              marginBottom: spacing.xs,
              opacity: textOpacity,
            }}
          >
            Scroll to browse available Dapps
          </Animated.Text>
          <Animated.View style={{ opacity: textOpacity }}>
            <WideChevronDown color={colors.text_secondary} size={20} />
          </Animated.View>
        </Animated.View>

        {/* ── Index 3: Spacer — pushes dapp rows below the fold ── */}
        <View style={{ height: DAPPS_SPACER }} />

        {/* ── Dapp rows ── */}
        <View style={{ paddingHorizontal: spacing.lg }}>
          {loadedDapps.map(dapp => (
            <DappRow
              key={dapp.id}
              dapp={dapp}
              onPress={() => {
                if (dapp.id.includes('sovswap') || dapp.name === 'SovSwap') {
                  navigation.navigate('SovSwapHome');
                  return;
                }
                openBrowser(dapp.url);
              }}
            />
          ))}

          {loadingMore && (
            <View style={{ paddingVertical: spacing.lg, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          )}

          {!hasMoreRef.current && !loadingMore && (
            <View style={{ paddingVertical: spacing.lg, alignItems: 'center' }}>
              <Text style={{ color: colors.text_secondary, fontSize: typography.size.sm }}>
                All dapps loaded
              </Text>
            </View>
          )}
        </View>
      </Animated.ScrollView>
    </View>
  );
};

export default DashboardScreen;
