import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors, typography } from '../../../theme';
import { Text } from '../Text';

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

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const TICK_MS = 500;

export const RefreshRing: React.FC<RefreshRingProps> = ({
  lastFetchedAt,
  nextRefetchAt,
  loading,
  stale = false,
  onRetry,
  size = 18,
  label,
}) => {
  const [, forceTick] = React.useReducer(x => x + 1, 0);

  // Drive the progress calculation on a slow timer instead of per-frame —
  // no need for 60fps here, 2Hz is more than enough for a 60s countdown
  // and it keeps the screen cool.
  useEffect(() => {
    const id = setInterval(forceTick, TICK_MS);
    return () => clearInterval(id);
  }, []);

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

  const progress = computeProgress(lastFetchedAt, nextRefetchAt);
  const strokeWidth = Math.max(2, Math.round(size * 0.12));
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  const accent = stale ? '#f5a623' : colors.primary;
  const track = `${colors.text_secondary}30`;

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
          {/* Progress arc — rotated so 0° is at the top */}
          <AnimatedCircle
            cx={cx}
            cy={cy}
            r={r}
            stroke={accent}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - progress)}
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

/**
 * 0 = just fetched, 1 = due now (or overdue — clamped). Robust to clock
 * skew: if any timestamp is missing we simply show an empty ring.
 */
function computeProgress(
  lastFetchedAt: number | null,
  nextRefetchAt: number | null,
): number {
  if (lastFetchedAt == null || nextRefetchAt == null) return 0;
  const total = nextRefetchAt - lastFetchedAt;
  if (total <= 0) return 1;
  const elapsed = Date.now() - lastFetchedAt;
  if (elapsed <= 0) return 0;
  if (elapsed >= total) return 1;
  return elapsed / total;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});

export default RefreshRing;
