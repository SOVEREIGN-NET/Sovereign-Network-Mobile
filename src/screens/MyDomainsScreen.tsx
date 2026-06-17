/**
 * My Domains Screen
 * List user's registered .sov domains
 */

import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity, Alert, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Button,
  Card,
  Text,
  LoadingView,
  Column,
  ScreenLayout,
} from '../components';
import { colors, spacing, typography, borderRadius } from '../theme';
import domainService from '../services/DomainService';
import { DOMAIN_REGISTRATION_DURATION_SECS } from '../types/domain';
import DomainRegistrationScreen from './DomainRegistrationScreen';

// Storage keys
const REGISTERED_DOMAINS_KEY = 'sov:registered_domains';
// Idempotence guard for the one-shot AsyncStorage migration. We run it on
// every loadDomains, but only do the write when at least one entry was
// actually fixed — the flag stops us from writing on subsequent loads if
// nothing needed fixing.
const MIGRATION_FLAG_KEY = 'sov:registered_domains_migrated_v1';

/**
 * Pre-2026-06-12 entries written by DomainRegistrationScreen carried
 * `expires_at: undefined` (the screen read a non-existent field off the
 * server response). For each entry whose `registered_at` parses but
 * `expires_at` doesn't, recompute `expires_at` as
 * `registered_at + DOMAIN_REGISTRATION_DURATION_SECS`. Returns the
 * possibly-modified array and a flag indicating whether anything changed.
 *
 * Also dedupes the array by domain name (case-insensitive, keeping the
 * latest entry per name) — pre-2026-06-12 the same screen also pushed
 * without deduping, so existing storage may contain duplicate keys that
 * cause React "duplicate key" warnings downstream.
 */
function migrateStoredDomains(
  raw: unknown,
): { entries: StoredDomain[]; changed: boolean } {
  if (!Array.isArray(raw)) return { entries: [], changed: !!raw };
  let changed = false;

  // Repair pass.
  const repaired = raw.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      changed = true;
      return null;
    }
    const e = entry as Partial<StoredDomain> & Record<string, unknown>;
    const expiryMs = e.expires_at ? new Date(e.expires_at).getTime() : NaN;
    if (Number.isFinite(expiryMs)) return e as StoredDomain;

    // expires_at is missing / unparseable — try to recompute from registered_at.
    const registeredMs = e.registered_at
      ? new Date(e.registered_at).getTime()
      : NaN;
    if (!Number.isFinite(registeredMs)) {
      // Can't recover this entry — but keep it (the loader marks it as
      // status: 'unknown' so the user can still see + delete it).
      return e as StoredDomain;
    }
    const recomputedExpiryMs =
      registeredMs + DOMAIN_REGISTRATION_DURATION_SECS * 1000;
    changed = true;
    return {
      ...e,
      expires_at: new Date(recomputedExpiryMs).toISOString(),
    } as StoredDomain;
  }).filter((e): e is StoredDomain => e !== null);

  // Dedupe pass — keep the latest entry per (case-insensitive) domain name.
  const byDomain = new Map<string, StoredDomain>();
  for (const entry of repaired) {
    if (!entry.domain) continue;
    const key = entry.domain.toLowerCase();
    if (byDomain.has(key)) changed = true;
    byDomain.set(key, entry);
  }
  const deduped = Array.from(byDomain.values());

  return { entries: deduped, changed };
}

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

