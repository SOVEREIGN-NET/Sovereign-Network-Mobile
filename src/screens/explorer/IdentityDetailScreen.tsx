import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Pressable, ActivityIndicator, Clipboard, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Card, Column } from '../../components';
import { colors, spacing, borderRadius, typography , createThemeReactiveStyles } from '../../theme';
import { useAsyncData } from '../../hooks';
import { fetchIdentity, IdentityResponse } from '../../services/ExplorerService';

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
      <Text variant="caption" style={{ ...styles.mono, flexWrap: 'wrap' }}>{value}</Text>
      {copied && (
        <Text variant="caption" style={{ color: colors.success, fontSize: typography.size.xs }}>Copied!</Text>
      )}
    </Pressable>
  );
};

const IdentityDetailScreen: React.FC<any> = ({ navigation, route }) => {
  const { did } = route.params;

  const { data, loading, error, retry } = useAsyncData<IdentityResponse>(
    () => fetchIdentity(did),
    [did],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text variant="body" style={{ color: colors.primary }}>← Back</Text>
        </Pressable>
        <Text variant="h3" style={{ fontWeight: '700' }}>Identity Detail</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading && !data && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text variant="caption" style={{ color: colors.text_secondary, marginTop: spacing.sm }}>Loading identity...</Text>
          </View>
        )}

        {error && (
          <Card>
            <Text variant="body" style={{ color: colors.error }}>Failed to load identity.</Text>
            <Pressable onPress={retry} style={{ marginTop: spacing.sm }}>
              <Text variant="body" style={{ color: colors.primary }}>Tap to retry</Text>
            </Pressable>
          </Card>
        )}

        {data?.status === 'identity_not_found' && (
          <Card>
            <Text variant="body" style={{ color: colors.text_secondary }}>{data.message || 'Identity not found.'}</Text>
          </Card>
        )}

        {data && data.status !== 'identity_not_found' && (
          <Card>
            <Column gap="sm">
              <DetailRow label="DID"><CopyableHash value={data.did || did} /></DetailRow>
              <DetailRow label="Display Name" value={data.display_name || '—'} />
              <DetailRow label="Type" value={data.identity_type || '—'} />
              {data.registration_fee != null && (
                <DetailRow label="Registration Fee" value={String(data.registration_fee)} />
              )}
              {data.created_at != null && (
                <DetailRow label="Created" value={`${data.created_at} (${formatTimeAgo(data.created_at)})`} />
              )}
              {data.owned_wallets && data.owned_wallets.length > 0 && (
                <View style={styles.detailRow}>
                  <Text variant="caption" style={styles.detailLabel}>Wallets</Text>
                  {data.owned_wallets.map(w => (
                    <Pressable
                      key={w}
                      onPress={() => navigation.navigate('WalletDetail', { ownerId: w })}
                      style={{ marginBottom: 4 }}
                    >
                      <Text variant="caption" style={{ ...styles.mono, color: colors.primary }}>{w}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              {data.controlled_nodes && data.controlled_nodes.length > 0 && (
                <View style={styles.detailRow}>
                  <Text variant="caption" style={styles.detailLabel}>Controlled Nodes</Text>
                  {data.controlled_nodes.map(n => (
                    <CopyableHash key={n} value={n} />
                  ))}
                </View>
              )}
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

// Module-scope StyleSheet.create snapshots theme colours at boot.
// Proxy wrapper below rebuilds on theme swap. See BlockDetailScreen.
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

const styles = createThemeReactiveStyles(makeStyles);
export default IdentityDetailScreen;
