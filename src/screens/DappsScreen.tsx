/**
 * App Store Screen
 * Play Store-style layout with search, category filters, and horizontal scrolling sections.
 */
import React, { useState, useMemo } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import {
  useTrendingDapps,
} from '../hooks/useTrendingDapps';
import {
  Column,
  HeaderBar,
  Row,
  ScreenLayout,
  Text,
  Input,
  ArrowIcon,
} from '../components';
import { borderRadius, colors, spacing } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.42;

const CATEGORIES = ['All', 'Finance', 'Services', 'Social', 'Tools', 'Governance'];

const AppCard: React.FC<{
  app: any;
  onPress: () => void;
}> = ({ app, onPress }) => (
  <Pressable onPress={onPress} style={styles.appCard}>
    <View style={styles.appIconPlaceholder}>
      <Text style={styles.appIconText}>{app.name.charAt(0)}</Text>
    </View>
    <Column gap="xxs" style={{ marginTop: spacing.xs }}>
      <Text variant="body" numberOfLines={1} style={styles.appName}>
        {app.name}
      </Text>
      <Text variant="caption" numberOfLines={1} style={styles.appDesc}>
        {app.desc}
      </Text>
    </Column>
  </Pressable>
);

const AppSection: React.FC<{
  title: string;
  apps: any[];
  onAppPress: (app: any) => void;
}> = ({ title, apps, onAppPress }) => {
  return (
    <Column gap="md" style={styles.sectionContainer}>
      <Row justify="space-between" align="center" style={{ paddingHorizontal: spacing.lg }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Pressable>
          <Text style={styles.seeAllText}>See all</Text>
        </Pressable>
      </Row>
      {apps.length === 0 ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
          <Text style={{ color: colors.text_tertiary, fontSize: 12, fontStyle: 'italic' }}>
            No apps available in this section yet
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalScrollContent}
          decelerationRate="fast"
          snapToInterval={CARD_WIDTH + spacing.md}
        >
          {apps.map((app, index) => (
            <AppCard key={`${app.id}-${index}`} app={app} onPress={() => onAppPress(app)} />
          ))}
        </ScrollView>
      )}
    </Column>
  );
};

const DappsScreen: React.FC<any> = ({ navigation }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const allApps = useTrendingDapps();

  const filteredApps = useMemo(() => {
    return (allApps || []).filter(app => {
      const matchesSearch = app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          app.desc.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory = activeCategory === 'All' ||
                            app.desc.toLowerCase().includes(activeCategory.toLowerCase()) ||
                            app.name.toLowerCase().includes(activeCategory.toLowerCase());

      return matchesSearch && matchesCategory;
    });
  }, [allApps, searchQuery, activeCategory]);

  const handleAppPress = (app: any) => {
    if (app.id === 'sovswap') {
      navigation.navigate('SovSwapHome');
      return;
    }
    navigation.navigate('Browser', { url: app.url });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
      <HeaderBar
        onNavigatePouw={() => navigation.navigate('SIDTab', { screen: 'PoUW' })}
        onNavigateExplorer={() => navigation.navigate('ExplorerDashboard')}
        onNavigateDevPortal={() => navigation.navigate('DeveloperPortal')}
      />

      <ScreenLayout
        paddingTop={spacing.md}
        paddingHorizontal={0}
        safeAreaEdges={['bottom']}
      >
        {/* Search Bar */}
        <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>
          <Input
            placeholder="Search dApps..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={() => {
              if (searchQuery.trim()) {
                navigation.navigate('DappsSearchResults', { query: searchQuery });
                setSearchQuery('');
              }
            }}
            containerStyle={{ marginBottom: 0 }}
            leftIcon="🔍"
          />
        </View>

        {/* Category Filters */}
        <View style={{ height: 44, marginBottom: spacing.md }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoriesScrollContent}
          >
            {CATEGORIES.map(category => (
              <Pressable
                key={category}
                onPress={() => setActiveCategory(category)}
                style={[
                  styles.categoryTab,
                  activeCategory === category && styles.categoryTabActive
                ]}
              >
                <Text
                  style={[
                    styles.categoryTabText,
                    activeCategory === category && styles.categoryTabTextActive
                  ]}
                >
                  {category}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing['3xl'] }}>
          {searchQuery.trim().length > 0 ? (
            <Column gap="md" style={{ paddingHorizontal: spacing.lg }}>
              <Text style={styles.sectionTitle}>Search Results</Text>
              {filteredApps.length > 0 ? (
                filteredApps.map((app, index) => (
                  <Pressable
                    key={`${app.id}-${index}`}
                    style={({ pressed }) => [
                      styles.resultCard,
                      pressed && { opacity: 0.7 }
                    ]}
                    onPress={() => handleAppPress(app)}
                  >
                    <Row align="center" gap="md">
                      <View style={styles.iconPlaceholderSmall}>
                        <Text style={styles.iconTextSmall}>{app.name.charAt(0)}</Text>
                      </View>
                      <Column style={{ flex: 1 }}>
                        <Text style={styles.resultName}>{app.name}</Text>
                        <Text style={styles.resultDesc} numberOfLines={1}>{app.desc}</Text>
                      </Column>
                      <ArrowIcon direction="right" size={14} color={colors.text_tertiary} />
                    </Row>
                  </Pressable>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Text style={{ color: colors.text_secondary }}>No apps found matching "{searchQuery}"</Text>
                </View>
              )}
            </Column>
          ) : (
            <>
              <AppSection
                title="New & Notable"
                apps={[]}
                onAppPress={handleAppPress}
              />

              <View style={styles.sectionDivider} />

              <AppSection
                title="Most Popular"
                apps={[]}
                onAppPress={handleAppPress}
              />

              <View style={styles.sectionDivider} />

              <AppSection
                title="Suggested for You"
                apps={[]}
                onAppPress={handleAppPress}
              />
            </>
          )}
        </ScrollView>
      </ScreenLayout>
    </View>
  );
};

const styles = StyleSheet.create({
  categoriesScrollContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    alignItems: 'center',
  },
  categoryTab: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.bg_medium,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text_secondary,
  },
  categoryTabTextActive: {
    color: colors.bg_darkest,
  },
  sectionContainer: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text_primary,
  },
  seeAllText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  horizontalScrollContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  appCard: {
    width: CARD_WIDTH,
  },
  appIconPlaceholder: {
    width: CARD_WIDTH,
    height: CARD_WIDTH,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.bg_medium,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appIconText: {
    fontSize: 42,
    fontWeight: '800',
    color: colors.primary,
  },
  appName: {
    fontWeight: '600',
    fontSize: 14,
    color: colors.text_primary,
  },
  appDesc: {
    color: colors.text_secondary,
    fontSize: 12,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    opacity: 0.2,
  },
  emptyState: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  resultCard: {
    backgroundColor: colors.bg_darker,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  iconPlaceholderSmall: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.bg_medium,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconTextSmall: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primary,
  },
  resultName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text_primary,
  },
  resultDesc: {
    fontSize: 12,
    color: colors.text_secondary,
    marginTop: 2,
  },
});

export default DappsScreen;
