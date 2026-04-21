import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  TextInput,
  PanResponder,
  Switch,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Svg, {
  Path,
  Polyline,
  Line as SvgLine,
  Defs,
  LinearGradient,
  Stop,
  Circle,
  Text as SvgText,
} from 'react-native-svg';
import { Text, Card, Row, Column } from '../../components';
import { colors, spacing, borderRadius, typography } from '../../theme';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtN = (n: number, d?: number): string => {
  if (!isFinite(n)) return '0';
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(d ?? 2) + 'B';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(d ?? 2) + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(d ?? 2) + 'K';
  if (n !== 0 && Math.abs(n) < 0.0001) return n.toExponential(4);
  return n.toFixed(d !== undefined ? d : n < 1 ? 6 : 2);
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ── Band math ─────────────────────────────────────────────────────────────────

interface Band { sEnd: number; slope: number; }
interface ComputedBand { sStart: number; sEnd: number; m: number; b: number; }

function computeBands(initPrice: number, bands: Band[]): ComputedBand[] {
  const out: ComputedBand[] = [];
  let sStart = 0;
  let b = initPrice;
  for (let i = 0; i < bands.length; i++) {
    const { sEnd, slope: m } = bands[i];
    if (i > 0) b = out[i - 1].b + (bands[i - 1].slope - m) * sStart;
    out.push({ sStart, sEnd, m, b });
    sStart = sEnd;
  }
  return out;
}

function findBand(S: number, cb: ComputedBand[]): number {
  for (let i = 0; i < cb.length; i++) {
    if (S < cb[i].sEnd || i === cb.length - 1) return i;
  }
  return cb.length - 1;
}

function marginalPrice(S: number, cb: ComputedBand[]): number {
  const i = findBand(S, cb);
  return cb[i].m * S + cb[i].b;
}

function integrateBand(sa: number, sb: number, m: number, b: number): number {
  return (m / 2) * (sb * sb - sa * sa) + b * (sb - sa);
}

function integrateCurve(sa: number, sb: number, cb: ComputedBand[]): number {
  const [lo, hi] = sa <= sb ? [sa, sb] : [sb, sa];
  let total = 0;
  let cur = lo;
  for (let i = 0; i < cb.length && cur < hi; i++) {
    if (cb[i].sEnd <= cur && i < cb.length - 1) continue;
    if (cb[i].sStart > hi) break;
    const blo = Math.max(cur, cb[i].sStart);
    const bhi = i === cb.length - 1 ? hi : Math.min(hi, cb[i].sEnd);
    if (bhi > blo) { total += integrateBand(blo, bhi, cb[i].m, cb[i].b); cur = bhi; }
  }
  return total;
}

function curveMint(credit: number, S: number, maxSupply: number, cb: ComputedBand[]): number {
  let rem = credit;
  let minted = 0;
  let supply = S;
  for (let i = findBand(supply, cb); i < cb.length && rem > 1e-15; i++) {
    const band = cb[i];
    const maxIn = (i === cb.length - 1 ? maxSupply : band.sEnd) - supply;
    const cost = integrateBand(supply, supply + maxIn, band.m, band.b);
    if (rem <= cost) {
      const P0 = band.m * supply + band.b;
      const ds = band.m > 1e-30
        ? (-P0 + Math.sqrt(P0 * P0 + 2 * band.m * rem)) / band.m
        : rem / band.b;
      minted += Math.min(ds, maxIn);
      rem = 0;
    } else {
      minted += maxIn;
      rem -= cost;
      supply += maxIn;
    }
  }
  return Math.floor(minted);
}

// ── State ─────────────────────────────────────────────────────────────────────

interface SimState {
  circulatingSupply: number;
  burnedSupply: number;
  reserveSov: number;
  treasuryLockedSov: number;
  treasuryFreeSov: number;
  graduated: boolean;
  block: number;
  txnCount: number;
  totalSovIn: number;
  ammCbe: number;
  ammSov: number;
  ammK: number;
  priceHistory: { block: number; price: number }[];
  log: { type: 'buy' | 'sell' | 'grad' | 'info'; msg: string; block: number }[];
}

const INIT: SimState = {
  circulatingSupply: 0, burnedSupply: 0, reserveSov: 0,
  treasuryLockedSov: 0, treasuryFreeSov: 0, graduated: false,
  block: 0, txnCount: 0, totalSovIn: 0,
  ammCbe: 0, ammSov: 0, ammK: 0, priceHistory: [], log: [],
};

const DEFAULT_BANDS: Band[] = [
  { sEnd: 10_000_000, slope: 0.000_000_000_001 },
  { sEnd: 100_000_000, slope: 0.000_000_000_005 },
  { sEnd: 1_000_000_000, slope: 0.000_000_000_02 },
  { sEnd: 100_000_000_000, slope: 0.000_000_000_1 },
];

// ── Slider ────────────────────────────────────────────────────────────────────

const SliderInput: React.FC<{
  value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; color?: string;
}> = ({ value, min, max, step, onChange, color = colors.primary }) => {
  const trackW = useRef(0);
  const startX = useRef(0);
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: e => {
      startX.current = e.nativeEvent.locationX;
      const p = clamp(e.nativeEvent.locationX / trackW.current, 0, 1);
      onChange(clamp(Math.round((min + p * (max - min)) / step) * step, min, max));
    },
    onPanResponderMove: (_, gs) => {
      const p = clamp((startX.current + gs.dx) / trackW.current, 0, 1);
      onChange(clamp(Math.round((min + p * (max - min)) / step) * step, min, max));
    },
  })).current;

  const pct = ((value - min) / (max - min)) * 100;

  return (
    <View
      onLayout={e => { trackW.current = e.nativeEvent.layout.width; }}
      style={{ height: 24, justifyContent: 'center' }}
      {...pan.panHandlers}
    >
      <View style={[ss.track, { backgroundColor: colors.border }]}>
        <View style={[ss.fill, { width: `${pct}%`, backgroundColor: color } as any]} />
      </View>
      <View style={[ss.thumb, { left: `${pct}%`, backgroundColor: color } as any]} />
    </View>
  );
};

