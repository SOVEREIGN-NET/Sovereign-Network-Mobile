import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, typography, borderRadius } from '../../../theme';

export type BadgeVariant = 'primary' | 'success' | 'error' | 'warning' | 'info' | 'default';
export type BadgeSize = 'sm' | 'md' | 'lg';

export interface BadgeProps {
  label: string | number;
  variant?: BadgeVariant;
  size?: BadgeSize;
  style?: ViewStyle;
  icon?: string;
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: borderRadius.full,
  },
  // Variants
  primary: {
    backgroundColor: '#006688',
  },
  success: {
    backgroundColor: colors.success,
  },
  error: {
    backgroundColor: colors.error,
  },
  warning: {
    backgroundColor: colors.warning,
  },
  info: {
    backgroundColor: colors.info,
  },
  default: {
    backgroundColor: colors.bg_medium,
  },
  // Sizes
  smBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  mdBadge: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  lgBadge: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  // Text sizes
  smText: {
    fontSize: typography.size.xs,
    fontWeight: '600' as const,
  },
  mdText: {
    fontSize: typography.size.sm,
    fontWeight: '600' as const,
  },
  lgText: {
    fontSize: typography.size.md,
    fontWeight: 'bold' as const,
  },
  // Text colors
  primaryText: {
    color: colors.black,
  },
  defaultText: {
    color: colors.text_primary,
  },
  lightText: {
    color: colors.white,
  },
  icon: {
    fontSize: typography.size.md,
  },
});

export const Badge = React.memo(
  ({
    label,
    variant = 'default',
    size = 'md',
    icon,
    style,
  }: BadgeProps) => {
    const variantStyle = {
      primary: styles.primary,
      success: styles.success,
      error: styles.error,
      warning: styles.warning,
      info: styles.info,
      default: styles.default,
    }[variant];

    const sizeStyle = {
      sm: styles.smBadge,
      md: styles.mdBadge,
      lg: styles.lgBadge,
    }[size];

    const textSize = {
      sm: styles.smText,
      md: styles.mdText,
      lg: styles.lgText,
    }[size];

    const textColor =
      variant === 'primary'
        ? styles.lightText
        : variant === 'default'
          ? styles.defaultText
          : styles.lightText;

    return (
      <View style={[styles.badge, variantStyle, sizeStyle, style]}>
        {icon && <Text style={styles.icon}>{icon}</Text>}
        <Text style={[textSize, textColor]}>{label}</Text>
      </View>
    );
  },
);

Badge.displayName = 'Badge';
