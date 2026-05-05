import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SovSectionHeader } from '../../components/organisms/SovSwap';
import { findDao, formatNumber } from '../../services/SovSwapMockData';
import {
  sovswapAccentFor,
  createSovSwapStyles,
  sovswapColors,
  sovswapSpacing,
  sovswapType,
} from './theme/sovswapTokens';

const SHORTCUTS = ['Website', 'Bubl', 'Whisper', 'Konect', 'gitSmart', 'Ballot'];

export interface SovSwapDaoDetailScreenProps {
  route: { params: { id: number } };
  navigation: any;
}

/**
 * DAO entry detail — the registry's full-page entry. Hero block with
 * type tag and ticker, description in serif body, six placeholder
 * "appendix" buttons (apps shipped from this DAO), a 2x2 monospaced
 * stat grid, an indigo-equivalent "current quote" hero, and a
 * governance footnote.
 */
export const SovSwapDaoDetailScreen: React.FC<SovSwapDaoDetailScreenProps> = ({
  route,
  navigation,
}) => {
  const dao = findDao(route.params.id);
  if (!dao) {
    return (
      <SafeAreaView style={styles.safe}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <View style={styles.missing}>
          <Text style={styles.missingTitle}>Entry not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const accent = sovswapAccentFor(dao.type);
  const isNonProfit = dao.type === 'non-profit';
  const marketCap = dao.price * dao.supply;
  const treasuryPct = dao.type === 'for-profit' ? 20 : 100;
  const changeColor =
    dao.priceChange >= 0 ? sovswapColors.up : sovswapColors.down;
  const changeSign = dao.priceChange > 0 ? '+' : '';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerWrap}>
          <SovSectionHeader title="DAO" onBack={() => navigation.goBack()} />
        </View>
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
    </SafeAreaView>
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

const statStyles = createSovSwapStyles(() => StyleSheet.create({
  cell: {
    width: '50%',
    paddingVertical: sovswapSpacing.md,
    paddingHorizontal: sovswapSpacing.md,
  },
  label: {
    ...sovswapType.smallCaps,
    fontSize: 9,
  },
  value: {
    ...sovswapType.numeral,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 4,
  },
  footnote: {
    ...sovswapType.numeralSoft,
    fontSize: 11,
    marginTop: 2,
  },
  govCell: {
    flex: 1,
    alignItems: 'flex-start',
  },
  govValue: {
    ...sovswapType.numeral,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  govSmall: {
    fontSize: 11,
  },
}));

const styles = createSovSwapStyles(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: sovswapColors.paper },
  headerWrap: { paddingHorizontal: sovswapSpacing.lg },
  backBtn: { width: 90, paddingVertical: 4 },
  backText: { ...sovswapType.smallCapsInk, color: sovswapColors.paperInkSoft, fontSize: 11 },
  scroll: { paddingBottom: sovswapSpacing.xxxl },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: sovswapSpacing.xl,
  },
  missingTitle: { ...sovswapType.daoTitle },

  heroWrap: {
    paddingHorizontal: sovswapSpacing.lg,
    paddingTop: sovswapSpacing.lg,
    paddingBottom: sovswapSpacing.lg,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  typeTag: { ...sovswapType.smallCaps },
  heroEstablished: {
    ...sovswapType.smallCaps,
    color: sovswapColors.paperInkFaint,
  },
  heroName: {
    ...sovswapType.masthead,
    fontSize: 30,
    marginTop: sovswapSpacing.xs,
  },
  heroTickerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: sovswapSpacing.sm,
    marginTop: sovswapSpacing.sm,
  },
  heroTicker: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  heroTokenName: {
    ...sovswapType.bodySoft,
    fontStyle: 'italic',
    fontSize: 14,
  },
  heroRule: {
    height: 1,
    backgroundColor: sovswapColors.rule,
    marginVertical: sovswapSpacing.md,
  },
  heroBody: { ...sovswapType.body, lineHeight: 22 },

  shortcutsWrap: {
    paddingHorizontal: sovswapSpacing.lg,
    paddingTop: sovswapSpacing.md,
    paddingBottom: sovswapSpacing.sm,
  },
  sectionKicker: {
    ...sovswapType.smallCaps,
    color: sovswapColors.paperInk,
    marginBottom: sovswapSpacing.sm,
  },
  shortcutGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: sovswapSpacing.sm,
  },
  shortcutCell: {
    minWidth: '30%',
    flexGrow: 1,
    paddingVertical: sovswapSpacing.sm,
    paddingHorizontal: sovswapSpacing.md,
    borderWidth: 1,
    borderColor: sovswapColors.ruleSoft,
    backgroundColor: sovswapColors.paperWarm,
    alignItems: 'center',
  },
  shortcutLabel: {
    ...sovswapType.smallCapsInk,
    color: sovswapColors.paperInkSoft,
    fontSize: 10,
  },

  statsWrap: {
    paddingHorizontal: sovswapSpacing.lg,
    paddingTop: sovswapSpacing.lg,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },

  priceCard: {
    marginHorizontal: sovswapSpacing.lg,
    marginTop: sovswapSpacing.lg,
    flexDirection: 'column',
    backgroundColor: sovswapColors.paperWarm,
    borderRadius: 6,
    overflow: 'hidden',
  },
  priceStripe: { height: 4 },
  priceBody: {
    flex: 1,
    padding: sovswapSpacing.lg,
  },
  priceKicker: {
    ...sovswapType.smallCaps,
    color: sovswapColors.paperInk,
  },
  priceValue: {
    ...sovswapType.priceLg,
    fontSize: 44,
    marginTop: 4,
  },
  priceUnit: {
    ...sovswapType.smallCaps,
    color: sovswapColors.paperInkSoft,
  },
  priceDelta: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 6,
  },
  apySub: {
    marginTop: sovswapSpacing.sm,
    paddingVertical: sovswapSpacing.sm,
    paddingHorizontal: sovswapSpacing.md,
    borderWidth: 1,
    borderColor: sovswapColors.ruleSoft,
  },
  apySubLabel: { ...sovswapType.smallCaps, fontSize: 9 },
  apySubValue: { ...sovswapType.numeral, fontWeight: '700', marginTop: 2 },
  priceCta: {
    marginTop: sovswapSpacing.md,
    paddingVertical: sovswapSpacing.sm,
    alignItems: 'center',
  },
  priceCtaText: {
    ...sovswapType.smallCaps,
    color: sovswapColors.paper,
    letterSpacing: 1.4,
  },

  govWrap: {
    paddingHorizontal: sovswapSpacing.lg,
    paddingTop: sovswapSpacing.lg,
  },
  govRow: {
    flexDirection: 'row',
    paddingVertical: sovswapSpacing.md,
    gap: sovswapSpacing.lg,
  },
  govDivider: {
    width: 0,
  },
}));

export default SovSwapDaoDetailScreen;
