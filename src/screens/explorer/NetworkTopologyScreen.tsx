/**
 * NetworkTopologyScreen
 *
 * Live view of the validator + gateway set served by the node's
 * `/api/v1/network/directory` endpoint. Three sections:
 *   1. Summary strip — chain height, counts, connected peer count.
 *   2. This node — DID + role + SPKI pin of the node we're talking to.
 *   3. Validators + Gateways — expandable rows with stake, status, ports.
 *
 * Polling is handled by `useNetworkTopology` (10s default, paused in
 * background). The freshness ring in the header reflects staleness.
 */

import React, { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Card, Row, Column, Badge, RefreshRing } from '../../components';
import {
  colors,
  spacing,
  borderRadius,
  typography,
  createThemeReactiveStyles,
} from '../../theme';
import { useNetworkTopology } from '../../hooks/useNetworkTopology';
import type {
  NetworkTopologyResponse,
  TopologyValidator,
  TopologyGateway,
} from '../../types/networkTopology';

const MONO_FONT = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

const shortDid = (did: string | undefined): string => {
  if (!did) return '—';
  const tail = did.startsWith('did:zhtp:') ? did.slice(9) : did;
  if (tail.length <= 14) return did;
  return `${did.slice(0, 18)}…${did.slice(-6)}`;
};

const resolveStatusVariant = (
  status: string,
): 'success' | 'warning' | 'error' | 'default' => {
  if (status === 'active') return 'success';
  if (status === 'stale' || status === 'inactive') return 'warning';
  if (status === 'slashed' || status === 'jailed') return 'error';
  return 'default';
};

const fmtCompactSov = (microSov: number): string => {
  // stake on-chain is expressed as whole numbers (per the contract, not
  // atoms). Compact with K/M/B suffix for readability.
  if (!Number.isFinite(microSov) || microSov <= 0) return '0';
  if (microSov >= 1_000_000_000) return `${(microSov / 1_000_000_000).toFixed(2)}B`;
  if (microSov >= 1_000_000) return `${(microSov / 1_000_000).toFixed(2)}M`;
  if (microSov >= 1_000) return `${(microSov / 1_000).toFixed(1)}K`;
  return microSov.toString();
};