// ── Chart ─────────────────────────────────────────────────────────────────────

const SimChart: React.FC<{ history: { block: number; price: number }[] }> = ({ history }) => {
  const [w, setW] = useState(0);
  const H = 180;
  const pad = { t: 16, r: 52, b: 20, l: 4 };

  if (history.length < 2) {
    return (
      <View style={{ height: H, justifyContent: 'center', alignItems: 'center' }}>
        <Text variant="caption" style={{ color: colors.text_secondary }}>
          Execute transactions to see price history
        </Text>
      </View>
    );
  }

  const prices = history.map(d => d.price);
  const minP = Math.min(...prices) * 0.95;
  const maxP = Math.max(...prices) * 1.05;
  const pRange = maxP === minP ? maxP * 0.1 || 0.001 : maxP - minP;
  const cw = w - pad.l - pad.r;
  const ch = H - pad.t - pad.b;
  const toX = (i: number) => pad.l + (i / (history.length - 1)) * cw;
  const toY = (p: number) => pad.t + (1 - (p - minP) / pRange) * ch;

  const points = history.map((d, i) => `${toX(i)},${toY(d.price)}`).join(' ');
  const lastX = toX(history.length - 1);
  const lastY = toY(prices[prices.length - 1]);
  const fillD = `M ${pad.l},${pad.t + ch} ${history.map((d, i) => `L ${toX(i)},${toY(d.price)}`).join(' ')} L ${lastX},${pad.t + ch} Z`;
  const yLabels = [0, 0.5, 1].map(f => ({
    y: pad.t + (1 - f) * ch,
    val: fmtN(minP + f * pRange, 6),
  }));

  return (
    <View onLayout={e => setW(e.nativeEvent.layout.width)} style={{ height: H }}>
      {w > 0 && (
        <Svg width={w} height={H}>
          <Defs>
            <LinearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.primary} stopOpacity="0.25" />
              <Stop offset="1" stopColor={colors.primary} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          {yLabels.map((l, i) => (
            <React.Fragment key={i}>
              <SvgLine x1={pad.l} y1={l.y} x2={w - pad.r} y2={l.y}
                stroke={colors.border} strokeWidth="0.5" />
              <SvgText x={w - pad.r + 3} y={l.y + 3} fontSize="8"
                fill={colors.text_secondary as string}>{l.val}</SvgText>
            </React.Fragment>
          ))}
          <Path d={fillD} fill="url(#grad)" />
          <Polyline points={points} fill="none" stroke={colors.primary as string} strokeWidth="1.5" />
          <Circle cx={lastX} cy={lastY} r="4" fill={colors.primary as string} />
        </Svg>
      )}
    </View>
  );
};

// ── Metric card ───────────────────────────────────────────────────────────────

const Metric: React.FC<{ label: string; value: string; sub?: string; color?: string }> = ({
  label, value, sub, color = colors.primary,
}) => (
  <View style={ss.metric}>
    <Text variant="caption" style={ss.metricLabel}>{label}</Text>
    <Text style={[ss.metricValue, { color }]}>{value}</Text>
    {sub ? <Text variant="caption" style={ss.metricSub}>{sub}</Text> : null}
  </View>
);

// ── Section header ────────────────────────────────────────────────────────────

