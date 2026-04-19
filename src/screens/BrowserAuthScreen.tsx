import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Clipboard, Platform, Pressable, View } from 'react-native';
import { useRoute } from '@react-navigation/native';

import {
  Button,
  Card,
  Column,
  LoadingView,
  ScreenLayout,
  Text,
} from '../components';
import { useAuth } from '../hooks';
import { colors, spacing, typography, borderRadius } from '../theme';
import {
  BrowserAuthError,
  parseBrowserAuthLink,
  submitBrowserAuth,
} from '../services/BrowserAuthService';

/**
 * Browser Authentication Bridge — confirmation screen.
 *
 * Entered from:
 *   - deep link `zhtp://auth?challenge=…` handled in App.tsx
 *   - wallet settings → "Browser sign-in" card (paste / manual entry)
 *
 * The screen only shows one interactive button at a time to minimise
 * the chance of a hurried user signing a challenge they didn't expect.
 * The full challenge hex is shown truncated with head + tail visible so
 * the user can cross-check against the browser's QR/URL — this is the
 * same pattern used by hardware wallets for signature prompts.
 */
type RouteParams = {
  /** Full deep-link URL (`zhtp://auth?…`), OR a bare 64-char hex nonce
   *  pasted by the user. Parsed on mount. */
  url?: string;
  /** Fallback node override shown in the UI (same as the `node` query
   *  param on the deep link). */
  node?: string;
};

const MONO_FONT = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

