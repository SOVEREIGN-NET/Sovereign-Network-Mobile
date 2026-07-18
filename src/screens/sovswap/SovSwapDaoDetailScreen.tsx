import React from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { HeaderBar } from '../../components';
import { findDao, formatNumber } from '../../services/SovSwapMockData';
import {
  sovswapAccentFor,
  sovswapType,
} from './theme/sovswapTokens';
import { colors, spacing, typography } from '../../theme';

const SHORTCUTS = ['Website', 'Whisper', 'Konect', 'gitSmart', 'Ballot'];

export interface SovSwapDaoDetailScreenProps {
  route: { params: { id: number } };
  navigation: any;
}

export const SovSwapDaoDetailScreen: React.FC<SovSwapDaoDetailScreenProps> = ({
  route,
  navigation,
}) => {
  const dao = findDao(route.params.id);
  if (!dao) {
    return (
      <View style={styles.container}>
        <HeaderBar onBackPress={() => navigation.goBack()} showHamburger={false} />
        <View style={styles.missing}>
          <Text style={styles.missingTitle}>Entry not found.</Text>
        </View>
      </View>
    );
  }

  const accent = sovswapAccentFor(dao.type);
  const isNonProfit = dao.type === 'non-profit';
  const marketCap = dao.price * dao.supply;
  const treasuryPct = dao.type === 'for-profit' ? 20 : 100;
  const changeColor =
    dao.priceChange >= 0 ? colors.success : colors.error;
  const changeSign = dao.priceChange > 0 ? '+' : '';

  return (
    <View style={styles.container}>
      <HeaderBar onBackPress={() => navigation.goBack()} showHamburger={false} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.heroWrap}>
          <View style={styles.heroTopRow}>
            <Text style={[styles.typeTag, { color: accent.accent }]}>
              {accent.label}
            </Text>
            <Text style={styles.heroEstablished}>EST. 2024</Text>
          </View>
          <Text style={styles.heroName}>{dao.name}</Text>
          <View style={styles.heroTickerRow}>
            <Text style={[styles.heroTicker, { color: accent.accent }]}>
              ${dao.tokenSymbol}
            </Text>
            <Text style={styles.heroTokenName}>{dao.tokenName}</Text>
          </View>
          <View style={styles.heroRule} />
          <Text style={styles.heroBody}>{dao.description}</Text>
        </View>

        {/* Shortcut grid */}
        <View style={styles.shortcutsWrap}>
          <Text style={styles.sectionKicker}>APPENDIX · LINKED APPS</Text>
          <View style={styles.shortcutGrid}>
            {SHORTCUTS.map(s => (
              <View key={s} style={styles.shortcutCell}>
                <Text style={styles.shortcutLabel}>{s}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Stats 2x2 */}
        <View style={styles.statsWrap}>
          <Text style={styles.sectionKicker}>FUNDAMENTALS</Text>
          <View style={styles.statsGrid}>
            <StatCell
              label="Market Cap"
              value={`$${formatNumber(marketCap)}`}
            />
            <StatCell
              label="Total Supply"
              value={`${formatNumber(dao.supply)} ${dao.tokenSymbol}`}
            />
            <StatCell
              label="Treasury Allocation"
              value={`${formatNumber(dao.treasuryAllocation)} ${dao.tokenSymbol}`}
              footnote={`${treasuryPct}%`}
            />
            <StatCell label="Volume (24h)" value={`$${formatNumber(dao.volume)}`} />
          </View>
        </View>

        {/* Price hero */}
        <View style={[styles.priceCard, { borderColor: accent.accent }]}>
          <View style={styles.priceBody}>
            <Text style={styles.priceKicker}>CURRENT PRICE</Text>
            <Text style={styles.priceValue}>
              {dao.price.toFixed(2)}{' '}
              <Text style={styles.priceUnit}>$SOV</Text>
            </Text>
            {isNonProfit ? (
              <View style={[styles.apySub, { backgroundColor: accent.soft }]}>
                <Text style={[styles.apySubLabel, { color: accent.accent }]}>
                  STAKING REWARD
                </Text>
                <Text style={[styles.apySubValue, { color: accent.accent }]}>
                  12.5% APY · paid in ${dao.tokenSymbol}
                </Text>
              </View>
            ) : (
              <Text style={[styles.priceDelta, { color: changeColor }]}>
                {changeSign}{dao.priceChange.toFixed(2)}% (24h)
              </Text>
            )}
            <Pressable
              style={[styles.priceCta, { backgroundColor: accent.accent }]}
              onPress={() =>
                navigation.navigate('SovSwapMarketDetail', { id: dao.id })
              }
            >
              <Text style={styles.priceCtaText}>
                {isNonProfit ? 'STAKE NOW →' : 'BUY TOKEN →'}
              </Text>
            </Pressable>
          </View>
          <View style={[styles.priceStripe, { backgroundColor: accent.accent }]} />
        </View>

        {/* Governance footnote */}
        <View style={styles.govWrap}>
          <Text style={styles.sectionKicker}>GOVERNANCE</Text>
          <View style={styles.govRow}>
            <GovStat label="Proposals" value="12 active" />
            <View style={styles.govDivider} />
            <GovStat label="Holders" value="1,234" />
            <View style={styles.govDivider} />
            <GovStat label="Voting Power" value="1 token = 1 vote" small />
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const StatCell: React.FC<{ label: string; value: string; footnote?: string }> = ({
  label,
  value,
  footnote,
}) => (
  <View style={statStyles.cell}>
    <Text style={statStyles.label}>{label}</Text>
    <Text style={statStyles.value}>{value}</Text>
    {footnote ? <Text style={statStyles.footnote}>{footnote}</Text> : null}
  </View>
);

const GovStat: React.FC<{ label: string; value: string; small?: boolean }> = ({
  label,
  value,
  small,
}) => (
  <View style={statStyles.govCell}>
    <Text style={statStyles.label}>{label}</Text>
    <Text style={[statStyles.govValue, small ? statStyles.govSmall : null]}>
      {value}
    </Text>
  </View>
);

const statStyles = StyleSheet.create({
  cell: {
    width: '50%',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  label: {
    ...sovswapType.smallCaps,
    fontSize: 9,
  },
  value: {
    color: colors.text_primary,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 4,
  },
  footnote: {
    color: colors.text_secondary,
    fontSize: 11,
    marginTop: 2,
  },
  govCell: {
    flex: 1,
    alignItems: 'flex-start',
  },
  govValue: {
    color: colors.text_primary,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  govSmall: {
    fontSize: 11,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg_darkest },
  headerWrap: { paddingHorizontal: spacing.lg },
  scroll: { paddingBottom: spacing.xxxl },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  missingTitle: { color: colors.text_primary, fontSize: 18, fontWeight: '700' },

  heroWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  typeTag: { ...sovswapType.smallCaps },
  heroEstablished: {
    ...sovswapType.smallCaps,
    color: colors.text_tertiary,
  },
  heroName: {
    color: colors.text_primary,
    fontSize: 28,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  heroTickerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  heroTicker: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  heroTokenName: {
    color: colors.text_secondary,
    fontStyle: 'italic',
    fontSize: 14,
  },
  heroRule: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  heroBody: { color: colors.text_primary, fontSize: 14, lineHeight: 22 },

  shortcutsWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  sectionKicker: {
    ...sovswapType.smallCaps,
    color: colors.text_primary,
    marginBottom: spacing.sm,
  },
  shortcutGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  shortcutCell: {
    minWidth: '30%',
    flexGrow: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg_dark,
    alignItems: 'center',
    borderRadius: 8,
  },
  shortcutLabel: {
    ...sovswapType.smallCaps,
    color: colors.text_secondary,
    fontSize: 10,
  },

  statsWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },

  priceCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    flexDirection: 'column',
    backgroundColor: colors.bg_dark,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  priceStripe: { height: 4 },
  priceBody: {
    flex: 1,
    padding: spacing.lg,
  },
  priceKicker: {
    ...sovswapType.smallCaps,
    color: colors.text_primary,
  },
  priceValue: {
    color: colors.text_primary,
    fontSize: 40,
    fontWeight: '700',
    marginTop: 4,
  },
  priceUnit: {
    ...sovswapType.smallCaps,
    color: colors.text_secondary,
  },
  priceDelta: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 6,
  },
  apySub: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
  },
  apySubLabel: { ...sovswapType.smallCaps, fontSize: 9 },
  apySubValue: { color: colors.text_primary, fontSize: 14, fontWeight: '700', marginTop: 2 },
  priceCta: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: 8,
  },
  priceCtaText: {
    ...sovswapType.smallCaps,
    color: colors.bg_darkest,
    letterSpacing: 1.4,
    fontWeight: 'bold',
  },

  govWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  govRow: {
    flexDirection: 'row',
    paddingVertical: spacing.md,
    gap: spacing.lg,
  },
  govDivider: {
    width: 0,
  },
});

export default SovSwapDaoDetailScreen;
