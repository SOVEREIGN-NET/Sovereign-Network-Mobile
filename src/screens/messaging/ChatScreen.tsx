/**
 * ChatScreen — single conversation detail.
 *
 * Renders an inverted FlatList of decrypted bubbles plus a sticky
 * compose row. Posting goes through `sendTextMessage`, which does the
 * envelope seal/sign/encode and (when the wire path is enabled) the
 * `/msg/send` POST. The store is the source of truth — the screen
 * subscribes and re-renders whenever new messages land.
 */

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  type AppStateStatus,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { borderRadius, colors, spacing, typography } from '../../theme';
import {
  conversationConnected,
  deleteConversation,
  getContact,
  getMessages,
  markRead,
  reconnectSession,
  resendMessage,
  sendTextMessage,
  subscribe,
} from '../../services/MessagingService';
import {
  type Contact,
  type LocalMessage,
  MessageContentType,
} from '../../types/messaging';
import {
  Avatar,
  formatBubbleTime,
  formatDateSeparator,
  LockBadge,
} from './messagingShared';
import { fireConversation } from '../../services/RewardsService';
import { useAuth } from '../../hooks/useAuth';

interface Props {
  navigation: any;
  route: { params: { did: string } };
}

// A row in the chat list: either a decrypted message or a date
// separator chip inserted above the first message of each day.
type ChatRow =
  | { kind: 'date'; id: string; timestamp: number }
  | { kind: 'msg'; id: string; message: LocalMessage };

