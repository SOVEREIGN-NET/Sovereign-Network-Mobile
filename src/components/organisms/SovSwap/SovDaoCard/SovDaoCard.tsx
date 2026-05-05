import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  sovswapAccentFor,
  createSovSwapStyles,
  sovswapColors,
  sovswapSpacing,
  sovswapType,
} from '../../../../screens/sovswap/theme/sovswapTokens';
import { formatNumber } from '../../../../services/SovSwapMockData';
import type { SovDao } from '../../../../types/sovSwap';

export interface SovDaoCardProps {
  dao: SovDao;
  /** 1-based index from the list. */
  index: number;
  onPress?: (dao: SovDao) => void;
}

/**
 * Registry entry card.
 *
 * Three breathing sections separated by hairlines:
 *   1. **Header** — index left, type tag right.
 *   2. **Identity** — DAO name (large), token name (italic soft),
 *      then a 2-line description.
 *   3. **Quote** — ticker + DAO share on the left, price + change
 *      (or APY) on the right, balanced.
 *   4. **Fundamentals strip** — three labelled cells (Supply, Volume,
 *      Treasury) with consistent left-alignment and equal width.
 */
export const SovDaoCard: React.FC<SovDaoCardProps> = ({
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
  const indexStr = `№${String(index).padStart(3, '0')}`;
  const treasuryPct = dao.type === 'for-profit' ? '20%' : '100%';

  return (
    <Pressable
      onPress={() => onPress?.(dao)}
      style={({ pressed }) => [
        styles.card,
        pressed ? styles.cardPressed : null,
      ]}
    >
      {/* §1 Header */}
      <View style={styles.headerRow}>
        <Text style={styles.index}>{indexStr}</Text>
        <Text style={[styles.typeTag, { color: accent.accent }]}>
          {accent.label}
        </Text>
      </View>

      {/* §2 Identity */}
      <View style={styles.identitySection}>
        <Text style={styles.daoName} numberOfLines={1}>
          {dao.name}
        </Text>
        <Text style={styles.tokenName} numberOfLines={1}>
          {dao.tokenName}
        </Text>
        <Text style={styles.description} numberOfLines={2}>
          {dao.description}
        </Text>
      </View>

      <View style={styles.divider} />

      {/* §3 Quote */}
      <View style={styles.quoteRow}>
        <View style={styles.quoteLeft}>
          <Text style={[styles.ticker, { color: accent.accent }]}>
            ${dao.tokenSymbol}
          </Text>
          <Text style={styles.tickerSub}>
            {dao.type === 'for-profit' ? 'Tradable' : 'Stake-funded'}
          </Text>
        </View>
        <View style={styles.quoteRight}>
          {isNonProfit ? (
            <>
              <Text style={[styles.price, { color: accent.accent }]}>
                12.5%
              </Text>
              <Text style={styles.priceUnit}>APY</Text>
            </>
          ) : (
            <>
              <Text style={styles.price}>${dao.price.toFixed(2)}</Text>
              <Text style={[styles.priceDelta, { color: changeColor }]}>
                {changeSign}
                {dao.priceChange.toFixed(2)}%
              </Text>
            </>
          )}
        </View>
      </View>

      <View style={styles.divider} />

      {/* §4 Fundamentals */}
      <View style={styles.statBar}>
        <Stat label="Supply" value={formatNumber(dao.supply)} />
        <Stat label="Volume 24h" value={`$${formatNumber(dao.volume)}`} />
        <Stat label="Treasury" value={treasuryPct} />
      </View>
    </Pressable>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.statCell}>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={styles.statValue}>{value}</Text>
  </View>
);

const styles = createSovSwapStyles(() => StyleSheet.create({
  card: {
    backgroundColor: sovswapColors.paperWarm,
    paddingHorizontal: sovswapSpacing.lg,
    paddingVertical: sovswapSpacing.lg,
    marginHorizontal: sovswapSpacing.lg,
    marginBottom: sovswapSpacing.md,
    borderRadius: 10,
  },
  cardPressed: {
    backgroundColor: sovswapColors.paperEdge,
  },

  // §1 Header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: sovswapSpacing.md,
  },
  index: {
    ...sovswapType.index,
    fontSize: 11,
  },
  typeTag: {
    ...sovswapType.smallCaps,
    fontSize: 10,
  },

  // §2 Identity
  identitySection: {
    marginBottom: sovswapSpacing.md,
  },
  daoName: {
    ...sovswapType.daoTitle,
    fontSize: 19,
  },
  tokenName: {
    ...sovswapType.bodySoft,
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 2,
    marginBottom: sovswapSpacing.sm,
  },
  description: {
    ...sovswapType.bodySoft,
    fontSize: 13,
    lineHeight: 19,
  },

  // Divider
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: sovswapColors.ruleSoft,
    marginVertical: sovswapSpacing.md,
  },

  // §3 Quote
  quoteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quoteLeft: {
    flex: 1,
  },
  ticker: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  tickerSub: {
    ...sovswapType.smallCaps,
    fontSize: 9,
    marginTop: 4,
  },
  quoteRight: {
    alignItems: 'flex-end',
  },
  price: {
    ...sovswapType.priceMd,
    fontSize: 24,
  },
  priceUnit: {
    ...sovswapType.smallCaps,
    fontSize: 10,
    marginTop: 4,
  },
  priceDelta: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },

  // §4 Fundamentals
  statBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statCell: {
    flex: 1,
  },
  statLabel: {
    ...sovswapType.smallCaps,
    fontSize: 9,
    marginBottom: 4,
  },
  statValue: {
    ...sovswapType.numeral,
    fontSize: 14,
    fontWeight: '600',
  },
}));

export default SovDaoCard;
