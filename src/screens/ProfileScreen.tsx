/**
 * ProfileScreen
 * User profile and identity information with stats and actions
 */

import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity, Alert, Clipboard } from 'react-native';
import {
  Card,
  Text,
  Button,
  LoadingView,
  Column,
  ScreenLayout,
  DetailRow,
  SectionLabel,
} from '../components';
import { useAuth, useApi, useAsyncData } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography, borderRadius } from '../theme';

const ProfileScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { currentIdentity, signOut, isLoading } = useAuth();
  const { api, isInitialized } = useApi();
  const [loggingOut, setLoggingOut] = useState(false);

  // Fetch wallet data for stats
  const { data: walletData } = useAsyncData(
    async () => {
      if (!api || !isInitialized || !currentIdentity?.did) {
        return null;
      }

      try {
        const walletList = await api.getWalletList(currentIdentity.did);
        return {
          wallets: walletList.wallets || [],
        };
      } catch (error) {
        console.warn('⚠️ Profile: Failed to fetch wallet data:', error);
        return null;
      }
    },
    [api, isInitialized, currentIdentity?.did],
  );

  // Fetch UBI data for stats
  const { data: ubiData } = useAsyncData(
    async () => {
      if (!currentIdentity?.did) {
        return null;
      }

      return {
        total_earned: currentIdentity.ubiEarned || 0,
      };
    },
    [currentIdentity?.did],
  );

  // Fetch DAO stats
  const { data: daoStats } = useAsyncData(
    async () => {
      if (!api || !isInitialized || !currentIdentity?.did) {
        return null;
      }

      try {
        const voteHistory = await api.request(`/api/v1/dao/vote/history/${currentIdentity.did}`).catch(() => null);

        return {
          voting_power: voteHistory?.voting_power || 0,
          votes_cast: voteHistory?.votes?.length || 0,
          reputation_score: voteHistory?.reputation_score || 0,
        };
      } catch (error) {
        console.warn('⚠️ Profile: Failed to fetch DAO stats:', error);
        return null;
      }
    },
    [api, isInitialized, currentIdentity?.did],
  );

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
                Alert.alert(t.identity.logout.errorTitle, t.identity.logout.errorMessage);
              } finally {
                setLoggingOut(false);
              }
            })();
          },
        },
      ]
    );
  };

  if (!currentIdentity || isLoading) {
    return <LoadingView />;
  }

  const truncateId = (id: any) => {
    if (!id) return 'unknown';

    if (Array.isArray(id)) {
      const hexString = id.map(byte => byte.toString(16).padStart(2, '0')).join('');
      return `${hexString.substring(0, 12)}...${hexString.substring(hexString.length - 12)}`;
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
  const votingPower = daoStats?.voting_power || 0;
  const votingPowerFormatted = votingPower.toLocaleString();
  const ubiEarned = ubiData?.total_earned || 0;
  const ubiEarnedFormatted = ubiEarned.toFixed(2);
  const walletCount = walletData?.wallets?.length || 0;
  const votesCast = daoStats?.votes_cast || 0;
  const reputationScore = daoStats?.reputation_score || 0;
  const authLoading = isLoading || loggingOut;

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
                <Text style={{ fontSize: typography.size['5xl'], marginBottom: spacing.sm }}>
                  {currentIdentity.avatar || '👤'}
                </Text>
                <Text variant="h2" style={{ marginBottom: spacing.xs }}>
                  {currentIdentity.displayName}
                </Text>
                {currentIdentity.username && (
                  <Text style={{ fontSize: typography.size.sm, color: colors.primary, marginBottom: spacing.xs }}>
                    @{currentIdentity.username}
                  </Text>
                )}
                <TouchableOpacity onPress={() => currentIdentity.did && copyToClipboard(currentIdentity.did)}>
                  <Text variant="caption" style={{ color: colors.text_secondary, marginBottom: spacing.md }}>
                    {truncateId(currentIdentity.did)}
                  </Text>
                </TouchableOpacity>
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
                    borderLeftWidth: 3,
                    borderLeftColor: colors.primary,
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
                  <TouchableOpacity onPress={() => copyToClipboard(currentIdentity.did)}>
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
                  value={currentIdentity.citizenship ? t.identity.details.verified : t.identity.details.notVerified}
                />
                <DetailRow
                  label={t.identity.details.created}
                  value={new Date(currentIdentity.createdAt || '').toLocaleDateString()}
                />
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
                <DetailRow
                  label="Votes Cast"
                  value={votesCast.toString()}
                />
                <DetailRow
                  label="Reputation Score"
                  value={reputationScore.toLocaleString()}
                />
                <DetailRow
                  label={t.identity.stats.ubiEarned}
                  value={`${ubiEarnedFormatted} SOV`}
                />
                <DetailRow
                  label={t.identity.stats.wallets}
                  value={walletCount.toString()}
                />
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
                  {authLoading ? t.identity.logout.buttonLoading : t.identity.logout.button}
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
