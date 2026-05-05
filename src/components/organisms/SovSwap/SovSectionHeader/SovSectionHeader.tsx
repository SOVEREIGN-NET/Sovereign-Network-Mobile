import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  createSovSwapStyles,
  sovswapColors,
  sovswapSpacing,
  sovswapType,
} from '../../../../screens/sovswap/theme/sovswapTokens';

export interface SovSectionHeaderProps {
  /** Page title — printed centred, all-caps, on the dark band. */
  title: string;
  /** Optional explanatory line, rendered below the dark band. */
  subtitle?: string;
  /** Optional metadata caption (e.g. count). Rendered next to subtitle. */
  meta?: string;
  /** Reserved for future use — kept so existing callers don't break. */
  kicker?: string;
  /** When provided, a back arrow renders inside the dark band on the left.
   *  Only set this on nested screens (form steps, detail pages); leave
   *  unset on the root tab content where the parent tab strip is the
   *  primary nav. */
  onBack?: () => void;
}

/**
 * Section header strip — a dark inverted band across the top of each
 * tab. Uppercase, centred, small font; doubles as the visual gap
 * between the tab strip above and the content below.
 *
 * Optional subtitle / meta render *under* the band on the paper
 * background, also centred, in soft ink — just for context, not for
 * decoration.
 */
export const SovSectionHeader: React.FC<SovSectionHeaderProps> = ({
  title,
  subtitle,
  meta,
  onBack,
}) => {
  const hasFootline = !!(subtitle || meta);
  return (
    <View style={styles.wrap}>
      <View style={styles.band}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={12}
            style={styles.backBtn}
            accessibilityLabel="Back"
          >
            <Text style={styles.backGlyph}>←</Text>
          </Pressable>
        ) : null}
        <Text style={styles.title}>{title}</Text>
      </View>
      {hasFootline ? (
        <View style={styles.footline}>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
          {meta ? <Text style={styles.meta}>{meta}</Text> : null}
        </View>
      ) : null}
    </View>
  );
};

const styles = createSovSwapStyles(() => StyleSheet.create({
  wrap: {
    marginHorizontal: -sovswapSpacing.lg, // bleed to the screen edges
    marginBottom: sovswapSpacing.lg,
  },
  band: {
    backgroundColor: sovswapColors.paperInk,
    paddingVertical: 10,
    paddingHorizontal: sovswapSpacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtn: {
    position: 'absolute',
    left: sovswapSpacing.lg,
    top: 0,
    bottom: 0,
    paddingHorizontal: sovswapSpacing.xs,
    justifyContent: 'center',
  },
  backGlyph: {
    color: sovswapColors.paper,
    fontSize: 18,
    fontWeight: '600',
  },
  title: {
    ...sovswapType.smallCapsInk,
    color: sovswapColors.paper,
    fontSize: 12,
    letterSpacing: 1.6,
    textAlign: 'center',
  },
  footline: {
    paddingTop: sovswapSpacing.lg,
    paddingHorizontal: sovswapSpacing.lg,
    alignItems: 'center',
  },
  subtitle: {
    ...sovswapType.bodySoft,
    fontSize: 12,
    textAlign: 'center',
  },
  meta: {
    ...sovswapType.smallCaps,
    fontSize: 9,
    marginTop: 4,
  },
}));

export default SovSectionHeader;
