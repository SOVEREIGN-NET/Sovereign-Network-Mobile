import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, borderRadius } from '../../../theme';

export interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  spacing?: 'sm' | 'md' | 'lg' | 'xl';
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bg_dark,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
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
    sm: styles.cardSmallSpacing,
    md: styles.cardMediumSpacing,
    lg: styles.cardLargeSpacing,
    xl: styles.cardXLSpacing,
  }[spacingProp];

  return (
    <View style={[styles.card, spacingStyle, style]}>
      {children}
    </View>
  );
});

Card.displayName = 'Card';
