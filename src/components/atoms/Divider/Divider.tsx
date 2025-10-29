import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '../../../theme';

export interface DividerProps {
  color?: string;
  thickness?: number;
  vertical?: boolean;
  style?: ViewStyle;
}

const styles = StyleSheet.create({
  divider: {
    backgroundColor: colors.border,
  },
});

export const Divider = React.memo(
  ({
    color = colors.border,
    thickness = 1,
    vertical = false,
    style,
  }: DividerProps) => {
    return (
      <View
        style={[
          styles.divider,
          vertical
            ? { width: thickness, alignSelf: 'stretch', height: '100%' }
            : { height: thickness, width: '100%' },
          { backgroundColor: color },
          style,
        ]}
      />
    );
  },
);

Divider.displayName = 'Divider';