const ChatScreen: React.FC<Props> = ({ navigation, route }) => {
  const { did } = route.params;
  const { currentIdentity } = useAuth();
  const [contact, setContact] = useState<Contact | undefined>(() =>
    getContact(did),
  );
  const [messages, setMessages] = useState<LocalMessage[]>(() =>
    getMessages(did),
  );
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const listRef = useRef<FlatList<ChatRow>>(null);

  // Live receive-health for this thread. `conversationConnected` is
  // false once an inbound message has failed to decrypt and stays
  // false until a later one succeeds. Keyed on `messages` so it
  // recomputes whenever the store changes — every decrypt (success
  // or failure) appends a row.
  const connected = useMemo(
    () => conversationConnected(did),
    [did, messages],
  );

  // Keep the local view bound to the store. `markRead` is fire-and-forget —
  // server read receipts will be a separate flow once the wire path lands.
  useEffect(() => {
    markRead(did);
    const unsub = subscribe(() => {
      setMessages(getMessages(did));
      setContact(getContact(did));
    });
    return () => {
      unsub();
    };
  }, [did]);

  // Foreground refresh. When the app comes back to the foreground with
  // ChatScreen already on screen, the store may have appended messages
  // drained from the deposit store while we were suspended — but a
  // store `notify()` that fires during the AppState transition can be
  // batched in a way that leaves our local `messages` state pointing
  // at the pre-suspend snapshot. Pulling the latest snapshot once on
  // 'active' is cheap (it's just a Map read) and guarantees the chat
  // reflects everything that landed during the background window.
  // Also re-mark-read since the user is plainly looking at the thread.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next !== 'active') return;
      setMessages(getMessages(did));
      setContact(getContact(did));
      markRead(did);
    });
    return () => sub.remove();
  }, [did]);

  // On opening a chat, if its receive path is already broken (a
  // desync happened while the screen was elsewhere), kick off a
  // reconnect so the user doesn't have to find the banner. Fires
  // once per open — an in-session desync is handled by the ingest
  // layer's own recovery, so this doesn't double up.
  useEffect(() => {
    if (conversationConnected(did)) return;
    setReconnecting(true);
    reconnectSession(did)
      .catch(e => console.warn('[ChatScreen] auto-reconnect failed:', e))
      .finally(() => setReconnecting(false));
  }, [did]);

  useLayoutEffect(() => {
    navigation.setOptions?.({ headerShown: false });
  }, [navigation]);

  // BUBL new-partner reward — opening a chat reports the conversation.
  // Fire-and-forget; the service guards it to once per peer per launch
  // and the server dedups by ISO week and caps at 5 partners/week.
  useEffect(() => {
    void fireConversation(currentIdentity?.did, did);
  }, [currentIdentity?.did, did]);

  const onSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput('');
    try {
      await sendTextMessage(did, text);
      // Inverted list — newest at index 0, so the screen auto-scrolls
      // by virtue of the new row arriving at offset 0.
    } finally {
      setSending(false);
    }
  };

  // Resend a previously-failed outbound message. The service re-seals
  // against the current send session and POSTs again, updating the
  // local row's status in place — the bubble re-renders through
  // 'pending' → 'sent'/'delivered' (or back to 'failed').
  const handleResend = (messageId: string) => {
    void resendMessage(did, messageId).catch(e => {
      const m = e instanceof Error ? e.message : String(e);
      console.warn('[ChatScreen] resend failed:', m);
      Alert.alert('Resend failed', m);
    });
  };

  const peerName = contact?.display_name ?? 'this contact';

  // Reconnect — drop the local session and ship a fresh KeyExchange,
  // keeping the message history. The peer adopts it on receipt.
  const doReconnect = async () => {
    if (reconnecting) return;
    setReconnecting(true);
    try {
      await reconnectSession(did);
      Alert.alert(
        'Handshake sent',
        `A fresh secure session was sent to ${peerName}.\n\n` +
          'They must have the app open to receive it. New messages will ' +
          'decrypt once they reply — earlier undelivered messages can’t ' +
          'be recovered.',
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[ChatScreen] reconnect failed:', e);
      Alert.alert('Reconnect failed', `Could not send the handshake.\n\n${msg}`);
    } finally {
      setReconnecting(false);
    }
  };

  // Delete — wipe the whole conversation (history + session). The
  // thread is gone; re-look the peer up in NewChat to start fresh.
  const doDelete = () => {
    deleteConversation(did);
    navigation.goBack();
  };

  // The ⟳ header action: offer Reconnect (salvage) or Delete (nuke).
  const onSessionMenu = () => {
    if (reconnecting) return;
    Alert.alert(
      'Conversation out of sync?',
      'Reconnect re-establishes the secure session and keeps your ' +
        'history. Delete wipes the whole conversation so you can start a ' +
        'fresh one — neither recovers messages already lost.',
      [
        { text: 'Reconnect', onPress: () => void doReconnect() },
        {
          text: 'Delete conversation',
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              'Delete conversation?',
              `This removes the entire conversation with ${peerName} from ` +
                'this device. Look them up again in New Chat to start over.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: doDelete,
                },
              ],
            ),
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  // Build the rendered rows: sort chronologically, insert a date
  // separator above the first message of each day, then reverse for
  // the inverted FlatList (which renders index 0 at the bottom).
  const rows = useMemo<ChatRow[]>(() => {
    const chrono = [...messages].sort(
      (a, b) => a.timestamp - b.timestamp || a.sequence - b.sequence,
    );
    const out: ChatRow[] = [];
    let lastDay = '';
    for (const m of chrono) {
      const d = new Date(m.timestamp * 1000);
      const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (dayKey !== lastDay) {
        out.push({
          kind: 'date',
          id: `date-${dayKey}`,
          timestamp: m.timestamp,
        });
        lastDay = dayKey;
      }
      out.push({ kind: 'msg', id: m.id, message: m });
    }
    return out.reverse();
  }, [messages]);

  if (!contact) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.missing}>
          <Text style={styles.missingTitle}>Conversation unavailable</Text>
          <Text style={styles.missingBody}>
            This contact isn’t in your address book yet.
          </Text>
          <TouchableOpacity
            style={styles.missingBack}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.missingBackText}>Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={12}
        >
          <Text style={styles.backArrow}>‹</Text>
        </Pressable>
        <Avatar
          name={contact.display_name}
          online={contact.online}
          size={36}
        />
        <View style={styles.headerCenter}>
          <View style={styles.headerNameRow}>
            <Text style={styles.headerName} numberOfLines={1}>
              {contact.display_name}
            </Text>
            {/* Secure-session health: green when the receive path is
                working, amber while it's desynced / reconnecting. */}
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: connected
                    ? colors.success
                    : colors.warning,
                },
              ]}
            />
          </View>
          <View style={styles.headerSubRow}>
            <LockBadge />
            <Text style={styles.headerSub}>
              {reconnecting
                ? 'Reconnecting…'
                : connected
                  ? contact.online
                    ? 'Online · post-quantum'
                    : `@${contact.username}`
                  : 'Out of sync'}
            </Text>
          </View>
        </View>
        {/* Session menu — always available. Reconnect (re-handshake,
            keep history) or Delete (wipe the thread and start over). */}
        <Pressable
          onPress={onSessionMenu}
          style={styles.headerReconnectBtn}
          disabled={reconnecting}
          hitSlop={12}
        >
          <Text
            style={[
              styles.headerReconnectIcon,
              reconnecting && styles.headerReconnectBusy,
            ]}
          >
            ⟳
          </Text>
        </Pressable>
      </View>

      {/* Desync banner — the receive path is currently broken. Auto-
          reconnect is already running; the button is a manual retry.
          Hides once a message decrypts again. */}
      {!connected && (
        <View style={styles.reconnectBanner}>
          <Text style={styles.reconnectBannerText}>
            Some messages couldn’t be decrypted — the secure session is
            out of sync.
          </Text>
          <TouchableOpacity
            style={[
              styles.reconnectBtn,
              reconnecting && styles.reconnectBtnBusy,
            ]}
            onPress={() => void doReconnect()}
            disabled={reconnecting}
          >
            <Text style={styles.reconnectBtnText}>
              {reconnecting ? 'Reconnecting…' : 'Reconnect'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Message list */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <FlatList
          ref={listRef}
          data={rows}
          inverted
          keyExtractor={r => r.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) =>
            item.kind === 'date' ? (
              <DateSeparator timestamp={item.timestamp} />
            ) : (
              <Bubble message={item.message} onResend={handleResend} />
            )
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                Start the conversation
              </Text>
              <Text style={styles.emptyBody}>
                The first message you send will create a Kyber1024 session
                with @{contact.username}.
              </Text>
            </View>
          }
        />

        {/* Compose row */}
        <View style={styles.composeWrap}>
          <View style={styles.composeRow}>
            <TextInput
              style={styles.composeInput}
              placeholder="Encrypted message"
              placeholderTextColor={colors.text_placeholder}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={4000}
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                (!input.trim() || sending) && styles.sendBtnDisabled,
              ]}
              onPress={onSend}
              disabled={!input.trim() || sending}
            >
              <Text style={styles.sendBtnText}>↑</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// Centered day chip between messages from different calendar days.
