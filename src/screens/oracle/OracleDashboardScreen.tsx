import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
  Clipboard,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Card, Row, Column, Badge, RefreshRing } from '../../components';
import Svg, { Path, Circle, Line, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { useOracleData } from '../../hooks/useOracleData';
import type { UseOracleDataResult } from '../../hooks/useOracleData';
import {
  fetchOraclePrice,
  fetchOracleVariation,
  fetchOracleStatus,
  fetchOracleConfig,
  OraclePriceResponse,
  OracleVariationResponse,
  OracleStatusResponse,
  OracleConfigResponse,
  OraclePair,
  VariationPeriod,
  CbePriceResponse,
} from '../../services/OracleService';
import { atomsToDisplayLocale, formatAtomicPriceDisplay } from '../../utils/tokenUnits';
import SimulatorTab from './SimulatorTab';

/**
 * Auto-refresh cadence for every oracle endpoint. 30s is a compromise
 * between "fresh enough for a price view" and "don't hammer the node
 * while the user is idling on the screen". The hook never blanks the
 * last-known value between fetches.
 */
const ORACLE_POLL_MS = 30_000;

const MONO_FONT = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

// Safe number formatter — never crashes on undefined/null/NaN
const fmt = (v: unknown, decimals = 4, prefix = '$'): string => {
  const n = typeof v === 'number' ? v : parseFloat(v as any);
  if (!isFinite(n)) return '—';
  return `${prefix}${n.toFixed(decimals)}`;
};

const fmtChange = (v: unknown, decimals = 4): string => {
  const n = typeof v === 'number' ? v : parseFloat(v as any);
  if (!isFinite(n)) return '—';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(decimals)}`;
};

const fmtPct = (v: unknown): string => {
  const n = typeof v === 'number' ? v : parseFloat(v as any);
  if (!isFinite(n)) return '—';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
};

type Tab = 'price' | 'variation' | 'status' | 'config' | 'simulator';

const TABS: { key: Tab; label: string }[] = [
  { key: 'price', label: 'Price' },
  { key: 'variation', label: 'Var' },
  { key: 'status', label: 'Status' },
  { key: 'config', label: 'Config' },
];

const PAIRS: OraclePair[] = ['SOV/USD', 'CBE/USD'];
const PERIODS: VariationPeriod[] = ['1h', '24h', '7d'];

const PRICE_DECIMALS: Record<OraclePair, number> = {
  'SOV/USD': 4,
  'CBE/USD': 8,
};

// --- Shared sub-components ---

const StatRow: React.FC<{
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
}> = ({ label, value, mono, copyable }) => {
  const handleCopy = () => {
    Clipboard.setString(value);
    Alert.alert('Copied', `${label} copied to clipboard`);
  };
  const Wrapper = copyable ? Pressable : View;
  return (
    <Wrapper onPress={copyable ? handleCopy : undefined} style={styles.statRow}>
      <Row justify="space-between" align="center">
        <Text variant="caption" style={{ color: colors.text_secondary, flexShrink: 0 }}>
          {label}{copyable ? ' ⎘' : ''}
        </Text>
        <Text
          variant="body"
          {...(copyable ? { numberOfLines: 1, ellipsizeMode: 'middle' as const } : {})}
          style={[{ fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: spacing.sm }, mono && styles.mono]}
        >
          {value}
        </Text>
      </Row>
    </Wrapper>
  );
};

/**
 * Full-screen spinner — only used during the very first load when we
 * have neither fresh data nor a cached value from a previous session.
 * Everything else (refetch, error with prior value) keeps the last
 * known value on screen and uses the inline RefreshRing instead.
 */
const InitialLoadingState: React.FC = () => (
  <ActivityIndicator
    size="large"
    color={colors.primary}
    style={{ marginTop: spacing['2xl'] }}
  />
);

/**
 * Shown only when there is no cached data AND the latest fetch failed.
 * If we have cached data we keep displaying it and surface the error
 * via the RefreshRing's stale state instead.
 */
const ErrorState: React.FC<{ message?: string; onRetry: () => void }> = ({
  message,
  onRetry,
}) => (
  <Card>
    <Pressable onPress={onRetry}>
      <Text variant="caption" style={{ color: colors.error }}>
        {message ?? 'Failed to load — tap to retry'}
      </Text>
    </Pressable>
  </Card>
);

/**
 * Compact "last updated · refresh" row rendered at the top of every tab
 * that polls. Tapping the ring triggers an immediate retry.
 */
const StaleHeader: React.FC<{
  lastFetchedAt: number | null;
  nextRefetchAt: number | null;
  loading: boolean;
  stale: boolean;
  onRetry: () => void;
  errorMessage?: string | null;
}> = ({ lastFetchedAt, nextRefetchAt, loading, stale, onRetry, errorMessage }) => {
  const [, forceTick] = React.useReducer(x => x + 1, 0);
  useEffect(() => {
    // Re-render once a second so the "updated Xs ago" label stays live.
    const id = setInterval(forceTick, 1000);
    return () => clearInterval(id);
  }, []);

  const agoLabel = useMemo(() => {
    if (lastFetchedAt == null) return 'not yet updated';
    const s = Math.max(0, Math.floor((Date.now() - lastFetchedAt) / 1000));
    if (s < 5) return 'just now';
    if (s < 60) return `updated ${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `updated ${m}m ago`;
    const h = Math.floor(m / 60);
    return `updated ${h}h ago`;
  }, [lastFetchedAt]);

  return (
    <Row justify="space-between" align="center" style={{ paddingHorizontal: spacing.xs }}>
      <Text
        variant="caption"
        style={{
          color: stale ? '#f5a623' : colors.text_secondary,
          fontSize: typography.size.xs,
        }}
      >
        {errorMessage ? `⚠ ${errorMessage}` : agoLabel}
      </Text>
      <RefreshRing
        lastFetchedAt={lastFetchedAt}
        nextRefetchAt={nextRefetchAt}
        loading={loading}
        stale={stale}
        onRetry={onRetry}
        size={16}
      />
    </Row>
  );
};

