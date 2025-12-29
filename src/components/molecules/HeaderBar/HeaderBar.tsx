/**
 * HeaderBar Component
 * Top navigation bar with hamburger menu, balance text, and connection status
 * Used in Dashboard/Browser screens
 */

import React, { useEffect } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, Row } from '../../atoms';
import { colors, spacing, typography, shadows } from '../../../theme';
import { useTranslation } from '../../../i18n';
import { useNodeConnectionStatus } from '../../../hooks/useNodeConnectionStatus';
import { useRewardCounter } from '../../../hooks/useRewardCounter';

export interface HeaderBarProps {
  onMenuPress: () => void;
  sovAddress?: string;
  isConnected?: boolean;
  onConnectionStatusChange?: (connected: boolean, latencyMs?: number) => void;
}

const HeaderBar: React.FC<HeaderBarProps> = ({
  onMenuPress,
  sovAddress,
  isConnected: isConnectedProp,
  onConnectionStatusChange,
}) => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  // SOV reward counter - slow drip
  const { displayBalance } = useRewardCounter();

  // Connection status from hook
  const { connectionStatus, latencyMs } = useNodeConnectionStatus(isConnectedProp === undefined);

  // Use prop if provided, otherwise use hook state
  const isConnected = isConnectedProp ?? connectionStatus === 'connected';

  // Notify parent of connection status changes
  useEffect(() => {
    onConnectionStatusChange?.(isConnected, latencyMs ?? undefined);
  }, [isConnected, latencyMs, onConnectionStatusChange]);

  // Get status text
  const getStatusText = () => {
    if (connectionStatus === 'checking') {
      return 'Checking...';
    }
    if (isConnected && latencyMs !== null) {
      return `${latencyMs}ms`;
    }
    return isConnected ? t.headerbar.connected : t.headerbar.offline;
  };

  const styles = StyleSheet.create({
    container: {
      backgroundColor: colors.bg_dark,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md + insets.top,
      paddingBottom: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      ...shadows.sm,
    },
    contentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    hamburger: {
      padding: spacing.sm,
      marginLeft: -spacing.sm,
    },
    hamburgerIcon: {
      width: 24,
      height: 20,
      justifyContent: 'space-between',
    },
    hamburgerLine: {
      height: 2,
      backgroundColor: colors.text_primary,
      borderRadius: 1,
    },
    centerSection: {
      flex: 1,
      alignItems: 'center',
      marginHorizontal: spacing.md,
      flexDirection: 'row',
      gap: spacing.md,
    },
    centerJustify: {
      justifyContent: 'center',
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
    rightSection: {
      padding: spacing.sm,
      marginRight: -spacing.sm,
    },
  });

  return (
    <View style={styles.container}>
      <Row style={styles.contentRow}>
        {/* Hamburger Menu */}
        <Pressable
          onPress={onMenuPress}
          style={styles.hamburger}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <View style={styles.hamburgerIcon}>
            <View style={styles.hamburgerLine} />
            <View style={styles.hamburgerLine} />
            <View style={styles.hamburgerLine} />
          </View>
        </Pressable>

        {/* Center: SOV Balance Counter */}
        <View style={[styles.centerSection, styles.centerJustify]}>
          <Text style={styles.sovLabel}>SOV {displayBalance}</Text>
        </View>

        {/* Right: Connection Status */}
        <Row style={styles.rightSection}>
          <View
            style={[
              styles.statusIndicator,
              connectionStatus === 'checking'
                ? styles.statusChecking
                : isConnected
                  ? styles.statusConnected
                  : styles.statusDisconnected,
            ]}
          />
          <Text style={{ color: colors.text_secondary }}>{getStatusText()}</Text>
        </Row>
      </Row>
    </View>
  );
};

export default HeaderBar;
