import React, { useMemo, useState, useEffect } from 'react';
import { Alert, Clipboard, TouchableOpacity, View } from 'react-native';
import {
  Card,
  Text,
  Button,
  LoadingView,
  ScreenLayout,
  HeaderBar,
  ArrowIcon,
  SideDrawer,
  DrawerItem,
} from '../components';
import { Column } from '../components/atoms/Column/Column';
import { Row } from '../components/atoms/Row/Row';
import { Divider } from '../components/atoms/Divider/Divider';
import { useAsyncData, useAuth } from '../hooks';
import { useDAOStats, formatTreasury } from '../hooks/useDAOStats';
import { useTranslation } from '../i18n';
import MockDataService from '../services/MockDataService';
import { colors, spacing, typography } from '../theme';
import { WELFARE_DAOS } from '../constants';

const DAOScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const daoStats = useDAOStats();
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      // Next distribution on Sunday 00:00:00
      const nextSunday = new Date();
      nextSunday.setDate(now.getDate() + (7 - now.getDay()) % 7);
      nextSunday.setHours(0, 0, 0, 0);
      if (nextSunday <= now) nextSunday.setDate(nextSunday.getDate() + 7);

      const diff = nextSunday.getTime() - now.getTime();
      const d = Math.floor(diff / (1000 * 60 * 60 * 24));
      const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const m = Math.floor((diff / (1000 * 60)) % 60);
      const s = Math.floor((diff / 1000) % 60);

      setTimeLeft(`${d}d ${h}h ${m}m ${s}s`);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const { data, loading } = useAsyncData(async () => {
    // TODO: Re-enable when API is ready
    // try {
    //   if (api && isInitialized) {
    //     // Fetch real DAO data from API
    //     const proposals = await api.getDaoProposals();
    //     const daoStats = await api.getDaoStats();
    //     return { proposals, daoStats };
    //   }
    // } catch (error) {
    //   console.warn('Failed to fetch DAO data, using mock:', error);
    // }

    // Fallback to mock data
    await new Promise<void>(resolve => setTimeout(() => resolve(), 600));
    return {
      proposals: MockDataService.getProposals(),
      daoStats: MockDataService.getDAOStats(),
    };
  }, []);

  if (loading) {
    return <LoadingView />;
  }

  const proposals = data?.proposals || [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
      <HeaderBar />

      <ScreenLayout testID="dao-screen">
        {/* Weekly Universal Basic Redistribution Treasury Section */}
        <Card
          style={{
            marginBottom: spacing.lg,
            paddingVertical: spacing.xl,
            paddingHorizontal: spacing.lg,
            alignItems: 'center',
            backgroundColor: colors.bg_darker,
          }}
        >
          <Column align="center" gap="xs">
            <View style={{ backgroundColor: `${colors.primary}22`, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginBottom: spacing.sm }}>
              <Text style={{ color: colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 }}>WEEKLY UBR TREASURY</Text>
            </View>

            <Text
              style={{
                color: colors.text_primary,
                fontSize: 36,
                fontWeight: typography.weight.bold,
              }}
            >
              {formatTreasury(daoStats.treasury)}
            </Text>

            <Text
              style={{
                color: colors.text_secondary,
                fontSize: 11,
                textAlign: 'center',
                fontStyle: 'italic',
                maxWidth: '90%',
                marginTop: spacing.xs,
              }}
            >
              From network fees and 20% token allocations
            </Text>
          </Column>

          <Divider style={{ width: '100%', marginVertical: spacing.xl, opacity: 0.2 }} />

          <Row justify="space-around" style={{ width: '100%' }}>
            <Column align="center">
              <Text
                style={{
                  color: colors.text_primary,
                  fontSize: typography.size.xl,
                  fontWeight: typography.weight.bold,
                }}
              >
                {daoStats.members.toLocaleString()}
              </Text>
              <Text
                style={{
                  color: colors.text_tertiary,
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  marginTop: 4,
                }}
              >
                Active Members
              </Text>
            </Column>

            <View style={{ width: 1, height: 30, backgroundColor: colors.border, opacity: 0.5 }} />

            <Column align="center">
              <Text
                style={{
                  color: colors.text_primary,
                  fontSize: typography.size.xl,
                  fontWeight: typography.weight.bold,
                }}
              >
                {timeLeft || '--'}
              </Text>
              <Text
                style={{
                  color: colors.text_tertiary,
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  marginTop: 4,
                }}
              >
                Next Distribution
              </Text>
            </Column>
          </Row>
        </Card>

        {/* Governance Hubs */}
        <Column gap="md" style={{ marginBottom: spacing.xl, marginTop: spacing.md }}>
          <Text variant="h3" style={{ paddingHorizontal: spacing.sm }}>Governance Hubs</Text>
          {WELFARE_DAOS.map(dao => (
            <TouchableOpacity
              key={dao.id}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('WelfareDaoDetail', { daoId: dao.id })}
            >
              <Card
                style={{
                  backgroundColor: colors.bg_darker,
                  padding: spacing.lg,
                  borderWidth: 0.5,
                  borderColor: dao.color,
                  marginHorizontal: spacing.sm,
                }}
              >
                <Row align="center" gap="md">
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      backgroundColor: `${dao.color}22`,
                      justifyContent: 'center',
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: dao.color,
                    }}
                  >
                    <Text style={{ color: dao.color, fontSize: 18, fontWeight: '800' }}>{dao.symbol.charAt(1)}</Text>
                  </View>
                  <Column style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: colors.text_primary,
                        fontWeight: typography.weight.semibold,
                        fontSize: 16,
                      }}
                    >
                      {dao.name}
                    </Text>
                    <Text
                      style={{
                        color: colors.text_secondary,
                        fontSize: 12,
                      }}
                    >
                      {dao.url}
                    </Text>
                  </Column>
                  <ArrowIcon direction="right" size={16} color={colors.text_tertiary} />
                </Row>
              </Card>
            </TouchableOpacity>
          ))}
        </Column>

        {/* Governance card hidden — will return when voting/proposal flow
            lands on-chain. Keep the imports/state around the section dead
            so re-enabling is a one-line toggle. */}
      </ScreenLayout>

    </View>
  );
};

export default DAOScreen;
