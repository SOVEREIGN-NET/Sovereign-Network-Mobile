/**
 * Domain Detail Screen
 * View domain details with actions
 */

import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Card,
  Text,
  Button,
  LoadingView,
  Column,
  FormField,
  HeaderBar,
  ScreenLayout,
  DetailRow,
  SectionLabel,
} from '../components';
import { colors, spacing, typography, borderRadius } from '../theme';
import domainService from '../services/DomainService';

// Storage keys
const REGISTERED_DOMAINS_KEY = 'sov:registered_domains';

interface DomainData {
  domain: string;
  owner: string;
  expires_at: string;
  tx_hash: string;
  registered_at: string;
}

const DomainDetailScreen = ({ route, navigation }: any) => {
  const insets = useSafeAreaInsets();
  const { domainName } = route.params || {};

  // State
  const [domain, setDomain] = useState<DomainData | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [contentCid, setContentCid] = useState('');
  const [updateError, setUpdateError] = useState<string>();
  const [updateStatus, setUpdateStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({
    type: null,
    message: '',
  });

  // Load domain data
  React.useEffect(() => {
    const loadDomainData = async () => {
      try {
        setLoading(true);
        const storedDomainsJson = await AsyncStorage.getItem(REGISTERED_DOMAINS_KEY);
        const storedDomains = storedDomainsJson ? JSON.parse(storedDomainsJson) : [];
        const found = storedDomains.find((d: DomainData) => d.domain === domainName);

        if (found) {
          setDomain(found);
          console.log('[DomainDetailScreen] Loaded domain:', domainName);
        } else {
          Alert.alert('Error', 'Domain not found');
          navigation?.goBack();
        }
      } catch (error) {
        console.error('[DomainDetailScreen] Failed to load domain:', error);
        Alert.alert('Error', 'Failed to load domain details');
      } finally {
        setLoading(false);
      }
    };

    loadDomainData();
  }, [domainName, navigation]);

  // Handle update domain content
  const handleUpdateContent = async () => {
    if (!contentCid.trim()) {
      setUpdateError('Content CID is required');
      return;
    }

    if (!domain) return;

    setUpdating(true);
    setUpdateError(undefined);
    setUpdateStatus({ type: null, message: '' });

    try {
      console.log('[DomainDetailScreen] Updating domain content:', {
        domain: domainName,
        contentCid,
      });

      await domainService.updateDomain({
        domain: domainName,
        content_cid: contentCid,
      });

      setUpdateStatus({
        type: 'success',
        message: 'Domain content updated successfully!',
      });

      setContentCid('');

      // Close after 2 seconds
      setTimeout(() => {
        navigation?.goBack();
      }, 2000);
    } catch (error: any) {
      console.error('[DomainDetailScreen] Update failed:', error);
      setUpdateStatus({
        type: 'error',
        message: error.message || 'Failed to update domain',
      });
    } finally {
      setUpdating(false);
    }
  };

  // Handle delete domain from list
  const handleDeleteDomain = () => {
    Alert.alert(
      'Delete Domain',
      `Remove "${domainName}" from your domain list?`,
      [
        { text: 'Cancel', onPress: () => {} },
        {
          text: 'Delete',
          onPress: async () => {
            try {
              const storedDomainsJson = await AsyncStorage.getItem(REGISTERED_DOMAINS_KEY);
              let storedDomains = storedDomainsJson ? JSON.parse(storedDomainsJson) : [];
              storedDomains = storedDomains.filter((d: DomainData) => d.domain !== domainName);
              await AsyncStorage.setItem(REGISTERED_DOMAINS_KEY, JSON.stringify(storedDomains));
              Alert.alert('Success', 'Domain removed from your list');
              navigation?.goBack();
            } catch (error) {
              console.error('[DomainDetailScreen] Failed to delete domain:', error);
              Alert.alert('Error', 'Failed to delete domain');
            }
          },
          style: 'destructive',
        },
      ]
    );
  };

  if (loading || !domain) {
    return <LoadingView />;
  }

  const expiryDate = new Date(domain.expires_at);
  const now = new Date();
  const isExpired = now > expiryDate;
  const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: colors.bg_darkest }}
    >
      <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
        <HeaderBar title={domainName} onBackPress={() => navigation?.goBack()} />

        <ScreenLayout paddingTop={spacing.md}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Column gap="md" style={{ paddingBottom: spacing.xl }}>
              {/* Domain Header Card */}
              <View style={{ paddingHorizontal: spacing.sm }}>
                <Card style={{ marginHorizontal: 0, backgroundColor: colors.bg_darker }}>
                  <View
                    style={{
                      padding: spacing.lg,
                      alignItems: 'center',
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                      marginBottom: spacing.md,
                    }}
                  >
                    <Text style={{ fontSize: typography.size['4xl'], marginBottom: spacing.sm }}>🌐</Text>
                    <Text
                      style={{
                        fontSize: typography.size.xl,
                        fontWeight: typography.weight.bold,
                        color: colors.text_primary,
                        marginBottom: spacing.xs,
                      }}
                    >
                      {domainName}
                    </Text>
                    <View
                      style={{
                        paddingHorizontal: spacing.md,
                        paddingVertical: spacing.xs,
                        backgroundColor: isExpired ? colors.error : colors.success,
                        borderRadius: borderRadius.full,
                        marginTop: spacing.xs,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: typography.size.xs,
                          color: colors.bg_darkest,
                          fontWeight: typography.weight.semibold,
                        }}
                      >
                        {isExpired ? 'EXPIRED' : 'ACTIVE'}
                      </Text>
                    </View>
                  </View>

                  {/* Domain Info Section */}
                  <SectionLabel style={{ paddingHorizontal: spacing.md }}>Details</SectionLabel>
                  <Column gap="sm" style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
                    <DetailRow
                      label="Status"
                      value={
                        isExpired ? 'Expired' : `${daysUntilExpiry} days remaining`
                      }
                    />
                    <DetailRow label="Owner" value={domain.owner.substring(0, 16) + '...'} />
                    <DetailRow label="Expires" value={expiryDate.toLocaleDateString()} />
                    <DetailRow label="Registered" value={new Date(domain.registered_at).toLocaleDateString()} />
                    <DetailRow
                      label="TX Hash"
                      value={domain.tx_hash.substring(0, 12) + '...'}
                    />
                  </Column>
                </Card>
              </View>

              {/* Update Content Section */}
              {!isExpired && (
                <View style={{ paddingHorizontal: spacing.sm }}>
                  <Card style={{ marginHorizontal: 0 }}>
                    <SectionLabel>Update Content</SectionLabel>

                    <View style={{ gap: spacing.md, paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
                      <Text
                        style={{
                          fontSize: typography.size.sm,
                          color: colors.text_secondary,
                          lineHeight: 20,
                        }}
                      >
                        Point this domain to new content by providing an IPFS CID (Content Identifier).
                      </Text>

                      <FormField
                        label="Content CID (IPFS)"
                        placeholder="QmXxxx... or ipfs://..."
                        value={contentCid}
                        onChangeText={(text) => {
                          setContentCid(text);
                          setUpdateError(undefined);
                        }}
                        error={updateError}
                        editable={!updating}
                        autoCapitalize="none"
                      />

                      {updateStatus.type && (
                        <Card
                          style={{
                            marginHorizontal: 0,
                            backgroundColor:
                              updateStatus.type === 'success'
                                ? `${colors.success}15`
                                : `${colors.error}15`,
                            borderWidth: 1,
                            borderColor:
                              updateStatus.type === 'success'
                                ? colors.success
                                : colors.error,
                          }}
                        >
                          <View style={{ padding: spacing.md }}>
                            <Text
                              style={{
                                fontSize: typography.size.sm,
                                color:
                                  updateStatus.type === 'success'
                                    ? colors.success
                                    : colors.error,
                              }}
                            >
                              {updateStatus.message}
                            </Text>
                          </View>
                        </Card>
                      )}

                      <Button
                        title={updating ? 'Updating...' : 'Update Content'}
                        onPress={handleUpdateContent}
                        disabled={updating}
                        style={{
                          backgroundColor: updating ? colors.text_secondary : colors.primary,
                        }}
                      />
                    </View>
                  </Card>
                </View>
              )}

              {/* Actions Section */}
              <View style={{ paddingHorizontal: spacing.sm }}>
                <Card style={{ marginHorizontal: 0 }}>
                  <SectionLabel>Actions</SectionLabel>

                  <View style={{ gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
                    <Button
                      title="Remove from List"
                      onPress={handleDeleteDomain}
                      variant="secondary"
                    />
                  </View>
                </Card>
              </View>
            </Column>
          </ScrollView>
        </ScreenLayout>
      </View>
    </KeyboardAvoidingView>
  );
};

export default DomainDetailScreen;
