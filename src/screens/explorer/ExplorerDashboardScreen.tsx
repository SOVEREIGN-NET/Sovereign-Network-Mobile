import React, { useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Card, Row, Column, Badge } from '../../components';
import { colors, spacing, borderRadius, typography , createThemeReactiveStyles } from '../../theme';
import { useAsyncData } from '../../hooks';
import {
  fetchStats,
  fetchBlocks,
  fetchTransactions,
  StatsResponse,
  BlocksResponse,
  TransactionsResponse,
} from '../../services/ExplorerService';

const MONO_FONT = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

function shortHash(hash: string): string {
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

function formatTimeAgo(ts: number): string {
  if (!ts) return '—';
  const now = Math.floor(Date.now() / 1000);
  const diff = now - ts;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const ExplorerDashboardScreen: React.FC<any> = ({ navigation }) => {
  const [searchQuery, setSearchQuery] = useState('');

  const stats = useAsyncData<StatsResponse>(() => fetchStats(), []);
  const blocks = useAsyncData<BlocksResponse>(() => fetchBlocks(8), []);
  const txs = useAsyncData<TransactionsResponse>(() => fetchTransactions(8), []);

  const handleSearch = () => {
    const q = searchQuery.trim();
    if (q) {
      navigation.navigate('ExplorerSearch', { query: q });
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text variant="body" style={{ color: colors.primary }}>← Back</Text>
        </Pressable>
        <Text variant="h3" style={{ fontWeight: '700' }}>Explorer</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Search */}
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="tx hash, block hash, did, wallet..."
            placeholderTextColor={colors.text_placeholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable onPress={handleSearch} style={styles.searchButton}>
            <Text variant="body" style={{ color: colors.bg_darkest, fontWeight: '600' }}>Search</Text>
          </Pressable>
        </View>

        {/* Network Topology entry — live view of validators + gateways. */}
        <Pressable
          onPress={() => navigation.navigate('NetworkTopology')}
          style={styles.topologyTile}
        >
          <Row justify="space-between" align="center">
            <Column gap="xs" style={{ flex: 1 }}>
              <Text variant="h3">Network Topology</Text>
              <Text variant="caption" style={{ color: colors.text_secondary }}>
                Live validators, gateways, and peer counts
              </Text>
            </Column>
            <Text variant="body" style={{ color: colors.text_secondary }}>›</Text>
          </Row>
        </Pressable>

        {/* Stats */}
        <Card>
          <Row justify="space-between" align="center" style={{ marginBottom: spacing.sm }}>
            <Text variant="h3">Network Stats</Text>
            {stats.loading && <ActivityIndicator size="small" color={colors.primary} />}
          </Row>
          {renderStatsContent()}
        </Card>

        {/* Latest Blocks */}
        <Card>
          <Row justify="space-between" align="center" style={{ marginBottom: spacing.sm }}>
            <Text variant="h3">Latest Blocks</Text>
            {blocks.loading && <ActivityIndicator size="small" color={colors.primary} />}
          </Row>
          {renderBlocksContent()}
        </Card>

        {/* Latest Transactions */}
        <Card>
          <Row justify="space-between" align="center" style={{ marginBottom: spacing.sm }}>
            <Text variant="h3">Latest Transactions</Text>
            {txs.loading && <ActivityIndicator size="small" color={colors.primary} />}
          </Row>
          {renderTransactionsContent()}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
};

const StatRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <Row justify="space-between" align="center" style={styles.statRow}>
    <Text variant="caption" style={{ color: colors.text_secondary }}>{label}</Text>
    <Text variant="body" style={{ fontWeight: '600' }}>{value}</Text>
  </Row>
);

// Module-scope StyleSheet.create snapshots theme colours at app boot,
// which kept Explorer screens dark after a theme swap. Proxy wrapper
// below rebuilds the sheet whenever `colors.bg_darkest` changes.
const makeStyles = () => StyleSheet.create({
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
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing['2xl'],
  },
  searchBar: {
    flexDirection: 'row',
    backgroundColor: colors.bg_dark,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: spacing.md,
    paddingRight: 4,
    paddingVertical: 4,
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    color: colors.text_primary,
    fontSize: typography.size.md,
    paddingVertical: spacing.xs,
  },
  searchButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.base,
    backgroundColor: colors.bg_darker,
  },
  topologyTile: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.bg_dark,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statRow: {
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
});

const styles = createThemeReactiveStyles(makeStyles);
export default ExplorerDashboardScreen;
