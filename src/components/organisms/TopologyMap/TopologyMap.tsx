/**
 * TopologyMap
 *
 * Animated constellation-style visualisation of the network topology.
 * Renders:
 *
 *   - a pulsing core for `this_node`
 *   - an outer ring of validators, angular-spaced, circle radius scaled
 *     by stake, ring colour tied to status
 *   - an inner ring of gateways with a dashed DNS-style ring indicator
 *   - edges center→node with a slowly travelling dash offset (data flow)
 *   - an outward ripple that fires on each poll tick so the map "breathes"
 *     whenever fresh data arrives (driven via `pulseKey`)
 *
 * Pure `react-native-svg` + RN `Animated` — no Skia / Reanimated. Every
 * animated SVG attribute uses `useNativeDriver: false` because SVG
 * attributes aren't bridgeable to native.
 *
 * Tapping a node calls `onSelect(did)`. The tapped node persists with a
 * brighter ring and a short glow animation.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, View, Pressable } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  RadialGradient,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import type {
  NetworkTopologyResponse,
  TopologyValidator,
  TopologyGateway,
} from '../../../types/networkTopology';
import { colors, spacing, typography } from '../../../theme';
import { Text } from '../../atoms/Text';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedLine = Animated.createAnimatedComponent(Line);

interface TopologyMapProps {
  topo: NetworkTopologyResponse;
  height?: number;
  /** Bump to trigger the outward "fresh data arrived" ripple. */
  pulseKey?: number | string;
  onSelect?: (did: string) => void;
  selectedDid?: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  active: '#2ecc71',
  stale: '#f5a623',
  inactive: '#f5a623',
  jailed: '#e74c3c',
  slashed: '#e74c3c',
};

const resolveStatusColor = (status: string): string =>
  STATUS_COLOR[status] ?? colors.text_tertiary;

/** Map a stake value to a node radius in a bounded range. Square-root
 *  scaling keeps the biggest whale from dominating the whole map while
 *  still showing the ranking visually. */
const stakeToRadius = (stake: number, max: number, minR: number, maxR: number): number => {
  if (max <= 0) return minR;
  const norm = Math.sqrt(Math.max(0, stake) / max);
  return minR + (maxR - minR) * norm;
};

/** Place N items on a ring: angle indexed from the top, evenly spread. */
const polarAt = (i: number, n: number, cx: number, cy: number, r: number) => {
  const theta = (-Math.PI / 2) + (i * (2 * Math.PI)) / Math.max(1, n);
  return {
    x: cx + r * Math.cos(theta),
    y: cy + r * Math.sin(theta),
    theta,
  };
};

