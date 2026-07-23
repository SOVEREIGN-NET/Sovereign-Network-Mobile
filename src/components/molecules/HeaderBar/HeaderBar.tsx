/**
 * HeaderBar Component
 * Top navigation bar with:
 *  - Left: hamburger (☰) icon → opens a utility dropdown menu
 *          (Block Explorer, Developer Portal)
 *  - Center: SOV reward counter (display only — navigation removed;
 *            PoUW is now accessible from the dropdown)
 *  - Right: connection status indicator
 *
 * The hamburger dropdown replaces the previous SideDrawer "Menu" button
 * in screens that use it as a utility nav. Screens that still want a
 * full side drawer should continue passing onMenuPress separately.
 */

import React, { useEffect, useState, useRef } from 'react';
import { View, Pressable, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Text, Row } from '../../atoms';
import { colors, spacing, typography, shadows } from '../../../theme';
import { useTranslation } from '../../../i18n';
import { useNodeConnectionStatus } from '../../../hooks/useNodeConnectionStatus';
import { useRewardCounter } from '../../../hooks/useRewardCounter';

export interface HeaderBarProps {
  title?: string;
  onMenuPress?: () => void;
  onBackPress?: () => void;
  sovAddress?: string;
  isConnected?: boolean;
  onConnectionStatusChange?: (connected: boolean, latencyMs?: number) => void;
  /** Still fired on SOV counter tap, but by default the parent no longer
   *  navigates to PoUW — that's now in the dropdown. */
  onBalancePress?: () => void;
  showHamburger?: boolean;
  /** Optional overrides for the standard hamburger dropdown menu actions.
   *  If not provided, the HeaderBar uses its own internal navigation logic. */
  onNavigateExplorer?: () => void;
  onNavigatePouw?: () => void;
  onNavigateDevPortal?: () => void;
}

