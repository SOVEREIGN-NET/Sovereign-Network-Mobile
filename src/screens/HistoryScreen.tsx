import React, { useState } from 'react';
import { View, ScrollView } from 'react-native';
import {
  Card,
  Text,
  Column,
  ScreenLayout,
  HeaderBar,
  SideDrawer,
  DrawerItem,
} from '../components';
import { useAuth } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography, borderRadius } from '../theme';

const HistoryScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { currentIdentity } = useAuth();

  const mockTransactions = [
    {
      id: '1',
      type: 'sent',
      address: 'did:zhtp:abc123...xyz',
      amount: '50.00',
      status: 'completed',
      time: '2 hours ago',
    },
    {
      id: '2',
      type: 'received',
      address: 'did:zhtp:def456...uvw',
      amount: '100.50',
      status: 'completed',
      time: '5 hours ago',
    },
    {
      id: '3',
      type: 'sent',
      address: 'did:zhtp:ghi789...rst',
      amount: '25.75',
      status: 'pending',
      time: '1 day ago',
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return colors.success;
      case 'pending':
        return colors.warning;
      case 'failed':
        return colors.error;
      default:
        return colors.text_secondary;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return '✓';
      case 'pending':
        return '⏳';
      case 'failed':
        return '✗';
      default:
        return '○';
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
      <HeaderBar />

      <ScreenLayout paddingTop={spacing.md}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Column gap="lg" style={{ paddingBottom: spacing.xl }}>
            {/* Header */}
            <View style={{ paddingHorizontal: spacing.md }}>
              <Text
                style={{
                  fontSize: typography.size.lg,
                  fontWeight: typography.weight.semibold,
                  color: colors.text_primary,
                }}
              >
                {t.history.title}
              </Text>
            </View>

            {/* Transactions List */}
            {mockTransactions.length > 0 ? (
              <View style={{ paddingHorizontal: spacing.md }}>
                <Column gap="md">
                  {mockTransactions.map((transaction) => (
                    <Card key={transaction.id} style={{ marginHorizontal: 0 }}>
                      <View style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm }}>
                          <View style={{ flex: 1 }}>
                            <Text
                              style={{
                                fontSize: typography.size.sm,
                                fontWeight: typography.weight.semibold,
                                color: colors.text_primary,
                                marginBottom: spacing.xs,
                              }}
                            >
                              {transaction.type === 'sent' ? t.history.sent : t.history.received}
                            </Text>
                            <Text
                              style={{
                                fontSize: typography.size.xs,
                                color: colors.text_secondary,
                              }}
                              numberOfLines={1}
                            >
                              {transaction.address}
                            </Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text
                              style={{
                                fontSize: typography.size.sm,
                                fontWeight: typography.weight.semibold,
                                color: transaction.type === 'sent' ? colors.error : colors.success,
                                marginBottom: spacing.xs,
                              }}
                            >
                              {transaction.type === 'sent' ? '-' : '+'}{transaction.amount} SOV
                            </Text>
                            <Text
                              style={{
                                fontSize: typography.size.xs,
                                color: colors.text_secondary,
                              }}
                            >
                              {transaction.time}
                            </Text>
                          </View>
                        </View>

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border }}>
                          <Text
                            style={{
                              fontSize: typography.size.xs,
                              color: colors.text_secondary,
                            }}
                          >
                            {t.history.status}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                            <Text
                              style={{
                                fontSize: typography.size.xs,
                                color: getStatusColor(transaction.status),
                                fontWeight: typography.weight.semibold,
                              }}
                            >
                              {getStatusIcon(transaction.status)}
                            </Text>
                            <Text
                              style={{
                                fontSize: typography.size.xs,
                                color: getStatusColor(transaction.status),
                                textTransform: 'capitalize',
                              }}
                            >
                              {t.history[transaction.status as keyof typeof t.history] || transaction.status}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </Card>
                  ))}
                </Column>
              </View>
            ) : (
              <View style={{ paddingHorizontal: spacing.md }}>
                <Card style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
                  <Text
                    style={{
                      fontSize: typography.size.lg,
                      fontWeight: typography.weight.semibold,
                      color: colors.text_primary,
                      marginBottom: spacing.sm,
                    }}
                  >
                    {t.history.empty}
                  </Text>
                  <Text
                    style={{
                      fontSize: typography.size.sm,
                      color: colors.text_secondary,
                    }}
                  >
                    {t.history.emptyDescription}
                  </Text>
                </Card>
              </View>
            )}
          </Column>
        </ScrollView>
      </ScreenLayout>
    </View>
  );
};

export default HistoryScreen;
