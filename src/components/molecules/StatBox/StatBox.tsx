import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, typography, borderRadius } from '../../../theme';

export interface StatBoxProps {
  label: string;
  value: string | number;
  icon?: string;
  color?: string;
  style?: ViewStyle;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bg_dark,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 100,
  },
  iconContainer: {
    fontSize: typography.size['3xl'],
    marginBottom: spacing.sm,
  },
  value: {
    fontSize: typography.size['3xl'],
    fontWeight: 'bold' as const,
    color: colors.text_primary,
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: typography.size.sm,
    color: colors.text_secondary,
    textAlign: 'center',
    fontWeight: '500' as const,
  },
});

export const StatBox = React.memo(
  ({ label, value, icon, color, style }: StatBoxProps) => {
    return (
      <View style={[styles.container, color && { borderColor: color }, style]}>
        {icon && <Text style={styles.iconContainer}>{icon}</Text>}
        <Text style={[styles.value, color && { color }]}>{value}</Text>
        <Text style={styles.label}>{label}</Text>
      </View>
    );
  },
);

StatBox.displayName = 'StatBox';
