import React from 'react';
import {
  Modal as RNModal,
  View,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  Alert,
} from 'react-native';
import { Text } from '../../atoms/Text';
import {
  colors,
  spacing,
  borderRadius,
  typography,
  shadows,
} from '../../../theme';
import type { DaoStake } from '../../../hooks/useDaoStakes';
import { WELFARE_DAOS } from '../../../constants';

// tasteful tinted rgba helper (mirrors StakeDaoModal)
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

const BLOCKS_PER_DAY = 7_200;
const NSOV_PER_SOV = 1_000_000_000;

const nsovToSov = (n: number) => n / NSOV_PER_SOV;

const formatSov = (n: number): string => {
  const sov = nsovToSov(n);
  if (sov >= 1000) return `${sov.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return sov.toLocaleString(undefined, { maximumFractionDigits: 4 });
};

const formatBlocksAsDuration = (blocks: number): string => {
  const days = blocks / BLOCKS_PER_DAY;
  if (days >= 365) return `${(days / 365).toFixed(1)}y`;
  if (days >= 30) return `${(days / 30).toFixed(1)}m`;
  if (days >= 1) return `${Math.round(days)}d`;
  const hours = (blocks * 12) / 3600;
  return `${Math.round(hours)}h`;
};

const truncateHex = (hex: string): string =>
  hex.length > 20 ? `${hex.substring(0, 10)}…${hex.substring(hex.length - 6)}` : hex;

export interface StakeDetailModalProps {
  visible: boolean;
  stake: DaoStake | null;
  currentHeight: number;
  onClose: () => void;
  onUnstake: (stake: DaoStake) => void;
}

export const StakeDetailModal = React.memo(
  ({ visible, stake, currentHeight, onClose, onUnstake }: StakeDetailModalProps) => {
    if (!stake) return null;

    const dao = WELFARE_DAOS.find(d => d.id === stake.sector);
    const accent = dao?.color ?? colors.primary;
    const daoName = dao?.name ?? stake.sector;

    const canUnstake = stake.unlocked || stake.blocks_remaining <= 0;
    const unlockLabel = canUnstake
      ? 'Unlocked'
      : `Unlocks in ${formatBlocksAsDuration(stake.blocks_remaining)}`;

    const totalLockBlocks = stake.locked_until - stake.staked_at_height;
    const progressPct = canUnstake
      ? 100
      : Math.max(
          0,
          Math.min(
            100,
            ((currentHeight - stake.staked_at_height) / totalLockBlocks) * 100,
          ),
        );

    const handleUnstakePress = () => {
      if (!canUnstake) {
        Alert.alert(
          'Still locked',
          `This stake unlocks in ${formatBlocksAsDuration(stake.blocks_remaining)}.`,
        );
        return;
      }
      onUnstake(stake);
    };

    return (
      <RNModal
        visible={visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={onClose}
      >
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop}>
            <TouchableWithoutFeedback>
              <ScrollView
                contentContainerStyle={styles.scrollContent}
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
                  {/* Accent stripe */}
                  <View style={[styles.stripe, { backgroundColor: accent }]} />

                  {/* Close button */}
                  <TouchableOpacity
                    onPress={onClose}
                    style={styles.closeButton}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityRole="button"
                    accessibilityLabel="Close stake detail"
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

                  {/* Header */}
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
                      STAKED POSITION
                    </Text>
                    <Text
                      variant="h1"
                      weight="bold"
                      style={{ marginBottom: spacing.xs }}
                    >
                      {daoName}
                    </Text>
                    {dao?.desc && (
                      <Text
                        variant="caption"
                        color={colors.text_secondary}
                        style={{ lineHeight: 18 }}
                      >
                        {dao.desc}
                      </Text>
                    )}
                  </View>

                  {/* Amount block */}
                  <View
                    style={[
                      styles.amountBlock,
                      { backgroundColor: hexToRgba(accent, 0.06) },
                    ]}
                  >
                    <Text
                      style={{
                        color: colors.text_tertiary,
                        fontSize: typography.size.xs,
                        textTransform: 'uppercase',
                        letterSpacing: 0.8,
                        marginBottom: 4,
                      }}
                    >
                      Amount staked
                    </Text>
                    <Text
                      style={{
                        color: colors.text_primary,
                        fontSize: typography.size['3xl'],
                        fontWeight: typography.weight.bold,
                      }}
                    >
                      {formatSov(stake.amount)}{' '}
                      <Text
                        style={{
                          color: colors.text_tertiary,
                          fontSize: typography.size.lg,
                          fontWeight: typography.weight.semibold,
                        }}
                      >
                        SOV
                      </Text>
                    </Text>
                  </View>

                  {/* Lock progress */}
                  <View style={{ marginBottom: spacing.lg }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        marginBottom: spacing.sm,
                      }}
                    >
                      <Text
                        style={{
                          color: colors.text_tertiary,
                          fontSize: typography.size.xs,
                          textTransform: 'uppercase',
                          letterSpacing: 0.8,
                        }}
                      >
                        Lock status
                      </Text>
                      <Text
                        style={{
                          color: canUnstake ? accent : colors.text_secondary,
                          fontSize: typography.size.xs,
                          fontWeight: typography.weight.semibold,
                        }}
                      >
                        {unlockLabel}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.progressTrack,
                        { backgroundColor: hexToRgba(accent, 0.12) },
                      ]}
                    >
                      <View
                        style={[
                          styles.progressFill,
                          {
                            backgroundColor: accent,
                            width: `${progressPct}%`,
                          },
                        ]}
                      />
                    </View>
                  </View>

                  {/* Details grid */}
                  <View style={styles.detailsBox}>
                    <DetailRow
                      label="Staked at block"
                      value={stake.staked_at_height.toLocaleString()}
                    />
                    <DetailRow
                      label="Unlocks at block"
                      value={stake.locked_until.toLocaleString()}
                    />
                    <DetailRow
                      label="Current block"
                      value={currentHeight.toLocaleString()}
                    />
                    <DetailRow
                      label="Total lock"
                      value={formatBlocksAsDuration(totalLockBlocks)}
                    />
                    <DetailRow
                      label="Blocks remaining"
                      value={
                        canUnstake
                          ? '—'
                          : stake.blocks_remaining.toLocaleString()
                      }
                    />
                    <DetailRow
                      label="DAO wallet"
                      value={truncateHex(stake.sector_dao_key_id)}
                      mono
                      last
                    />
                  </View>

                  {/* Unstake CTA */}
                  <TouchableOpacity
                    onPress={handleUnstakePress}
                    activeOpacity={0.85}
                    style={[
                      styles.unstakeButton,
                      {
                        backgroundColor: canUnstake
                          ? accent
                          : hexToRgba(accent, 0.18),
                        shadowColor: accent,
                        shadowOpacity: canUnstake ? 0.45 : 0,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={
                      canUnstake
                        ? `Unstake ${formatSov(stake.amount)} SOV from ${daoName}`
                        : 'Stake still locked'
                    }
                  >
                    <Text
                      style={{
                        color: canUnstake
                          ? colors.white
                          : colors.text_tertiary,
                        fontSize: typography.size.md,
                        fontWeight: typography.weight.bold,
                        letterSpacing: 0.3,
                      }}
                    >
                      {canUnstake
                        ? `Unstake ${formatSov(stake.amount)} SOV`
                        : `Locked for ${formatBlocksAsDuration(stake.blocks_remaining)}`}
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
                    Unstaking returns your SOV to your wallet.
                  </Text>
                </View>
              </ScrollView>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </RNModal>
    );
  },
);

StakeDetailModal.displayName = 'StakeDetailModal';

interface DetailRowProps {
  label: string;
  value: string;
  mono?: boolean;
  last?: boolean;
}
const DetailRow: React.FC<DetailRowProps> = ({ label, value, mono, last }) => (
  <View
    style={[
      styles.detailRow,
      !last && {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border_light,
      },
    ]}
  >
    <Text
      style={{
        color: colors.text_tertiary,
        fontSize: typography.size.xs,
      }}
    >
      {label}
    </Text>
    <Text
      style={{
        color: colors.text_primary,
        fontSize: typography.size.sm,
        fontWeight: typography.weight.semibold,
        fontFamily: mono ? 'Courier' : undefined,
      }}
    >
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
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
    paddingRight: spacing.xl,
  },
  amountBlock: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.lg,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  detailsBox: {
    marginBottom: spacing.lg,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  unstakeButton: {
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 6,
  },
});

export default StakeDetailModal;
