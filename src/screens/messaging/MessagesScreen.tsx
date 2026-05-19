/**
 * MessagesScreen — inbox / conversation list.
 *
 * Phase 1 reads from the in-memory store in MessagingMockData. Tap a
 * row to open the chat detail; tap the "+" header to start a new
 * conversation. Once the native messaging FFI lands, only the data
 * source changes — the layout stays.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  type AppStateStatus,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ScreenLayout } from '../../components';
import { usePersistedState } from '../../hooks/usePersistedState';
import { colors, spacing, typography, borderRadius } from '../../theme';
import {
  getConversations,
  ingestEnvelopes,
  probeMessagingWire,
  receivePending,
  subscribe,
  type WireProbeResult,
} from '../../services/MessagingService';
import { publishKyberKey } from '../../services/KyberKeyService';
import { useAuth } from '../../hooks/useAuth';
import type { Conversation } from '../../types/messaging';
import {
  Avatar,
  EyeIcon,
  formatRelativeTime,
  previewBody,
  redactedName,
  redactedPreview,
  RedactionBars,
} from './messagingShared';

interface Props {
  navigation: any;
}

const MessagesScreen: React.FC<Props> = ({ navigation }) => {
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    getConversations(),
  );
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // User preference, persisted. Defaults ON: encrypted messaging that
  // shouts contact names from the inbox is the wrong default.
  const [privacyPref, setPrivacyPref] = usePersistedState(
    'messaging.privacyMode',
    true,
  );
  // Independent override that engages while the app is leaving the
  // foreground, so the iOS/Android app-switcher snapshot can never
  // capture content even if the user has turned the persistent toggle
  // off. Snaps back to `false` on full return — privacy still respects
  // the persisted preference after that.
  const [forcedPrivacy, setForcedPrivacy] = useState(false);
  const privacyOn = privacyPref || forcedPrivacy;

  // Live-bind the inbox to the store so optimistic sends + future
  // server-pushed messages flow into the list without manual refresh.
  useEffect(() => {
    const unsub = subscribe(() => setConversations(getConversations()));
    return () => {
      unsub();
    };
  }, []);

  // The 'inactive' phase fires *before* the OS snapshots the screen for
  // the app switcher, so we set the forced flag synchronously on that
  // event and clear it only when the app is fully active again.
  const appState = useRef(AppState.currentState);
  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (next === 'active') {
        setForcedPrivacy(false);
      } else {
        setForcedPrivacy(true);
      }
      appState.current = next;
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);

  // `setSelfDid` + the always-on receive poller live in AuthContext so
  // they keep running while the user is in ChatScreen / elsewhere.
  // Here we only use `currentIdentity` for the wire probe + initial
  // pull-to-refresh.
  const { currentIdentity } = useAuth();

  // One-shot wire probe — calls /msg/session/init against the node we
  // bootstrapped and surfaces the status as a banner. Tells you in one
  // glance whether the messaging backend is deployed on the connected
  // node before you start trying to send. Re-runs on tap.
  const [probe, setProbe] = useState<WireProbeResult | null>(null);
  const [probing, setProbing] = useState(false);
  const runProbe = useCallback(async () => {
    setProbing(true);
    try {
      const r = await probeMessagingWire(currentIdentity?.did);
      setProbe(r);
    } finally {
      setProbing(false);
    }
  }, [currentIdentity?.did]);
  useEffect(() => {
    if (currentIdentity?.did) runProbe();
  }, [currentIdentity?.did, runProbe]);

  // Single source of truth for "fetch + decrypt + ingest one batch of
  // envelopes from /msg/receive". Used by both pull-to-refresh and the
  // foreground polling loop below; the body is identical, only the
  // spinner state differs. Errors swallowed — connectivity blips
  // shouldn't surface as user-visible noise on the inbox.
  const fetchInbound = useCallback(async (): Promise<void> => {
    try {
      const r = await receivePending();
      if (r.count > 0) {
        await ingestEnvelopes(r.messages);
        setConversations(getConversations());
      }
    } catch (e) {
      console.warn('[MessagesScreen] receive poll failed:', e);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchInbound();
    setConversations(getConversations());
    setRefreshing(false);
  }, [fetchInbound]);

  // Polling is owned by AuthContext (always-on, identity-driven). We
  // keep the pull-to-refresh + the store subscription so the list
  // reacts to incoming envelopes the moment ingest appends them.

  const filtered = query
    ? conversations.filter(c => {
        const q = query.toLowerCase();
        return (
          c.contact.username.toLowerCase().includes(q) ||
          c.contact.display_name.toLowerCase().includes(q)
        );
      })
    : conversations;

  const totalUnread = conversations.reduce((n, c) => n + c.unread_count, 0);

  return (
    <ScreenLayout
      paddingTop={spacing.md}
      paddingHorizontal={0}
      safeAreaEdges={['top', 'bottom']}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.header}>
        <View style={styles.headerTitleBlock}>
          <Text style={styles.title}>Bubl Social</Text>
          <Text style={styles.subtitle}>
            {privacyOn
              ? 'Privacy on · contacts hidden'
              : totalUnread > 0
                ? `${totalUnread} unread`
                : 'Post-quantum encrypted'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setPrivacyPref(!privacyPref)}
            accessibilityRole="switch"
            accessibilityState={{ checked: privacyOn }}
            accessibilityLabel={
              privacyOn ? 'Reveal contact names' : 'Hide contact names'
            }
            hitSlop={8}
          >
            <EyeIcon off={privacyOn} color={colors.text_primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.newButton}
            onPress={() => navigation.navigate('NewChat')}
            accessibilityLabel="Start new conversation"
          >
            <Text style={styles.newButtonText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          placeholder="Search conversations"
          placeholderTextColor={colors.text_placeholder}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <ProbeBanner probe={probe} probing={probing} onTap={runProbe} />

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No conversations</Text>
          <Text style={styles.emptyBody}>
            Start a new chat to send your first end-to-end encrypted
            message.
          </Text>
          <TouchableOpacity
            style={styles.emptyCta}
            onPress={() => navigation.navigate('NewChat')}
          >
            <Text style={styles.emptyCtaText}>New message</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View>
          {filtered.map(c => (
            <ConversationRow
              key={c.contact.did}
              conversation={c}
              privacyOn={privacyOn}
              onPress={() =>
                navigation.navigate('Chat', { did: c.contact.did })
              }
            />
          ))}
        </View>
      )}
    </ScreenLayout>
  );
};

interface ProbeBannerProps {
  probe: WireProbeResult | null;
  probing: boolean;
  onTap: () => void;
}

const ProbeBanner: React.FC<ProbeBannerProps> = ({ probe, probing, onTap }) => {
  let label: string;
  let tone: 'pending' | 'ok' | 'fail';
  if (probing && !probe) {
    label = 'Probing /msg/session/init…';
    tone = 'pending';
  } else if (!probe) {
    label = 'Tap to probe wire';
    tone = 'pending';
  } else if (probe.ok) {
    label = `Wire OK · ${probe.latencyMs} ms · keys returned`;
    tone = 'ok';
  } else {
    const code =
      probe.status !== undefined ? `${probe.status}` : probe.code ?? 'err';
    label = `Wire FAIL · ${code} · ${probe.message.slice(0, 80)}`;
    tone = 'fail';
  }
  return (
    <Pressable
      onPress={onTap}
      disabled={probing}
      style={({ pressed }) => [
        styles.probe,
        tone === 'ok' && styles.probeOk,
        tone === 'fail' && styles.probeFail,
        pressed && styles.probePressed,
      ]}
    >
      <Text style={styles.probeText} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
};

interface RowProps {
  conversation: Conversation;
  privacyOn: boolean;
  onPress: () => void;
}

const ConversationRow: React.FC<RowProps> = ({
  conversation,
  privacyOn,
  onPress,
}) => {
  const { contact, last_message, unread_count } = conversation;
  const unread = unread_count > 0;

  // The display name in privacy mode is the truncated DID — recognisable
  // to the user (their contacts hash to stable IDs they'll learn) but
  // useless to anyone glancing at the screen.
  const renderedName = privacyOn
    ? redactedName(contact.did)
    : contact.display_name;
  const renderedSubtitle = !last_message
    ? privacyOn
      ? redactedName(contact.did)
      : `@${contact.username}`
    : null;

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
    >
      <Avatar
        name={contact.display_name}
        online={contact.online}
        redacted={privacyOn}
      />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text
            style={[
              styles.rowName,
              unread && styles.rowNameUnread,
              privacyOn && styles.rowNamePrivate,
            ]}
            numberOfLines={1}
          >
            {renderedName}
          </Text>
          <Text style={styles.rowTime}>
            {last_message
              ? formatRelativeTime(last_message.timestamp)
              : ''}
          </Text>
        </View>
        <View style={styles.rowBottom}>
          {last_message ? (
            privacyOn ? (
              <View style={styles.rowPrivatePreview}>
                <RedactionBars seed={contact.did} />
                <Text style={styles.rowPreviewMeta} numberOfLines={1}>
                  {redactedPreview(last_message, unread_count)}
                </Text>
              </View>
            ) : (
              <Text
                style={[styles.rowPreview, unread && styles.rowPreviewUnread]}
                numberOfLines={1}
              >
                {`${last_message.direction === 'sent' ? 'You: ' : ''}${previewBody(last_message)}`}
              </Text>
            )
          ) : (
            <Text style={styles.rowPreview} numberOfLines={1}>
              {renderedSubtitle ?? ''}
            </Text>
          )}
          {unread && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unread_count}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitleBlock: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: colors.bg_dark,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: typography.size['2xl'],
    fontWeight: typography.weight.semibold,
    color: colors.text_primary,
  },
  subtitle: {
    fontSize: typography.size.sm,
    color: colors.text_secondary,
    marginTop: spacing.xxs,
  },
  newButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newButtonText: {
    color: colors.bg_darkest,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.semibold,
    marginTop: -2,
  },
  searchWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  search: {
    backgroundColor: colors.bg_dark,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text_primary,
    fontSize: typography.size.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  probe: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.base,
    backgroundColor: colors.bg_dark,
    borderWidth: 1,
    borderColor: colors.border,
  },
  probeOk: {
    borderColor: colors.success,
    backgroundColor: colors.bg_dark,
  },
  probeFail: {
    borderColor: colors.error,
    backgroundColor: colors.bg_dark,
  },
  probePressed: {
    opacity: 0.7,
  },
  probeText: {
    fontSize: typography.size.xs,
    color: colors.text_secondary,
    fontFamily: 'Menlo',
    letterSpacing: 0.2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  rowPressed: {
    backgroundColor: colors.bg_dark,
  },
  rowBody: {
    flex: 1,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xxs,
  },
  rowName: {
    fontSize: typography.size.md,
    color: colors.text_primary,
    fontWeight: typography.weight.medium,
    flex: 1,
    marginRight: spacing.sm,
  },
  rowNameUnread: {
    fontWeight: typography.weight.semibold,
  },
  rowNamePrivate: {
    fontFamily: 'Menlo',
    fontSize: typography.size.sm,
    color: colors.text_secondary,
    letterSpacing: 0.3,
  },
  rowTime: {
    fontSize: typography.size.xs,
    color: colors.text_tertiary,
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowPreview: {
    flex: 1,
    fontSize: typography.size.sm,
    color: colors.text_secondary,
    marginRight: spacing.sm,
  },
  rowPreviewUnread: {
    color: colors.text_primary,
  },
  rowPrivatePreview: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginRight: spacing.sm,
  },
  rowPreviewMeta: {
    fontSize: typography.size.xs,
    color: colors.text_tertiary,
    letterSpacing: 0.3,
    flex: 1,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: {
    color: colors.bg_darkest,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
  },
  empty: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing['3xl'],
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: typography.size.lg,
    color: colors.text_primary,
    fontWeight: typography.weight.semibold,
    marginBottom: spacing.sm,
  },
  emptyBody: {
    fontSize: typography.size.sm,
    color: colors.text_secondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: typography.lineHeight.relaxed,
  },
  emptyCta: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.base,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  emptyCtaText: {
    color: colors.bg_darkest,
    fontWeight: typography.weight.semibold,
    fontSize: typography.size.md,
  },
});

export default MessagesScreen;
