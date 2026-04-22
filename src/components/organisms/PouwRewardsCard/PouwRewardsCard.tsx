import React, { useEffect, useMemo, useReducer, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';

import { Badge, Card, Column, RefreshRing, Row, Text } from '../../index';
import { useTranslation } from '../../../i18n';
import { colors, spacing, typography, borderRadius } from '../../../theme';
import { usePouwStatus } from '../../../hooks/usePouwStatus';
import { formatAtomicPriceDisplay, SOV_DECIMALS } from '../../../utils/tokenUnits';

/**
 * PoUW Rewards card — a compact, interactive visualization of the
 * `/api/v1/pouw/status` payload rendered inline on the Dashboard.
 *
 * The card cycles through three tab views:
 *   - Overview — epoch countdown ring + lifetime totals + budget bar
 *   - Stats — paid / pending / failed / suspicious / active vs. target
 *   - Multipliers — bar chart of proof-type reward weights
 *
 * All u128 values come in as decimal strings from the endpoint; the
 * arithmetic here stays in BigInt so huge atoms values never lose
 * precision on the way to display. No `Number(u128String)` anywhere.
 *
 * Uses the same `useOracleData`-backed polling + disk cache as the
 * oracle price cards so the card doesn't flash a blank state when the
 * user re-enters the screen, and degrades gracefully to the last
 * cached value when the node is unreachable.
 */

type Tab = 'overview' | 'stats' | 'multipliers';

const TABS: Tab[] = ['overview', 'stats', 'multipliers'];

// Platform-appropriate monospace family. Used to render the digital
// countdown (e.g. "17:00") so glyph widths are fixed and the label
// doesn't reflow as seconds tick.
const MONO_FONT = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

// 10^18 as a BigInt — used for all atoms → SOV conversions. Defined
// once so we don't allocate a fresh BigInt every render.
const ATOMS_PER_SOV = 10n ** BigInt(SOV_DECIMALS);

// All grid cells on the Stats tab reserve this much height. Chosen so
// the one cell with a contextualising `hint` (Active nodes → "of 100
// expected") fits without pushing past its row-neighbours and
// breaking the 2×3 grid's vertical rhythm.
const STATS_CELL_MIN_HEIGHT = 80;

/** Header badge copy: exhausted > stale > live (order of precedence). */
const resolveBadgeLabel = (
  exhausted: boolean,
  stale: boolean,
  t: ReturnType<typeof useTranslation>['t'],
): string => {
  if (exhausted) return t.pouwCard.exhaustedBadge;
  if (stale) return t.pouwCard.staleBadge;
  return t.pouwCard.liveBadge;
};

/** Header badge variant — same precedence as the label. */
const resolveBadgeVariant = (
  exhausted: boolean,
  stale: boolean,
): 'error' | 'warning' | 'success' => {
  if (exhausted) return 'error';
  if (stale) return 'warning';
  return 'success';
};

export const PouwRewardsCard: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const status = usePouwStatus();

  const data = status.data;

  // Render a muted placeholder card until the first fetch completes
  // AND the disk cache has had a chance to hydrate. We intentionally
  // don't render zeros — a zero-filled card looks like "no rewards"
  // rather than "loading".
  if (!data) {
    return (
      <Card>
        <Row justify="space-between" align="center">
          <Text variant="h3">{t.pouwCard.title}</Text>
          <RefreshRing
            lastFetchedAt={status.lastFetchedAt}
            nextRefetchAt={status.nextRefetchAt}
            loading={status.loading}
            stale={status.stale}
            onRetry={status.retry}
            size={14}
          />
        </Row>
        <Text
          variant="caption"
          style={{ color: colors.text_secondary, marginTop: spacing.sm }}
        >
          {status.error ? t.pouwCard.unavailable : t.pouwCard.loading}
        </Text>
      </Card>
    );
  }

  const budgetExhausted = data.budget.budget_state === 'exhausted';

  return (
    <Card>
      {/* Header */}
      <Row justify="space-between" align="center">
        <Column gap="xs" style={{ flex: 1 }}>
          <Text variant="h3">{t.pouwCard.title}</Text>
          <Text
            variant="caption"
            style={{ color: colors.text_secondary, fontSize: typography.size.xs }}
          >
            {t.pouwCard.subtitle}
          </Text>
        </Column>
        <Row align="center" style={{ gap: spacing.sm }}>
          <Badge
            label={resolveBadgeLabel(budgetExhausted, status.stale, t)}
            variant={resolveBadgeVariant(budgetExhausted, status.stale)}
            size="sm"
          />
          <RefreshRing
            lastFetchedAt={status.lastFetchedAt}
            nextRefetchAt={status.nextRefetchAt}
            loading={status.loading}
            stale={status.stale}
            onRetry={status.retry}
            size={14}
          />
        </Row>
      </Row>

      {/* Segmented tabs */}
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: colors.bg_darker,
          borderRadius: borderRadius.full,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 3,
          marginTop: spacing.md,
        }}
      >
        {TABS.map(tab => {
          const isActive = activeTab === tab;
          return (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={{
                flex: 1,
                paddingVertical: spacing.xs + 2,
                borderRadius: borderRadius.full,
                backgroundColor: isActive ? colors.primary : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  fontSize: typography.size.xs,
                  fontWeight: isActive ? '700' : '500',
                  color: isActive ? colors.bg_darkest : colors.text_secondary,
                }}
              >
                {t.pouwCard.tabs[tab]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ marginTop: spacing.md }}>
        {activeTab === 'overview' && <OverviewTab data={data} />}
        {activeTab === 'stats' && <StatsTab data={data} />}
        {activeTab === 'multipliers' && <MultipliersTab data={data} />}
      </View>
    </Card>
  );
};

// ---------- Overview tab ------------------------------------------------

const OverviewTab: React.FC<{ data: ReturnType<typeof usePouwStatus>['data'] }>
  = ({ data }) => {
  const { t } = useTranslation();
  if (!data) return null;

  // Live-tick the epoch remaining time once a second so the ring and
  // countdown stay in sync with wall-clock without refetching.
  const [, tick] = useReducer(x => x + 1, 0);
  useEffect(() => {
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const epochProgress = computeEpochProgress(data.epoch);
  // Compute remaining from wall clock against `ends_at` instead of
  // the static `remaining_secs` field — the payload only refreshes
  // on the 60s poll, so relying on the field directly would flat-
  // line then jump. Wall-clock derivation ticks live.
  const nowSecs = Math.floor(Date.now() / 1000);
  const remainingSecs = Math.max(0, data.epoch.ends_at - nowSecs);
  const clock = remainingSecs <= 0 ? '' : formatClock(remainingSecs);

  const distributedSov = formatAtomicPriceDisplay(
    data.stats.total_sov_distributed,
    ATOMS_PER_SOV.toString(),
    '',
    { minFractionDigits: 2, maxFractionDigits: 6 },
  );

  return (
    <Column gap="md">
      <Row align="center" style={{ gap: spacing.lg }}>
        <EpochRing
          progress={epochProgress}
          epochNumber={data.epoch.current}
          label={t.pouwCard.epoch.label}
        />
        <Column gap="xs" style={{ flex: 1 }}>
          <Text
            variant="caption"
            style={{ color: colors.text_secondary, fontSize: typography.size.xs }}
          >
            {t.pouwCard.totals.distributed}
          </Text>
          <Text
            style={{
              fontSize: 22,
              fontWeight: '700',
              color: colors.text_primary,
            }}
            numberOfLines={1}
          >
            {distributedSov}{' '}
            <Text
              style={{
                fontSize: typography.size.sm,
                color: colors.text_secondary,
              }}
            >
              {t.pouwCard.totals.distributedUnit}
            </Text>
          </Text>
          {/* Countdown — the live clock is rendered inside a nested
              <Text> span with a monospace font so the digits keep a
              fixed width and the label doesn't reflow as the second
              ticks. The surrounding localized prefix/suffix stays in
              the default UI font. */}
          <Text
            variant="caption"
            style={{
              color: colors.text_secondary,
              fontSize: typography.size.xs,
            }}
          >
            {remainingSecs <= 0 ? (
              t.pouwCard.epoch.rollingOver
            ) : (
              renderCountdownWithMono(
                t.pouwCard.epoch.remaining.replace('{value}', clock),
                clock,
              )
            )}
          </Text>
        </Column>
      </Row>

      {/* Budget utilization bar */}
      <Column gap="xs">
        <Row justify="space-between" align="center">
          <Text
            variant="caption"
            style={{ color: colors.text_secondary, fontSize: typography.size.xs }}
          >
            {t.pouwCard.budget.label}
          </Text>
          <Text
            variant="caption"
            style={{ fontSize: typography.size.xs, fontWeight: '600' }}
          >
            {(data.budget.pouw_utilization_pct ?? 0).toFixed(4)}%
          </Text>
        </Row>
        <UtilizationBar pct={data.budget.pouw_utilization_pct ?? 0} />
        <Text
          variant="caption"
          style={{
            color: colors.text_tertiary,
            fontSize: typography.size.xs,
            marginTop: 2,
          }}
          numberOfLines={1}
        >
          {t.pouwCard.budget.utilizationOf
            .replace(
              '{used}',
              formatAtomicPriceDisplay(
                data.budget.pouw_total_paid,
                ATOMS_PER_SOV.toString(),
                '',
                { minFractionDigits: 0, maxFractionDigits: 2 },
              ),
            )
            .replace(
              '{total}',
              formatAtomicPriceDisplay(
                data.budget.pouw_total_budget,
                ATOMS_PER_SOV.toString(),
                '',
                { minFractionDigits: 0, maxFractionDigits: 0 },
              ),
            )}
        </Text>
      </Column>

      {/* Unique earners strip */}
      <Row justify="space-between" align="center">
        <Text
          variant="caption"
          style={{ color: colors.text_secondary, fontSize: typography.size.xs }}
        >
          {t.pouwCard.totals.earners}
        </Text>
        <Text style={{ fontSize: typography.size.md, fontWeight: '700' }}>
          {data.stats.unique_earners}
        </Text>
      </Row>
    </Column>
  );
};

// ---------- Stats tab (narrative story) --------------------------------
//
// Three-act composition tells more than a 2×3 grid of raw numbers:
//
//   1. Reward pipeline   — what happened to each calculated reward:
//                           paid / pending / failed, as a stacked bar
//                           (proportions) + a headline "X% paid".
//   2. Participation     — how much of the expected node set is
//                           actually producing work this epoch, as a
//                           progress bar.
//   3. Integrity         — trust signal: suspicious DIDs, as a tinted
//                           status row (green OK / red warning), not a
//                           raw integer box.
//
// Same data, but the arc is: "of the rewards we've calculated so far
// we paid 89%, driven by 3 nodes out of a target 100, with no
// anomalies detected."
const StatsTab: React.FC<{ data: ReturnType<typeof usePouwStatus>['data'] }>
  = ({ data }) => {
  const { t } = useTranslation();
  if (!data) return null;

  const paid = data.stats.total_rewards_paid;
  const pending = data.stats.total_rewards_pending;
  const failed = data.stats.total_rewards_failed;
  // `calculated` is the authoritative denominator — not `paid + pending
  // + failed`, which can diverge transiently while the payout
  // processor is running. We take the max so we never report a paid
  // pct above 100%.
  const calculated = Math.max(
    data.stats.total_rewards_calculated,
    paid + pending + failed,
  );
  const paidPct = calculated > 0 ? (paid / calculated) * 100 : 0;

  // The two node counts are protocol-distinct:
  //   - `active_nodes`            : real count of DIDs that submitted
  //                                  work this epoch (live metric).
  //   - `expected_active_nodes`   : protocol constant for per-node cap
  //                                  sizing (NOT a live metric).
  const activeNodes = data.epoch_pool.active_nodes;
  const expectedNodes = data.epoch_pool.expected_active_nodes;
  const participationPct =
    expectedNodes > 0
      ? Math.min(100, (activeNodes / expectedNodes) * 100)
      : 0;

  const suspicious = data.stats.suspicious_dids;

  return (
    <Column gap="lg">
      {/* Act 1: Reward pipeline */}
      <Column gap="xs">
        <Row justify="space-between" align="center">
          <Text
            variant="caption"
            style={{
              color: colors.text_secondary,
              fontSize: typography.size.xs,
              fontWeight: '600',
            }}
          >
            {t.pouwCard.stats.pipeline.title}
          </Text>
          {calculated > 0 ? (
            <Text style={{ fontSize: typography.size.xs, fontWeight: '700' }}>
              {t.pouwCard.stats.pipeline.summary
                .replace('{pct}', paidPct.toFixed(paidPct >= 99.95 ? 0 : 1))
                .replace('{paid}', String(paid))
                .replace('{total}', String(calculated))}
            </Text>
          ) : null}
        </Row>

        {calculated > 0 ? (
          <>
            <PipelineBar
              paid={paid}
              pending={pending}
              failed={failed}
              total={calculated}
            />
            <Row
              align="center"
              style={{ gap: spacing.md, flexWrap: 'wrap' }}
            >
              <LegendDot
                color={colors.success}
                label={t.pouwCard.stats.pipeline.legendPaid.replace(
                  '{count}',
                  String(paid),
                )}
              />
              <LegendDot
                color="#f5a623"
                label={t.pouwCard.stats.pipeline.legendPending.replace(
                  '{count}',
                  String(pending),
                )}
              />
              <LegendDot
                color={failed > 0 ? colors.error : colors.text_tertiary}
                label={t.pouwCard.stats.pipeline.legendFailed.replace(
                  '{count}',
                  String(failed),
                )}
              />
            </Row>
          </>
        ) : (
          <Text
            variant="caption"
            style={{ color: colors.text_tertiary, fontSize: typography.size.xs }}
          >
            {t.pouwCard.stats.pipeline.empty}
          </Text>
        )}
      </Column>

      {/* Act 2: Network participation */}
      <Column gap="xs">
        <Row justify="space-between" align="center">
          <Text
            variant="caption"
            style={{
              color: colors.text_secondary,
              fontSize: typography.size.xs,
              fontWeight: '600',
            }}
          >
            {t.pouwCard.stats.participation.title}
          </Text>
          <Text style={{ fontSize: typography.size.xs, fontWeight: '700' }}>
            {t.pouwCard.stats.participation.percentLabel.replace(
              '{pct}',
              participationPct.toFixed(participationPct >= 99.95 ? 0 : 1),
            )}
          </Text>
        </Row>
        <ParticipationBar pct={participationPct} />
        <Text
          variant="caption"
          style={{
            color: colors.text_tertiary,
            fontSize: typography.size.xs,
            marginTop: 2,
          }}
        >
          {t.pouwCard.stats.participation.summary
            .replace('{active}', String(activeNodes))
            .replace('{expected}', String(expectedNodes))}
        </Text>
      </Column>

      {/* Act 3: Integrity — matches the Pipeline/Participation rhythm */}
      <Column gap="xs">
        <Row justify="space-between" align="center">
          <Text
            variant="caption"
            style={{
              color: colors.text_secondary,
              fontSize: typography.size.xs,
              fontWeight: '600',
            }}
          >
            {t.pouwCard.stats.integrity.title}
          </Text>
          <Text
            style={{
              fontSize: typography.size.xs,
              fontWeight: '700',
              color: suspicious > 0 ? colors.error : colors.success,
            }}
          >
            {suspicious > 0
              ? t.pouwCard.stats.integrity.statusFlagged ?? 'Flagged'
              : t.pouwCard.stats.integrity.statusClean ?? 'Clean'}
          </Text>
        </Row>
        <Row align="center" style={{ gap: spacing.xs }}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: suspicious > 0 ? colors.error : colors.success,
            }}
          />
          <Text
            variant="caption"
            style={{
              color: colors.text_tertiary,
              fontSize: typography.size.xs,
            }}
          >
            {suspicious > 0
              ? t.pouwCard.stats.integrity.flagged.replace(
                  '{count}',
                  String(suspicious),
                )
              : t.pouwCard.stats.integrity.clean}
          </Text>
        </Row>
      </Column>
    </Column>
  );
};

/**
 * Stacked horizontal bar for the reward pipeline. Segments are sized
 * by their share of `total`. Segments below 2% of the bar are bumped
 * to that minimum so "1 failed of 1000" doesn't disappear — the
 * boost is rebalanced against larger segments so the bar still
 * occupies exactly 100% of the track.
 */
const PipelineBar: React.FC<{
  paid: number;
  pending: number;
  failed: number;
  total: number;
}> = ({ paid, pending, failed, total }) => {
  const height = 10;
  const raw = [paid, pending, failed].map(n => (total > 0 ? n / total : 0));
  const segments = boostTinySegments(raw, 0.02);
  const fills = [colors.success, '#f5a623', colors.error];

  return (
    <View
      style={{
        height,
        borderRadius: height / 2,
        backgroundColor: `${colors.text_secondary}22`,
        overflow: 'hidden',
        flexDirection: 'row',
      }}
    >
      {segments.map((share, i) =>
        share > 0 ? (
          <View
            key={i}
            style={{
              width: `${share * 100}%`,
              backgroundColor: fills[i],
            }}
          />
        ) : null,
      )}
    </View>
  );
};

/**
 * Left-aligned progress bar for network participation. Amber below
 * 50% of target (under-participation signal), primary blue otherwise.
 * Sub-visible positive values still render as a sliver.
 */
const ParticipationBar: React.FC<{ pct: number }> = ({ pct }) => {
  const clamped = Math.max(0, Math.min(100, pct));
  const width = clamped > 0 && clamped < 0.5 ? 0.5 : clamped;
  const height = 10;
  const tint = clamped < 50 ? '#f5a623' : colors.primary;
  return (
    <View
      style={{
        height,
        borderRadius: height / 2,
        backgroundColor: `${colors.text_secondary}22`,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          height: '100%',
          width: `${width}%`,
          backgroundColor: tint,
          borderRadius: height / 2,
        }}
      />
    </View>
  );
};

/** Small coloured dot + label used in the pipeline legend row. */
const LegendDot: React.FC<{ color: string; label: string }> = ({
  color,
  label,
}) => (
  <Row align="center" style={{ gap: 6 }}>
    <View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: color,
      }}
    />
    <Text
      variant="caption"
      style={{ color: colors.text_secondary, fontSize: typography.size.xs }}
    >
      {label}
    </Text>
  </Row>
);

