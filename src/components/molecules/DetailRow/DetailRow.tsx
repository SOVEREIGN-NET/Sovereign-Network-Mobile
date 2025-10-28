import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, typography } from '../../../theme';

export interface DetailRowProps {
  label: string;
  value: string | number;
  valueColor?: string;
  style?: ViewStyle;
  emphasized?: boolean;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  label: {
    fontSize: typography.size.sm,
    color: colors.text_secondary,
    fontWeight: '500' as const,
  },
  labelEmphasized: {
    fontWeight: '600' as const,
    color: colors.text_primary,
  },
  value: {
    fontSize: typography.size.md,
    color: colors.text_primary,
    fontWeight: '600' as const,
    marginLeft: spacing.md,
    flex: 1,
    textAlign: 'right',
  },
  valueEmphasized: {
    fontSize: typography.size.lg,
    fontWeight: 'bold' as const,
  },
});

export const DetailRow = React.memo(
  ({
    label,
    value,
    valueColor,
    style,
    emphasized = false,
  }: DetailRowProps) => {
    const labelStyle = [styles.label, emphasized && styles.labelEmphasized];
    const valueStyle = [
      styles.value,
      emphasized && styles.valueEmphasized,
      valueColor && { color: valueColor },
    ];

    return (
      <View style={[styles.row, style]}>
        <Text style={labelStyle}>{label}</Text>
        <Text style={valueStyle}>{value}</Text>
      </View>
    );
  },
);

DetailRow.displayName = 'DetailRow';
