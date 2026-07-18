import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { HeaderBar } from '../../components';
import { SovPriceChart } from '../../components/organisms/SovSwap';
import {
  findDao,
  formatNumber,
  generateChartData,
} from '../../services/SovSwapMockData';
import {
  sovswapAccentFor,
  sovswapType,
} from './theme/sovswapTokens';
import { colors, spacing, typography } from '../../theme';

interface MockTx {
  type: 'Buy' | 'Sell';
  amount: number;
  price: number;
  total: number;
  time: string;
  address: string;
}

const buildMockTxs = (price: number, symbol: string): MockTx[] => {
  const sample: Array<{ type: 'Buy' | 'Sell'; amount: number; offsetMin: number }> = [
    { type: 'Buy', amount: 240, offsetMin: 3 },
    { type: 'Sell', amount: 1180, offsetMin: 12 },
    { type: 'Buy', amount: 75, offsetMin: 27 },
    { type: 'Buy', amount: 530, offsetMin: 64 },
    { type: 'Sell', amount: 92, offsetMin: 188 },
  ];
  return sample.map((s, i) => ({
    type: s.type,
    amount: s.amount,
    price,
    total: s.amount * price,
    time: relTime(s.offsetMin),
    address: `0x${(0xa3f04c1d + i * 0x131).toString(16).slice(0, 6)}…${(0xc92e + i).toString(16)}`,
  }));
};