const PairToggle: React.FC<{
  value: OraclePair;
  onChange: (p: OraclePair) => void;
}> = ({ value, onChange }) => (
  <View style={styles.toggleBar}>
    {PAIRS.map(p => (
      <Pressable
        key={p}
        onPress={() => onChange(p)}
        style={[styles.toggleItem, value === p && styles.toggleItemActive]}
      >
        <Text
          variant="caption"
          style={[styles.toggleLabel, value === p && styles.toggleLabelActive]}
        >
          {p}
        </Text>
      </Pressable>
    ))}
  </View>
);

const PeriodToggle: React.FC<{
  value: VariationPeriod;
  onChange: (p: VariationPeriod) => void;
}> = ({ value, onChange }) => (
  <View style={styles.toggleBar}>
    {PERIODS.map(p => (
      <Pressable
        key={p}
        onPress={() => onChange(p)}
        style={[styles.toggleItem, value === p && styles.toggleItemActive]}
      >
        <Text
          variant="caption"
          style={[styles.toggleLabel, value === p && styles.toggleLabelActive]}
        >
          {p}
        </Text>
      </Pressable>
    ))}
  </View>
);

// --- Price Tab ---

// --- Shared visual helpers ---

const DEBT_COLORS: Record<string, string> = {
  Green: colors.success,
  Yellow: '#f5a623',
  Orange: '#e8751a',
  Red: colors.error,
};

const ProgressBar: React.FC<{ pct: number; color?: string; height?: number }> = ({
  pct,
  color = colors.primary,
  height = 8,
}) => (
  <View style={{ height, borderRadius: height / 2, backgroundColor: `${colors.text_secondary}30`, overflow: 'hidden' }}>
    <View style={{ width: `${Math.min(Math.max(pct, 0), 100)}%`, height: '100%', borderRadius: height / 2, backgroundColor: color }} />
  </View>
);

/**
 * Bonding curve visualization — draws the price curve across bands.
 * Each band has a steeper slope (exponential-ish). The filled area
 * and a dot mark the current position.
 */
const CURVE_W = 300;
const CURVE_H = 120;
const CURVE_PAD = { top: 12, right: 12, bottom: 20, left: 12 };
const PLOT_W = CURVE_W - CURVE_PAD.left - CURVE_PAD.right;
const PLOT_H = CURVE_H - CURVE_PAD.top - CURVE_PAD.bottom;

const buildCurvePath = (bandCount: number, samples = 80): { x: number; y: number }[] => {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples; // 0..1 across total supply
    const band = Math.min(Math.floor(t * bandCount), bandCount - 1);
    const exp = 1 + band * 0.6; // each band steeper
    const bandStart = band / bandCount;
    const bandEnd = (band + 1) / bandCount;
    const localT = (t - bandStart) / (bandEnd - bandStart);
    // Cumulative base price from prior bands
    let baseY = 0;
    for (let b = 0; b < band; b++) {
      baseY += Math.pow(1, 1 + b * 0.6) / bandCount;
    }
    const y = baseY + (Math.pow(localT, exp) / bandCount);
    points.push({ x: t, y });
  }
  // Normalize y to 0..1
  const maxY = Math.max(...points.map(p => p.y), 0.001);
  return points.map(p => ({ x: p.x, y: p.y / maxY }));
};