const DateSeparator: React.FC<{ timestamp: number }> = ({ timestamp }) => (
  <View style={styles.dateSepRow}>
    <Text style={styles.dateSepText}>
      {formatDateSeparator(timestamp)}
    </Text>
  </View>
);

interface BubbleProps {
  message: LocalMessage;
  /** Called when the user taps "Resend" on a failed-to-send bubble. */
  onResend?: (messageId: string) => void;
}

/**
 * Short tag rendered next to the bubble's timestamp for our own
 * outbound messages — communicates delivery state at a glance:
 *   pending   →  sending…   (the POST is in flight or queued locally)
 *   failed    →  not sent   (POST threw — paired with a Resend button)
 *   sent      →  ✓          (server accepted, peer not yet confirmed)
 *   delivered →  ✓          (server routed to the peer's stream)
 *   read      →  ✓✓         (peer sent back a ReadReceipt — end-to-end)
 */
function statusBadge(message: LocalMessage): string {
  if (message.direction !== 'sent') return '';
  switch (message.status) {
    case 'failed':
      return ' · not sent';
    case 'pending':
      return ' · sending…';
    case 'sent':
    case 'delivered':
      return '  ✓';
    case 'read':
      return '  ✓✓';
    default:
      return '';
  }
}

const Bubble: React.FC<BubbleProps> = ({ message, onResend }) => {
  const isMe = message.direction === 'sent';
  const isText = message.content_type === MessageContentType.Text;
  const canResend = isMe && message.status === 'failed' && !!onResend;

  // Undecryptable placeholder — a message arrived but its keys never
  // did. Render as a centered system note, not a left/right bubble.
  if (message.content_type === MessageContentType.Undecryptable) {
    return (
      <View style={styles.sysNoteRow}>
        <Text style={styles.sysNoteText}>
          🔒 Couldn’t decrypt a message — its secure session keys never
          reached this device.
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.bubbleRow,
        isMe ? styles.bubbleRowMe : styles.bubbleRowThem,
      ]}
    >
      <View
        style={[
          styles.bubble,
          isMe ? styles.bubbleMe : styles.bubbleThem,
        ]}
      >
        <Text
          style={[
            styles.bubbleText,
            isMe ? styles.bubbleTextMe : styles.bubbleTextThem,
          ]}
        >
          {isText ? message.body : `[${message.content_type}]`}
        </Text>
        <Text
          style={[
            styles.bubbleTime,
            isMe ? styles.bubbleTimeMe : styles.bubbleTimeThem,
          ]}
        >
          {formatBubbleTime(message.timestamp)}
          {statusBadge(message)}
        </Text>
        {canResend && (
          <Pressable
            onPress={() => onResend!(message.id)}
            hitSlop={6}
            style={styles.resendBtn}
            accessibilityRole="button"
            accessibilityLabel="Resend message"
          >
            <Text style={styles.resendText}>↻ Resend</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg_darkest,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg_darkest,
    gap: spacing.sm,
  },
  backBtn: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: 28,
    color: colors.primary,
    marginTop: -4,
  },
  headerCenter: {
    flex: 1,
  },
  headerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerName: {
    flexShrink: 1,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text_primary,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  headerSub: {
    fontSize: typography.size.xs,
    color: colors.text_secondary,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    flexGrow: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    transform: [{ scaleY: -1 }], // visually upright inside an inverted list
  },
  emptyTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.text_primary,
    marginBottom: spacing.sm,
  },
  emptyBody: {
    fontSize: typography.size.sm,
    color: colors.text_secondary,
    textAlign: 'center',
    lineHeight: typography.lineHeight.relaxed,
  },
  bubbleRow: {
    marginVertical: spacing.xxs,
    flexDirection: 'row',
  },
  bubbleRowMe: {
    justifyContent: 'flex-end',
  },
  bubbleRowThem: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  bubbleMe: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: borderRadius.sm,
  },
  bubbleThem: {
    backgroundColor: colors.bg_dark,
    borderBottomLeftRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleText: {
    fontSize: typography.size.md,
    lineHeight: typography.lineHeight.relaxed,
  },
  bubbleTextMe: {
    color: colors.bg_darkest,
  },
  bubbleTextThem: {
    color: colors.text_primary,
  },
  bubbleTime: {
    fontSize: typography.size.xs,
    marginTop: spacing.xxs,
  },
  bubbleTimeMe: {
    color: colors.bg_darkest,
    opacity: 0.7,
    textAlign: 'right',
  },
  bubbleTimeThem: {
    color: colors.text_tertiary,
  },
  resendBtn: {
    alignSelf: 'flex-end',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    backgroundColor: colors.bg_darkest,
    borderWidth: 1,
    borderColor: colors.bg_darkest,
    opacity: 0.85,
  },
  resendText: {
    color: colors.bg_darkest,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
  },
  composeWrap: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg_darkest,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  composeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  composeInput: {
    flex: 1,
    backgroundColor: colors.bg_dark,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    color: colors.text_primary,
    fontSize: typography.size.md,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  sendBtnText: {
    color: colors.bg_darkest,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.semibold,
    marginTop: -2,
  },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  missingTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.text_primary,
    marginBottom: spacing.sm,
  },
  missingBody: {
    fontSize: typography.size.sm,
    color: colors.text_secondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  missingBack: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.base,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  missingBackText: {
    color: colors.bg_darkest,
    fontWeight: typography.weight.semibold,
  },
  headerReconnectBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerReconnectIcon: {
    fontSize: typography.size.xl,
    color: colors.primary,
  },
  headerReconnectBusy: {
    opacity: 0.4,
  },
  reconnectBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bg_dark,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  reconnectBannerText: {
    flex: 1,
    fontSize: typography.size.xs,
    color: colors.text_secondary,
    lineHeight: typography.lineHeight.relaxed,
  },
  reconnectBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.base,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  reconnectBtnBusy: {
    opacity: 0.6,
  },
  reconnectBtnText: {
    color: colors.bg_darkest,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
  },
  dateSepRow: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  dateSepText: {
    fontSize: typography.size.xs,
    color: colors.text_secondary,
    backgroundColor: colors.bg_dark,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xxs,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  sysNoteRow: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  sysNoteText: {
    fontSize: typography.size.xs,
    color: colors.text_tertiary,
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: typography.lineHeight.relaxed,
  },
});

export default ChatScreen;
