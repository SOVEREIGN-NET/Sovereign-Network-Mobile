import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import {
  SovMarketCard,
} from '../../../components/organisms/SovSwap';
import { SearchIcon, Text } from '../../../components';
import { mockDAOs } from '../../../services/SovSwapMockData';
import { colors, spacing, typography, borderRadius } from '../../../theme';
import type { SovDao, SovOrgType } from '../../../types/sovSwap';

type MarketFilter = 'all' | SovOrgType;

const FILTER_OPTIONS: { id: MarketFilter; label: string }[] = [
  { id: 'all', label: 'All Tokens' },
  { id: 'for-profit', label: 'For-Profit' },
  { id: 'non-profit', label: 'Non-Profit' },
];

export interface MarketplaceTabProps {
  onPickDao: (dao: SovDao) => void;
}

export const MarketplaceTab: React.FC<MarketplaceTabProps> = ({ onPickDao }) => {
  const [filter, setFilter] = useState<MarketFilter>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return mockDAOs.filter(d => {
      if (filter !== 'all' && d.type !== filter) return false;
      if (!q) return true;
      return (
        d.name.toLowerCase().includes(q) ||
        d.tokenSymbol.toLowerCase().includes(q)
      );
    });
  }, [filter, search]);

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      {/* Search Bar - Mirrored from Registry for Consistency */}
      <View style={styles.headerWrap}>
        <View style={styles.searchBar}>
          <SearchIcon color={colors.text_tertiary} size={18} style={{ marginRight: spacing.xs }} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search market tokens..."
            placeholderTextColor={colors.text_placeholder}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
      </View>

      {/* Filter row */}
      <View style={styles.filterRow}>
        {FILTER_OPTIONS.map(opt => {
          const active = filter === opt.id;
          return (
            <Pressable
              key={opt.id}
              onPress={() => setFilter(opt.id)}
              style={[styles.filterPill, active ? styles.filterActive : null]}
            >
              <Text
                style={[
                  styles.filterText,
                  active ? styles.filterTextActive : null,
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.listWrap}>
        {filtered.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No tokens found matching your criteria.</Text>
          </View>
        ) : (
          filtered.map((dao, idx) => (
            <View
              key={dao.id}
              style={[styles.rowSlot, idx > 0 ? styles.rowDivider : null]}
            >
              <SovMarketCard dao={dao} index={idx + 1} onPress={onPickDao} />
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: spacing['3xl']
  },
  headerWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg_dark,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text_primary,
    padding: 0,
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  filterPill: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
  },
  filterActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    color: colors.text_secondary,
    textTransform: 'uppercase',
  },
  filterTextActive: {
    color: colors.white,
  },
  listWrap: {
    paddingTop: 0,
    marginHorizontal: spacing.lg,
    backgroundColor: colors.bg_dark,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  rowSlot: {},
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  emptyWrap: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 14,
    color: colors.text_secondary,
    fontStyle: 'italic',
    textAlign: 'center',
  },
});

export default MarketplaceTab;
