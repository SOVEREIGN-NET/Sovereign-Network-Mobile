import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  Animated,
  Dimensions,
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
 * Hero section height — logo area above the sticky search bar + dapps.
 */
const HERO_SECTION_HEIGHT = SCREEN_HEIGHT * 0.35;

/** Scroll offset where the dapp reveal animation begins (delayed) */
const REVEAL_START = HERO_SECTION_HEIGHT * 0.4;
/** Scroll offset where the dapp reveal animation completes */
const REVEAL_END = REVEAL_START + 80;

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
  const [dappsTouchable, setDappsTouchable] = useState(false);

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

  // Dapps fade in / indicator fades out — delayed until REVEAL_START
  const dappsOpacity = scrollY.interpolate({
    inputRange: [REVEAL_START, REVEAL_END],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const indicatorOpacity = scrollY.interpolate({
    inputRange: [REVEAL_START, REVEAL_END],
    outputRange: [0.7, 0],
    extrapolate: 'clamp',
  });

  // Dapps data — static list from useTrendingDapps
  const trendingDapps = useTrendingDapps();
  const [loadedDapps] = useState(() => {
    return trendingDapps.map(d => ({
      id: d.id,
      name: d.name,
      desc: d.desc,
      url: d.url,
      activityLevel: d.activityLevel,
    }));
  });

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


  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    {
      useNativeDriver: true,
      listener: (event: any) => {
        const offsetY = event.nativeEvent.contentOffset.y;
        if (offsetY >= REVEAL_END && !dappsTouchable) {
          setDappsTouchable(true);
        }
      },
    },
  );

  /** Snap: if user scrolled past the midpoint, finish the scroll to reveal dapps */
  const handleMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      if (offsetY < HERO_SECTION_HEIGHT * 0.5) {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      } else {
        scrollRef.current?.scrollTo({ y: HERO_SECTION_HEIGHT, animated: true });
      }
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

        {/* ── Index 1: Sticky header — search bar + dapp rows ── */}
        <Animated.View
          style={{
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.sm,
            paddingBottom: spacing.md,
            backgroundColor: colors.bg_darkest,
          }}
        >
          {/* Search bar */}
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

          {/* "Scroll to browse" indicator — fades out as dapps fade in */}
          <Animated.View
            style={{
              opacity: indicatorOpacity,
              alignItems: 'center',
              paddingVertical: spacing.sm,
              transform: [{ translateY: bobAnim }],
            }}
            pointerEvents="none"
          >
            <Animated.Text
              style={{
                fontWeight: '600',
                fontSize: typography.size.xs,
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

          {/* Dapp rows — fade in as user scrolls, not tappable until revealed */}
          <Animated.View
            style={{ opacity: dappsOpacity }}
            pointerEvents={dappsTouchable ? 'auto' : 'none'}
          >
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
          </Animated.View>
        </Animated.View>

        {/* Spacer — gives the ScrollView content to scroll through */}
        <View style={{ height: SCREEN_HEIGHT * 1.5 }} />
      </Animated.ScrollView>
    </View>
  );
};

export default DashboardScreen;
