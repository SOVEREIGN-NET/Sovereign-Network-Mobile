import React, { useMemo, useState, useEffect } from 'react';
import {
  Modal as RNModal,
  View,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
} from 'react-native';
import { Text } from '../../atoms/Text';
import {
  colors,
  spacing,
  borderRadius,
  typography,
  shadows,
} from '../../../theme';

export interface StakeDaoTarget {
  id: string;
  name: string;
  desc: string;
  color: string;
}

export interface StakeDaoModalProps {
  visible: boolean;
  dao: StakeDaoTarget | null;
  onClose: () => void;
  onSubmit: (daoId: string, amount: number, lockBlocks: number) => void;
}

// Lock-period options. ~12 s/block → 7_200 blocks/day.
// 30-day minimum is enforced — no option below it.
const BLOCKS_PER_DAY = 7_200;
const LOCK_OPTIONS = [
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
  { days: 180, label: '6m' },
  { days: 365, label: '1y' },
] as const;
const DEFAULT_LOCK_DAYS = 30;

// Convert a #rrggbb hex to rgba(r,g,b,a) — used for tasteful tinted glows.
const hexToRgba = (hex: string, alpha: number): string => {
  const cleaned = hex.replace('#', '');
  const full =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map(c => c + c)
          .join('')
      : cleaned;
  const r = parseInt(full.substring(0, 2), 16);
  const g = parseInt(full.substring(2, 4), 16);
  const b = parseInt(full.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const QUICK_AMOUNTS = [10, 50, 100, 500];

export const StakeDaoModal = React.memo(
  ({ visible, dao, onClose, onSubmit }: StakeDaoModalProps) => {
    const [amount, setAmount] = useState<string>('');
    const [isFocused, setIsFocused] = useState(false);
    const [lockDays, setLockDays] = useState<number>(DEFAULT_LOCK_DAYS);

    // Reset field each time the modal opens so previous entry doesn't linger.
    useEffect(() => {
      if (visible) {
        setAmount('');
        setIsFocused(false);
        setLockDays(DEFAULT_LOCK_DAYS);
      }
    }, [visible]);

    const accent = dao?.color ?? colors.primary;
    const parsed = useMemo(() => {
      const n = parseFloat(amount);
      return Number.isFinite(n) && n > 0 ? n : 0;
    }, [amount]);
    const canSubmit = parsed > 0;

    const lockBlocks = lockDays * BLOCKS_PER_DAY;

    const handleSubmit = () => {
      if (!dao || !canSubmit) return;
      Keyboard.dismiss();
      onSubmit(dao.id, parsed, lockBlocks);
    };

    const handleQuickAmount = (value: number) => {
      setAmount(String(value));
    };

    const formatAmount = (n: number): string => {
      if (n >= 1000) {
        return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
      }
      return String(n);
    };

    if (!dao) return null;

    return (
      <RNModal
        visible={visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={onClose}
      >
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableWithoutFeedback onPress={onClose}>
            <View style={styles.backdrop}>
              <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <ScrollView
                  contentContainerStyle={styles.scrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <View
                    style={[
                      styles.card,
                      {
                        borderColor: hexToRgba(accent, 0.45),
                        shadowColor: accent,
                      },
                    ]}
                  >
                    {/* Header stripe — tasteful brand accent */}
                    <View
                      style={[
                        styles.stripe,
                        { backgroundColor: accent },
                      ]}
                    />

                    {/* Close button */}
                    <TouchableOpacity
                      onPress={onClose}
                      style={styles.closeButton}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      accessibilityRole="button"
                      accessibilityLabel="Close stake modal"
                    >
                      <Text
                        style={{
                          color: colors.text_tertiary,
                          fontSize: typography.size.xl,
                        }}
                      >
                        ×
                      </Text>
                    </TouchableOpacity>

                    {/* Eyebrow + title */}
                    <View style={styles.header}>
                      <Text
                        style={{
                          color: accent,
                          fontSize: typography.size.xs,
                          letterSpacing: 2,
                          fontWeight: typography.weight.semibold,
                          marginBottom: spacing.sm,
                        }}
                      >
                        WELFARE STAKING
                      </Text>
                      <Text
                        variant="h1"
                        weight="bold"
                        style={{ marginBottom: spacing.xs }}
                      >
                        Stake in {dao.name}
                      </Text>
                      <Text
                        variant="caption"
                        color={colors.text_secondary}
                        style={{ lineHeight: 18 }}
                      >
                        {dao.desc}
                      </Text>
                    </View>

                    {/* Explanatory copy */}
                    <View
                      style={[
                        styles.explainer,
                        {
                          borderLeftColor: accent,
                          backgroundColor: hexToRgba(accent, 0.06),
                        },
                      ]}
                    >
                      <Text
                        variant="caption"
                        color={colors.text_secondary}
                        style={{ lineHeight: 19 }}
                      >
                        Stake your SOV to support this welfare program. Your
                        tokens remain yours — they signal commitment, power
                        governance, and help fund real outcomes for the
                        community.
                      </Text>
                    </View>

                    {/* Amount label */}
                    <Text
                      style={{
                        color: colors.text_primary,
                        fontSize: typography.size.sm,
                        fontWeight: typography.weight.semibold,
                        marginBottom: spacing.sm,
                      }}
                    >
                      Amount
                    </Text>

                    {/* Custom input with accent border on focus */}
                    <View
                      style={[
                        styles.inputWrap,
                        {
                          borderColor: isFocused
                            ? accent
                            : hexToRgba(accent, 0.18),
                          backgroundColor: colors.bg_darkest,
                        },
                      ]}
                    >
                      <TextInput
                        value={amount}
                        onChangeText={setAmount}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setIsFocused(false)}
                        placeholder="0.00"
                        placeholderTextColor={colors.text_placeholder}
                        keyboardType="decimal-pad"
                        returnKeyType="done"
                        style={styles.input}
                        maxLength={16}
                      />
                      <Text
                        style={{
                          color: colors.text_tertiary,
                          fontSize: typography.size.md,
                          fontWeight: typography.weight.semibold,
                          marginLeft: spacing.sm,
                        }}
                      >
                        SOV
                      </Text>
                    </View>

                    {/* Quick-amount chips */}
                    <View style={styles.chipsRow}>
                      {QUICK_AMOUNTS.map(value => {
                        const selected = parsed === value;
                        return (
                          <TouchableOpacity
                            key={value}
                            onPress={() => handleQuickAmount(value)}
                            activeOpacity={0.7}
                            style={[
                              styles.chip,
                              {
                                borderColor: selected
                                  ? accent
                                  : hexToRgba(accent, 0.2),
                                backgroundColor: selected
                                  ? hexToRgba(accent, 0.15)
                                  : 'transparent',
                              },
                            ]}
                          >
                            <Text
                              style={{
                                color: selected ? accent : colors.text_secondary,
                                fontSize: typography.size.sm,
                                fontWeight: typography.weight.semibold,
                              }}
                            >
                              {formatAmount(value)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* Lock period label */}
                    <Text
                      style={{
                        color: colors.text_primary,
                        fontSize: typography.size.sm,
                        fontWeight: typography.weight.semibold,
                        marginBottom: spacing.sm,
                      }}
                    >
                      Lock period
                    </Text>

                    <View style={styles.chipsRow}>
                      {LOCK_OPTIONS.map(option => {
                        const selected = lockDays === option.days;
                        return (
                          <TouchableOpacity
                            key={option.days}
                            onPress={() => setLockDays(option.days)}
                            activeOpacity={0.7}
                            style={[
                              styles.chip,
                              {
                                borderColor: selected
                                  ? accent
                                  : hexToRgba(accent, 0.2),
                                backgroundColor: selected
                                  ? hexToRgba(accent, 0.15)
                                  : 'transparent',
                              },
                            ]}
                          >
                            <Text
                              style={{
                                color: selected
                                  ? accent
                                  : colors.text_secondary,
                                fontSize: typography.size.sm,
                                fontWeight: typography.weight.semibold,
                              }}
                            >
                              {option.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* Submit */}
                    <TouchableOpacity
                      onPress={handleSubmit}
                      disabled={!canSubmit}
                      activeOpacity={0.85}
                      style={[
                        styles.submit,
                        {
                          backgroundColor: canSubmit
                            ? accent
                            : hexToRgba(accent, 0.25),
                          shadowColor: accent,
                          shadowOpacity: canSubmit ? 0.45 : 0,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={
                        canSubmit
                          ? `Stake ${parsed} SOV in ${dao.name}`
                          : 'Enter an amount to stake'
                      }
                    >
                      <Text
                        style={{
                          color: canSubmit
                            ? colors.white
                            : colors.text_tertiary,
                          fontSize: typography.size.md,
                          fontWeight: typography.weight.bold,
                          letterSpacing: 0.3,
                        }}
                      >
                        {canSubmit
                          ? `Stake ${parsed} SOV`
                          : 'Enter an amount'}
                      </Text>
                    </TouchableOpacity>

                    <Text
                      style={{
                        color: colors.text_tertiary,
                        fontSize: typography.size.xs,
                        textAlign: 'center',
                        marginTop: spacing.md,
                      }}
                    >
                      Locked for {lockDays} days · unstake after lock expires
                    </Text>
                  </View>
                </ScrollView>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </RNModal>
    );
  },
);

StakeDaoModal.displayName = 'StakeDaoModal';

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  card: {
    backgroundColor: colors.bg_dark,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    paddingTop: spacing.xl + spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    overflow: 'hidden',
    ...shadows.lg,
    shadowOpacity: 0.4,
    shadowRadius: 24,
  },
  stripe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  closeButton: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  header: {
    marginBottom: spacing.lg,
    paddingRight: spacing.xl, // leave room for close button
  },
  explainer: {
    borderLeftWidth: 2,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.lg,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
    paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.xs,
    marginBottom: spacing.md,
  },
  input: {
    flex: 1,
    color: colors.text_primary,
    fontSize: typography.size['2xl'],
    fontWeight: typography.weight.semibold,
    padding: 0,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  chip: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
  },
  submit: {
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 6,
  },
});

export default StakeDaoModal;
