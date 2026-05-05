import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  sovswapAccentFor,
  createSovSwapStyles,
  sovswapColors,
  sovswapSpacing,
  sovswapType,
} from '../../../../screens/sovswap/theme/sovswapTokens';
import type { SovDao } from '../../../../types/sovSwap';

export interface SovTokenPickerModalProps {
  visible: boolean;
  tokens: SovDao[];
  /** Highlighted in the list. */
  selected?: string;
  /** Optional balances printed on the right of each row. */
  balances?: Record<string, number>;
  title?: string;
  onSelect: (symbol: string) => void;
  onClose: () => void;
}

/**
 * Token picker presented as a printed index card. Each row is a
 * leader-line entry: ticker on the left, full name dotted across,
 * balance numeral on the right.
 */
export const SovTokenPickerModal: React.FC<SovTokenPickerModalProps> = ({
  visible,
  tokens,
  selected,
  balances,
  title = 'Select token',
  onSelect,
  onClose,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.kicker}>INDEX</Text>
            <Text style={styles.title}>{title}</Text>
            <View style={styles.rule} />
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {tokens.map((tok, idx) => {
              const accent = sovswapAccentFor(tok.type);
              const isActive = selected === tok.tokenSymbol;
              const balance = balances?.[tok.tokenSymbol];
              return (
                <Pressable
                  key={tok.tokenSymbol}
                  onPress={() => {
                    onSelect(tok.tokenSymbol);
                    onClose();
                  }}
                  style={[
                    styles.row,
                    idx > 0 ? styles.rowDivider : null,
                    isActive ? styles.rowActive : null,
                  ]}
                >
                  <Text style={styles.rowIndex}>
                    №{String(idx + 1).padStart(2, '0')}
                  </Text>
                  <View style={styles.rowMid}>
                    <Text style={[styles.rowSymbol, { color: accent.accent }]}>
                      ${tok.tokenSymbol}
                    </Text>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {tok.tokenName}
                    </Text>
                  </View>
                  <View style={styles.rowRight}>
                    <Text style={styles.rowType}>{accent.label}</Text>
                    {balance != null ? (
                      <Text style={styles.rowBalance}>
                        {balance.toLocaleString()}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable onPress={onClose} style={styles.cancel}>
              <Text style={styles.cancelText}>← Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = createSovSwapStyles(() => StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(26, 22, 20, 0.55)',
    justifyContent: 'center',
    paddingHorizontal: sovswapSpacing.lg,
  },
  card: {
    backgroundColor: sovswapColors.paper,
    borderRadius: 8,
    maxHeight: '78%',
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: sovswapSpacing.lg,
    paddingTop: sovswapSpacing.lg,
    paddingBottom: sovswapSpacing.sm,
  },
  kicker: {
    ...sovswapType.smallCaps,
    color: sovswapColors.paperInk,
    marginBottom: 4,
  },
  title: {
    ...sovswapType.sectionTitle,
  },
  rule: {
    height: 0,
    marginTop: sovswapSpacing.xs,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: sovswapSpacing.lg,
    paddingVertical: sovswapSpacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: sovswapSpacing.md,
    gap: sovswapSpacing.md,
  },
  rowDivider: {
    // gap-only, no rule
  },
  rowActive: {
    backgroundColor: sovswapColors.paperWarm,
  },
  rowIndex: {
    ...sovswapType.index,
    width: 36,
  },
  rowMid: {
    flex: 1,
  },
  rowSymbol: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  rowName: {
    ...sovswapType.bodySoft,
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 1,
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  rowType: {
    ...sovswapType.smallCaps,
    fontSize: 9,
    color: sovswapColors.paperInkFaint,
  },
  rowBalance: {
    ...sovswapType.numeral,
    marginTop: 2,
  },
  footer: {
    padding: sovswapSpacing.md,
    alignItems: 'center',
  },
  cancel: {
    paddingVertical: sovswapSpacing.xs,
    paddingHorizontal: sovswapSpacing.lg,
  },
  cancelText: {
    ...sovswapType.smallCapsInk,
  },
}));

export default SovTokenPickerModal;
