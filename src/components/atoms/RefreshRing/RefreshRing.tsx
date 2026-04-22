import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors, typography } from '../../../theme';
import { Text } from '../Text';

// Reanimate the native SVG <Circle /> via Animated so we can drive its
// `strokeDashoffset` from an Animated.Value. Without this, the arc can
// only be updated by re-rendering with a new prop value each frame —
// that's what the earlier 2Hz `forceTick` version was doing, and it
// looked choppy. The animated component keeps the update on the JS
// animation driver and produces a smooth ~60fps fill.
const AnimatedSvgCircle = Animated.createAnimatedComponent(Circle);

/**
 * Discrete auto-refresh indicator.
 *
 * Draws a small ring that fills from `lastFetchedAt` to `nextRefetchAt`.
 * - Normal: subtle primary-coloured progress, a pulsing dot while a fetch
 *   is in flight, no large spinner.
 * - Stale (error or first-load with cached data): amber accent, tap to
 *   retry. Never throws UI away — the ring sits next to the actual value
 *   so the caller can keep rendering the last-known data.
 *
 * Tap the ring to trigger an immediate refetch.
 */
export interface RefreshRingProps {
  /** Unix ms of last successful fetch. Null if never fetched. */
  lastFetchedAt: number | null;
  /** Unix ms when the next auto-fetch fires. Null if no schedule. */
  nextRefetchAt: number | null;
  /** True while a fetch is currently in flight. */
  loading: boolean;
  /** True when the displayed data is not known to be up-to-date. */
  stale?: boolean;
  /** Called when the user taps the ring. */
  onRetry?: () => void;
  /** Ring diameter in px. Default 18. */
  size?: number;
  /** Optional small label rendered next to the ring (e.g. "auto"). */
  label?: string;
}

export const RefreshRing: React.FC<RefreshRingProps> = ({
  lastFetchedAt,
  nextRefetchAt,
  loading,
  stale = false,
  onRetry,
  size = 18,
  label,
}) => {
  const strokeWidth = Math.max(2, Math.round(size * 0.12));
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  const accent = stale ? '#f5a623' : colors.primary;
  const track = `${colors.text_secondary}30`;

  // Continuous progress 0..1 driven by Animated so the arc fills
  // smoothly frame-by-frame instead of ticking on a setInterval.
  // Whenever a new fetch lands we reset the value to the instant
  // progress (computed from the new pair) and kick off a linear
  // timing to 1 over the remaining time before the next refetch.
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (lastFetchedAt == null || nextRefetchAt == null) {
      progress.stopAnimation();
      progress.setValue(0);
      return;
    }
    const total = nextRefetchAt - lastFetchedAt;
    if (total <= 0) {
      progress.setValue(1);
      return;
    }
    const now = Date.now();
    const elapsed = Math.max(0, Math.min(total, now - lastFetchedAt));
    const start = elapsed / total;
    const remaining = total - elapsed;

    progress.stopAnimation();
    progress.setValue(start);
    if (remaining > 0) {
      Animated.timing(progress, {
        toValue: 1,
        duration: remaining,
        easing: Easing.linear,
        // `strokeDashoffset` isn't a transform/opacity prop, so the
        // native animation driver doesn't support it. JS driver is
        // cheap enough here — one interpolation, one prop.
        useNativeDriver: false,
      }).start();
    }
    return () => {
      progress.stopAnimation();
    };
  }, [lastFetchedAt, nextRefetchAt, progress]);

  // Pulse opacity while fetching — subtle, no rotating spinner.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!loading) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [loading, pulse]);

  const animatedDashoffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });
  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 1],
  });

  return (
    <Pressable
      onPress={onRetry}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={stale ? 'Refresh (stale)' : 'Refresh'}
      style={styles.row}
    >
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          {/* Background track */}
          <Circle
            cx={cx}
            cy={cy}
            r={r}
            stroke={track}
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {/* Progress arc — rotated so 0° is at the top. The
              `strokeDashoffset` + `opacity` are Animated values so
              they interpolate on the JS driver at ~60fps instead of
              snap-updating when parent renders. */}
          <AnimatedSvgCircle
            cx={cx}
            cy={cy}
            r={r}
            stroke={accent}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={animatedDashoffset as unknown as number}
            opacity={ringOpacity as unknown as number}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        </Svg>
      </View>
      {label ? (
        <Text
          variant="caption"
          style={{
            fontSize: typography.size.xs,
            fontWeight: '500',
            color: stale ? accent : colors.text_secondary,
          }}
        >
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});

export default RefreshRing;
