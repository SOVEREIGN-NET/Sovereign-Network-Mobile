import React, { useState } from 'react';
import { View, Share, Alert } from 'react-native';
import { Card, Text, Button, Column, ScreenLayout, SectionLabel } from '../components';
import { useAuth } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography, borderRadius } from '../theme';

const ReceiveTokensScreen = () => {
  const { t } = useTranslation();
  const { currentIdentity } = useAuth();
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState('SOV');

  // Get wallet address from wallet ID
  const primaryWallet = currentIdentity?.wallets?.primary;
  const getWalletAddress = () => {
    if (!primaryWallet?.id) {
      return '0x' + Math.random().toString(16).slice(2, 42);
    }
    // Handle byte array
    if (Array.isArray(primaryWallet.id)) {
      const hexString = primaryWallet.id.map((byte: number) => byte.toString(16).padStart(2, '0')).join('');
      return '0x' + hexString.substring(0, 40).padEnd(40, '0');
    }
    // Handle string
    if (typeof primaryWallet.id === 'string') {
      return '0x' + primaryWallet.id.substring(0, 40).padEnd(40, '0');
    }
    return '0x' + Math.random().toString(16).slice(2, 42);
  };
  const walletAddress = getWalletAddress();

  const handleCopyAddress = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    try {
      const title = typeof t.receiveTokens.title === 'string'
        ? t.receiveTokens.title.replace('{currency}', selectedCurrency)
        : `Receive ${selectedCurrency}`;
      await Share.share({
        message: `${t.receiveTokens.address}: ${walletAddress}`,
        title,
      });
    } catch (error: any) {
      console.error('Share failed:', error);
      Alert.alert('Share Error', error.message || 'Failed to share address');
    }
  };

  const currencies = ['SOV', 'USDT', 'ETH', 'BTC'];

  // Mock recent transactions
  const recentTransactions = [
    {
      id: '1',
      sender: '0x1234...5678',
      amount: 100,
      currency: 'SOV',
      date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toLocaleDateString(),
      status: 'Completed',
    },
    {
      id: '2',
      sender: '0x9abc...def0',
      amount: 50,
      currency: 'SOV',
      date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toLocaleDateString(),
      status: 'Completed',
    },
  ];

  return (
    <ScreenLayout paddingTop={spacing.md}>
      <Column gap="lg">

        {/* Currency Selector */}
        <View>
          <Text variant="body" style={{ marginBottom: spacing.sm, color: colors.text_secondary }}>
            {t.sendTokens.currency}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              gap: spacing.sm,
              flexWrap: 'wrap',
            }}
          >
            {currencies.map((currency) => (
              <Button
                key={currency}
                variant={selectedCurrency === currency ? 'primary' : 'outline'}
                onPress={() => setSelectedCurrency(currency)}
              >
                {currency}
              </Button>
            ))}
          </View>
        </View>

        {/* Address Card */}
        <Card>
          <Column gap="md">
            <View>
              <Text
                style={{
                  fontSize: typography.size.xs,
                  color: colors.text_secondary,
                  marginBottom: spacing.sm,
                }}
              >
                {t.receiveTokens.address}
              </Text>
              <View
                style={{
                  backgroundColor: colors.bg_darker,
                  padding: spacing.md,
                  borderRadius: borderRadius.base,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text
                  style={{
                    fontSize: typography.size.sm,
                    color: colors.primary,
                    letterSpacing: 0.5,
                  }}
                >
                  {walletAddress}
                </Text>
              </View>
            </View>

            {/* Copy and Share Buttons */}
            <View style={{ gap: spacing.sm, flexDirection: 'row' }}>
              <Button
                onPress={handleCopyAddress}
                variant="secondary"
                style={{ flex: 1 }}
              >
                {copied ? '✓ ' + t.receiveTokens.copied : t.receiveTokens.copyButton}
              </Button>
              <Button onPress={handleShare} variant="secondary" style={{ flex: 1 }}>
                {t.receiveTokens.shareButton}
              </Button>
            </View>
          </Column>
        </Card>

        {/* QR Code Section */}
        <Card>
          <Column gap="md">
            <Button
              variant="secondary"
              onPress={() => setShowQR(!showQR)}
            >
              {showQR ? t.receiveTokens.hideQR : t.receiveTokens.showQR}
            </Button>

            {showQR && (
              <View
                style={{
                  backgroundColor: colors.bg_darker,
                  padding: spacing.md,
                  borderRadius: borderRadius.base,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <View
                  style={{
                    width: 200,
                    height: 200,
                    backgroundColor: colors.white,
                    borderRadius: borderRadius.base,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: colors.bg_darkest, fontSize: typography.size.lg }}>
                    {t.receiveTokens.qrCode}
                  </Text>
                  <Text
                    style={{
                      color: colors.text_secondary,
                      fontSize: typography.size.xs,
                      marginTop: spacing.xs,
                    }}
                  >
                    {walletAddress.substring(0, 8)}...
                  </Text>
                </View>
              </View>
            )}
          </Column>
        </Card>

        {/* Info Section */}
        <Card style={{ backgroundColor: colors.bg_darker }}>
          <Column gap="sm">
            <SectionLabel>{t.receiveTokens.info.title}</SectionLabel>
            <Text variant="body" style={{ color: colors.text_secondary }}>
              {t.receiveTokens.info.description}
            </Text>
          </Column>
        </Card>

        {/* Recent Transactions */}
        {recentTransactions.length > 0 && (
          <Card>
            <Column gap="md">
              <SectionLabel>{t.receiveTokens.recentlyReceived}</SectionLabel>

              <Column gap="sm">
                {recentTransactions.map((tx) => (
                  <View
                    key={tx.id}
                    style={{
                      backgroundColor: colors.bg_darker,
                      padding: spacing.md,
                      borderRadius: borderRadius.base,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: spacing.sm,
                      }}
                    >
                      <Text variant="body" style={{ color: colors.text_secondary }}>
                        From: {tx.sender}
                      </Text>
                      <Text style={{ fontSize: typography.size.sm, color: colors.success }}>
                        +{tx.amount} {tx.currency}
                      </Text>
                    </View>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Text
                        variant="caption"
                        style={{ color: colors.text_tertiary }}
                      >
                        {tx.date}
                      </Text>
                      <Text
                        style={{
                          fontSize: typography.size.xs,
                          color: colors.success,
                        }}
                      >
                        {tx.status}
                      </Text>
                    </View>
                  </View>
                ))}
              </Column>
            </Column>
          </Card>
        )}
      </Column>
    </ScreenLayout>
  );
};

export default ReceiveTokensScreen;
