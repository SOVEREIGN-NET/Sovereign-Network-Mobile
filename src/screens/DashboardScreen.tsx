import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
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
  StyleSheet,
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
const SEARCH_BAR_HEIGHT = 44;

/**
 * FIXED HERO CONSTANTS
 */
const LOGO_SIZE = 120;
const SEARCH_BAR_GAP = spacing.lg; // 16
const SEARCH_BAR_TOTAL_HEIGHT = 44;
const HERO_HEIGHT = LOGO_SIZE + SEARCH_BAR_GAP + SEARCH_BAR_TOTAL_HEIGHT;
const FIXED_HERO_TOP = (SCREEN_HEIGHT / 2) - (HERO_HEIGHT / 2) - 60;
const HERO_BOTTOM = FIXED_HERO_TOP + HERO_HEIGHT; // Bottom of search bar
const STICKY_GAP = 24; // Extra space between search bar and docked list

// The amount we need to scroll to bring the apps list to the "dock" line
const INDICATOR_HEIGHT = 28; // Ultra compact
const APPS_SPACER_HEIGHT = SCREEN_HEIGHT * 0.45;
const SNAP_TARGET = INDICATOR_HEIGHT + APPS_SPACER_HEIGHT;

const WideChevronDown: React.FC<{ color: string; size?: number }> = ({
  color,
  size = 32,
}) => (
  <Svg width={size} height={size * 0.4} viewBox="0 0 48 20">
    <Path d="M4 2 L24 18 L44 2" stroke={color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);

const DappRow: React.FC<{
  dapp: { id: string; name: string; desc: string; url: string; activityLevel: string };
  onPress: () => void;
}> = ({ dapp, onPress }) => {
  const activityColor = getActivityColor(dapp.activityLevel as any);
  return (
    <Pressable onPress={onPress} style={styles.dappRow}>
      <Row gap="sm" align="center" style={{ flex: 1 }}>
        <ActivityDot color={activityColor} />
        <Column gap="xs" style={{ flex: 1 }}>
          <Text variant="body" style={{ fontWeight: '600' }}>{dapp.name}</Text>
          <Text variant="caption" style={{ color: colors.text_secondary }}>{dapp.desc}</Text>
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
  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);

  const bobAnim = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const bob = Animated.loop(
      Animated.sequence([
        Animated.timing(bobAnim, { toValue: -4, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bobAnim, { toValue: 4, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bobAnim, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    bob.start();
    return () => { bob.stop(); };
  }, [bobAnim]);

  const trendingDapps = useTrendingDapps();
  const loadedDapps = useMemo(() => {
    if (!trendingDapps) return [];
    return trendingDapps.slice(0, 3).map(d => ({
      id: d.id,
      name: d.name,
      desc: d.desc,
      url: d.url,
      activityLevel: d.activityLevel,
    }));
  }, [trendingDapps]);

  const openBrowser = useCallback((url?: string) => {
    const targetUrl = url || urlInput;
    // If it's a direct zhtp link, open browser. Otherwise, go to results.
    if (targetUrl.startsWith('zhtp://') && targetUrl.length > 7) {
      navigation.navigate('Browser', { url: targetUrl });
    } else {
      navigation.navigate('Web4SearchResults', { query: targetUrl });
    }
  }, [navigation, urlInput]);

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: true }
  );

  const openDomains = useCallback(() => {
    if (currentIdentity) {
      navigation.navigate('SIDTab', { screen: 'MyDomains' });
    } else {
      navigation.navigate('SIDTab');
    }
  }, [currentIdentity, navigation]);

  const drawerItems: DrawerItem[] = useMemo(() => [
    { id: 'pouw', label: 'PoUW Rewards', icon: '', onPress: () => { setDrawerVisible(false); navigation.navigate('SIDTab', { screen: 'PoUW' }); } },
    { id: 'history', label: 'History', icon: '', onPress: () => { setDrawerVisible(false); navigation.navigate('SIDTab', { screen: 'History' }); } },
    { id: 'bookmarks', label: 'Bookmarks', icon: '', onPress: () => { setDrawerVisible(false); navigation.navigate('SIDTab', { screen: 'Bookmarks' }); } },
    { id: 'favorites', label: 'Favorites', icon: '', onPress: () => { setDrawerVisible(false); navigation.navigate('SIDTab', { screen: 'Favorites' }); } },
    { id: 'domains', label: 'My Domains', icon: '', onPress: () => { setDrawerVisible(false); openDomains(); } },
    { id: 'settings', label: 'Settings', icon: '', onPress: () => { setDrawerVisible(false); navigation.navigate('SIDTab', { screen: 'AppSettings' }); } },
  ], [navigation, openDomains]);

  const NOTICE_STYLE: Record<'info' | 'warning' | 'error', { bg: string; border: string; text: string; icon: string }> = {
    error:   { bg: '#3D1515', border: '#7B2020', text: '#FF6B6B', icon: '⚠' },
    warning: { bg: '#3D2E00', border: '#7B5C00', text: '#FFB800', icon: '⚡' },
    info:    { bg: '#0D2D45', border: '#0E4B7A', text: '#4FC3F7', icon: 'ℹ' },
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
      <View style={{ zIndex: 500, position: 'absolute', top: 0, left: 0, right: 0 }}>
        <HeaderBar
          onMenuPress={() => setDrawerVisible(true)}
          onNavigatePouw={() => navigation.navigate('SIDTab', { screen: 'PoUW' })}
          onNavigateExplorer={() => navigation.navigate('ExplorerDashboard')}
          onNavigateDapps={() => navigation.navigate('StoreTab')}
          onNavigateDomains={openDomains}
        />
        {activeNotice && (
          <Pressable
            onPress={() => dismiss(activeNotice.id)}
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: NOTICE_STYLE[activeNotice.level].bg, borderBottomWidth: 1, borderBottomColor: NOTICE_STYLE[activeNotice.level].border, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, gap: spacing.sm }}
          >
            <Text style={{ fontSize: typography.size.sm, color: NOTICE_STYLE[activeNotice.level].text }}>{NOTICE_STYLE[activeNotice.level].icon}</Text>
            <Text style={{ flex: 1, fontSize: typography.size.xs, color: NOTICE_STYLE[activeNotice.level].text, lineHeight: 18 }}>{activeNotice.message}</Text>
            <Text style={{ fontSize: typography.size.md, color: NOTICE_STYLE[activeNotice.level].text, opacity: 0.7 }}>×</Text>
          </Pressable>
        )}
      </View>

      <SideDrawer visible={drawerVisible} onClose={() => setDrawerVisible(false)} items={drawerItems} title="Menu" />

      {/* ── STATIONARY HERO: LOGO + SEARCH ── */}
      <View style={[styles.fixedHeroContainer, { top: FIXED_HERO_TOP }]} pointerEvents="box-none">
        <SShieldLogo size={120} />
        <View style={styles.searchBarWrapper}>
          <View style={styles.searchBarInner}>
            <View style={styles.inputContainer}>
              <TextInput
                placeholder="Search or enter zhtp://..."
                placeholderTextColor={colors.text_placeholder}
                value={urlInput}
                onChangeText={setUrlInput}
                onSubmitEditing={() => openBrowser()}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="go"
                style={styles.textInput}
              />
            </View>
            <Button onPress={() => openBrowser()} size="sm" variant="primary" style={styles.goButton}>
              <ArrowIcon direction="right" size={16} color={colors.text_primary} />
            </Button>
          </View>
        </View>

        {/* Bouncing Indicator - Now positioned under the centered search bar */}
        <Animated.View
          style={[
            styles.indicatorContainer,
            {
              backgroundColor: 'transparent',
              marginTop: spacing.xl,
              opacity: scrollY.interpolate({
                inputRange: [0, 50],
                outputRange: [1, 0],
                extrapolate: 'clamp',
              }),
              transform: [{ translateY: bobAnim }],
            },
          ]}
        >
          <Text style={styles.indicatorText}>Scroll up to browse trending domains</Text>
          <WideChevronDown color={colors.text_secondary} size={18} />
        </Animated.View>
      </View>

      {/* ── CURTAIN (behind hero) ── */}
      <View style={[styles.curtain, { height: HERO_BOTTOM }]} pointerEvents="none" />

      {/* ── SCROLLABLE CONTENT ── */}
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        // Snap only to the Start (Logo) or the Docked point (Apps)
        snapToOffsets={[0, SNAP_TARGET]}
        snapToEnd={false}
        decelerationRate="fast"
        contentContainerStyle={{ paddingBottom: SCREEN_HEIGHT }}
        style={{ flex: 1, zIndex: 1 }}
      >
        {/* Spacer 1: Keeps logo visible */}
        <View style={{ height: HERO_BOTTOM + STICKY_GAP }} />

        {/* Spacer to maintain scroll math now that indicator is absolute */}
        <View style={{ height: INDICATOR_HEIGHT }} />

        {/* Spacer 2: Hidden Zone */}
        <View style={{ height: APPS_SPACER_HEIGHT }} />

        {/* Apps Section: Free-scrollable after the snap */}
        <View style={styles.appsContainer}>
          <Animated.View
            style={{
              transform: [{
                translateY: scrollY.interpolate({
                  inputRange: [SNAP_TARGET, SNAP_TARGET + 1],
                  outputRange: [0, 1],
                  extrapolateLeft: 'clamp',
                }),
              }],
              backgroundColor: colors.bg_darkest,
              zIndex: 100,
              elevation: 4,
              paddingTop: spacing.md + 200,
              marginTop: -(spacing.md + 200),
            }}
          >
            <View style={{ height: STICKY_GAP }} />
            <Text variant="h3" style={styles.appsTitle}>Trending Domains</Text>
          </Animated.View>
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
          {/* Extra min-height ensures you can scroll down the list before hitting the bottom */}
          <View style={{ height: SCREEN_HEIGHT * 0.6 }} />
        </View>
      </Animated.ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  fixedHeroContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 200,
  },
  searchBarWrapper: {
    width: '100%',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  searchBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: SEARCH_BAR_HEIGHT,
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: colors.bg_dark,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    height: 40,
  },
  textInput: {
    flex: 1,
    color: colors.text_primary,
    fontSize: 14,
    paddingVertical: 0,
    height: '100%',
  },
  goButton: {
    width: 36,
    height: 36,
    paddingHorizontal: 0,
    paddingVertical: 0,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
  },
  curtain: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.bg_darkest,
    zIndex: 100,
  },
  indicatorContainer: {
    alignItems: 'center',
    paddingTop: 0,
    backgroundColor: colors.bg_darkest,
    height: 28,
  },
  indicatorText: {
    fontWeight: '600',
    color: colors.text_secondary,
    marginBottom: spacing.xs,
  },
  appsContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.bg_darkest,
    minHeight: SCREEN_HEIGHT,
  },
  appsTitle: {
    marginBottom: spacing.md,
    color: colors.text_primary,
    fontSize: 20,
    fontWeight: '600',
  },
  dappRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.bg_darker,
    marginBottom: spacing.sm,
  },
});

// FORCED REWRITE COMMENT
export default DashboardScreen;
