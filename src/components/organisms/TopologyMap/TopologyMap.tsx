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
  /** Host/IP of the ZDNS gateway the app dials for validator discovery.
   *  If it matches a gateway in the topology the edge to that gateway
   *  is rendered with the "live connection" highlight. */
  zdnsHost?: string;
}

/** Compact info card content for a selected node — builds from either
 *  a validator or gateway entry. Values are labels, not raw IPs. */
interface SelectedInfo {
  /** Display label — "Validator" / "Gateway" / "Self". */
  role: 'Validator' | 'Gateway' | 'Self';
  /** Underlying kind — used for color lookups (gateways get a distinct palette). */
  kind: 'validator' | 'gateway';
  did: string;
  status: string;
  stakeLabel: string;
  lines: { label: string; value: string }[];
}

/**
 * Per-role, per-status color palette.
 *
 * Validators encode status with the familiar traffic-light greens/ambers
 * /reds. Gateways use a blue family instead so the two roles are
 * distinguishable at a glance even without the dashed-halo shape cue.
 * Fault states (stale / jailed / slashed) stay warm-colored for both
 * roles so "something is wrong here" reads the same way everywhere.
 */
const VALIDATOR_STATUS_COLOR: Record<string, string> = {
  active: '#2ecc71',   // green
  stale: '#f5a623',    // amber
  inactive: '#f5a623', // amber
  jailed: '#e74c3c',   // red
  slashed: '#e74c3c',  // red
};
const GATEWAY_STATUS_COLOR: Record<string, string> = {
  active: '#4da3ff',   // blue — signature gateway color
  stale: '#f5a623',    // amber (shared fault palette)
  inactive: '#f5a623',
  jailed: '#e74c3c',
  slashed: '#e74c3c',
};

const resolveStatusColor = (
  role: 'validator' | 'gateway',
  status: string,
): string => {
  const table = role === 'gateway' ? GATEWAY_STATUS_COLOR : VALIDATOR_STATUS_COLOR;
  return table[status] ?? colors.text_tertiary;
};

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

/** Color + stroke width for the "app is live-connected here" highlight. */
const LIVE_EDGE_COLOR = '#00e5ff';
const LIVE_EDGE_WIDTH = 2;
const LIVE_EDGE_OPACITY = 0.95;

