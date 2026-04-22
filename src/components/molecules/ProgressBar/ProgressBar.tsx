import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, typography, borderRadius } from '../../../theme';

export interface ProgressBarProps {
  percentage: number;
  label?: string;
  color?: string;
  backgroundColor?: string;
  height?: number;
  showPercentage?: boolean;
  style?: ViewStyle;
}

// Build at render time so theme-dependent colours track `applyTheme`.
const makeStyles = () => StyleSheet.create({
  container: {
    marginVertical: spacing.sm,
  },
  labelContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: typography.size.sm,
    color: colors.text_secondary,
    fontWeight: '500' as const,
  },
  percentageText: {
    fontSize: typography.size.sm,
    color: colors.text_primary,
    fontWeight: '600' as const,
  },
  barContainer: {
    width: '100%',
    backgroundColor: colors.bg_medium,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  fill: {
    height: 8,
    borderRadius: borderRadius.sm,
  },
});

export const ProgressBar = React.memo(
  ({
    percentage,
    label,
    color = colors.primary,
    backgroundColor = colors.bg_medium,
    height = 8,
    showPercentage = true,
    style,
  }: ProgressBarProps) => {
    const styles = makeStyles();
    // Clamp percentage between 0 and 100
    const clampedPercentage = Math.min(Math.max(percentage, 0), 100);

    return (
      <View style={[styles.container, style]}>
        {(label || showPercentage) && (
          <View style={styles.labelContainer}>
            {label && <Text style={styles.label}>{label}</Text>}
            {showPercentage && (
              <Text style={styles.percentageText}>{Math.round(clampedPercentage)}%</Text>
            )}
          </View>
        )}
        <View style={[styles.barContainer, { backgroundColor, height }]}>
          <View
            style={[
              styles.fill,
              {
                width: `${clampedPercentage}%`,
                backgroundColor: color,
                height,
              },
            ]}
          />
        </View>
      </View>
    );
  },
);

ProgressBar.displayName = 'ProgressBar';
