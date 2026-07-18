import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../../../../theme';

export interface SovTabMastheadProps {
  /** Localised section labels. */
  labels: readonly [string, string, string, string];
  /** 0-based index of the active section. */
  activeIndex: number;
  onChange: (next: number) => void;
}

/**
 * Tab strip: uppercase section label per cell, with a thin underline
 * marking the active tab.
 */
export const SovTabMasthead: React.FC<SovTabMastheadProps> = ({
  labels,
  activeIndex,
  onChange,
}) => {
  return (
    <View style={styles.row}>
      {labels.map((label, idx) => {
        const active = idx === activeIndex;
        return (
          <Pressable
            key={label}
            onPress={() => onChange(idx)}
            style={[
              styles.cell,
              active ? styles.cellActive : null,
            ]}
          >
            <Text
              style={[
                styles.label,
                active ? styles.labelActive : null,
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: colors.bg_darkest,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingTop: spacing.xs,
  },
  cell: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  cellActive: {
    borderBottomColor: colors.primary,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text_secondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  labelActive: {
    color: colors.primary,
  },
});

export default SovTabMasthead;
