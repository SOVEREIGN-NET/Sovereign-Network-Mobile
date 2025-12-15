/**
 * HeaderBar Component
 * Top navigation bar with hamburger menu, balance text, and connection status
 * Used in Dashboard/Browser screens
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, Row } from '../../atoms';
import { colors, spacing, typography, shadows } from '../../../theme';
import { useTranslation } from '../../../i18n';
import QuicClient from '../../../services/QuicClient';
import { DEFAULT_NODE_HOST, DEFAULT_NODE_PORT } from '../../../config';

export interface HeaderBarProps {
  onMenuPress: () => void;
  sovAddress?: string;
  isConnected?: boolean;
  onConnectionStatusChange?: (connected: boolean, latencyMs?: number) => void;
}

const HeaderBar: React.FC<HeaderBarProps> = ({
  onMenuPress,
  sovAddress = 'SOV',
  isConnected: isConnectedProp,
  onConnectionStatusChange,
}) => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  // Connection state
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  // Use prop if provided, otherwise use internal state
  const isConnected = isConnectedProp ?? connectionStatus === 'connected';

  // Check QUIC node reachability (UDP-based, doesn't require full PQC handshake)
  const checkNodeConnection = useCallback(async () => {
    try {
      // First check if QUIC is supported
      const supported = await QuicClient.isSupported();
      if (!supported) {
        console.warn('QUIC not supported on this device');
        setConnectionStatus('disconnected');
        onConnectionStatusChange?.(false);
        return;
      }

      // Check node reachability via UDP (simpler than full QUIC handshake)
      setConnectionStatus('checking');
      const result = await QuicClient.checkReachability(DEFAULT_NODE_HOST, DEFAULT_NODE_PORT);

      if (result.reachable) {
        setConnectionStatus('connected');
        setLatencyMs(result.latencyMs ? Math.round(result.latencyMs) : null);
        onConnectionStatusChange?.(true, result.latencyMs);
        console.log(`Node reachable at ${DEFAULT_NODE_HOST}:${DEFAULT_NODE_PORT} (${result.latencyMs ? Math.round(result.latencyMs) + 'ms' : 'unknown latency'})`);
      } else {
        setConnectionStatus('disconnected');
        setLatencyMs(null);
        onConnectionStatusChange?.(false);
        console.log(`Node not reachable: ${result.error}`);
      }
    } catch (error) {
      console.warn('Node reachability check failed:', error);
      setConnectionStatus('disconnected');
      setLatencyMs(null);
      onConnectionStatusChange?.(false);
    }
  }, [onConnectionStatusChange]);

  // Check connection on mount and periodically
  useEffect(() => {
    // Skip auto-check if isConnected is controlled externally
    if (isConnectedProp !== undefined) {
      return;
    }

    checkNodeConnection();

    // Re-check every 30 seconds
    const interval = setInterval(checkNodeConnection, 30000);
    return () => clearInterval(interval);
  }, [checkNodeConnection, isConnectedProp]);

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

        {/* Center: Address */}
        <View style={[styles.centerSection, styles.centerJustify]}>
          <Text style={styles.addressText}>{sovAddress}</Text>
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
