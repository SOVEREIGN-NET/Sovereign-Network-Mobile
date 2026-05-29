/**
 * BublMiniWallet — the compact BUBL balance card on the Bubl tab.
 *
 * A tappable "mini-wallet": it shows only the lifetime BUBL a member
 * has earned and opens the full rewards ledger on press. The balance
 * comes from the live rewards API (`GET /rewards/balance`); until the
 * rewards node is reachable the card degrades to a label-only state and
 * stays tappable.
 */

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  borderRadius,
  colors,
  shadows,
  spacing,
  typography,
} from '../../../theme';
import {
  formatBublDisplay,
  getRewardsBalance,
} from '../../../services/RewardsService';
import { BUBL_SYMBOL, type RewardsBalance } from '../../../types/bubl';

/**
 * BublTokenGlyph — the BUBL token mark: a soda-bubble drawn from plain
 * Views (an outer ring, a faint inner ring, and a shine highlight) so
 * it needs no SVG and tints cleanly to any accent colour. Rendered at
 * hero size on the rewards screen, chip size on each reward row, and
 * mid size here in the card.
 */
export const BublTokenGlyph: React.FC<{ size?: number; color?: string }> = ({
  size = 44,
  color = colors.primary,
}) => {
  const ring = Math.max(1.5, size * 0.05);
  const inner = size * 0.54;
  const shine = size * 0.22;
  return (
    <View
      style={[
        glyph.bubble,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: ring,
          borderColor: color,
        },
      ]}
    >
      {/* faint inner ring — gives the bubble depth */}
      <View
        style={{
          width: inner,
          height: inner,
          borderRadius: inner / 2,
          borderWidth: Math.max(1, ring * 0.7),
          borderColor: color,
          opacity: 0.5,
        }}
      />
      {/* shine — the highlight that sells it as a bubble */}
      <View
        style={{
          position: 'absolute',
          top: size * 0.16,
          left: size * 0.2,
          width: shine,
          height: shine,
          borderRadius: shine / 2,
          backgroundColor: '#ffffff',
          opacity: 0.85,
        }}
      />
    </View>
  );
};

type Phase = 'loading' | 'ready' | 'unavailable';

export interface BublMiniWalletProps {
  /** Caller's canonical chain DID. Undefined if not signed in. */
  did?: string;
  /** Opens the full BUBL rewards ledger. */
  onPress: () => void;
}

export const BublMiniWallet: React.FC<BublMiniWalletProps> = ({
  did,
  onPress,
}) => {
  const [phase, setPhase] = useState<Phase>('loading');
  const [balance, setBalance] = useState<RewardsBalance | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!did) {
      setPhase('unavailable');
      return;
    }
    setPhase('loading');
    getRewardsBalance(did)
      .then(b => {
        if (cancelled) return;
        setBalance(b);
        setPhase('ready');
      })
      .catch(() => {
        // Rewards node unreachable / endpoint not deployed yet — the
        // card stays usable, just without a number.
        if (!cancelled) setPhase('unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, [did]);

  const streak = balance?.counts.current_streak ?? 0;
  const hint =
    phase === 'ready' && streak > 0
      ? `${streak}-day streak · Tap to see rewards`
      : 'Tap to see rewards';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        phase === 'ready' && balance
          ? `BUBL earned: ${balance.total_earned_display}. Tap to see rewards.`
          : 'BUBL rewards. Tap to see rewards.'
      }
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      {/* Decorative bubbles drifting off the corner — pure flair, never
          interactive, clipped by the card's overflow:hidden. */}
      <View pointerEvents="none" style={[styles.deco, styles.decoLarge]} />
      <View pointerEvents="none" style={[styles.deco, styles.decoSmall]} />

      <BublTokenGlyph size={46} />

      <View style={styles.body}>
        <Text style={styles.label}>BUBL earned</Text>
        <View style={styles.amountRow}>
          {phase === 'ready' && balance ? (
            <>
              <Text style={styles.amount}>
                {formatBublDisplay(balance.total_earned_display)}
              </Text>
              <Text style={styles.unit}>{BUBL_SYMBOL}</Text>
            </>
          ) : (
            <Text style={styles.amountMuted}>
              {phase === 'loading' ? '· · ·' : BUBL_SYMBOL}
            </Text>
          )}
        </View>
        <Text style={styles.hint} numberOfLines={1}>
          {hint}
        </Text>
      </View>

      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
};

const glyph = StyleSheet.create({
  bubble: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg_darker,
  },
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.bg_dark,
    borderWidth: 1,
    borderColor: colors.primary,
    // Clip the decorative bubbles to the rounded card.
    overflow: 'hidden',
    ...shadows.sm,
  },
  cardPressed: {
    opacity: 0.85,
  },
  deco: {
    position: 'absolute',
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  decoLarge: {
    width: 58,
    height: 58,
    top: -22,
    right: 30,
    opacity: 0.18,
  },
  decoSmall: {
    width: 26,
    height: 26,
    top: 18,
    right: -8,
    opacity: 0.13,
  },
  body: {
    flex: 1,
  },
  label: {
    fontSize: typography.size.xs,
    color: colors.text_tertiary,
    letterSpacing: 0.3,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 1,
  },
  amount: {
    fontSize: 26,
    fontWeight: typography.weight.bold,
    color: colors.text_primary,
  },
  amountMuted: {
    fontSize: 22,
    fontWeight: typography.weight.semibold,
    color: colors.text_tertiary,
  },
  unit: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.text_secondary,
    marginLeft: spacing.xs,
  },
  hint: {
    fontSize: typography.size.xs,
    color: colors.text_secondary,
    marginTop: 2,
  },
  chevron: {
    fontSize: 26,
    color: colors.primary,
    fontWeight: typography.weight.medium,
    marginLeft: spacing.xs,
  },
});