const relTime = (mins: number): string => {
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

export interface SovSwapMarketDetailScreenProps {
  route: { params: { id: number } };
  navigation: any;
}

export const SovSwapMarketDetailScreen: React.FC<SovSwapMarketDetailScreenProps> = ({
  route,
  navigation,
}) => {
  const dao = findDao(route.params.id);
  const [amount, setAmount] = useState('');

  const chart = useMemo(() => (dao ? generateChartData(dao.price, 7) : null), [dao]);
  const txs = useMemo(
    () => (dao ? buildMockTxs(dao.price, dao.tokenSymbol) : []),
    [dao],
  );

  if (!dao || !chart) {
    return (
      <View style={styles.container}>
        <HeaderBar onBackPress={() => navigation.goBack()} showHamburger={false} />
        <View style={styles.missing}>
          <Text style={styles.missingTitle}>Market not found.</Text>
        </View>
      </View>
    );
  }

  const accent = sovswapAccentFor(dao.type);
  const isNonProfit = dao.type === 'non-profit';
  const amountNum = parseFloat(amount) || 0;
  const networkFee = amountNum * dao.price * 0.001;
  const totalCost = amountNum * dao.price + networkFee;

  const submit = () => {
    if (!amountNum || amountNum <= 0) {
      Alert.alert('Invalid amount', 'Enter a positive amount.');
      return;
    }
    Alert.alert(
      isNonProfit ? 'Stake confirmed' : 'Purchase complete',
      `${amountNum} ${dao.tokenSymbol} · ${totalCost.toFixed(4)} $SOV.`,
    );
    setAmount('');
  };

  return (
    <View style={styles.container}>
      <HeaderBar onBackPress={() => navigation.goBack()} showHamburger={false} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Token header */}
        <View style={styles.heroWrap}>
          <Text style={[styles.typeTag, { color: accent.accent }]}>
            {accent.label}
          </Text>
          <Text style={styles.heroTitle}>${dao.tokenSymbol} Market</Text>
          <Text style={styles.heroName}>{dao.name}</Text>
          <View style={styles.heroFigures}>
            <Text style={styles.heroPrice}>{dao.price.toFixed(2)}</Text>
            <Text style={styles.heroUnit}>$SOV</Text>
            <View style={styles.heroLeader} />
            {isNonProfit ? (
              <Text style={[styles.heroDelta, { color: accent.accent }]}>
                12.5% APY
              </Text>
            ) : (
              <Text
                style={[
                  styles.heroDelta,
                  {
                    color: dao.priceChange >= 0 ? colors.success : colors.error,
                  },
                ]}
              >
                {dao.priceChange >= 0 ? '+' : ''}
                {dao.priceChange.toFixed(2)}%
              </Text>
            )}
          </View>
        </View>

        {/* Chart */}
        <View style={styles.chartWrap}>
          <Text style={[styles.sectionKicker, styles.chartKicker]}>
            FIG. I · 7-DAY PRICE
          </Text>
          <SovPriceChart
            data={chart.data}
            labels={chart.labels}
            accent={accent.accent}
            height={180}
          />
        </View>

        {/* Trade form */}
        <View style={[styles.tradeCard, { borderColor: accent.accent }]}>
          <View style={styles.tradeBody}>
            <Text style={[styles.tradeKicker, { color: accent.accent }]}>
              {isNonProfit ? 'STAKE $SOV' : 'TRADE TOKEN'}
            </Text>
            <Text style={styles.smallNote}>
              {isNonProfit ? 'AMOUNT TO STAKE' : 'AMOUNT TO BUY'}
            </Text>
            <View style={styles.amountRow}>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor={colors.text_tertiary}
                keyboardType="decimal-pad"
                style={styles.amountInput}
              />
              <Text style={[styles.amountUnit, { color: accent.accent }]}>
                ${dao.tokenSymbol}
              </Text>
            </View>

            <View style={styles.breakdownWrap}>
              {isNonProfit ? (
                <BreakdownRow label="APY" value="12.5%" />
              ) : null}
              <BreakdownRow
                label="Price per token"
                value={`${dao.price.toFixed(2)} $SOV`}
              />
              <BreakdownRow
                label="Network fee · 0.1%"
                value={`${networkFee.toFixed(4)} $SOV`}
              />
              <View style={styles.totalLine}>
                <Text style={styles.totalLabel}>TOTAL COST</Text>
                <Text style={styles.totalValue}>
                  {totalCost.toFixed(4)} $SOV
                </Text>
              </View>
              <Text style={styles.balance}>BAL · 10,000 $SOV</Text>
            </View>

            <Pressable
              onPress={submit}
              style={[styles.tradeCta, { backgroundColor: accent.accent }]}
            >
              <Text style={styles.tradeCtaText}>
                {isNonProfit ? 'CONFIRM STAKE →' : 'BUY TOKEN NOW →'}
              </Text>
            </Pressable>
          </View>
          <View style={[styles.tradeStripe, { backgroundColor: accent.accent }]} />
        </View>

        {/* Market stats */}
        <View style={styles.statsWrap}>
          <Text style={styles.sectionKicker}>MARKET STATS</Text>
          <View style={styles.statsRow}>
            <Stat label="Market Cap" value={`$${formatNumber(dao.price * dao.supply)}`} />
            <View style={styles.statsDivider} />
            <Stat label="Volume (24h)" value={`$${formatNumber(dao.volume)}`} />
          </View>
          <View style={styles.statsRow}>
            <Stat label="Circulating" value={`${formatNumber(dao.supply)} ${dao.tokenSymbol}`} />
            <View style={styles.statsDivider} />
            <Stat label="Holders" value="1,234" />
          </View>
        </View>

        {/* Tx ledger */}
        <View style={styles.txWrap}>
          <Text style={styles.sectionKicker}>RECENT TRANSACTIONS</Text>
          {txs.map(tx => {
            const tone = tx.type === 'Buy' ? colors.success : colors.error;
            return (
              <View key={`${tx.address}-${tx.time}`} style={styles.txRow}>
                <Text style={[styles.txType, { color: tone }]}>{tx.type.toUpperCase()}</Text>
                <View style={styles.txMid}>
                  <Text style={styles.txAmount}>
                    {tx.amount} ${dao.tokenSymbol}
                  </Text>
                  <Text style={styles.txMeta}>
                    {tx.address} · {tx.time}
                  </Text>
                </View>
                <View style={styles.txRight}>
                  <Text style={styles.txTotal}>{tx.total.toFixed(2)} $SOV</Text>
                  <Text style={styles.txMetaRight}>
                    @ {tx.price.toFixed(2)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};

const BreakdownRow: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <View style={styles.breakdownRow}>
    <Text style={styles.breakdownLabel}>{label}</Text>
    <View style={styles.breakdownLeader} />
    <Text style={styles.breakdownValue}>{value}</Text>
  </View>
);

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.statCell}>
    <Text style={statStyles.label}>{label}</Text>
    <Text style={statStyles.value}>{value}</Text>
  </View>
);

const statStyles = StyleSheet.create({
  label: {
    ...sovswapType.smallCaps,
    fontSize: 9,
  },
  value: {
    color: colors.text_primary,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
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
  typeTag: { ...sovswapType.smallCaps },
  heroTitle: {
    color: colors.text_primary,
    fontSize: 28,
    fontWeight: '700',
    marginTop: 2,
  },
  heroName: {
    color: colors.text_secondary,
    fontStyle: 'italic',
    fontSize: 14,
    marginTop: 4,
  },
  heroFigures: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: spacing.md,
  },
  heroPrice: { color: colors.text_primary, fontSize: 40, fontWeight: '700' },
  heroUnit: {
    ...sovswapType.smallCaps,
    color: colors.text_tertiary,
    paddingLeft: 4,
  },
  heroLeader: {
    flex: 1,
    marginHorizontal: spacing.sm,
  },
  heroDelta: {
    fontSize: 16,
    fontWeight: '700',
  },

  chartWrap: {
    paddingHorizontal: 0,
    paddingTop: spacing.md,
  },
  chartKicker: {
    paddingHorizontal: spacing.lg,
  },
  sectionKicker: {
    ...sovswapType.smallCaps,
    color: colors.text_primary,
    marginBottom: spacing.sm,
  },

  tradeCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    flexDirection: 'column',
    backgroundColor: colors.bg_dark,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  tradeStripe: { height: 4 },
  tradeBody: { flex: 1, padding: spacing.lg },
  tradeKicker: { ...sovswapType.smallCaps, marginBottom: spacing.sm },
  smallNote: {
    ...sovswapType.smallCaps,
    color: colors.text_tertiary,
    fontSize: 9,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 4,
  },
  amountInput: {
    flex: 1,
    fontSize: 30,
    color: colors.text_primary,
    paddingVertical: 4,
  },
  amountUnit: {
    fontSize: 18,
    fontWeight: '700',
  },

  breakdownWrap: {
    paddingTop: spacing.md,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
  },
  breakdownLabel: {
    ...sovswapType.smallCaps,
    color: colors.text_secondary,
  },
  breakdownLeader: {
    flex: 1,
    marginHorizontal: spacing.sm,
  },
  breakdownValue: {
    color: colors.text_primary,
    fontSize: 14,
  },
  totalLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalLabel: { ...sovswapType.smallCapsInk },
  totalValue: { color: colors.text_primary, fontSize: 16, fontWeight: '700' },
  balance: {
    color: colors.text_tertiary,
    fontSize: 11,
    marginTop: 4,
    textAlign: 'right',
  },

  tradeCta: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: 8,
  },
  tradeCtaText: {
    ...sovswapType.smallCaps,
    color: colors.bg_darkest,
    letterSpacing: 1.4,
    fontSize: 12,
    fontWeight: 'bold',
  },

  statsWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  statsDivider: {
    width: 0,
    marginHorizontal: spacing.md,
  },
  statCell: { flex: 1 },
  statLabel: { ...sovswapType.smallCaps, fontSize: 9 },
  statValue: { color: colors.text_primary, fontSize: 14, fontWeight: '600', marginTop: 2 },

  txWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  txType: {
    ...sovswapType.smallCaps,
    width: 44,
  },
  txMid: { flex: 1 },
  txAmount: {
    color: colors.text_primary,
    fontSize: 14,
    fontWeight: '600',
  },
  txMeta: {
    color: colors.text_secondary,
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 1,
  },
  txRight: { alignItems: 'flex-end' },
  txTotal: { color: colors.text_primary, fontSize: 14, fontWeight: '600' },
  txMetaRight: {
    color: colors.text_secondary,
    fontSize: 10,
    marginTop: 1,
  },
});

export default SovSwapMarketDetailScreen;
