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
  getContact,
  getMessages,
  markRead,
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
  LockBadge,
} from './messagingShared';

interface Props {
  navigation: any;
  route: { params: { did: string } };
}

const ChatScreen: React.FC<Props> = ({ navigation, route }) => {
  const { did } = route.params;
  const [contact, setContact] = useState<Contact | undefined>(() =>
    getContact(did),
  );
  const [messages, setMessages] = useState<LocalMessage[]>(() =>
    getMessages(did),
  );
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<LocalMessage>>(null);

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

  useLayoutEffect(() => {
    navigation.setOptions?.({ headerShown: false });
  }, [navigation]);

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

  // FlatList is rendered inverted so we feed it newest-first. Memoize
  // the slice so React doesn't reprocess unchanged history each tick.
  const inverted = useMemo(() => [...messages].reverse(), [messages]);

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
          <Text style={styles.headerName} numberOfLines={1}>
            {contact.display_name}
          </Text>
          <View style={styles.headerSubRow}>
            <LockBadge />
            <Text style={styles.headerSub}>
              {contact.online ? 'Online · post-quantum' : `@${contact.username}`}
            </Text>
          </View>
        </View>
        <View style={styles.backBtn} />
      </View>

      {/* Message list */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <FlatList
          ref={listRef}
          data={inverted}
          inverted
          keyExtractor={m => m.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item, index }) => (
            <Bubble
              message={item}
              showTime={shouldShowTime(item, inverted[index + 1])}
            />
          )}
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

// Show the bubble timestamp when the previous message was over five
// minutes ago (or there is no previous one). `prev` here means the
// chronologically older neighbour, which in an inverted list is at a
// HIGHER index than the current row.
function shouldShowTime(
  current: LocalMessage,
  prev: LocalMessage | undefined,
): boolean {
  if (!prev) return true;
  return current.timestamp - prev.timestamp > 300;
}

interface BubbleProps {
  message: LocalMessage;
  showTime: boolean;
}

const Bubble: React.FC<BubbleProps> = ({ message, showTime }) => {
  const isMe = message.direction === 'sent';
  const isText = message.content_type === MessageContentType.Text;
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
        {showTime && (
          <Text
            style={[
              styles.bubbleTime,
              isMe ? styles.bubbleTimeMe : styles.bubbleTimeThem,
            ]}
          >
            {formatBubbleTime(message.timestamp)}
            {isMe && message.status === 'read' ? ' · Read' : ''}
          </Text>
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
  headerName: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text_primary,
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
});

export default ChatScreen;
