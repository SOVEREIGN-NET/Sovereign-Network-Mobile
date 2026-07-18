import React, { useState } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { HeaderBar } from '../../components';
import { SovTabMasthead } from '../../components/organisms/SovSwap';
import RegistryTab from './tabs/RegistryTab';
import MarketplaceTab from './tabs/MarketplaceTab';
import SwapTab from './tabs/SwapTab';
import {
  applySovSwapTheme,
  createSovSwapStyles,
  sovswapColors,
} from './theme/sovswapTokens';
import type { SovDao } from '../../types/sovSwap';
import { useTheme } from '../../context/ThemeContext';
import { colors, spacing } from '../../theme';

const TAB_LABELS: readonly [string, string, string] = [
  'Swap',
  'Registry',
  'Market',
] as const;

export interface SovSwapHomeScreenProps {
  navigation: any;
}

export const SovSwapHomeScreen: React.FC<SovSwapHomeScreenProps> = ({
  navigation,
}) => {
  const { theme } = useTheme();
  applySovSwapTheme(theme as any);
  const [activeTab, setActiveTab] = useState(0); // Default to Swap tab

  const onPickDao = (dao: SovDao) => {
    navigation.navigate('SovSwapDaoDetail', { id: dao.id });
  };
  const onPickMarket = (dao: SovDao) => {
    navigation.navigate('SovSwapMarketDetail', { id: dao.id });
  };

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={theme === 'charcoal' ? 'light-content' : 'dark-content'}
        backgroundColor={colors.bg_darkest}
      />

      <HeaderBar />

      {/* Tab strip */}
      <View style={styles.tabContainer}>
        <SovTabMasthead
          labels={TAB_LABELS as any}
          activeIndex={activeTab}
          onChange={setActiveTab}
        />
      </View>

      {/* Content — keep all three mounted, hide inactive */}
      <View style={styles.content}>
        <View style={[styles.tabSlot, activeTab === 0 ? null : styles.tabHidden]}>
          <SwapTab />
        </View>
        <View style={[styles.tabSlot, activeTab === 1 ? null : styles.tabHidden]}>
          <RegistryTab onPickDao={onPickDao} />
        </View>
        <View style={[styles.tabSlot, activeTab === 2 ? null : styles.tabHidden]}>
          <MarketplaceTab onPickDao={onPickMarket} />
        </View>
      </View>
    </View>
  );
};

const styles = createSovSwapStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg_darkest,
  },
  tabContainer: {
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.bg_darkest,
  },
  content: {
    flex: 1,
    backgroundColor: colors.bg_darkest,
  },
  tabSlot: {
    ...StyleSheet.absoluteFillObject,
  },
  tabHidden: {
    opacity: 0,
    transform: [{ translateX: 99999 }],
  },
}));

export default SovSwapHomeScreen;
