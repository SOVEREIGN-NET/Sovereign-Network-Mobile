import React, { useState } from 'react';
import { ScrollView, View, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Text, Button, Column, Input, DetailRow } from '../components';
import { useAuth } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography, borderRadius } from '../theme';

const StakeTokensScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { currentIdentity } = useAuth();
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
    sixMonths: 5.0,
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

    if (!stakeAmount.trim()) {
      newErrors.stake = t.stakeTokens.validation.amountRequired;
    } else {
      const amount = Number.parseFloat(stakeAmount);
      if (Number.isNaN(amount)) {
        newErrors.stake = t.stakeTokens.validation.amountInvalid;
      } else if (amount <= 0) {
        newErrors.stake = t.stakeTokens.validation.amountInvalid;
      } else if (amount > availableBalance) {
        newErrors.stake = t.stakeTokens.validation.insufficientBalance;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateUnstakeForm = (): boolean => {
    const newErrors: typeof errors = {};

    if (!unstakeAmount.trim()) {
      newErrors.unstake = t.stakeTokens.validation.amountRequired;
    } else {
      const amount = Number.parseFloat(unstakeAmount);
      if (Number.isNaN(amount)) {
        newErrors.unstake = t.stakeTokens.validation.amountInvalid;
      } else if (amount <= 0) {
        newErrors.unstake = t.stakeTokens.validation.amountInvalid;
      } else if (amount > currentStake) {
        newErrors.unstake = t.stakeTokens.validation.insufficientBalance;
      }
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

  const currentAPY = apyRates[selectedDuration as keyof typeof apyRates] || 5.5;

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
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button
              variant={activeTab === 'stake' ? 'primary' : 'outline'}
              onPress={() => setActiveTab('stake')}
              style={{ flex: 1 }}
            >
              {t.stakeTokens.stakeButton}
            </Button>
            <Button
              variant={activeTab === 'unstake' ? 'primary' : 'outline'}
              onPress={() => setActiveTab('unstake')}
              style={{ flex: 1 }}
            >
              {t.stakeTokens.unstakeButton}
            </Button>
          </View>

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

                <View>
                  <Input
                    placeholder={t.stakeTokens.stakePlaceholder}
                    value={stakeAmount}
                    onChangeText={(text) => {
                      setStakeAmount(text);
                      if (errors.stake) {
                        setErrors((prev) => ({ ...prev, stake: undefined }));
                      }
                    }}
                    keyboardType="decimal-pad"
                    editable={!isStaking}
                    style={{
                      borderColor: errors.stake ? colors.error : colors.border,
                    }}
                  />
                  {errors.stake && (
                    <Text
                      variant="caption"
                      style={{ color: colors.error, marginTop: spacing.xs }}
                    >
                      {errors.stake}
                    </Text>
                  )}
                </View>

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
                <View>
                  <Input
                    placeholder={t.stakeTokens.unstakePlaceholder}
                    value={unstakeAmount}
                    onChangeText={(text) => {
                      setUnstakeAmount(text);
                      if (errors.unstake) {
                        setErrors((prev) => ({ ...prev, unstake: undefined }));
                      }
                    }}
                    keyboardType="decimal-pad"
                    editable={!isStaking}
                    style={{
                      borderColor: errors.unstake ? colors.error : colors.border,
                    }}
                  />
                  {errors.unstake && (
                    <Text
                      variant="caption"
                      style={{ color: colors.error, marginTop: spacing.xs }}
                    >
                      {errors.unstake}
                    </Text>
                  )}
                </View>

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

          <Button
            onPress={() => navigation.goBack()}
            variant="outline"
            disabled={isStaking}
          >
            {t.stakeTokens.cancelButton}
          </Button>

          <View style={{ height: spacing.xl }} />
        </Column>
      </ScrollView>
    </SafeAreaView>
  );
};

export default StakeTokensScreen;
