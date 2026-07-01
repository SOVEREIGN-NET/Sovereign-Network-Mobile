/**
 * ReleaseNotifyCard — the "be first to know" opt-in on the Bubl tab.
 *
 * A compact card under the BuBL mini-wallet: the member taps the CTA to
 * subscribe their canonical DID to release announcements (open endpoint,
 * see `NotificationsService`). The opted-in state is remembered locally
 * so the card returns as a calm confirmation — with an undo — rather
 * than re-pitching on every visit.
 *
 * The entire card can be dismissed via a close button; the dismiss
 * preference is persisted so it stays gone across launches.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { borderRadius, colors, spacing, typography } from '../../../theme';
import { usePersistedState } from '../../../hooks/usePersistedState';
import {
  RELEASE_SUBSCRIBED_DID_KEY,
  subscribeToReleases,
  unsubscribeFromReleases,
} from '../../../services/NotificationsService';

/** Persisted key for the "user dismissed this card" flag. */
const RELEASE_DISMISSED_KEY = 'bubl.releaseNotify.dismissed';

/**
 * PingGlyph — a radar-ping mark: a filled core with two emanating
 * rings. Drawn from Views (no SVG) to sit consistently next to the
 * BuBL token glyph on this surface.
 */
const PingGlyph: React.FC<{ size?: number; color?: string }> = ({
  size = 34,
  color = colors.primary,
}) => {
  const core = size * 0.3;
  const ring = size * 0.62;
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1.5,
          borderColor: color,
          opacity: 0.3,
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: ring,
          height: ring,
          borderRadius: ring / 2,
          borderWidth: 1.5,
          borderColor: color,
          opacity: 0.6,
        }}
      />
      <View
        style={{
          width: core,
          height: core,
          borderRadius: core / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
};

type Phase = 'idle' | 'busy';

export interface ReleaseNotifyCardProps {
  /** Caller's canonical chain DID (`did:zhtp:…`). Undefined if not
   *  signed in — the CTA then prompts to sign in. */
  did?: string;
}

export const ReleaseNotifyCard: React.FC<ReleaseNotifyCardProps> = ({ did }) => {
  // The DID this device has opted in with. Persisted so the card stays
  // confirmed across launches, and keyed by DID so switching identity
  // correctly re-pitches for the new one.
  const [subscribedDid, setSubscribedDid] = usePersistedState<string | null>(
    RELEASE_SUBSCRIBED_DID_KEY,
    null,
  );
  // User may dismiss the card entirely. Once dismissed it stays gone
  // until they opt in from elsewhere (the full rewards screen or an
  // OS-level notification prompt).
  const [dismissed, setDismissed] = usePersistedState<boolean>(
    RELEASE_DISMISSED_KEY,
    false,
  );
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);

  const isSubscribed = !!did && subscribedDid === did;
  const busy = phase === 'busy';

  const onSubscribe = async () => {
    if (!did || busy) return;
    setPhase('busy');
    setError(null);
    try {
      await subscribeToReleases(did);
      setSubscribedDid(did);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setPhase('idle');
    }
  };

  const onUnsubscribe = async () => {
    if (!did || busy) return;
    setPhase('busy');
    setError(null);
    try {
      await unsubscribeFromReleases(did);
      setSubscribedDid(null);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setPhase('idle');
    }
  };

  // ── Fully dismissed ────────────────────────────────────────────────
  if (dismissed) {
    return null;
  }

  // ── Confirmed state ────────────────────────────────────────────────
  if (isSubscribed) {
    return (
      <View style={[styles.card, styles.cardConfirmed]}>
        <View style={styles.row}>
          <PingGlyph size={32} color={colors.success} />
          <View style={styles.body}>
            <Text style={styles.titleConfirmed}>You're on the list ✦</Text>
            <Text style={styles.text}>
              We'll ping you the moment the next release ships.
            </Text>
          </View>
        </View>
        <Pressable
          onPress={onUnsubscribe}
          disabled={busy}
          hitSlop={8}
          style={styles.undo}
          accessibilityRole="button"
          accessibilityLabel="Stop release notifications"
        >
          <Text style={styles.undoText}>
            {busy ? 'Removing…' : 'Leave the list'}
          </Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );
  }

  // ── Pitch state ────────────────────────────────────────────────────
  return (
    <View style={styles.card}>
      {/* Close button — top-right corner */}
      <Pressable
        onPress={() => setDismissed(true)}
        hitSlop={8}
        style={styles.dismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      >
        <Text style={styles.dismissText}>✕</Text>
      </Pressable>

      <View style={styles.row}>
        <PingGlyph size={34} />
        <View style={styles.body}>
          <Text style={styles.title}>Don't miss the next drop</Text>
          <Text style={styles.text}>
            New features hit the Sovereign Network all the time. Be first
            in line — get a ping the moment the next one lands.
          </Text>
        </View>
      </View>
      <Pressable
        onPress={onSubscribe}
        disabled={busy || !did}
        style={({ pressed }) => [
          styles.cta,
          (busy || !did) && styles.ctaDisabled,
          pressed && styles.ctaPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Get notified about future releases"
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.bg_darkest} />
        ) : (
          <Text style={styles.ctaText}>
            {did ? 'Count me in' : 'Sign in to get alerts'}
          </Text>
        )}
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
};

/**
 * A user-readable message for a failed subscribe/unsubscribe. The QUIC
 * layer throws `QuicError` carrying the server's `{ error: "…" }` body
 * — surface that text when present, otherwise a generic retryable line.
 */
function messageFor(e: unknown): string {
  const body = (e as { body?: unknown })?.body;
  if (body && typeof body === 'object' && 'error' in body) {
    const m = (body as { error?: unknown }).error;
    if (typeof m === 'string' && m.length > 0) return m;
  }
  if (e instanceof Error && e.message) return e.message;
  return 'Could not reach the network. Try again.';
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.bg_dark,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardConfirmed: {
    borderColor: colors.success,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  body: {
    flex: 1,
  },
  title: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text_primary,
  },
  titleConfirmed: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.success,
  },
  text: {
    fontSize: typography.size.xs,
    color: colors.text_secondary,
    marginTop: 2,
    lineHeight: typography.lineHeight.tight,
  },
  cta: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.base,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
  },
  ctaDisabled: {
    opacity: 0.5,
  },
  ctaPressed: {
    opacity: 0.85,
  },
  ctaText: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.bg_darkest,
  },
  undo: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    paddingVertical: spacing.xxs,
  },
  undoText: {
    fontSize: typography.size.xs,
    color: colors.text_tertiary,
    textDecorationLine: 'underline',
  },
  dismiss: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    zIndex: 1,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.bg_darkest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissText: {
    fontSize: typography.size.sm,
    color: colors.text_secondary,
    lineHeight: 16,
  },
  error: {
    marginTop: spacing.sm,
    fontSize: typography.size.xs,
    color: colors.error,
  },
});
