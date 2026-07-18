import React, { useState } from 'react';
import { View, Alert, TouchableOpacity } from 'react-native';
import {
  Card,
  Text,
  Button,
  DetailRow,
  LoadingView,
  Column,
  ScreenLayout,
  HeaderBar,
  SideDrawer,
  DrawerItem,
  SectionLabel,
} from '../components';
import { useAuth, useAsyncData } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography, borderRadius } from '../theme';
import appService from '../services/AppService';

const IdentityScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { currentIdentity, signOut, isLoading: authLoading } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  // Fetch identity details from API when identity changes
  useAsyncData(async () => {
    try {
      if (currentIdentity) {
        const identity = await appService.getIdentity(currentIdentity.did);
        return identity;
      }
    } catch (error) {
      console.warn('Failed to fetch identity details from API:', error);
    }
    return null;
  }, [currentIdentity]);

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

  if (authLoading || !currentIdentity) {
    // Guest mode - show sign-in prompt
    if (authLoading) {
      return <LoadingView />;
    }
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
        <ScreenLayout paddingTop={spacing.lg}>
          <View
            style={{
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
              paddingHorizontal: spacing.lg,
            }}
          >
            <Text style={{ fontSize: 48, marginBottom: spacing.md }}>🆔</Text>
            <Text
              style={{
                fontSize: typography.size.xl,
                fontWeight: typography.weight.semibold,
                color: colors.text_primary,
                marginBottom: spacing.sm,
                textAlign: 'center',
              }}
            >
              Sign in to view your identity
            </Text>
            <Text
              style={{
                fontSize: typography.size.md,
                color: colors.text_secondary,
                marginBottom: spacing.xl,
                textAlign: 'center',
              }}
            >
              Create or restore your identity to get started
            </Text>
            <TouchableOpacity
              style={{
                backgroundColor: colors.primary,
                paddingVertical: spacing.md,
                paddingHorizontal: spacing.xl,
                borderRadius: borderRadius.md,
              }}
              onPress={() => navigation.navigate('SignIn')}
            >
              <Text
                style={{
                  color: colors.text_primary,
                  fontSize: typography.size.md,
                  fontWeight: typography.weight.semibold,
                }}
              >
                Sign In
              </Text>
            </TouchableOpacity>
          </View>
        </ScreenLayout>
      </View>
    );
  }

  const isLoading = authLoading || loggingOut;
  const votingPowerFormatted =
    currentIdentity.votingPower?.toLocaleString() || '0';
  const ubiEarnedFormatted = currentIdentity.ubiEarned?.toFixed(2) || '0.00';
  const walletCount = currentIdentity.wallets
    ? Object.keys(currentIdentity.wallets).length
    : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
      <HeaderBar />

      <ScreenLayout paddingTop={spacing.xl}>
        <Column gap="xl">
          {/* Identity Card */}
          <Card>
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
              <Text
                variant="caption"
                style={{
                  color: colors.text_secondary,
                  marginBottom: spacing.md,
                }}
              >
                {currentIdentity.did}
              </Text>
              <Button
                variant="secondary"
                onPress={() => navigation?.navigate('ProfileEdit')}
                disabled={isLoading}
              >
                {t.identity.actions.editProfile}
              </Button>
            </View>

            {/* Identity Details */}
            <Column gap="sm">
              <DetailRow
                label={t.identity.details.identityType}
                value={currentIdentity.identityType || ''}
              />
              <DetailRow
                label={t.identity.details.citizenship}
                value={
                  currentIdentity.citizenship
                    ? t.identity.details.verified
                    : t.identity.details.notVerified
                }
              />
              <DetailRow
                label={t.identity.details.created}
                value={new Date(
                  currentIdentity.createdAt || '',
                ).toLocaleDateString()}
              />
            </Column>
          </Card>

          {/* Stats Card */}
          <Card>
            <SectionLabel>{t.identity.stats.title}</SectionLabel>
            <Column gap="sm">
              <DetailRow
                label={t.identity.stats.votingPower}
                value={votingPowerFormatted}
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

          {/* Actions Card */}
          <Card>
            <Column gap="sm">
              <Button
                variant="secondary"
                onPress={() => navigation?.navigate('IdentitySettings')}
                disabled={isLoading}
              >
                {t.identity.actions.settings}
              </Button>
              <Button
                variant="secondary"
                onPress={() => navigation?.navigate('AppSettings')}
                disabled={isLoading}
              >
                {t.identity.actions.appSettings}
              </Button>
              <Button
                variant="secondary"
                onPress={() => navigation?.navigate('Wallet')}
                disabled={isLoading}
              >
                {t.identity.actions.viewWallets}
              </Button>
              <Button
                variant="secondary"
                onPress={() => navigation?.navigate('BackupIdentity')}
                disabled={isLoading}
              >
                {t.identity.actions.backupIdentity}
              </Button>
            </Column>
          </Card>

          {/* Sign Out Card */}
          <Card>
            <Column gap="sm">
              <Button
                onPress={handleLogout}
                disabled={isLoading}
                variant="outline"
                style={{
                  borderColor: colors.error,
                }}
              >
                {isLoading
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
        </Column>
      </ScreenLayout>
    </View>
  );
};

export default IdentityScreen;