const BondingCurveChart: React.FC<{
  currentBand: number;
  bandCount: number;
  bandPct: number;
}> = ({ currentBand, bandCount, bandPct }) => {
  const points = useMemo(() => buildCurvePath(bandCount), [bandCount]);

  const progressT = (currentBand + (bandPct / 100)) / bandCount;

  const toSvg = (p: { x: number; y: number }) => ({
    sx: CURVE_PAD.left + p.x * PLOT_W,
    sy: CURVE_PAD.top + (1 - p.y) * PLOT_H,
  });

  // Full curve path
  const fullPath = points
    .map((p, i) => {
      const { sx, sy } = toSvg(p);
      return `${i === 0 ? 'M' : 'L'}${sx.toFixed(1)},${sy.toFixed(1)}`;
    })
    .join(' ');

  // Filled area path (up to current position)
  const filledPoints = points.filter(p => p.x <= progressT + 0.005);
  const lastFilledIdx = filledPoints.length - 1;
  const filledPath =
    filledPoints
      .map((p, i) => {
        const { sx, sy } = toSvg(p);
        return `${i === 0 ? 'M' : 'L'}${sx.toFixed(1)},${sy.toFixed(1)}`;
      })
      .join(' ') +
    ` L${toSvg(filledPoints[lastFilledIdx]).sx.toFixed(1)},${(CURVE_PAD.top + PLOT_H).toFixed(1)}` +
    ` L${CURVE_PAD.left.toFixed(1)},${(CURVE_PAD.top + PLOT_H).toFixed(1)} Z`;

  // Current position dot
  const dotPoint = filledPoints[lastFilledIdx] ?? points[0];
  const { sx: dotX, sy: dotY } = toSvg(dotPoint);

  // Band divider lines
  const bandLines = Array.from({ length: bandCount - 1 }, (_, i) => {
    const x = CURVE_PAD.left + ((i + 1) / bandCount) * PLOT_W;
    return x;
  });

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={CURVE_W} height={CURVE_H} viewBox={`0 0 ${CURVE_W} ${CURVE_H}`}>
        <Defs>
          <LinearGradient id="fillGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.primary} stopOpacity="0.35" />
            <Stop offset="1" stopColor={colors.primary} stopOpacity="0.05" />
          </LinearGradient>
        </Defs>

        {/* Band dividers */}
        {bandLines.map((x, i) => (
          <Line
            key={i}
            x1={x} y1={CURVE_PAD.top}
            x2={x} y2={CURVE_PAD.top + PLOT_H}
            stroke={colors.text_secondary}
            strokeOpacity={0.15}
            strokeWidth={1}
            strokeDasharray="3,3"
          />
        ))}

        {/* Filled area */}
        {filledPoints.length > 1 && (
          <Path d={filledPath} fill="url(#fillGrad)" />
        )}

        {/* Full curve */}
        <Path d={fullPath} stroke={`${colors.text_secondary}40`} strokeWidth={1.5} fill="none" />

        {/* Active curve segment */}
        {filledPoints.length > 1 && (
          <Path
            d={filledPoints.map((p, i) => {
              const { sx, sy } = toSvg(p);
              return `${i === 0 ? 'M' : 'L'}${sx.toFixed(1)},${sy.toFixed(1)}`;
            }).join(' ')}
            stroke={colors.primary}
            strokeWidth={2}
            fill="none"
          />
        )}

        {/* Current position dot */}
        <Circle cx={dotX} cy={dotY} r={4} fill={colors.primary} />
        <Circle cx={dotX} cy={dotY} r={7} fill={colors.primary} fillOpacity={0.2} />

        {/* Band labels */}
        {Array.from({ length: bandCount }, (_, i) => {
          const cx = CURVE_PAD.left + ((i + 0.5) / bandCount) * PLOT_W;
          return (
            <Circle
              key={`bl${i}`}
              cx={cx}
              cy={CURVE_PAD.top + PLOT_H + 10}
              r={2.5}
              fill={i <= currentBand ? colors.primary : `${colors.text_secondary}40`}
            />
          );
        })}
      </Svg>
    </View>
  );
};

