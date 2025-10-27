import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import { Card, Text, Button, Column, Input, ProgressBar } from '../components';
import { colors, spacing } from '../theme';

const StakeTokensScreen = ({ navigation }: any) => {
  const [stakeAmount, setStakeAmount] = useState('');

  // Mock staking data
  const availableBalance = 5000;
  const currentStake = 1000;
  const rewardsRate = 5.5;

  const handleStake = () => {
    if (!stakeAmount || isNaN(Number(stakeAmount))) {
      alert('Please enter a valid amount');
      return;
    }

    const amount = Number(stakeAmount);
    if (amount > availableBalance) {
      alert('Insufficient balance');
      return;
    }

    alert(`Successfully staked ${stakeAmount} ZHTP!\nYou will earn approximately ${(amount * rewardsRate / 100).toFixed(2)} ZHTP per year.`);
    setStakeAmount('');
    navigation.goBack();
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg_dark, padding: spacing.md }}>
      <Card>
        <Text variant="h2" style={{ marginBottom: spacing.md }}>
          🔗 Stake ZHTP
        </Text>

        <Column gap="md">
          <Card style={{ backgroundColor: colors.bg_darker }}>
            <Text variant="h3" style={{ marginBottom: spacing.md }}>
              Your Stakes
            </Text>
            <Column gap="sm">
              <Column>
                <Text variant="caption" style={{ color: colors.text_secondary }}>
                  Current Stake
                </Text>
                <Text variant="h2" style={{ color: colors.primary }}>
                  {currentStake} ZHTP
                </Text>
              </Column>
              <Column style={{ marginTop: spacing.sm }}>
                <Text variant="caption" style={{ color: colors.text_secondary }}>
                  Annual Reward Rate
                </Text>
                <Text variant="h3" style={{ color: colors.success }}>
                  {rewardsRate}% APY
                </Text>
              </Column>
            </Column>
          </Card>

          <Column gap="sm">
            <Text variant="body" style={{ fontWeight: '600' }}>
              Available Balance: {availableBalance} ZHTP
            </Text>
            <ProgressBar
              percentage={(currentStake / (currentStake + availableBalance)) * 100}
              showPercentage={false}
            />
          </Column>

          <Column gap="md" style={{ marginTop: spacing.lg }}>
            <Text variant="h3">Add to Stake</Text>
            <Input
              placeholder="Amount to stake"
              value={stakeAmount}
              onChangeText={setStakeAmount}
              keyboardType="decimal-pad"
            />
            <Text variant="caption" style={{ color: colors.text_secondary }}>
              Minimum stake: 10 ZHTP • Lock period: 30 days
            </Text>
          </Column>

          <Column gap="sm" style={{ marginTop: spacing.md, padding: spacing.md, backgroundColor: colors.bg_darker, borderRadius: 8 }}>
            <Text variant="h3">ℹ️ Staking Benefits</Text>
            <Text variant="body" style={{ color: colors.text_secondary }}>
              • Earn passive rewards by securing the network
            </Text>
            <Text variant="body" style={{ color: colors.text_secondary }}>
              • Receive voting power in governance decisions
            </Text>
            <Text variant="body" style={{ color: colors.text_secondary }}>
              • Compounds automatically
            </Text>
          </Column>

          <Button onPress={handleStake} style={{ marginTop: spacing.lg }}>
            Stake Now
          </Button>
          <Button onPress={() => navigation.goBack()} variant="outline">
            Cancel
          </Button>
        </Column>
      </Card>
    </ScrollView>
  );
};

export default StakeTokensScreen;
