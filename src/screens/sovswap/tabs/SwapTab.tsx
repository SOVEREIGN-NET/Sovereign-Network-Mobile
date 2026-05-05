import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  SovPriceChart,
  SovSectionHeader,
  SovTokenPickerModal,
} from '../../../components/organisms/SovSwap';
import {
  allSovTokens,
  canSwap,
  findToken,
  generateChartData,
  initialBalances,
} from '../../../services/SovSwapMockData';
import {
  sovswapAccentFor,
  createSovSwapStyles,
  sovswapColors,
  sovswapSpacing,
  sovswapType,
} from '../theme/sovswapTokens';

type PickerSlot = null | 'from' | 'to';

/**
 * Swap tab — the trading desk page. Two stacked entry rows joined by
 * a flip glyph in the gutter, an exchange-rate ledger line, a primary
 * action stamp, and a price chart at the foot of the page.
 *
 * Swap math + validation are ported from the web Dapp's `app/swap/page.tsx`.
 */
export const SwapTab: React.FC = () => {
  const [fromToken, setFromToken] = useState<string>('');
  const [toToken, setToToken] = useState<string>('');
  const [fromAmount, setFromAmount] = useState<string>('');
  const [toAmount, setToAmount] = useState<string>('');
  const [chartToken, setChartToken] = useState<string>('');
  const [picker, setPicker] = useState<PickerSlot>(null);
  const [chartPickerOpen, setChartPickerOpen] = useState(false);
  const [balances] = useState<Record<string, number>>(initialBalances);

  const rate = useMemo(() => {
    if (!fromToken || !toToken) return null;
    const f = findToken(fromToken);
    const t = findToken(toToken);
    if (!f || !t) return null;
    return f.price / t.price;
  }, [fromToken, toToken]);

  useEffect(() => {
    if (rate && fromAmount) {
      const result = parseFloat(fromAmount) * rate;
      if (Number.isFinite(result)) {
        setToAmount(result.toFixed(4));
        return;
      }
    }
    setToAmount('');
  }, [rate, fromAmount]);

  const handleSwap = () => {
    if (!fromToken || !toToken) {
      Alert.alert('Select tokens', 'Please select both tokens.');
      return;
    }
    const amount = parseFloat(fromAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount.');
      return;
    }
    const f = findToken(fromToken);
    const t = findToken(toToken);
    if (!f || !t) return;
    if (!canSwap(f.type, t.type)) {
      Alert.alert(
        'Swap not allowed',
        `Cannot swap ${f.type} tokens with ${t.type} tokens. Only same type or $SOV can be swapped.`,
      );
      return;
    }
    if ((balances[fromToken] ?? 0) < amount) {
      Alert.alert('Insufficient balance', 'Your balance is too low for this swap.');
      return;
    }
    Alert.alert(
      'Swap complete',
      `Successfully swapped ${amount} ${fromToken} for ${toAmount} ${toToken}.`,
    );
    setFromAmount('');
    setToAmount('');
  };

  const flipTokens = () => {
    setFromToken(toToken);
    setToToken(fromToken);
  };

  const fromTok = fromToken ? findToken(fromToken) : undefined;
  const toTok = toToken ? findToken(toToken) : undefined;
  const chartTok = chartToken ? findToken(chartToken) : undefined;
  const chartData = chartTok ? generateChartData(chartTok.price) : null;
  const chartAccent = chartTok
    ? sovswapAccentFor(chartTok.type).accent
    : sovswapColors.paperInk;

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.headerWrap}>
        <SovSectionHeader
          title="Token Swap"
          subtitle="Exchange tokens within your network type. $SOV is universal."
        />
      </View>

      {/* Swap card — two halves stacked, flip button floating between them */}
      <View style={styles.swapCard}>
        <SwapHalf
          label="From"
          amount={fromAmount}
          onAmountChange={setFromAmount}
          token={fromTok}
          onPickToken={() => setPicker('from')}
          balance={fromToken ? balances[fromToken] : undefined}
          editable
        />

        <View style={styles.divider} />

        <SwapHalf
          label="To"
          amount={toAmount}
          onAmountChange={() => {}}
          token={toTok}
          onPickToken={() => setPicker('to')}
          balance={toToken ? balances[toToken] : undefined}
          editable={false}
        />

        <Pressable onPress={flipTokens} style={styles.flipFloat}>
          <Text style={styles.flipGlyph}>⇅</Text>
        </Pressable>
      </View>

      {/* Rate line — only when both tokens selected */}
      {rate && fromTok && toTok ? (
        <View style={styles.rateLine}>
          <Text style={styles.rateText}>
            1 {fromTok.tokenSymbol} = {rate.toFixed(4)} {toTok.tokenSymbol}
          </Text>
        </View>
      ) : null}

      {/* Primary action */}
      <Pressable onPress={handleSwap} style={styles.swapBtn}>
        <Text style={styles.swapBtnText}>Swap</Text>
      </Pressable>

      {/* Charts section */}
      <View style={styles.chartHeaderWrap}>
        <SovSectionHeader
          title="Price Charts"
          subtitle="Thirty-day price history, rendered in $SOV."
        />
      </View>

      <View style={styles.chartCard}>
        <Pressable
          style={styles.chartPicker}
          onPress={() => setChartPickerOpen(true)}
        >
          <Text style={styles.chartPickerLabel}>SUBJECT</Text>
          <Text style={styles.chartPickerValue}>
            {chartTok
              ? `$${chartTok.tokenSymbol} — ${chartTok.name}`
              : 'Select token'}
          </Text>
          <Text style={styles.chartPickerArrow}>▾</Text>
        </Pressable>

        {chartData ? (
          <View style={styles.chartBody}>
            <SovPriceChart
              data={chartData.data}
              labels={chartData.labels}
              accent={chartAccent}
              height={200}
            />
          </View>
        ) : (
          <View style={styles.chartEmpty}>
            <Text style={styles.chartEmptyKicker}>fig. —</Text>
            <Text style={styles.chartEmptyText}>
              Select a token to view its price chart.
            </Text>
          </View>
        )}
      </View>

      {/* From / To picker */}
      <SovTokenPickerModal
        visible={picker !== null}
        tokens={allSovTokens}
        selected={picker === 'from' ? fromToken : toToken}
        balances={balances}
        title={picker === 'from' ? 'Sell from' : 'Receive into'}
        onSelect={sym => {
          if (picker === 'from') setFromToken(sym);
          if (picker === 'to') setToToken(sym);
        }}
        onClose={() => setPicker(null)}
      />

      {/* Chart picker */}
      <SovTokenPickerModal
        visible={chartPickerOpen}
        tokens={allSovTokens}
        selected={chartToken}
        title="Plot token"
        onSelect={sym => setChartToken(sym)}
        onClose={() => setChartPickerOpen(false)}
      />
    </ScrollView>
  );
};

