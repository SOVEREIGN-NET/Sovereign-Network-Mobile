/**
 * NewChatScreen — start a fresh conversation.
 *
 * Flow on submit:
 *   1. POST /api/v1/msg/session/init with `@username` (or a bare DID).
 *   2. Server returns recipient_did + kyber_pk_hex + dilithium_pk_hex.
 *   3. Cache the contact locally so the row renders in the inbox + so
 *      ingest can verify signatures from this peer without re-fetching.
 *   4. Navigate to Chat — the next message send (`sendTextMessage`)
 *      reads the cached pks and calls `initiateSession` + ships a
 *      signed KeyExchange envelope.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ArrowIcon, ScreenLayout } from '../../components';
import { borderRadius, colors, spacing, typography } from '../../theme';
import {
  getContacts,
  sessionInit,
  upsertContact,
} from '../../services/MessagingService';
import type { Contact } from '../../types/messaging';
import { Avatar } from './messagingShared';

interface Props {
  navigation: any;
}

const NewChatScreen: React.FC<Props> = ({ navigation }) => {
  const [username, setUsername] = useState('');
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const allContacts = useMemo(() => getContacts(), []);

  const suggestions = useMemo(() => {
    const q = username.trim().toLowerCase().replace(/^@/, '');
    if (!q) return allContacts;
    return allContacts.filter(
      c =>
        c.username.toLowerCase().includes(q) ||
        c.display_name.toLowerCase().includes(q),
    );
  }, [username, allContacts]);

  const onlineFirst = useMemo(
    () =>
      [...suggestions].sort(
        (a, b) => Number(b.online) - Number(a.online),
      ),
    [suggestions],
  );

  const startChat = (contact: Contact) => {
    // Replace so back goes to the inbox, not the picker.
    navigation.replace('Chat', { did: contact.did });
  };

  /**
   * Build the `recipient` string the server expects. The handler
   * accepts either an `@username` lookup or a bare `did:zhtp:…` —
   * forward DIDs verbatim, and prefix the `@` for everything else
   * so the server takes the username path. Casing is normalised on
   * usernames; DIDs are case-sensitive (hex) so we leave them alone.
   */
  const buildRecipient = (raw: string): string | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('did:zhtp:')) return trimmed;
    const handle = trimmed.replace(/^@+/, '').toLowerCase();
    if (!handle) return null;
    return `@${handle}`;
  };

  const lookup = useCallback(async () => {
    const recipient = buildRecipient(username);
    if (!recipient) return;
    setLooking(true);
    setLookupError(null);
    try {
      const r = await sessionInit(recipient);
      // Cache so the inbox row renders + ingest can verify signatures
      // from this peer without re-fetching the keys.
      upsertContact({
        did: r.recipient_did,
        username: r.recipient_username,
        display_name: r.recipient_username,
        kyber_pk: r.kyber_public_key,
        dilithium_pk: r.dilithium_public_key,
        online: false,
      });
      navigation.replace('Chat', { did: r.recipient_did });
    } catch (e) {
      const err = e as { status?: number; message?: string; body?: unknown };
      if (err.status === 404) {
        setLookupError(
          recipient.startsWith('did:zhtp:')
            ? 'No identity registered for that DID.'
            : `No registered user named ${recipient}.`,
        );
      } else if (err.status === 400) {
        const body =
          typeof err.body === 'string' ? err.body : err.message ?? 'Bad request';
        setLookupError(body);
      } else {
        setLookupError(err.message ?? String(e));
      }
    } finally {
      setLooking(false);
    }
  }, [username, navigation]);

  return (
    <ScreenLayout
      paddingTop={spacing.md}
      paddingHorizontal={0}
      safeAreaEdges={['top', 'bottom']}
    >
      <Pressable
        onPress={() => navigation.goBack()}
        hitSlop={12}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.sm,
        }}
        accessibilityRole="button"
        accessibilityLabel="Messages"
      >
        <ArrowIcon direction="left" size={18} color={colors.primary} />
        <Text style={{ color: colors.primary, fontSize: typography.size.md, fontWeight: typography.weight.medium }}>
          Messages
        </Text>
      </Pressable>
      <View style={styles.header}>
        <Text style={styles.title}>New message</Text>
        <Text style={styles.subtitle}>
          Look up a sovereign identity by @username — we’ll fetch their
          Kyber1024 key and open a session on first send.
        </Text>
      </View>

      <View style={styles.inputWrap}>
        <Text style={styles.inputLabel}>To</Text>
        <View style={styles.inputRow}>
          <Text style={styles.inputAt}>@</Text>
          <TextInput
            style={styles.input}
            placeholder="username"
            placeholderTextColor={colors.text_placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={t => {
              setUsername(t);
              setLookupError(null);
            }}
            returnKeyType="search"
            onSubmitEditing={lookup}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>
          {username.trim() ? 'Matches' : 'Recent contacts'}
        </Text>
      </View>

      {onlineFirst.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No matches</Text>
          <Text style={styles.emptyBody}>
            Try a different handle. Identities are looked up against the
            ZHTP directory; only registered users can receive messages.
          </Text>
        </View>
      ) : (
        onlineFirst.map(contact => (
          <Pressable
            key={contact.did}
            onPress={() => startChat(contact)}
            style={({ pressed }) => [
              styles.row,
              pressed && styles.rowPressed,
            ]}
          >
            <Avatar
              name={contact.display_name}
              online={contact.online}
            />
            <View style={styles.rowBody}>
              <Text style={styles.rowName} numberOfLines={1}>
                {contact.display_name}
              </Text>
              <Text style={styles.rowHandle} numberOfLines={1}>
                @{contact.username}
              </Text>
            </View>
            <ArrowIcon direction="right" size={16} color={colors.text_tertiary} />
          </Pressable>
        ))
      )}

      {(() => {
        const trimmed = username.trim();
        if (trimmed.length < 3) return null;
        const isDid = trimmed.startsWith('did:zhtp:');
        const handle = trimmed.replace(/^@+/, '');
        const alreadyInList = onlineFirst.some(
          c => c.username.toLowerCase() === handle.toLowerCase(),
        );
        if (alreadyInList) return null;
        const lookupLabel = isDid
          ? `Look up DID ${trimmed.slice(0, 16)}…`
          : `Look up @${handle}`;
        return (
          <View style={styles.lookupCard}>
            <Text style={styles.lookupTitle}>{lookupLabel}</Text>
            <Text style={styles.lookupBody}>
              Resolves the recipient's Kyber + Dilithium keys via the
              ZHTP directory, then opens the chat. The first message
              you send creates the encrypted session.
            </Text>
            {lookupError && (
              <Text style={styles.lookupError} numberOfLines={3}>
                {lookupError}
              </Text>
            )}
            <TouchableOpacity
              style={[styles.lookupBtn, looking && styles.lookupBtnBusy]}
              onPress={lookup}
              disabled={looking}
              accessibilityState={{ busy: looking }}
            >
              {looking ? (
                <ActivityIndicator color={colors.bg_darkest} />
              ) : (
                <Text style={styles.lookupBtnText}>
                  {isDid ? 'Open chat' : 'Look up'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        );
      })()}
    </ScreenLayout>
  );
};

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  title: {
    fontSize: typography.size['2xl'],
    fontWeight: typography.weight.semibold,
    color: colors.text_primary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.size.sm,
    color: colors.text_secondary,
    lineHeight: typography.lineHeight.relaxed,
  },
  inputWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  inputLabel: {
    fontSize: typography.size.xs,
    color: colors.text_tertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg_dark,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  inputAt: {
    color: colors.text_tertiary,
    fontSize: typography.size.lg,
    marginRight: spacing.xxs,
  },
  input: {
    flex: 1,
    color: colors.text_primary,
    fontSize: typography.size.md,
    paddingVertical: spacing.md,
  },
  section: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sectionLabel: {
    fontSize: typography.size.xs,
    color: colors.text_tertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
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
  rowName: {
    fontSize: typography.size.md,
    color: colors.text_primary,
    fontWeight: typography.weight.medium,
  },
  rowHandle: {
    fontSize: typography.size.sm,
    color: colors.text_secondary,
    marginTop: 2,
  },
  empty: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing['2xl'],
    alignItems: 'center',
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
  lookupCard: {
    margin: spacing.lg,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.bg_dark,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lookupTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text_primary,
    marginBottom: spacing.xs,
  },
  lookupBody: {
    fontSize: typography.size.sm,
    color: colors.text_secondary,
    marginBottom: spacing.md,
    lineHeight: typography.lineHeight.relaxed,
  },
  lookupBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.base,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  lookupBtnBusy: {
    opacity: 0.7,
  },
  lookupBtnText: {
    color: colors.bg_darkest,
    fontWeight: typography.weight.semibold,
    fontSize: typography.size.md,
  },
  lookupError: {
    fontSize: typography.size.sm,
    color: colors.error,
    marginBottom: spacing.md,
    lineHeight: typography.lineHeight.relaxed,
  },
});

export default NewChatScreen;
