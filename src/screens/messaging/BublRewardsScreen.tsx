/**
 * BublRewardsScreen — the BUBL rewards ledger.
 *
 * Opened from the mini-wallet on the Bubl tab. Three live reads on
 * mount — balance, status, and the first history page — plus cursor
 * paginated "load more" and pull-to-refresh. Claims are normally
 * auto-fired by the app's lifecycle triggers; the status panel here
 * also exposes a manual claim as a fallback.
 *
 * The rewards endpoints are g1-only and may not be deployed yet — any
 * unreachable response collapses to a calm "not live yet" state rather
 * than an error.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ScreenLayout } from '../../components';
import { BublTokenGlyph } from '../../components/organisms';
import { borderRadius, colors, spacing, typography } from '../../theme';
import {
  claimReward,
  claimSkipMessage,
  formatBublDisplay,
  getRewardsBalance,
  getRewardsHistory,
  getRewardsStatus,
  isRewardsUnavailable,
} from '../../services/RewardsService';
import {
  BUBL_KIND_COLOR,
  BUBL_KIND_LABEL,
  BUBL_SYMBOL,
  type RewardEvent,
  type RewardKind,
  type RewardsBalance,
  type RewardsHistoryEvent,
  type RewardsStatus,
} from '../../types/bubl';
import { useAuth } from '../../hooks/useAuth';
import { formatRelativeTime } from './messagingShared';

interface Props {
  navigation: any;
}

const HISTORY_PAGE = 50;

type Phase = 'loading' | 'ready' | 'unavailable';

const BublRewardsScreen: React.FC<Props> = ({ navigation }) => {
  const { currentIdentity } = useAuth();
  const did = currentIdentity?.did;

  const [phase, setPhase] = useState<Phase>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [balance, setBalance] = useState<RewardsBalance | null>(null);
  const [status, setStatus] = useState<RewardsStatus | null>(null);
  const [events, setEvents] = useState<RewardsHistoryEvent[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [claiming, setClaiming] = useState<RewardEvent | null>(null);

  /** Fetch balance + status + the first history page together. */
  const load = useCallback(async (): Promise<void> => {
    if (!did) {
      setPhase('unavailable');
      return;
    }
    try {
      const [b, s, h] = await Promise.all([
        getRewardsBalance(did),
        getRewardsStatus(did),
        getRewardsHistory(did, { limit: HISTORY_PAGE }),
      ]);
      setBalance(b);
      setStatus(s);
      setEvents(h.events);
      setCursor(h.next_cursor);
      setHasMore(h.has_more);
      setPhase('ready');
    } catch (e) {
      if (isRewardsUnavailable(e)) {
        setPhase('unavailable');
      } else {
        // A transient error still leaves the user with the calm
        // unavailable state — pull-to-refresh retries.
        console.warn('[BublRewardsScreen] load failed:', e);
        setPhase('unavailable');
      }
    }
  }, [did]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const onLoadMore = useCallback(async () => {
    if (!did || !cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const h = await getRewardsHistory(did, {
        limit: HISTORY_PAGE,
        cursor,
      });
      setEvents(prev => [...prev, ...h.events]);
      setCursor(h.next_cursor);
      setHasMore(h.has_more);
    } catch (e) {
      console.warn('[BublRewardsScreen] load-more failed:', e);
    } finally {
      setLoadingMore(false);
    }
  }, [did, cursor, loadingMore]);

  /** Manual claim fallback — the lifecycle triggers normally beat the
   *  user here, but a stuck claim (e.g. welcome before the identity is
   *  on-chain) can still be finished by hand. */
  const onClaim = useCallback(
    async (event: RewardEvent) => {
      if (!did || claiming) return;
      setClaiming(event);
      try {
        const result = await claimReward(did, event);
        const skipMsg = claimSkipMessage(result);
        if (skipMsg) {
          console.info('[BublRewardsScreen] claim skipped:', event, result.reason);
        }
        // Re-pull balance + status so the panel reflects the new state.
        const [b, s] = await Promise.all([
          getRewardsBalance(did),
          getRewardsStatus(did),
        ]);
        setBalance(b);
        setStatus(s);
      } catch (e) {
        // 503 / transport → calm unavailable on next load; do not treat
        // InsufficientRewardLiquidity as an exception (HTTP 200 body).
        if (isRewardsUnavailable(e)) {
          setPhase('unavailable');
        }
        console.warn('[BublRewardsScreen] claim failed:', event, e);
      } finally {
        setClaiming(null);
      }
    },
    [did, claiming],
  );

  return (
    <ScreenLayout
      onBack={() => navigation.goBack()}
      backLabel="Bubl"
      refreshControl={
        phase === 'ready' ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        ) : undefined
      }
    >
      {phase === 'loading' && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}

      {phase === 'unavailable' && (
        <View style={styles.centered}>
          <BublTokenGlyph size={64} />
          <Text style={styles.unavailableTitle}>Rewards aren&apos;t live yet</Text>
          <Text style={styles.unavailableBody}>
            BUBL rewards are coming soon. You&apos;ll start earning the
            moment they go live — just by using the app.
          </Text>
          <Pressable
            onPress={() => {
              setPhase('loading');
              void load();
            }}
            style={({ pressed }) => [
              styles.retry,
              pressed && styles.retryPressed,
            ]}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      )}

      {phase === 'ready' && balance && status && (
        <>
          {/* Hero — lifetime balance */}
          <View style={styles.hero}>
            <BublTokenGlyph size={68} />
            <View style={styles.heroAmountRow}>
              <Text style={styles.heroAmount}>
                {formatBublDisplay(balance.total_earned_display)}
              </Text>
              <Text style={styles.heroUnit}>{BUBL_SYMBOL}</Text>
            </View>
            <Text style={styles.heroCaption}>Earned for using Bubl</Text>
            {balance.counts.current_streak > 0 && (
              <Text style={styles.heroStreak}>
                {balance.counts.current_streak}-day streak
                {balance.counts.longest_streak >
                balance.counts.current_streak
                  ? ` · best ${balance.counts.longest_streak}`
                  : ''}
              </Text>
            )}
          </View>

          {/* Earn panel — what's claimable right now */}
          <Text style={styles.sectionTitle}>Earn BUBL</Text>
          <View style={styles.panel}>
            <StatusRow
              kind="welcome"
              title={BUBL_KIND_LABEL.welcome}
              subtitle="One-time, when you join"
              first
              right={
                status.claimable.welcome.available ? (
                  <ClaimButton
                    label={`Claim +${status.claimable.welcome.amount_display}`}
                    busy={claiming === 'welcome'}
                    onPress={() => onClaim('welcome')}
                  />
                ) : (
                  <DoneChip
                    text={`+${status.claimable.welcome.amount_display}`}
                  />
                )
              }
            />
            <StatusRow
              kind="daily_checkin"
              title={BUBL_KIND_LABEL.daily_checkin}
              subtitle={`Day ${status.claimable.daily_checkin.next_streak_day} · +1/day up to +10`}
              right={
                status.claimable.daily_checkin.available ? (
                  <ClaimButton
                    label={`Claim +${status.claimable.daily_checkin.amount_display}`}
                    busy={claiming === 'daily_checkin'}
                    onPress={() => onClaim('daily_checkin')}
                  />
                ) : (
                  <DoneChip text="Done today" />
                )
              }
            />
            <StatusRow
              kind="active_session"
              title={BUBL_KIND_LABEL.active_session}
              subtitle="Once a day, for showing up"
              right={
                status.claimable.active_session.available ? (
                  <ClaimButton
                    label={`Claim +${status.claimable.active_session.amount_display}`}
                    busy={claiming === 'active_session'}
                    onPress={() => onClaim('active_session')}
                  />
                ) : (
                  <DoneChip text="Done today" />
                )
              }
            />
            <StatusRow
              kind="new_partner"
              title={BUBL_KIND_LABEL.new_partner}
              subtitle={`+${status.claimable.new_partner.amount_display_per_partner} each · resets weekly`}
              right={
                <Text style={styles.partnerCount}>
                  {status.claimable.new_partner.partners_this_week}
                  <Text style={styles.partnerCap}>
                    {' / '}
                    {status.claimable.new_partner.weekly_cap}
                  </Text>
                </Text>
              }
            />
          </View>

          {/* History — the reward ledger */}
          <Text style={styles.sectionTitle}>Recent rewards</Text>
          {events.length === 0 ? (
            <View style={styles.emptyLedger}>
              <Text style={styles.emptyText}>
                No rewards yet — they&apos;ll show up here as you earn.
              </Text>
            </View>
          ) : (
            <View style={styles.ledger}>
              {events.map((ev, i) => (
                <HistoryRow
                  key={`${ev.at}-${ev.seq}`}
                  event={ev}
                  first={i === 0}
                  now={status.now}
                />
              ))}
            </View>
          )}
          {hasMore && (
            <Pressable
              onPress={onLoadMore}
              disabled={loadingMore}
              style={({ pressed }) => [
                styles.loadMore,
                pressed && styles.retryPressed,
              ]}
            >
              {loadingMore ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.loadMoreText}>Load more</Text>
              )}
            </Pressable>
          )}
        </>
      )}
    </ScreenLayout>
  );
};

