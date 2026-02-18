import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Pressable, ActivityIndicator, Clipboard, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Card, Column, Badge } from '../../components';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { useAsyncData } from '../../hooks';
import { fetchTransaction, TransactionDetailResponse } from '../../services/ExplorerService';

const MONO_FONT = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

function formatTimeAgo(ts: number): string {
  if (!ts) return '—';
  const now = Math.floor(Date.now() / 1000);
  const diff = now - ts;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const CopyableHash: React.FC<{ value: string }> = ({ value }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    Clipboard.setString(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Pressable onPress={handleCopy} style={{ flexShrink: 1 }}>
      <Text variant="caption" style={{ ...styles.mono, flexWrap: 'wrap' }}>
        {value}
      </Text>
      {copied && (
        <Text variant="caption" style={{ color: colors.success, fontSize: typography.size.xs }}>Copied!</Text>
      )}
    </Pressable>
  );
};

const TransactionDetailScreen: React.FC<any> = ({ navigation, route }) => {
  const { hash } = route.params;

  const { data, loading, error, retry } = useAsyncData<TransactionDetailResponse>(
    () => fetchTransaction(hash),
    [hash],
  );

  const info = data?.transaction;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text variant="body" style={{ color: colors.primary }}>← Back</Text>
        </Pressable>
        <Text variant="h3" style={{ fontWeight: '700' }}>Transaction Detail</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading && !data && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text variant="caption" style={{ color: colors.text_secondary, marginTop: spacing.sm }}>Loading transaction...</Text>
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
            <Text variant="body" style={{ color: colors.text_secondary }}>Transaction data unavailable.</Text>
          </Card>
        )}

        {info && (
          <Card>
            <Column gap="sm">
              <DetailRow label="Hash"><CopyableHash value={info.hash} /></DetailRow>
              <DetailRow label="Type">
                <Badge label={info.transaction_type} variant="info" size="sm" />
              </DetailRow>
              <DetailRow label="From"><CopyableHash value={info.from} /></DetailRow>
              <DetailRow label="To"><CopyableHash value={info.to} /></DetailRow>
              <DetailRow label="Amount" value={String(info.amount)} />
              <DetailRow label="Fee" value={String(info.fee)} />
              <DetailRow label="Timestamp" value={`${info.timestamp} (${formatTimeAgo(info.timestamp)})`} />
              <DetailRow label="Size" value={`${info.size} bytes`} />
              {data.block_height != null && (
                <DetailRow label="Block Height" value={String(data.block_height)} />
              )}
              {data.confirmations != null && (
                <DetailRow label="Confirmations" value={String(data.confirmations)} />
              )}
              <DetailRow label="In Mempool" value={data.in_mempool ? 'Yes' : 'No'} />
            </Column>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const DetailRow: React.FC<{ label: string; value?: string; children?: React.ReactNode }> = ({ label, value, children }) => (
  <View style={styles.detailRow}>
    <Text variant="caption" style={styles.detailLabel}>{label}</Text>
    {children ?? <Text variant="body" style={{ flexShrink: 1 }}>{value}</Text>}
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg_darkest },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing['2xl'] },
  center: { alignItems: 'center', paddingVertical: spacing['3xl'] },
  detailRow: {
    paddingVertical: spacing.sm, paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm, backgroundColor: colors.bg_darker,
  },
  detailLabel: {
    color: colors.primary, fontWeight: '600', fontSize: typography.size.xs,
    marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  mono: { fontFamily: MONO_FONT, fontSize: typography.size.sm, color: colors.text_primary },
});

export default TransactionDetailScreen;