const SectionHeader: React.FC<{
  title: string; expanded: boolean; onToggle: () => void; color?: string;
}> = ({ title, expanded, onToggle, color = colors.warning }) => (
  <Pressable onPress={onToggle} style={ss.sectionHeader}>
    <Text variant="caption" style={[ss.sectionTitle, { color }]}>{title}</Text>
    <Text variant="caption" style={{ color }}>{expanded ? '▲' : '▼'}</Text>
  </Pressable>
);

// ── Param row ─────────────────────────────────────────────────────────────────

const ParamRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <View style={ss.paramRow}>
    <Text variant="caption" style={ss.paramLabel}>{label}</Text>
    {children}
  </View>
);

// ── Main component ────────────────────────────────────────────────────────────

const SimulatorTab: React.FC = () => {
  const [sim, setSim] = useState<SimState>(INIT);
  const [bands, setBands] = useState<Band[]>(DEFAULT_BANDS);

  // Governance params
  const [reserveRatio, setReserveRatio] = useState(0.20);
  const [gradThreshold, setGradThreshold] = useState(269000);
  const [burnMode, setBurnMode] = useState<'full' | 'partial'>('full');
  const [burnBeta, setBurnBeta] = useState(1.0);
  const [sellEnabled, setSellEnabled] = useState(true);
  const [epochDuration, setEpochDuration] = useState(10);
  const [oracleMode, setOracleMode] = useState<'genesis' | 'derived'>('genesis');
  const [extCbeUsd, setExtCbeUsd] = useState(0.01);
  const [ammFee, setAmmFee] = useState(0.003);

  // Constants
  const [maxSupply, setMaxSupply] = useState(100_000_000_000);
  const [initPrice, setInitPrice] = useState(0.0003133457);
  const [srvGenesis, setSrvGenesis] = useState(1.0);

  // UI
  const [govExpanded, setGovExpanded] = useState(false);
  const [constExpanded, setConstExpanded] = useState(false);
  const [buyStr, setBuyStr] = useState('');
  const [sellStr, setSellStr] = useState('');
  const [swapStr, setSwapStr] = useState('');
  const [swapDir, setSwapDir] = useState<'sov2cbe' | 'cbe2sov'>('sov2cbe');

  const cb = useCallback(() => computeBands(initPrice, bands), [initPrice, bands]);

  const getSovUsd = useCallback((s: SimState) => {
    if (s.graduated || oracleMode === 'derived') {
      const cbeSov = s.graduated
        ? (s.ammSov / s.ammCbe)
        : marginalPrice(s.circulatingSupply, cb());
      if (cbeSov > 0 && extCbeUsd > 0) return extCbeUsd / cbeSov;
    }
    return srvGenesis;
  }, [oracleMode, extCbeUsd, srvGenesis, cb]);

  const appendLog = (
    s: SimState,
    type: 'buy' | 'sell' | 'grad' | 'info',
    msg: string,
  ): SimState['log'] => [{ type, msg, block: s.block }, ...s.log.slice(0, 49)];

  const checkGraduation = useCallback((s: SimState): SimState => {
    if (s.graduated) return s;
    const reserveUsd = s.reserveSov * getSovUsd(s);
    if (reserveUsd < gradThreshold) return s;

    const finalPrice = marginalPrice(s.circulatingSupply, cb());
    const ammSov = s.reserveSov;
    const ammCbe = finalPrice > 0 ? ammSov / finalPrice : 0;
    const ammK = ammSov * ammCbe;
    const log = appendLog(
      s, 'grad',
      `GRADUATED at block ${s.block}! Reserve ≈ $${fmtN(reserveUsd, 0)} USD. AMM seeded at ${fmtN(finalPrice, 8)} SOV/CBE`,
    );
    return {
      ...s,
      graduated: true,
      ammSov, ammCbe, ammK,
      reserveSov: 0,
      treasuryFreeSov: s.treasuryFreeSov + s.treasuryLockedSov,
      treasuryLockedSov: 0,
      log,
    };
  }, [gradThreshold, getSovUsd, cb]);

  const executeBuy = useCallback(() => {
    const gross = parseFloat(buyStr);
    if (!gross || gross <= 0) return;
    setBuyStr('');

    setSim(prev => {
      if (prev.graduated) return prev;
      const reserveCredit = reserveRatio * gross;
      const treasuryCredit = (1 - reserveRatio) * gross;
      const minted = curveMint(reserveCredit, prev.circulatingSupply, maxSupply, cb());
      if (minted <= 0) {
        const log = appendLog(prev, 'info', `Buy failed: 0 CBE for ${fmtN(gross, 4)} SOV`);
        return { ...prev, log };
      }
      const next: SimState = {
        ...prev,
        circulatingSupply: prev.circulatingSupply + minted,
        reserveSov: prev.reserveSov + reserveCredit,
        treasuryLockedSov: prev.treasuryLockedSov + treasuryCredit,
        totalSovIn: prev.totalSovIn + gross,
        txnCount: prev.txnCount + 1,
        block: prev.block + 1,
        log: [],
        priceHistory: [],
      };
      const price = marginalPrice(next.circulatingSupply, cb());
      next.priceHistory = [...prev.priceHistory, { block: next.block, price }];
      next.log = appendLog(
        next, 'buy',
        `BUY ${fmtN(minted)} CBE for ${fmtN(gross, 4)} SOV (reserve +${fmtN(reserveCredit, 4)}, treasury +${fmtN(treasuryCredit, 4)})`,
      );
      return checkGraduation(next);
    });
  }, [buyStr, reserveRatio, maxSupply, cb, checkGraduation]);

  const executeSell = useCallback(() => {
    const cbeIn = parseFloat(sellStr);
    if (!cbeIn || cbeIn <= 0) return;
    setSellStr('');

    setSim(prev => {
      if (prev.graduated || !sellEnabled) {
        const log = appendLog(prev, 'info', 'Selling disabled or post-graduation');
        return { ...prev, log };
      }
      if (cbeIn > prev.circulatingSupply) {
        const log = appendLog(prev, 'info', 'Insufficient CBE balance');
        return { ...prev, log };
      }
      const newSupply = prev.circulatingSupply - cbeIn;
      const redemption = integrateCurve(newSupply, prev.circulatingSupply, cb());
      const fromReserve = Math.min(redemption, prev.reserveSov);
      const fromTreasury = Math.min(redemption - fromReserve, prev.treasuryLockedSov);
      const funded = fromReserve + fromTreasury;
      if (funded < redemption * 0.999) {
        const log = appendLog(prev, 'info', `Sell aborted: insufficient backing`);
        return { ...prev, log };
      }
      const beta = burnMode === 'full' ? 1.0 : burnBeta;
      const burned = Math.floor(cbeIn * beta);
      const next: SimState = {
        ...prev,
        circulatingSupply: prev.circulatingSupply - cbeIn,
        burnedSupply: prev.burnedSupply + burned,
        reserveSov: prev.reserveSov - fromReserve,
        treasuryLockedSov: prev.treasuryLockedSov - fromTreasury,
        txnCount: prev.txnCount + 1,
        block: prev.block + 1,
        log: [],
        priceHistory: [],
      };
      const price = marginalPrice(next.circulatingSupply, cb());
      next.priceHistory = [...prev.priceHistory, { block: next.block, price }];
      next.log = appendLog(
        next, 'sell',
        `SELL ${fmtN(cbeIn)} CBE → ${fmtN(funded, 4)} SOV (burned ${fmtN(burned)})`,
      );
      return next;
    });
  }, [sellStr, sellEnabled, burnMode, burnBeta, cb]);

  const executeSwap = useCallback(() => {
    const amt = parseFloat(swapStr);
    if (!amt || amt <= 0) return;
    setSwapStr('');

    setSim(prev => {
      if (!prev.graduated) return prev;
      const fee = ammFee;
      if (swapDir === 'sov2cbe') {
        const effIn = amt * (1 - fee);
        const newSov = prev.ammSov + effIn;
        const newCbe = prev.ammK / newSov;
        const out = prev.ammCbe - newCbe;
        if (out <= 0) return prev;
        const next = { ...prev, ammSov: newSov, ammCbe: newCbe, txnCount: prev.txnCount + 1, block: prev.block + 1, log: prev.log, priceHistory: prev.priceHistory };
        const price = newSov / newCbe;
        next.priceHistory = [...prev.priceHistory, { block: next.block, price }];
        next.log = appendLog(next, 'buy', `AMM ${fmtN(amt, 4)} SOV → ${fmtN(out)} CBE`);
        return next;
      } else {
        const effIn = amt * (1 - fee);
        const newCbe = prev.ammCbe + effIn;
        const newSov = prev.ammK / newCbe;
        const out = prev.ammSov - newSov;
        if (out <= 0) return prev;
        const next = { ...prev, ammSov: newSov, ammCbe: newCbe, txnCount: prev.txnCount + 1, block: prev.block + 1, log: prev.log, priceHistory: prev.priceHistory };
        const price = newSov / newCbe;
        next.priceHistory = [...prev.priceHistory, { block: next.block, price }];
        next.log = appendLog(next, 'sell', `AMM ${fmtN(amt)} CBE → ${fmtN(out, 4)} SOV`);
        return next;
      }
    });
  }, [swapStr, swapDir, ammFee]);

  const reset = useCallback(() => {
    setSim({ ...INIT, log: [{ type: 'info', msg: 'Simulation reset', block: 0 }] });
  }, []);

  // Derived values
  const curPrice = sim.graduated
    ? (sim.ammSov / sim.ammCbe)
    : marginalPrice(sim.circulatingSupply, cb());
  const sovUsd = getSovUsd(sim);
  const reserveUsd = sim.reserveSov * sovUsd;
  const gradPct = Math.min(100, (reserveUsd / gradThreshold) * 100);
  const epoch = Math.floor(sim.block / epochDuration);

  // Buy/sell quotes
  const buyQuote = (() => {
    const g = parseFloat(buyStr);
    if (!g || g <= 0 || sim.graduated) return '';
    const m = curveMint(reserveRatio * g, sim.circulatingSupply, maxSupply, cb());
    const avg = m > 0 ? g / m : 0;
    return `≈ ${fmtN(m)} CBE (avg ${fmtN(avg, 8)} SOV/CBE)`;
  })();

  const sellQuote = (() => {
    const c = parseFloat(sellStr);
    if (!c || c <= 0 || c > sim.circulatingSupply || sim.graduated) return '';
    const r = integrateCurve(sim.circulatingSupply - c, sim.circulatingSupply, cb());
    return `≈ ${fmtN(r, 4)} SOV redemption`;
  })();

  const logColors: Record<string, string> = {
    buy: colors.success,
    sell: colors.error,
    grad: '#bc8cff',
    info: colors.text_secondary,
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        <Column gap="md" style={{ padding: spacing.lg, paddingBottom: spacing['2xl'] }}>

          {/* ── Header stats ── */}
          <Card>
            <Row justify="space-between" align="center">
              <View style={[ss.badge, sim.graduated ? ss.badgeGrad : ss.badgeGenesis]}>
                <Text variant="caption" style={ss.badgeText}>
                  {sim.graduated ? 'Graduated' : oracleMode === 'derived' ? 'Live Curve' : 'Genesis Ref'}
                </Text>
              </View>
              <Row gap="md">
                <View style={{ alignItems: 'center' }}>
                  <Text variant="caption" style={{ color: colors.text_secondary }}>Block</Text>
                  <Text variant="body" style={{ fontWeight: '700' }}>{sim.block}</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text variant="caption" style={{ color: colors.text_secondary }}>Epoch</Text>
                  <Text variant="body" style={{ fontWeight: '700' }}>{epoch}</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text variant="caption" style={{ color: colors.text_secondary }}>Txns</Text>
                  <Text variant="body" style={{ fontWeight: '700' }}>{sim.txnCount}</Text>
                </View>
              </Row>
            </Row>
          </Card>

          {/* ── Metrics grid ── */}
          <View style={ss.grid}>
            <Metric label="CBE/SOV Price" value={fmtN(curPrice, 8)} sub="marginal" color={colors.success} />
            <Metric label="SOV/USD" value={`$${fmtN(sovUsd, 4)}`} sub={sim.graduated ? 'post-grad' : 'genesis SRV'} color={colors.primary} />
            <Metric label="Circulating" value={fmtN(sim.circulatingSupply)} sub="CBE tokens" color="#bc8cff" />
            <Metric label="Reserve (SOV)" value={fmtN(sim.reserveSov, 4)} sub={`≈ $${fmtN(reserveUsd, 2)}`} color={colors.warning} />
            <Metric label="Treasury" value={fmtN(sim.treasuryLockedSov, 4)} sub="locked SOV" color="#f778ba" />
            <Metric label="Burned" value={fmtN(sim.burnedSupply)} sub="CBE" color={colors.error} />
          </View>

          {/* ── Graduation bar ── */}
          <Card>
            <Text variant="h3" style={{ marginBottom: spacing.sm }}>Graduation Progress</Text>
            <View style={ss.barBg}>
              <View style={[ss.barFill, { width: `${gradPct}%` as any }]} />
            </View>
            <Row justify="space-between" style={{ marginTop: spacing.xs }}>
              <Text variant="caption" style={{ color: colors.text_secondary }}>${fmtN(reserveUsd, 0)}</Text>
              <Text variant="caption" style={{ color: colors.text_secondary }}>${fmtN(gradThreshold, 0)}</Text>
            </Row>

            {sim.graduated && (
              <View style={{ marginTop: spacing.sm }}>
                <Text variant="caption" style={{ color: '#bc8cff', marginBottom: spacing.xs }}>
                  AMM Pool (x·y=k)
                </Text>
                <View style={ss.grid}>
                  <Metric label="CBE Reserve" value={fmtN(sim.ammCbe)} color="#bc8cff" />
                  <Metric label="SOV Reserve" value={fmtN(sim.ammSov, 4)} color="#bc8cff" />
                  <Metric label="AMM Price" value={`${fmtN(sim.ammSov / sim.ammCbe, 8)} SOV`} color="#bc8cff" />
                  <Metric label="k Invariant" value={fmtN(sim.ammK)} color="#bc8cff" />
                </View>
              </View>
            )}
          </Card>

          {/* ── Price chart ── */}
          <Card>
            <Text variant="h3" style={{ marginBottom: spacing.sm }}>Price History (CBE/SOV)</Text>
            <SimChart history={sim.priceHistory} />
          </Card>

          {/* ── Buy / Sell ── */}
          {!sim.graduated ? (
            <Row gap="sm">
              <Card style={{ flex: 1 }}>
                <Text variant="caption" style={ss.actionLabel}>Buy CBE</Text>
                <TextInput
                  style={ss.input}
                  value={buyStr}
                  onChangeText={setBuyStr}
                  placeholder="SOV amount"
                  placeholderTextColor={colors.text_secondary}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onSubmitEditing={executeBuy}
                />
                {buyQuote ? (
                  <Text variant="caption" style={ss.quote}>{buyQuote}</Text>
                ) : null}
                <Pressable style={ss.btnBuy} onPress={executeBuy}>
                  <Text variant="caption" style={ss.btnText}>Buy</Text>
                </Pressable>
              </Card>

              <Card style={{ flex: 1 }}>
                <Text variant="caption" style={ss.actionLabel}>Sell CBE</Text>
                <TextInput
                  style={ss.input}
                  value={sellStr}
                  onChangeText={setSellStr}
                  placeholder="CBE amount"
                  placeholderTextColor={colors.text_secondary}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onSubmitEditing={executeSell}
                />
                {sellQuote ? (
                  <Text variant="caption" style={ss.quote}>{sellQuote}</Text>
                ) : null}
                <Pressable
                  style={[ss.btnSell, !sellEnabled && ss.btnDisabled]}
                  onPress={executeSell}
                >
                  <Text variant="caption" style={ss.btnText}>Sell</Text>
                </Pressable>
              </Card>
            </Row>
          ) : (
            <Card>
              <Text variant="caption" style={ss.actionLabel}>AMM Swap</Text>
              <TextInput
                style={ss.input}
                value={swapStr}
                onChangeText={setSwapStr}
                placeholder="Amount"
                placeholderTextColor={colors.text_secondary}
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={executeSwap}
              />
              <Row gap="sm" style={{ marginTop: spacing.xs }}>
                <Pressable
                  style={[ss.dirBtn, swapDir === 'sov2cbe' && ss.dirBtnActive]}
                  onPress={() => setSwapDir('sov2cbe')}
                >
                  <Text variant="caption" style={{ color: swapDir === 'sov2cbe' ? colors.bg_darkest : colors.text_secondary }}>
                    SOV → CBE
                  </Text>
                </Pressable>
                <Pressable
                  style={[ss.dirBtn, swapDir === 'cbe2sov' && ss.dirBtnActive]}
                  onPress={() => setSwapDir('cbe2sov')}
                >
                  <Text variant="caption" style={{ color: swapDir === 'cbe2sov' ? colors.bg_darkest : colors.text_secondary }}>
                    CBE → SOV
                  </Text>
                </Pressable>
                <Pressable style={[ss.btnBuy, { flex: 1 }]} onPress={executeSwap}>
                  <Text variant="caption" style={ss.btnText}>Swap</Text>
                </Pressable>
              </Row>
            </Card>
          )}

          {/* ── Transaction log ── */}
          <Card>
            <Row justify="space-between" align="center" style={{ marginBottom: spacing.xs }}>
              <Text variant="h3">Transaction Log</Text>
              <Pressable onPress={() => setSim(p => ({ ...p, log: [] }))}>
                <Text variant="caption" style={{ color: colors.text_secondary }}>Clear</Text>
              </Pressable>
            </Row>
            {sim.log.length === 0 ? (
              <Text variant="caption" style={{ color: colors.text_secondary }}>No transactions yet</Text>
            ) : (
              sim.log.slice(0, 8).map((entry, i) => (
                <View key={i} style={ss.logRow}>
                  <Text variant="caption" style={ss.logBlock}>#{entry.block}</Text>
                  <Text variant="caption" style={[ss.logMsg, { color: logColors[entry.type] ?? colors.text_secondary }]} numberOfLines={2}>
                    {entry.msg}
                  </Text>
                </View>
              ))
            )}
          </Card>

          {/* ── Governance params ── */}
          <Card>
            <SectionHeader
              title="Governance Parameters"
              expanded={govExpanded}
              onToggle={() => setGovExpanded(v => !v)}
              color={colors.warning}
            />
            {govExpanded && (
              <Column gap="sm" style={{ marginTop: spacing.sm }}>

                <ParamRow label={`Reserve Ratio: ${(reserveRatio * 100).toFixed(0)}%`}>
                  <SliderInput value={reserveRatio} min={0.05} max={0.5} step={0.01}
                    onChange={setReserveRatio} color={colors.warning} />
                </ParamRow>

                <ParamRow label={`Graduation Threshold`}>
                  <TextInput
                    style={ss.paramInput}
                    value={String(gradThreshold)}
                    onChangeText={t => setGradThreshold(parseFloat(t) || gradThreshold)}
                    keyboardType="decimal-pad"
                  />
                </ParamRow>

                <ParamRow label="Burn Mode">
                  <Row gap="sm">
                    <Pressable style={[ss.modeBtn, burnMode === 'full' && ss.modeBtnActive]}
                      onPress={() => setBurnMode('full')}>
                      <Text variant="caption" style={{ color: burnMode === 'full' ? colors.bg_darkest : colors.text_secondary }}>Full (β=1)</Text>
                    </Pressable>
                    <Pressable style={[ss.modeBtn, burnMode === 'partial' && ss.modeBtnActive]}
                      onPress={() => setBurnMode('partial')}>
                      <Text variant="caption" style={{ color: burnMode === 'partial' ? colors.bg_darkest : colors.text_secondary }}>Partial</Text>
                    </Pressable>
                  </Row>
                </ParamRow>

                {burnMode === 'partial' && (
                  <ParamRow label={`Burn β: ${burnBeta.toFixed(2)}`}>
                    <SliderInput value={burnBeta} min={0.01} max={1} step={0.01}
                      onChange={setBurnBeta} color={colors.warning} />
                  </ParamRow>
                )}

                <ParamRow label="Pre-graduation Selling">
                  <Switch value={sellEnabled} onValueChange={setSellEnabled}
                    trackColor={{ false: colors.border, true: colors.success }}
                    thumbColor={colors.text_primary} />
                </ParamRow>

                <ParamRow label={`Epoch Duration: ${epochDuration} blocks`}>
                  <SliderInput value={epochDuration} min={1} max={100} step={1}
                    onChange={setEpochDuration} color={colors.warning} />
                </ParamRow>

                <ParamRow label="Oracle Mode">
                  <Row gap="sm">
                    <Pressable style={[ss.modeBtn, oracleMode === 'genesis' && ss.modeBtnActive]}
                      onPress={() => setOracleMode('genesis')}>
                      <Text variant="caption" style={{ color: oracleMode === 'genesis' ? colors.bg_darkest : colors.text_secondary }}>Genesis</Text>
                    </Pressable>
                    <Pressable style={[ss.modeBtn, oracleMode === 'derived' && ss.modeBtnActive]}
                      onPress={() => setOracleMode('derived')}>
                      <Text variant="caption" style={{ color: oracleMode === 'derived' ? colors.bg_darkest : colors.text_secondary }}>Derived</Text>
                    </Pressable>
                  </Row>
                </ParamRow>

                {oracleMode === 'derived' && (
                  <ParamRow label="External CBE/USD VWAP">
                    <TextInput
                      style={ss.paramInput}
                      value={String(extCbeUsd)}
                      onChangeText={t => setExtCbeUsd(parseFloat(t) || extCbeUsd)}
                      keyboardType="decimal-pad"
                    />
                  </ParamRow>
                )}

                <ParamRow label={`AMM Swap Fee: ${(ammFee * 100).toFixed(2)}%`}>
                  <SliderInput value={ammFee} min={0} max={0.03} step={0.0005}
                    onChange={setAmmFee} color={colors.warning} />
                </ParamRow>
              </Column>
            )}
          </Card>

          {/* ── Constants ── */}
          <Card>
            <SectionHeader
              title="Chain Constants"
              expanded={constExpanded}
              onToggle={() => setConstExpanded(v => !v)}
              color="#bc8cff"
            />
            {constExpanded && (
              <Column gap="sm" style={{ marginTop: spacing.sm }}>
                <ParamRow label="Max CBE Supply">
                  <TextInput style={ss.paramInput} value={String(maxSupply)}
                    onChangeText={t => setMaxSupply(parseFloat(t) || maxSupply)}
                    keyboardType="decimal-pad" />
                </ParamRow>
                <ParamRow label="Initial Price (SOV/CBE)">
                  <TextInput style={ss.paramInput} value={String(initPrice)}
                    onChangeText={t => setInitPrice(parseFloat(t) || initPrice)}
                    keyboardType="decimal-pad" />
                </ParamRow>
                <ParamRow label="SRV Genesis (USD/SOV)">
                  <TextInput style={ss.paramInput} value={String(srvGenesis)}
                    onChangeText={t => setSrvGenesis(parseFloat(t) || srvGenesis)}
                    keyboardType="decimal-pad" />
                </ParamRow>

                <View style={ss.divider} />
                <Text variant="caption" style={{ color: colors.text_secondary }}>State Snapshot</Text>
                <Row justify="space-between">
                  <Text variant="caption" style={{ color: colors.text_secondary }}>Burned Supply</Text>
                  <Text variant="caption" style={{ color: '#bc8cff' }}>{fmtN(sim.burnedSupply)}</Text>
                </Row>
                <Row justify="space-between">
                  <Text variant="caption" style={{ color: colors.text_secondary }}>Treasury Free SOV</Text>
                  <Text variant="caption" style={{ color: '#bc8cff' }}>{fmtN(sim.treasuryFreeSov, 4)}</Text>
                </Row>
                <Row justify="space-between">
                  <Text variant="caption" style={{ color: colors.text_secondary }}>Total SOV In</Text>
                  <Text variant="caption" style={{ color: '#bc8cff' }}>{fmtN(sim.totalSovIn, 4)}</Text>
                </Row>
              </Column>
            )}
          </Card>

          {/* ── Reset ── */}
          <Pressable style={ss.btnReset} onPress={reset}>
            <Text variant="body" style={{ color: colors.text_secondary, fontWeight: '600' }}>
              Reset Simulation
            </Text>
          </Pressable>

        </Column>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
//
// Wrapped in a Proxy so `ss.X` re-evaluates after a theme swap — see
// OracleDashboardScreen for the same pattern and rationale. `applyTheme`
// rewrites the shared `colors` object in place; every access on `ss`
// checks whether the palette identity changed and regenerates the
// stylesheet on demand.

const makeSimStyles = () => StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  metric: {
    flex: 1, minWidth: '47%', backgroundColor: colors.bg_darker,
    borderRadius: borderRadius.sm, padding: spacing.sm,
  },
  metricLabel: { color: colors.text_secondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 },
  metricValue: { fontSize: typography.size.lg, fontWeight: '700' },
  metricSub: { color: colors.text_secondary, marginTop: 2 },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: borderRadius.full },
  badgeGenesis: { backgroundColor: 'rgba(63,185,80,0.15)' },
  badgeGrad: { backgroundColor: 'rgba(188,140,255,0.15)' },
  badgeText: { fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  barBg: { height: 8, backgroundColor: colors.bg_darker, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 4 },
  actionLabel: { color: colors.text_secondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.bg_darker, borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.sm, color: colors.text_primary, padding: spacing.xs + 2,
    fontSize: typography.size.sm, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: spacing.xs,
  },
  quote: { color: colors.text_secondary, marginBottom: spacing.xs, minHeight: 16 },
  btnBuy: {
    backgroundColor: colors.success, borderRadius: borderRadius.sm,
    paddingVertical: spacing.xs + 2, alignItems: 'center',
  },
  btnSell: {
    backgroundColor: colors.error, borderRadius: borderRadius.sm,
    paddingVertical: spacing.xs + 2, alignItems: 'center',
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#000', fontWeight: '700' },
  btnReset: {
    borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm, alignItems: 'center',
  },
  dirBtn: {
    flex: 1, borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.sm, paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  dirBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  logRow: { flexDirection: 'row', gap: spacing.xs, paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: colors.border },
  logBlock: { color: colors.text_secondary, minWidth: 32 },
  logMsg: { flex: 1, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 10 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  sectionTitle: { fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  paramRow: { gap: spacing.xs },
  paramLabel: { color: colors.text_secondary },
  paramInput: {
    backgroundColor: colors.bg_darker, borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.sm, color: colors.primary, padding: spacing.xs,
    fontSize: typography.size.sm,
  },
  modeBtn: {
    flex: 1, borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.sm, paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  modeBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  divider: { height: 1, backgroundColor: colors.border },
  track: { height: 4, borderRadius: 2 },
  fill: { height: '100%', borderRadius: 2 },
  thumb: { position: 'absolute', width: 16, height: 16, borderRadius: 8, marginLeft: -8, top: 4 },
});

type SimStyles = ReturnType<typeof makeSimStyles>;
let cachedSimStyles: SimStyles | null = null;
let cachedSimThemeKey: string | null = null;
const ss = new Proxy({} as SimStyles, {
  get(_t, prop: string) {
    if (cachedSimStyles === null || cachedSimThemeKey !== colors.bg_darkest) {
      cachedSimStyles = makeSimStyles();
      cachedSimThemeKey = colors.bg_darkest;
    }
    return (cachedSimStyles as unknown as Record<string, unknown>)[prop];
  },
});

export default SimulatorTab;