const MyDomainsScreen = ({ navigation }: any) => {
  const insets = useSafeAreaInsets();
  const [domains, setDomains] = useState<DomainWithStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [domainRegistrationVisible, setDomainRegistrationVisible] = useState(false);

  // Load domains from AsyncStorage
  const loadDomains = async () => {
    try {
      setLoading(true);
      const storedDomainsJson = await AsyncStorage.getItem(REGISTERED_DOMAINS_KEY);
      let storedDomains: StoredDomain[] = [];
      if (storedDomainsJson) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(storedDomainsJson);
        } catch (e) {
          console.warn(
            '[MyDomainsScreen] AsyncStorage value is not valid JSON, ignoring:',
            e,
          );
          parsed = [];
        }
        const migrated = migrateStoredDomains(parsed);
        storedDomains = migrated.entries;
        if (migrated.changed) {
          console.log(
            '[MyDomainsScreen] migration: rewrote',
            storedDomains.length,
            'entries (repaired expires_at and/or deduped)',
          );
          try {
            await AsyncStorage.setItem(
              REGISTERED_DOMAINS_KEY,
              JSON.stringify(storedDomains),
            );
            await AsyncStorage.setItem(MIGRATION_FLAG_KEY, '1');
          } catch (e) {
            console.warn(
              '[MyDomainsScreen] failed to persist migration result:',
              e,
            );
          }
        }
      }

      // Check status of each domain
      const domainsWithStatus: DomainWithStatus[] = await Promise.all(
        storedDomains.map(async (domain: StoredDomain) => {
          try {
            const status = await domainService.getDomainStatus(domain.domain).catch(() => null);
            const expiresAt = status?.expires_at ?? domain.expires_at;
            const expiryDate = typeof expiresAt === 'number'
              ? new Date(expiresAt * 1000)
              : expiresAt
              ? new Date(expiresAt)
              : null;
            const expiryTime = expiryDate ? expiryDate.getTime() : NaN;
            if (!Number.isFinite(expiryTime)) {
              return {
                ...domain,
                status: 'unknown',
              };
            }
            const now = new Date();
            const isExpired = now.getTime() > expiryTime;
            const daysUntilExpiry = Math.ceil((expiryTime - now.getTime()) / (1000 * 60 * 60 * 24));

            return {
              ...domain,
              expires_at: expiryDate?.toISOString() || domain.expires_at,
              status: isExpired ? 'expired' : 'active',
              daysUntilExpiry: Math.max(0, daysUntilExpiry),
            };
          } catch (error) {
            return {
              ...domain,
              status: 'unknown',
            };
          }
        })
      );

      setDomains(domainsWithStatus);
    } catch (error) {
      console.error('[MyDomainsScreen] Failed to load domains:', error);
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

  if (loading) {
    return <LoadingView />;
  }

  const activeDomains = domains.filter((d) => d.status === 'active');
  const expiredDomains = domains.filter((d) => d.status === 'expired');

  const handleDomainPress = (domain: DomainWithStatus) => {
    navigation?.navigate('DomainDetail', { domainName: domain.domain });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          paddingTop: insets.top + spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.bg_dark,
        }}
      >
        <Text
          style={{
            fontSize: typography.size.lg,
            fontWeight: typography.weight.semibold,
            color: colors.text_primary,
          }}
        >
          My Domains
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button
            onPress={() => setDomainRegistrationVisible(true)}
            size="sm"
            variant="primary"
          >
            + Register
          </Button>
          <TouchableOpacity
            onPress={() => navigation?.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text
              style={{
                fontSize: typography.size.lg,
                color: colors.text_secondary,
                fontWeight: typography.weight.normal,
              }}
            >
              ✕
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScreenLayout paddingTop={spacing.md}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Column gap="md" style={{ paddingHorizontal: spacing.sm, paddingBottom: spacing.xl }}>
            {/* Summary Cards */}
            {domains.length > 0 && (
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
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
            )}

            {/* Active Domains */}
            {activeDomains.length > 0 && (
              <View>
                <Text
                  style={{
                    fontSize: typography.size.sm,
                    color: colors.text_secondary,
                    marginBottom: spacing.md,
                    marginLeft: spacing.sm,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  Active Domains ({activeDomains.length})
                </Text>

                <Column gap="sm">
                  {activeDomains.map((domain) => (
                    <TouchableOpacity key={domain.domain} onPress={() => handleDomainPress(domain)} activeOpacity={0.7}>
                      <Card style={{ marginHorizontal: 0 }}>
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
                              {Number.isFinite(domain.daysUntilExpiry ?? NaN)
                                ? `${domain.daysUntilExpiry} days left`
                                : 'Days left: —'}
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

                          <Text style={{ fontSize: typography.size.lg, color: colors.text_secondary }}>›</Text>
                        </View>
                      </Card>
                    </TouchableOpacity>
                  ))}
                </Column>
              </View>
            )}

            {/* Expired Domains */}
            {expiredDomains.length > 0 && (
              <View>
                <Text
                  style={{
                    fontSize: typography.size.sm,
                    color: colors.text_secondary,
                    marginBottom: spacing.md,
                    marginLeft: spacing.sm,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  Expired Domains ({expiredDomains.length})
                </Text>

                <Column gap="sm">
                  {expiredDomains.map((domain) => (
                    <TouchableOpacity key={domain.domain} onPress={() => handleDomainPress(domain)} activeOpacity={0.7}>
                      <Card style={{ marginHorizontal: 0, opacity: 0.6 }}>
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

                          <Text style={{ fontSize: typography.size.lg, color: colors.text_secondary }}>›</Text>
                        </View>
                      </Card>
                    </TouchableOpacity>
                  ))}
                </Column>
              </View>
            )}

            {/* Empty State */}
            {domains.length === 0 && (
              <Card style={{ marginHorizontal: 0, backgroundColor: colors.bg_darker }}>
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
                    Register your first .sov domain
                  </Text>
                  <Button
                    onPress={() => setDomainRegistrationVisible(true)}
                    variant="primary"
                    size="sm"
                    style={{ marginTop: spacing.lg }}
                  >
                    Register Domain
                  </Button>
                </View>
              </Card>
            )}
          </Column>
        </ScrollView>
      </ScreenLayout>

      {/* Domain Registration Modal */}
      <Modal
        visible={domainRegistrationVisible}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={() => setDomainRegistrationVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
          <DomainRegistrationScreen
            onClose={() => {
              setDomainRegistrationVisible(false);
              loadDomains();
            }}
          />
        </View>
      </Modal>
    </View>
  );
};

export default MyDomainsScreen;
