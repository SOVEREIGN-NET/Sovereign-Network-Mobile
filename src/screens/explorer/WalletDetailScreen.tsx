import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Pressable, ActivityIndicator, Clipboard, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Card, Row, Column } from '../../components';
import { colors, spacing, borderRadius, typography , createThemeReactiveStyles } from '../../theme';
import { useAsyncData } from '../../hooks';
import { fetchWallets, WalletsResponse } from '../../services/ExplorerService';

const MONO_FONT = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

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

const WalletDetailScreen: React.FC<any> = ({ navigation, route }) => {
  const { ownerId } = route.params;

  const { data, loading, error, retry } = useAsyncData<WalletsResponse>(
    () => fetchWallets(ownerId),
    [ownerId],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text variant="body" style={{ color: colors.primary }}>← Back</Text>
        </Pressable>
        <Text variant="h3" style={{ fontWeight: '700' }}>Wallets</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.detailRow, { marginBottom: spacing.sm }]}>
          <Text variant="caption" style={styles.detailLabel}>Owner</Text>
          <CopyableHash value={ownerId} />
        </View>

        {loading && !data && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text variant="caption" style={{ color: colors.text_secondary, marginTop: spacing.sm }}>Loading wallets...</Text>
          </View>
        )}

        {error && (
          <Card>
            <Text variant="body" style={{ color: colors.error }}>Failed to load wallets.</Text>
            <Pressable onPress={retry} style={{ marginTop: spacing.sm }}>
              <Text variant="body" style={{ color: colors.primary }}>Tap to retry</Text>
            </Pressable>
          </Card>
        )}

        {data?.wallets.length === 0 && (
          <Card>
            <Text variant="body" style={{ color: colors.text_secondary }}>No wallets found for this identity.</Text>
          </Card>
        )}

        {data && data.wallets.length > 0 && (
          <Card>
            <Text variant="caption" style={{ color: colors.text_secondary, marginBottom: spacing.sm }}>
              {data.wallet_count} wallet(s)
            </Text>
            <Column gap="sm">
              {data.wallets.map(w => (
                <View key={w.wallet_id} style={styles.walletCard}>
                  <View style={{ marginBottom: 4 }}>
                    <Text variant="caption" style={styles.detailLabel}>Wallet ID</Text>
                    <CopyableHash value={w.wallet_id} />
                  </View>
                  <Row justify="space-between">
                    <Column>
                      <Text variant="caption" style={{ color: colors.text_secondary }}>Name</Text>
                      <Text variant="body">{w.wallet_name || '—'}</Text>
                    </Column>
                    <Column>
                      <Text variant="caption" style={{ color: colors.text_secondary }}>Type</Text>
                      <Text variant="body">{w.wallet_type || '—'}</Text>
                    </Column>
                  </Row>
                </View>
              ))}
            </Column>
          </Card>
        )}
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
  detailRow: {
    paddingVertical: spacing.sm, paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm, backgroundColor: colors.bg_darker,
  },
  detailLabel: {
    color: colors.primary, fontWeight: '600', fontSize: typography.size.xs,
    marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  walletCard: {
    padding: spacing.sm, borderRadius: borderRadius.sm,
    backgroundColor: colors.bg_darker, borderWidth: 1, borderColor: colors.border,
  },
  mono: { fontFamily: MONO_FONT, fontSize: typography.size.sm, color: colors.text_primary },
});

const styles = createThemeReactiveStyles(makeStyles);
export default WalletDetailScreen;
