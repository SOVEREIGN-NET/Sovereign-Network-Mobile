import React, { useState } from 'react';
import { View, Alert } from 'react-native';
import { Card, Text, Button, Column, DetailRow, ScreenLayout, FormField, TabSelector, ActionFooter } from '../components';
import { useTranslation } from '../i18n';
import { colors, spacing, typography } from '../theme';

const StakeTokensScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const [stakeAmount, setStakeAmount] = useState('');
  const [unstakeAmount, setUnstakeAmount] = useState('');
  const [selectedDuration, setSelectedDuration] = useState('oneYear');
  const [isStaking, setIsStaking] = useState(false);
  const [activeTab, setActiveTab] = useState<'stake' | 'unstake'>('stake');
  const [errors, setErrors] = useState<{ stake?: string; unstake?: string }>({});

  // Mock staking data
  const availableBalance = 5000;
  const currentStake = 1000;
  const stakingRewards = 55;
  const apyRates: Record<string, number> = {
    threeMonths: 4.5,
    sixMonths: 5,
    oneYear: 5.5,
    twoYears: 6.5,
  };

  const durations = [
    { key: 'threeMonths', label: t.stakeTokens.durations.threeMonths },
    { key: 'sixMonths', label: t.stakeTokens.durations.sixMonths },
    { key: 'oneYear', label: t.stakeTokens.durations.oneYear },
    { key: 'twoYears', label: t.stakeTokens.durations.twoYears },
  ];

  const validateStakeForm = (): boolean => {
    const newErrors: typeof errors = {};

    if (stakeAmount.trim()) {
      const amount = Number.parseFloat(stakeAmount);
      if (Number.isNaN(amount)) {
        newErrors.stake = t.stakeTokens.validation.amountInvalid;
      } else if (amount <= 0) {
        newErrors.stake = t.stakeTokens.validation.amountInvalid;
      } else if (amount > availableBalance) {
        newErrors.stake = t.stakeTokens.validation.insufficientBalance;
      }
    } else {
      newErrors.stake = t.stakeTokens.validation.amountRequired;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateUnstakeForm = (): boolean => {
    const newErrors: typeof errors = {};

    if (unstakeAmount.trim()) {
      const amount = Number.parseFloat(unstakeAmount);
      if (Number.isNaN(amount)) {
        newErrors.unstake = t.stakeTokens.validation.amountInvalid;
      } else if (amount <= 0) {
        newErrors.unstake = t.stakeTokens.validation.amountInvalid;
      } else if (amount > currentStake) {
        newErrors.unstake = t.stakeTokens.validation.insufficientBalance;
      }
    } else {
      newErrors.unstake = t.stakeTokens.validation.amountRequired;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleStake = async () => {
    if (!validateStakeForm()) {
      return;
    }

    setIsStaking(true);

    // Simulate processing
    setTimeout(() => {
      Alert.alert(
        t.stakeTokens.success.title,
        t.stakeTokens.success.message,
        [
          {
            text: t.stakeTokens.success.button,
            onPress: () => {
              setIsStaking(false);
              navigation.navigate('WalletMain');
            },
          },
        ]
      );
      setStakeAmount('');
    }, 500);
  };

  const handleUnstake = async () => {
    if (!validateUnstakeForm()) {
      return;
    }

    setIsStaking(true);

    // Simulate processing
    setTimeout(() => {
      Alert.alert(
        t.stakeTokens.success.title,
        `${unstakeAmount} ZHTP will be unstaked. 7-day unlock period applies.`,
        [
          {
            text: 'OK',
            onPress: () => {
              setIsStaking(false);
              setUnstakeAmount('');
            },
          },
        ]
      );
    }, 500);
  };

  const currentAPY = apyRates[selectedDuration] || 5.5;

  return (
    <ScreenLayout>
      <Column gap="lg">
          <Text variant="h1">{t.stakeTokens.title.replace('{currency}', 'ZHTP')}</Text>

          {/* Current Staking Status */}
          <Card>
            <Column gap="md">
              <DetailRow label={t.stakeTokens.currentStake} value={`${currentStake} ZHTP`} />
              <DetailRow label={t.stakeTokens.stakingRewards} value={`${stakingRewards} ZHTP`} />
              <DetailRow label={t.stakeTokens.availableBalance} value={`${availableBalance} ZHTP`} />
              <DetailRow label={t.stakeTokens.apyRate} value={`${currentAPY}%`} />
            </Column>
          </Card>

          {/* Tab Selector */}
          <TabSelector
            tabs={[
              { id: 'stake', label: t.stakeTokens.stakeButton },
              { id: 'unstake', label: t.stakeTokens.unstakeButton },
            ]}
            activeTab={activeTab}
            onTabChange={(tab) => setActiveTab(tab as 'stake' | 'unstake')}
          />

          {/* Stake Tab */}
          {activeTab === 'stake' && (
            <Card>
              <Column gap="md">
                <View>
                  <Text
                    style={{
                      fontSize: typography.size.sm,
                      fontWeight: typography.weight.semibold,
                      color: colors.text_primary,
                      marginBottom: spacing.sm,
                    }}
                  >
                    {t.stakeTokens.duration}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                    {durations.map((duration) => (
                      <Button
                        key={duration.key}
                        variant={selectedDuration === duration.key ? 'primary' : 'outline'}
                        onPress={() => setSelectedDuration(duration.key)}
                        style={{ flex: 0, paddingHorizontal: spacing.md }}
                      >
                        {duration.label}
                      </Button>
                    ))}
                  </View>
                  <Text
                    style={{
                      fontSize: typography.size.xs,
                      color: colors.success,
                      marginTop: spacing.sm,
                    }}
                  >
                    APY: {currentAPY}%
                  </Text>
                </View>

                <FormField
                  label=""
                  placeholder={t.stakeTokens.stakePlaceholder}
                  value={stakeAmount}
                  onChangeText={(text) => {
                    setStakeAmount(text);
                    if (errors.stake) {
                      setErrors((prev) => ({ ...prev, stake: undefined }));
                    }
                  }}
                  keyboardType="decimal-pad"
                  error={errors.stake}
                  editable={!isStaking}
                  containerStyle={{ marginBottom: 0 }}
                />

                <Card style={{ backgroundColor: colors.bg_darker }}>
                  <Column gap="sm">
                    <Text
                      style={{
                        fontSize: typography.size.xs,
                        color: colors.text_secondary,
                      }}
                    >
                      Estimated Annual Reward:
                    </Text>
                    <Text
                      style={{
                        fontSize: typography.size.lg,
                        fontWeight: typography.weight.semibold,
                        color: colors.success,
                      }}
                    >
                      {stakeAmount ? (Number(stakeAmount) * (currentAPY / 100)).toFixed(2) : '0'} ZHTP
                    </Text>
                  </Column>
                </Card>

                <Button
                  onPress={handleStake}
                  disabled={isStaking || !stakeAmount}
                  style={{ opacity: isStaking || !stakeAmount ? 0.5 : 1 }}
                >
                  {isStaking ? t.stakeTokens.stakingButton : t.stakeTokens.stakeButton}
                </Button>
              </Column>
            </Card>
          )}

          {/* Unstake Tab */}
          {activeTab === 'unstake' && (
            <Card>
              <Column gap="md">
                <FormField
                  label=""
                  placeholder={t.stakeTokens.unstakePlaceholder}
                  value={unstakeAmount}
                  onChangeText={(text) => {
                    setUnstakeAmount(text);
                    if (errors.unstake) {
                      setErrors((prev) => ({ ...prev, unstake: undefined }));
                    }
                  }}
                  keyboardType="decimal-pad"
                  error={errors.unstake}
                  editable={!isStaking}
                  containerStyle={{ marginBottom: 0 }}
                />

                <Card
                  style={{
                    backgroundColor: colors.warning,
                  }}
                >
                  <Text variant="body" style={{ color: colors.bg_darkest }}>
                    ⚠️ 7-day unlock period applies. Tokens will be unavailable during this time.
                  </Text>
                </Card>

                <Button
                  onPress={handleUnstake}
                  disabled={isStaking || !unstakeAmount}
                  variant="outline"
                  style={{
                    borderColor: colors.warning,
                    opacity: isStaking || !unstakeAmount ? 0.5 : 1,
                  }}
                >
                  {isStaking ? t.stakeTokens.unstakingButton : t.stakeTokens.unstakeButton}
                </Button>
              </Column>
            </Card>
          )}

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
                ℹ️ Staking Information
              </Text>
              <Text variant="body" style={{ color: colors.text_secondary }}>
                • Earn passive rewards by securing the network
              </Text>
              <Text variant="body" style={{ color: colors.text_secondary }}>
                • Longer lock periods offer higher APY rates
              </Text>
              <Text variant="body" style={{ color: colors.text_secondary }}>
                • Rewards are compounded automatically
              </Text>
            </Column>
          </Card>

          <ActionFooter
            actions={[
              {
                label: t.stakeTokens.cancelButton,
                onPress: () => navigation.goBack(),
                variant: 'secondary',
                disabled: isStaking,
              },
            ]}
          />
        </Column>
      </ScreenLayout>
    );
};

export default StakeTokensScreen;
