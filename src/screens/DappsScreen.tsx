/**
 * DappsScreen
 * Full-page view of trending dApps, extracted from DashboardScreen
 * to live as its own route accessible from the header dropdown.
 */
import React from 'react';
import { View, Animated, Pressable } from 'react-native';
import {
  useTrendingDapps,
  getActivityColor,
} from '../hooks/useTrendingDapps';
import {
  ActivityDot,
  Badge,
  Column,
  HeaderBar,
  Row,
  ScreenLayout,
  Text,
} from '../components';
import { useTranslation } from '../i18n';
import { colors, spacing } from '../theme';

const DappsScreen: React.FC<any> = ({ navigation }) => {
  const trendingDappsData = useTrendingDapps();

  const openBrowser = (url: string) => {
    navigation.navigate('Browser', { url });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
      <HeaderBar />
      <ScreenLayout
        paddingTop={spacing.lg}
        paddingBottom={spacing.xl}
        safeAreaEdges={['bottom']}
      >
        <Row
          justify="space-between"
          align="center"
          style={{ marginBottom: spacing.lg }}
        >
          <Text variant="h2">Trending dApps</Text>
          <Badge label="Live" variant="success" size="sm" />
        </Row>

        <Column gap="md">
          {trendingDappsData.map(dapp => {
            const activityColor = getActivityColor(dapp.activityLevel);
            const glowBgColor = dapp.glowAnim.interpolate({
              inputRange: [0, 1],
              outputRange: ['transparent', 'rgba(0, 212, 255, 0.1)'],
            });

            return (
              <Pressable
                key={dapp.id}
                onPress={() => {
                  if (dapp.id === 'sovswap') {
                    navigation.navigate('SovSwapHome');
                    return;
                  }
                  openBrowser(dapp.url);
                }}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingVertical: spacing.sm,
                  paddingHorizontal: spacing.md,
                  borderRadius: borderRadius.lg,
                  backgroundColor: colors.bg_darker,
                }}
              >
                <Row gap="sm" align="center" style={{ flex: 1 }}>
                  <ActivityDot color={activityColor} />
                  <Column gap="xs" style={{ flex: 1 }}>
                    <Text variant="body" style={{ fontWeight: '600' }}>
                      {dapp.name}
                    </Text>
                    <Text
                      variant="caption"
                      style={{ color: colors.text_secondary }}
                    >
                      {dapp.desc}
                    </Text>
                  </Column>
                </Row>
                <Animated.View
                  style={{
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.xs,
                    borderRadius: borderRadius.base,
                    backgroundColor: glowBgColor,
                  }}
                >
                  <Text
                    variant="caption"
                    style={{ color: colors.text_secondary }}
                  >
                    {dapp.change}%
                  </Text>
                </Animated.View>
              </Pressable>
            );
          })}
        </Column>
      </ScreenLayout>
    </View>
  );
};

export default DappsScreen;