/**
 * Boost non-zero segments below `minVisible` up to `minVisible`, and
 * subtract the boost proportionally from the largest segment so the
 * total still sums to 1. Keeps a "1 failed of 45" red sliver visible
 * without visually over-weighting it.
 */
function boostTinySegments(shares: number[], minVisible: number): number[] {
  const result = shares.slice();
  let debt = 0;
  for (let i = 0; i < result.length; i++) {
    if (result[i] > 0 && result[i] < minVisible) {
      debt += minVisible - result[i];
      result[i] = minVisible;
    }
  }
  if (debt > 0) {
    const absorbable = result.reduce(
      (sum, s) => (s >= minVisible * 2 ? sum + s : sum),
      0,
    );
    if (absorbable > 0) {
      for (let i = 0; i < result.length; i++) {
        if (result[i] >= minVisible * 2) {
          result[i] -= (result[i] / absorbable) * debt;
        }
      }
    }
  }
  return result;
}

// ---------- Multipliers tab --------------------------------------------

const MultipliersTab: React.FC<{ data: ReturnType<typeof usePouwStatus>['data'] }>
  = ({ data }) => {
  const { t } = useTranslation();
  if (!data) return null;

  const rows = useMemo(
    () =>
      (
        [
          'hash',
          'merkle',
          'signature',
          'web4_manifest_route',
          'web4_content_served',
        ] as const
      ).map(k => ({
        key: k,
        label: t.pouwCard.multipliers[k],
        value: data.multipliers[k] ?? 0,
      })),
    [data.multipliers, t],
  );
  const max = Math.max(1, ...rows.map(r => r.value));

  const baseUnitSov = formatAtomicPriceDisplay(
    data.multipliers.base_reward_unit,
    ATOMS_PER_SOV.toString(),
    '',
    { minFractionDigits: 6, maxFractionDigits: 12 },
  );

  return (
    <Column gap="sm">
      {rows.map(row => (
        <View key={row.key}>
          <Row justify="space-between" align="center" style={{ marginBottom: 4 }}>
            <Text
              style={{
                fontSize: typography.size.xs,
                color: colors.text_secondary,
              }}
            >
              {row.label}
            </Text>
            <Text style={{ fontSize: typography.size.xs, fontWeight: '700' }}>
              ×{row.value}
            </Text>
          </Row>
          <View
            style={{
              height: 6,
              borderRadius: 3,
              backgroundColor: `${colors.text_secondary}22`,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                height: '100%',
                width: `${(row.value / max) * 100}%`,
                backgroundColor: colors.primary,
              }}
            />
          </View>
        </View>
      ))}

      <Row
        justify="space-between"
        align="center"
        style={{ marginTop: spacing.sm }}
      >
        <Text
          style={{
            fontSize: typography.size.xs,
            color: colors.text_secondary,
          }}
        >
          {t.pouwCard.multipliers.unit}
        </Text>
        <Text
          style={{
            fontSize: typography.size.xs,
            fontWeight: '600',
            color: colors.text_primary,
          }}
          numberOfLines={1}
        >
          {baseUnitSov} SOV
        </Text>
      </Row>
      <Row justify="space-between" align="center">
        <Text
          style={{
            fontSize: typography.size.xs,
            color: colors.text_secondary,
          }}
        >
          {t.pouwCard.eligibility.minAge}
        </Text>
        <Text
          style={{
            fontSize: typography.size.xs,
            fontWeight: '600',
          }}
        >
          {t.pouwCard.eligibility.hours.replace(
            '{value}',
            String(Math.round((data.eligibility.min_identity_age_secs ?? 0) / 3600)),
          )}
        </Text>
      </Row>
    </Column>
  );
};

