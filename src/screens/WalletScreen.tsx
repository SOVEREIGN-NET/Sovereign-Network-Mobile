import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Card,
  Text,
  Button,
  LoadingView,
  Column,
  DetailRow,
} from '../components';
import { useAuth } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography, borderRadius } from '../theme';

const WalletScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { currentIdentity, isLoading } = useAuth();
  const [selectedWalletId] = useState<string | null>(null);

  if (!currentIdentity || isLoading) {
    return <LoadingView />;
  }

  const wallets = currentIdentity.wallets || [];
  const selectedWallet = wallets.find(w => w.id === selectedWalletId) || wallets[0];
  const totalBalance = wallets.reduce((sum, w) => sum + (w.balance || 0), 0);

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: colors.bg_darkest,
      }}
      edges={['bottom']}
    >
      <ScrollView
        testID="wallet-screen"
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
          {/* Total Balance Card */}
          <Card>
            <View
              style={{
                alignItems: 'center',
                paddingVertical: spacing.lg,
                backgroundColor: colors.bg_darker,
                borderRadius: borderRadius.base,
              }}
            >
              <Text
                style={{
                  fontSize: typography.size.xs,
                  color: colors.text_secondary,
                  marginBottom: spacing.sm,
                }}
              >
                {t.wallet.totalBalance}
              </Text>
              <Text
                style={{
                  fontSize: typography.size['5xl'],
                  fontWeight: typography.weight.bold,
                  color: colors.primary,
                  marginBottom: spacing.xs,
                }}
              >
                {totalBalance.toLocaleString()}
              </Text>
              <Text
                style={{
                  fontSize: typography.size.sm,
                  color: colors.text_secondary,
                }}
              >
                {t.wallet.currency}
              </Text>
            </View>
          </Card>

          {/* Wallets List */}
          {wallets.length > 0 ? (
            <Card>
              <Text
                style={{
                  fontSize: typography.size.sm,
                  fontWeight: typography.weight.semibold,
                  color: colors.text_primary,
                  marginBottom: spacing.md,
                }}
              >
                {t.wallet.wallets.title} ({wallets.length})
              </Text>

              <Column gap="sm">
                {wallets.map((wallet) => (
                  <View
                    key={wallet.id}
                    style={{
                      backgroundColor:
                        selectedWalletId === wallet.id
                          ? colors.primary
                          : colors.bg_darker,
                      padding: spacing.md,
                      borderRadius: borderRadius.base,
                      borderWidth: 2,
                      borderColor:
                        selectedWalletId === wallet.id
                          ? colors.primary
                          : colors.border,
                    }}
                  >
                    <View
                      style={{
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexDirection: 'row',
                        marginBottom: spacing.sm,
                      }}
                    >
                      <Column style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: typography.size.sm,
                            fontWeight: typography.weight.semibold,
                            color:
                              selectedWalletId === wallet.id
                                ? colors.white
                                : colors.text_primary,
                          }}
                        >
                          {wallet.name}
                        </Text>
                        <Text
                          style={{
                            fontSize: typography.size.xs,
                            color:
                              selectedWalletId === wallet.id
                                ? colors.white
                                : colors.text_secondary,
                            marginTop: spacing.xs,
                          }}
                        >
                          {wallet.address}
                        </Text>
                      </Column>
                      <Text
                        style={{
                          fontSize: typography.size.sm,
                          fontWeight: typography.weight.bold,
                          color:
                            selectedWalletId === wallet.id
                              ? colors.white
                              : colors.primary,
                        }}
                      >
                        {wallet.balance.toLocaleString()}
                      </Text>
                    </View>

                    {selectedWalletId === wallet.id && (
                      <View
                        style={{
                          marginTop: spacing.md,
                          paddingTop: spacing.md,
                          borderTopWidth: 1,
                          borderTopColor: 'rgba(255,255,255,0.2)',
                        }}
                      >
                        <Column gap="sm">
                          <Button
                            variant="secondary"
                            onPress={() => navigation?.navigate('SendTokens')}
                            disabled={isLoading}
                          >
                            {t.wallet.actions.send}
                          </Button>
                          <Button
                            variant="secondary"
                            onPress={() => navigation?.navigate('ReceiveTokens')}
                            disabled={isLoading}
                          >
                            {t.wallet.actions.receive}
                          </Button>
                        </Column>
                      </View>
                    )}
                  </View>
                ))}
              </Column>
            </Card>
          ) : (
            <Card>
              <View
                style={{
                  alignItems: 'center',
                  paddingVertical: spacing.lg,
                }}
              >
                <Text style={{ color: colors.text_secondary }}>
                  {t.wallet.wallets.noWallets}
                </Text>
                <Button
                  variant="secondary"
                  onPress={() => {}}
                  style={{ marginTop: spacing.md }}
                >
                  {t.wallet.wallets.createWallet}
                </Button>
              </View>
            </Card>
          )}

          {/* Wallet Details */}
          {selectedWallet && (
            <Card>
              <Text
                style={{
                  fontSize: typography.size.sm,
                  fontWeight: typography.weight.semibold,
                  color: colors.text_primary,
                  marginBottom: spacing.md,
                }}
              >
                {t.wallet.details.title}
              </Text>
              <Column gap="sm">
                <DetailRow label={t.wallet.details.name} value={selectedWallet.name} />
                <DetailRow label={t.wallet.details.address} value={selectedWallet.address} />
                <DetailRow
                  label={t.wallet.details.balance}
                  value={`${selectedWallet.balance.toLocaleString()} ZHTP`}
                />
              </Column>
            </Card>
          )}

          {/* Quick Actions */}
          <Card>
            <Text
              style={{
                fontSize: typography.size.sm,
                fontWeight: typography.weight.semibold,
                color: colors.text_primary,
                marginBottom: spacing.md,
              }}
            >
              {t.wallet.quickActions.title}
            </Text>
            <Column gap="sm">
              <Button
                variant="secondary"
                onPress={() => navigation?.navigate('SendTokens')}
                disabled={isLoading}
              >
                {t.wallet.quickActions.sendTokens}
              </Button>
              <Button
                variant="secondary"
                onPress={() => navigation?.navigate('ReceiveTokens')}
                disabled={isLoading}
              >
                {t.wallet.quickActions.receiveTokens}
              </Button>
              <Button
                variant="secondary"
                onPress={() => navigation?.navigate('StakeTokens')}
                disabled={isLoading}
              >
                {t.wallet.quickActions.stakeTokens}
              </Button>
              <Button
                variant="secondary"
                onPress={() => {}}
                disabled={isLoading}
              >
                {t.wallet.quickActions.viewHistory}
              </Button>
            </Column>
          </Card>

          {/* Footer spacing */}
          <View style={{ height: spacing.xl }} />
        </Column>
      </ScrollView>
    </SafeAreaView>
  );
};

export default WalletScreen;
