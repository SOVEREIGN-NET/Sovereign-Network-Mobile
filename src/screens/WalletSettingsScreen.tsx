import React, { useState } from 'react';
import { View, Alert } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import {
  Card,
  Text,
  Button,
  Column,
  Row,
  LoadingView,
  ScreenLayout,
} from '../components';
import { useAuth, useWalletList } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography, borderRadius } from '../theme';

const WalletSettingsScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { currentIdentity, isLoading } = useAuth();
  const { wallets } = useWalletList();
  const [activeWallet] = useState<string>('primary');

  if (!currentIdentity || isLoading) {
    return <LoadingView />;
  }

  const walletEntries = wallets.map((wallet) => [wallet.wallet_type, wallet] as const);

  const truncateId = (id: any) => {
    if (!id) return 'unknown';

    // If it's a byte array, convert to hex string
    if (Array.isArray(id)) {
      const hexString = id.map(byte => byte.toString(16).padStart(2, '0')).join('');
      return `${hexString.substring(0, 12)}...${hexString.substring(hexString.length - 12)}`;
    }

    // If it's already a string
    if (typeof id === 'string' && id !== '') {
      return `${id.substring(0, 12)}...${id.substring(id.length - 12)}`;
    }

    return 'unknown';
  };

  const copyToClipboard = (id: any) => {
    let textToCopy = '';
    if (Array.isArray(id)) {
      textToCopy = id.map(byte => byte.toString(16).padStart(2, '0')).join('');
    } else if (typeof id === 'string') {
      textToCopy = id;
    }

    if (textToCopy) {
      Clipboard.setString(textToCopy);
      Alert.alert('Copied', 'Wallet ID copied to clipboard');
    }
  };

  return (
    <ScreenLayout paddingTop={spacing.md}>
      <Column gap="lg">
        {/* Wallets List */}
        <Card>
          <Text
            style={{
              fontSize: typography.size.sm,
              fontWeight: typography.weight.semibold,
              color: colors.text_primary,
              marginBottom: spacing.md,
            }}
          >
            {t.wallet.settings.walletDetails}
          </Text>

          <Column gap="md">
            {walletEntries.map(([walletType, wallet]) => {
              const normalizedType = walletType.toLowerCase();
              return (
              <View
                key={walletType}
                style={{
                  backgroundColor: activeWallet === normalizedType ? colors.bg_darker : 'transparent',
                  padding: spacing.md,
                  borderRadius: borderRadius.base,
                  borderWidth: activeWallet === normalizedType ? 1 : 0,
                  borderColor: colors.primary,
                }}
              >
                <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                  <Text
                    style={{
                      fontSize: typography.size.sm,
                      fontWeight: typography.weight.semibold,
                      color: colors.text_primary,
                    }}
                  >
                    {wallet.name || wallet.wallet_type}
                  </Text>
                  <Text
                    style={{
                      fontSize: typography.size.xs,
                      color: colors.text_secondary,
                    }}
                  >
                    {Math.floor(wallet.total_balance).toLocaleString()} SOV
                  </Text>
                </Row>

                <Text
                  style={{
                    fontSize: typography.size.xs,
                    color: colors.text_secondary,
                    marginBottom: spacing.xs,
                  }}
                >
                  ID: {truncateId(wallet.id)}
                </Text>

                <Button
                  variant="secondary"
                  size="sm"
                  onPress={() => copyToClipboard(wallet.id)}
                >
                  {t.wallet.settings.copyId}
                </Button>
              </View>
            );
            })}
          </Column>
        </Card>

        {/* Settings Options */}
        <Card>
          <Text
            style={{
              fontSize: typography.size.sm,
              fontWeight: typography.weight.semibold,
              color: colors.text_primary,
              marginBottom: spacing.md,
            }}
          >
            {t.wallet.settings.title}
          </Text>

          <Column gap="sm">
            <Button
              variant="secondary"
              onPress={() => {
                // TODO: Implement wallet export
              }}
            >
              {t.wallet.settings.exportWallet}
            </Button>
            <Button
              variant="secondary"
              onPress={() => {
                // TODO: Implement recovery options view
              }}
            >
              {t.wallet.settings.viewRecoveryOptions}
            </Button>
          </Column>
        </Card>

      </Column>
    </ScreenLayout>
  );
};

export default WalletSettingsScreen;
