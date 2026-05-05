import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  createSovSwapStyles,
  sovswapColors,
  sovswapSpacing,
  sovswapType,
} from '../../../../screens/sovswap/theme/sovswapTokens';

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
            android_ripple={{ color: sovswapColors.ruleSoft, borderless: true }}
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

const styles = createSovSwapStyles(() => StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: sovswapColors.paper,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: sovswapColors.ruleSoft,
  },
  cell: {
    flex: 1,
    paddingVertical: sovswapSpacing.md,
    paddingHorizontal: sovswapSpacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellActive: {
    backgroundColor: sovswapColors.paperEdge,
  },
  label: {
    ...sovswapType.smallCapsInk,
    fontSize: 11,
    color: sovswapColors.paperInkSoft,
  },
  labelActive: {
    color: sovswapColors.paperInk,
  },
}));

export default SovTabMasthead;