export const TopologyMap: React.FC<TopologyMapProps> = ({
  topo,
  height = 320,
  pulseKey,
  onSelect,
  selectedDid,
}) => {
  const [width, setWidth] = useState(0);

  // --- Derived layout ------------------------------------------------------
  const cx = width / 2;
  const cy = height / 2;
  const outerR = Math.max(0, Math.min(width, height) / 2 - 36);
  const innerR = outerR * 0.55;
  const maxValStake = useMemo(
    () => topo.topology.validators.reduce((m, v) => Math.max(m, v.stake), 0),
    [topo],
  );
  const maxGwStake = useMemo(
    () => topo.topology.gateways.reduce((m, g) => Math.max(m, g.stake), 0),
    [topo],
  );
  const selfDid = topo.this_node.did;

  const validators = topo.topology.validators;
  const gateways = topo.topology.gateways;

  // --- Animations ----------------------------------------------------------

  // Core breathing — slow 2.4s back-and-forth scale on the self node.
  const breath = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(breath, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breath]);
  const coreRadius = breath.interpolate({
    inputRange: [0, 1],
    outputRange: [14, 20],
  });
  const coreOpacity = breath.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 0.95],
  });

  // Edge dash-offset flow — continuous linear drift. Positive value →
  // "current flows outward from the center".
  const flow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(flow, {
        toValue: 1,
        duration: 2400,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [flow]);
  const dashOffset = flow.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -16],
  });

  // Outward ripple — fires once when `pulseKey` changes (each poll refresh).
  const ripple = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    ripple.setValue(0);
    Animated.timing(ripple, {
      toValue: 1,
      duration: 1400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [pulseKey, ripple]);
  const rippleRadius = ripple.interpolate({
    inputRange: [0, 1],
    outputRange: [10, outerR + 10],
  });
  const rippleOpacity = ripple.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0],
  });

  // --- Layout guard --------------------------------------------------------
  if (width === 0) {
    return (
      <View
        style={{ height, backgroundColor: colors.bg_darker, borderRadius: 12 }}
        onLayout={e => setWidth(e.nativeEvent.layout.width)}
      />
    );
  }

  return (
    <View
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
      style={{
        height,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: colors.bg_darker,
      }}
    >
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id="coreGrad" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={colors.primary} stopOpacity="0.9" />
            <Stop offset="100%" stopColor={colors.primary} stopOpacity="0.0" />
          </RadialGradient>
          <LinearGradient id="edgeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor={colors.primary} stopOpacity="0.8" />
            <Stop offset="100%" stopColor={colors.primary} stopOpacity="0.15" />
          </LinearGradient>
        </Defs>

        {/* Soft halo under the core */}
        <Circle cx={cx} cy={cy} r={outerR} fill="url(#coreGrad)" opacity={0.12} />

        {/* Inner + outer orbit guides */}
        <Circle
          cx={cx}
          cy={cy}
          r={innerR}
          stroke={colors.border}
          strokeWidth="0.5"
          strokeDasharray="3,4"
          fill="none"
          opacity={0.5}
        />
        <Circle
          cx={cx}
          cy={cy}
          r={outerR}
          stroke={colors.border}
          strokeWidth="0.5"
          fill="none"
          opacity={0.4}
        />

        {/* Outward ripple — fires once per fresh-data tick */}
        <AnimatedCircle
          cx={cx}
          cy={cy}
          r={rippleRadius as unknown as number}
          stroke={colors.primary}
          strokeWidth="1.5"
          fill="none"
          opacity={rippleOpacity as unknown as number}
        />

        {/* Edges — center → validator */}
        {validators.map((v, i) => {
          const p = polarAt(i, validators.length, cx, cy, outerR);
          return (
            <AnimatedLine
              key={`edge-v-${v.did}`}
              x1={cx}
              y1={cy}
              x2={p.x}
              y2={p.y}
              stroke={colors.primary}
              strokeOpacity={v.status === 'active' ? 0.45 : 0.18}
              strokeWidth="1"
              strokeDasharray="3,6"
              strokeDashoffset={dashOffset as unknown as number}
            />
          );
        })}

        {/* Edges — center → gateway */}
        {gateways.map((g, i) => {
          const p = polarAt(i, gateways.length, cx, cy, innerR);
          return (
            <AnimatedLine
              key={`edge-g-${g.did}`}
              x1={cx}
              y1={cy}
              x2={p.x}
              y2={p.y}
              stroke={resolveStatusColor(g.status)}
              strokeOpacity={0.4}
              strokeWidth="1"
              strokeDasharray="2,5"
              strokeDashoffset={dashOffset as unknown as number}
            />
          );
        })}

        {/* Gateway nodes (inner) */}
        {gateways.map((g, i) => {
          const p = polarAt(i, gateways.length, cx, cy, innerR);
          const r = stakeToRadius(g.stake, maxGwStake, 5, 10);
          return (
            <NodeDot
              key={`gw-${g.did}`}
              cx={p.x}
              cy={p.y}
              r={r}
              color={resolveStatusColor(g.status)}
              isSelf={g.did === selfDid}
              isSelected={g.did === selectedDid}
              role="gateway"
            />
          );
        })}

        {/* Validator nodes (outer) */}
        {validators.map((v, i) => {
          const p = polarAt(i, validators.length, cx, cy, outerR);
          const r = stakeToRadius(v.stake, maxValStake, 6, 14);
          return (
            <NodeDot
              key={`val-${v.did}`}
              cx={p.x}
              cy={p.y}
              r={r}
              color={resolveStatusColor(v.status)}
              isSelf={v.did === selfDid}
              isSelected={v.did === selectedDid}
              role="validator"
            />
          );
        })}

        {/* Center breathing core */}
        <AnimatedCircle
          cx={cx}
          cy={cy}
          r={coreRadius as unknown as number}
          fill={colors.primary}
          opacity={coreOpacity as unknown as number}
        />
        <Circle cx={cx} cy={cy} r={4} fill={colors.text_primary} opacity={0.95} />

        {/* Center label */}
        <SvgText
          x={cx}
          y={cy + outerR + 22}
          fill={colors.text_secondary}
          fontSize={10}
          textAnchor="middle"
        >
          this node
        </SvgText>
      </Svg>

      {/* Invisible hit targets on top of the SVG so taps feel natural. The
          SVG tree itself isn't ideal for Pressable; absolute overlays keep
          accessibility + touch ergonomics on the side of RN primitives. */}
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
      >
        {validators.map((v, i) => {
          const p = polarAt(i, validators.length, cx, cy, outerR);
          return (
            <HitTarget
              key={`hit-v-${v.did}`}
              cx={p.x}
              cy={p.y}
              size={30}
              onPress={() => onSelect?.(v.did)}
              label={`validator ${shortTail(v.did)}, status ${v.status}, stake ${v.stake}`}
            />
          );
        })}
        {gateways.map((g, i) => {
          const p = polarAt(i, gateways.length, cx, cy, innerR);
          return (
            <HitTarget
              key={`hit-g-${g.did}`}
              cx={p.x}
              cy={p.y}
              size={26}
              onPress={() => onSelect?.(g.did)}
              label={`gateway ${shortTail(g.did)}, status ${g.status}`}
            />
          );
        })}
      </View>

      {/* Legend strip */}
      <View
        style={{
          position: 'absolute',
          left: spacing.sm,
          right: spacing.sm,
          bottom: spacing.xs,
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.sm,
          justifyContent: 'center',
        }}
      >
        <Legend color="#2ecc71" label="active" />
        <Legend color="#f5a623" label="stale" />
        <Legend color="#e74c3c" label="slashed" />
        <Legend
          color={colors.primary}
          label={`${topo.topology.connected_peers} peers`}
        />
      </View>
    </View>
  );
};

