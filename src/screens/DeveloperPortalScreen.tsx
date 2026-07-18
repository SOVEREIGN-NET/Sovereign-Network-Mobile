import React from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import {
  Card,
  Text,
  Column,
  Row,
  ScreenLayout,
  HeaderBar,
} from '../components';
import { colors, spacing, typography, borderRadius, shadows } from '../theme/tokens';

const DeveloperPortalScreen: React.FC<any> = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const sections = [
    {
      id: 'domains',
      title: 'My Domains',
      subtitle: 'Register and manage your .sov domains',
      icon: (color: string) => (
        <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={1.5} />
          <Path d="M12 3a9 9 0 0 1 9 9M12 21a9 9 0 0 0 9-9M3 12h18M12 3v18" stroke={color} strokeWidth={1.5} />
        </Svg>
      ),
      onPress: () => navigation.navigate('MyDomains'),
    },
    {
      id: 'contracts',
      title: 'Smart Contracts',
      subtitle: 'Deploy and interact with custom ZK-contracts',
      icon: (color: string) => (
        <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
          <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke={color} strokeWidth={1.5} />
          <Path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke={color} strokeWidth={1.5} />
        </Svg>
      ),
      onPress: () => {},
    },
    {
      id: 'register_dao',
      title: 'Register DAO',
      subtitle: 'Launch a DAO, claim a domain, or create tokens',
      icon: (color: string) => (
        <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
          <Rect x="3" y="3" width="18" height="18" rx="2" stroke={color} strokeWidth={1.5} />
          <Path d="M12 8v8M8 12h8" stroke={color} strokeWidth={1.5} />
        </Svg>
      ),
      onPress: () => navigation.navigate('RegisterDao'),
    },
    {
      id: 'operate_nodes',
      title: 'Operate Nodes',
      subtitle: 'Download and deploy software to power the network',
      icon: (color: string) => (
        <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
          <Rect x="2" y="5" width="20" height="6" rx="1" stroke={color} strokeWidth={1.5} />
          <Rect x="2" y="13" width="20" height="6" rx="1" stroke={color} strokeWidth={1.5} />
          <Circle cx="5" cy="8" r="0.5" fill={color} />
          <Circle cx="5" cy="16" r="0.5" fill={color} />
          <Path d="M17 8h2M17 16h2" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
        </Svg>
      ),
      onPress: () => navigation.navigate('OperateNodes'),
    },
    {
      id: 'hosting',
      title: 'Web Hosting',
      subtitle: 'Upload files and connect to your domain',
      icon: (color: string) => (
        <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
          <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      ),
      onPress: () => {},
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
      <HeaderBar
        onBackPress={() => navigation.goBack()}
        showHamburger={false}
      />

      <ScreenLayout paddingTop={spacing.md}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Column gap="lg" style={{ paddingBottom: spacing.xl }}>
            <View style={{ paddingHorizontal: spacing.sm }}>
              <Text variant="h2" style={{ marginBottom: spacing.xs }}>Developer Portal</Text>
              <Text style={{ color: colors.text_secondary, fontSize: 14 }}>
                Build and deploy on the Sovereign Network
              </Text>
            </View>

            <Column gap="md">
              {sections.map((section) => (
                <TouchableOpacity
                  key={section.id}
                  activeOpacity={0.7}
                  onPress={section.onPress}
                >
                  <Card style={styles.sectionCard}>
                    <Row align="center" gap="md">
                      <View style={styles.iconContainer}>
                        {section.icon(colors.primary)}
                      </View>
                      <Column style={{ flex: 1 }}>
                        <Text style={styles.sectionTitle}>{section.title}</Text>
                        <Text style={styles.sectionSubtitle}>{section.subtitle}</Text>
                      </Column>
                      <View style={styles.chevron}>
                        <Path d="M9 18l6-6-6-6" stroke={colors.text_tertiary} strokeWidth={2} />
                      </View>
                    </Row>
                  </Card>
                </TouchableOpacity>
              ))}
            </Column>

            <Card style={styles.infoCard}>
              <Text style={styles.infoTitle}>SDK & Documentation</Text>
              <Text style={styles.infoText}>
                Access the full Web4 specification and developer tools to build decentralized applications.
              </Text>
              <TouchableOpacity style={styles.infoLink} onPress={() => navigation.navigate('Browser', { url: 'zhtp://docs.sov' })}>
                <Text style={styles.infoLinkText}>View Documentation →</Text>
              </TouchableOpacity>
            </Card>
          </Column>
        </ScrollView>
      </ScreenLayout>
    </View>
  );
};

const styles = StyleSheet.create({
  sectionCard: {
    marginHorizontal: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.bg_darker,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.bg_dark,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text_primary,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: colors.text_secondary,
    marginTop: 2,
  },
  chevron: {
    paddingLeft: spacing.sm,
  },
  infoCard: {
    marginHorizontal: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.bg_dark,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text_primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  infoText: {
    fontSize: 13,
    color: colors.text_secondary,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  infoLink: {
    alignSelf: 'flex-start',
  },
  infoLinkText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 14,
  },
});

export default DeveloperPortalScreen;
