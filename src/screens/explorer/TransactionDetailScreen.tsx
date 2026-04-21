import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Pressable, ActivityIndicator, Clipboard, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Card, Column, Row, Badge } from '../../components';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { useAsyncData } from '../../hooks';
import { fetchTransaction, TransactionDetailResponse } from '../../services/ExplorerService';
import type { WalletTransaction } from '../../services/AppService';
import { atomsToDisplayLocale, SOV_DECIMALS } from '../../utils/tokenUnits';

/** Normalize a raw atoms value (string or legacy number) to a canonical decimal string. */
const atomsString = (v: unknown): string => {
  if (v == null) return '0';
  const s = typeof v === 'number' ? String(Math.trunc(v)) : String(v).trim();
  return /^\d+$/.test(s) ? s : '0';
};

const atomsIsPositive = (v: unknown): boolean => {
  const s = atomsString(v);
  return s !== '0';
};

/**
 * Format atoms for display using the token's decimals. `decimals` defaults
 * to SOV_DECIMALS for SOV-only values (e.g. fees), but for the main tx
 * amount the caller should pass the tx's own `decimals` when present.
 */
const formatAtoms = (
  atoms: unknown,
  decimals: number = SOV_DECIMALS,
  fractionDigits = 8,
): string => atomsToDisplayLocale(atomsString(atoms), decimals, fractionDigits);

const MONO_FONT = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

function formatTimestamp(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts * 1000);
  return d.toLocaleString();
}

