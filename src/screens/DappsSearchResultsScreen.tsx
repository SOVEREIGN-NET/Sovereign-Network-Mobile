/**
 * dApp Store Search Results Screen
 * Shows results for dApp searches within the store.
 */
import React, { useState, useMemo } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import {
  Column,
  HeaderBar,
  Row,
  ScreenLayout,
  Text,
  Badge,
  ActivityDot,
} from '../components';
import { colors, spacing, typography, borderRadius } from '../theme';
import { useTrendingDapps, getActivityColor } from '../hooks/useTrendingDapps';

const DappsSearchResultsScreen: React.FC<any> = ({ navigation, route }) => {
  const { query: initialQuery } = route.params || { query: '' };
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const allApps = useTrendingDapps();

  const devApp = {
    id: 'central-sov',
    name: 'central.sov',
    desc: 'The official Sovereign Hub for CBE and core apps',
    url: 'zhtp://central.sov',
    category: 'Finance',
    rating: 4.9,
    downloads: '1.2M',
    developer: 'Sovereign Network Foundation',
    longDesc: 'Central.sov is the primary gateway to the Sovereign Network ecosystem.',
  };

  const filteredResults = useMemo(() => {
    const apps = [devApp, ...(allApps || [])];
    if (!searchQuery) return apps;

    const q = searchQuery.toLowerCase();
    return apps.filter(app =>
      app.name.toLowerCase().includes(q) || app.desc.toLowerCase().includes(q)
    );
  }, [searchQuery, allApps]);

  const handleAppPress = (app: any) => {
    if (app.id === 'central-sov') {
      navigation.navigate('AppDetail', { app });
      return;
    }
    navigation.navigate('Browser', { url: app.url });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
      <HeaderBar
        onBackPress={() => navigation.goBack()}
      />

      <ScreenLayout paddingTop={spacing.md} paddingHorizontal={0}>
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search dApps..."
            placeholderTextColor={colors.text_tertiary}
            autoCapitalize="none"
          />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <Column gap="md" style={styles.section}>
            <Text style={styles.resultCount}>
              {filteredResults.length} {filteredResults.length === 1 ? 'Result' : 'Results'}
            </Text>

            {filteredResults.map((app, index) => (
              <TouchableOpacity
                key={`${app.id}-${index}`}
                style={styles.resultCard}
                onPress={() => handleAppPress(app)}
              >
                <Row align="center" gap="md">
                  <View style={styles.iconPlaceholder}>
                    <Text style={styles.iconText}>{app.name.charAt(0)}</Text>
                  </View>
                  <Column style={{ flex: 1 }}>
                    <Text style={styles.resultName}>{app.name}</Text>
                    <Text style={styles.resultDesc} numberOfLines={1}>{app.desc}</Text>
                    <Row align="center" gap="xs" style={{ marginTop: 4 }}>
                      <Text style={styles.ratingText}>{app.rating || '4.5'} ★</Text>
                      <Text style={styles.dotSeparator}>•</Text>
                      <Text style={styles.categoryText}>{app.category || 'Tools'}</Text>
                    </Row>
                  </Column>
                  <ArrowIcon direction="right" size={16} color={colors.text_tertiary} />
                </Row>
              </TouchableOpacity>
            ))}

            {filteredResults.length === 0 && (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No apps found matching "{searchQuery}"</Text>
              </View>
            )}
          </Column>
        </ScrollView>
      </ScreenLayout>
    </View>
  );
};

const styles = StyleSheet.create({
  searchContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchInput: {
    height: 44,
    backgroundColor: colors.bg_dark,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    color: colors.text_primary,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scrollContent: {
    paddingTop: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  section: {
    paddingHorizontal: spacing.lg,
  },
  resultCount: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text_tertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  resultCard: {
    backgroundColor: colors.bg_darker,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.bg_medium,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconText: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.primary,
  },
  resultName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text_primary,
  },
  resultDesc: {
    fontSize: 12,
    color: colors.text_secondary,
    marginTop: 2,
  },
  ratingText: {
    fontSize: 12,
    color: colors.text_primary,
    fontWeight: '600',
  },
  dotSeparator: {
    color: colors.text_tertiary,
    fontSize: 12,
  },
  categoryText: {
    fontSize: 12,
    color: colors.text_tertiary,
  },
  emptyContainer: {
    paddingVertical: spacing['3xl'],
    alignItems: 'center',
  },
  emptyText: {
    color: colors.text_tertiary,
    fontStyle: 'italic',
    fontSize: 14,
  },
});

const ArrowIcon = ({ direction, size, color }: any) => {
  const rotation = direction === 'right' ? '0deg' : direction === 'left' ? '180deg' : direction === 'up' ? '-90deg' : '90deg';
  return (
    <View style={{ transform: [{ rotate: rotation }] }}>
      <Text style={{ fontSize: size, color }}>→</Text>
    </View>
  );
};

export default DappsSearchResultsScreen;
