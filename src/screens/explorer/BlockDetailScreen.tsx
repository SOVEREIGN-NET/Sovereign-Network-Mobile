import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Pressable, ActivityIndicator, Clipboard, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Card, Row, Column } from '../../components';
import { colors, spacing, borderRadius, typography , createThemeReactiveStyles } from '../../theme';
import { useAsyncData } from '../../hooks';
import { fetchBlock, BlockDetailResponse } from '../../services/ExplorerService';

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

const BlockDetailScreen: React.FC<any> = ({ navigation, route }) => {
  const { hashOrHeight } = route.params;

  const { data, loading, error, retry } = useAsyncData<BlockDetailResponse>(
    () => fetchBlock(hashOrHeight),
    [hashOrHeight],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text variant="body" style={{ color: colors.primary }}>← Back</Text>
        </Pressable>
        <Text variant="h3" style={{ fontWeight: '700' }}>Block Detail</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading && !data && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text variant="caption" style={{ color: colors.text_secondary, marginTop: spacing.sm }}>Loading block...</Text>
          </View>
        )}

        {error && (
          <Card>
            <Text variant="body" style={{ color: colors.error }}>Failed to load block.</Text>
            <Pressable onPress={retry} style={{ marginTop: spacing.sm }}>
              <Text variant="body" style={{ color: colors.primary }}>Tap to retry</Text>
            </Pressable>
          </Card>
        )}

        {data && (
          <Card>
            <Column gap="sm">
              <DetailRow label="Height" value={String(data.height)} />
              <DetailRow label="Hash"><CopyableHash value={data.hash} /></DetailRow>
              <DetailRow label="Previous Hash"><CopyableHash value={data.previous_hash} /></DetailRow>
              <DetailRow label="Timestamp" value={`${data.timestamp} (${formatTimeAgo(data.timestamp)})`} />
              <DetailRow label="Transactions" value={String(data.transaction_count)} />
              <DetailRow label="Merkle Root"><CopyableHash value={data.merkle_root} /></DetailRow>
              <DetailRow label="Nonce" value={String(data.nonce)} />
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

// Module-scope StyleSheet.create snapshots theme colours at app boot,
// which kept Explorer screens dark after a theme swap. Build the
// sheet at render time and wrap it in a Proxy below so every
// `styles.X` access rebuilds on theme change.
const makeStyles = () => StyleSheet.create({
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

// Proxy wrapper: rebuild the stylesheet whenever the shared `colors`
// object has been mutated by `applyTheme`. `colors.bg_darkest` is the
const styles = createThemeReactiveStyles(makeStyles);
export default BlockDetailScreen;
