import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import {
  SovTokenPickerModal,
} from '../../../components/organisms/SovSwap';
import { Text } from '../../../components';
import {
  allSovTokens,
  canSwap,
  findToken,
  initialBalances,
} from '../../../services/SovSwapMockData';
import {
  sovswapAccentFor,
  createSovSwapStyles,
  sovswapColors,
  sovswapSpacing,
  sovswapType,
} from '../theme/sovswapTokens';
import { colors, spacing, typography, borderRadius } from '../../../theme/tokens';

type PickerSlot = null | 'from' | 'to';

export const SwapTab: React.FC = () => {
  const [fromToken, setFromToken] = useState<string>('');
  const [toToken, setToToken] = useState<string>('');
  const [fromAmount, setFromAmount] = useState<string>('');
  const [toAmount, setToAmount] = useState<string>('');
  const [picker, setPicker] = useState<PickerSlot>(null);
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

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { flexGrow: 1, justifyContent: 'center' }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerWrap}>
          <Text
            variant="h1"
            weight="bold"
            style={{
              textAlign: 'center',
              letterSpacing: 1.5,
              marginBottom: spacing.xl,
            }}
          >
            SOV SWAP
          </Text>
        </View>

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

        {rate && fromTok && toTok ? (
          <View style={styles.rateLine}>
            <Text style={styles.rateText}>
              1 {fromTok.tokenSymbol} = {rate.toFixed(4)} {toTok.tokenSymbol}
            </Text>
          </View>
        ) : null}

        <Pressable onPress={handleSwap} style={styles.swapBtn}>
          <Text style={styles.swapBtnText}>Swap</Text>
        </Pressable>
      </ScrollView>

      <SovTokenPickerModal
        visible={picker !== null}
        tokens={allSovTokens}
        selected={picker === 'from' ? fromToken : toToken}
        balances={balances}
        title={picker === 'from' ? 'Swap from' : 'Swap into'}
        onSelect={sym => {
          if (picker === 'from') setFromToken(sym);
          if (picker === 'to') setToToken(sym);
        }}
        onClose={() => setPicker(null)}
      />
    </View>
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
    color: sovswapColors.paperInkSoft,
  },
  balance: {
    ...sovswapType.numeralSoft,
    fontSize: typography.size.xs,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sovswapSpacing.md,
  },
  input: {
    flex: 1,
    fontSize: typography.size['3xl'],
    color: sovswapColors.paperInk,
    paddingVertical: 4,
  },
  inputDisabled: {
    color: sovswapColors.paperInkSoft,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: sovswapColors.paper,
    paddingHorizontal: sovswapSpacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    gap: 4,
    minWidth: 88,
    justifyContent: 'center',
  },
  chipText: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  chipArrow: {
    fontSize: 11,
    color: sovswapColors.paperInkSoft,
  },
}));

const styles = createSovSwapStyles(() => StyleSheet.create({
  scroll: { paddingBottom: sovswapSpacing.lg },
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
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: borderRadius.base,
  },
  swapBtnText: {
    color: colors.white,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
}));

export default SwapTab;