const BrowserAuthScreen = ({ navigation }: any) => {
  const route = useRoute();
  const params = (route.params as RouteParams | undefined) ?? {};

  const { currentIdentity, isLoading } = useAuth();

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ sessionId: string; timestamp: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Parse once from route params. Any parse error is surfaced as
  // `parseError` rather than a crash — the user can still hit Cancel.
  const [parseError, setParseError] = useState<string | null>(null);
  const challenge = useMemo(() => {
    try {
      const parsed = parseBrowserAuthLink(params.url ?? null);
      setParseError(null);
      return parsed;
    } catch (err: any) {
      setParseError(err?.message ?? 'Invalid authentication link');
      return null;
    }
    // Only re-run on the raw input — state setters are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.url]);

  const nodeLabel = challenge?.node ?? params.node ?? 'connected node';

  const did = currentIdentity?.did ?? '';
  const didSuffix = useMemo(() => {
    if (!did) return '';
    return did.startsWith('did:zhtp:') ? did.slice('did:zhtp:'.length) : did;
  }, [did]);

  const onAuthenticate = useCallback(async () => {
    if (!challenge || !did) return;
    setSubmitting(true);
    setError(null);
    try {
      const out = await submitBrowserAuth(challenge.challengeHex, did);
      setResult(out);
    } catch (err: any) {
      if (err instanceof BrowserAuthError) {
        setError(err.message);
      } else {
        setError(err?.message ?? 'Authentication failed');
      }
    } finally {
      setSubmitting(false);
    }
  }, [challenge, did]);

  const onCancel = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const onCopySession = useCallback(() => {
    if (!result?.sessionId) return;
    Clipboard.setString(result.sessionId);
    Alert.alert('Copied', 'Session id copied to clipboard');
  }, [result?.sessionId]);

  // If the screen was opened while the app was already in the background
  // and the user then hits cancel, clear the challenge so a stale URL
  // isn't re-submitted on a later deep link.
  useEffect(() => {
    return () => {
      setResult(null);
      setError(null);
    };
  }, []);

  if (isLoading || !currentIdentity) {
    return <LoadingView />;
  }

  if (parseError || !challenge) {
    return (
      <ScreenLayout paddingTop={spacing.md}>
        <Card>
          <Column gap="md">
            <Text
              style={{
                fontSize: typography.size.sm,
                fontWeight: typography.weight.semibold,
                color: colors.error,
              }}
            >
              Invalid authentication link
            </Text>
            <Text
              style={{ color: colors.text_secondary, fontSize: typography.size.sm }}
            >
              {parseError ?? 'The link did not contain a valid challenge.'}
            </Text>
            <Button variant="secondary" onPress={onCancel}>
              Close
            </Button>
          </Column>
        </Card>
      </ScreenLayout>
    );
  }

  // Post-success panel — show the session id and a dismiss button.
  if (result) {
    return (
      <ScreenLayout paddingTop={spacing.md}>
        <Card>
          <Column gap="md">
            <Text
              style={{
                fontSize: typography.size.md,
                fontWeight: typography.weight.semibold,
                color: colors.success,
              }}
            >
              Browser authenticated
            </Text>
            <Text style={{ color: colors.text_secondary, fontSize: typography.size.sm }}>
              Return to your browser — the page should load momentarily.
            </Text>
            <InfoRow label="Session id" value={result.sessionId} mono onPress={onCopySession} />
            <InfoRow
              label="Signed at"
              value={new Date(result.timestamp * 1000).toLocaleString()}
            />
            <Button variant="primary" onPress={onCancel}>
              Done
            </Button>
          </Column>
        </Card>
      </ScreenLayout>
    );
  }

  const truncatedChallenge = `${challenge.challengeHex.slice(0, 10)}…${challenge.challengeHex.slice(-8)}`;
  const truncatedDid = didSuffix
    ? `did:zhtp:${didSuffix.slice(0, 10)}…${didSuffix.slice(-8)}`
    : '(unknown identity)';

  return (
    <ScreenLayout paddingTop={spacing.md}>
      <Column gap="lg">
        <Card>
          <Column gap="md">
            <Text
              style={{
                fontSize: typography.size.md,
                fontWeight: typography.weight.semibold,
                color: colors.text_primary,
              }}
            >
              Authenticate browser session
            </Text>
            <Text
              style={{ color: colors.text_secondary, fontSize: typography.size.sm }}
            >
              A browser is requesting proof that you control this
              identity. Review the details below before authorising —
              the signature will be submitted via your connected ZHTP
              node and used to unlock the browser session.
            </Text>

            <View style={details}>
              <InfoRow label="Challenge" value={truncatedChallenge} mono />
              <InfoRow label="Your DID" value={truncatedDid} mono />
              <InfoRow label="Target node" value={nodeLabel} />
            </View>

            {error && (
              <Text
                style={{
                  color: colors.error,
                  fontSize: typography.size.sm,
                  backgroundColor: `${colors.error}14`,
                  borderRadius: borderRadius.base,
                  padding: spacing.sm,
                }}
              >
                {error}
              </Text>
            )}

            <Column gap="sm">
              <Button
                variant="primary"
                onPress={onAuthenticate}
                disabled={submitting}
              >
                {submitting ? 'Authenticating…' : 'Authenticate'}
              </Button>
              <Button
                variant="secondary"
                onPress={onCancel}
                disabled={submitting}
              >
                Cancel
              </Button>
            </Column>
          </Column>
        </Card>

        <Text
          style={{
            color: colors.text_tertiary,
            fontSize: typography.size.xs,
            textAlign: 'center',
          }}
        >
          Received via {params.url?.startsWith('zhtp://') ? 'deep link' : 'manual entry'}
        </Text>
      </Column>
    </ScreenLayout>
  );
};

const InfoRow = ({
  label,
  value,
  mono,
  onPress,
}: {
  label: string;
  value: string;
  mono?: boolean;
  onPress?: () => void;
}) => {
  const content = (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary }}>
        {label}
      </Text>
      <Text
        style={{
          fontSize: typography.size.xs,
          color: colors.text_primary,
          fontWeight: typography.weight.semibold,
          fontFamily: mono ? MONO_FONT : undefined,
          flexShrink: 1,
          textAlign: 'right',
          marginLeft: spacing.md,
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
  if (!onPress) return content;
  return <Pressable onPress={onPress}>{content}</Pressable>;
};

const details = {
  backgroundColor: colors.bg_darker,
  padding: spacing.md,
  borderRadius: borderRadius.base,
  borderWidth: 1,
  borderColor: colors.border,
  gap: spacing.sm,
} as const;

export default BrowserAuthScreen;
