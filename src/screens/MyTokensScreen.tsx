/**
 * My Tokens Screen
 * List user's tracked and owned sovereign assets (DAO M3 — ticker-free discovery).
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
import { colors, spacing, typography } from '../theme';
import { useAuth } from '../hooks/useAuth';
import tokenService from '../services/TokenService';
import assetService from '../services/AssetService';
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
  dao_class?: string;
  share_link?: string;
}

const formatAtoms = (
  atoms: string | number | null | undefined,
  decimals: number | null | undefined,
): string | null => {
  if (atoms == null || decimals == null || !Number.isFinite(decimals) || decimals < 0) {
    return null;
  }
  return atomsToDisplayLocale(String(atoms), decimals);
};

const MyTokensScreen = ({ navigation }: any) => {
  const { currentIdentity } = useAuth();
  const [tokens, setTokens] = useState<TokenWithInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const loadTokens = async () => {
    if (!currentIdentity?.did) {
      return;
    }

    setLoading(true);

    try {
      const allTokens: TokenWithInfo[] = [];
      const tokenMap = new Map<string, TokenWithInfo>();

      const hexAddress = currentIdentity.did.startsWith('did:zhtp:')
        ? currentIdentity.did.substring('did:zhtp:'.length)
        : currentIdentity.did;

      console.log('[MyTokensScreen] Loading assets for:', hexAddress);

      // 1. Portfolio balances (assets API first; soft-fallback inside AssetService)
      try {
        const balances = await assetService.getBalancesForAddress(hexAddress);
        if (balances && balances.length > 0) {
          balances.forEach(token => {
            const id = (token.asset_id || token.token_id || '').toString();
            if (!id) {
              return;
            }
            const tokenInfo: TokenWithInfo = {
              token_id: id,
              name: token.name || 'Unknown',
              symbol: token.symbol || 'Token',
              totalSupplyDisplay: formatAtoms(token.total_supply, token.decimals),
              balanceDisplay: formatAtoms(token.balance, token.decimals),
              share_link: `zhtp://asset/${id}`,
            };
            tokenMap.set(id, tokenInfo);
            allTokens.push(tokenInfo);
          });
        }
      } catch (error) {
        console.warn('[MyTokensScreen] Failed to load asset balances:', error);
      }

      // 2. Catalog discovery (ticker-free — no BUBL hardcode)
      try {
        const catalog = await assetService.listAssets();
        for (const asset of catalog) {
          if (!tokenMap.has(asset.asset_id)) {
            const decimals = asset.decimals ?? 18;
            const tokenInfo: TokenWithInfo = {
              token_id: asset.asset_id,
              name: asset.name || 'Unknown',
              symbol: asset.symbol || 'Token',
              totalSupplyDisplay: formatAtoms(asset.total_supply, decimals),
              balanceDisplay: undefined,
              dao_class: asset.dao_class,
              share_link: asset.share_link || `zhtp://asset/${asset.asset_id}`,
            };
            tokenMap.set(asset.asset_id, tokenInfo);
            allTokens.push(tokenInfo);
          } else {
            const existing = tokenMap.get(asset.asset_id)!;
            existing.dao_class = asset.dao_class || existing.dao_class;
            existing.share_link =
              asset.share_link || existing.share_link || `zhtp://asset/${asset.asset_id}`;
          }
        }
      } catch (error) {
        console.warn('[MyTokensScreen] Failed to load asset catalog:', error);
      }

      // 3. Tracked asset IDs (local Create New history)
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
              const asset = await assetService.getAsset(tokenId);
              const decimals = asset.decimals ?? 18;
              let balanceDisplay: string | null | undefined = undefined;
              try {
                const bal = await tokenService.getTokenBalance(tokenId, hexAddress);
                if (bal && bal.balance != null) {
                  balanceDisplay = formatAtoms(bal.balance, bal.decimals ?? decimals);
                }
              } catch {
                // optional balance
              }
              const token: TokenWithInfo = {
                token_id: tokenId,
                name: asset.name || 'Unknown',
                symbol: asset.symbol || 'Token',
                totalSupplyDisplay: formatAtoms(asset.total_supply, decimals),
                balanceDisplay,
                dao_class: asset.dao_class,
                share_link: asset.share_link || `zhtp://asset/${tokenId}`,
              };
              tokenMap.set(tokenId, token);
              allTokens.push(token);
            } catch {
              try {
                const tokenInfo = await tokenService.getTokenInfo(tokenId);
                let balanceDisplay: string | null = '0';
                try {
                  const bal = await tokenService.getTokenBalance(tokenId, hexAddress);
                  if (bal && bal.balance != null) {
                    balanceDisplay = formatAtoms(bal.balance, tokenInfo.decimals);
                  }
                } catch {
                  // keep zero
                }
                const token: TokenWithInfo = {
                  token_id: tokenId,
                  name: tokenInfo.name || 'Unknown',
                  symbol: tokenInfo.symbol || 'Token',
                  totalSupplyDisplay: formatAtoms(
                    tokenInfo.total_supply,
                    tokenInfo.decimals,
                  ),
                  balanceDisplay,
                };
                tokenMap.set(tokenId, token);
                allTokens.push(token);
              } catch (error) {
                console.warn(
                  '[MyTokensScreen] Failed to get info for asset:',
                  tokenId,
                  error,
                );
              }
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

  useFocusEffect(
    React.useCallback(() => {
      loadTokens();
    }, [currentIdentity?.did]),
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
          <View
            style={{
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
              paddingHorizontal: spacing.lg,
            }}
          >
            <Text
              style={{
                fontSize: typography.size.lg,
                color: colors.text_secondary,
                textAlign: 'center',
              }}
            >
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
              Launch a DAO, receive assets, or wait for catalog discovery
            </Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            <Column
              gap="sm"
              style={{ paddingHorizontal: spacing.sm, paddingBottom: spacing.xl }}
            >
              {tokens.map(token => (
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
                          {token.dao_class
                            ? ` · ${token.dao_class.toUpperCase()}`
                            : ''}
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
                        {token.share_link ? (
                          <Text
                            style={{
                              fontSize: typography.size.xs,
                              color: colors.text_secondary,
                              marginTop: 2,
                            }}
                            numberOfLines={1}
                          >
                            {token.share_link}
                          </Text>
                        ) : null}
                      </View>

                      <Text
                        style={{
                          fontSize: typography.size.lg,
                          color: colors.text_secondary,
                        }}
                      >
                        ›
                      </Text>
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
