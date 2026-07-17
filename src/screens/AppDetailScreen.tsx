/**
 * App Detail Screen
 * Shows information about a specific dApp with an "Install" / "Open" action.
 */
import React from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Image,
  TouchableOpacity,
} from 'react-native';
import {
  Column,
  HeaderBar,
  Row,
  ScreenLayout,
  Text,
  Button,
} from '../components';
import { borderRadius, colors, spacing, typography } from '../theme';

const AppDetailScreen: React.FC<any> = ({ navigation, route }) => {
  const { app } = route.params;

  const handleInstall = () => {
    // Mock install behavior
    console.log('Installing:', app.name);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
      <HeaderBar
        onMenuPress={() => {}} // Handle back navigation or menu
      />

      <ScrollView showsVerticalScrollIndicator={false}>
        <ScreenLayout paddingTop={spacing.lg}>
          {/* Header Section: Icon, Name, Category */}
          <Row gap="lg" align="center" style={styles.header}>
            <View style={styles.appIconLarge}>
              <Text style={styles.appIconTextLarge}>{app.name.charAt(0)}</Text>
            </View>
            <Column gap="xs" style={{ flex: 1 }}>
              <Text variant="h2" style={styles.appName}>
                {app.name}
              </Text>
              <Text style={styles.developerName}>{app.developer}</Text>
              <Text style={styles.categoryName}>{app.category}</Text>
            </Column>
          </Row>

          {/* Stats Row: Rating, Downloads, Size */}
          <Row justify="space-around" style={styles.statsRow}>
            <Column align="center">
              <Text style={styles.statValue}>{app.rating} ★</Text>
              <Text style={styles.statLabel}>Rating</Text>
            </Column>
            <View style={styles.statDivider} />
            <Column align="center">
              <Text style={styles.statValue}>{app.downloads}</Text>
              <Text style={styles.statLabel}>Downloads</Text>
            </Column>
            <View style={styles.statDivider} />
            <Column align="center">
              <Text style={styles.statValue}>12 MB</Text>
              <Text style={styles.statLabel}>Size</Text>
            </Column>
          </Row>

          {/* Action Button */}
          <Button
            variant="primary"
            onPress={handleInstall}
            style={styles.installButton}
          >
            Install
          </Button>

          {/* Description */}
          <Column gap="sm" style={styles.descriptionSection}>
            <Text variant="h3" style={styles.sectionTitle}>
              About this app
            </Text>
            <Text style={styles.longDescription}>{app.longDesc}</Text>
          </Column>

          {/* Version History (Placeholder) */}
          <Column gap="sm" style={styles.versionSection}>
            <Text variant="h3" style={styles.sectionTitle}>
              What's New
            </Text>
            <Text style={styles.versionNumber}>Version 1.2.4</Text>
            <Text style={styles.versionChanges}>
              • Improved connection stability over QUIC{'\n'}
              • New dark theme assets{'\n'}
              • Bug fixes and performance improvements
            </Text>
          </Column>
        </ScreenLayout>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.xl,
  },
  appIconLarge: {
    width: 80,
    height: 80,
    borderRadius: 16,
    backgroundColor: colors.bg_medium,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appIconTextLarge: {
    fontSize: 40,
    fontWeight: '800',
    color: colors.primary,
  },
  appName: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text_primary,
  },
  developerName: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  categoryName: {
    color: colors.text_secondary,
    fontSize: 14,
  },
  statsRow: {
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
    opacity: 0.8,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text_primary,
  },
  statLabel: {
    fontSize: 12,
    color: colors.text_tertiary,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
    alignSelf: 'center',
  },
  installButton: {
    height: 48,
    borderRadius: 24,
    marginBottom: spacing.xl,
  },
  descriptionSection: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text_primary,
    marginBottom: spacing.xs,
  },
  longDescription: {
    fontSize: 14,
    color: colors.text_secondary,
    lineHeight: 20,
  },
  versionSection: {
    marginBottom: spacing['3xl'],
  },
  versionNumber: {
    fontSize: 14,
    color: colors.text_primary,
    fontWeight: '600',
  },
  versionChanges: {
    fontSize: 14,
    color: colors.text_secondary,
    lineHeight: 20,
  },
});

export default AppDetailScreen;
