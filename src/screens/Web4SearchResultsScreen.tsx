/**
 * Web4 Search Results Screen
 * Global search results for domains, dApps, and identities.
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
  ArrowIcon,
  ActivityDot,
} from '../components';
import { colors, spacing, typography, borderRadius } from '../theme';
import { useTrendingDapps, getActivityColor } from '../hooks/useTrendingDapps';

const Web4SearchResultsScreen: React.FC<any> = ({ navigation, route }) => {
  const { query: initialQuery } = route.params || { query: '' };
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const trendingDapps = useTrendingDapps();

  // Mock data for search results
  const mockPeople = [
    { did: 'did:zhtp:74a2...f89e', name: 'Satoshi Sov', username: 'satoshi', type: 'citizen' },
    { did: 'did:zhtp:bc91...221a', name: 'Dev Explorer', username: 'explorer', type: 'developer' },
  ];

  const filteredResults = useMemo(() => {
    if (!searchQuery) return { domains: [], people: [] };

    const q = searchQuery.toLowerCase();

    const domains = (trendingDapps || []).filter(d =>
      d.name.toLowerCase().includes(q) || d.desc.toLowerCase().includes(q)
    );

    const people = mockPeople.filter(p =>
      p.name.toLowerCase().includes(q) || p.username.toLowerCase().includes(q)
    );

    return { domains, people };
  }, [searchQuery, trendingDapps]);

  const handleSearch = () => {
    // Keep current query
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
      <HeaderBar
        onBackPress={() => navigation.goBack()}
      />

      <ScreenLayout paddingTop={spacing.md} paddingHorizontal={0}>
        {/* Search Input Field */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search Web4..."
            placeholderTextColor={colors.text_tertiary}
            onSubmitEditing={handleSearch}
            autoCapitalize="none"
          />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Domains / Apps Section */}
          <Column gap="md" style={styles.section}>
            <Text style={styles.sectionTitle}>Domains & dApps</Text>
            {filteredResults.domains.length > 0 ? (
              filteredResults.domains.map(dapp => (
                <TouchableOpacity
                  key={dapp.id}
                  style={styles.resultCard}
                  onPress={() => navigation.navigate('Browser', { url: dapp.url })}
                >
                  <Row align="center" gap="md">
                    <View style={styles.iconPlaceholder}>
                      <Text style={styles.iconText}>{dapp.name.charAt(0)}</Text>
                    </View>
                    <Column style={{ flex: 1 }}>
                      <Text style={styles.resultName}>{dapp.name}</Text>
                      <Text style={styles.resultUrl}>{dapp.url}</Text>
                    </Column>
                    <ActivityDot color={getActivityColor(dapp.activityLevel)} />
                  </Row>
                </TouchableOpacity>
              ))
            ) : (
              <Text style={styles.emptyText}>No domains found matching "{searchQuery}"</Text>
            )}
          </Column>

          {/* People / Identities Section */}
          <Column gap="md" style={styles.section}>
            <Text style={styles.sectionTitle}>People</Text>
            {filteredResults.people.length > 0 ? (
              filteredResults.people.map(person => (
                <TouchableOpacity
                  key={person.did}
                  style={styles.resultCard}
                  onPress={() => {}}
                >
                  <Row align="center" gap="md">
                    <View style={[styles.iconPlaceholder, { borderRadius: 25 }]}>
                      <Text style={styles.iconText}>{person.name.charAt(0)}</Text>
                    </View>
                    <Column style={{ flex: 1 }}>
                      <Text style={styles.resultName}>{person.name}</Text>
                      <Text style={styles.resultUrl}>@{person.username}</Text>
                    </Column>
                    <Badge label={person.type} variant="info" size="sm" />
                  </Row>
                </TouchableOpacity>
              ))
            ) : (
              <Text style={styles.emptyText}>No people found matching "{searchQuery}"</Text>
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
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text_tertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  resultCard: {
    backgroundColor: colors.bg_darker,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: colors.bg_medium,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconText: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primary,
  },
  resultName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text_primary,
  },
  resultUrl: {
    fontSize: 12,
    color: colors.text_secondary,
    marginTop: 2,
  },
  emptyText: {
    color: colors.text_tertiary,
    fontStyle: 'italic',
    fontSize: 14,
  },
});

export default Web4SearchResultsScreen;
