import React, { useMemo, useState } from 'react';
import { View, TextInput, Animated } from 'react-native';
import { useTrendingTokens, formatTokenPrice, formatChange, TokenData } from '../hooks/useTrendingTokens';
import { useTrendingDapps, formatUserCount, getActivityColor } from '../hooks/useTrendingDapps';
import {
  ActivityDot,
  Badge,
  Button,
  Card,
  Column,
  DrawerItem,
  HeaderBar,
  Row,
  ScreenLayout,
  SideDrawer,
  Text,
} from '../components';
import { useTranslation } from '../i18n';
import { borderRadius, colors, spacing } from '../theme';
import SShieldLogo from '../components/atoms/Logo';

const getTrendColor = (trend: TokenData['trend']) => {
  if (trend === 'up') return colors.success;
  if (trend === 'down') return colors.error;
  return colors.text_secondary;
};

const getTrendArrow = (trend: TokenData['trend']) => {
  if (trend === 'up') return '▲';
  if (trend === 'down') return '▼';
  return '•';
};

const DashboardScreen: React.FC<any> = ({ navigation }) => {
  const { t } = useTranslation();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [urlInput, setUrlInput] = useState('zhtp://central.sov');
  const trendingTokensData = useTrendingTokens();
  const trendingDappsData = useTrendingDapps();

  const drawerItems: DrawerItem[] = useMemo(
    () => [
      {
        id: 'history',
        label: 'History',
        icon: '🕑',
        onPress: () => {
          setDrawerVisible(false);
          navigation.navigate('SIDTab', { screen: 'History' });
        },
      },
      {
        id: 'bookmarks',
        label: 'Bookmarks',
        icon: '📑',
        onPress: () => {
          setDrawerVisible(false);
          navigation.navigate('SIDTab', { screen: 'Bookmarks' });
        },
      },
      {
        id: 'favorites',
        label: 'Favorites',
        icon: '⭐',
        onPress: () => {
          setDrawerVisible(false);
          navigation.navigate('SIDTab', { screen: 'Favorites' });
        },
      },
      {
        id: 'settings',
        label: 'Settings',
        icon: '⚙️',
        onPress: () => {
          setDrawerVisible(false);
          navigation.navigate('SIDTab', { screen: 'AppSettings' });
        },
      },
    ],
    [navigation],
  );

  const openBrowser = (url?: string) => {
    const targetUrl = url || urlInput;
    if (__DEV__) {
      console.log('[🌐 Web4] Dashboard: Navigating to URL:', targetUrl);
    }
    navigation.navigate('Browser', { url: targetUrl });
  };

  const { trendingDapps, trendingTokens, bounties } = t.dashboard;

  return (
    <>
      <HeaderBar onMenuPress={() => setDrawerVisible(true)} />
      <ScreenLayout paddingTop={spacing.lg} paddingBottom={spacing.xl} safeAreaEdges={['bottom']}>
        <SideDrawer visible={drawerVisible} onClose={() => setDrawerVisible(false)} items={drawerItems} title="Menu" />

        <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
          <SShieldLogo size={80} />
        </View>

        {/* URL Bar */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.xs,
            height: 44,
            marginBottom: spacing.md,
          }}
        >
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              borderRadius: 12,
              backgroundColor: colors.bg_dark,
              borderWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: spacing.sm,
              height: 40,
            }}
          >
            <TextInput
              placeholder="zhtp://..."
              placeholderTextColor={colors.text_placeholder}
              value={urlInput}
              onChangeText={setUrlInput}
              onSubmitEditing={() => openBrowser()}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="go"
              style={{
                flex: 1,
                color: colors.text_primary,
                fontSize: 14,
                paddingVertical: 0,
                height: '100%',
              }}
            />
          </View>
          <Button
            onPress={() => openBrowser()}
            size="sm"
            variant="primary"
            style={{
              width: 36,
              height: 36,
              paddingHorizontal: 0,
              paddingVertical: 0,
              justifyContent: 'center',
              alignItems: 'center',
              borderRadius: 18,
            }}
          >
            <Text style={{ fontSize: 16, color: colors.text_primary }}>→</Text>
          </Button>
        </View>

        <Card>
          <Row justify="space-between" align="center" style={{ marginBottom: spacing.sm }}>
            <Text variant="h3">{trendingDapps.title}</Text>
            <Badge label="Live" variant="success" size="sm" />
          </Row>
          <Column gap="md">
            {trendingDappsData.map((dapp) => {
              const activityColor = getActivityColor(dapp.activityLevel);
              const glowBgColor = dapp.glowAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['transparent', 'rgba(0, 212, 255, 0.1)'],
              });

              return (
                <Animated.View
                  key={dapp.id}
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
                      <Text variant="caption" style={{ color: colors.text_secondary }}>
                        {dapp.desc}
                      </Text>
                    </Column>
                  </Row>
                  <Animated.View
                    style={{
                      alignItems: 'flex-end',
                      paddingHorizontal: spacing.sm,
                      paddingVertical: spacing.xs,
                      borderRadius: borderRadius.base,
                      backgroundColor: glowBgColor,
                    }}
                  >
                    <Animated.View
                      style={{
                        transform: [
                          {
                            translateY: dapp.userCountAnim.interpolate({
                              inputRange: [-1, 0, 1],
                              outputRange: [-4, 0, 4],
                            }),
                          },
                        ],
                      }}
                    >
                      <Text variant="body" style={{ fontWeight: '600', color: colors.primary }}>
                        {formatUserCount(dapp.activeUsers)}
                      </Text>
                    </Animated.View>
                    <Text variant="caption" style={{ color: colors.text_secondary }}>
                      active users
                    </Text>
                  </Animated.View>
                </Animated.View>
              );
            })}
          </Column>
        </Card>

        <Card>
          <Row justify="space-between" align="center" style={{ marginBottom: spacing.sm }}>
            <Text variant="h3">{trendingTokens.title}</Text>
            <Badge label="Live" variant="success" size="sm" />
          </Row>
          <Column gap="md">
            {trendingTokensData.map((token) => {
              const trendColor = getTrendColor(token.trend);
              const flashBgColor = token.priceFlash.interpolate({
                inputRange: [0, 1],
                outputRange: ['transparent', token.trend === 'up' ? 'rgba(81, 207, 102, 0.15)' : 'rgba(255, 107, 107, 0.15)'],
              });

              return (
                <View
                  key={token.symbol}
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
                  <Column gap="xs" style={{ flex: 1 }}>
                    <Text variant="body" style={{ fontWeight: '600' }}>
                      {token.symbol}
                    </Text>
                    <Text variant="caption" style={{ color: colors.text_secondary }}>
                      {token.name}
                    </Text>
                  </Column>
                  <Animated.View
                    style={{
                      alignItems: 'flex-end',
                      paddingHorizontal: spacing.sm,
                      paddingVertical: spacing.xs,
                      borderRadius: borderRadius.base,
                      backgroundColor: flashBgColor,
                    }}
                  >
                    <Text variant="body" style={{ fontWeight: '600', color: colors.text_primary }}>
                      {formatTokenPrice(token.price)}
                    </Text>
                    <Row gap="xs" align="center">
                      <Animated.View
                        style={{
                          transform: [{ scale: token.arrowScale }],
                        }}
                      >
                        <Text
                          variant="caption"
                          style={{
                            fontSize: 12,
                            color: trendColor,
                            fontWeight: '700',
                          }}
                        >
                          {getTrendArrow(token.trend)}
                        </Text>
                      </Animated.View>
                      <Text
                        variant="caption"
                        style={{
                          color: trendColor,
                          fontWeight: '500',
                        }}
                      >
                        {formatChange(token.change)}
                      </Text>
                    </Row>
                  </Animated.View>
                </View>
              );
            })}
          </Column>
        </Card>

        <Card>
          <Row justify="space-between" align="center" style={{ marginBottom: spacing.sm }}>
            <Text variant="h3">{bounties.title}</Text>
            <Badge label="Coming soon" size="sm" />
          </Row>
          <Column gap="md">
            {bounties.items.map((item: any) => (
              <Row
                key={item.title}
                justify="space-between"
                align="center"
                style={{
                  paddingVertical: spacing.sm,
                  paddingHorizontal: spacing.md,
                  borderRadius: borderRadius.lg,
                  backgroundColor: colors.bg_darker,
                }}
              >
                <Column gap="xs" style={{ flex: 1 }}>
                  <Text variant="body" style={{ fontWeight: '600' }}>
                    {item.title}
                  </Text>
                  <Text variant="caption" style={{ color: colors.text_secondary }}>
                    {item.reward} • {item.daysLeft}d left
                  </Text>
                </Column>
                <Badge label={`${item.contributors} builders`} variant="default" size="sm" />
              </Row>
            ))}
          </Column>
        </Card>
      </ScreenLayout>
    </>
  );
};

export default DashboardScreen;