export const TopologyMap: React.FC<TopologyMapProps> = ({
  topo,
  height = 320,
  pulseKey,
  onSelect,
  selectedDid,
  zdnsHost,
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

  // Gateway we dial for ZDNS bootstrap — matched by IP or endpoint host
  // so either "91.98.113.188" or "gateway.thesovereignnetwork.org"
  // resolves against the topology entry regardless of how the server
  // expresses it.
  const zdnsGatewayDid = useMemo(() => {
    if (!zdnsHost) return null;
    const needle = zdnsHost.trim().toLowerCase();
    const match = gateways.find(g => {
      const ip = (g.ip || '').toLowerCase();
      const host = (g.endpoint || '').split(':')[0].toLowerCase();
      return needle === ip || needle === host;
    });
    return match?.did ?? null;
  }, [gateways, zdnsHost]);

  // Active validator link: `this_node.did` points at whichever validator
  // answered the directory request, so it IS in the validator array.
  // That's the TLS endpoint our UHP handshake uses.
  const activeValidatorDid = selfDid;

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

  // Resolve the selected DID to a typed info card payload once per render.
  const selectedInfo = useMemo(
    () => buildSelectedInfo(topo, selectedDid),
    [topo, selectedDid],
  );

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

        {/* Edges — center → validator. The edge to `this_node.did` (the
            validator we're actually talking to) is drawn with the
            live-connection highlight so the user can see at a glance
            where the app's QUIC link lands. */}
        {validators.map((v, i) => {
          const p = polarAt(i, validators.length, cx, cy, outerR);
          const isLive = v.did === activeValidatorDid;
          return (
            <AnimatedLine
              key={`edge-v-${v.did}`}
              x1={cx}
              y1={cy}
              x2={p.x}
              y2={p.y}
              stroke={isLive ? LIVE_EDGE_COLOR : colors.primary}
              strokeOpacity={
                isLive
                  ? LIVE_EDGE_OPACITY
                  : v.status === 'active'
                  ? 0.45
                  : 0.18
              }
              strokeWidth={isLive ? LIVE_EDGE_WIDTH : 1}
              strokeDasharray={isLive ? '5,3' : '3,6'}
              strokeDashoffset={dashOffset as unknown as number}
            />
          );
        })}

        {/* Edges — center → gateway. Same highlight if this gateway is
            the ZDNS server we bootstrap through. */}
        {gateways.map((g, i) => {
          const p = polarAt(i, gateways.length, cx, cy, innerR);
          const isLive = g.did === zdnsGatewayDid;
          return (
            <AnimatedLine
              key={`edge-g-${g.did}`}
              x1={cx}
              y1={cy}
              x2={p.x}
              y2={p.y}
              stroke={isLive ? LIVE_EDGE_COLOR : resolveStatusColor('gateway', g.status)}
              strokeOpacity={isLive ? LIVE_EDGE_OPACITY : 0.4}
              strokeWidth={isLive ? LIVE_EDGE_WIDTH : 1}
              strokeDasharray={isLive ? '5,3' : '2,5'}
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
              color={resolveStatusColor('gateway', g.status)}
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
              color={resolveStatusColor('validator', v.status)}
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

      {/* Info card — shown when a node is selected; replaces the legend
          strip so there's no competition for the same footer space. */}
      {selectedInfo ? (
        <Pressable
          onPress={() => onSelect?.(selectedInfo.did)}
          style={{
            position: 'absolute',
            left: spacing.sm,
            right: spacing.sm,
            bottom: spacing.sm,
            backgroundColor: colors.bg_dark,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
          }}
          accessibilityRole="button"
          accessibilityLabel="Close node info"
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 4,
            }}
          >
            <Text
              style={{
                color: colors.text_tertiary,
                fontSize: typography.size.xs,
                textTransform: 'uppercase',
                letterSpacing: 1,
              }}
            >
              {selectedInfo.role}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: resolveStatusColor(
                    selectedInfo.kind,
                    selectedInfo.status,
                  ),
                }}
              />
              <Text
                style={{
                  color: colors.text_secondary,
                  fontSize: typography.size.xs,
                }}
              >
                {selectedInfo.status}
              </Text>
            </View>
          </View>
          <Text
            style={{
              color: colors.text_primary,
              fontSize: typography.size.sm,
              fontWeight: '600',
              marginBottom: 4,
            }}
            numberOfLines={1}
          >
            …{shortTail(selectedInfo.did)}
          </Text>
          <Text
            style={{
              color: colors.primary,
              fontSize: typography.size.sm,
              fontWeight: '700',
              marginBottom: 4,
            }}
          >
            {selectedInfo.stakeLabel}
          </Text>
          {selectedInfo.lines.map(l => (
            <View
              key={l.label}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginTop: 2,
              }}
            >
              <Text
                style={{
                  color: colors.text_tertiary,
                  fontSize: typography.size.xs,
                }}
              >
                {l.label}
              </Text>
              <Text
                style={{
                  color: colors.text_primary,
                  fontSize: typography.size.xs,
                  fontWeight: '500',
                }}
              >
                {l.value}
              </Text>
            </View>
          ))}
        </Pressable>
      ) : (
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
          <Legend color={LIVE_EDGE_COLOR} label="live link" />
          <Legend color="#2ecc71" label="validator" />
          <Legend color="#4da3ff" label="gateway" />
          <Legend color="#f5a623" label="stale" />
          <Legend color="#e74c3c" label="slashed" />
          <Legend
            color={colors.primary}
            label={`${topo.topology.connected_peers} peers`}
          />
        </View>
      )}
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

/** Round a stake value to a readable display. Pairs with the raw
 *  number so the info card can show e.g. "1.2K SOV (1,234)". */
const fmtStake = (stake: number): string => {
  if (!Number.isFinite(stake) || stake <= 0) return '0';
  if (stake >= 1_000_000_000) return `${(stake / 1_000_000_000).toFixed(2)}B`;
  if (stake >= 1_000_000) return `${(stake / 1_000_000).toFixed(2)}M`;
  if (stake >= 1_000) return `${(stake / 1_000).toFixed(1)}K`;
  return stake.toString();
};

/** Build the info-card payload for a selected DID. Returns null if the
 *  DID isn't in the current topology (stale selection). */
function buildSelectedInfo(
  topo: NetworkTopologyResponse,
  did: string | null | undefined,
): SelectedInfo | null {
  if (!did) return null;
  const selfDid = topo.this_node.did;
  const v = topo.topology.validators.find(x => x.did === did);
  if (v) {
    return {
      role: did === selfDid ? 'Self' : 'Validator',
      kind: 'validator',
      did: v.did,
      status: v.status,
      stakeLabel: `${fmtStake(v.stake)} SOV (${v.stake.toLocaleString()})`,
      lines: [
        { label: 'Blocks validated', value: v.blocks_validated.toLocaleString() },
        { label: 'Last activity', value: `block ${v.last_activity.toLocaleString()}` },
        { label: 'Commission', value: `${v.commission_rate}%` },
        { label: 'Admission', value: v.admission },
      ],
    };
  }
  const g = topo.topology.gateways.find(x => x.did === did);
  if (g) {
    return {
      role: did === selfDid ? 'Self' : 'Gateway',
      kind: 'gateway',
      did: g.did,
      status: g.status,
      stakeLabel: `${fmtStake(g.stake)} SOV (${g.stake.toLocaleString()})`,
      lines: [
        { label: 'Commission', value: `${g.commission_rate}%` },
      ],
    };
  }
  return null;
}

export default TopologyMap;