// ─── Status panel pieces ───────────────────────────────────────────────

const StatusRow: React.FC<{
  kind: RewardKind;
  title: string;
  subtitle: string;
  right: React.ReactNode;
  first?: boolean;
}> = ({ kind, title, subtitle, right, first }) => (
  <View style={[styles.row, !first && styles.rowDivider]}>
    <BublTokenGlyph size={32} color={BUBL_KIND_COLOR[kind]} />
    <View style={styles.rowBody}>
      <Text style={styles.rowTitle} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.rowSub} numberOfLines={1}>
        {subtitle}
      </Text>
    </View>
    <View style={styles.rowRight}>{right}</View>
  </View>
);

const ClaimButton: React.FC<{
  label: string;
  busy: boolean;
  onPress: () => void;
}> = ({ label, busy, onPress }) => (
  <Pressable
    onPress={onPress}
    disabled={busy}
    style={({ pressed }) => [
      styles.claimBtn,
      pressed && styles.retryPressed,
      busy && styles.claimBtnBusy,
    ]}
  >
    {busy ? (
      <ActivityIndicator size="small" color={colors.bg_darkest} />
    ) : (
      <Text style={styles.claimBtnText}>{label}</Text>
    )}
  </Pressable>
);

const DoneChip: React.FC<{ text: string }> = ({ text }) => (
  <View style={styles.doneChip}>
    <Text style={styles.doneChipText}>✓ {text}</Text>
  </View>
);

