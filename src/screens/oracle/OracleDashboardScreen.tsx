import React, { useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Card, Row, Column, Badge } from '../../components';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { useAsyncData } from '../../hooks';
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
} from '../../services/OracleService';

const MONO_FONT = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

// Safe number formatter — never crashes on undefined/null/NaN
const fmt = (v: unknown, decimals = 4, prefix = '$'): string => {
  const n = typeof v === 'number' ? v : parseFloat(v as any);
  if (!isFinite(n)) return '—';
  return `${prefix}${n.toFixed(decimals)}`;
};

const fmtChange = (v: unknown): string => {
  const n = typeof v === 'number' ? v : parseFloat(v as any);
  if (!isFinite(n)) return '—';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(4)}`;
};

const fmtPct = (v: unknown): string => {
  const n = typeof v === 'number' ? v : parseFloat(v as any);
  if (!isFinite(n)) return '—';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
};

type Tab = 'price' | 'variation' | 'status' | 'config';

const TABS: { key: Tab; label: string }[] = [
  { key: 'price', label: 'Price' },
  { key: 'variation', label: 'Variation' },
  { key: 'status', label: 'Status' },
  { key: 'config', label: 'Config' },
];

const PAIRS: OraclePair[] = ['SOV/USD', 'CBE/USD'];
const PERIODS: VariationPeriod[] = ['1h', '24h', '7d'];

// --- Shared sub-components ---

const StatRow: React.FC<{ label: string; value: string; mono?: boolean }> = ({
  label,
  value,
  mono,
}) => (
  <Row justify="space-between" align="center" style={styles.statRow}>
    <Text variant="caption" style={{ color: colors.text_secondary }}>
      {label}
    </Text>
    <Text variant="body" style={[{ fontWeight: '600' }, mono && styles.mono]}>
      {value}
    </Text>
  </Row>
);

const LoadingState: React.FC = () => (
  <ActivityIndicator
    size="large"
    color={colors.primary}
    style={{ marginTop: spacing['2xl'] }}
  />
);

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

const PriceTab: React.FC = () => {
  const [pair, setPair] = useState<OraclePair>('SOV/USD');
  const { data, loading, error, retry } = useAsyncData<OraclePriceResponse>(
    () => fetchOraclePrice(pair),
    [pair],
  );

  return (
    <Column gap="md">
      <PairToggle value={pair} onChange={setPair} />

      {loading && <LoadingState />}
      {!loading && error && (
        <ErrorState
          message={error.message || 'No price available — tap to retry'}
          onRetry={retry}
        />
      )}
      {!loading && !error && data && (
        <>
          <Card>
            <View style={styles.priceHero}>
              <Text variant="caption" style={styles.priceLabel}>
                {data.pair}
              </Text>
              <Text style={styles.priceValue}>{fmt(data.price)}</Text>
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
                <>
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
                    label="Token ID"
                    value={data.token_id ?? '—'}
                    mono
                  />
                </>
              )}
            </Column>
          </Card>
        </>
      )}
    </Column>
  );
};

// --- Variation Tab ---

const VariationTab: React.FC = () => {
  const [pair, setPair] = useState<OraclePair>('SOV/USD');
  const [period, setPeriod] = useState<VariationPeriod>('24h');
  const { data, loading, error, retry } = useAsyncData<OracleVariationResponse>(
    () => fetchOracleVariation(pair, period),
    [pair, period],
  );

  const pctRaw =
    data == null
      ? 0
      : data.pair === 'SOV/USD'
      ? data.percent_change
      : data.percent_change_since_base;
  const pct = typeof pctRaw === 'number' && isFinite(pctRaw) ? pctRaw : 0;
  const changeIsPositive = pct >= 0;

  return (
    <Column gap="md">
      <PairToggle value={pair} onChange={setPair} />
      <PeriodToggle value={period} onChange={setPeriod} />

      {loading && <LoadingState />}
      {!loading && error && (
        <ErrorState
          message={error.message || 'No variation data — tap to retry'}
          onRetry={retry}
        />
      )}
      {!loading && !error && data && (
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
                <StatRow label="Latest Price" value={fmt(data.latest_price)} />
                <StatRow
                  label="Reference Price"
                  value={fmt(data.reference_price)}
                />
                <StatRow
                  label="Change"
                  value={fmtChange(data.absolute_change)}
                />
                <StatRow label="High" value={fmt(data.high)} />
                <StatRow label="Low" value={fmt(data.low)} />
                <StatRow label="Mean" value={fmt(data.mean)} />
                <StatRow label="Std Dev" value={fmt(data.stdev, 4, '')} />
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
                    value={fmt(data.current_price)}
                  />
                  <StatRow label="Base Price" value={fmt(data.base_price)} />
                  <StatRow
                    label="Change Since Base"
                    value={fmtChange(data.absolute_change_since_base)}
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
  data: ReturnType<typeof useAsyncData<OracleStatusResponse>>;
}> = ({ data }) => {
  if (data.loading) return <LoadingState />;
  if (data.error) return <ErrorState onRetry={data.retry} />;
  if (!data.data) return null;

  const d = data.data;
  const isHealthy =
    d.latest_finalized_price !== null &&
    d.current_epoch - d.latest_finalized_price.epoch_id <= 2;

  return (
    <Column gap="md">
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
  data: ReturnType<typeof useAsyncData<OracleConfigResponse>>;
}> = ({ data }) => {
  if (data.loading) return <LoadingState />;
  if (data.error) return <ErrorState onRetry={data.retry} />;
  if (!data.data) return null;

  const d = data.data;

  return (
    <Column gap="md">
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
  const [activeTab, setActiveTab] = useState<Tab>('price');

  const status = useAsyncData<OracleStatusResponse>(() => fetchOracleStatus(), []);
  const config = useAsyncData<OracleConfigResponse>(() => fetchOracleConfig(), []);

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

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'price' && <PriceTab />}
        {activeTab === 'variation' && <VariationTab />}
        {activeTab === 'status' && <StatusTab data={status} />}
        {activeTab === 'config' && <ConfigTab data={config} />}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
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
    backgroundColor: colors.bg_darker,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
    borderRadius: borderRadius.full,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.xs + 2,
    alignItems: 'center',
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

export default OracleDashboardScreen;
