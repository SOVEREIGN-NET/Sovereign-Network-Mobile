import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  SovMarketCard,
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

  const filtered = useMemo(
    () => (filter === 'all' ? mockDAOs : mockDAOs.filter(d => d.type === filter)),
    [filter],
  );

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.headerWrap}>
        <SovSectionHeader
          title="Marketplace"
          subtitle="Buy tokens and checkout with DAO currencies"
          meta={`${filtered.length} listed`}
        />
      </View>

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
        {filtered.map((dao, idx) => (
          <View
            key={dao.id}
            style={[styles.rowSlot, idx > 0 ? styles.rowDivider : null]}
          >
            <SovMarketCard dao={dao} index={idx + 1} onPress={onPickDao} />
          </View>
        ))}
      </View>
    </ScrollView>
  );
};

const styles = createSovSwapStyles(() => StyleSheet.create({
  scroll: { paddingBottom: sovswapSpacing.xxxl },
  headerWrap: { paddingHorizontal: sovswapSpacing.lg },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: sovswapSpacing.lg,
    paddingTop: sovswapSpacing.md,
    paddingBottom: sovswapSpacing.md,
    gap: sovswapSpacing.sm,
  },
  filterPill: {
    borderWidth: 1,
    borderColor: sovswapColors.rule,
    paddingVertical: 6,
    paddingHorizontal: sovswapSpacing.md,
  },
  filterActive: { backgroundColor: sovswapColors.paperInk },
  filterText: { ...sovswapType.smallCapsInk, fontSize: 10 },
  filterTextActive: { color: sovswapColors.paper },
  listWrap: {
    paddingTop: 0,
    marginHorizontal: sovswapSpacing.lg,
    backgroundColor: sovswapColors.paper,
    borderRadius: 8,
    overflow: 'hidden',
  },
  rowSlot: {},
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: sovswapColors.ruleSoft,
  },
}));

export default MarketplaceTab;