// ---------- Viz primitives ----------------------------------------------

/**
 * Circular progress ring showing how much of the current epoch has
 * elapsed. Epoch number rendered in the middle so the ring doubles
 * as a live epoch counter.
 */
const EpochRing: React.FC<{
  progress: number;
  epochNumber: number;
  label: string;
}> = ({ progress, epochNumber, label }) => {
  const size = 80;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle
          cx={c}
          cy={c}
          r={r}
          stroke={`${colors.text_secondary}30`}
          strokeWidth={stroke}
          fill="transparent"
        />
        <Circle
          cx={c}
          cy={c}
          r={r}
          stroke={colors.primary}
          strokeWidth={stroke}
          fill="transparent"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - progress)}
          transform={`rotate(-90 ${c} ${c})`}
        />
      </Svg>
      <View
        style={{
          position: 'absolute',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            fontSize: typography.size.xs,
            color: colors.text_secondary,
            lineHeight: 12,
          }}
        >
          {label}
        </Text>
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.primary }}>
          {epochNumber}
        </Text>
      </View>
    </View>
  );
};

/**
 * Utilization bar. Sub-0.05% values are drawn as a minimum-visible
 * sliver so the user can tell "some activity" from "nothing yet".
 */
const UtilizationBar: React.FC<{ pct: number }> = ({ pct }) => {
  const clamped = Math.max(0, Math.min(100, pct));
  const width = clamped < 0.05 && pct > 0 ? 0.05 : clamped;
  const height = 8;
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: `${colors.text_secondary}22`, overflow: 'hidden' }}>
      <Svg width="100%" height={height}>
        <Rect
          x={0}
          y={0}
          width={`${width}%`}
          height={height}
          rx={height / 2}
          fill={clamped > 95 ? colors.error : colors.primary}
        />
      </Svg>
    </View>
  );
};

