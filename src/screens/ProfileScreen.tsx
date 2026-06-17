/**
 * ProfileScreen
 * User profile and identity information with stats and actions
 */

import React, { useState } from 'react';
import Svg, { Path } from 'react-native-svg';
import {
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  Clipboard,
} from 'react-native';
import {
  ArrowIcon,
  Card,
  Text,
  Button,
  LoadingView,
  Column,
  ScreenLayout,
  DetailRow,
  SectionLabel,
  GuestEntryCard,
} from '../components';
import { useAuth, useAsyncData } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography, borderRadius } from '../theme';

/**
 * Normalise a timestamp that might be in seconds, milliseconds, a numeric
 * string, or an ISO-8601 string. Returns the epoch-millis value or null
 * if the input doesn't parse. Kept as a plain helper so `formatCreatedDate`
 * stays linear and under Sonar's cognitive-complexity threshold.
 */
const timestampToMillis = (raw: unknown): number | null => {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return raw < 1_000_000_000_000 ? raw * 1000 : raw;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      const numeric = Number(trimmed);
      if (!Number.isFinite(numeric) || numeric <= 0) return null;
      return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

/** Format a possibly-epoch-seconds/ms/ISO timestamp to a local date string, or null. */
const formatCreatedDate = (raw: unknown): string | null => {
  const ms = timestampToMillis(raw);
  if (ms == null) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime()) || d.getUTCFullYear() <= 1970) return null;
  return d.toLocaleDateString();
};

const ProfileScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { currentIdentity, signOut, isLoading } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  // Keep hook order stable without triggering any network requests.
  useAsyncData(async () => null, [currentIdentity?.did]);

  // Fetch UBS data for stats
  const { data: ubiData } = useAsyncData(async () => {
    if (!currentIdentity?.did) {
      return null;
    }

    return {
      total_earned: currentIdentity.ubiEarned || 0,
    };
  }, [currentIdentity?.did]);

  const handleLogout = () => {
    Alert.alert(
      t.identity.logout.confirmTitle,
      t.identity.logout.confirmMessage,
      [
        {
          text: t.identity.logout.cancel,
          style: 'cancel',
        },
        {
          text: t.identity.logout.confirm,
          style: 'destructive',
          onPress: () => {
            (async () => {
              setLoggingOut(true);
              try {
                await signOut();
              } catch (error) {
                console.error('Logout failed:', error);
                Alert.alert(
                  t.identity.logout.errorTitle,
                  t.identity.logout.errorMessage,
                );
              } finally {
                setLoggingOut(false);
              }
            })();
          },
        },
      ],
    );
  };

  if (!currentIdentity || isLoading) {
    if (isLoading) {
      return <LoadingView />;
    }
    // Guest mode — considered landing with preview card + dual CTAs.
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
        <ScreenLayout centerContent>
          <GuestEntryCard
            headline="Your sovereign identity"
            body="A post-quantum identity you own — no emails, no passwords on a server. Wallet, profile, and reputation under a single key only you control."
            signInLabel="Sign In"
            createLabel="Create Account"
            onSignIn={() => navigation.navigate('SignIn')}
            onCreate={() => navigation.navigate('CreateIdentity')}
            preview={
              <View
                style={{
                  width: '100%',
                  maxWidth: 340,
                  backgroundColor: colors.bg_darker,
                  borderRadius: borderRadius.lg,
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: spacing.lg,
                  opacity: 0.55,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.md,
                    marginBottom: spacing.md,
                  }}
                >
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      backgroundColor: colors.primary,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        color: colors.text_primary,
                        fontSize: typography.size.lg,
                        fontWeight: typography.weight.bold,
                      }}
                    >
                      S
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View
                      style={{
                        height: 12,
                        width: '70%',
                        backgroundColor: colors.text_secondary,
                        opacity: 0.3,
                        borderRadius: 6,
                        marginBottom: 6,
                      }}
                    />
                    <View
                      style={{
                        height: 10,
                        width: '45%',
                        backgroundColor: colors.text_secondary,
                        opacity: 0.2,
                        borderRadius: 5,
                      }}
                    />
                  </View>
                </View>
                <View
                  style={{
                    height: 10,
                    width: '85%',
                    backgroundColor: colors.text_secondary,
                    opacity: 0.15,
                    borderRadius: 5,
                    marginBottom: 8,
                  }}
                />
                <View
                  style={{
                    height: 10,
                    width: '60%',
                    backgroundColor: colors.text_secondary,
                    opacity: 0.15,
                    borderRadius: 5,
                  }}
                />
              </View>
            }
          />
        </ScreenLayout>
      </View>
    );
  }

  const truncateId = (id: any) => {
    if (!id) return 'unknown';

    if (Array.isArray(id)) {
      const hexString = id
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
      return `${hexString.substring(0, 12)}...${hexString.substring(
        hexString.length - 12,
      )}`;
    }

    if (typeof id === 'string' && id !== '') {
      return `${id.substring(0, 12)}...${id.substring(id.length - 12)}`;
    }

    return 'unknown';
  };

  const copyToClipboard = async (id: any) => {
    let textToCopy = '';
    if (Array.isArray(id)) {
      textToCopy = id.map(byte => byte.toString(16).padStart(2, '0')).join('');
    } else if (typeof id === 'string') {
      textToCopy = id;
    }

    if (textToCopy) {
      try {
        await Clipboard.setString(textToCopy);
        Alert.alert('Copied', `DID copied to clipboard:\n\n${textToCopy}`);
      } catch (error) {
        console.error('Failed to copy DID:', error);
        Alert.alert('Error', 'Failed to copy DID to clipboard');
      }
    }
  };

  // Stats values
  const votingPower = 0;
  const votingPowerFormatted = votingPower.toLocaleString();
  const ubiEarned = ubiData?.total_earned || 0;
  const ubiEarnedFormatted = ubiEarned.toFixed(2);
  const walletCount = 0;
  const votesCast = 0;
  const reputationScore = 0;
  const authLoading = isLoading || loggingOut;

  const createdDate = formatCreatedDate(currentIdentity.createdAt);

  return (
    <ScreenLayout paddingTop={spacing.md}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Column gap="md" style={{ paddingBottom: spacing.xl }}>
          {/* Identity Card */}
          <View style={{ paddingHorizontal: spacing.sm }}>
            <Card style={{ marginHorizontal: 0 }}>
              <View
                style={{
                  alignItems: 'center',
                  paddingVertical: spacing.lg,
                  backgroundColor: colors.bg_darker,
                  borderRadius: borderRadius.base,
                  marginBottom: spacing.md,
                }}
              >
                <Text
                  style={{
                    fontSize: typography.size['5xl'],
                    marginBottom: spacing.sm,
                  }}
                >
                  {currentIdentity.avatar || '👤'}
                </Text>
                <Text variant="h2" style={{ marginBottom: spacing.xs }}>
                  {currentIdentity.displayName}
                </Text>
                {currentIdentity.username && (
                  <Text
                    style={{
                      fontSize: typography.size.sm,
                      color: colors.primary,
                      marginBottom: spacing.xs,
                    }}
                  >
                    @{currentIdentity.username}
                  </Text>
                )}
                <Button
                  variant="secondary"
                  onPress={() => navigation?.navigate('ProfileEdit')}
                  disabled={authLoading}
                >
                  {t.identity.actions.editProfile}
                </Button>
              </View>

              {/* Identity Details */}
              <Column gap="sm">
                {/* Full DID with Copy */}
                <View
                  style={{
                    paddingVertical: spacing.md,
                    paddingHorizontal: spacing.md,
                    backgroundColor: colors.bg_darker,
                    borderRadius: borderRadius.base,
                  }}
                >
                  <Text
                    style={{
                      fontSize: typography.size.xs,
                      color: colors.text_secondary,
                      marginBottom: spacing.sm,
                      fontWeight: typography.weight.semibold,
                    }}
                  >
                    DECENTRALIZED IDENTITY (DID)
                  </Text>
                  <TouchableOpacity
                    onPress={() => copyToClipboard(currentIdentity.did)}
                  >
                    <Text
                      style={{
                        fontSize: typography.size.xs,
                        color: colors.primary,
                        fontFamily: 'Courier',
                        fontWeight: '600',
                        marginBottom: spacing.xs,
                      }}
                    >
                      {typeof currentIdentity.did === 'string'
                        ? currentIdentity.did
                        : truncateId(currentIdentity.did)}
                    </Text>
                  </TouchableOpacity>
                  <Text
                    style={{
                      fontSize: typography.size.xs,
                      color: colors.text_secondary,
                      fontStyle: 'italic',
                    }}
                  >
                    Tap to copy full DID
                  </Text>
                </View>
                <DetailRow
                  label={t.identity.details.identityType}
                  value={currentIdentity.identityType || 'Citizen'}
                />
                <DetailRow
                  label={t.identity.details.citizenship}
                  value={
                    currentIdentity.citizenship
                      ? t.identity.details.verified
                      : t.identity.details.notVerified
                  }
                />
                {createdDate && (
                  <DetailRow
                    label={t.identity.details.created}
                    value={createdDate}
                  />
                )}
              </Column>
            </Card>
          </View>

          {/* Stats Card */}
          <View style={{ paddingHorizontal: spacing.sm }}>
            <Card style={{ marginHorizontal: 0 }}>
              <SectionLabel>{t.identity.stats.title}</SectionLabel>
              <Column gap="sm">
                <DetailRow
                  label={t.identity.stats.votingPower}
                  value={votingPowerFormatted}
                />
                <DetailRow label="Votes Cast" value={votesCast.toString()} />
                <DetailRow
                  label="Reputation Score"
                  value={reputationScore.toLocaleString()}
                />
                <DetailRow
                  label={t.identity.stats.ubiEarned}
                  value={`${ubiEarnedFormatted} SOV`}
                />
              </Column>
            </Card>
          </View>

          {/* Assets Card */}
          <View style={{ paddingHorizontal: spacing.sm }}>
            <Card style={{ marginHorizontal: 0 }}>
              <SectionLabel>My Assets</SectionLabel>
              <Column gap="sm">
                <TouchableOpacity
                  onPress={() => navigation?.navigate('MyDomains')}
                  style={{
                    paddingVertical: spacing.md,
                    paddingHorizontal: spacing.md,
                    backgroundColor: colors.bg_darker,
                    borderRadius: borderRadius.md,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.md,
                    }}
                  >
                    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                      <Path d="M4 4h6v16H4z" stroke={colors.text_primary} strokeWidth={1.5} />
                      <Path d="M14 4h6v16h-6z" stroke={colors.text_primary} strokeWidth={1.5} />
                      <Path d="M4 12h16" stroke={colors.text_primary} strokeWidth={1.5} />
                      <Path d="M8 4V2" stroke={colors.text_primary} strokeWidth={1.5} strokeLinecap="round" />
                      <Path d="M16 4V2" stroke={colors.text_primary} strokeWidth={1.5} strokeLinecap="round" />
                    </Svg>
                    <View>
                      <Text
                        style={{
                          fontSize: typography.size.sm,
                          fontWeight: typography.weight.semibold,
                          color: colors.text_primary,
                        }}
                      >
                        My Domains
                      </Text>
                      <Text
                        style={{
                          fontSize: typography.size.xs,
                          color: colors.text_secondary,
                          marginTop: spacing.xs,
                        }}
                      >
                        View & manage your .sov domains
                      </Text>
                    </View>
                  </View>
                  <ArrowIcon direction="right" size={18} color={colors.text_secondary} />
                </TouchableOpacity>
              </Column>
            </Card>
          </View>

          {/* Actions Card */}
          <View style={{ paddingHorizontal: spacing.sm }}>
            <Card style={{ marginHorizontal: 0 }}>
              <Column gap="sm">
                <Button
                  variant="secondary"
                  onPress={() => navigation?.navigate('IdentitySettings')}
                  disabled={authLoading}
                >
                  {t.identity.actions.settings}
                </Button>
                <Button
                  variant="secondary"
                  onPress={() => navigation?.navigate('AppSettings')}
                  disabled={authLoading}
                >
                  {t.identity.actions.appSettings}
                </Button>
                <Button
                  variant="secondary"
                  onPress={() => navigation?.navigate('BackupIdentity')}
                  disabled={authLoading}
                >
                  {t.identity.actions.backupIdentity}
                </Button>
              </Column>
            </Card>
          </View>

          {/* Sign Out Card */}
          <View style={{ paddingHorizontal: spacing.sm }}>
            <Card style={{ marginHorizontal: 0 }}>
              <Column gap="sm">
                <Button
                  onPress={handleLogout}
                  disabled={authLoading}
                  variant="danger"
                >
                  {authLoading
                    ? t.identity.logout.buttonLoading
                    : t.identity.logout.button}
                </Button>
                <Text
                  style={{
                    fontSize: typography.size.xs,
                    color: colors.text_tertiary,
                    textAlign: 'center',
                    marginTop: spacing.xs,
                  }}
                >
                  {t.identity.logout.hint}
                </Text>
              </Column>
            </Card>
          </View>
        </Column>
      </ScrollView>
    </ScreenLayout>
  );
};

export default ProfileScreen;
