import React, { useState } from 'react';
import { ScrollView, View, Share, Alert, Clipboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Text, Button, Column } from '../components';
import { useAuth } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography, borderRadius } from '../theme';

const ReceiveTokensScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { currentIdentity } = useAuth();
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState('ZHTP');

  // Mock wallet address
  const walletAddress = currentIdentity?.wallets?.[0]?.address || '0x' + Math.random().toString(16).substr(2, 40);

  const handleCopyAddress = async () => {
    await Clipboard.setString(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `${t.receiveTokens.address}: ${walletAddress}`,
        title: `Receive ${selectedCurrency}`,
      });
    } catch (error) {
      Alert.alert('Share Error', 'Failed to share address');
    }
  };

  const currencies = ['ZHTP', 'USDT', 'ETH', 'BTC'];

  // Mock recent transactions
  const recentTransactions = [
    {
      id: '1',
      sender: '0x1234...5678',
      amount: 100,
      currency: 'ZHTP',
      date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toLocaleDateString(),
      status: 'Completed',
    },
    {
      id: '2',
      sender: '0x9abc...def0',
      amount: 50,
      currency: 'ZHTP',
      date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toLocaleDateString(),
      status: 'Completed',
    },
  ];

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
        <Column gap="lg">
          <Text variant="h1">{t.receiveTokens.title.replace('{currency}', selectedCurrency)}</Text>

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
                  style={{ flex: 0, paddingHorizontal: spacing.md }}
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
                      fontFamily: 'monospace',
                      color: colors.primary,
                      letterSpacing: 0.5,
                    }}
                    selectable
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
                    aspectRatio: 1,
                    justifyContent: 'center',
                  }}
                >
                  {/* QR Code Placeholder */}
                  <View
                    style={{
                      width: 200,
                      height: 200,
                      backgroundColor: colors.white,
                      borderRadius: 8,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: colors.bg_darkest, fontSize: typography.size.lg }}>
                      QR Code
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
              <Text
                style={{
                  fontSize: typography.size.sm,
                  fontWeight: typography.weight.semibold,
                  color: colors.text_primary,
                }}
              >
                {t.receiveTokens.info.title}
              </Text>
              <Text variant="body" style={{ color: colors.text_secondary }}>
                {t.receiveTokens.info.description}
              </Text>
            </Column>
          </Card>

          {/* Recent Transactions */}
          {recentTransactions.length > 0 && (
            <Card>
              <Column gap="md">
                <Text
                  style={{
                    fontSize: typography.size.sm,
                    fontWeight: typography.weight.semibold,
                    color: colors.text_primary,
                  }}
                >
                  {t.receiveTokens.recentlyReceived}
                </Text>

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

          <View style={{ height: spacing.xl }} />
        </Column>
      </ScrollView>
    </SafeAreaView>
  );
};

export default ReceiveTokensScreen;
