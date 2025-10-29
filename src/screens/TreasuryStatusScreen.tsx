import React from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Card,
  Text,
  Button,
  Column,
  LoadingView,
  StatBox,
  ProgressBar,
} from '../components';
import { useAsyncData } from '../hooks';
import { useTranslation } from '../i18n';
import MockDataService from '../services/MockDataService';
import { colors, spacing, typography, borderRadius } from '../theme';

const TreasuryStatusScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { data, loading } = useAsyncData(
    async () => {
      await new Promise<void>(resolve => setTimeout(resolve, 600));
      return {
        daoStats: MockDataService.getDAOStats(),
      };
    },
    []
  );

  if (loading) {
    return <LoadingView />;
  }

  const daoStats = data?.daoStats;

  // Mock budget allocation data - using translated category names
  const BUDGET_CATEGORIES = t.dao.createProposal.budgetCategories;
  const budgetAllocation = [
    { category: BUDGET_CATEGORIES[0] || 'Infrastructure', amount: 750000, percentage: 30 },
    { category: BUDGET_CATEGORIES[1] || 'Development', amount: 625000, percentage: 25 },
    { category: BUDGET_CATEGORIES[2] || 'Marketing', amount: 375000, percentage: 15 },
    { category: BUDGET_CATEGORIES[3] || 'Security', amount: 500000, percentage: 20 },
    { category: BUDGET_CATEGORIES[4] || 'Research', amount: 250000, percentage: 10 },
  ];

  const totalBudget = budgetAllocation.reduce((sum, item) => sum + item.amount, 0);

  // Mock recent transactions
  const recentTransactions = [
    {
      id: 'tx-001',
      description: 'Infrastructure Development Fund',
      amount: 50000,
      date: '2024-10-28',
      type: 'allocation',
      status: 'completed',
    },
    {
      id: 'tx-002',
      description: 'Security Audit Services',
      amount: 25000,
      date: '2024-10-27',
      type: 'expense',
      status: 'completed',
    },
    {
      id: 'tx-003',
      description: 'Marketing Campaign Q4',
      amount: 15000,
      date: '2024-10-26',
      type: 'expense',
      status: 'pending',
    },
    {
      id: 'tx-004',
      description: 'Research Grant - Mesh Networks',
      amount: 20000,
      date: '2024-10-25',
      type: 'allocation',
      status: 'completed',
    },
  ];

  const getTransactionColor = (type: string, status: string) => {
    if (status === 'pending') return colors.warning;
    return type === 'allocation' ? colors.success : colors.error;
  };

  const getTransactionIcon = (type: string) => {
    return type === 'allocation' ? '📤' : '💸';
  };

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
        <Column gap="xl">
          {/* Treasury Overview */}
          <Card>
            <Text
              style={{
                fontSize: typography.size.sm,
                fontWeight: typography.weight.semibold,
                color: colors.text_primary,
                marginBottom: spacing.md,
              }}
            >
              {t.dao.treasury.overview.title}
            </Text>
            <View
              style={{
                backgroundColor: colors.bg_darker,
                padding: spacing.lg,
                borderRadius: borderRadius.base,
                alignItems: 'center',
                marginBottom: spacing.lg,
              }}
            >
              <Text
                style={{
                  fontSize: typography.size.xs,
                  color: colors.text_secondary,
                  marginBottom: spacing.sm,
                }}
              >
                {t.dao.treasury.overview.balance}
              </Text>
              <Text
                style={{
                  fontSize: typography.size['5xl'],
                  fontWeight: typography.weight.bold,
                  color: colors.primary,
                  marginBottom: spacing.xs,
                }}
              >
                {(daoStats?.treasuryBalance || 0).toLocaleString()}
              </Text>
              <Text
                style={{
                  fontSize: typography.size.sm,
                  color: colors.text_secondary,
                }}
              >
                {t.dao.treasury.overview.unit}
              </Text>
            </View>

            {/* Quick Stats */}
            <Column
              gap="lg"
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
              }}
            >
              <StatBox
                label={t.dao.treasury.overview.members}
                value={(daoStats?.totalMembers || 0).toLocaleString()}
                style={{ flex: 1 }}
              />
              <StatBox
                label={t.dao.treasury.overview.activeProposals}
                value={(daoStats?.activeProposals || 0).toString()}
                style={{ flex: 1 }}
              />
            </Column>
          </Card>

          {/* Budget Allocation */}
          <Card>
            <Text
              style={{
                fontSize: typography.size.sm,
                fontWeight: typography.weight.semibold,
                color: colors.text_primary,
                marginBottom: spacing.md,
              }}
            >
              {t.dao.treasury.allocation.title}
            </Text>

            <Column gap="md">
              {budgetAllocation.map(item => (
                <View key={item.category}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      marginBottom: spacing.sm,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: typography.size.sm,
                        color: colors.text_primary,
                      }}
                    >
                      {item.category}
                    </Text>
                    <Text
                      style={{
                        fontSize: typography.size.sm,
                        fontWeight: typography.weight.semibold,
                        color: colors.primary,
                      }}
                    >
                      {item.percentage}%
                    </Text>
                  </View>
                  <ProgressBar percentage={item.percentage} showPercentage={false} />
                  <Text
                    style={{
                      fontSize: typography.size.xs,
                      color: colors.text_secondary,
                      marginTop: spacing.xs,
                    }}
                  >
                    {item.amount.toLocaleString()} ZHTP
                  </Text>
                </View>
              ))}
            </Column>

            {/* Total Row */}
            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: colors.border,
                paddingTop: spacing.md,
                marginTop: spacing.md,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                }}
              >
                <Text
                  style={{
                    fontSize: typography.size.sm,
                    fontWeight: typography.weight.semibold,
                    color: colors.text_primary,
                  }}
                >
                  {t.dao.treasury.allocation.total}
                </Text>
                <Text
                  style={{
                    fontSize: typography.size.sm,
                    fontWeight: typography.weight.bold,
                    color: colors.primary,
                  }}
                >
                  {totalBudget.toLocaleString()} ZHTP
                </Text>
              </View>
            </View>
          </Card>

          {/* Recent Transactions */}
          <Card>
            <Text
              style={{
                fontSize: typography.size.sm,
                fontWeight: typography.weight.semibold,
                color: colors.text_primary,
                marginBottom: spacing.md,
              }}
            >
              {t.dao.treasury.transactions.title}
            </Text>

            <Column gap="sm">
              {recentTransactions.map(tx => (
                <View
                  key={tx.id}
                  style={{
                    backgroundColor: colors.bg_darker,
                    padding: spacing.md,
                    borderRadius: borderRadius.base,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Column style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: typography.size.sm,
                        fontWeight: typography.weight.semibold,
                        color: colors.text_primary,
                        marginBottom: spacing.xs,
                      }}
                    >
                      {getTransactionIcon(tx.type)} {tx.description}
                    </Text>
                    <Text
                      style={{
                        fontSize: typography.size.xs,
                        color: colors.text_secondary,
                        marginBottom: spacing.xs,
                      }}
                    >
                      {tx.date}
                    </Text>
                    <Text
                      style={{
                        fontSize: typography.size.xs,
                        color:
                          tx.status === 'pending' ? colors.warning : colors.success,
                      }}
                    >
                      {tx.status === 'pending' ? t.dao.treasury.transactions.statuses.pending : t.dao.treasury.transactions.statuses.completed}
                    </Text>
                  </Column>
                  <Text
                    style={{
                      fontSize: typography.size.sm,
                      fontWeight: typography.weight.bold,
                      color: getTransactionColor(tx.type, tx.status),
                    }}
                  >
                    {tx.type === 'allocation' ? '+' : '-'}{tx.amount.toLocaleString()}
                  </Text>
                </View>
              ))}
            </Column>
          </Card>

          {/* Treasury Info */}
          <Card>
            <View
              style={{
                backgroundColor: colors.bg_darker,
                padding: spacing.md,
                borderRadius: borderRadius.base,
                borderLeftWidth: 4,
                borderLeftColor: colors.info,
              }}
            >
              <Text
                style={{
                  fontSize: typography.size.xs,
                  fontWeight: typography.weight.semibold,
                  color: colors.info,
                  marginBottom: spacing.sm,
                }}
              >
                {t.dao.treasury.info.title}
              </Text>
              <Text
                style={{
                  fontSize: typography.size.xs,
                  color: colors.text_secondary,
                  lineHeight: typography.size.sm * 1.5,
                }}
              >
                {t.dao.treasury.info.description}
              </Text>
            </View>
          </Card>

          {/* Action Button */}
          <Button
            variant="secondary"
            onPress={() => navigation?.goBack()}
          >
            {t.dao.treasury.backButton}
          </Button>

          {/* Footer spacing */}
          <View style={{ height: spacing.xl }} />
        </Column>
      </ScrollView>
    </SafeAreaView>
  );
};

export default TreasuryStatusScreen;