const PoolBar: React.FC<{ reserve: string; treasury: string; liquidity: string }> = ({
  reserve, treasury, liquidity,
}) => {
  const r = Number(BigInt(reserve || '0'));
  const t = Number(BigInt(treasury || '0'));
  const l = Number(BigInt(liquidity || '0'));
  const total = r + t + l;
  if (total === 0) return <ProgressBar pct={0} />;
  const rPct = (r / total) * 100;
  const tPct = (t / total) * 100;
  const lPct = (l / total) * 100;
  return (
    <View>
      <View style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden' }}>
        <View style={{ width: `${rPct}%`, backgroundColor: colors.primary }} />
        <View style={{ width: `${tPct}%`, backgroundColor: '#f5a623' }} />
        <View style={{ width: `${lPct}%`, backgroundColor: colors.success }} />
      </View>
      <Row justify="space-between" style={{ marginTop: spacing.xs }}>
        <Row align="center" style={{ gap: 4 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} />
          <Text variant="caption" style={{ color: colors.text_secondary, fontSize: 10 }}>Reserve 32%</Text>
        </Row>
        <Row align="center" style={{ gap: 4 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#f5a623' }} />
          <Text variant="caption" style={{ color: colors.text_secondary, fontSize: 10 }}>Treasury 20%</Text>
        </Row>
        <Row align="center" style={{ gap: 4 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success }} />
          <Text variant="caption" style={{ color: colors.text_secondary, fontSize: 10 }}>Liquidity 48%</Text>
        </Row>
      </Row>
    </View>
  );
};

const fmtAtoms18 = (v: string | undefined | null): string => {
  if (!v || !/^\d+$/.test(v)) return '0';
  return atomsToDisplayLocale(v, 18, 2);
};

// --- Bonding Curve Detail (CBE/USD) ---

const BondingCurveDetail: React.FC<{ data: CbePriceResponse }> = ({ data }) => {
  const dec = PRICE_DECIMALS['CBE/USD'];
  const floorPrice = useMemo(() => {
    if (!data.floor_price_atomic || !data.price_scale) return '—';
    const floor = Number(BigInt(data.floor_price_atomic)) / Number(BigInt(data.price_scale));
    return `$${floor.toFixed(dec)}`;
  }, [data.floor_price_atomic, data.price_scale, dec]);

  const debtColor = DEBT_COLORS[data.debt_state ?? 'Green'] ?? colors.text_secondary;

  return (
    <>
      {/* Prices */}
      <Card>
        <Text variant="h3" style={{ marginBottom: spacing.sm }}>Prices</Text>
        <Column gap="xs">
          <StatRow label="CBE/USD" value={fmt(data.price, dec)} />
          {data.cbe_sov_price != null && (
            <StatRow label="CBE/SOV" value={fmt(data.cbe_sov_price, 6, '')} />
          )}
          <StatRow label="Floor Price" value={floorPrice} />
          <StatRow label="Price (atomic)" value={data.price_atomic ?? '—'} mono copyable />
        </Column>
      </Card>

      {/* Bonding Curve */}
      {data.band_count != null && data.current_band != null && (
        <Card>
          <Row justify="space-between" align="center" style={{ marginBottom: spacing.xs }}>
            <Text variant="h3">Bonding Curve</Text>
            <Text variant="caption" style={{ color: colors.text_secondary }}>
              Band {data.current_band + 1} of {data.band_count}
            </Text>
          </Row>
          <BondingCurveChart
            currentBand={data.current_band}
            bandCount={data.band_count}
            bandPct={data.band_progress_pct ?? 0}
          />
          <Text variant="caption" style={{ color: colors.text_secondary, marginTop: spacing.xs, textAlign: 'center' }}>
            {(data.band_progress_pct ?? 0).toFixed(1)}% through current band — price accelerates per band
          </Text>
        </Card>
      )}

      {/* Supply */}
      <Card>
        <Text variant="h3" style={{ marginBottom: spacing.sm }}>Supply</Text>
        <Column gap="xs">
          <StatRow label="Circulating (curve-sold)" value={fmtAtoms18(data.circulating_supply)} />
          <StatRow label="Total Ceiling" value={fmtAtoms18(data.total_supply_ceiling)} />
          <StatRow label="Genesis Treasury" value={fmtAtoms18(data.genesis_treasury_allocation)} />
        </Column>
        {data.circulating_supply && data.total_supply_ceiling && (
          <View style={{ marginTop: spacing.sm }}>
            <ProgressBar
              pct={Number(BigInt(data.circulating_supply)) / Number(BigInt(data.total_supply_ceiling)) * 100}
              color={colors.primary}
            />
            <Text variant="caption" style={{ color: colors.text_secondary, marginTop: spacing.xs }}>
              Supply sold via bonding curve
            </Text>
          </View>
        )}
      </Card>

      {/* Graduation */}
      <Card>
        <Row justify="space-between" align="center" style={{ marginBottom: spacing.sm }}>
          <Text variant="h3">Graduation</Text>
          <Badge
            label={data.graduated ? 'Graduated' : `${(data.graduation_progress_pct ?? 0).toFixed(1)}%`}
            variant={data.graduated ? 'success' : 'default'}
            size="sm"
          />
        </Row>
        <ProgressBar pct={data.graduation_progress_pct ?? 0} color={data.graduated ? colors.success : colors.primary} />
        <Text variant="caption" style={{ color: colors.text_secondary, marginTop: spacing.xs }}>
          {data.graduated
            ? 'Curve frozen — AMM is live, SOVRN burned'
            : 'Progress toward AMM launch'}
        </Text>
      </Card>

      {/* Pool Breakdown */}
      <Card>
        <Text variant="h3" style={{ marginBottom: spacing.sm }}>Pool Allocation</Text>
        <PoolBar
          reserve={String(data.reserve_balance ?? '0')}
          treasury={data.sov_treasury_cbe_balance ?? '0'}
          liquidity={data.liquidity_pool_balance ?? '0'}
        />
        <Column gap="xs" style={{ marginTop: spacing.sm }}>
          <StatRow label="Reserve (floor backing)" value={fmtAtoms18(String(data.reserve_balance ?? '0'))} />
          <StatRow label="SOV Treasury" value={fmtAtoms18(data.sov_treasury_cbe_balance)} />
          <StatRow label="Liquidity Pool" value={fmtAtoms18(data.liquidity_pool_balance)} />
        </Column>
      </Card>

      {/* Debt Health */}
      <Card>
        <Row justify="space-between" align="center" style={{ marginBottom: spacing.sm }}>
          <Text variant="h3">Debt Health</Text>
          <Badge
            label={data.debt_state ?? 'Unknown'}
            variant={data.debt_state === 'Green' ? 'success' : data.debt_state === 'Red' ? 'error' : 'warning'}
            size="sm"
          />
        </Row>
        <Column gap="xs">
          <StatRow label="Outstanding Pre-backed" value={fmtAtoms18(data.outstanding_pre_backed)} />
          <StatRow label="SOVRN Audit Supply" value={fmtAtoms18(data.sovrn_total_supply)} />
        </Column>
      </Card>

      {/* Meta */}
      <Card>
        <Text variant="h3" style={{ marginBottom: spacing.sm }}>Details</Text>
        <Column gap="xs">
          <StatRow label="Phase" value={data.phase ?? '—'} />
          <StatRow label="Source" value={data.source ?? '—'} />
          <StatRow label="Epoch" value={String(data.current_epoch ?? '—')} />
          <StatRow label="Token ID" value={data.token_id ?? '—'} mono copyable />
        </Column>
      </Card>
    </>
  );
};

// --- Price Tab ---

const PriceTab: React.FC<{ pair: OraclePair }> = ({ pair }) => {
  const dec = PRICE_DECIMALS[pair] ?? 4;
  const { data, loading, error, stale, lastFetchedAt, nextRefetchAt, retry } =
    useOracleData<OraclePriceResponse>({
      cacheKey: `price:${pair}`,
      fetcher: () => fetchOraclePrice(pair),
      intervalMs: ORACLE_POLL_MS,
      deps: [pair],
    });

  // First-ever visit with no disk cache → show spinner. On every
  // subsequent poll we keep the last value and show the RefreshRing.
  const showInitialLoading = loading && data == null;
  // Error card only when we have nothing at all to show.
  const showErrorOnly = error != null && data == null && !loading;

  return (
    <Column gap="md">
      <StaleHeader
        lastFetchedAt={lastFetchedAt}
        nextRefetchAt={nextRefetchAt}
        loading={loading}
        stale={stale}
        onRetry={retry}
        errorMessage={error && data != null ? 'last value — node unreachable' : null}
      />
      {showInitialLoading && <InitialLoadingState />}
      {showErrorOnly && (
        <ErrorState
          message={error?.message || 'No price available — tap to retry'}
          onRetry={retry}
        />
      )}
      {data && (
        <>
          <Card>
            <View style={styles.priceHero}>
              <Text variant="caption" style={styles.priceLabel}>
                {data.pair}
              </Text>
              {(() => {
                // Identical formatter to Dashboard: exact BigInt division
                // of the atomic pair via `formatAtomicPriceDisplay`. The
                // `fmt(data.price, dec)` path is kept only as a fallback
                // for any pair that doesn't carry `price_atomic` / a scale.
                const scale =
                  (data as any).oracle_price_scale ??
                  (data as any).price_scale ??
                  null;
                const priceStr =
                  data.price_atomic && scale
                    ? formatAtomicPriceDisplay(data.price_atomic, scale, '$')
                    : fmt(data.price, dec);
                const len = priceStr.length;
                const fontSize = len <= 8 ? 48 : len <= 12 ? 36 : len <= 16 ? 28 : 22;
                return (
                  <Text style={[styles.priceValue, { fontSize }]}>
                    {priceStr}
                  </Text>
                );
              })()}
              <Text variant="caption" style={{ color: colors.text_secondary }}>
                Epoch #{data.current_epoch}
              </Text>
            </View>
          </Card>

          <Card>
            <Text variant="h3" style={{ marginBottom: spacing.sm }}>
              Details
            </Text>
            <Column gap="xs">
              <StatRow label="Source" value={data.source ?? '—'} />
              <StatRow
                label="Price (atomic)"
                value={data.price_atomic ?? '—'}
                mono
                copyable
              />
              <StatRow
                label="Scale"
                value={
                  (data.pair === 'SOV/USD'
                    ? data.oracle_price_scale
                    : data.price_scale) ?? '—'
                }
                mono
              />
              <StatRow
                label="Current Epoch"
                value={String(data.current_epoch ?? '—')}
              />

              {data.pair === 'SOV/USD' && (
                <>
                  <StatRow label="Epoch ID" value={String(data.epoch_id ?? '—')} />
                  <StatRow
                    label="Epochs Since Finalization"
                    value={String(data.epochs_since_finalization ?? '—')}
                  />
                  <StatRow
                    label="Fresh"
                    value={data.is_fresh ? 'Yes' : 'No'}
                  />
                  <StatRow
                    label="Max Staleness"
                    value={
                      data.max_price_staleness_epochs != null
                        ? `${data.max_price_staleness_epochs} epochs`
                        : '—'
                    }
                  />
                </>
              )}

              {data.pair === 'CBE/USD' && (
                <StatRow label="Source" value={data.source ?? '—'} />
              )}
            </Column>
          </Card>

          {data.pair === 'CBE/USD' && (
            <BondingCurveDetail data={data} />
          )}
        </>
      )}
    </Column>
  );
};

// --- Variation Tab ---

const VariationTab: React.FC<{ pair: OraclePair }> = ({ pair }) => {
  const dec = PRICE_DECIMALS[pair] ?? 4;
  const [period, setPeriod] = useState<VariationPeriod>('24h');
  const { data, loading, error, stale, lastFetchedAt, nextRefetchAt, retry } =
    useOracleData<OracleVariationResponse>({
      cacheKey: `variation:${pair}:${period}`,
      fetcher: () => fetchOracleVariation(pair, period),
      intervalMs: ORACLE_POLL_MS,
      deps: [pair, period],
    });

  const pctRaw =
    data == null
      ? 0
      : data.pair === 'SOV/USD'
      ? data.percent_change
      : data.percent_change_since_base;
  const pct = typeof pctRaw === 'number' && isFinite(pctRaw) ? pctRaw : 0;
  const changeIsPositive = pct >= 0;

  const showInitialLoading = loading && data == null;
  const showErrorOnly = error != null && data == null && !loading;

  return (
    <Column gap="md">
      <PeriodToggle value={period} onChange={setPeriod} />
      <StaleHeader
        lastFetchedAt={lastFetchedAt}
        nextRefetchAt={nextRefetchAt}
        loading={loading}
        stale={stale}
        onRetry={retry}
        errorMessage={error && data != null ? 'last value — node unreachable' : null}
      />

      {showInitialLoading && <InitialLoadingState />}
      {showErrorOnly && (
        <ErrorState
          message={error?.message || 'No variation data — tap to retry'}
          onRetry={retry}
        />
      )}
      {data && (
        <>
          <Card>
            <View style={styles.priceHero}>
              <Text variant="caption" style={styles.priceLabel}>
                {data.pair} · {period}
              </Text>
              <Text
                style={[
                  styles.priceValue,
                  { color: changeIsPositive ? colors.success : colors.error },
                ]}
              >
                {fmtPct(pct)}
              </Text>
              <Text variant="caption" style={{ color: colors.text_secondary }}>
                {data.source}
              </Text>
            </View>
          </Card>

          {data.pair === 'SOV/USD' && (
            <Card>
              <Text variant="h3" style={{ marginBottom: spacing.sm }}>
                Statistics
              </Text>
              <Column gap="xs">
                <StatRow label="Latest Price" value={fmt(data.latest_price, dec)} />
                <StatRow
                  label="Reference Price"
                  value={fmt(data.reference_price, dec)}
                />
                <StatRow
                  label="Change"
                  value={fmtChange(data.absolute_change, dec)}
                />
                <StatRow label="High" value={fmt(data.high, dec)} />
                <StatRow label="Low" value={fmt(data.low, dec)} />
                <StatRow label="Mean" value={fmt(data.mean, dec)} />
                <StatRow label="Std Dev" value={fmt(data.stdev, dec, '')} />
                <StatRow
                  label="Samples"
                  value={String(data.sample_count ?? '—')}
                />
                <StatRow
                  label="Epoch Range"
                  value={`${data.period_start_epoch ?? '—'} → ${data.period_end_epoch ?? '—'}`}
                />
              </Column>
            </Card>
          )}

          {data.pair === 'CBE/USD' && (
            <>
              <Card>
                <Text variant="h3" style={{ marginBottom: spacing.sm }}>
                  Bonding Curve
                </Text>
                <Column gap="xs">
                  <StatRow
                    label="Current Price"
                    value={fmt(data.current_price, dec)}
                  />
                  <StatRow label="Base Price" value={fmt(data.base_price, dec)} />
                  <StatRow
                    label="Change Since Base"
                    value={fmtChange(data.absolute_change_since_base, dec)}
                  />
                  <StatRow label="Phase" value={data.phase ?? '—'} />
                  <StatRow
                    label="Total Supply"
                    value={
                      data.total_supply != null
                        ? data.total_supply.toLocaleString()
                        : '—'
                    }
                  />
                  <StatRow
                    label="Reserve Balance"
                    value={
                      data.reserve_balance != null
                        ? data.reserve_balance.toLocaleString()
                        : '—'
                    }
                  />
                  <StatRow
                    label="Graduation Progress"
                    value={fmt(data.graduation_progress_percent, 1, '')}
                  />
                  <StatRow
                    label="Can Graduate"
                    value={data.can_graduate ? 'Yes' : 'No'}
                  />
                </Column>
              </Card>
              {data.note ? (
                <Card>
                  <Text
                    variant="caption"
                    style={{ color: colors.text_secondary }}
                  >
                    {data.note}
                  </Text>
                </Card>
              ) : null}
            </>
          )}
        </>
      )}
    </Column>
  );
};

// --- Status Tab ---

const StatusTab: React.FC<{
  data: UseOracleDataResult<OracleStatusResponse>;
}> = ({ data }) => {
  const d = data.data;
  const showInitialLoading = data.loading && d == null;
  const showErrorOnly = data.error != null && d == null && !data.loading;

  if (showInitialLoading) return <InitialLoadingState />;
  if (showErrorOnly) return <ErrorState onRetry={data.retry} message={data.error?.message} />;
  if (!d) return null;

  const isHealthy =
    d.latest_finalized_price !== null &&
    d.current_epoch - d.latest_finalized_price.epoch_id <= 2;

  return (
    <Column gap="md">
      <StaleHeader
        lastFetchedAt={data.lastFetchedAt}
        nextRefetchAt={data.nextRefetchAt}
        loading={data.loading}
        stale={data.stale}
        onRetry={data.retry}
        errorMessage={data.error ? 'last value — node unreachable' : null}
      />
      <Card>
        <Row
          justify="space-between"
          align="center"
          style={{ marginBottom: spacing.sm }}
        >
          <Text variant="h3">Oracle Health</Text>
          <Badge
            label={isHealthy ? 'Healthy' : 'Stale'}
            variant={isHealthy ? 'success' : 'error'}
            size="sm"
          />
        </Row>
        <Column gap="xs">
          <StatRow label="Current Epoch" value={String(d.current_epoch ?? '—')} />
          <StatRow
            label="Epoch Duration"
            value={d.epoch_duration_secs != null ? `${d.epoch_duration_secs}s` : '—'}
          />
          <StatRow
            label="Finalized Prices"
            value={String(d.finalized_prices_count ?? '—')}
          />
        </Column>
      </Card>

      <Card>
        <Text variant="h3" style={{ marginBottom: spacing.sm }}>
          Committee
        </Text>
        <Column gap="xs">
          <StatRow label="Size" value={String(d.committee_size ?? '—')} />
          <StatRow label="Threshold" value={String(d.committee_threshold ?? '—')} />
        </Column>
        {d.committee_members?.length > 0 && (
          <Column gap="xs" style={{ marginTop: spacing.sm }}>
            {d.committee_members.map((member, i) => (
              <View key={i} style={styles.memberRow}>
                <Text
                  variant="caption"
                  style={styles.mono}
                  numberOfLines={1}
                  ellipsizeMode="middle"
                >
                  {member}
                </Text>
              </View>
            ))}
          </Column>
        )}
      </Card>

      {d.latest_finalized_price ? (
        <Card>
          <Text variant="h3" style={{ marginBottom: spacing.sm }}>
            Latest Finalized Price
          </Text>
          <Column gap="xs">
            <StatRow
              label="Epoch"
              value={String(d.latest_finalized_price.epoch_id ?? '—')}
            />
            <StatRow
              label="SOV/USD"
              value={fmt(d.latest_finalized_price.sov_usd_price)}
            />
            <StatRow
              label="Atomic"
              value={d.latest_finalized_price.sov_usd_price_atomic ?? '—'}
              mono
            />
          </Column>
        </Card>
      ) : (
        <Card>
          <Text variant="caption" style={{ color: colors.text_secondary }}>
            No finalized price yet — oracle committee has not reached consensus.
          </Text>
        </Card>
      )}
    </Column>
  );
};

// --- Config Tab ---

const ConfigTab: React.FC<{
  data: UseOracleDataResult<OracleConfigResponse>;
}> = ({ data }) => {
  const d = data.data;
  const showInitialLoading = data.loading && d == null;
  const showErrorOnly = data.error != null && d == null && !data.loading;

  if (showInitialLoading) return <InitialLoadingState />;
  if (showErrorOnly) return <ErrorState onRetry={data.retry} message={data.error?.message} />;
  if (!d) return null;

  return (
    <Column gap="md">
      <StaleHeader
        lastFetchedAt={data.lastFetchedAt}
        nextRefetchAt={data.nextRefetchAt}
        loading={data.loading}
        stale={data.stale}
        onRetry={data.retry}
        errorMessage={data.error ? 'last value — node unreachable' : null}
      />
      <Card>
        <Text variant="h3" style={{ marginBottom: spacing.sm }}>
          Parameters
        </Text>
        <Column gap="xs">
          <StatRow
            label="Epoch Duration"
            value={d.epoch_duration_secs != null ? `${d.epoch_duration_secs}s` : '—'}
          />
          <StatRow
            label="Max Source Age"
            value={d.max_source_age_secs != null ? `${d.max_source_age_secs}s` : '—'}
          />
          <StatRow
            label="Max Deviation"
            value={
              d.max_deviation_bps != null
                ? `${d.max_deviation_bps} bps (${d.max_deviation_pct ?? '—'}%)`
                : '—'
            }
          />
          <StatRow
            label="Max Staleness"
            value={
              d.max_price_staleness_epochs != null
                ? `${d.max_price_staleness_epochs} epochs`
                : '—'
            }
          />
          <StatRow label="Price Scale" value={d.price_scale ?? '—'} mono />
        </Column>
      </Card>

      <Card>
        <Text variant="h3" style={{ marginBottom: spacing.sm }}>
          Committee
        </Text>
        <Column gap="xs">
          <StatRow label="Size" value={String(d.committee_size ?? '—')} />
          <StatRow label="Threshold" value={String(d.committee_threshold ?? '—')} />
        </Column>
        {d.committee_members?.length > 0 && (
          <Column gap="xs" style={{ marginTop: spacing.sm }}>
            {d.committee_members.map((member, i) => (
              <View key={i} style={styles.memberRow}>
                <Text
                  variant="caption"
                  style={styles.mono}
                  numberOfLines={1}
                  ellipsizeMode="middle"
                >
                  {member}
                </Text>
              </View>
            ))}
          </Column>
        )}
      </Card>

      {d.pending_committee_update && (
        <Card>
          <Row
            justify="space-between"
            align="center"
            style={{ marginBottom: spacing.sm }}
          >
            <Text variant="h3">Pending Committee Update</Text>
            <Badge label="Scheduled" variant="warning" size="sm" />
          </Row>
          <Column gap="xs">
            <StatRow
              label="Activates at Epoch"
              value={String(d.pending_committee_update.activate_at_epoch ?? '—')}
            />
            <StatRow
              label="New Size"
              value={String(d.pending_committee_update.new_size ?? '—')}
            />
            <StatRow
              label="New Threshold"
              value={String(d.pending_committee_update.new_threshold ?? '—')}
            />
          </Column>
        </Card>
      )}

      {d.pending_config_update && (
        <Card>
          <Row
            justify="space-between"
            align="center"
            style={{ marginBottom: spacing.sm }}
          >
            <Text variant="h3">Pending Config Update</Text>
            <Badge label="Scheduled" variant="warning" size="sm" />
          </Row>
          <Column gap="xs">
            <StatRow
              label="Activates at Epoch"
              value={String(d.pending_config_update.activate_at_epoch ?? '—')}
            />
            <StatRow
              label="Epoch Duration"
              value={
                d.pending_config_update.epoch_duration_secs != null
                  ? `${d.pending_config_update.epoch_duration_secs}s`
                  : '—'
              }
            />
            <StatRow
              label="Max Source Age"
              value={
                d.pending_config_update.max_source_age_secs != null
                  ? `${d.pending_config_update.max_source_age_secs}s`
                  : '—'
              }
            />
            <StatRow
              label="Max Deviation"
              value={
                d.pending_config_update.max_deviation_bps != null
                  ? `${d.pending_config_update.max_deviation_bps} bps`
                  : '—'
              }
            />
            <StatRow
              label="Max Staleness"
              value={
                d.pending_config_update.max_price_staleness_epochs != null
                  ? `${d.pending_config_update.max_price_staleness_epochs} epochs`
                  : '—'
              }
            />
          </Column>
        </Card>
      )}
    </Column>
  );
};

// --- Main screen ---

const OracleDashboardScreen: React.FC<any> = ({ navigation }) => {
  const [pair, setPair] = useState<OraclePair>('SOV/USD');
  const [activeTab, setActiveTab] = useState<Tab>('price');

  const status = useOracleData<OracleStatusResponse>({
    cacheKey: 'status',
    fetcher: () => fetchOracleStatus(),
    intervalMs: ORACLE_POLL_MS,
  });
  const config = useOracleData<OracleConfigResponse>({
    cacheKey: 'config',
    fetcher: () => fetchOracleConfig(),
    intervalMs: ORACLE_POLL_MS,
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text variant="body" style={{ color: colors.primary }}>
            ← Back
          </Text>
        </Pressable>
        <Text variant="h3" style={{ fontWeight: '700' }}>
          Oracle
        </Text>
        <View style={{ width: 48 }} />
      </View>

      <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.sm }}>
        <PairToggle value={pair} onChange={setPair} />
      </View>

      <View style={styles.tabBar}>
        {TABS.map(({ key, label }) => (
          <Pressable
            key={key}
            onPress={() => setActiveTab(key)}
            style={[styles.tab, activeTab === key && styles.tabActive]}
          >
            <Text
              variant="body"
              style={[
                styles.tabLabel,
                activeTab === key && styles.tabLabelActive,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {activeTab === 'simulator' ? (
        <SimulatorTab />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {activeTab === 'price' && <PriceTab pair={pair} />}
          {activeTab === 'variation' && <VariationTab pair={pair} />}
          {activeTab === 'status' && <StatusTab data={status} />}
          {activeTab === 'config' && <ConfigTab data={config} />}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

// Build at render time so theme-dependent colours track `applyTheme`.
// A plain `styles = StyleSheet.create(...)` at module scope would
// snapshot the charcoal palette at app boot and stay dark forever
// after a theme swap — which is exactly what kept the Oracle tabs
// looking dark in light mode.
const makeStyles = () => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg_darkest,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg_darker,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.full,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabLabel: {
    fontSize: typography.size.sm,
    fontWeight: '500',
    color: colors.text_secondary,
  },
  tabLabelActive: {
    color: colors.bg_darkest,
    fontWeight: '700',
  },
  toggleBar: {
    flexDirection: 'row',
    backgroundColor: colors.bg_darker,
    borderRadius: borderRadius.full,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleItem: {
    flex: 1,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    borderRadius: borderRadius.full,
  },
  toggleItemActive: {
    backgroundColor: colors.bg_dark,
  },
  toggleLabel: {
    fontSize: typography.size.sm,
    fontWeight: '500',
    color: colors.text_secondary,
  },
  toggleLabelActive: {
    color: colors.text_primary,
    fontWeight: '700',
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing['2xl'],
  },
  statRow: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.bg_darker,
  },
  memberRow: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.bg_darker,
  },
  mono: {
    fontFamily: MONO_FONT,
    fontSize: typography.size.sm,
    color: colors.primary,
  },
  priceHero: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  priceLabel: {
    color: colors.text_secondary,
    marginBottom: spacing.xs,
  },
  priceValue: {
    fontSize: 48,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: spacing.xs,
  },
});

/**
 * `styles` is a proxy that rebuilds the stylesheet every time any of
 * its keys is read. Lets the rest of this file keep using
 * `styles.container`, `styles.tabBar`, etc. without touching every
 * inner component to thread a `makeStyles()` call through. A small
 * per-render cache prevents rebuilding once per property access on
 * the same render pass; the cache is reset when `colors.bg_darkest`
 * changes (i.e. a theme swap has mutated the shared palette).
 */
type OracleStyles = ReturnType<typeof makeStyles>;
let cachedOracleStyles: OracleStyles | null = null;
let cachedOracleThemeKey: string | null = null;
const styles = new Proxy({} as OracleStyles, {
  get(_target, prop: string) {
    // `colors.bg_darkest` as a cheap palette-identity key: it rotates
    // whenever `applyTheme` rewrites the shared `colors` object. One
    // comparison per style-access is negligible next to layout cost.
    if (cachedOracleStyles === null || cachedOracleThemeKey !== colors.bg_darkest) {
      cachedOracleStyles = makeStyles();
      cachedOracleThemeKey = colors.bg_darkest;
    }
    return (cachedOracleStyles as unknown as Record<string, unknown>)[prop];
  },
});

export default OracleDashboardScreen;