const fmtUpdatedAgo = (fetchedAt: number | null): string => {
  if (!fetchedAt) return 'not yet updated';
  const s = Math.max(0, Math.floor((Date.now() - fetchedAt) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
};

const ValidatorRow: React.FC<{
  v: TopologyValidator;
  isSelf: boolean;
  expanded: boolean;
  onToggle: () => void;
}> = ({ v, isSelf, expanded, onToggle }) => (
  <Pressable onPress={onToggle} style={styles.row}>
    <Row justify="space-between" align="center">
      <Column gap="xs" style={{ flex: 1 }}>
        <Row align="center" style={{ gap: spacing.sm, flexWrap: 'wrap' }}>
          <Text variant="caption" style={styles.didMono} numberOfLines={1}>
            {shortDid(v.did)}
          </Text>
          {isSelf ? (
            <Badge label="this node" variant="default" size="sm" />
          ) : null}
          <Badge
            label={v.status}
            variant={resolveStatusVariant(v.status)}
            size="sm"
          />
        </Row>
        <Text variant="caption" style={styles.meta}>
          {v.endpoint} · {fmtCompactSov(v.stake)} SOV · {v.blocks_validated.toLocaleString()} blocks
        </Text>
      </Column>
      <Text style={styles.chevron}>{expanded ? '▾' : '▸'}</Text>
    </Row>
    {expanded ? (
      <Column gap="xs" style={styles.rowDetails}>
        <DetailLine label="DID" value={v.did} mono />
        <DetailLine label="Role" value={v.role} />
        <DetailLine label="IP" value={v.ip} mono />
        <DetailLine label="QUIC port" value={String(v.quic_port)} />
        <DetailLine label="Mesh port" value={String(v.mesh_port)} />
        <DetailLine
          label="Stake"
          value={`${v.stake.toLocaleString()} SOV`}
        />
        <DetailLine
          label="Blocks validated"
          value={v.blocks_validated.toLocaleString()}
        />
        <DetailLine
          label="Last activity"
          value={`block ${v.last_activity.toLocaleString()}`}
        />
        <DetailLine label="Commission" value={`${v.commission_rate}%`} />
        <DetailLine label="Admission" value={v.admission} />
      </Column>
    ) : null}
  </Pressable>
);

const GatewayRow: React.FC<{
  g: TopologyGateway;
  isSelf: boolean;
  expanded: boolean;
  onToggle: () => void;
}> = ({ g, isSelf, expanded, onToggle }) => (
  <Pressable onPress={onToggle} style={styles.row}>
    <Row justify="space-between" align="center">
      <Column gap="xs" style={{ flex: 1 }}>
        <Row align="center" style={{ gap: spacing.sm, flexWrap: 'wrap' }}>
          <Text variant="caption" style={styles.didMono} numberOfLines={1}>
            {shortDid(g.did)}
          </Text>
          {isSelf ? (
            <Badge label="this node" variant="default" size="sm" />
          ) : null}
          <Badge
            label={g.status}
            variant={resolveStatusVariant(g.status)}
            size="sm"
          />
        </Row>
        <Text variant="caption" style={styles.meta}>
          {g.endpoint} · DNS :{g.zdns_port} · {fmtCompactSov(g.stake)} SOV
        </Text>
      </Column>
      <Text style={styles.chevron}>{expanded ? '▾' : '▸'}</Text>
    </Row>
    {expanded ? (
      <Column gap="xs" style={styles.rowDetails}>
        <DetailLine label="DID" value={g.did} mono />
        <DetailLine label="Role" value={g.role} />
        <DetailLine label="IP" value={g.ip} mono />
        <DetailLine label="QUIC port" value={String(g.quic_port)} />
        <DetailLine label="ZDNS port" value={String(g.zdns_port)} />
        <DetailLine
          label="Stake"
          value={`${g.stake.toLocaleString()} SOV`}
        />
        <DetailLine label="Commission" value={`${g.commission_rate}%`} />
      </Column>
    ) : null}
  </Pressable>
);

const DetailLine: React.FC<{ label: string; value: string; mono?: boolean }> = ({
  label,
  value,
  mono,
}) => (
  <Row justify="space-between" align="center" style={{ gap: spacing.sm }}>
    <Text variant="caption" style={styles.detailLabel}>
      {label}
    </Text>
    <Text
      variant="caption"
      style={mono ? styles.detailValueMono : styles.detailValue}
      numberOfLines={1}
    >
      {value}
    </Text>
  </Row>
);

const SummaryStrip: React.FC<{
  topo: NetworkTopologyResponse;
}> = ({ topo }) => (
  <Card>
    <Row justify="space-between" align="center">
      <SummaryCell label="Chain height" value={topo.chain_height.toLocaleString()} />
      <Divider />
      <SummaryCell label="Validators" value={String(topo.topology.total_validators)} />
      <Divider />
      <SummaryCell label="Gateways" value={String(topo.topology.total_gateways)} />
      <Divider />
      <SummaryCell label="Peers" value={String(topo.topology.connected_peers)} />
    </Row>
  </Card>
);

const SummaryCell: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <Column style={{ alignItems: 'center', minWidth: 60 }}>
    <Text style={styles.summaryValue}>{value}</Text>
    <Text style={styles.summaryLabel}>{label}</Text>
  </Column>
);

const Divider: React.FC = () => (
  <View
    style={{
      width: 1,
      height: 28,
      backgroundColor: colors.border,
      marginHorizontal: spacing.sm,
    }}
  />
);

const ThisNodeCard: React.FC<{ topo: NetworkTopologyResponse }> = ({ topo }) => (
  <Card>
    <Column gap="xs">
      <Text variant="caption" style={styles.sectionLabel}>
        THIS NODE
      </Text>
      <Text variant="body" style={styles.mono} numberOfLines={1}>
        {topo.this_node.did}
      </Text>
      <Row align="center" style={{ gap: spacing.sm, flexWrap: 'wrap' }}>
        <Badge label={topo.this_node.role} variant="default" size="sm" />
        <Text variant="caption" style={styles.meta}>
          network: {topo.network_id}
        </Text>
      </Row>
      <Text variant="caption" style={styles.monoSmall} numberOfLines={1}>
        SPKI {topo.this_node.spki_pin}
      </Text>
    </Column>
  </Card>
);

const NetworkTopologyScreen: React.FC<{ navigation: { goBack: () => void } }> = ({
  navigation,
}) => {
  const { data, loading, error, fetchedAt, stale, refetch } = useNetworkTopology();
  const [expanded, setExpanded] = useState<string | null>(null);

  const selfDid = data?.this_node.did;

  const validators = useMemo(
    () => (data?.topology.validators ?? []).slice().sort((a, b) => b.stake - a.stake),
    [data],
  );
  const gateways = useMemo(
    () => (data?.topology.gateways ?? []).slice().sort((a, b) => b.stake - a.stake),
    [data],
  );

  const toggle = (id: string) =>
    setExpanded(prev => (prev === id ? null : id));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text variant="body" style={{ color: colors.primary }}>
            ← Back
          </Text>
        </Pressable>
        <Text variant="h3" style={{ fontWeight: '700' }}>Network</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Row justify="space-between" align="center" style={{ paddingHorizontal: spacing.xs }}>
          <Text variant="caption" style={{ color: stale ? '#f5a623' : colors.text_secondary }}>
            {error ? `⚠ ${error.message}` : fmtUpdatedAgo(fetchedAt)}
          </Text>
          <RefreshRing
            lastFetchedAt={fetchedAt}
            nextRefetchAt={fetchedAt ? fetchedAt + 10_000 : null}
            loading={loading}
            stale={stale}
            onRetry={refetch}
            size={16}
          />
        </Row>

        {data ? (
          <>
            <SummaryStrip topo={data} />
            <ThisNodeCard topo={data} />

            <Card>
              <Column gap="sm">
                <Text variant="caption" style={styles.sectionLabel}>
                  VALIDATORS ({validators.length})
                </Text>
                {validators.length === 0 ? (
                  <Text variant="caption" style={styles.meta}>
                    No validators reported.
                  </Text>
                ) : (
                  validators.map(v => (
                    <ValidatorRow
                      key={v.did}
                      v={v}
                      isSelf={v.did === selfDid}
                      expanded={expanded === v.did}
                      onToggle={() => toggle(v.did)}
                    />
                  ))
                )}
              </Column>
            </Card>

            <Card>
              <Column gap="sm">
                <Text variant="caption" style={styles.sectionLabel}>
                  GATEWAYS ({gateways.length})
                </Text>
                {gateways.length === 0 ? (
                  <Text variant="caption" style={styles.meta}>
                    No gateways reported.
                  </Text>
                ) : (
                  gateways.map(g => (
                    <GatewayRow
                      key={g.did}
                      g={g}
                      isSelf={g.did === selfDid}
                      expanded={expanded === g.did}
                      onToggle={() => toggle(g.did)}
                    />
                  ))
                )}
              </Column>
            </Card>
          </>
        ) : loading ? (
          <Card>
            <Text variant="caption" style={styles.meta}>
              Loading topology…
            </Text>
          </Card>
        ) : error ? (
          <Card>
            <Pressable onPress={refetch}>
              <Text variant="caption" style={{ color: colors.error }}>
                {error.message} — tap to retry
              </Text>
            </Pressable>
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
};

const makeStyles = () => ({
  container: {
    flex: 1 as const,
    backgroundColor: colors.bg_darkest,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing['2xl'],
  },
  row: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowDetails: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  didMono: {
    color: colors.text_primary,
    fontFamily: MONO_FONT,
    fontSize: typography.size.xs,
  },
  meta: {
    color: colors.text_secondary,
    fontSize: typography.size.xs,
  },
  chevron: {
    color: colors.text_tertiary,
    fontSize: typography.size.md,
    marginLeft: spacing.sm,
  },
  detailLabel: {
    color: colors.text_tertiary,
    fontSize: typography.size.xs,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  detailValue: {
    color: colors.text_primary,
    fontSize: typography.size.xs,
    flexShrink: 1,
    marginLeft: spacing.md,
  },
  detailValueMono: {
    color: colors.text_primary,
    fontSize: typography.size.xs,
    flexShrink: 1,
    marginLeft: spacing.md,
    fontFamily: MONO_FONT,
  },
  mono: { fontFamily: MONO_FONT },
  monoSmall: {
    color: colors.text_tertiary,
    fontFamily: MONO_FONT,
    fontSize: typography.size.xs,
  },
  sectionLabel: {
    color: colors.text_tertiary,
    fontSize: typography.size.xs,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
    fontWeight: '600' as const,
  },
  summaryValue: {
    color: colors.text_primary,
    fontSize: typography.size.lg,
    fontWeight: '700' as const,
  },
  summaryLabel: {
    color: colors.text_tertiary,
    fontSize: typography.size.xs,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginTop: 2,
  },
});

const styles = createThemeReactiveStyles(makeStyles);

export default NetworkTopologyScreen;
