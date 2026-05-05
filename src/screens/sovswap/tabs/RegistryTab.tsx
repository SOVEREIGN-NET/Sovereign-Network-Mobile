import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  SovDaoCard,
  SovSectionHeader,
} from '../../../components/organisms/SovSwap';
import { mockDAOs } from '../../../services/SovSwapMockData';
import {
  createSovSwapStyles,
  sovswapColors,
  sovswapSpacing,
  sovswapType,
} from '../theme/sovswapTokens';
import type { SovDao, SovOrgType } from '../../../types/sovSwap';

type RegistryFilter = 'all' | SovOrgType;

const FILTER_OPTIONS: { id: RegistryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'for-profit', label: 'For-Profit' },
  { id: 'non-profit', label: 'Non-Profit' },
];

export interface RegistryTabProps {
  onPickDao: (dao: SovDao) => void;
}

/**
 * Registry tab — index of every DAO in the network. Search input is
 * a single underlined caret line (no boxed border) so it reads as a
 * marginal note rather than a form field. The filter row is a triplet
 * of pill chips with a hairline separator beneath.
 */
export const RegistryTab: React.FC<RegistryTabProps> = ({ onPickDao }) => {
  const [filter, setFilter] = useState<RegistryFilter>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return mockDAOs.filter(d => {
      if (filter !== 'all' && d.type !== filter) return false;
      if (!q) return true;
      return (
        d.name.toLowerCase().includes(q) ||
        d.tokenSymbol.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q)
      );
    });
  }, [filter, search]);

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.headerWrap}>
        <SovSectionHeader
          title="DAO Registry"
          subtitle="Discover and explore all DAOs in the Sovereign network"
          meta={`${mockDAOs.length} entries`}
        />
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

      {/* Search field — underlined caret, marginal-note feel */}
      <View style={styles.searchWrap}>
        <Text style={styles.searchLabel}>QUERY</Text>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="name, symbol, or description"
          placeholderTextColor={sovswapColors.paperInkFaint}
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>

      {/* Card list */}
      <View style={styles.listWrap}>
        {filtered.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyKicker}>no entries</Text>
            <Text style={styles.emptyTitle}>
              No DAOs found matching your criteria.
            </Text>
          </View>
        ) : (
          filtered.map((dao, idx) => (
            <SovDaoCard
              key={dao.id}
              dao={dao}
              index={idx + 1}
              onPress={onPickDao}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
};

const styles = createSovSwapStyles(() => StyleSheet.create({
  scroll: {
    paddingBottom: sovswapSpacing.xxxl,
  },
  headerWrap: {
    paddingHorizontal: sovswapSpacing.lg,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: sovswapSpacing.lg,
    paddingTop: sovswapSpacing.md,
    gap: sovswapSpacing.sm,
  },
  filterPill: {
    borderWidth: 1,
    borderColor: sovswapColors.rule,
    paddingVertical: 6,
    paddingHorizontal: sovswapSpacing.md,
  },
  filterActive: {
    backgroundColor: sovswapColors.paperInk,
  },
  filterText: {
    ...sovswapType.smallCapsInk,
    fontSize: 10,
  },
  filterTextActive: {
    color: sovswapColors.paper,
  },
  searchWrap: {
    paddingHorizontal: sovswapSpacing.lg,
    paddingTop: sovswapSpacing.lg,
    paddingBottom: sovswapSpacing.md,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: sovswapSpacing.md,
  },
  searchLabel: {
    ...sovswapType.smallCaps,
    color: sovswapColors.paperInk,
    paddingBottom: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: sovswapColors.paperInk,
    paddingVertical: 4,
    paddingHorizontal: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: sovswapColors.ruleSoft,
  },
  listWrap: {
    paddingTop: sovswapSpacing.sm,
  },
  emptyWrap: {
    paddingHorizontal: sovswapSpacing.lg,
    paddingTop: sovswapSpacing.xxxl,
    alignItems: 'center',
  },
  emptyKicker: {
    ...sovswapType.smallCaps,
    marginBottom: 6,
  },
  emptyTitle: {
    ...sovswapType.bodySoft,
    fontStyle: 'italic',
    textAlign: 'center',
  },
}));

export default RegistryTab;
