import React from 'react';
import { View, StyleSheet, ViewStyle, FlexAlignType } from 'react-native';
import { spacing } from '../../../theme';

export interface ColumnProps {
  children: React.ReactNode;
  gap?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  align?: FlexAlignType;
  justify?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly';
  flex?: number;
  style?: ViewStyle;
}

const styles = StyleSheet.create({
  column: {
    flexDirection: 'column',
  },
});

const gapMap = {
  xs: spacing.xs,
  sm: spacing.sm,
  md: spacing.md,
  lg: spacing.lg,
  xl: spacing.xl,
};

export const Column = React.memo(
  ({
    children,
    gap = 'md',
    align = 'stretch',
    justify = 'flex-start',
    flex,
    style,
  }: ColumnProps) => {
    const gapValue = gapMap[gap];

    return (
      <View
        style={[
          styles.column,
          {
            gap: gapValue,
            alignItems: align,
            justifyContent: justify,
            ...(flex !== undefined && { flex }),
          },
          style,
        ]}
      >
        {children}
      </View>
    );
  },
);

Column.displayName = 'Column';
