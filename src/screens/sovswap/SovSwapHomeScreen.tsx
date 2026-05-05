import React, { useState } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SovTabMasthead } from '../../components/organisms/SovSwap';
import RegistryTab from './tabs/RegistryTab';
import CreateDaoTab from './tabs/CreateDaoTab';
import MarketplaceTab from './tabs/MarketplaceTab';
import SwapTab from './tabs/SwapTab';
import {
  applySovSwapTheme,
  createSovSwapStyles,
  sovswapColors,
  sovswapSpacing,
  sovswapType,
} from './theme/sovswapTokens';
import type { SovDao } from '../../types/sovSwap';
import { useTheme } from '../../context/ThemeContext';

const TAB_LABELS: readonly [string, string, string, string] = [
  'Registry',
  "DAO's",
  'Market',
  'Swap',
] as const;

export interface SovSwapHomeScreenProps {
  navigation: any;
}

/**
 * The SovSwap publication's cover page. A title strip with masthead,
 * a Roman-numeral tab bar, and a single content viewport. Tabs stay
 * mounted so list scroll positions and form draft state persist as
 * the user pages between sections — like flipping back and forth
 * inside a bound register.
 */
export const SovSwapHomeScreen: React.FC<SovSwapHomeScreenProps> = ({
  navigation,
}) => {
  const { theme } = useTheme();
  // Sync the SovSwap palette to the active host theme on every render.
  // Idempotent — same input yields the same mutation. Done in render
  // (not useEffect) so children read the right palette on the very
  // first paint, no flash. The Proxy stylesheet detects the sentinel
  // change and rebuilds.
  applySovSwapTheme(theme);
  const [activeTab, setActiveTab] = useState(0);

  const onPickDao = (dao: SovDao) => {
    navigation.navigate('SovSwapDaoDetail', { id: dao.id });
  };
  const onPickMarket = (dao: SovDao) => {
    navigation.navigate('SovSwapMarketDetail', { id: dao.id });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar
        barStyle={theme === 'charcoal' ? 'light-content' : 'dark-content'}
        backgroundColor={sovswapColors.paper}
      />
      {/* Masthead title strip */}
      <View style={styles.masthead}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <View style={styles.mastheadCenter}>
          <Text style={styles.mastheadTitle}>SovSwap</Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      {/* Tab strip */}
      <SovTabMasthead
        labels={TAB_LABELS}
        activeIndex={activeTab}
        onChange={setActiveTab}
      />

      {/* Content — keep all four mounted, hide inactive */}
      <View style={styles.content}>
        <View style={[styles.tabSlot, activeTab === 0 ? null : styles.tabHidden]}>
          <RegistryTab onPickDao={onPickDao} />
        </View>
        <View style={[styles.tabSlot, activeTab === 1 ? null : styles.tabHidden]}>
          <CreateDaoTab />
        </View>
        <View style={[styles.tabSlot, activeTab === 2 ? null : styles.tabHidden]}>
          <MarketplaceTab onPickDao={onPickMarket} />
        </View>
        <View style={[styles.tabSlot, activeTab === 3 ? null : styles.tabHidden]}>
          <SwapTab />
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = createSovSwapStyles(() => StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: sovswapColors.paper,
  },
  masthead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: sovswapSpacing.lg,
    paddingTop: sovswapSpacing.sm,
    paddingBottom: sovswapSpacing.lg,
    backgroundColor: sovswapColors.paper,
  },
  backBtn: {
    width: 90,
    paddingVertical: 4,
  },
  backText: {
    ...sovswapType.smallCapsInk,
    color: sovswapColors.paperInkSoft,
    fontSize: 11,
  },
  mastheadCenter: {
    flex: 1,
    alignItems: 'center',
  },
  mastheadTitle: {
    ...sovswapType.masthead,
    fontSize: 22,
  },
  content: {
    flex: 1,
    backgroundColor: sovswapColors.paper,
  },
  tabSlot: {
    ...StyleSheet.absoluteFillObject,
  },
  tabHidden: {
    opacity: 0,
    // Pointer-events disabled implicitly because Pressable bubbles
    // through opacity:0 in some RN versions; we also push it off-screen
    // via translation to be safe.
    transform: [{ translateX: 99999 }],
  },
}));

export default SovSwapHomeScreen;
