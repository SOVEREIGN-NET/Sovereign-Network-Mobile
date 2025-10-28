import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import {
  Card,
  Text,
  Button,
  LoadingView,
  Column,
  ListItem,
} from '../components';
import { useAsyncData } from '../hooks';
import { useTranslation } from '../i18n';
import MockDataService from '../services/MockDataService';
import { colors, spacing } from '../theme';
import {
  getTransactionIcon,
  getTransactionColor,
} from '../utils/colors';

const WalletScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const [selectedWalletId, setSelectedWalletId] = useState<string>('wallet-1');

  const { data, loading } = useAsyncData(
    async () => {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 500));
      return {
        wallets: MockDataService.getWallets(),
        transactions: MockDataService.getTransactions(),
      };
    },
    [],
  );

  if (loading) {
    return <LoadingView />;
  }

  const wallets = data?.wallets || [];
  const transactions = data?.transactions || [];
  const selectedWallet = wallets.find(w => w.id === selectedWalletId);

  const getStatusColor = (status: string): string => {
    if (status === 'confirmed') return colors.success;
    if (status === 'pending') return colors.warning;
    return colors.error;
  };

  return (
    <ScrollView
      testID="wallet-screen"
      style={{
        flex: 1,
        backgroundColor: colors.bg_dark,
        padding: spacing.lg,
      }}
    >
      {/* Wallet Selection */}
      <Card>
        <Text variant="h3">{t.wallet.title}</Text>
        <Column gap="sm">
          {wallets.map(wallet => (
            <ListItem
              key={wallet.id}
              title={wallet.name}
              subtitle={wallet.address.slice(0, 20) + '...'}
              rightContent={
                <Column>
                  <Text variant="body" style={{ fontWeight: '600', color: colors.primary }}>
                    {wallet.balance.toLocaleString()}
                  </Text>
                  <Text variant="caption" style={{ color: colors.text_secondary }}>
                    {wallet.currency}
                  </Text>
                </Column>
              }
              onPress={() => setSelectedWalletId(wallet.id)}
              style={{
                backgroundColor:
                  selectedWalletId === wallet.id ? colors.surface : colors.bg_darker,
              }}
            />
          ))}
        </Column>
      </Card>

      {/* Balance Display */}
      {selectedWallet && (
        <Card>
          <Text variant="h3">{t.wallet.balance.title}</Text>
          <View style={{ alignItems: 'center', paddingVertical: spacing.lg, marginBottom: spacing.md }}>
            <Text variant="h1" style={{ color: colors.primary, marginBottom: spacing.xs }}>
              {selectedWallet.balance.toLocaleString()}
            </Text>
            <Text variant="body" style={{ color: colors.text_secondary }}>
              {selectedWallet.currency}
            </Text>
          </View>
          <Text
            variant="caption"
            style={{
              textAlign: 'center',
              color: colors.text_secondary,
              fontFamily: 'monospace',
            }}
          >
            {selectedWallet.address}
          </Text>
        </Card>
      )}

      {/* Quick Actions */}
      <Card>
        <Text variant="h3">{t.wallet.actions.title}</Text>
        <Column gap="sm">
          <Button onPress={() => navigation.navigate('SendTokens')}>
            <Text>{t.wallet.actions.sendZhtp}</Text>
          </Button>
          <Button onPress={() => navigation.navigate('ReceiveTokens')}>
            <Text>{t.wallet.actions.receiveZhtp}</Text>
          </Button>
          <Button onPress={() => navigation.navigate('Dashboard', { screen: 'ClaimUBI' })}>
            <Text>{t.wallet.actions.claimUbi}</Text>
          </Button>
          <Button onPress={() => navigation.navigate('StakeTokens')}>
            <Text>{t.wallet.actions.stakeZhtp}</Text>
          </Button>
        </Column>
      </Card>

      {/* Recent Transactions */}
      <Card>
        <Text variant="h3">{t.wallet.transactions.title}</Text>
        {transactions.length === 0 ? (
          <Text variant="body" style={{ textAlign: 'center', paddingVertical: spacing.md, color: colors.text_secondary }}>
            {t.wallet.transactions.noTransactions}
          </Text>
        ) : (
          <Column gap="sm">
            {transactions.map(transaction => (
              <ListItem
                key={transaction.id}
                icon={getTransactionIcon(transaction.type)}
                title={transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)}
                subtitle={new Date(transaction.timestamp).toLocaleDateString()}
                rightContent={
                  <Column>
                    <Text
                      variant="body"
                      style={{
                        fontWeight: '600',
                        color: getTransactionColor(transaction.type),
                      }}
                    >
                      {transaction.type === 'send' ? '-' : '+'}
                      {transaction.amount.toLocaleString()}
                    </Text>
                    <Text
                      variant="caption"
                      style={{
                        textAlign: 'right',
                        color: getStatusColor(transaction.status),
                      }}
                    >
                      {transaction.status.charAt(0).toUpperCase() +
                        transaction.status.slice(1)}
                    </Text>
                  </Column>
                }
              />
            ))}
          </Column>
        )}
      </Card>
    </ScrollView>
  );
};

export default WalletScreen;
