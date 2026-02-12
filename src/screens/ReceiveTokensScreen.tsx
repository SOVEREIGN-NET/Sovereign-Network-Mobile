import React, { useState } from 'react';
import { View, Share, Alert, Clipboard, TouchableOpacity } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Card, Text, Button, Column, ScreenLayout, SectionLabel } from '../components';
import { useWalletList } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography, borderRadius } from '../theme';

const ReceiveTokensScreen = () => {
  const { t } = useTranslation();
  const { wallets } = useWalletList();
  const [copied, setCopied] = useState(false);
  const [selectedWalletIdx, setSelectedWalletIdx] = useState(0);

  const selectedWallet = wallets[selectedWalletIdx] ?? wallets[0];
  const walletId = selectedWallet?.id || '';
  const walletType = selectedWallet?.wallet_type || 'Primary';
  const walletBalance = selectedWallet?.available_balance ?? 0;

  const handleCopyAddress = async () => {
    if (!walletId) return;
    try {
      await Clipboard.setString(walletId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy address:', error);
      Alert.alert('Error', 'Failed to copy address to clipboard');
    }
  };

  const handleShare = async () => {
    if (!walletId) return;
    try {
      await Share.share({
        message: `My ${walletType} wallet ID:\n${walletId}`,
        title: `Receive SOV — ${walletType} Wallet`,
      });
    } catch (error: any) {
      console.error('Share failed:', error);
    }
  };

  const truncatedId = walletId.length > 16
    ? `${walletId.substring(0, 8)}...${walletId.substring(walletId.length - 8)}`
    : walletId;

  return (
    <ScreenLayout paddingTop={spacing.md}>
      <Column gap="lg">

        {/* Wallet Selector */}
        {wallets.length > 1 && (
          <View
            style={{
              flexDirection: 'row',
              gap: spacing.md,
              backgroundColor: colors.bg_darker,
              borderRadius: borderRadius.lg,
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.sm,
            }}
          >
            {wallets.map((w, idx) => (
              <TouchableOpacity
                key={w.id || idx}
                onPress={() => { setSelectedWalletIdx(idx); setCopied(false); }}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: spacing.sm,
                  borderRadius: borderRadius.base,
                  backgroundColor: selectedWalletIdx === idx ? colors.bg_medium : 'transparent',
                }}
              >
                <Text
                  style={{
                    fontSize: typography.size.xs,
                    color: selectedWalletIdx === idx ? colors.primary : colors.text_secondary,
                    fontWeight: selectedWalletIdx === idx ? typography.weight.semibold : typography.weight.normal,
                  }}
                >
                  {w.wallet_type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* QR Code */}
        <Card>
          <Column gap="md">
            <Text variant="h3" style={{ textAlign: 'center' }}>
              {walletType} Wallet
            </Text>
            <Text variant="caption" style={{ textAlign: 'center', color: colors.text_secondary }}>
              {walletBalance.toFixed(2)} SOV available
            </Text>

            {walletId ? (
              <View style={{ alignItems: 'center', paddingVertical: spacing.md }}>
                <View
                  style={{
                    backgroundColor: '#FFFFFF',
                    padding: spacing.md,
                    borderRadius: borderRadius.lg,
                  }}
                >
                  <QRCode
                    value={walletId}
                    size={200}
                    backgroundColor="#FFFFFF"
                    color="#000000"
                  />
                </View>
              </View>
            ) : (
              <View
                style={{
                  alignItems: 'center',
                  paddingVertical: spacing.xl,
                }}
              >
                <Text variant="body" style={{ color: colors.text_tertiary }}>
                  No wallet available
                </Text>
              </View>
            )}
          </Column>
        </Card>

        {/* Wallet ID */}
        <Card>
          <Column gap="md">
            <Text
              style={{
                fontSize: typography.size.xs,
                color: colors.text_secondary,
              }}
            >
              Wallet ID
            </Text>
            <TouchableOpacity
              onPress={handleCopyAddress}
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
                  fontFamily: 'Courier',
                  fontWeight: '600',
                  textAlign: 'center',
                  marginBottom: spacing.xs,
                }}
              >
                {truncatedId || 'N/A'}
              </Text>
              <Text
                style={{
                  fontSize: typography.size.xs,
                  color: colors.text_secondary,
                  textAlign: 'center',
                  fontStyle: 'italic',
                }}
              >
                Tap to copy full ID
              </Text>
            </TouchableOpacity>

            <View style={{ gap: spacing.sm, flexDirection: 'row' }}>
              <Button
                onPress={handleCopyAddress}
                variant="secondary"
                style={{ flex: 1 }}
                disabled={!walletId}
              >
                {copied ? '✓ Copied' : t.receiveTokens.copyButton}
              </Button>
              <Button
                onPress={handleShare}
                variant="secondary"
                style={{ flex: 1 }}
                disabled={!walletId}
              >
                {t.receiveTokens.shareButton}
              </Button>
            </View>
          </Column>
        </Card>

        {/* Info */}
        <Card style={{ backgroundColor: colors.bg_darker }}>
          <Column gap="sm">
            <SectionLabel>{t.receiveTokens.info.title}</SectionLabel>
            <Text variant="body" style={{ color: colors.text_secondary }}>
              Share your wallet ID or QR code with the sender. SOV transfers use wallet IDs (64 hex characters).
            </Text>
          </Column>
        </Card>

      </Column>
    </ScreenLayout>
  );
};

export default ReceiveTokensScreen;
