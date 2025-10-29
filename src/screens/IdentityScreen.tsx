import React, { useState } from 'react';
import { ScrollView, View, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Card,
  Text,
  Button,
  DetailRow,
  LoadingView,
  Column,
} from '../components';
import { useAuth } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography, borderRadius } from '../theme';

const IdentityScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { currentIdentity, signOut, isLoading: authLoading } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

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

  if (authLoading || !currentIdentity) {
    return <LoadingView />;
  }

  const isLoading = authLoading || loggingOut;
  const votingPowerFormatted = currentIdentity.votingPower?.toLocaleString() || '0';
  const ubiEarnedFormatted = currentIdentity.ubiEarned?.toFixed(2) || '0.00';
  const walletCount = currentIdentity.wallets?.length || 0;

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: colors.bg_darkest,
      }}
      edges={['bottom']}
    >
      <ScrollView
        style={{
          flex: 1,
          backgroundColor: colors.bg_darkest,
        }}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingTop: 20,
          paddingBottom: spacing.lg,
        }}
        scrollIndicatorInsets={{ right: 1 }}
        showsVerticalScrollIndicator={false}
      >
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
              <Text style={{ fontSize: typography.size['5xl'], marginBottom: spacing.sm }}>
                {currentIdentity.avatar || '👤'}
              </Text>
              <Text variant="h2" style={{ marginBottom: spacing.xs }}>
                {currentIdentity.displayName}
              </Text>
              <Text variant="caption" style={{ color: colors.text_secondary, marginBottom: spacing.md }}>
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
                value={currentIdentity.citizenship ? t.identity.details.verified : t.identity.details.notVerified}
              />
              <DetailRow
                label={t.identity.details.created}
                value={new Date(currentIdentity.createdAt || '').toLocaleDateString()}
              />
            </Column>
          </Card>

          {/* Stats Card */}
          <Card>
            <Text
              style={{
                fontSize: typography.size.sm,
                fontWeight: typography.weight.semibold,
                color: colors.text_primary,
                marginBottom: spacing.md,
              }}
            >
              {t.identity.stats.title}
            </Text>
            <Column gap="sm">
              <DetailRow
                label={t.identity.stats.votingPower}
                value={votingPowerFormatted}
              />
              <DetailRow
                label={t.identity.stats.ubiEarned}
                value={`${ubiEarnedFormatted} ZHTP`}
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
                onPress={() => {}}
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
                {isLoading ? t.identity.logout.buttonLoading : t.identity.logout.button}
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

          {/* Footer spacing */}
          <View style={{ height: spacing.xl }} />
        </Column>
      </ScrollView>
    </SafeAreaView>
  );
};

export default IdentityScreen;
