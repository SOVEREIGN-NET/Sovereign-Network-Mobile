/**
 * Domain Management Screen
 * View and manage user's registered .sov domains
 */

import React, { useState, useEffect } from 'react';
import { View, ScrollView, TouchableOpacity, Alert, FlatList } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import {
  Card,
  Text,
  LoadingView,
  Column,
  HeaderBar,
  ScreenLayout,
} from '../components';
import { colors, spacing, typography, borderRadius } from '../theme';
import domainService from '../services/DomainService';

// Storage keys
const REGISTERED_DOMAINS_KEY = 'sov:registered_domains';

interface StoredDomain {
  domain: string;
  owner: string;
  expires_at: string;
  tx_hash: string;
  registered_at: string;
}

interface DomainWithStatus extends StoredDomain {
  status: 'active' | 'expired' | 'unknown';
  daysUntilExpiry?: number;
}

const DomainManagementScreen = ({ navigation }: any) => {
  const [domains, setDomains] = useState<DomainWithStatus[]>([]);
  const [loading, setLoading] = useState(false);

  // Load domains from AsyncStorage
  const loadDomains = async () => {
    try {
      setLoading(true);
      const storedDomainsJson = await AsyncStorage.getItem(REGISTERED_DOMAINS_KEY);
      const storedDomains = storedDomainsJson ? JSON.parse(storedDomainsJson) : [];

      // Check status of each domain
      const domainsWithStatus: DomainWithStatus[] = await Promise.all(
        storedDomains.map(async (domain: StoredDomain) => {
          try {
            const expiryDate = new Date(domain.expires_at);
            const now = new Date();
            const isExpired = now > expiryDate;
            const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

            return {
              ...domain,
              status: isExpired ? 'expired' : 'active',
              daysUntilExpiry: Math.max(0, daysUntilExpiry),
            };
          } catch (error) {
            console.error('[DomainManagementScreen] Error checking domain status:', domain.domain, error);
            return {
              ...domain,
              status: 'unknown',
            };
          }
        })
      );

      setDomains(domainsWithStatus);
    } catch (error) {
      console.error('[DomainManagementScreen] Failed to load domains:', error);
      Alert.alert('Error', 'Failed to load domains');
    } finally {
      setLoading(false);
    }
  };

  // Load domains when screen is focused
  useFocusEffect(
    React.useCallback(() => {
      loadDomains();
    }, [])
  );

  // Delete domain from local list
  const handleDeleteDomain = async (domain: string) => {
    Alert.alert(
      'Delete Domain',
      `Remove "${domain}" from your domain list?`,
      [
        { text: 'Cancel', onPress: () => {} },
        {
          text: 'Delete',
          onPress: async () => {
            try {
              const storedDomainsJson = await AsyncStorage.getItem(REGISTERED_DOMAINS_KEY);
              let storedDomains = storedDomainsJson ? JSON.parse(storedDomainsJson) : [];
              storedDomains = storedDomains.filter((d: StoredDomain) => d.domain !== domain);
              await AsyncStorage.setItem(REGISTERED_DOMAINS_KEY, JSON.stringify(storedDomains));
              setDomains(domains.filter(d => d.domain !== domain));
              Alert.alert('Success', 'Domain removed from your list');
            } catch (error) {
              console.error('[DomainManagementScreen] Failed to delete domain:', error);
              Alert.alert('Error', 'Failed to delete domain');
            }
          },
          style: 'destructive',
        },
      ]
    );
  };

  // Cleanup expired domains
  const handleCleanupExpired = async () => {
    try {
      const expiredDomains = domains.filter(d => d.status === 'expired');
      if (expiredDomains.length === 0) {
        Alert.alert('Info', 'No expired domains to clean up');
        return;
      }

      Alert.alert(
        'Cleanup Expired Domains',
        `Remove ${expiredDomains.length} expired domain(s)?`,
        [
          { text: 'Cancel', onPress: () => {} },
          {
            text: 'Clean Up',
            onPress: async () => {
              try {
                const storedDomainsJson = await AsyncStorage.getItem(REGISTERED_DOMAINS_KEY);
                let storedDomains = storedDomainsJson ? JSON.parse(storedDomainsJson) : [];
                storedDomains = storedDomains.filter(
                  (d: StoredDomain) => !expiredDomains.find(ed => ed.domain === d.domain)
                );
                await AsyncStorage.setItem(REGISTERED_DOMAINS_KEY, JSON.stringify(storedDomains));
                setDomains(domains.filter(d => d.status !== 'expired'));
                Alert.alert('Success', 'Expired domains cleaned up');
              } catch (error) {
                console.error('[DomainManagementScreen] Failed to cleanup:', error);
                Alert.alert('Error', 'Failed to cleanup domains');
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error('[DomainManagementScreen] Error in cleanup:', error);
    }
  };

  const activeDomains = domains.filter(d => d.status === 'active');
  const expiredDomains = domains.filter(d => d.status === 'expired');

  if (loading) {
    return <LoadingView />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
      <HeaderBar onBackPress={() => navigation?.goBack()} title="My Domains" />

      <ScreenLayout paddingTop={spacing.md}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Column gap="md" style={{ paddingBottom: spacing.xl }}>
            {/* Summary Cards */}
            <View style={{ flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.sm }}>
              <Card style={{ flex: 1, marginHorizontal: 0 }}>
                <View style={{ padding: spacing.md, alignItems: 'center' }}>
                  <Text
                    style={{
                      fontSize: typography.size['2xl'],
                      fontWeight: typography.weight.bold,
                      color: colors.success,
                    }}
                  >
                    {activeDomains.length}
                  </Text>
                  <Text
                    style={{
                      fontSize: typography.size.xs,
                      color: colors.text_secondary,
                      marginTop: spacing.xs,
                      textAlign: 'center',
                    }}
                  >
                    Active
                  </Text>
                </View>
              </Card>

              <Card style={{ flex: 1, marginHorizontal: 0 }}>
                <View style={{ padding: spacing.md, alignItems: 'center' }}>
                  <Text
                    style={{
                      fontSize: typography.size['2xl'],
                      fontWeight: typography.weight.bold,
                      color: colors.error,
                    }}
                  >
                    {expiredDomains.length}
                  </Text>
                  <Text
                    style={{
                      fontSize: typography.size.xs,
                      color: colors.text_secondary,
                      marginTop: spacing.xs,
                      textAlign: 'center',
                    }}
                  >
                    Expired
                  </Text>
                </View>
              </Card>
            </View>

            {/* Cleanup Button */}
            {expiredDomains.length > 0 && (
              <TouchableOpacity
                style={{
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.md,
                  backgroundColor: colors.bg_darker,
                  borderRadius: borderRadius.md,
                  borderWidth: 1,
                  borderColor: colors.error,
                  marginHorizontal: spacing.sm,
                }}
                onPress={handleCleanupExpired}
              >
                <Text
                  style={{
                    fontSize: typography.size.sm,
                    color: colors.error,
                    textAlign: 'center',
                    fontWeight: typography.weight.semibold,
                  }}
                >
                  🗑️ Clean Up Expired Domains
                </Text>
              </TouchableOpacity>
            )}

            {/* Active Domains */}
            {activeDomains.length > 0 && (
              <View style={{ paddingHorizontal: spacing.sm }}>
                <Text
                  style={{
                    fontSize: typography.size.sm,
                    color: colors.text_secondary,
                    marginBottom: spacing.md,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  Active Domains ({activeDomains.length})
                </Text>

                <Column gap="sm">
                  {activeDomains.map((domain) => (
                    <Card key={domain.domain} style={{ marginHorizontal: 0 }}>
                      <View
                        style={{
                          padding: spacing.md,
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                        }}
                      >
                        <View style={{ flex: 1, gap: spacing.xs }}>
                          <Text
                            style={{
                              fontSize: typography.size.md,
                              fontWeight: typography.weight.semibold,
                              color: colors.text_primary,
                            }}
                          >
                            {domain.domain}
                          </Text>
                          <Text
                            style={{
                              fontSize: typography.size.xs,
                              color: colors.success,
                            }}
                          >
                            {domain.daysUntilExpiry} days left
                          </Text>
                          <Text
                            style={{
                              fontSize: typography.size.xs,
                              color: colors.text_secondary,
                            }}
                          >
                            Expires: {new Date(domain.expires_at).toLocaleDateString()}
                          </Text>
                        </View>

                        <TouchableOpacity
                          onPress={() => handleDeleteDomain(domain.domain)}
                          style={{ paddingLeft: spacing.md }}
                        >
                          <Text style={{ fontSize: typography.size.lg }}>×</Text>
                        </TouchableOpacity>
                      </View>
                    </Card>
                  ))}
                </Column>
              </View>
            )}

            {/* Expired Domains */}
            {expiredDomains.length > 0 && (
              <View style={{ paddingHorizontal: spacing.sm }}>
                <Text
                  style={{
                    fontSize: typography.size.sm,
                    color: colors.text_secondary,
                    marginBottom: spacing.md,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  Expired Domains ({expiredDomains.length})
                </Text>

                <Column gap="sm">
                  {expiredDomains.map((domain) => (
                    <Card key={domain.domain} style={{ marginHorizontal: 0, opacity: 0.6 }}>
                      <View
                        style={{
                          padding: spacing.md,
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                        }}
                      >
                        <View style={{ flex: 1, gap: spacing.xs }}>
                          <Text
                            style={{
                              fontSize: typography.size.md,
                              fontWeight: typography.weight.semibold,
                              color: colors.text_secondary,
                            }}
                          >
                            {domain.domain}
                          </Text>
                          <Text
                            style={{
                              fontSize: typography.size.xs,
                              color: colors.error,
                            }}
                          >
                            Expired
                          </Text>
                          <Text
                            style={{
                              fontSize: typography.size.xs,
                              color: colors.text_secondary,
                            }}
                          >
                            Expired: {new Date(domain.expires_at).toLocaleDateString()}
                          </Text>
                        </View>

                        <TouchableOpacity
                          onPress={() => handleDeleteDomain(domain.domain)}
                          style={{ paddingLeft: spacing.md }}
                        >
                          <Text style={{ fontSize: typography.size.lg }}>×</Text>
                        </TouchableOpacity>
                      </View>
                    </Card>
                  ))}
                </Column>
              </View>
            )}

            {/* Empty State */}
            {domains.length === 0 && (
              <Card style={{ marginHorizontal: spacing.sm, backgroundColor: colors.bg_darker }}>
                <View style={{ padding: spacing.lg, alignItems: 'center' }}>
                  <Text
                    style={{
                      fontSize: typography.size.lg,
                      color: colors.text_secondary,
                      textAlign: 'center',
                    }}
                  >
                    🌐 No domains yet
                  </Text>
                  <Text
                    style={{
                      fontSize: typography.size.sm,
                      color: colors.text_secondary,
                      marginTop: spacing.md,
                      textAlign: 'center',
                    }}
                  >
                    Register your first .sov domain to get started
                  </Text>
                </View>
              </Card>
            )}
          </Column>
        </ScrollView>
      </ScreenLayout>
    </View>
  );
};

export default DomainManagementScreen;
