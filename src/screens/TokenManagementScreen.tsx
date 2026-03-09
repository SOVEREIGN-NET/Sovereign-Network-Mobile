/**
 * Token Management Screen
 * Full token info for each tracked token. Delete is a secondary action.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Clipboard,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, typography, borderRadius } from '../theme';
import tokenService from '../services/TokenService';
import type { TokenInfoResponse } from '../types/token';

const TRACKED_TOKENS_KEY = 'sov:tracked_tokens';
const LEGACY_CREATED_TOKENS_KEY = 'sov:created_tokens';

interface TrackedToken {
  tokenId: string;
  info: TokenInfoResponse | null;
  error?: string;
}

const copy = (value: string, label: string) => {
  Clipboard.setString(value);
  Alert.alert('Copied', `${label} copied to clipboard`);
};

const Row = ({ label, value, mono, copyable }: { label: string; value: string; mono?: boolean; copyable?: boolean }) => (
  <TouchableOpacity
    activeOpacity={copyable ? 0.5 : 1}
    onPress={copyable ? () => copy(value, label) : undefined}
    style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: `${colors.text_secondary}15` }}
  >
    <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary, textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 }}>
      {label}{copyable ? ' ⎘' : ''}
    </Text>
    <Text style={{ fontSize: typography.size.xs, color: copyable ? colors.primary : colors.text_primary, flex: 2, textAlign: 'right', fontFamily: mono ? 'Courier' : undefined }} numberOfLines={mono ? 1 : 2} ellipsizeMode="middle">
      {value}
    </Text>
  </TouchableOpacity>
);

const TokenManagementScreen = ({ navigation }: any) => {
  const insets = useSafeAreaInsets();
  const [tokens, setTokens] = useState<TrackedToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadTrackedIds = useCallback(async (): Promise<string[]> => {
    const json = await AsyncStorage.getItem(TRACKED_TOKENS_KEY);
    if (json) return JSON.parse(json);
    const legacy = await AsyncStorage.getItem(LEGACY_CREATED_TOKENS_KEY);
    if (legacy) {
      const ids: string[] = JSON.parse(legacy);
      await AsyncStorage.setItem(TRACKED_TOKENS_KEY, JSON.stringify(ids));
      await AsyncStorage.removeItem(LEGACY_CREATED_TOKENS_KEY);
      return ids;
    }
    return [];
  }, []);

  const saveTrackedIds = useCallback(async (ids: string[]) => {
    if (ids.length > 0) {
      await AsyncStorage.setItem(TRACKED_TOKENS_KEY, JSON.stringify(ids));
    } else {
      await AsyncStorage.removeItem(TRACKED_TOKENS_KEY);
    }
    await AsyncStorage.removeItem(LEGACY_CREATED_TOKENS_KEY);
  }, []);

  const loadTokens = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const ids = await loadTrackedIds();
      const results: TrackedToken[] = await Promise.all(
        ids.map(async (tokenId) => {
          try {
            const info = await tokenService.getTokenInfo(tokenId);
            return { tokenId, info };
          } catch (e: any) {
            return { tokenId, info: null, error: e?.message || 'Not found' };
          }
        })
      );
      setTokens(results);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadTrackedIds]);

  useEffect(() => { loadTokens(); }, [loadTokens]);

  const removeToken = useCallback((tokenId: string) => {
    Alert.alert('Remove from tracked list?', tokenId.slice(0, 16) + '...', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const ids = await loadTrackedIds();
          await saveTrackedIds(ids.filter(id => id !== tokenId));
          setTokens(prev => prev.filter(t => t.tokenId !== tokenId));
        },
      },
    ]);
  }, [loadTrackedIds, saveTrackedIds]);

  const formatSupply = (supply: number, decimals: number) => {
    const human = supply / Math.pow(10, decimals);
    if (human >= 1e9) return `${(human / 1e9).toFixed(2)}B`;
    if (human >= 1e6) return `${(human / 1e6).toFixed(2)}M`;
    if (human >= 1e3) return `${(human / 1e3).toFixed(2)}K`;
    return human.toLocaleString();
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg_darkest, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.md, paddingBottom: spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Text style={{ fontSize: typography.size.xl, fontWeight: typography.weight.bold, color: colors.text_primary }}>
            My Tokens
          </Text>
          <Text style={{ fontSize: typography.size.sm, color: colors.text_secondary, marginTop: 2 }}>
            {tokens.length} tracked
          </Text>
        </View>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={{ fontSize: typography.size.lg, color: colors.text_secondary }}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + spacing.xl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadTokens(true)} tintColor={colors.primary} />}
      >
        {tokens.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: spacing.xl * 2 }}>
            <Text style={{ fontSize: typography.size.md, color: colors.text_secondary }}>No tokens tracked yet</Text>
          </View>
        ) : (
          tokens.map(({ tokenId, info, error }) => (
            <View key={tokenId} style={{ backgroundColor: colors.bg_lighter, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.md, borderLeftWidth: 3, borderLeftColor: info ? colors.primary : colors.error }}>

              {/* Token header */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <View style={{ backgroundColor: `${colors.primary}20`, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: borderRadius.sm }}>
                    <Text style={{ fontSize: typography.size.sm, fontWeight: typography.weight.bold, color: colors.primary, fontFamily: 'Courier' }}>
                      {info?.symbol ?? '???'}
                    </Text>
                  </View>
                  <Text style={{ fontSize: typography.size.md, fontWeight: typography.weight.semibold, color: colors.text_primary }}>
                    {info?.name ?? 'Unknown Token'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => removeToken(tokenId)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={{ padding: 4 }}
                >
                  <Text style={{ fontSize: typography.size.xs, color: colors.error, opacity: 0.7 }}>Remove</Text>
                </TouchableOpacity>
              </View>

              {info ? (
                <>
                  <Row label="Token ID"     value={tokenId}           mono copyable />
                  <Row label="Creator"      value={info.creator}      mono copyable />
                  <Row label="Decimals"     value={String(info.decimals)} />
                  <Row label="Total Supply"
                    value={`${formatSupply(info.total_supply, info.decimals)} (${info.total_supply.toLocaleString()} raw)`}
                  />
                  <Row label="Max Supply"
                    value={info.max_supply != null
                      ? `${formatSupply(info.max_supply, info.decimals)} (${info.max_supply.toLocaleString()} raw)`
                      : 'Unlimited'}
                  />
                  <Row label="Deflationary"     value={info.is_deflationary ? 'Yes' : 'No'} />
                  <Row label="Created at Block" value={info.created_at_block != null ? String(info.created_at_block) : 'Pending'} />
                </>
              ) : (
                <View style={{ paddingVertical: spacing.sm }}>
                  <Text style={{ fontSize: typography.size.xs, color: colors.error }}>{error}</Text>
                  <Text style={{ fontSize: typography.size.xs, color: colors.text_secondary, marginTop: 4, fontFamily: 'Courier' }}>{tokenId}</Text>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
};

export default TokenManagementScreen;
