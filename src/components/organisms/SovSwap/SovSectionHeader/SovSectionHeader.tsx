import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../../../../theme';

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

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.lg,
  },
  band: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtn: {
    position: 'absolute',
    left: spacing.lg,
    top: 0,
    bottom: 0,
    paddingHorizontal: spacing.xs,
    justifyContent: 'center',
  },
  backGlyph: {
    color: colors.text_primary,
    fontSize: 18,
    fontWeight: '600',
  },
  title: {
    color: colors.text_tertiary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.6,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  footline: {
    paddingTop: spacing.xs,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  subtitle: {
    color: colors.text_secondary,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  meta: {
    color: colors.text_tertiary,
    fontSize: 9,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});

export default SovSectionHeader;