// ---------- Helpers -----------------------------------------------------

/**
 * Epoch progress 0..1. `data.epoch.remaining_secs` only updates on
 * the 60s poll, so deriving from started_at vs wall-clock gives a
 * smoother live tick for the ring between fetches.
 */
function computeEpochProgress(
  epoch: { started_at: number; ends_at: number; remaining_secs: number; duration_secs: number },
): number {
  const now = Date.now() / 1000;
  if (epoch.ends_at <= epoch.started_at) return 0;
  const elapsed = now - epoch.started_at;
  const total = epoch.ends_at - epoch.started_at;
  return Math.max(0, Math.min(1, elapsed / total));
}

/**
 * Digital-clock style countdown — `MM:SS` under an hour, `H:MM:SS`
 * above. Locale-agnostic on purpose: "17:00" reads the same in every
 * language and the leading digits are zero-padded so the label width
 * doesn't jitter as seconds tick. Pair with `renderCountdownWithMono`
 * to get the mono-digits-within-i18n-wrapper rendering.
 */
function formatClock(secs: number): string {
  const total = Math.max(0, Math.floor(secs));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * Render a localized countdown label (e.g. "17:00 remaining" / "17:00
 * restantes") with just the clock substring in a monospace font. The
 * surrounding prefix/suffix stay in the normal UI font. Falls back to
 * a plain string when the clock can't be located in the label.
 */
function renderCountdownWithMono(full: string, clock: string): React.ReactNode {
  const idx = full.indexOf(clock);
  if (idx < 0) return full;
  const prefix = full.slice(0, idx);
  const suffix = full.slice(idx + clock.length);
  return (
    <>
      {prefix}
      <Text style={{ fontFamily: MONO_FONT, color: colors.text_secondary, fontSize: typography.size.xs }}>
        {clock}
      </Text>
      {suffix}
    </>
  );
}

export default PouwRewardsCard;