const HeaderBar: React.FC<HeaderBarProps> = ({
  title,
  onMenuPress,
  onBackPress,
  sovAddress,
  isConnected: isConnectedProp,
  onConnectionStatusChange,
  onBalancePress,
  showHamburger = true,
  onNavigateExplorer,
  onNavigatePouw,
  onNavigateDevPortal,
}) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { t } = useTranslation();

  // SOV reward counter
  const { displayBalance, maturesAt } = useRewardCounter();

  // Dropdown state
  const [dropdownVisible, setDropdownVisible] = useState(false);

  // Maturation banner — dismiss on tap or after 10s; reappears if maturesAt changes
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setBannerDismissed(false);
    if (maturesAt) {
      bannerTimerRef.current = setTimeout(() => setBannerDismissed(true), 10_000);
    }
    return () => {
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    };
  }, [maturesAt]);

  const sovLabel = (() => {
    if (!maturesAt) return `SOV ${displayBalance}`;
    const remaining = maturesAt - Math.floor(Date.now() / 1000);
    if (remaining <= 0) return `SOV ${displayBalance}`;
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const countdown = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    return `Eligible in ${countdown}`;
  })();

  // Connection status from hook - auto-check on startup
  const { connectionStatus, latencyMs } = useNodeConnectionStatus(true);

  // Use prop if provided, otherwise use hook state
  const isConnected = isConnectedProp ?? connectionStatus === 'connected';

  // Notify parent of connection status changes
  useEffect(() => {
    onConnectionStatusChange?.(isConnected, latencyMs ?? undefined);
  }, [isConnected, latencyMs, onConnectionStatusChange]);

  // Get status text
  const getStatusText = () => {
    if (connectionStatus === 'checking') {
      return t.headerbar.checking;
    }
    if (connectionStatus === 'idle') {
      return t.headerbar.notChecked;
    }
    if (isConnected && latencyMs !== null) {
      return `${latencyMs}ms`;
    }
    return isConnected ? t.headerbar.connected : t.headerbar.offline;
  };

  const handleDropdownItem = (action: string) => {
    setDropdownVisible(false);
    switch (action) {
      case 'explorer':
        onNavigateExplorer ? onNavigateExplorer() : navigation.navigate('MainTabs', { screen: 'DashboardTab', params: { screen: 'ExplorerDashboard' } });
        break;
      case 'devPortal':
        onNavigateDevPortal ? onNavigateDevPortal() : navigation.navigate('MainTabs', { screen: 'DashboardTab', params: { screen: 'DeveloperPortal' } });
        break;
      case 'myStorage':
        navigation.navigate('MainTabs', { screen: 'DashboardTab', params: { screen: 'MyStorage' } });
        break;
    }
  };

  const styles = StyleSheet.create({
    container: {
      backgroundColor: colors.bg_dark,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xs + insets.top,
      paddingBottom: spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      ...shadows.sm,
      zIndex: 100,
    },
    contentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'relative',
      minHeight: 32,
    },
    sideSlot: {
      minWidth: 92,
      flexDirection: 'row',
      alignItems: 'center',
    },
    leftSlot: {
      justifyContent: 'flex-start',
    },
    rightSlot: {
      justifyContent: 'flex-end',
    },
    hamburger: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    hamburgerIcon: {
      width: 24,
      height: 20,
      justifyContent: 'space-between',
    },
    hamburgerLine: {
      height: 2.5,
      backgroundColor: colors.text_primary,
      borderRadius: 2,
    },
    centerSection: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      gap: spacing.md,
    },
    addressText: {
      fontSize: typography.size.md,
      fontWeight: typography.weight.normal,
      color: colors.text_primary,
      textAlign: 'center',
    },
    sovLabel: {
      fontSize: typography.size.md,
      fontWeight: typography.weight.medium,
      color: colors.text_primary,
    },
    titleText: {
      fontSize: typography.size.lg,
      fontWeight: typography.weight.bold,
      color: colors.primary,
      letterSpacing: 0.5,
    },
    statusIndicator: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: spacing.sm,
    },
    statusConnected: {
      backgroundColor: colors.success,
    },
    statusDisconnected: {
      backgroundColor: colors.error,
    },
    statusChecking: {
      backgroundColor: colors.warning,
    },
    statusIdle: {
      backgroundColor: colors.text_secondary,
    },
    rightSection: {
      padding: spacing.sm,
      marginRight: 0,
    },
    maturationBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.warning + '22',
      borderRadius: 6,
      paddingVertical: 4,
      paddingHorizontal: spacing.sm,
      marginTop: spacing.xs,
    },
    maturationBannerText: {
      fontSize: typography.size.sm,
      color: colors.warning,
      flex: 1,
    },
    maturationBannerDismiss: {
      fontSize: typography.size.sm,
      color: colors.warning,
      paddingLeft: spacing.sm,
      opacity: 0.7,
    },
    dropdownOverlay: {
      flex: 1,
    },
    dropdownMenu: {
      position: 'absolute',
      top: insets.top + 44,
      left: spacing.sm,
      backgroundColor: colors.bg_darker,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      minWidth: 220,
      paddingVertical: spacing.xs,
      ...shadows.md,
    },
    dropdownItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
    },
    dropdownItemText: {
      fontSize: typography.size.md,
      color: colors.text_primary,
      fontWeight: '500',
    },
  });

  // Simple SVG icons for the dropdown menu
  const ExplorerIcon = () => (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={colors.text_primary} strokeWidth={1.5} />
      <Path d="M12 3a9 9 0 0 1 9 9" stroke={colors.text_primary} strokeWidth={1.5} />
      <Path d="M12 21a9 9 0 0 0 9-9" stroke={colors.text_primary} strokeWidth={1.5} />
      <Path d="M3 12h18" stroke={colors.text_primary} strokeWidth={1.5} />
      <Path d="M12 3v18" stroke={colors.text_primary} strokeWidth={1.5} />
    </Svg>
  );

  const DevPortalIcon = () => (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M16 18l6-6-6-6M8 6l-6 6 6 6"
        stroke={colors.text_primary}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );

  const DomainsIcon = () => (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M4 4h6v16H4z" stroke={colors.text_primary} strokeWidth={1.5} />
      <Path d="M14 4h6v16h-6z" stroke={colors.text_primary} strokeWidth={1.5} />
      <Path d="M4 12h16" stroke={colors.text_primary} strokeWidth={1.5} />
      <Path d="M8 4V2" stroke={colors.text_primary} strokeWidth={1.5} strokeLinecap="round" />
      <Path d="M16 4V2" stroke={colors.text_primary} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );

  const StorageIcon = () => (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M3 15h18v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4z" stroke={colors.text_primary} strokeWidth={1.5} />
      <Path d="M3 10h18v4H3v-4z" stroke={colors.text_primary} strokeWidth={1.5} />
      <Path d="M3 5h18v4H3V5z" stroke={colors.text_primary} strokeWidth={1.5} />
      <Circle cx="6" cy="12.5" r="0.5" fill={colors.text_primary} />
      <Circle cx="6" cy="17.5" r="0.5" fill={colors.text_primary} />
      <Circle cx="6" cy="7.5" r="0.5" fill={colors.text_primary} />
    </Svg>
  );

  const dropdownItems = [
    { id: 'explorer', label: 'Block Explorer', icon: ExplorerIcon },
    { id: 'devPortal', label: 'Developer Portal', icon: DevPortalIcon },
    { id: 'myStorage', label: 'My Storage', icon: StorageIcon },
  ];

  return (
    <View style={styles.container}>
      <Row style={styles.contentRow}>
        {/* Left slot: renders hamburger when enabled, otherwise empty
            placeholder to keep the right slot pinned to the right */}
        <View style={[styles.sideSlot, styles.leftSlot]}>
          {onBackPress ? (
            <TouchableOpacity
              onPress={onBackPress}
              style={styles.hamburger}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Go back"
            >
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M19 12H5M5 12L12 19M5 12L12 5"
                  stroke={colors.primary}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </TouchableOpacity>
          ) : showHamburger && (
            <Pressable
              onPress={() => (onMenuPress ? onMenuPress() : setDropdownVisible(true))}
              style={styles.hamburger}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Open navigation menu"
            >
              <View style={styles.hamburgerIcon}>
                <View style={styles.hamburgerLine} />
                <View style={styles.hamburgerLine} />
                <View style={styles.hamburgerLine} />
              </View>
            </Pressable>
          )}
        </View>

        {/* Center: SOV Balance Counter — display only by default; parent
            can pass onBalancePress for custom behavior (default: no-op) */}
        {title ? (
          <View style={styles.centerSection} pointerEvents="none">
            <Text style={styles.titleText}>{title}</Text>
          </View>
        ) : (
          <Pressable
            onPress={onBalancePress}
            style={styles.centerSection}
            pointerEvents="box-none"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.sovLabel}>{sovLabel}</Text>
          </Pressable>
        )}

        {/* Right: Connection Status */}
        <View style={[styles.sideSlot, styles.rightSlot]}>
          <Row style={styles.rightSection}>
            <View
              style={[
                styles.statusIndicator,
                connectionStatus === 'checking'
                  ? styles.statusChecking
                  : connectionStatus === 'idle'
                  ? styles.statusIdle
                  : isConnected
                  ? styles.statusConnected
                  : styles.statusDisconnected,
              ]}
            />
            <Text style={{ color: colors.text_secondary }}>
              {getStatusText()}
            </Text>
          </Row>
        </View>
      </Row>

      {/* Maturation banner — shown when identity is too new for rewards */}
      {maturesAt && !bannerDismissed && (() => {
        const remaining = maturesAt - Math.floor(Date.now() / 1000);
        if (remaining <= 0) return null;
        const hours = Math.ceil(remaining / 3600);
        return (
          <Pressable style={styles.maturationBanner} onPress={() => setBannerDismissed(true)}>
            <Text style={styles.maturationBannerText}>
              {'⏳ Rewards available in ~' + hours + (hours === 1 ? ' hour' : ' hours')}
            </Text>
            <Text style={styles.maturationBannerDismiss}>✕</Text>
          </Pressable>
        );
      })()}

      {/* Utility Dropdown — triggered by hamburger icon */}
      <Modal
        visible={dropdownVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDropdownVisible(false)}
      >
        <TouchableOpacity
          style={styles.dropdownOverlay}
          activeOpacity={1}
          onPress={() => setDropdownVisible(false)}
        >
          <View style={styles.dropdownMenu}>
            {dropdownItems.map((item, idx) => (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.dropdownItem,
                  idx < dropdownItems.length - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border + '40',
                  },
                ]}
                onPress={() => handleDropdownItem(item.id)}
              >
                <View style={{ marginRight: spacing.sm, width: 20, alignItems: 'center' }}>
                  <item.icon />
                </View>
                <Text style={styles.dropdownItemText}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

export default HeaderBar;
