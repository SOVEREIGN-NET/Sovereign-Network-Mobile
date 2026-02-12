import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, TouchableOpacity, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import {
  Card,
  Text,
  Button,
  Column,
  Row,
  ScreenLayout,
  FormField,
  LoadingView,
  Select,
} from '../components';
import { useAuth, useWalletList } from '../hooks';
import { useTranslation } from '../i18n';
import { colors, spacing, typography, borderRadius } from '../theme';
import tokenService from '../services/TokenService';
import { TokenTransferRequest, SovTransferRequest } from '../types/token';
import { humanToAtomic } from '../utils/tokenUnits';

// Storage keys
const CREATED_TOKENS_KEY = 'sov:created_tokens';

interface SendableToken {
  id: string; // token_id for custom, or 'SOV' for native
  symbol: string;
  name: string;
  balance: number;
  type: 'sov' | 'custom'; // sov = native token, custom = custom token
  token_id?: string; // Only for custom tokens
  decimals?: number;
}

interface TransferFormState {
  recipient: string;
  amount: string;
  memo: string;
}

interface TransferFormErrors {
  recipient?: string;
  amount?: string;
}

const SendTokensScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { currentIdentity } = useAuth();
  const { wallets, refresh: refreshWallets } = useWalletList();

  // Token list and balance state
  const [allTokens, setAllTokens] = useState<SendableToken[]>([]);
  const [selectedToken, setSelectedToken] = useState<SendableToken | null>(null);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [tokensError, setTokensError] = useState<string | null>(null);

  // Transfer form state
  const [transferForm, setTransferForm] = useState<TransferFormState>({
    recipient: '',
    amount: '',
    memo: '',
  });
  const [errors, setErrors] = useState<TransferFormErrors>({});
  const [isTransferring, setIsTransferring] = useState(false);
  const [selectedFromWallet, setSelectedFromWallet] = useState<string | null>(null);
  const [transferStatus, setTransferStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({
    type: null,
    message: '',
  });
  // No hardcoded SOV token ID — resolved dynamically from /api/v1/token/balances

  const isHex = (value: string) => /^[0-9a-fA-F]+$/.test(value);
  const normalizeRecipient = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.startsWith('did:zhtp:')) {
      return trimmed.substring('did:zhtp:'.length);
    }
    return trimmed;
  };

  const isValidRecipient = (value: string) => {
    const hex = normalizeRecipient(value);
    if (!isHex(hex)) return false;
    return hex.length === 64 || hex.length === 5184;
  };

  // Re-fetch wallet balances from server whenever screen gains focus
  useFocusEffect(
    useCallback(() => {
      refreshWallets();
    }, [refreshWallets])
  );

  // Re-load token list whenever wallet data changes (including after refresh)
  useEffect(() => {
    if (currentIdentity?.did) {
      loadAllTokens();
    }
  }, [currentIdentity?.did, wallets]);

  // Load both SOV wallets and custom tokens
  const loadAllTokens = async () => {
    if (!currentIdentity?.did) {
      return;
    }

    setTokensLoading(true);
    setTokensError(null);

    try {
      const tokens: SendableToken[] = [];
      const tokenMap = new Map<string, SendableToken>(); // To deduplicate

      // 1. Add SOV from wallets (sum all wallet balances)
      if (wallets && wallets.length > 0) {
        const totalSovBalance = wallets.reduce((sum, wallet) => sum + (wallet.total_balance || 0), 0);
        if (totalSovBalance > 0) {
          tokens.push({
            id: 'SOV',
            symbol: 'SOV',
            name: 'Sovereign',
            balance: totalSovBalance,
            type: 'sov',
            decimals: 8,
          });
        }
      }

      // 2. Load all token balances (includes SOV + custom tokens)
      const hexAddress = currentIdentity.did.startsWith('did:zhtp:')
        ? currentIdentity.did.substring('did:zhtp:'.length)
        : currentIdentity.did;

      console.log('[SendTokensScreen] Loading token balances for:', hexAddress);
      try {
        const allBalances = await tokenService.getUserTokenBalances(hexAddress);
        if (allBalances && allBalances.length > 0) {
          // Find the SOV wallet entry we added above (if any)
          const sovEntry = tokens.find(t => t.type === 'sov');

          allBalances.forEach((token: any) => {
            const rawBalance = token.balance || 0;
            const decimals = token.decimals || 8;
            const humanReadableBalance = rawBalance / Math.pow(10, decimals);
            const symbol = String(token.symbol || '').toUpperCase();

            // If this is SOV, merge token_id into the existing wallet entry
            if (symbol === 'SOV' && sovEntry) {
              sovEntry.token_id = token.token_id;
              sovEntry.decimals = decimals;
              // Use the higher balance (wallet endpoint may report different units)
              console.log('[SendTokensScreen] SOV token_id resolved from balances:', token.token_id);
              tokenMap.set(token.token_id, sovEntry);
              return;
            }

            // Otherwise add as custom token
            const sendableToken: SendableToken = {
              id: token.token_id,
              symbol: token.symbol || 'Token',
              name: token.name || 'Unknown',
              balance: humanReadableBalance,
              type: 'custom',
              token_id: token.token_id,
              decimals,
            };
            tokenMap.set(token.token_id, sendableToken);
            tokens.push(sendableToken);
          });

          // If we didn't have a wallet entry but got SOV from balances, add it
          if (!sovEntry) {
            const sovFromBalances = allBalances.find((t: any) =>
              String(t.symbol || '').toUpperCase() === 'SOV'
            );
            if (sovFromBalances) {
              const decimals = sovFromBalances.decimals || 8;
              const balance = (sovFromBalances.balance || 0) / Math.pow(10, decimals);
              tokens.unshift({
                id: 'SOV',
                symbol: 'SOV',
                name: sovFromBalances.name || 'Sovereign',
                balance,
                type: 'sov',
                token_id: sovFromBalances.token_id,
                decimals,
              });
            }
          }
        }
      } catch (customError) {
        console.warn('[SendTokensScreen] Failed to load token balances (non-fatal):', customError);
      }

      // 3. Load created tokens (even with 0 balance) - creator should see their tokens
      try {
        const createdTokensJson = await AsyncStorage.getItem(CREATED_TOKENS_KEY);
        if (createdTokensJson) {
          const createdTokenIds: string[] = JSON.parse(createdTokensJson);

          // Fetch token info for each created token
          for (const tokenId of createdTokenIds) {
            if (!tokenMap.has(tokenId)) {
              // Token not in balance list, try to get info and add with 0 balance
              try {
                const tokenInfo = await tokenService.getTokenInfo(tokenId);
                const sendableToken: SendableToken = {
                  id: tokenId,
                  symbol: tokenInfo.symbol || 'Token',
                  name: tokenInfo.name || 'Unknown',
                  balance: 0, // Creator's token with no balance
                  type: 'custom',
                  token_id: tokenId,
                  decimals: tokenInfo.decimals ?? 0,
                };
                tokenMap.set(tokenId, sendableToken);
                tokens.push(sendableToken);
              } catch (infoError) {
                console.warn('[SendTokensScreen] Failed to get info for created token:', tokenId);
              }
            }
          }
        }
      } catch (storageError) {
        console.warn('[SendTokensScreen] Failed to load created tokens from storage:', storageError);
      }

      setAllTokens(tokens);

      if (tokens.length > 0) {
        // Default to SOV if available, otherwise first token
        const sovToken = tokens.find(t => t.type === 'sov');
        setSelectedToken(sovToken || tokens[0]);
      }

      // Default from-wallet for SOV transfers
      if (wallets && wallets.length > 0 && !selectedFromWallet) {
        setSelectedFromWallet(wallets[0].id);
      }

    } catch (error: any) {
      console.error('[SendTokensScreen] Failed to load tokens:', error);
      setTokensError(error.message || 'Failed to load tokens');
    } finally {
      setTokensLoading(false);
    }
  };

  // Validate recipient based on token type
  const isValidSovRecipient = (value: string) => {
    const trimmed = value.trim();
    return trimmed.length === 64 && isHex(trimmed);
  };

  // Validate transfer form
  const validateTransfer = (): boolean => {
    const newErrors: TransferFormErrors = {};

    if (!transferForm.recipient.trim()) {
      newErrors.recipient = 'Recipient is required';
    } else if (selectedToken?.type === 'sov') {
      if (!isValidSovRecipient(transferForm.recipient)) {
        newErrors.recipient = 'Recipient wallet ID must be 64 hex characters';
      }
    } else if (!isValidRecipient(transferForm.recipient)) {
      newErrors.recipient = 'Recipient must be DID (did:zhtp:...) or hex key id/pubkey';
    }

    if (!transferForm.amount.trim()) {
      newErrors.amount = 'Amount is required';
    } else {
      const amount = Number.parseFloat(transferForm.amount);
      if (Number.isNaN(amount) || amount <= 0) {
        newErrors.amount = 'Amount must be greater than 0';
      } else if (selectedToken?.type === 'sov' && selectedFromWallet) {
        // SOV: validate against per-wallet balance
        const sourceWallet = wallets?.find(w => w.id === selectedFromWallet);
        if (sourceWallet && amount > sourceWallet.available_balance) {
          newErrors.amount = `Insufficient balance (${sourceWallet.available_balance.toFixed(2)})`;
        }
      } else if (selectedToken && amount > selectedToken.balance) {
        newErrors.amount = `Insufficient balance (${selectedToken.balance})`;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle transfer
  const handleTransfer = async () => {
    if (!selectedToken || !validateTransfer()) {
      return;
    }

    setIsTransferring(true);
    setTransferStatus({ type: null, message: '' });

    try {
      console.log('[SendTokensScreen] Transferring:', selectedToken.symbol);

      const decimals = selectedToken.decimals ?? 8;
      const baseUnits = humanToAtomic(transferForm.amount, decimals);
      if (!baseUnits) {
        throw new Error(`Amount must have at most ${decimals} decimals`);
      }

      if (selectedToken.type === 'sov') {
        // SOV: wallet-to-wallet transfer
        if (!selectedFromWallet) {
          throw new Error('Please select a source wallet');
        }

        const sovRequest: SovTransferRequest = {
          from_wallet_id: selectedFromWallet,
          to_wallet_id: transferForm.recipient.trim(),
          amount: baseUnits,
        };

        await tokenService.transferSov(sovRequest);
      } else {
        // Custom token: existing token transfer
        const tokenId = selectedToken.token_id;
        if (!tokenId) {
          throw new Error('Token ID missing for selected token.');
        }

        const transferRequest: TokenTransferRequest = {
          token_id: tokenId,
          to: transferForm.recipient.trim(),
          amount: baseUnits,
        };

        await tokenService.transferToken(transferRequest);
      }

      setTransferStatus({
        type: 'success',
        message: `Transfer successful!`,
      });

      // Reset form
      setTimeout(() => {
        setTransferForm({
          recipient: '',
          amount: '',
          memo: '',
        });
        setTransferStatus({ type: null, message: '' });
        refreshWallets(); // Re-fetch wallet balances from server

        Alert.alert('Success', 'Transfer completed');
      }, 1500);
    } catch (error: any) {
      console.error('[SendTokensScreen] Transfer failed:', error);
      setTransferStatus({
        type: 'error',
        message: error.message || 'Failed to transfer token',
      });
    } finally {
      setIsTransferring(false);
    }
  };

  if (!currentIdentity) {
    return <LoadingView />;
  }

  if (tokensLoading) {
    return <LoadingView />;
  }

  return (
    <ScreenLayout paddingTop={spacing.md} paddingBottom={spacing.xl}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Column gap="lg" style={{ paddingHorizontal: spacing.sm }}>
          {/* Title */}
          <View>
            <Text
              style={{
                fontSize: typography.size.lg,
                fontWeight: typography.weight.semibold,
                color: colors.text_primary,
              }}
            >
              Send Token
            </Text>
            <Text
              style={{
                fontSize: typography.size.sm,
                color: colors.text_secondary,
                marginTop: spacing.xs,
              }}
            >
              Transfer your tokens to another address
            </Text>
          </View>

          {/* Error message */}
          {tokensError && (
            <Card style={{ backgroundColor: colors.error + '20' }}>
              <Text style={{ color: colors.error, fontSize: typography.size.sm }}>
                {tokensError}
              </Text>
              <Button
                variant="primary"
                size="sm"
                onPress={loadAllTokens}
                style={{ marginTop: spacing.md }}
              >
                Retry
              </Button>
            </Card>
          )}

          {/* Transfer status */}
          {transferStatus.message && (
            <Card
              style={{
                backgroundColor:
                  transferStatus.type === 'success' ? colors.success + '20' : colors.error + '20',
              }}
            >
              <Text
                style={{
                  color:
                    transferStatus.type === 'success' ? colors.success : colors.error,
                  fontSize: typography.size.sm,
                }}
              >
                {transferStatus.message}
              </Text>
            </Card>
          )}

          {/* Token Selection */}
          {allTokens.length > 0 ? (
            <View>
              <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
                <Text
                  style={{
                    fontSize: typography.size.xs,
                    fontWeight: typography.weight.semibold,
                    color: colors.text_secondary,
                    paddingHorizontal: spacing.sm,
                  }}
                >
                  SELECT TOKEN
                </Text>
                <TouchableOpacity
                  onPress={() => navigation.navigate('TokenManagement')}
                  style={{
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.xs,
                    borderRadius: borderRadius.sm,
                    backgroundColor: colors.bg_darker,
                    borderWidth: 1,
                    borderColor: colors.primary + '40',
                  }}
                >
                  <Text
                    style={{
                      fontSize: typography.size.xs,
                      fontWeight: typography.weight.semibold,
                      color: colors.primary,
                    }}
                  >
                    Manage
                  </Text>
                </TouchableOpacity>
              </Row>

              <Column gap="xs">
                {allTokens.map((token) => (
                  <TouchableOpacity
                    key={token.id}
                    onPress={() => {
                      setSelectedToken(token);
                      setTransferForm({ recipient: '', amount: '', memo: '' });
                      setErrors({});
                      if (token.type === 'sov' && wallets?.length > 0) {
                        setSelectedFromWallet(wallets[0].id);
                      }
                    }}
                    style={{
                      paddingVertical: spacing.md,
                      paddingHorizontal: spacing.md,
                      borderRadius: borderRadius.lg,
                      backgroundColor:
                        selectedToken?.id === token.id
                          ? colors.primary + '20'
                          : colors.bg_darker,
                      borderWidth: 1.5,
                      borderColor:
                        selectedToken?.id === token.id
                          ? colors.primary
                          : colors.border,
                    }}
                  >
                    <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                      <Column gap="xs" style={{ flex: 1 }}>
                        <Row style={{ alignItems: 'center', gap: spacing.xs }}>
                          <Text
                            style={{
                              fontSize: typography.size.sm,
                              fontWeight: typography.weight.semibold,
                              color: colors.text_primary,
                            }}
                          >
                            {token.symbol}
                          </Text>
                          {token.balance === 0 && token.type === 'custom' && (
                            <Text
                              style={{
                                fontSize: typography.size.xs,
                                color: colors.primary,
                                fontWeight: typography.weight.semibold,
                              }}
                            >
                              (Created)
                            </Text>
                          )}
                        </Row>
                        <Text
                          style={{
                            fontSize: typography.size.xs,
                            color: colors.text_secondary,
                          }}
                        >
                          {token.name}
                        </Text>
                      </Column>
                      <Column gap="xs" style={{ alignItems: 'flex-end' }}>
                        <Text
                          style={{
                            fontSize: typography.size.sm,
                            fontWeight: typography.weight.semibold,
                            color: colors.text_primary,
                          }}
                        >
                          {token.balance.toFixed(2)}
                        </Text>
                        <Text
                          style={{
                            fontSize: typography.size.xs,
                            color: colors.text_secondary,
                          }}
                        >
                          {token.balance === 0 && token.type === 'custom' ? 'No balance' : 'Available'}
                        </Text>
                      </Column>
                    </Row>
                  </TouchableOpacity>
                ))}
              </Column>
            </View>
          ) : (
            <Card style={{ backgroundColor: colors.warning + '20' }}>
              <Text style={{ color: colors.warning, fontSize: typography.size.sm }}>
                No tokens found. Create or receive tokens to get started.
              </Text>
            </Card>
          )}

          {/* Transfer Form */}
          {selectedToken && (
            <Card>
              <View style={{ marginBottom: spacing.lg }}>
                <Text
                  style={{
                    fontSize: typography.size.sm,
                    fontWeight: typography.weight.semibold,
                    color: colors.text_primary,
                    marginBottom: spacing.xs,
                  }}
                >
                  Balance
                </Text>
                <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: typography.size.lg, color: colors.text_secondary }}>
                    {selectedToken.name} ({selectedToken.symbol})
                  </Text>
                  <Text
                    style={{
                      fontSize: typography.size.lg,
                      fontWeight: typography.weight.bold,
                      color: colors.primary,
                    }}
                  >
                    {selectedToken.balance.toFixed(2)}
                  </Text>
                </Row>
              </View>

              {/* Sender Reference */}
              <View
                style={{
                  marginBottom: spacing.lg,
                  padding: spacing.md,
                  backgroundColor: colors.bg_darker,
                  borderRadius: borderRadius.base,
                  borderLeftWidth: 3,
                  borderLeftColor: colors.primary,
                }}
              >
                <Text
                  style={{
                    fontSize: typography.size.xs,
                    color: colors.text_secondary,
                    marginBottom: spacing.sm,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    fontWeight: typography.weight.semibold,
                  }}
                >
                  {selectedToken.type === 'sov' ? 'Sending From' : 'Your DID'}
                </Text>
                {selectedToken.type === 'sov' && wallets && wallets.length > 0 ? (
                  <Select
                    label="Select Source Wallet"
                    options={wallets.map(w => ({
                      id: w.id,
                      label: `${w.wallet_type} (${w.available_balance.toFixed(2)} SOV)`,
                      description: w.id.substring(0, 16) + '...',
                    }))}
                    selectedId={selectedFromWallet || ''}
                    onSelect={(id) => setSelectedFromWallet(String(id))}
                    disabled={isTransferring}
                  />
                ) : (
                  <Text
                    style={{
                      fontSize: typography.size.xs,
                      color: colors.text_primary,
                      fontFamily: 'Courier',
                    }}
                    numberOfLines={1}
                  >
                    {currentIdentity.did}
                  </Text>
                )}
              </View>

              {/* Recipient Input - Changes based on token type */}
              <FormField
                label={selectedToken.type === 'sov' ? 'Recipient Wallet ID' : 'Recipient DID or Key ID'}
                placeholder={selectedToken.type === 'sov' ? '64 hex characters' : 'did:zhtp:... or 64/5184 hex'}
                value={transferForm.recipient}
                onChangeText={(text) => {
                  setTransferForm((prev) => ({ ...prev, recipient: text }));
                  if (errors.recipient) {
                    setErrors((prev) => ({ ...prev, recipient: undefined }));
                  }
                }}
                error={errors.recipient}
                editable={!isTransferring}
              />

              {/* Amount */}
              <FormField
                label="Amount"
                placeholder="0"
                value={transferForm.amount}
                onChangeText={(text) => {
                  setTransferForm((prev) => ({ ...prev, amount: text }));
                  if (errors.amount) {
                    setErrors((prev) => ({ ...prev, amount: undefined }));
                  }
                }}
                keyboardType="decimal-pad"
                error={errors.amount}
                editable={!isTransferring}
              />

              {/* Memo (Optional) */}
              <FormField
                label="Memo (Optional)"
                placeholder="Add a note to this transfer"
                value={transferForm.memo}
                onChangeText={(text) => {
                  setTransferForm((prev) => ({ ...prev, memo: text }));
                }}
                multiline
                numberOfLines={2}
                editable={!isTransferring}
              />

              {/* Action Buttons */}
              <Row gap="md" style={{ marginTop: spacing.lg }}>
                <Button
                  variant="primary"
                  onPress={handleTransfer}
                  loading={isTransferring}
                  disabled={isTransferring}
                  style={{ flex: 1 }}
                >
                  Send {selectedToken.symbol}
                </Button>
                <Button
                  variant="secondary"
                  onPress={() => navigation.goBack()}
                  disabled={isTransferring}
                  style={{ flex: 1 }}
                >
                  Cancel
                </Button>
              </Row>
            </Card>
          )}
        </Column>
      </ScrollView>
    </ScreenLayout>
  );
};

export default SendTokensScreen;
