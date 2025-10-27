import React from 'react';
import { View, StyleSheet, ViewStyle, FlexAlignType } from 'react-native';
import { spacing } from '../../../theme';

export interface RowProps {
  children: React.ReactNode;
  gap?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  align?: FlexAlignType | 'space-between' | 'space-around' | 'center';
  justify?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly';
  wrap?: boolean;
  style?: ViewStyle;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

const gapMap = {
  xs: spacing.xs,
  sm: spacing.sm,
  md: spacing.md,
  lg: spacing.lg,
  xl: spacing.xl,
};

export const Row = React.memo(
  ({
    children,
    gap = 'md',
    align = 'center',
    justify = 'flex-start',
    wrap = false,
    style,
  }: RowProps) => {
    const gapValue = gapMap[gap];
    const alignMap =
      align === 'space-between' || align === 'space-around' || align === 'center'
        ? 'center'
        : (align as FlexAlignType);

    return (
      <View
        style={[
          styles.row,
          {
            gap: gapValue,
            alignItems: alignMap,
            justifyContent: justify,
            flexWrap: wrap ? 'wrap' : 'nowrap',
          },
          style,
        ]}
      >
        {children}
      </View>
    );
  },
);

Row.displayName = 'Row';
