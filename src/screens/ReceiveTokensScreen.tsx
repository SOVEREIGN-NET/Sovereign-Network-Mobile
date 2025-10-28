import React from 'react';
import { ScrollView, Share } from 'react-native';
import { Card, Text, Button, Column } from '../components';
import { colors, spacing } from '../theme';

const ReceiveTokensScreen = ({ navigation }: any) => {
  const walletAddress = '0xZ7kT9mN2qA4bC5dE6fG7hI8jK9lM0nO1pQ2rS3tU4v';

  const handleCopyAddress = () => {
    // In a real app, would use react-native-clipboard
    alert(`Copied to clipboard:\n${walletAddress}`);
  };

  const handleShareAddress = async () => {
    try {
      await Share.share({
        message: `Send ZHTP to my address: ${walletAddress}`,
        title: 'My ZHTP Wallet Address',
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg_dark, padding: spacing.lg }}>
      <Card>
        <Text variant="h2">Receive ZHTP</Text>
        <Column gap="md" style={{ marginTop: spacing.md }}>
          <Text variant="body" style={{ color: colors.text_secondary }}>
            Share your wallet address to receive ZHTP tokens
          </Text>

          <Card style={{ backgroundColor: colors.bg_darker }}>
            <Text variant="caption" style={{ color: colors.text_secondary, marginBottom: spacing.sm }}>
              Your Wallet Address:
            </Text>
            <Text
              variant="body"
              style={{
                fontFamily: 'monospace',
                fontSize: 12,
                color: colors.primary,
                marginBottom: spacing.md,
              }}
            >
              {walletAddress}
            </Text>
            <Text variant="caption" style={{ color: colors.text_secondary }}>
              ⚠️ Only send ZHTP tokens to this address. Using other tokens may result in loss.
            </Text>
          </Card>

          <Button onPress={handleCopyAddress}>Copy Address</Button>
          <Button onPress={handleShareAddress} variant="outline">
            Share Address
          </Button>
          <Button onPress={() => navigation.goBack()} variant="outline">
            Done
          </Button>
        </Column>
      </Card>
    </ScrollView>
  );
};

export default ReceiveTokensScreen;
