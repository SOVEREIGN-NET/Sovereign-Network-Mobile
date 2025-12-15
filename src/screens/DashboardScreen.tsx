import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import {
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

const DashboardScreen: React.FC<any> = ({ navigation }) => {
  const { t } = useTranslation();
  const [drawerVisible, setDrawerVisible] = useState(false);

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

  const openBrowser = () => {
    navigation.navigate('Browser', { url: 'zhtp://centralhub.sov' });
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

        <Card>
          <Row justify="space-between" align="center">
            <Column gap="xs">
              <Text variant="h2" style={{ color: colors.text_primary }}>
                Network Hub
              </Text>
              <Text variant="caption" style={{ color: colors.text_secondary }}>
                zhtp://centralhub.sov
              </Text>
            </Column>
            <Button size="md" variant="primary" onPress={openBrowser}>
              Open
            </Button>
          </Row>
        </Card>

        <Card>
          <Row justify="space-between" align="center" style={{ marginBottom: spacing.sm }}>
            <Text variant="h3">{trendingDapps.title}</Text>
            <Badge label="Coming soon" size="sm" />
          </Row>
          <Column gap="md">
            {trendingDapps.items.map((item: any) => (
              <Row
                key={item.name}
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
                    {item.name}
                  </Text>
                  <Text variant="caption" style={{ color: colors.text_secondary }}>
                    {item.desc}
                  </Text>
                </Column>
                <Badge label={item.change} variant="info" size="sm" />
              </Row>
            ))}
          </Column>
        </Card>

        <Card>
          <Row justify="space-between" align="center" style={{ marginBottom: spacing.sm }}>
            <Text variant="h3">{trendingTokens.title}</Text>
            <Badge label="Coming soon" size="sm" />
          </Row>
          <Column gap="md">
            {trendingTokens.items.map((item: any) => (
              <Row
                key={item.symbol}
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
                    {item.symbol}
                  </Text>
                  <Text variant="caption" style={{ color: colors.text_secondary }}>
                    {item.name}
                  </Text>
                </Column>
                <Text variant="caption" style={{ color: colors.text_secondary }}>
                  {item.price}
                </Text>
              </Row>
            ))}
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