interface SwapHalfProps {
  label: string;
  amount: string;
  onAmountChange: (next: string) => void;
  token?: ReturnType<typeof findToken>;
  onPickToken: () => void;
  balance?: number;
  editable: boolean;
}

const SwapHalf: React.FC<SwapHalfProps> = ({
  label,
  amount,
  onAmountChange,
  token,
  onPickToken,
  balance,
  editable,
}) => {
  const accent = token
    ? sovswapAccentFor(token.type).accent
    : sovswapColors.paperInkSoft;
  return (
    <View style={halfStyles.wrap}>
      <View style={halfStyles.topRow}>
        <Text style={halfStyles.label}>{label}</Text>
        {token ? (
          <Text style={halfStyles.balance}>
            Bal {balance != null ? balance.toLocaleString() : '0'}
          </Text>
        ) : null}
      </View>

      <View style={halfStyles.body}>
        <TextInput
          value={amount}
          onChangeText={onAmountChange}
          editable={editable}
          placeholder="0.00"
          placeholderTextColor={sovswapColors.paperInkFaint}
          keyboardType="decimal-pad"
          style={[
            halfStyles.input,
            !editable ? halfStyles.inputDisabled : null,
          ]}
        />
        <Pressable onPress={onPickToken} style={halfStyles.chip}>
          <Text style={[halfStyles.chipText, { color: accent }]}>
            {token ? `$${token.tokenSymbol}` : 'Select'}
          </Text>
          <Text style={halfStyles.chipArrow}>▾</Text>
        </Pressable>
      </View>
    </View>
  );
};

