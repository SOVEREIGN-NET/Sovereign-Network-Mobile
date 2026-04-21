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
import { Text, Card } from '../../components';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { useAsyncData } from '../../hooks';
import { searchBlockchain, SearchResponse } from '../../services/ExplorerService';

const MONO_FONT = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

function shortHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

const SearchScreen: React.FC<any> = ({ navigation, route }) => {
  const initialQuery = route.params?.query || '';
  const [searchInput, setSearchInput] = useState(initialQuery);
  const [activeQuery, setActiveQuery] = useState(initialQuery);

  const { data, loading, error, retry } = useAsyncData<SearchResponse>(
    async () => {
      if (!activeQuery) return null as any;
      return searchBlockchain(activeQuery);
    },
    [activeQuery],
  );

  const handleSearch = () => {
    const q = searchInput.trim();
    if (q) setActiveQuery(q);
  };

  const navigateToResult = () => {
    if (!data) return;
    const type = String(data.result_type || '').toLowerCase();
    switch (type) {
      case 'block':
        navigation.navigate('BlockDetail', { hashOrHeight: data.query });
        break;
      case 'tx':
      case 'transaction':
      case 'transaction_hash': {
        const txHash =
          data?.result?.tx_hash ||
          data?.result?.hash ||
          data?.result?.transaction_hash ||
          data.query;
        navigation.navigate('TransactionDetail', { hash: txHash });
        break;
      }
      case 'identity':
      case 'did':
        navigation.navigate('IdentityDetail', { did: data.query });
        break;
      case 'wallet':
      case 'address':
        navigation.navigate('WalletDetail', { ownerId: data.query });
        break;
      default:
        // Best effort: if query resembles tx hash, open transaction detail directly.
        if (/^[a-f0-9]{32,}$/i.test(data.query)) {
          navigation.navigate('TransactionDetail', { hash: data.query });
        }
        break;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text variant="body" style={{ color: colors.primary }}>← Back</Text>
        </Pressable>
        <Text variant="h3" style={{ fontWeight: '700' }}>Search</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="tx hash, block hash, did, wallet..."
            placeholderTextColor={colors.text_placeholder}
            value={searchInput}
            onChangeText={setSearchInput}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus={!initialQuery}
          />
          <Pressable onPress={handleSearch} style={styles.searchButton}>
            <Text variant="body" style={{ color: colors.bg_darkest, fontWeight: '600' }}>Search</Text>
          </Pressable>
        </View>

        {loading && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text variant="caption" style={{ color: colors.text_secondary, marginTop: spacing.sm }}>Searching...</Text>
          </View>
        )}

        {error && (
          <Card>
            <Text variant="body" style={{ color: colors.error }}>Search failed — node may be unreachable.</Text>
            <Pressable onPress={retry} style={{ marginTop: spacing.sm }}>
              <Text variant="body" style={{ color: colors.primary }}>Tap to retry</Text>
            </Pressable>
          </Card>
        )}

        {data && !loading && (
          <Card>
            {data.result_type ? (
              <Pressable onPress={navigateToResult} style={styles.resultRow}>
                <View style={{ flex: 1 }}>
                  <Text variant="caption" style={{ color: colors.text_secondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Found {data.result_type}
                  </Text>
                  <Text variant="body" style={{ ...styles.mono, marginTop: 4 }}>
                    {shortHash(data.query)}
                  </Text>
                </View>
                <Text variant="body" style={{ color: colors.primary }}>View →</Text>
              </Pressable>
            ) : (
              <Text variant="body" style={{ color: colors.text_secondary }}>
                {data.message || `No results for "${data.query}"`}
              </Text>
            )}
          </Card>
        )}

        {!activeQuery && !loading && (
          <Text variant="caption" style={{ color: colors.text_secondary, textAlign: 'center', marginTop: spacing.xl }}>
            Enter a transaction hash, block hash, wallet ID, or DID to search.
          </Text>
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
  searchBar: {
    flexDirection: 'row', backgroundColor: colors.bg_dark,
    borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.border,
    paddingLeft: spacing.md, paddingRight: 4, paddingVertical: 4, alignItems: 'center',
  },
  searchInput: {
    flex: 1, color: colors.text_primary, fontSize: typography.size.md, paddingVertical: spacing.xs,
  },
  searchButton: {
    backgroundColor: colors.primary, paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs + 2, borderRadius: borderRadius.full,
  },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.sm, paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm, backgroundColor: colors.bg_darker,
  },
  mono: { fontFamily: MONO_FONT, fontSize: typography.size.sm, color: colors.text_primary },
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

export default SearchScreen;