function formatTimeAgo(ts: number): string {
  if (!ts) return '—';
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatAmount(info: TransactionDetailResponse['transaction']): string {
  if (!info) return '—';
  if (info.amount_human != null) return String(info.amount_human);
  // Explorer response has no decimals field today — fall back to SOV.
  return formatAtoms(info.amount);
}

function formatFee(fee: unknown): string {
  // Fees are always paid in SOV (18 decimals).
  return formatAtoms(fee, SOV_DECIMALS);
}

function formatAddress(addr: string | null | undefined): string | null {
  if (!addr || addr === 'unknown') return null;
  if (addr === 'genesis') return 'Genesis Block';
  return addr;
}

const CopyableValue: React.FC<{ value: string }> = ({ value }) => {
  const [copied, setCopied] = useState(false);
  return (
    <Pressable
      onPress={() => {
        Clipboard.setString(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      style={{ flexShrink: 1 }}
    >
      <Text style={styles.mono}>{value}</Text>
      {copied && (
        <Text style={{ color: colors.success, fontSize: typography.size.xs }}>Copied!</Text>
      )}
    </Pressable>
  );
};

const DetailRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}</Text>
    <View style={{ flex: 1, alignItems: 'flex-end' }}>{children}</View>
  </View>
);

const DetailText: React.FC<{ value: string; dim?: boolean }> = ({ value, dim }) => (
  <Text style={[styles.detailValue, dim && { color: colors.text_secondary }]}>{value}</Text>
);

const TransactionDetailScreen: React.FC<any> = ({ navigation, route }) => {
  const { hash, activityTx } = route.params as {
    hash: string;
    activityTx?: WalletTransaction;
  };

  // Primary data source: the activity tx passed from the SID screen. It has
  // all the fields we need (amount, fee, from_wallet, to_address, memo,
  // block_height, status). The explorer fetch is secondary — used when no
  // activity tx was passed (deep link) or to fill gaps.
  const { data, loading, error, retry } = useAsyncData<TransactionDetailResponse>(
    () => fetchTransaction(hash),
    [hash],
  );

  const explorerInfo = data?.transaction;

  // Merge activity + explorer into a single view model. Activity wins when
  // both have the same field, because the wallet-transactions endpoint
  // returns rich per-address data that the generic explorer may not.
  const merged = (() => {
    if (!activityTx && !explorerInfo) return null;
    const amountAtomic = atomsString(activityTx?.amount ?? explorerInfo?.amount);
    // Use the tx's own decimals when the backend tags them; otherwise fall
    // back to SOV. The activity row is the authoritative source because the
    // /wallet/transactions endpoint is the one being upgraded to carry
    // per-row `decimals`.
    const amountDecimals = activityTx?.decimals ?? SOV_DECIMALS;
    const amountHumanStr =
      activityTx?.amount_human != null
        ? String(activityTx.amount_human)
        : explorerInfo?.amount_human != null
        ? String(explorerInfo.amount_human)
        : formatAtoms(amountAtomic, amountDecimals);
    const feeAtomic = atomsString(activityTx?.fee ?? explorerInfo?.fee);
    const from =
      activityTx?.from_wallet ??
      (formatAddress(explorerInfo?.from) === 'Genesis Block'
        ? null
        : formatAddress(explorerInfo?.from));
    const to =
      activityTx?.to_address ??
      (formatAddress(explorerInfo?.to) ?? null);
    return {
      hash: activityTx?.tx_hash ?? explorerInfo?.hash ?? hash,
      type: activityTx?.tx_type ?? explorerInfo?.transaction_type ?? 'transaction',
      amountHuman: amountHumanStr,
      amountAtomic,
      feeAtomic,
      from,
      to,
      timestamp: activityTx?.timestamp ?? explorerInfo?.timestamp ?? 0,
      blockHeight: activityTx?.block_height ?? data?.block_height ?? null,
      confirmations: data?.confirmations ?? null,
      status: (activityTx?.status ?? explorerInfo?.status) as string | undefined,
      memo: activityTx?.memo ?? explorerInfo?.memo ?? null,
      size: explorerInfo?.size ?? null,
    };
  })();

  const statusLabel = (() => {
    if (!merged) return null;
    if (merged.status) return merged.status;
    if (data?.in_mempool) return 'pending';
    if (merged.confirmations != null && merged.confirmations > 0) return 'confirmed';
    return null;
  })();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text variant="body" style={{ color: colors.primary }}>← Back</Text>
        </Pressable>
        <Text variant="h3" style={{ fontWeight: '700' }}>Transaction</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading && !merged && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text variant="caption" style={{ color: colors.text_secondary, marginTop: spacing.sm }}>
              Loading...
            </Text>
          </View>
        )}

        {error && !merged && (
          <Card>
            <Text variant="body" style={{ color: colors.error }}>Failed to load transaction.</Text>
            <Pressable onPress={retry} style={{ marginTop: spacing.sm }}>
              <Text variant="body" style={{ color: colors.primary }}>Tap to retry</Text>
            </Pressable>
          </Card>
        )}

        {!loading && !merged && !error && (
          <Card>
            <Text variant="body" style={{ color: colors.text_secondary }}>Transaction not found.</Text>
          </Card>
        )}

        {merged && (() => {
          // Direction: incoming / outgoing / neutral — drives icon, title,
          // amount sign, and color. Inferred from tx_type keywords.
          const typeLower = (merged.type || '').toLowerCase();
          const direction: 'in' | 'out' | 'neutral' =
            /in$|receive|credit|mint|reward/.test(typeLower)
              ? 'in'
              : /out$|send|debit|burn|fee|transfer$/.test(typeLower)
              ? 'out'
              : 'neutral';
          const directionIcon =
            direction === 'in' ? '↓' : direction === 'out' ? '↑' : '⇄';
          const directionTitle =
            direction === 'in'
              ? 'Received'
              : direction === 'out'
              ? 'Sent'
              : 'Transaction';
          const amountSign =
            direction === 'in' ? '+' : direction === 'out' ? '−' : '';
          const amountColor =
            direction === 'in'
              ? colors.success
              : direction === 'out'
              ? colors.primary
              : colors.text_primary;
          const isPending = statusLabel === 'pending';
          const statusDotColor = isPending
            ? colors.warning
            : statusLabel === 'confirmed'
            ? colors.success
            : colors.text_tertiary;
          const typeSubtitle = merged.type
            ? merged.type.replace(/_/g, ' ')
            : '';
          return (
          <>
            {/* Hero summary card: direction icon + title + big signed amount.
                Replaces the previous pill badges with a single, meaningful
                composition that communicates direction, status, and value at
                a glance. */}
            <Card>
              <Row
                style={{
                  alignItems: 'center',
                  gap: spacing.md,
                  marginBottom: spacing.md,
                }}
              >
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: amountColor + '22',
                    borderWidth: 1,
                    borderColor: amountColor + '55',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 22, color: amountColor, fontWeight: '700' }}>
                    {directionIcon}
                  </Text>
                </View>
                <Column gap="xs" style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: typography.size.lg,
                      fontWeight: typography.weight.semibold,
                      color: colors.text_primary,
                    }}
                  >
                    {directionTitle}
                  </Text>
                  <Row style={{ alignItems: 'center', gap: spacing.xs }}>
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: statusDotColor,
                      }}
                    />
                    <Text
                      style={{
                        fontSize: typography.size.xs,
                        color: colors.text_secondary,
                      }}
                    >
                      {statusLabel ?? 'unknown'}
                      {typeSubtitle ? ` · ${typeSubtitle}` : ''}
                      {merged.timestamp ? ` · ${formatTimeAgo(merged.timestamp)}` : ''}
                    </Text>
                  </Row>
                </Column>
              </Row>

              <View style={styles.amountHero}>
                <Text style={{ ...styles.amountValue, color: amountColor }}>
                  {amountSign}
                  {merged.amountHuman.toLocaleString('en-US', { maximumFractionDigits: 8 })}
                </Text>
                <Text
                  style={{
                    fontSize: typography.size.lg,
                    color: colors.text_secondary,
                    fontWeight: typography.weight.semibold,
                  }}
                >
                  SOV
                </Text>
              </View>

              {merged.feeAtomic > 0 && (
                <View
                  style={{
                    marginTop: spacing.md,
                    paddingTop: spacing.sm,
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: typography.size.xs,
                      color: colors.text_secondary,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}
                  >
                    Network fee
                  </Text>
                  <Text
                    style={{
                      fontSize: typography.size.sm,
                      color: colors.text_primary,
                      fontWeight: typography.weight.semibold,
                    }}
                  >
                    {formatAtoms(merged.feeAtomic, SOV_DECIMALS)}{' '}
                    SOV
                  </Text>
                </View>
              )}
            </Card>

            {/* Details */}
            <Card>
              <Column gap="xs">
                <DetailRow label="Hash">
                  <CopyableValue value={merged.hash} />
                </DetailRow>
                <DetailRow label="From">
                  {merged.from
                    ? <CopyableValue value={merged.from} />
                    : <DetailText value="—" dim />}
                </DetailRow>
                <DetailRow label="To">
                  {merged.to
                    ? <CopyableValue value={merged.to} />
                    : <DetailText value="—" dim />}
                </DetailRow>
                <DetailRow label="Amount">
                  <DetailText value={`${merged.amountHuman} SOV`} />
                </DetailRow>
                {atomsIsPositive(merged.feeAtomic) && (
                  <DetailRow label="Fee">
                    <DetailText value={`${formatAtoms(merged.feeAtomic, SOV_DECIMALS)} SOV`} />
                  </DetailRow>
                )}
                <DetailRow label="Time">
                  <DetailText value={`${formatTimestamp(merged.timestamp)} · ${formatTimeAgo(merged.timestamp)}`} />
                </DetailRow>
                {merged.blockHeight != null && (
                  <DetailRow label="Block">
                    <DetailText value={`#${merged.blockHeight}`} />
                  </DetailRow>
                )}
                {merged.confirmations != null && (
                  <DetailRow label="Confirmations">
                    <DetailText value={String(merged.confirmations)} />
                  </DetailRow>
                )}
                {merged.size != null && (
                  <DetailRow label="Size">
                    <DetailText value={`${merged.size} bytes`} />
                  </DetailRow>
                )}
                {merged.memo ? (
                  <DetailRow label="Memo">
                    <DetailText value={merged.memo} />
                  </DetailRow>
                ) : null}
              </Column>
            </Card>
          </>
          );
        })()}
      </ScrollView>
    </SafeAreaView>
  );
};

const makeStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg_darkest },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing['2xl'] },
  center: { alignItems: 'center', paddingVertical: spacing['3xl'] },
  amountHero: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center',
    gap: spacing.xs, marginVertical: spacing.sm,
  },
  amountValue: {
    fontSize: 36, fontWeight: '700', color: colors.primary,
  },
  detailRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.sm, paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm, backgroundColor: colors.bg_darker,
    gap: spacing.sm,
  },
  detailLabel: {
    fontSize: typography.size.xs, color: colors.text_secondary,
    fontWeight: '600', flexShrink: 0,
  },
  detailValue: {
    fontSize: typography.size.sm, color: colors.text_primary,
    textAlign: 'right',
  },
  mono: {
    fontFamily: MONO_FONT, fontSize: typography.size.sm,
    color: colors.text_primary, flexWrap: 'wrap',
  },
});

// Theme-reactive stylesheet proxy — see BlockDetailScreen.
type S = ReturnType<typeof makeStyles>;
let _cached: S | null = null;
let _key: string | null = null;
const styles = new Proxy({} as S, {
  get(_t, prop: string) {
    if (_cached === null || _key !== colors.bg_darkest) {
      _cached = makeStyles();
      _key = colors.bg_darkest;
    }
    return (_cached as unknown as Record<string, unknown>)[prop];
  },
});

export default TransactionDetailScreen;