const halfStyles = createSovSwapStyles(() => StyleSheet.create({
  wrap: {
    paddingHorizontal: sovswapSpacing.lg,
    paddingVertical: sovswapSpacing.md,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  label: {
    ...sovswapType.smallCaps,
    fontSize: 10,
    color: sovswapColors.paperInkSoft,
  },
  balance: {
    ...sovswapType.numeralSoft,
    fontSize: 11,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sovswapSpacing.md,
  },
  input: {
    flex: 1,
    fontSize: 30,
    color: sovswapColors.paperInk,
    paddingVertical: 4,
    fontVariant: ['tabular-nums'],
  },
  inputDisabled: {
    color: sovswapColors.paperInkSoft,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: sovswapColors.paper,
    paddingHorizontal: sovswapSpacing.md,
    paddingVertical: 8,
    borderRadius: 999,
    gap: 4,
    minWidth: 88,
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  chipArrow: {
    fontSize: 11,
    color: sovswapColors.paperInkSoft,
  },
}));

const styles = createSovSwapStyles(() => StyleSheet.create({
  scroll: { paddingBottom: sovswapSpacing.xxxl },
  headerWrap: { paddingHorizontal: sovswapSpacing.lg },
  swapCard: {
    backgroundColor: sovswapColors.paperWarm,
    marginTop: sovswapSpacing.md,
    marginHorizontal: sovswapSpacing.lg,
    borderRadius: 12,
    position: 'relative',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: sovswapColors.ruleSoft,
    marginHorizontal: sovswapSpacing.lg,
  },
  flipFloat: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: sovswapColors.paperInk,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: -18 }],
  },
  flipGlyph: {
    fontSize: 16,
    color: sovswapColors.paper,
    fontWeight: '600',
  },
  rateLine: {
    marginTop: sovswapSpacing.sm,
    marginHorizontal: sovswapSpacing.lg,
    alignItems: 'flex-end',
  },
  rateText: {
    ...sovswapType.numeralSoft,
    fontSize: 12,
  },
  swapBtn: {
    marginTop: sovswapSpacing.lg,
    marginHorizontal: sovswapSpacing.lg,
    backgroundColor: sovswapColors.paperInk,
    paddingVertical: sovswapSpacing.md,
    alignItems: 'center',
    borderRadius: 12,
  },
  swapBtnText: {
    color: sovswapColors.paper,
    fontSize: 16,
    fontWeight: '600',
  },
  chartHeaderWrap: {
    paddingHorizontal: sovswapSpacing.lg,
    marginTop: sovswapSpacing.lg,
  },
  chartCard: {
    paddingHorizontal: sovswapSpacing.lg,
    paddingVertical: sovswapSpacing.md,
    backgroundColor: sovswapColors.paperWarm,
    marginHorizontal: sovswapSpacing.lg,
    borderRadius: 4,
  },
  chartPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: sovswapSpacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: sovswapColors.ruleSoft,
    gap: sovswapSpacing.sm,
  },
  chartPickerLabel: {
    ...sovswapType.smallCaps,
    color: sovswapColors.paperInk,
  },
  chartPickerValue: {
    flex: 1,
    ...sovswapType.body,
    fontStyle: 'italic',
  },
  chartPickerArrow: {
    fontSize: 12,
    color: sovswapColors.paperInkSoft,
  },
  chartBody: {
    paddingTop: sovswapSpacing.sm,
  },
  chartEmpty: {
    paddingVertical: sovswapSpacing.xxl,
    alignItems: 'center',
  },
  chartEmptyKicker: {
    ...sovswapType.smallCaps,
    marginBottom: 6,
  },
  chartEmptyText: {
    ...sovswapType.bodySoft,
    fontStyle: 'italic',
  },
}));

export default SwapTab;
