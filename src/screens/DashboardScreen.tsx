/**
 * DashboardScreen
 * Main dashboard with network status, identity, wallet, governance, and trending content
 */

import React from 'react';
import { View, ScrollView } from 'react-native';
import {
  Card,
  Text,
  Button,
  LoadingView,
  Column,
  Row,
  ScreenLayout,
  Badge,
} from '../components';
import { useAsyncData } from '../hooks';
import { useTranslation } from '../i18n';
import MockDataService from '../services/MockDataService';
import { colors, spacing, typography, borderRadius } from '../theme';

const DashboardScreen = ({ _navigation }: any) => {
  const { t } = useTranslation();

  const { data, loading } = useAsyncData(
    async () => {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 800));
      return {
        networkStatus: MockDataService.getNetworkStatus(),
        daoStats: MockDataService.getDAOStats(),
      };
    },
    [],
  );

  if (loading) {
    return <LoadingView message={t.dashboard.loadingMessage} />;
  }

  const networkStatus = data?.networkStatus;

  // Get sample data from translations
  const trendingDapps = t.dashboard.trendingDapps.items;
  const trendingTokens = t.dashboard.trendingTokens.items;
  const trendingBounties = t.dashboard.bounties.items;

  return (
    <ScreenLayout testID="dashboard-screen" paddingTop={10} paddingBottom={0}>
      <ScrollView showsVerticalScrollIndicator={false} scrollEventThrottle={16}>
        {/* Compact Network Status */}
        <View
          style={{
            backgroundColor: colors.bg_darker,
            borderRadius: borderRadius.md,
            padding: spacing.md,
            marginBottom: spacing.lg,
            marginHorizontal: spacing.xxs,
            marginTop: spacing.lg,
          }}
        >
          <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
            <Row style={{ alignItems: 'center', gap: spacing.sm }}>
              <Text style={{ fontSize: typography.size.md }}>⚡</Text>
              <Text
                style={{
                  fontSize: typography.size.sm,
                  fontWeight: typography.weight.semibold,
                  color: colors.text_primary,
                }}
              >
                {t.dashboard.networkStatus.title}
              </Text>
            </Row>
            <Badge
              label={networkStatus?.connected ? t.dashboard.networkStatus.connected : t.dashboard.networkStatus.offline}
              variant={networkStatus?.connected ? 'success' : 'error'}
              style={{ backgroundColor: colors.transparent }}
            />
          </Row>
          <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm }}>
            <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary }}>
              {t.dashboard.networkStatus.blockHeight}: {networkStatus?.nodeCount}
            </Text>
            <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary }}>
              {t.dashboard.networkStatus.peers}: --
            </Text>
            <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary }}>
              {t.dashboard.networkStatus.gasPrice}: --
            </Text>
            <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary }}>
              {t.dashboard.networkStatus.tps}: --
            </Text>
          </Row>
        </View>

        {/* Trending dApps */}
        <Card style={{ marginHorizontal: spacing.xxs, marginBottom: spacing.lg }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <Row style={{ alignItems: 'center', gap: spacing.sm }}>
              <Text
                style={{
                  fontSize: typography.size.lg,
                  fontWeight: typography.weight.bold,
                  color: colors.text_primary,
                }}
              >
                {t.dashboard.trendingDapps.title}
              </Text>
            </Row>
          </Row>

          <Column gap="sm" style={{ marginBottom: spacing.md }}>
            {trendingDapps.map((dapp) => (
              <View
                key={dapp.name}
                style={{
                  backgroundColor: colors.bg_darker,
                  padding: spacing.md,
                  borderRadius: borderRadius.sm,
                }}
              >
                <Row style={{ justifyContent: 'space-between' }}>
                  <Column gap="xs" style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: typography.size.sm,
                        fontWeight: typography.weight.semibold,
                        color: colors.text_primary,
                      }}
                    >
                      {dapp.name}
                    </Text>
                    <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary }}>
                      {dapp.desc}
                    </Text>
                  </Column>
                  <Badge label={`↑ ${dapp.change}`} variant="primary" />
                </Row>
              </View>
            ))}
          </Column>

          <Button variant="primary" onPress={() => {}}>
            {t.dashboard.trendingDapps.exploreAll}
          </Button>
        </Card>

        {/* Trending Tokens */}
        <Card style={{ marginHorizontal: spacing.xxs, marginBottom: spacing.lg }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <Row style={{ alignItems: 'center', gap: spacing.sm }}>
              <Text
                style={{
                  fontSize: typography.size.lg,
                  fontWeight: typography.weight.bold,
                  color: colors.text_primary,
                }}
              >
                {t.dashboard.trendingTokens.title}
              </Text>
            </Row>
          </Row>

          <Column gap="sm" style={{ marginBottom: spacing.md }}>
            {trendingTokens.map((token) => (
              <View
                key={token.symbol}
                style={{
                  backgroundColor: colors.bg_darker,
                  padding: spacing.md,
                  borderRadius: borderRadius.sm,
                }}
              >
                <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <Column gap="xs" style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: typography.size.sm,
                        fontWeight: typography.weight.semibold,
                        color: colors.text_primary,
                      }}
                    >
                      {token.symbol}
                    </Text>
                    <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary }}>
                      {token.name}
                    </Text>
                  </Column>
                  <Text
                    style={{
                      fontSize: typography.size.sm,
                      fontWeight: typography.weight.bold,
                      color: colors.primary,
                    }}
                  >
                    {token.price}
                  </Text>
                </Row>
              </View>
            ))}
          </Column>

          <Button variant="primary" onPress={() => {}}>
            {t.dashboard.trendingTokens.viewAll}
          </Button>
        </Card>

        {/* Trending Bounties */}
        <Card style={{ marginHorizontal: spacing.xxs, marginBottom: spacing.xl }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <Row style={{ alignItems: 'center', gap: spacing.sm }}>
              <Text
                style={{
                  fontSize: typography.size.lg,
                  fontWeight: typography.weight.bold,
                  color: colors.text_primary,
                }}
              >
                {t.dashboard.bounties.title}
              </Text>
            </Row>
          </Row>

          <Column gap="sm" style={{ marginBottom: spacing.md }}>
            {trendingBounties.map((bounty) => (
              <View
                key={bounty.title}
                style={{
                  backgroundColor: colors.bg_darker,
                  padding: spacing.md,
                  borderRadius: borderRadius.sm,
                }}
              >
                <Row style={{ justifyContent: 'space-between', marginBottom: spacing.xs }}>
                  <Text
                    style={{
                      fontSize: typography.size.sm,
                      fontWeight: typography.weight.semibold,
                      color: colors.text_primary,
                      flex: 1,
                    }}
                    numberOfLines={2}
                  >
                    {bounty.title}
                  </Text>
                  <Badge label={bounty.reward} variant="primary" />
                </Row>
                <Row style={{ justifyContent: 'space-between', gap: spacing.sm }}>
                  <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary }}>
                    ⏰ {bounty.daysLeft}d
                  </Text>
                  <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary }}>
                    👥 {bounty.contributors}
                  </Text>
                </Row>
              </View>
            ))}
          </Column>

          <Column gap="sm">
            <Button variant="secondary" onPress={() => {}}>
              {t.dashboard.bounties.submitBounty}
            </Button>
            <Button variant="primary" onPress={() => {}}>
              {t.dashboard.bounties.viewAll}
            </Button>
          </Column>
        </Card>
      </ScrollView>
    </ScreenLayout>
  );
};

export default DashboardScreen;
