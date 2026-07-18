/**
 * ProfileScreen
 * User profile and identity information with stats and actions
 */

import React, { useState } from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import {
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  Clipboard,
  StyleSheet,
  Modal,
} from 'react-native';
import {
  ArrowIcon,
  Card,
  Text,
  Button,
  LoadingView,
  Column,
  Row,
  ScreenLayout,
  DetailRow,
  SectionLabel,
  GuestEntryCard,
} from '../components';
import { useAuth, useAsyncData } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography, borderRadius, shadows } from '../theme';

// --- Premium UI Components ---

const CheckIcon = ({ color = colors.success }: { color?: string }) => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
    <Path d="M20 6L9 17l-5-5" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const PremiumBadge = () => (
  <View style={premiumStyles.badge}>
    <Text style={premiumStyles.badgeText}>PREMIUM</Text>
  </View>
);

const UpgradeModal = ({ visible, onClose, onUpgrade }: { visible: boolean, onClose: () => void, onUpgrade: () => void }) => {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={premiumStyles.modalOverlay}>
        <View style={premiumStyles.modalContent}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Column gap="lg" style={{ padding: spacing.lg }}>
              <Row justify="space-between" align="center">
                <Text variant="h2" style={{ color: colors.primary }}>Upgrade to Premium</Text>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={{ fontSize: 24, color: colors.text_secondary }}>✕</Text>
                </TouchableOpacity>
              </Row>

              <Text style={{ color: colors.text_secondary, fontSize: 14, lineHeight: 20 }}>
                Unlock the full power of the Sovereign Network with a one-time Premium SID upgrade.
              </Text>

              <Card style={premiumStyles.tierCard}>
                <Text style={premiumStyles.tierTitle}>Premium SID — $40</Text>
                <Text style={premiumStyles.tierSubtitle}>One-time fee • Lifetime access • Mainnet Ready</Text>

                <Column gap="sm" style={{ marginTop: spacing.md }}>
                  <FeatureRow text="5 DAO Slots (Bundle: Domain + Token)" />
                  <FeatureRow text="1 Free Mainnet-Ready DAO Bundle" />
                  <FeatureRow text="25GB Network Storage (vs 10GB Free)" />
                  <FeatureRow text="Custom SID Name (ex: user.sov)" />
                  <FeatureRow text="Upload Custom Profile Pictures" />
                  <FeatureRow text="$5 Testnet / $10 Mainnet Bundle Add-ons" />
                  <FeatureRow text="Lifetime Premium Status (Mainnet)" />
                </Column>
              </Card>

              <View style={premiumStyles.impactBox}>
                <Text style={premiumStyles.impactTitle}>Community Impact</Text>
                <Text style={premiumStyles.impactText}>
                  <Text style={{ fontWeight: 'bold', color: colors.primary }}>80%</Text> of all profits go back to the project for funding free hardware devices (routers, phones, etc).
                </Text>
                <Text style={premiumStyles.impactText}>
                  <Text style={{ fontWeight: 'bold', color: colors.text_primary }}>20%</Text> supports the core development team.
                </Text>
              </View>

              <Button variant="primary" size="lg" onPress={onUpgrade} style={{ marginTop: spacing.md }}>
                Upgrade Now — $40
              </Button>

              <Text style={premiumStyles.disclaimer}>
                Testnet domains and status will transfer over to mainnet through a blockchain snapshot.
              </Text>
            </Column>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const FeatureRow = ({ text }: { text: string }) => (
  <Row gap="sm" align="center">
    <CheckIcon />
    <Text style={{ fontSize: 13, color: colors.text_primary }}>{text}</Text>
  </Row>
);

const premiumStyles = StyleSheet.create({
  badge: {
    backgroundColor: colors.primary + '22',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.primary,
    alignSelf: 'center',
    marginTop: spacing.xs,
  },
  badgeText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  upgradeCard: {
    marginHorizontal: 0,
    backgroundColor: colors.bg_darker,
    borderWidth: 1,
    borderColor: colors.primary + '44',
    padding: spacing.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.bg_darkest,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    maxHeight: '90%',
  },
  tierCard: {
    marginHorizontal: 0,
    backgroundColor: colors.bg_dark,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tierTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text_primary,
  },
  tierSubtitle: {
    fontSize: 12,
    color: colors.text_secondary,
    marginTop: 2,
  },
  impactBox: {
    backgroundColor: colors.bg_dark,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  impactTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.text_primary,
    marginBottom: spacing.xs,
  },
  impactText: {
    fontSize: 13,
    color: colors.text_secondary,
    lineHeight: 18,
  },
  disclaimer: {
    fontSize: 11,
    color: colors.text_tertiary,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: spacing.sm,
  },
});

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
  const { currentIdentity, signOut, isLoading, upgradeToPremium } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const isPremium = currentIdentity?.tier === 'premium';

  // Keep hook order stable without triggering any network requests.
  useAsyncData(async () => null, [currentIdentity?.did]);

  const handleUpgrade = async () => {
    try {
      await upgradeToPremium();
      setShowUpgradeModal(false);
      Alert.alert('Welcome to Premium!', 'Your SID has been upgraded. You now have lifetime access to premium features.');
    } catch (error) {
      Alert.alert('Upgrade Failed', 'Could not complete the upgrade at this time.');
    }
  };

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
                {isPremium && <PremiumBadge />}
                {currentIdentity.username && (
                  <Text
                    style={{
                      fontSize: typography.size.sm,
                      color: colors.primary,
                      marginTop: spacing.xs,
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
                  style={{ marginTop: spacing.sm }}
                >
                  {t.identity.actions.editProfile}
                </Button>
              </View>

              {/* Tier Status for Free Users */}
              {!isPremium && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setShowUpgradeModal(true)}
                  style={{ marginBottom: spacing.md }}
                >
                  <Card style={premiumStyles.upgradeCard}>
                    <Row justify="space-between" align="center">
                      <Column style={{ flex: 1 }}>
                        <Text style={{ fontWeight: 'bold', color: colors.text_primary, fontSize: 14 }}>Upgrade to Premium SID</Text>
                        <Text style={{ color: colors.text_secondary, fontSize: 11, marginTop: 2 }}>Unlock Mainnet transfer, custom .sov name & more</Text>
                      </Column>
                      <ArrowIcon direction="right" size={16} color={colors.primary} />
                    </Row>
                  </Card>
                </TouchableOpacity>
              )}

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

      <UpgradeModal
        visible={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        onUpgrade={handleUpgrade}
      />
    </ScreenLayout>
  );
};

export default ProfileScreen;
