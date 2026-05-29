/**
 * UsernameClaimModal — blocking full-screen overlay shown when the
 * signed-in identity has no claimed username on chain.
 *
 * Lifecycle:
 *   - Rendered globally by `App` when `useAuth().needsUsernameClaim`
 *     is true (i.e. `currentIdentity.username` is empty / undefined
 *     after the chain hydrate).
 *   - User types a username; we validate client-side per the same
 *     rules the server enforces (`validate_username`), debounce a
 *     `GET /identity/username/available/:u` for live taken/free
 *     feedback, then POST `/identity/claim-username` on submit.
 *   - On 200 OK: AuthContext mirrors the username + display_name
 *     into the cached identity, `needsUsernameClaim` flips false,
 *     and the modal unmounts.
 *
 * One-shot: usernames are immutable on chain. We intentionally do
 * not offer a "skip" — the messaging flow needs `@username` lookup
 * to work, so the modal is mandatory.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../../../hooks/useAuth';
import { borderRadius, colors, spacing, typography } from '../../../theme';
import { validateUsername } from '../../../utils/credentials';

type Availability =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'free' }
  | { state: 'taken' }
  | { state: 'error'; message: string };

const UsernameClaimModal: React.FC = () => {
  const { needsUsernameClaim, claimUsername, checkUsernameAvailability } =
    useAuth();

  const [value, setValue] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Availability>({ state: 'idle' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Debounce the availability probe. Each keystroke schedules a
  // check 350 ms in the future; any newer keystroke cancels it.
  const probeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest-only guard so a slow probe response can't overwrite a
  // newer state.
  const probeSeq = useRef(0);

  const normalized = useMemo(() => value.trim().toLowerCase(), [value]);

  useEffect(() => {
    setValidation(validateUsername(normalized));
    if (probeTimer.current) {
      clearTimeout(probeTimer.current);
      probeTimer.current = null;
    }
    if (!normalized || validateUsername(normalized) !== null) {
      setAvailability({ state: 'idle' });
      return;
    }
    setAvailability({ state: 'checking' });
    const seq = ++probeSeq.current;
    probeTimer.current = setTimeout(async () => {
      try {
        const free = await checkUsernameAvailability(normalized);
        if (probeSeq.current !== seq) return;
        setAvailability({ state: free ? 'free' : 'taken' });
      } catch (e) {
        if (probeSeq.current !== seq) return;
        const message = e instanceof Error ? e.message : 'Check failed';
        setAvailability({ state: 'error', message });
      }
    }, 350);
    return () => {
      if (probeTimer.current) {
        clearTimeout(probeTimer.current);
        probeTimer.current = null;
      }
    };
  }, [normalized, checkUsernameAvailability]);

  const canSubmit =
    !submitting &&
    validation === null &&
    (availability.state === 'free' || availability.state === 'idle');

  const onSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await claimUsername(normalized);
      // `needsUsernameClaim` flips false in AuthContext on success;
      // this component unmounts on the next render.
    } catch (e) {
      const err = e as { status?: number; body?: unknown; message?: string };
      const bodyText =
        typeof err.body === 'string'
          ? err.body
          : err.body && typeof err.body === 'object'
            ? JSON.stringify(err.body)
            : undefined;
      let message = bodyText || err.message || 'Claim failed.';
      // Map a few known server responses to friendlier copy. The
      // server already returns useful strings so we mostly pass
      // through; only adjust the conflict cases where the bare
      // server text would confuse.
      if (err.status === 409) {
        if (message.toLowerCase().includes('already has')) {
          message =
            "Your account already has a username — refreshing your profile.";
        } else if (message.toLowerCase().includes('already taken')) {
          message = 'That username is already taken. Pick another.';
        }
      }
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, claimUsername, normalized]);

  if (!needsUsernameClaim) return null;

  const helperLine = (() => {
    if (validation) return { tone: 'error' as const, text: validation };
    if (!normalized) {
      return {
        tone: 'neutral' as const,
        text: 'Lowercase letters, digits, and underscore. 3–32 chars.',
      };
    }
    switch (availability.state) {
      case 'checking':
        return { tone: 'neutral' as const, text: 'Checking availability…' };
      case 'free':
        return {
          tone: 'success' as const,
          text: `@${normalized} is available.`,
        };
      case 'taken':
        return {
          tone: 'error' as const,
          text: 'Already taken. Pick another.',
        };
      case 'error':
        return {
          tone: 'error' as const,
          text: `Couldn't check: ${availability.message}`,
        };
      default:
        return {
          tone: 'neutral' as const,
          text: 'Lowercase letters, digits, and underscore. 3–32 chars.',
        };
    }
  })();

  return (
    <Modal
      visible
      animationType="fade"
      transparent={false}
      // `onRequestClose` fires on Android back-button. Username
      // claim is mandatory — swallow the press so the user can't
      // dismiss out.
      onRequestClose={() => {}}
    >
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.container}>
          <Text style={styles.title}>Pick your username</Text>
          <Text style={styles.body}>
            Other people use this to find you on Sovereign. It's
            permanent — choose carefully.
          </Text>

          <View style={styles.inputWrap}>
            <Text style={styles.inputAt}>@</Text>
            <TextInput
              style={styles.input}
              placeholder="username"
              placeholderTextColor={colors.text_placeholder}
              value={value}
              onChangeText={setValue}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              returnKeyType="go"
              onSubmitEditing={onSubmit}
              maxLength={32}
            />
          </View>

          <Text
            style={[
              styles.helper,
              helperLine.tone === 'error' && styles.helperError,
              helperLine.tone === 'success' && styles.helperSuccess,
            ]}
          >
            {helperLine.text}
          </Text>

          {submitError && (
            <Text style={[styles.helper, styles.helperError]} numberOfLines={3}>
              {submitError}
            </Text>
          )}

          <Pressable
            style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
            onPress={onSubmit}
            disabled={!canSubmit}
            accessibilityState={{ busy: submitting }}
          >
            {submitting ? (
              <ActivityIndicator color={colors.bg_darkest} />
            ) : (
              <Text style={styles.submitText}>Claim @{normalized || '…'}</Text>
            )}
          </Pressable>

          <Text style={styles.footnote}>
            Usernames are stored on chain. After this you'll be
            reachable as @{normalized || 'username'} across the
            network.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg_darkest },
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing['3xl'],
    paddingBottom: spacing.lg,
    backgroundColor: colors.bg_darkest,
  },
  title: {
    fontSize: typography.size['3xl'],
    fontWeight: typography.weight.bold,
    color: colors.text_primary,
    marginBottom: spacing.md,
  },
  body: {
    fontSize: typography.size.md,
    color: colors.text_secondary,
    lineHeight: typography.lineHeight.relaxed,
    marginBottom: spacing.xl,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg_dark,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  inputAt: {
    color: colors.text_tertiary,
    fontSize: typography.size.xl,
    marginRight: spacing.xxs,
  },
  input: {
    flex: 1,
    color: colors.text_primary,
    fontSize: typography.size.lg,
    paddingVertical: spacing.md,
  },
  helper: {
    fontSize: typography.size.sm,
    color: colors.text_tertiary,
    marginTop: spacing.sm,
    lineHeight: typography.lineHeight.relaxed,
  },
  helperError: { color: colors.error },
  helperSuccess: { color: colors.success },
  submitBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.base,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitText: {
    color: colors.bg_darkest,
    fontWeight: typography.weight.semibold,
    fontSize: typography.size.md,
  },
  footnote: {
    fontSize: typography.size.xs,
    color: colors.text_tertiary,
    marginTop: spacing.lg,
    lineHeight: typography.lineHeight.relaxed,
  },
});

export default UsernameClaimModal;
