import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import { Card, Text, Button, Column, ProgressBar } from '../components';
import { colors, spacing } from '../theme';

const ClaimUBIScreen = ({ navigation }: any) => {
  const [claimed, setClaimed] = useState(false);

  // Mock UBI data
  const monthlyUBI = 100;
  const nextClaimDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString();
  const claimedThisMonth = 100;

  const handleClaim = () => {
    setClaimed(true);
    setTimeout(() => {
      alert('UBI claimed successfully! 100 ZHTP has been added to your wallet.');
      navigation.goBack();
    }, 1500);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg_dark, padding: spacing.md }}>
      <Card>
        <Text variant="h2" style={{ marginBottom: spacing.md }}>
          💰 Universal Basic Income
        </Text>

        <Column gap="md">
          <Card style={{ backgroundColor: colors.bg_darker }}>
            <Text variant="h3" style={{ color: colors.success, marginBottom: spacing.sm }}>
              Your Monthly UBI
            </Text>
            <Text variant="h1" style={{ color: colors.primary, marginBottom: spacing.xs }}>
              {monthlyUBI} ZHTP
            </Text>
            <Text variant="caption" style={{ color: colors.text_secondary }}>
              Distributed automatically every 30 days
            </Text>
          </Card>

          <Column gap="sm">
            <Text variant="body" style={{ fontWeight: '600' }}>
              This Month's Status
            </Text>
            <ProgressBar percentage={100} showPercentage />
            <Text variant="caption" style={{ color: colors.success }}>
              ✓ Fully claimed ({claimedThisMonth} ZHTP)
            </Text>
          </Column>

          <Column gap="sm">
            <Text variant="body" style={{ fontWeight: '600' }}>
              Next Claim Available
            </Text>
            <Text variant="body">{nextClaimDate}</Text>
          </Column>

          <Column gap="sm" style={{ marginTop: spacing.lg, padding: spacing.md, backgroundColor: colors.bg_darker, borderRadius: 8 }}>
            <Text variant="h3">ℹ️ About UBI</Text>
            <Text variant="body" style={{ color: colors.text_secondary }}>
              Universal Basic Income is automatically distributed to all ZHTP network participants who meet identity verification requirements.
            </Text>
            <Text variant="body" style={{ color: colors.text_secondary, marginTop: spacing.sm }}>
              • Distribution: Monthly • Verification: Zero-Knowledge DID • Network-wide: All participants
            </Text>
          </Column>

          <Button
            onPress={handleClaim}
            disabled={claimed}
            style={{ marginTop: spacing.lg }}
          >
            {claimed ? 'Claiming...' : 'Claim This Month\'s UBI'}
          </Button>
          <Button onPress={() => navigation.goBack()} variant="outline">
            Back
          </Button>
        </Column>
      </Card>
    </ScrollView>
  );
};

export default ClaimUBIScreen;
