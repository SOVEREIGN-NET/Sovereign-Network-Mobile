import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { spacing } from '../../../theme';

export type SpacerSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';

export interface SpacerProps {
  size?: SpacerSize;
  horizontal?: boolean;
  style?: ViewStyle;
}

const styles = StyleSheet.create({
  spacer: {},
});

const sizeMap: Record<SpacerSize, number> = {
  xs: spacing.xs,
  sm: spacing.sm,
  md: spacing.md,
  lg: spacing.lg,
  xl: spacing.xl,
  '2xl': spacing['2xl'],
  '3xl': spacing['3xl'],
};

export const Spacer = React.memo(
  ({ size = 'md', horizontal = false, style }: SpacerProps) => {
    const sizeValue = sizeMap[size];

    return (
      <View
        style={[
          styles.spacer,
          horizontal ? { width: sizeValue } : { height: sizeValue },
          style,
        ]}
      />
    );
  },
);

Spacer.displayName = 'Spacer';
