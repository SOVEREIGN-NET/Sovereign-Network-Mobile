/**
 * My Tokens Screen
 * List user's tracked and owned tokens
 */

import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity, Alert } from 'react-native';
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
import { useAuth } from '../hooks/useAuth';
import tokenService from '../services/TokenService';
import { atomsToDisplayLocale } from '../utils/tokenUnits';

// Storage keys
const TRACKED_TOKENS_KEY = 'sov:tracked_tokens';
const LEGACY_CREATED_TOKENS_KEY = 'sov:created_tokens';

interface TokenWithInfo {
  token_id: string;
  name: string;
  symbol: string;
  /** Pre-formatted total supply (null if decimals unknown). */
  totalSupplyDisplay: string | null;
  /** Pre-formatted balance (undefined if not applicable, null if decimals unknown). */
  balanceDisplay?: string | null;
}

const formatAtoms = (atoms: string | null | undefined, decimals: number | null | undefined): string | null => {
  if (atoms == null || decimals == null || !Number.isFinite(decimals) || decimals < 0) return null;
  return atomsToDisplayLocale(String(atoms), decimals);
};

const MyTokensScreen = ({ navigation }: any) => {
  const { currentIdentity } = useAuth();
  const [tokens, setTokens] = useState<TokenWithInfo[]>([]);
  const [loading, setLoading] = useState(false);

  // Load tokens - both created and with balance
  const loadTokens = async () => {
    if (!currentIdentity?.did) {
      return;
    }

    setLoading(true);

    try {
      const allTokens: TokenWithInfo[] = [];
      const tokenMap = new Map<string, TokenWithInfo>();

      // 1. Load custom tokens with balances
      const hexAddress = currentIdentity.did.startsWith('did:zhtp:')
        ? currentIdentity.did.substring('did:zhtp:'.length)
        : currentIdentity.did;

      console.log('[MyTokensScreen] Loading custom tokens for:', hexAddress);
      try {
        const customTokens = await tokenService.getUserTokenBalances(hexAddress);
        if (customTokens && customTokens.length > 0) {
          customTokens.forEach(token => {
            const tokenInfo: TokenWithInfo = {
              token_id: token.token_id,
              name: token.name || 'Unknown',
              symbol: token.symbol || 'Token',
              totalSupplyDisplay: null,
              balanceDisplay: formatAtoms(token.balance, token.decimals),
            };
            tokenMap.set(token.token_id, tokenInfo);
            allTokens.push(tokenInfo);
          });
        }
      } catch (error) {
        console.warn('[MyTokensScreen] Failed to load custom tokens with balance:', error);
      }

      // 2. Load tracked token IDs (includes legacy "created tokens" key migration)
      try {
        let trackedTokenIds: string[] = [];
        const trackedTokensJson = await AsyncStorage.getItem(TRACKED_TOKENS_KEY);
        if (trackedTokensJson) {
          trackedTokenIds = JSON.parse(trackedTokensJson);
        } else {
          const legacyCreatedTokensJson = await AsyncStorage.getItem(
            LEGACY_CREATED_TOKENS_KEY,
          );
          if (legacyCreatedTokensJson) {
            trackedTokenIds = JSON.parse(legacyCreatedTokensJson);
            await AsyncStorage.setItem(
              TRACKED_TOKENS_KEY,
              JSON.stringify(trackedTokenIds),
            );
            await AsyncStorage.removeItem(LEGACY_CREATED_TOKENS_KEY);
          }
        }

        for (const tokenId of trackedTokenIds) {
          if (!tokenMap.has(tokenId)) {
            try {
              const tokenInfo = await tokenService.getTokenInfo(tokenId);
              const token: TokenWithInfo = {
                token_id: tokenId,
                name: tokenInfo.name || 'Unknown',
                symbol: tokenInfo.symbol || 'Token',
                totalSupplyDisplay: formatAtoms(tokenInfo.total_supply, tokenInfo.decimals),
                balanceDisplay: '0',
              };
              tokenMap.set(tokenId, token);
              allTokens.push(token);
            } catch (error) {
              console.warn('[MyTokensScreen] Failed to get info for token:', tokenId, error);
            }
          }
        }
      } catch (error) {
        console.warn('[MyTokensScreen] Failed to load tracked tokens:', error);
      }

      setTokens(allTokens);
      console.log('[MyTokensScreen] Loaded', allTokens.length, 'tokens');
    } catch (error) {
      console.error('[MyTokensScreen] Failed to load tokens:', error);
      Alert.alert('Error', 'Failed to load tokens');
    } finally {
      setLoading(false);
    }
  };

  // Load tokens when screen is focused
  useFocusEffect(
    React.useCallback(() => {
      loadTokens();
    }, [currentIdentity?.did])
  );

  if (!currentIdentity) {
    return <LoadingView />;
  }

  if (loading) {
    return <LoadingView />;
  }

  const handleTokenPress = (token: TokenWithInfo) => {
    navigation?.navigate('TokenDetail', { tokenId: token.token_id });
  };


  return (
    <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
      <HeaderBar title="My Tokens" onBackPress={() => navigation?.goBack()} />

      <ScreenLayout paddingTop={spacing.md}>
        {tokens.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.lg }}>
            <Text style={{ fontSize: typography.size.lg, color: colors.text_secondary, textAlign: 'center' }}>
              ◆ No tokens yet
            </Text>
            <Text
              style={{
                fontSize: typography.size.sm,
                color: colors.text_secondary,
                marginTop: spacing.md,
                textAlign: 'center',
              }}
            >
              Receive, trade, or track token IDs to see them here
            </Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            <Column gap="sm" style={{ paddingHorizontal: spacing.sm, paddingBottom: spacing.xl }}>
              {tokens.map((token) => (
                <TouchableOpacity
                  key={token.token_id}
                  onPress={() => handleTokenPress(token)}
                  activeOpacity={0.7}
                >
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
                          {token.name}
                        </Text>
                        <Text
                          style={{
                            fontSize: typography.size.sm,
                            color: colors.primary,
                            fontWeight: typography.weight.semibold,
                          }}
                        >
                          {token.symbol}
                        </Text>
                        <Text
                          style={{
                            fontSize: typography.size.xs,
                            color: colors.text_secondary,
                            marginTop: spacing.xs,
                          }}
                        >
                          {token.balanceDisplay !== undefined
                            ? `Balance: ${token.balanceDisplay ?? '—'}`
                            : `Total Supply: ${token.totalSupplyDisplay ?? '—'}`}
                        </Text>
                      </View>

                      <Text style={{ fontSize: typography.size.lg, color: colors.text_secondary }}>›</Text>
                    </View>
                  </Card>
                </TouchableOpacity>
              ))}
            </Column>
          </ScrollView>
        )}
      </ScreenLayout>
    </View>
  );
};

export default MyTokensScreen;