interface NodeDotProps {
  cx: number;
  cy: number;
  r: number;
  color: string;
  isSelf: boolean;
  isSelected: boolean;
  role: 'validator' | 'gateway';
}

/** Static SVG node: filled disc + status-colored ring + optional selection ring. */
const NodeDot: React.FC<NodeDotProps> = ({ cx, cy, r, color, isSelf, isSelected, role }) => (
  <G>
    {isSelected ? (
      <Circle
        cx={cx}
        cy={cy}
        r={r + 6}
        stroke={colors.primary}
        strokeOpacity={0.9}
        strokeWidth="1.5"
        fill="none"
      />
    ) : null}
    <Circle cx={cx} cy={cy} r={r + 2} stroke={color} strokeWidth="1.5" fill={colors.bg_darker} />
    <Circle cx={cx} cy={cy} r={r - 1} fill={color} opacity={isSelf ? 1 : 0.85} />
    {role === 'gateway' ? (
      <Circle
        cx={cx}
        cy={cy}
        r={r + 5}
        stroke={color}
        strokeOpacity={0.5}
        strokeDasharray="2,3"
        fill="none"
      />
    ) : null}
    {isSelf ? (
      <Circle cx={cx} cy={cy} r={2} fill={colors.text_primary} />
    ) : null}
  </G>
);

const HitTarget: React.FC<{
  cx: number;
  cy: number;
  size: number;
  onPress: () => void;
  label: string;
}> = ({ cx, cy, size, onPress, label }) => (
  <Pressable
    onPress={onPress}
    hitSlop={6}
    accessibilityRole="button"
    accessibilityLabel={label}
    style={{
      position: 'absolute',
      left: cx - size / 2,
      top: cy - size / 2,
      width: size,
      height: size,
      borderRadius: size / 2,
    }}
  />
);

const Legend: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
    <View
      style={{
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: color,
      }}
    />
    <Text
      style={{
        color: colors.text_tertiary,
        fontSize: typography.size.xs,
        letterSpacing: 0.3,
      }}
    >
      {label}
    </Text>
  </View>
);

const shortTail = (did: string): string => did.slice(-6);

export default TopologyMap;
