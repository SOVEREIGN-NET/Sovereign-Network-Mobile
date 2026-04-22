import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View, ViewStyle } from 'react-native';

import { colors, borderRadius } from '../../../theme';

/**
 * Skeleton placeholder.
 *
 * Renders an opaque rectangle of the exact size the real content will
 * occupy once it loads, pulsing between two tints to signal "loading,
 * not broken". The sole purpose is to reserve layout space: the real
 * content, when it arrives, drops into the same slot without shifting
 * neighbouring elements.
 *
 * Design rules:
 *   - Always pass explicit `width` and `height` (or a parent with a
 *     fixed size) so the skeleton is the right shape. A skeleton that
 *     doesn't match its replacement is worse than no skeleton at all,
 *     since the content still jumps when the shape resolves.
 *   - Keep skeletons short-lived. A skeleton visible for more than ~2s
 *     means something is wrong — add a retry affordance instead.
 *   - Theme-reactive: reads from the live `colors` object each render
 *     so it follows the charcoal ↔ light toggle.
 */

export interface SkeletonProps {
  /** Width in px or percentage string. Defaults to `'100%'`. */
  width?: number | `${number}%` | 'auto';
  /** Height in px. Required — a skeleton of unknown height defeats
   *  the layout-reservation purpose. */
  height: number;
  /** Border radius. Defaults to the project's small radius for blocks;
   *  pass `height / 2` for pill shapes and `height` for circles. */
  radius?: number;
  /** Additional style override. Merged after the built-in styles so
   *  you can override anything specific to the call-site. */
  style?: ViewStyle;
  /** Opt out of the pulse (useful on tests or when nested in a
   *  parent that already runs its own shimmer). */
  animated?: boolean;
}

const PULSE_PERIOD_MS = 1100;

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height,
  radius = borderRadius.sm,
  style,
  animated = true,
}) => {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animated) {
      pulse.setValue(0);
      return;
    }
    // Subtle opacity pulse between 0.6 and 1.0. Loop via
    // `Animated.loop` so the cleanup path below actually stops the
    // animation (compared with a chained sequence, which would
    // re-start on its `finished` callback).
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: PULSE_PERIOD_MS / 2,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: PULSE_PERIOD_MS / 2,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animated, pulse]);

  const opacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 1],
  });

  // Base tint: a couple of steps above the surrounding card surface
  // so the skeleton is visible without being noisy. Works on both
  // charcoal and light palettes since `bg_lighter` shifts with the
  // theme.
  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: colors.bg_lighter,
          opacity,
        },
        style,
      ]}
    />
  );
};

Skeleton.displayName = 'Skeleton';

export default Skeleton;