// ─── History ───────────────────────────────────────────────────────────

/** One-line context for a history event, derived from its meta. */
function detailFor(ev: RewardsHistoryEvent): string {
  switch (ev.event) {
    case 'welcome':
      return 'Joined the Sovereign Network';
    case 'daily_checkin':
      return ev.meta?.streak_day
        ? `Day ${ev.meta.streak_day} streak`
        : 'Checked in';
    case 'active_session':
      return 'Active today';
    case 'new_partner':
      return ev.meta?.peer_did
        ? `Chatted with ${shortDid(ev.meta.peer_did)}`
        : 'New chat partner';
    default:
      return '';
  }
}

/** `did:zhtp:abcd…wxyz` — recognisable, compact. */
function shortDid(did: string): string {
  const tail = did.replace(/^did:zhtp:/, '');
  return tail.length <= 12
    ? did
    : `${tail.slice(0, 4)}…${tail.slice(-4)}`;
}

const HistoryRow: React.FC<{
  event: RewardsHistoryEvent;
  first: boolean;
  /** Server `now` (unix seconds) — keeps "2h ago" correct under clock skew. */
  now: number;
}> = ({ event, first, now }) => (
  <View style={[styles.row, !first && styles.rowDivider]}>
    <BublTokenGlyph size={34} color={BUBL_KIND_COLOR[event.event]} />
    <View style={styles.rowBody}>
      <Text style={styles.rowTitle} numberOfLines={1}>
        {BUBL_KIND_LABEL[event.event]}
      </Text>
      <Text style={styles.rowSub} numberOfLines={1}>
        {detailFor(event)}
      </Text>
    </View>
    <View style={styles.rowRight}>
      <View style={styles.amountRow}>
        <Text style={styles.amount}>
          +{formatBublDisplay(event.amount_display)}
        </Text>
        <Text style={styles.amountUnit}>{BUBL_SYMBOL}</Text>
      </View>
      <Text style={styles.rowTime}>{formatRelativeTime(event.at, now)}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['3xl'],
    paddingHorizontal: spacing.lg,
  },
  unavailableTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.text_primary,
    marginTop: spacing.lg,
  },
  unavailableBody: {
    fontSize: typography.size.sm,
    color: colors.text_secondary,
    textAlign: 'center',
    lineHeight: typography.lineHeight.relaxed,
    marginTop: spacing.sm,
  },
  retry: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.base,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  retryPressed: {
    opacity: 0.7,
  },
  retryText: {
    color: colors.primary,
    fontWeight: typography.weight.semibold,
    fontSize: typography.size.md,
  },
  hero: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: spacing.md,
  },
  heroAmount: {
    fontSize: typography.size['4xl'],
    fontWeight: typography.weight.bold,
    color: colors.text_primary,
  },
  heroUnit: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.text_secondary,
    marginLeft: spacing.sm,
  },
  heroCaption: {
    fontSize: typography.size.sm,
    color: colors.text_tertiary,
    marginTop: spacing.xxs,
  },
  heroStreak: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.primary,
    marginTop: spacing.xs,
  },
  sectionTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.text_primary,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  panel: {
    backgroundColor: colors.bg_dark,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  ledger: {
    backgroundColor: colors.bg_dark,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
  },
  emptyLedger: {
    backgroundColor: colors.bg_dark,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xl,
  },
  emptyText: {
    fontSize: typography.size.sm,
    color: colors.text_tertiary,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
    color: colors.text_primary,
  },
  rowSub: {
    fontSize: typography.size.xs,
    color: colors.text_tertiary,
    marginTop: 2,
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  amount: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: colors.success,
  },
  amountUnit: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    color: colors.success,
    marginLeft: 3,
    opacity: 0.8,
  },
  rowTime: {
    fontSize: typography.size.xs,
    color: colors.text_tertiary,
    marginTop: 2,
  },
  claimBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    borderRadius: borderRadius.base,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 92,
    minHeight: 30,
  },
  claimBtnBusy: {
    opacity: 0.7,
  },
  claimBtnText: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    color: colors.bg_darkest,
  },
  doneChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  doneChipText: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    color: colors.success,
  },
  partnerCount: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.text_primary,
  },
  partnerCap: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.text_tertiary,
  },
  loadMore: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.base,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
  },
  loadMoreText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.primary,
  },
});

export default BublRewardsScreen;
