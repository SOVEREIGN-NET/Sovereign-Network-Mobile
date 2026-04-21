import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, borderRadius, shadows } from '../../../theme';

export interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  spacing?: 'sm' | 'md' | 'lg' | 'xl';
}

// Spacing-only styles are theme-independent, so they can live in a
// StyleSheet and benefit from the native-side ID flyweight. The
// theme-dependent card surface itself is built inline per render so
// it re-reads the (mutable) `colors` object whenever the theme flips.
const staticStyles = StyleSheet.create({
  cardSmallSpacing: {
    marginBottom: spacing.sm,
  },
  cardMediumSpacing: {
    marginBottom: spacing.md,
  },
  cardLargeSpacing: {
    marginBottom: spacing.lg,
  },
  cardXLSpacing: {
    marginBottom: spacing.xl,
  },
});

export const Card = React.memo(({ children, style, spacing: spacingProp = 'lg' }: CardProps) => {
  const spacingStyle = {
    sm: staticStyles.cardSmallSpacing,
    md: staticStyles.cardMediumSpacing,
    lg: staticStyles.cardLargeSpacing,
    xl: staticStyles.cardXLSpacing,
  }[spacingProp];

  // Inline theme-dependent styles — StyleSheet.create would snapshot
  // `colors.bg_dark` / `colors.border` at module load and keep the
  // old values after the user toggles the theme. Re-reading them
  // here on every render keeps the card in sync with the live
  // palette.
  const cardSurfaceStyle: ViewStyle = {
    backgroundColor: colors.bg_dark,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.md,
  };

  return (
    <View style={[cardSurfaceStyle, spacingStyle, style]}>
      {children}
    </View>
  );
});

Card.displayName = 'Card';
