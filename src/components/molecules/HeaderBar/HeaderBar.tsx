/**
 * HeaderBar Component
 * Top navigation bar with hamburger menu, BLE button, and connection status
 * Used in Dashboard/Browser screens
 */

import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { Text, Row } from '../../atoms';
import { colors, spacing, typography, borderRadius, shadows, gradientAccents } from '../../../theme';
import { useTranslation } from '../../../i18n';

export interface HeaderBarProps {
  onMenuPress: () => void;
  onBLEPress: () => void;
  sovAddress?: string;
  isConnected?: boolean;
}

const HeaderBar: React.FC<HeaderBarProps> = ({
  onMenuPress,
  onBLEPress,
  sovAddress = 'SOV:1729.1',
  isConnected = true,
}) => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

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
    bleButton: {
      backgroundColor: colors.bg_darker,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.base,
      borderWidth: 1,
      borderColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    bleButtonText: {
      fontSize: typography.size.xs,
      fontWeight: typography.weight.semibold,
      color: colors.primary,
    },
    addressText: {
      fontSize: typography.size.xs,
      color: colors.text_secondary,
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
    rightSection: {
      padding: spacing.sm,
      marginRight: -spacing.sm,
    },
  });

  return (
    <View>
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

        {/* Center: BLE Button & Address - Horizontal */}
        <View style={styles.centerSection}>
          <Pressable
            onPress={onBLEPress}
            style={({ pressed }) => [
              styles.bleButton,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.bleButtonText}>{t.headerbar.ble}</Text>
          </Pressable>
          <Text style={styles.addressText}>{sovAddress}</Text>
        </View>

        {/* Right: Connection Status */}
        <View
          style={styles.rightSection}
        >
          <Row>
            <View
              style={[
                styles.statusIndicator,
                isConnected
                  ? styles.statusConnected
                  : styles.statusDisconnected,
              ]}
            />
            <Text
              style={{
                fontSize: typography.size.xs,
                color: isConnected
                  ? colors.success
                  : colors.error,
                fontWeight: typography.weight.semibold,
              }}
            >
              {isConnected ? t.headerbar.connected : t.headerbar.offline}
            </Text>
          </Row>
        </View>
      </Row>
      </View>
      {/* Subtle gradient accent line */}
      <LinearGradient
        colors={[gradientAccents.gradient_start, gradientAccents.gradient_end]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{
          height: 1,
          opacity: 0.3,
        }}
      />
    </View>
  );
};

export default HeaderBar;
