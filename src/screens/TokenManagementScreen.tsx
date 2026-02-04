/**
 * Token Management Screen
 * Manage created tokens - view status and delete tokens that no longer exist
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../theme/tokens';
import tokenService from '../services/TokenService';

const CREATED_TOKENS_KEY = 'sov:created_tokens';

interface TokenStatus {
  tokenId: string;
  name?: string;
  symbol?: string;
  exists: boolean;
  error?: string;
}

const TokenManagementScreen = ({ navigation }: any) => {
  const [tokens, setTokens] = useState<TokenStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTokens = useCallback(async () => {
    setLoading(true);
    try {
      const createdTokensJson = await AsyncStorage.getItem(CREATED_TOKENS_KEY);
      if (!createdTokensJson) {
        setTokens([]);
        setLoading(false);
        return;
      }

      const tokenIds: string[] = JSON.parse(createdTokensJson);
      const tokenStatuses: TokenStatus[] = [];

      for (const tokenId of tokenIds) {
        try {
          const tokenInfo = await tokenService.getTokenInfo(tokenId);
          tokenStatuses.push({
            tokenId,
            name: tokenInfo.name,
            symbol: tokenInfo.symbol,
            exists: true,
          });
        } catch (error: any) {
          tokenStatuses.push({
            tokenId,
            exists: false,
            error: error.message || 'Token not found',
          });
        }
      }

      setTokens(tokenStatuses);
    } catch (error: any) {
      console.error('[TokenManagement] Failed to load tokens:', error);
      Alert.alert('Error', 'Failed to load tokens: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  const deleteToken = useCallback(async (tokenId: string) => {
    Alert.alert(
      'Delete Token',
      `Remove token ID from your created tokens list?`,
      [
        { text: 'Cancel', onPress: () => {} },
        {
          text: 'Delete',
          onPress: async () => {
            try {
              const createdTokensJson = await AsyncStorage.getItem(CREATED_TOKENS_KEY);
              if (createdTokensJson) {
                const tokenIds: string[] = JSON.parse(createdTokensJson);
                const filtered = tokenIds.filter(id => id !== tokenId);

                if (filtered.length > 0) {
                  await AsyncStorage.setItem(CREATED_TOKENS_KEY, JSON.stringify(filtered));
                } else {
                  await AsyncStorage.removeItem(CREATED_TOKENS_KEY);
                }

                // Reload the list
                await loadTokens();
                Alert.alert('Deleted', 'Token ID removed from your list');
              }
            } catch (error: any) {
              Alert.alert('Error', 'Failed to delete token: ' + error.message);
            }
          },
          style: 'destructive',
        },
      ]
    );
  }, [loadTokens]);

  const deleteAllInvalid = useCallback(async () => {
    const invalidTokens = tokens.filter(t => !t.exists);
    if (invalidTokens.length === 0) {
      Alert.alert('Info', 'No invalid tokens to delete');
      return;
    }

    Alert.alert(
      'Delete Invalid Tokens',
      `Remove ${invalidTokens.length} invalid token ID(s) from your list?`,
      [
        { text: 'Cancel', onPress: () => {} },
        {
          text: 'Delete All',
          onPress: async () => {
            try {
              const validTokenIds = tokens.filter(t => t.exists).map(t => t.tokenId);

              if (validTokenIds.length > 0) {
                await AsyncStorage.setItem(CREATED_TOKENS_KEY, JSON.stringify(validTokenIds));
              } else {
                await AsyncStorage.removeItem(CREATED_TOKENS_KEY);
              }

              await loadTokens();
              Alert.alert('Deleted', `${invalidTokens.length} invalid token(s) removed`);
            } catch (error: any) {
              Alert.alert('Error', 'Failed to delete tokens: ' + error.message);
            }
          },
          style: 'destructive',
        },
      ]
    );
  }, [tokens, loadTokens]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const validTokens = tokens.filter(t => t.exists);
  const invalidTokens = tokens.filter(t => !t.exists);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Token Management</Text>
          <Text style={styles.subtitle}>
            {tokens.length} token{tokens.length !== 1 ? 's' : ''} created
          </Text>
        </View>

        {tokens.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No created tokens yet</Text>
          </View>
        ) : (
          <>
            {/* Valid Tokens Section */}
            {validTokens.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Valid Tokens ({validTokens.length})</Text>
                {validTokens.map(token => (
                  <View key={token.tokenId} style={styles.tokenCard}>
                    <View style={styles.tokenInfo}>
                      <Text style={styles.tokenName}>{token.name}</Text>
                      <Text style={styles.tokenSymbol}>{token.symbol}</Text>
                      <Text style={styles.tokenId} numberOfLines={1}>
                        {token.tokenId}
                      </Text>
                    </View>
                    <View style={styles.statusBadge}>
                      <Text style={styles.statusBadgeText}>✓ Valid</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => deleteToken(token.tokenId)}
                    >
                      <Text style={styles.deleteButtonText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Invalid Tokens Section */}
            {invalidTokens.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, styles.invalidTitle]}>
                  Invalid Tokens ({invalidTokens.length})
                </Text>
                <Text style={styles.invalidHint}>
                  These token IDs no longer exist on the network
                </Text>
                {invalidTokens.map(token => (
                  <View key={token.tokenId} style={[styles.tokenCard, styles.invalidCard]}>
                    <View style={styles.tokenInfo}>
                      <Text style={styles.tokenName}>Unknown Token</Text>
                      <Text style={styles.tokenSymbol}>--</Text>
                      <Text style={styles.tokenId} numberOfLines={1}>
                        {token.tokenId}
                      </Text>
                      <Text style={styles.errorMessage}>{token.error}</Text>
                    </View>
                    <View style={[styles.statusBadge, styles.invalidBadge]}>
                      <Text style={styles.invalidBadgeText}>✗ Invalid</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.deleteButton, styles.deleteButtonInvalid]}
                      onPress={() => deleteToken(token.tokenId)}
                    >
                      <Text style={styles.deleteButtonText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                {/* Delete All Invalid Button */}
                <TouchableOpacity
                  style={styles.deleteAllButton}
                  onPress={deleteAllInvalid}
                >
                  <Text style={styles.deleteAllButtonText}>
                    Delete All Invalid Tokens
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Footer Actions */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={loadTokens}
        >
          <Text style={styles.refreshButtonText}>Refresh</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.closeButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg_dark,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text_primary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.text_secondary,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 16,
    color: colors.text_secondary,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text_primary,
    marginBottom: 12,
  },
  invalidTitle: {
    color: '#ff6b6b',
  },
  invalidHint: {
    fontSize: 12,
    color: colors.text_secondary,
    marginBottom: 12,
    fontStyle: 'italic',
  },
  tokenCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg_lighter,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  invalidCard: {
    borderLeftColor: '#ff6b6b',
    opacity: 0.7,
  },
  tokenInfo: {
    flex: 1,
    marginRight: 8,
  },
  tokenName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text_primary,
  },
  tokenSymbol: {
    fontSize: 12,
    color: colors.text_secondary,
    marginBottom: 4,
  },
  tokenId: {
    fontSize: 10,
    color: colors.text_secondary,
    fontFamily: 'Courier New',
    marginBottom: 4,
  },
  errorMessage: {
    fontSize: 10,
    color: '#ff6b6b',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    marginRight: 8,
  },
  invalidBadge: {
    backgroundColor: 'rgba(255, 107, 107, 0.2)',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4caf50',
  },
  invalidBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#ff6b6b',
  },
  deleteButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.bg_dark,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  deleteButtonInvalid: {
    borderColor: '#ff6b6b',
  },
  deleteButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },
  deleteAllButton: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
    borderWidth: 1,
    borderColor: '#ff6b6b',
  },
  deleteAllButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ff6b6b',
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.bg_lighter,
    borderTopWidth: 1,
    borderTopColor: colors.bg_lighter,
  },
  refreshButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: colors.bg_dark,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  refreshButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
    textAlign: 'center',
  },
  closeButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.bg_dark,
    textAlign: 'center',
  },
});

export default TokenManagementScreen;
