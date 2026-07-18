import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  sovswapAccentFor,
  createSovSwapStyles,
  sovswapColors,
  sovswapSpacing,
  sovswapType,
} from '../../../../screens/sovswap/theme/sovswapTokens';
import { Text } from '../../../../components';
import type { SovDao } from '../../../../types/sovSwap';

export interface SovMarketCardProps {
  dao: SovDao;
  index: number;
  onPress?: (dao: SovDao) => void;
}

/**
 * Marketplace row — balanced two-column layout.
 *
 * Left column: index, ticker, DAO name + tiny type tag.
 * Right column: price (large monospaced) and 24h change / APY in a
 * subtle accent. The whole row is the tap target — no oversized
 * coloured stamp, just a chevron at the very edge to hint navigation.
 */
export const SovMarketCard: React.FC<SovMarketCardProps> = ({
  dao,
  index,
  onPress,
}) => {
  const accent = sovswapAccentFor(dao.type);
  const isNonProfit = dao.type === 'non-profit';
  const changeColor =
    dao.priceChange > 0
      ? sovswapColors.up
      : dao.priceChange < 0
        ? sovswapColors.down
        : sovswapColors.flat;
  const changeSign = dao.priceChange > 0 ? '+' : '';

  return (
    <Pressable
      onPress={() => onPress?.(dao)}
      style={({ pressed }) => [
        styles.card,
        pressed ? styles.cardPressed : null,
      ]}
    >
      {/* Left — token info */}
      <View style={styles.left}>
        <View style={styles.tickerRow}>
          <Text style={styles.indexText}>
            {String(index).padStart(2, '0')}
          </Text>
          <Text style={[styles.ticker, { color: accent.accent }]}>
            ${dao.tokenSymbol}
          </Text>
        </View>
        <Text style={styles.daoName} numberOfLines={1}>
          {dao.name}
        </Text>
        <Text style={[styles.typeTag, { color: accent.accent }]}>
          {accent.label}
        </Text>
      </View>

      {/* Right — price */}
      <View style={styles.right}>
        <Text style={styles.price} numberOfLines={1}>
          {dao.price.toFixed(2)}
          <Text style={styles.priceUnit}> SOV</Text>
        </Text>
        {isNonProfit ? (
          <Text style={[styles.delta, { color: accent.accent }]}>
            12.5% APY
          </Text>
        ) : (
          <Text style={[styles.delta, { color: changeColor }]}>
            {changeSign}
            {dao.priceChange.toFixed(2)}%
          </Text>
        )}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
};

const styles = createSovSwapStyles(() => StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: sovswapColors.paper,
    paddingVertical: sovswapSpacing.md,
    paddingHorizontal: sovswapSpacing.lg,
    alignItems: 'center',
  },
  cardPressed: {
    backgroundColor: sovswapColors.paperWarm,
  },
  left: {
    flex: 1,
    paddingRight: sovswapSpacing.md,
  },
  tickerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: sovswapSpacing.sm,
  },
  indexText: {
    ...sovswapType.index,
    fontSize: 10,
    color: sovswapColors.paperInkFaint,
  },
  ticker: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  daoName: {
    ...sovswapType.bodySoft,
    fontSize: 13,
    marginTop: 2,
  },
  typeTag: {
    ...sovswapType.smallCaps,
    fontSize: 9,
    marginTop: 4,
  },
  right: {
    alignItems: 'flex-end',
    minWidth: 100,
  },
  price: {
    ...sovswapType.priceMd,
    fontSize: 22,
    color: sovswapColors.paperInk,
  },
  priceUnit: {
    ...sovswapType.smallCaps,
    fontSize: 10,
    color: sovswapColors.paperInkFaint,
  },
  delta: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    letterSpacing: 0.2,
  },
  chevron: {
    fontSize: 24,
    color: sovswapColors.paperInkFaint,
    marginLeft: sovswapSpacing.sm,
    fontWeight: '300',
  },
}));

export default SovMarketCard;
