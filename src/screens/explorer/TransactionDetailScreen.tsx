import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Pressable, ActivityIndicator, Clipboard, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Card, Column, Row, Badge } from '../../components';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { useAsyncData } from '../../hooks';
import { fetchTransaction, TransactionDetailResponse } from '../../services/ExplorerService';

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
  if (info.amount_human != null) return String(Number(info.amount_human));
  return String(Number(info.amount) / 1e8);
}

function formatFee(fee: number): string {
  return String(Number(fee) / 1e8);
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
  const { hash } = route.params;

  const { data, loading, error, retry } = useAsyncData<TransactionDetailResponse>(
    () => fetchTransaction(hash),
    [hash],
  );

  const info = data?.transaction;

  const statusLabel = (() => {
    if (!data) return null;
    if (info?.status) return info.status;
    if (data.in_mempool) return 'pending';
    if (data.confirmations != null && data.confirmations > 0) return 'confirmed';
    return null;
  })();

  const fromAddr = formatAddress(info?.from);
  const toAddr = formatAddress(info?.to);

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
        {loading && !data && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text variant="caption" style={{ color: colors.text_secondary, marginTop: spacing.sm }}>
              Loading...
            </Text>
          </View>
        )}

        {error && (
          <Card>
            <Text variant="body" style={{ color: colors.error }}>Failed to load transaction.</Text>
            <Pressable onPress={retry} style={{ marginTop: spacing.sm }}>
              <Text variant="body" style={{ color: colors.primary }}>Tap to retry</Text>
            </Pressable>
          </Card>
        )}

        {data && !info && (
          <Card>
            <Text variant="body" style={{ color: colors.text_secondary }}>Transaction not found.</Text>
          </Card>
        )}

        {info && (
          <>
            {/* Summary */}
            <Card>
              <Row justify="space-between" align="center" style={{ marginBottom: spacing.sm }}>
                <Badge label={info.transaction_type} variant="info" size="sm" />
                {statusLabel && (
                  <Badge
                    label={statusLabel}
                    variant={statusLabel === 'confirmed' ? 'success' : 'warning'}
                    size="sm"
                  />
                )}
              </Row>
              <View style={styles.amountHero}>
                <Text style={styles.amountValue}>{formatAmount(info)}</Text>
                <Text variant="caption" style={{ color: colors.text_secondary }}>SOV</Text>
              </View>
              <Text variant="caption" style={{ color: colors.text_secondary, textAlign: 'center' }}>
                Fee: {formatFee(info.fee)} SOV
              </Text>
            </Card>

            {/* Details */}
            <Card>
              <Column gap="xs">
                <DetailRow label="Hash">
                  <CopyableValue value={info.hash} />
                </DetailRow>
                <DetailRow label="From">
                  {fromAddr === 'Genesis Block'
                    ? <DetailText value="Genesis Block" />
                    : fromAddr
                    ? <CopyableValue value={fromAddr} />
                    : <DetailText value="—" dim />}
                </DetailRow>
                <DetailRow label="To">
                  {toAddr
                    ? <CopyableValue value={toAddr} />
                    : <DetailText value="—" dim />}
                </DetailRow>
                <DetailRow label="Time">
                  <DetailText value={`${formatTimestamp(info.timestamp)} · ${formatTimeAgo(info.timestamp)}`} />
                </DetailRow>
                {data.block_height != null && (
                  <DetailRow label="Block">
                    <DetailText value={`#${data.block_height}`} />
                  </DetailRow>
                )}
                {data.confirmations != null && (
                  <DetailRow label="Confirmations">
                    <DetailText value={String(data.confirmations)} />
                  </DetailRow>
                )}
                <DetailRow label="Size">
                  <DetailText value={`${info.size} bytes`} />
                </DetailRow>
                {info.memo ? (
                  <DetailRow label="Memo">
                    <DetailText value={info.memo} />
                  </DetailRow>
                ) : null}
              </Column>
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
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

export default TransactionDetailScreen;
